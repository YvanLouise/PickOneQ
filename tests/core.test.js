import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { freshState, selectNext, scheduleReview, DAY, validateQuestion, validateFeedback, duplicate, recordHistory } from '../server/core.js';
import { seeds, sources } from '../server/seeds.js';
import { domains } from '../server/catalog.js';
import { complete } from '../server/model.js';

test('six domains each have five fetched, traceable, hash-verified sources', () => {
  for (const d of domains) {
    const pool = sources.filter(s => s.domain === d.id && s.verified);
    assert.equal(pool.length, 5);
    for (const s of pool) { assert.ok(s.excerpt.length > 80); assert.equal(createHash('sha256').update(s.excerpt).digest('hex'), s.hash); assert.ok(s.url.startsWith('https://')); }
  }
});
test('all editorial questions have source-backed structure and matching related links', () => {
  for (const q of seeds) {
    validateQuestion(q, sources, []);
    if (q.relatedId) assert.equal(seeds.find(x => x.id === q.relatedId)?.title, q.relatedPrompt);
  }
});
test('reject unsupported source, wrong-domain citation, fabricated quote and missing answer', () => {
  const q = seeds[0];
  assert.throws(() => validateQuestion({ ...q, citations: [{ sourceId: 'unknown', quote: 'not a valid original reference at all' }] }, sources, []));
  assert.throws(() => validateQuestion({ ...q, domain: 'life' }, sources, []));
  assert.throws(() => validateQuestion({ ...q, citations: [{ sourceId: 's-map', quote: 'invented reference passage that never existed' }] }, sources, []));
  assert.throws(() => validateQuestion({ ...q, answer: '' }, sources, []));
});
test('duplicate detection handles punctuation and minor title changes', () => {
  assert.ok(duplicate('为什么天空是蓝色的？', '为什么天空是蓝色的'));
  assert.ok(duplicate('为什么格陵兰在地图上很大？', '为什么格陵兰在地图上很大呢？'));
  assert.throws(() => validateQuestion(seeds[0], sources, seeds));
});
test('reject time-sensitive question', () => assert.throws(() => validateQuestion({ ...seeds[0], title: '今年最新的地图是什么？' }, sources, [])));
test('no review before five new questions; due review takes precedence after five', () => {
  const state = freshState(); state.reviews['seed-enzyme'] = { due: 100, interval: 1 }; state.newSinceReview = 4;
  assert.notEqual(selectNext(state, seeds, { now: 200 }).kind, 'review');
  state.newSinceReview = 5;
  assert.equal(selectNext(state, seeds, { now: 200 }).question.id, 'seed-enzyme');
});
test('review interval is 3 days initially, 7 on pass and 1 on difficulty; can cancel', () => {
  const state = freshState();
  for (const [action, days] of [['later', 3], ['pass', 7], ['difficult', 1]]) { scheduleReview(state, 'a', action, 100); assert.equal(state.reviews.a.due, 100 + days * DAY); }
  scheduleReview(state, 'a', 'cancel'); assert.equal(state.reviews.a, undefined);
});
test('flagged questions excluded from both new feed and review', () => {
  const state = freshState(); state.reports = seeds.slice(1).map(q => ({ questionId: q.id })); state.newSinceReview = 6;
  state.reviews['seed-enzyme'] = { due: 1 };
  assert.equal(selectNext(state, seeds, { now: 100 }), null);
});
test('exploration ratio and selected domain weights guide feed', () => {
  const state = freshState(); state.preferences.weights = { life: 3 }; state.preferences.exploration = 0.2;
  assert.equal(selectNext(state, seeds, { random: () => 0.5 }).question.domain, 'life');
  assert.notEqual(selectNext(state, seeds, { random: () => 0.1 }).question.domain, 'life');
});
test('related action goes to the promised question, even if previously seen', () => {
  const state = freshState(); state.history.push({ questionId: 'seed-navigation' });
  assert.equal(selectNext(state, seeds, { relatedTo: 'seed-map' }).question.id, 'seed-navigation');
});
test('exhausted feed returns null rather than silently repeating', () => {
  const state = freshState(); state.history = seeds.map(q => ({ questionId: q.id }));
  assert.equal(selectNext(state, seeds), null);
});
const baseFeedback = { summary: '仍需判断', captured: [], corrections: [], additions: [], verdict: 'partial', evidence: [] };
test('feedback without evidence cannot claim correctness or a key misconception', () => {
  for (const verdict of ['supported', 'misconception']) assert.equal(validateFeedback({ ...baseFeedback, verdict }, '因为投影', sources).verdict, 'uncertain');
});
test('feedback evidence must quote actual user answer and actual source', () => {
  assert.throws(() => validateFeedback({ ...baseFeedback, captured: ['投影判断'], evidence: [{ kind: 'captured', claim: '投影判断', userQuote: '我从没说过', sourceId: 's-map', sourceQuote: sources[0].excerpt }] }, '因为投影', sources));
  assert.throws(() => validateFeedback({ ...baseFeedback, additions: ['补充'], evidence: [{ kind: 'addition', claim: '补充', sourceId: 's-map', sourceQuote: '不存在的来源' }] }, '因为投影', sources));
  assert.throws(() => validateFeedback({ ...baseFeedback, captured: ['投影判断'], evidence: [] }, '因为投影', sources), /逐条证据/);
});
test('history is bounded without losing the latest entries', () => {
  const state = freshState();
  for (let i = 0; i < 2100; i++) recordHistory(state, { questionId: `q-${i}`, at: i, kind: 'new' });
  assert.equal(state.history.length, 2000); assert.equal(state.history.at(-1).questionId, 'q-2099');
});
for (const [status, pattern] of [[401, /Key 无效/], [402, /余额不足/], [429, /限流/], [500, /暂不可用/]]) {
  test(`model HTTP ${status} has safe actionable message and no leaked key`, async () => {
    await assert.rejects(complete({ key: 'secret-value', model: 'deepseek-flash', system: '', input: {}, fetchImpl: async () => ({ ok: false, status }) }), pattern);
  });
}
test('timeout/network and malformed/empty/truncated model replies fail explicitly', async () => {
  await assert.rejects(complete({ fetchImpl: async () => { throw new Error('secret-response'); } }), /网络不可用/);
  for (const reply of [{}, { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }, { choices: [{ finish_reason: 'stop', message: { content: '' } }] }]) {
    await assert.rejects(complete({ fetchImpl: async () => ({ ok: true, json: async () => reply }) }), /不完整/);
  }
});
