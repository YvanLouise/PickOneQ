import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../server/core.js';
import { createApp } from '../server/app.js';
import { generatePrompt } from '../server/model.js';

function setup(behavior) {
  const store = { state: freshState(), generated: [], add(q) { this.generated.push(q); }, mutate(fn) { fn(this.state); } };
  let calls = 0;
  const credentials = { get: () => 'synthetic-test-only', status: () => ({ configured: true, storage: 'session' }) };
  const modelCall = async params => { calls++; return behavior(params, calls); };
  return { store, ...createApp({ store, credentials, modelCall }), calls: () => calls };
}
const approved = { approved: true, checks: { premise: true, answer: true, reasoning: true, example: true, citations: true, novelty: true, noSpoiler: true, conditions: true, choices: true, task: true }, scores: Object.fromEntries(['clarity','participation','tension','benefit'].map(k => [k, { value: 4, reason: 'synthetic test' }])), reason: 'Supported by provided source' };
const candidate = input => ({ contentDesignVersion: 2, sceneType: 'everyday', judgmentType: 'determinate', sceneSummary: '用于结构测试的情境', conceptReveal: '合成概念', title: '如何用资料中的核心机制解释这个现象？', background: '从一个问题开始理解。', domain: input.domain, difficulty: '入门', answer: '这是一份结构测试的合成内容。', reasoning: ['先检查资料支持的前提。', '再用资料中的机制回应情境。'], example: '合成示例', misconception: '合成误区', hint: '合成提示', concepts: ['合成概念'], citations: [{ sourceId: input.sources[0].id, quote: input.sources[0].excerpt }], relatedPrompt: '下一步如何理解？' });
test('accepted generation requires independent review and preserves source/model snapshots', async () => {
  const ctx = setup(({ system, input }) => system === generatePrompt ? candidate(input) : approved);
  await ctx.generate(); assert.equal(ctx.calls(), 2); assert.equal(ctx.store.generated.length, 1);
  const q = ctx.store.generated[0]; assert.equal(q.model, 'deepseek-flash'); assert.equal(q.origin, 'generated'); assert.ok(q.sourceSnapshots.length); assert.equal(q.verification.approved, true); assert.equal(ctx.generation.busy, false);
  assert.ok(ctx.snapshot().sources.some(source => source.id === q.citations[0].sourceId));
});
test('failed semantic check never publishes even when top-level approved is true', async () => {
  const ctx = setup(({ system, input }) => system === generatePrompt ? candidate(input) : { ...approved, checks: { ...approved.checks, answer: false } });
  await ctx.generate(); assert.equal(ctx.store.generated.length, 0); assert.match(ctx.generation.error, /未通过/);
});
test('fabricated source fails before independent review', async () => {
  const ctx = setup(({ input }) => ({ ...candidate(input), citations: [{ sourceId: 'made-up', quote: 'this quote was invented and should never pass' }] }));
  await ctx.generate(); assert.equal(ctx.calls(), 1); assert.equal(ctx.store.generated.length, 0); assert.match(ctx.generation.error, /引用/);
});
test('duplicate generation is rejected and cannot overwrite original question', async () => {
  const ctx = setup(({ system, input }) => system === generatePrompt ? candidate(input) : approved);
  await ctx.generate(); const original = structuredClone(ctx.store.generated[0]); await ctx.generate();
  assert.equal(ctx.store.generated.length, 1); assert.deepEqual(ctx.store.generated[0], original); assert.match(ctx.generation.error, /重复/);
});
test('model failure clears busy state and never claims accepted content', async () => {
  const ctx = setup(() => { throw new Error('限流'); });
  await ctx.generate(); assert.equal(ctx.store.generated.length, 0); assert.equal(ctx.generation.busy, false); assert.equal(ctx.generation.error, '限流');
});
test('insufficient source response is explicitly rejected', async () => {
  const ctx = setup(() => ({ unavailable: true })); await ctx.generate();
  assert.equal(ctx.store.generated.length, 0); assert.match(ctx.generation.error, /不完整/);
});

test('editorial checks reject spoilers, missing conditions and weak tension despite approval', async () => {
  for (const key of ['noSpoiler','conditions','choices','task']) {
    const ctx = setup(({ system, input }) => system === generatePrompt ? candidate(input) : { ...approved, checks: { ...approved.checks, [key]: false } });
    await ctx.generate(); assert.equal(ctx.store.generated.length, 0);
  }
  const ctx = setup(({ system, input }) => system === generatePrompt ? candidate(input) : { ...approved, scores: { ...approved.scores, tension: { value: 2, reason: 'No explanatory gap' } } });
  await ctx.generate(); assert.equal(ctx.store.generated.length, 0); assert.match(ctx.generation.error, /评分/);
});

test('automatic supply fills a low queue and stops at its target', async () => {
  let sequence = 0;
  const store = { state: freshState(), generated: [], add(q) { this.generated.push(q); }, mutate(fn) { fn(this.state); } };
  store.state.onboarding = true;
  const credentials = { get: () => 'synthetic-test-only', status: () => ({ configured: true, storage: 'session' }) };
  const titles = ['这张图遗漏了什么条件？', '一次选择改变了什么结果？'];
  const modelCall = async ({ system, input }) => system === generatePrompt ? { ...candidate(input), title: titles[sequence], sceneSummary: `自动情境${++sequence}` } : approved;
  let clock = 100_000;
  const ctx = createApp({ store, credentials, modelCall, generationTarget: 2, now: () => clock });
  const wait = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('timeout'); };
  ctx.tick(); await wait(() => !ctx.generation.busy); assert.equal(ctx.snapshot().generation.ready, 1);
  clock += 10_000; ctx.tick(); await wait(() => !ctx.generation.busy); assert.equal(ctx.snapshot().generation.ready, 2);
  clock += 20_000; ctx.tick(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(ctx.snapshot().generation.ready, 2); assert.equal(ctx.generation.attempted, 2); assert.equal(ctx.snapshot().generation.needed, 0);
});

test('automatic supply backs off after failure and resumes without an attempt cap', async () => {
  const store = { state: freshState(), generated: [], add(q) { this.generated.push(q); }, mutate(fn) { fn(this.state); } };
  store.state.onboarding = true;
  const credentials = { get: () => 'synthetic-test-only', status: () => ({ configured: true, storage: 'session' }) };
  let clock = 50_000, fail = true, calls = 0;
  const modelCall = async ({ system, input }) => { calls++; if (fail) throw new Error('暂时限流'); return system === generatePrompt ? candidate(input) : approved; };
  const ctx = createApp({ store, credentials, modelCall, generationTarget: 1, now: () => clock });
  const wait = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('timeout'); };
  ctx.tick(); await wait(() => !ctx.generation.busy); assert.equal(calls, 1); assert.equal(ctx.generation.consecutiveFailures, 1); assert.equal(ctx.generation.nextRetryAt, clock + 30_000);
  ctx.tick(); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(calls, 1);
  fail = false; clock += 30_000; ctx.tick(); await wait(() => !ctx.generation.busy); assert.equal(ctx.snapshot().generation.ready, 1); assert.equal(ctx.generation.consecutiveFailures, 0);
  ctx.generation.attempted = 999; store.generated.length = 0; clock += 10_000; ctx.tick(); await wait(() => !ctx.generation.busy); assert.equal(ctx.snapshot().generation.ready, 1);
});
