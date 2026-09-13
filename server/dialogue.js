import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dialoguePrompt, dialogueVerifyPrompt } from './model.js';

export function registerDialogue({ app, route, store, credentials, modelCall, getQuestion, sources, ok, epoch }) {
  const running = new Map();
  const session = id => { const s = store.state.conversations[id]; if (!s) throw new Error('对话不存在'); return s; };
  const update = (id, turnId, patch) => store.mutate(s => { const t = s.conversations[id]?.turns.find(t => t.id === turnId); if (t) Object.assign(t, patch); });
  app.post('/api/conversation', route((req, res) => {
    const q = getQuestion(req.body.questionId);
    let existing = Object.values(store.state.conversations).find(c => c.questionId === q.id && c.questionVersion === q.version);
    if (!existing) { existing = { id: randomUUID(), questionId: q.id, questionVersion: q.version, turns: [] }; store.mutate(s => { s.conversations[existing.id] = existing; s.events ??= []; s.events.push({ type: 'conversation-enter', questionId: q.id, at: Date.now() }); s.events = s.events.slice(-5000); }); }
    ok(res);
  }));
  app.get('/api/conversation/:id', route((req, res) => { session(req.params.id); ok(res); }));
  async function run(id, turnId) {
    const controller = new AbortController(); running.set(id, controller);
    const startEpoch = epoch();
    const valid = () => !controller.signal.aborted && epoch() === startEpoch && store.state.conversations[id]?.turns.some(t => t.id === turnId && ['generating', 'verifying'].includes(t.status));
    try {
      const s = session(id), turn = s.turns.find(t => t.id === turnId), q = getQuestion(s.questionId);
      const relevant = q.sourceSnapshots || sources.filter(source => q.citations.some(c => c.sourceId === source.id));
      const history = s.turns.filter(t => t.status === 'complete' && t.at < turn.at).slice(-6).map(t => ({ user: t.user, reply: t.reply }));
      // A verbatim extractive summary cannot invent user beliefs or new facts.
      const earlier = s.turns.filter(t => t.status === 'complete' && t.at < turn.at).slice(0, -6);
      const summary = earlier.slice(-12).map(t => ({ userExcerpt: t.user.slice(0, 180), verifiedReplyExcerpt: t.reply?.slice(0, 250) }));
      const input = { question: q, user: turn.user, history, summary, contextLimited: earlier.length > 0, sources: relevant };
      const raw = await modelCall({ key: credentials.get(), model: turn.model, system: dialoguePrompt, input, signal: controller.signal });
      if (!valid()) return;
      const candidate = z.object({ unavailable: z.boolean(), reply: z.string().min(1).max(2400), followup: z.string().max(200).default(''), evidence: z.array(z.object({ claim: z.string().min(1), sourceId: z.string(), quote: z.string().min(25) })).max(12) }).parse(raw);
      if ((!candidate.unavailable && !candidate.evidence.length) || candidate.evidence.some(e => !candidate.reply.includes(e.claim) || !relevant.some(source => source.id === e.sourceId && source.excerpt.includes(e.quote)))) throw new Error('回复引用未通过核验，可重试。');
      update(id, turnId, { status: 'verifying' });
      const verified = await modelCall({ key: credentials.get(), model: turn.model, system: dialogueVerifyPrompt, input: { ...input, candidate }, signal: controller.signal });
      if (!valid()) return;
      if (verified.approved !== true || ['supported','citations','responsive','boundaries'].some(k => verified.checks?.[k] !== true)) throw new Error('回复未通过独立核验，可重试。');
      update(id, turnId, { status: 'complete', reply: candidate.reply, followup: candidate.followup, evidence: candidate.evidence });
    } catch (e) {
      if (valid()) update(id, turnId, { status: 'failed', error: e instanceof z.ZodError ? '回复格式不完整，可重试。' : e.message });
      else if (store.state.conversations[id]?.turns.some(t => t.id === turnId && ['generating','verifying'].includes(t.status))) update(id, turnId, { status: 'cancelled', error: '配置或数据已变更，请重试。' });
    } finally {
      if (store.state.conversations[id]?.turns.some(t => t.id === turnId && ['generating','verifying'].includes(t.status))) update(id, turnId, { status: 'cancelled', error: '配置或数据已变更，请重试。' });
      if (running.get(id) === controller) running.delete(id);
    }
  }
  app.post('/api/conversation/:id/message', route((req, res) => {
    const s = session(req.params.id);
    const body = z.object({ requestId: z.string().uuid(), message: z.string().trim().min(1).max(8000), retry: z.boolean().optional() }).parse(req.body);
    if (running.has(s.id)) throw new Error('上一轮仍在处理，请等待或停止。');
    const old = s.turns.find(t => t.id === body.requestId);
    if (old && (!body.retry || !['failed','cancelled'].includes(old.status))) return ok(res);
    if (!credentials.get()) throw new Error('请先配置 DeepSeek，输入会保留。');
    if (old && old.user !== body.message) throw new Error('重试内容与原消息不一致');
    if (old) update(s.id, old.id, { status: 'generating', error: '' });
    else store.mutate(state => { state.conversations[s.id].turns.push({ id: body.requestId, user: body.message, status: 'generating', model: state.model, promptVersion: 2, at: Date.now() }); });
    void run(s.id, body.requestId); ok(res);
  }));
  app.post('/api/conversation/:id/cancel', route((req, res) => {
    const s = session(req.params.id); running.get(s.id)?.abort();
    for (const t of s.turns.filter(t => ['generating','verifying'].includes(t.status))) update(s.id, t.id, { status: 'cancelled', error: '已停止，可重试。' });
    ok(res);
  }));
}
