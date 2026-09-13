import { z } from 'zod';
import { createHash } from 'node:crypto';

export const text = z.string().trim().min(1).max(4000);
export const questionSchema = z.object({
  contentDesignVersion: z.literal(2).optional(), previousId: z.string().optional(),
  sceneType: z.enum(['choice','intuition','phenomenon','prediction','critique','everyday','tradeoff']).optional(),
  judgmentType: z.enum(['determinate','conditional']).optional(), sceneSummary: text.max(250).optional(), conceptReveal: text.optional(),
  choices: z.array(z.object({ id: text.max(30), label: text.max(80) })).min(2).max(4).optional(),
  title: text.max(160), background: text.max(500), domain: z.string(), difficulty: z.enum(['入门', '进阶']),
  answer: text, reasoning: z.array(text).min(1).max(5), example: text, misconception: text,
  hint: text.max(300), concepts: z.array(text.max(60)).min(1).max(5),
  citations: z.array(z.object({ sourceId: z.string(), quote: text.max(1500) })).min(1).max(5),
  relatedPrompt: text.max(160),
});
export const feedbackSchema = z.object({
  summary: text.max(200), captured: z.array(text).max(4),
  corrections: z.array(z.object({ type: z.enum(['fact', 'reasoning']), text })).max(4), additions: z.array(text).max(2),
  verdict: z.enum(['supported', 'partial', 'misconception', 'uncertain']),
  evidence: z.array(z.object({
    kind: z.enum(['captured', 'correction', 'addition']), claim: text,
    userQuote: text.optional(), sourceId: z.string(), sourceQuote: text,
  })).max(10),
});
export const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
export function duplicate(a, b) {
  a = normalize(a); b = normalize(b);
  if (a === b) return true;
  const grams = str => new Set(Array.from({ length: Math.max(0, str.length - 1) }, (_, i) => str.slice(i, i + 2)));
  const A = grams(a), B = grams(b);
  return 2 * [...A].filter(x => B.has(x)).length / Math.max(1, A.size + B.size) > 0.72;
}
export function validateQuestion(candidate, sources, existing) {
  const q = questionSchema.parse(candidate);
  if (q.contentDesignVersion === 2) {
    if (!q.sceneType || !q.judgmentType || !q.sceneSummary || !q.conceptReveal || q.title.length > 28 || q.background.length > 180 || q.reasoning.length < 2) throw new Error('情境题或完整解释结构不完整');
    if (q.choices && new Set(q.choices.map(c => c.id)).size !== q.choices.length) throw new Error('选项编号重复');
    if (/^(什么是|请解释|请定义)/.test(q.title)) throw new Error('请使用具体情境，不能只询问定义');
  }
  if (existing.some(old => duplicate(old.title, q.title))) throw new Error('题目与已有内容重复');
  if (/今天|今年|最新|现任|实时/.test(q.title + q.background)) throw new Error('首版暂不支持时效性问题');
  for (const c of q.citations) {
    const source = sources.find(s => s.id === c.sourceId && s.verified && s.domain === q.domain);
    if (!source || c.quote.length < 25 || !source.excerpt.includes(c.quote)) throw new Error('引用无法对应到已核验的原文');
  }
  return q;
}
export function validateFeedback(candidate, answer, sources) {
  const f = feedbackSchema.parse(candidate);
  for (const e of f.evidence) {
    if ((e.kind !== 'addition' && (!e.userQuote || !answer.includes(e.userQuote))) || !sources.some(s => s.id === e.sourceId && s.excerpt.includes(e.sourceQuote))) {
      throw new Error('反馈证据无法对应作答与来源，请重试');
    }
  }
  for (const [key, kind] of [['captured', 'captured'], ['corrections', 'correction'], ['additions', 'addition']]) {
    if (f[key].some(item => { const claim = typeof item === 'string' ? item : item.text; return !f.evidence.some(e => e.kind === kind && normalize(e.claim) === normalize(claim)); })) {
      throw new Error('反馈结论缺少逐条证据，请重试');
    }
  }
  if ((f.verdict === 'misconception' || f.verdict === 'supported') && !f.evidence.length) {
    f.verdict = 'uncertain'; f.summary = '暂时无法可靠判断，请结合下方解释自行核对。';
  }
  return f;
}
export const DAY = 86400000;
export function scheduleReview(state, id, action, now = Date.now()) {
  if (action === 'cancel') { delete state.reviews[id]; return; }
  const days = action === 'pass' ? 7 : action === 'difficult' ? 1 : 3;
  state.reviews[id] = { due: now + days * DAY, interval: days, reason: action };
}
export function recordHistory(state, item) {
  state.history.push(item);
  if (state.history.length > 2000) state.history.splice(0, state.history.length - 2000);
}
export function selectNext(state, questions, { random = Math.random, now = Date.now(), relatedTo } = {}) {
  const available = questions.filter(q => !state.reports.some(r => r.questionId === q.id));
  if (relatedTo) {
    const base = questions.find(q => q.id === relatedTo);
    const exact = available.find(q => q.id === base?.relatedId);
    if (exact && exact.concepts.some(c => base.concepts.includes(c))) return { question: exact, kind: 'related' };
    const linked = available.filter(q => q.id !== relatedTo && !state.history.some(h => h.questionId === q.id) && q.domain === base?.domain)
      .sort((a, b) => b.concepts.filter(c => base.concepts.includes(c)).length - a.concepts.filter(c => base.concepts.includes(c)).length);
    if (linked[0]?.concepts.some(c => base.concepts.includes(c))) return { question: linked[0], kind: 'related' };
    return null;
  }
  if (state.newSinceReview >= 5) {
    const due = available.filter(q => q.id !== state.currentId && state.reviews[q.id]?.due <= now)
      .sort((a, b) => state.reviews[a.id].due - state.reviews[b.id].due);
    if (due[0]) return { question: due[0], kind: 'review' };
  }
  const modern = questions.some(q => q.contentDesignVersion === 2);
  const unseen = available.filter(q => (!modern || q.contentDesignVersion === 2) && !state.history.some(h => h.questionId === q.id));
  const interest = Object.keys(state.preferences.weights).filter(k => state.preferences.weights[k] > 0);
  const explore = interest.length > 0 && random() < state.preferences.exploration;
  let pool = unseen.filter(q => !interest.length || (explore ? !interest.includes(q.domain) : interest.includes(q.domain)));
  if (!pool.length) pool = unseen;
  if (!pool.length) return null;
  const last = state.history.filter(h => h.kind !== 'review').slice(-2).map(h => questions.find(q => q.id === h.questionId)?.sceneType);
  if (last.length === 2 && last[0] && last[0] === last[1] && pool.some(q => q.sceneType !== last[0])) pool = pool.filter(q => q.sceneType !== last[0]);
  const weights = pool.map(q => interest.includes(q.domain) ? state.preferences.weights[q.domain] : 1);
  let ticket = random() * weights.reduce((a, b) => a + b, 0);
  let selected = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) { ticket -= weights[i]; if (ticket <= 0) { selected = pool[i]; break; } }
  return { question: selected, kind: interest.length && !interest.includes(selected.domain) ? 'explore' : 'new' };
}
export function freshState() {
  return { version: 1, contentStateVersion: 2, conversations: {}, events: [], revision: 0, onboarding: false, currentId: 'scene-map', currentKind: 'new', stage: 'question', newSinceReview: 1,
    preferences: { weights: {}, exploration: 0.2, topics: [] }, drafts: {}, history: [{ questionId: 'scene-map', at: Date.now(), kind: 'new' }],
    attempts: [], learned: {}, saves: {}, reviews: {}, reports: [], model: 'deepseek-flash' };
}
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const storedFeedbackSchema = z.object({
  summary: z.string(), captured: z.array(z.string()), corrections: z.array(z.union([z.string(), z.object({ type: z.enum(['fact', 'reasoning']), text: z.string() })])), additions: z.array(z.string()), verdict: z.string(),
  evidence: z.array(z.object({ kind: z.string().optional(), claim: z.string().optional(), userQuote: z.string().optional(), sourceId: z.string(), sourceQuote: z.string() })).default([]),
}).passthrough();
export const stateSchema = z.object({
  contentStateVersion: z.literal(2).default(2),
  conversations: z.record(z.object({ id: z.string(), questionId: z.string(), questionVersion: z.number(), turns: z.array(z.object({ id: z.string(), user: z.string().max(8000), status: z.enum(['generating','verifying','complete','failed','cancelled']), reply: z.string().optional(), followup: z.string().optional(), evidence: z.array(z.object({ sourceId: z.string(), quote: z.string(), claim: z.string() })).optional(), error: z.string().optional(), model: z.string(), promptVersion: z.number(), at: z.number() })) })).default({}),
  events: z.array(z.object({ type: z.string(), questionId: z.string(), at: z.number() })).max(5000).default([]),
  version: z.literal(1), revision: z.number().int().nonnegative(), onboarding: z.boolean(), currentId: z.string(), currentKind: z.string(),
  stage: z.enum(['question', 'answer', 'learn']), newSinceReview: z.number().int().nonnegative(),
  preferences: z.object({ weights: z.record(z.number().int().min(0).max(3)), exploration: z.number().min(0).max(0.5), topics: z.array(z.string().max(60)).max(50) }),
  drafts: z.record(z.object({ answer: z.string().max(8000), choiceId: z.string().nullable().optional(), confidence: z.enum(['guess', 'some', 'sure']).nullable(), at: z.number() })),
  history: z.array(z.object({ questionId: z.string(), at: z.number(), kind: z.string() })).max(2000),
  attempts: z.array(z.object({ id: z.string(), requestId: z.string(), questionId: z.string(), questionVersion: z.number(), answer: z.string().max(8000), choiceId: z.string().nullable().optional(), choiceLabel: z.string().optional(), confidence: z.enum(['guess', 'some', 'sure']).nullable(), mode: z.enum(['answer', 'restate']), model: z.string(), feedbackVersion: z.number(), feedback: storedFeedbackSchema, at: z.number() })).max(10000),
  learned: z.record(z.object({ at: z.number(), feeling: z.enum(['understood', 'unclear', 'later']) })),
  saves: z.record(z.object({ later: z.boolean().optional(), favorite: z.boolean().optional() })),
  reviews: z.record(z.object({ due: z.number(), interval: z.number(), reason: z.string() })),
  reports: z.array(z.object({ id: z.string(), questionId: z.string(), questionVersion: z.number(), reason: z.string(), at: z.number() })).max(10000),
  model: z.enum(['deepseek-flash', 'deepseek-v4-pro']),
});

export function validateState(candidate, questionIds) {
  const state = stateSchema.parse(candidate);
  const ids = new Set(questionIds);
  const referenced = [state.currentId, ...state.history.map(x => x.questionId), ...state.attempts.map(x => x.questionId),
    ...Object.keys(state.learned), ...Object.keys(state.saves), ...Object.keys(state.reviews), ...state.reports.map(x => x.questionId),
    ...Object.keys(state.drafts).map(key => key.replace(/:(answer|restate)$/, ''))];
  if (referenced.some(id => !ids.has(id)) || Object.values(state.conversations).some(c => !ids.has(c.questionId))) throw new Error('备份引用了不存在的问题');
  return state;
}
