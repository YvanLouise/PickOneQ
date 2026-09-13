import express from 'express';
import { z } from 'zod';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { domains, sourcesForTopic, topicCoverage } from './catalog.js';
import { seeds, sources } from './seeds.js';
import { selectNext, scheduleReview, text, questionSchema, validateQuestion, validateFeedback, normalize, recordHistory, validateState } from './core.js';
import { complete, feedbackPrompt, generatePrompt, verifyPrompt } from './model.js';
import { registerDialogue } from './dialogue.js';

export function createApp({ store, credentials, modelCall = complete, port = 4311, generationTarget = 6, now = Date.now }) {
  const app = express();
  const csrf = randomBytes(32).toString('hex');
  const generation = { busy: false, phase: 'idle', trigger: '', error: '', lastRun: 0, lastSuccessAt: 0, nextRetryAt: 0, accepted: 0, attempted: 0, consecutiveFailures: 0, target: generationTarget };
  const sourceSnapshotSchema = z.object({ id: z.string(), domain: z.string(), title: z.string(), publisher: z.string(), url: z.string().url().refine(url => url.startsWith('https://')), excerpt: z.string().min(25), retrievedAt: z.string(), hash: z.string(), verified: z.literal(true) });
  const generatedQuestionSchema = questionSchema.extend({
    id: z.string(), category: z.string(), version: z.number().int().positive(), origin: z.literal('generated'), model: z.string(), createdAt: z.string(),
    relatedId: z.string().optional(), sourceSnapshots: z.array(sourceSnapshotSchema).min(1), sourceVersions: z.record(z.string()),
    verification: z.object({ approved: z.literal(true), checks: z.object({ premise: z.literal(true), answer: z.literal(true), reasoning: z.literal(true), example: z.literal(true), citations: z.literal(true), novelty: z.literal(true) }).passthrough(), reason: z.string(), at: z.number(), version: z.number() }).passthrough(),
  }).passthrough();
  const validateStoredQuestion = (candidate, existing) => {
    const parsed = generatedQuestionSchema.parse(candidate);
    if (parsed.contentDesignVersion === 2 && ['noSpoiler','conditions','choices','task'].some(k => parsed.verification.checks[k] !== true)) throw new Error('情境核验记录不完整');
    if (parsed.sourceSnapshots.some(source => createHash('sha256').update(source.excerpt).digest('hex') !== source.hash)) throw new Error('资料快照校验失败');
    if (parsed.sourceSnapshots.some(source => { const trusted = sources.find(item => item.id === source.id); return !trusted || trusted.hash !== source.hash || trusted.url !== source.url; })) throw new Error('资料快照不在当前可信资料池中');
    if (parsed.sourceSnapshots.some(source => parsed.sourceVersions[source.id] !== source.hash)) throw new Error('题目记录的资料版本不匹配');
    validateQuestion(parsed, parsed.sourceSnapshots, existing);
    return parsed;
  };
  try {
    const accepted = [];
    for (const candidate of store.generated) accepted.push(validateStoredQuestion(candidate, [...seeds, ...accepted]));
    validateState(store.state, [...seeds, ...accepted].map(q => q.id));
  } catch {
    if (store.recover) store.recover('检测到无法安全读取的本地题库或学习记录，原文件已保留，应用已使用空白状态启动。');
  }
  const all = () => [...seeds, ...store.generated];
  const allSources = () => [...new Map([...sources, ...store.generated.flatMap(q => q.sourceSnapshots || [])].map(source => [source.id, source])).values()];
  let generationEpoch = 0;
  let answerBusy = false;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return res.status(403).json({ error: '仅允许本机访问' });
    const origin = req.headers.origin;
    if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)) return res.status(403).json({ error: '请求来源不受支持' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store');
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: '跨站请求已阻止' });
      if (req.method !== 'GET' && req.headers['x-pickoneq-token'] !== csrf) return res.status(403).json({ error: '会话已更新，请刷新页面' });
    }
    next();
  });
  app.use(express.json({ limit: '32mb' }));
  const snapshot = () => {
    const ready = store.generated.filter(q => q.contentDesignVersion === 2 && !store.state.history.some(h => h.questionId === q.id) && !store.state.reports.some(r => r.questionId === q.id)).length;
    return { state: store.state, questions: all(), sources: allSources(), domains, topicCoverage, credential: credentials.status(), generation: { ...generation, ready, needed: Math.max(0, generation.target - ready), autoEnabled: credentials.status().configured && store.state.onboarding }, storageNotice: store.notice || '', csrf };
  };
  const readyCount = () => snapshot().generation.ready;
  const conversationBusy = () => Object.values(store.state.conversations || {}).some(session => session.turns.some(turn => ['generating', 'verifying'].includes(turn.status)));
  const shouldPrepare = () => store.state.onboarding && credentials.get() && readyCount() < generation.target;
  const requestSupply = trigger => {
    if (!shouldPrepare() || generation.busy || answerBusy || conversationBusy() || now() < generation.nextRetryAt) return false;
    void generate(trigger);
    return true;
  };
  const getQuestion = id => { const q = all().find(q => q.id === id); if (!q) throw new Error('问题不存在'); return q; };
  const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
  const ok = res => res.json(snapshot());
  const event = (s, type, questionId) => { s.events ??= []; s.events.push({ type, questionId, at: Date.now() }); s.events = s.events.slice(-5000); };
  app.post('/api/event', route((req, res) => { const { type, questionId } = z.object({ type: z.enum(['helpful','not-helpful']), questionId: z.string() }).parse(req.body); getQuestion(questionId); store.mutate(s => event(s, type, questionId)); ok(res); }));
  registerDialogue({ app, route, store, credentials, modelCall, getQuestion, sources, ok, epoch: () => generationEpoch });
  const choiceFor = (q, id) => { const c = id ? q.choices?.find(c => c.id === id) : undefined; if (id && !c) throw new Error('选项不属于当前题目'); return c; };
  app.get('/api/bootstrap', (req, res) => { requestSupply('库存不足'); ok(res); });
  app.post('/api/notice', (req, res) => { store.clearNotice?.(); ok(res); });
  app.post('/api/export', (req, res) => res.json({ format: 'pickoneq-v2', exportedAt: new Date().toISOString(), state: store.state, generatedQuestions: store.generated }));
  app.post('/api/import', route((req, res) => {
    if (req.body.confirm !== '恢复备份') throw new Error('请输入“恢复备份”确认');
    const backup = z.object({ format: z.enum(['pickoneq-v1', 'pickoneq-v2']), state: z.unknown(), questions: z.array(z.unknown()).optional(), generatedQuestions: z.array(z.unknown()).optional() }).parse(req.body.backup);
    const candidates = backup.format === 'pickoneq-v2' ? backup.generatedQuestions : backup.questions?.filter(q => q && q.origin === 'generated');
    if (!candidates) throw new Error('备份中缺少生成题库');
    const restored = [];
    for (const candidate of candidates) restored.push(validateStoredQuestion(candidate, [...seeds, ...restored]));
    const state = validateState(backup.state, [...seeds, ...restored].map(q => q.id));
    for (const conversation of Object.values(state.conversations)) for (const turn of conversation.turns) if (['generating','verifying'].includes(turn.status)) { turn.status = 'failed'; turn.error = '恢复的请求未完成，请重试。'; }
    generationEpoch++; store.replace(state, restored); ok(res);
  }));
  app.post('/api/onboarding', (req, res) => { store.mutate(s => { s.onboarding = true; }); requestSupply('首次设置完成'); ok(res); });
  app.post('/api/preferences', route((req, res) => {
    const p = z.object({ weights: z.record(z.number().int().min(0).max(3)), exploration: z.number().min(0).max(0.5) }).parse(req.body);
    if (Object.keys(p.weights).some(id => !domains.some(d => d.id === id))) throw new Error('未知领域');
    store.mutate(s => { Object.assign(s.preferences, p); }); ok(res);
  }));
  app.post('/api/topic', route((req, res) => {
    const topic = text.min(2).max(60).parse(req.body.topic);
    const needle = normalize(topic);
    const sourceIds = sourcesForTopic(topic);
    const exactDomains = domains.filter(d => normalize(d.name) === needle || d.keywords.some(k => normalize(k) === needle));
    const match = domains.filter(d => exactDomains.includes(d) || sources.some(source => source.domain === d.id && sourceIds.includes(source.id)));
    if (!match.length) return res.json({ covered: false, message: '暂未覆盖这个主题。试试地图、细胞、贸易、机会成本、记忆或 DNS。' });
    if (!store.state.preferences.topics.includes(topic) && store.state.preferences.topics.length >= 50) throw new Error('最多关注 50 个主题，请先移除一些主题。');
    store.mutate(s => {
      if (!s.preferences.topics.includes(topic)) s.preferences.topics.push(topic);
      for (const d of match) s.preferences.weights[d.id] = Math.max(1, s.preferences.weights[d.id] || 0);
    });
    res.json({ ...snapshot(), covered: true, message: `已加入 ${match.map(d => d.name).join('、')}。仅围绕现有资料涉及的内容出题。` });
  }));
  app.delete('/api/topic', route((req, res) => {
    const topic = text.max(60).parse(req.body.topic);
    store.mutate(s => { s.preferences.topics = s.preferences.topics.filter(value => value !== topic); }); ok(res);
  }));
  app.post('/api/credentials', route(async (req, res) => {
    const { key, remember, model } = z.object({ key: z.string().trim().min(8).max(256), remember: z.boolean(), model: z.enum(['deepseek-flash', 'deepseek-v4-pro']) }).parse(req.body);
    const result = await modelCall({ key, model, system: '连接测试，返回 JSON {"ok":true}', input: { test: true } });
    if (result.ok !== true) throw new Error('模型连接测试未返回预期结果，Key 尚未保存。');
    credentials.set(key, remember); generationEpoch++; store.mutate(s => { s.model = model; }); requestSupply('模型已连接'); ok(res);
  }));
  app.delete('/api/credentials', route((req, res) => { generationEpoch++; credentials.remove(); ok(res); }));
  app.post('/api/draft', route((req, res) => {
    const draft = z.object({ id: z.string(), answer: z.string().max(8000), choiceId: z.string().nullable().optional(), confidence: z.enum(['guess', 'some', 'sure']).nullable(), mode: z.enum(['answer', 'restate']).default('answer') }).parse(req.body);
    choiceFor(getQuestion(draft.id), draft.choiceId);
    store.mutate(s => { s.drafts[`${draft.id}:${draft.mode}`] = { answer: draft.answer, choiceId: draft.choiceId, confidence: draft.confidence, at: Date.now() }; }); ok(res);
  }));
  app.post('/api/stage', route((req, res) => {
    const stage = z.enum(['question', 'answer', 'learn']).parse(req.body.stage);
    store.mutate(s => { event(s, stage === 'answer' ? 'answer-enter' : stage === 'learn' ? 'learn-enter' : 'exposure', s.currentId); s.stage = stage; }); ok(res);
  }));
  app.post('/api/next', route((req, res) => {
    const relatedTo = req.body.relatedTo ? text.parse(req.body.relatedTo) : undefined;
    const selected = selectNext(store.state, all(), { relatedTo });
    if (!selected) {
      requestSupply('题流不足');
      return res.status(409).json({ error: relatedTo ? '暂时没有新的关联问题，可以返回混合探索。' : credentials.get() ? '现有合格问题已看完，AI 正在后台准备并核验新问题；你的历史记录仍可阅读。' : '已看完当前合格题目。可在“我的”配置模型自动准备新问题；历史中的问题仍可阅读。' });
    }
    store.mutate(s => {
      s.currentId = selected.question.id; s.currentKind = selected.kind; s.stage = 'question';
      if (selected.kind === 'review') s.newSinceReview = 0; else s.newSinceReview++;
      recordHistory(s, { questionId: selected.question.id, kind: selected.kind, at: Date.now() });
      event(s, selected.kind === 'related' ? 'transfer-enter' : 'exposure', selected.question.id);
    }); requestSupply('取用问题后补充'); ok(res);
  }));
  app.post('/api/open', route((req, res) => {
    const q = getQuestion(req.body.id);
    store.mutate(s => { s.currentId = q.id; s.currentKind = 'history'; s.stage = 'question'; recordHistory(s, { questionId: q.id, at: Date.now(), kind: 'history' }); }); ok(res);
  }));
  app.post('/api/save', route((req, res) => {
    const { id, kind, value } = z.object({ id: z.string(), kind: z.enum(['later', 'favorite']), value: z.boolean() }).parse(req.body);
    getQuestion(id); store.mutate(s => { s.saves[id] ??= {}; s.saves[id][kind] = value; }); ok(res);
  }));
  app.post('/api/review', route((req, res) => {
    const { id, action } = z.object({ id: z.string(), action: z.enum(['cancel', 'later', 'difficult']) }).parse(req.body);
    getQuestion(id); store.mutate(s => scheduleReview(s, id, action)); ok(res);
  }));
  app.post('/api/learn', route((req, res) => {
    const { id, feeling } = z.object({ id: z.string(), feeling: z.enum(['understood', 'unclear', 'later']) }).parse(req.body);
    getQuestion(id); store.mutate(s => {
      s.learned[id] = { at: Date.now(), feeling };
      if (feeling !== 'understood') scheduleReview(s, id, feeling === 'unclear' ? 'difficult' : 'later');
      else if (s.currentId === id && s.currentKind === 'review') {
        const openedAt = [...s.history].reverse().find(item => item.questionId === id && item.kind === 'review')?.at || 0;
        const answeredThisReview = [...s.attempts].reverse().find(attempt => attempt.questionId === id && attempt.at >= openedAt);
        if (!answeredThisReview) scheduleReview(s, id, 'later');
      }
      if (s.saves[id]) s.saves[id].later = false;
    }); ok(res);
  }));
  app.post('/api/report', route((req, res) => {
    const { id, reason } = z.object({ id: z.string(), reason: z.enum(['事实有误', '题意不清', '评价不合理']) }).parse(req.body);
    const question = getQuestion(id);
    store.mutate(s => { s.reports.push({ id: randomUUID(), questionId: id, questionVersion: question.version, reason, at: Date.now() }); }); requestSupply('问题暂停后补充'); ok(res);
  }));
  app.post('/api/answer', route(async (req, res) => {
    if (answerBusy) return res.status(409).json({ error: '上一份回答仍在处理，请稍候。' });
    const data = z.object({ id: z.string(), answer: z.string().trim().max(8000), choiceId: z.string().nullable().optional(), confidence: z.enum(['guess', 'some', 'sure']).nullable(), mode: z.enum(['answer', 'restate']), requestId: z.string().uuid() }).refine(d => d.answer.length || (d.mode === 'answer' && d.choiceId)).parse(req.body);
    if (store.state.attempts.some(a => a.requestId === data.requestId)) return ok(res);
    const q = getQuestion(data.id), key = credentials.get();
    const choice = choiceFor(q, data.choiceId);
    store.mutate(s => { s.drafts[`${data.id}:${data.mode}`] = { answer: data.answer, choiceId: data.choiceId, confidence: data.confidence, at: Date.now() }; });
    if (!key) return res.status(412).json({ error: '精选示例模式不进行 AI 评价。你的回答已保存，可直接阅读解释，或配置 Key 后重试。' });
    answerBusy = true;
    const epoch = generationEpoch;
    const model = store.state.model;
    try {
      const relevant = q.sourceSnapshots || sources.filter(s => q.citations.some(c => c.sourceId === s.id));
      const raw = await modelCall({ key, model, system: feedbackPrompt, input: { question: q, answer: data.answer, choice: choice?.label, sources: relevant } });
      const feedback = validateFeedback(raw, [choice?.label, data.answer].filter(Boolean).join('\n'), relevant);
      if (!data.answer.trim() && feedback.verdict === 'supported') feedback.verdict = 'partial';
      if (generationEpoch !== epoch) throw new Error('配置已变更，本次结果未保存，请重试。');
      store.mutate(s => {
        event(s, 'answer-submit', data.id);
        s.attempts.push({ ...data, choiceLabel: choice?.label, questionId: data.id, questionVersion: q.version, model, feedbackVersion: 3, feedback, at: Date.now(), id: randomUUID() });
        if (s.currentId === data.id) s.stage = 'learn';
        if (data.answer.trim() && feedback.verdict === 'misconception') scheduleReview(s, data.id, 'difficult');
        else if (data.answer.trim() && s.reviews[data.id]) scheduleReview(s, data.id, feedback.verdict === 'supported' ? 'pass' : 'difficult');
      }); ok(res);
    } finally { answerBusy = false; }
  }));

  async function generate(trigger = '手动准备') {
    const key = credentials.get();
    if (generation.busy) return;
    if (!key) throw new Error('请先配置 DeepSeek API Key');
    generation.busy = true; generation.phase = 'generating'; generation.trigger = trigger; generation.error = ''; generation.lastRun = now(); generation.attempted++;
    const epoch = generationEpoch;
    const model = store.state.model;
    try {
      const weights = store.state.preferences.weights;
      const interested = domains.filter(d => weights[d.id] > 0);
      const unfamiliar = domains.filter(d => !weights[d.id]);
      const topicSourceIds = store.state.preferences.topics.flatMap(sourcesForTopic);
      const topicSources = sources.filter(source => topicSourceIds.includes(source.id) && source.verified);
      const useTopic = topicSources.length > 0 && generation.attempted % 2 === 1;
      const pool = interested.length ? (Math.random() < store.state.preferences.exploration && unfamiliar.length ? unfamiliar : interested) : domains;
      let ticket = Math.random() * pool.reduce((sum, d) => sum + (weights[d.id] || 1), 0);
      const weightedDomain = pool.find(d => { ticket -= weights[d.id] || 1; return ticket <= 0; }) || pool[pool.length - 1];
      const domain = useTopic ? topicSources[generation.attempted % topicSources.length].domain : weightedDomain.id;
      const candidates = sources.filter(s => s.domain === domain && s.verified);
      const preferred = topicSources.filter(source => source.domain === domain);
      const offset = (store.generated.filter(q => q.domain === domain).length + generation.attempted - 1) % candidates.length;
      const first = useTopic && preferred.length ? preferred[generation.attempted % preferred.length] : candidates[offset];
      const relevant = [first, candidates.find(source => source.id !== first.id) || first];
      const existingTitles = all().map(q => q.title);
      const recentScenes = all().filter(q => q.contentDesignVersion === 2).slice(-40).map(q => ({ title: q.title, sceneSummary: q.sceneSummary, sceneType: q.sceneType }));
      const raw = await modelCall({ key, model, system: generatePrompt, input: { domain, sources: relevant, existingTitles, recentScenes, topics: store.state.preferences.topics } });
      const question = validateQuestion(raw, relevant, all());
      if (question.contentDesignVersion !== 2) throw new Error('候选题缺少情境版本');
      generation.phase = 'verifying';
      const result = await modelCall({ key, model, system: verifyPrompt, input: { question, sources: relevant, existingTitles, recentScenes } });
      const checks = ['premise', 'answer', 'reasoning', 'example', 'citations', 'novelty', 'noSpoiler', 'conditions', 'choices', 'task'];
      if (result.approved !== true || checks.some(k => result.checks?.[k] !== true)) throw new Error('候选题未通过内容核验，本次未加入题库。');
      const scores = ['clarity','participation','tension','benefit'].map(k => result.scores?.[k]);
      if (scores.some(s => !Number.isInteger(s?.value) || s.value < 3 || s.value > 5 || !s.reason) || scores.reduce((sum,s) => sum+s.value,0) < 15) throw new Error('候选题未通过情境编辑评分');
      if (epoch !== generationEpoch) return;
      validateQuestion(question, relevant, all());
      const linked = all().find(q => q.contentDesignVersion === 2 && q.concepts.some(c => question.concepts.includes(c)) && !store.state.reports.some(r => r.questionId === q.id));
      store.add({ ...question, ...(linked ? { relatedId: linked.id, relatedPrompt: linked.title } : {}), id: randomUUID(), category: question.concepts[0], version: 1, origin: 'generated', model, createdAt: new Date().toISOString(), sourceSnapshots: relevant,
        sourceVersions: Object.fromEntries(relevant.map(s => [s.id, s.hash])), promptVersion: 2, verification: { ...result, at: now(), version: 2 } });
      generation.accepted++; generation.consecutiveFailures = 0; generation.lastSuccessAt = now(); generation.nextRetryAt = now() + 10000;
    } catch (e) {
      generation.error = e instanceof z.ZodError ? '候选题结构不完整，本次未加入题库。' : e.message;
      generation.consecutiveFailures++;
      generation.nextRetryAt = now() + Math.min(30 * 60_000, 30_000 * (2 ** Math.min(6, generation.consecutiveFailures - 1)));
    } finally { generation.busy = false; generation.phase = 'idle'; generation.trigger = ''; }
  }
  app.post('/api/generate', route((req, res) => {
    if (!credentials.get()) throw new Error('请先配置 DeepSeek API Key');
    if (generation.busy) return ok(res);
    if (now() < generation.nextRetryAt) throw new Error(`自动准备正在等待重试，请约 ${Math.max(1, Math.ceil((generation.nextRetryAt - now()) / 60000))} 分钟后再试。`);
    void generate('手动准备'); ok(res);
  }));
  app.delete('/api/data', route((req, res) => {
    if (req.body.confirm !== '清空学习记录') throw new Error('请输入“清空学习记录”确认');
    generationEpoch++; store.reset(); ok(res);
  }));
  app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
  app.use((err, req, res, next) => {
    res.status(err instanceof z.ZodError ? 400 : 422).json({ error: err instanceof z.ZodError ? '输入格式不正确，请检查后重试。' : err.type === 'entity.too.large' ? '输入内容过长。' : err.message || '操作失败，请重试。' });
  });
  const tick = () => {
    requestSupply('库存不足');
  };
  return { app, tick, generation, generate, snapshot, requestSupply };
}
