import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { freshState, validateQuestion, selectNext } from '../server/core.js';
import { seeds, sources } from '../server/seeds.js';
import { dialoguePrompt, dialogueVerifyPrompt } from '../server/model.js';

test('old state migrates without losing draft, saved item or review', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pickoneq-migrate-'));
  try {
    const state = freshState(); delete state.contentStateVersion; delete state.conversations; delete state.events;
    state.currentId = 'seed-map'; state.drafts['seed-map:answer'] = { answer: '原草稿', confidence: null, at: 1 }; state.saves['seed-map'] = { favorite: true }; state.reviews['seed-map'] = { due: 123, interval: 3, reason: 'later' };
    writeFileSync(join(dir, 'state.json'), JSON.stringify(state));
    const store = createStore(dir); assert.equal(store.state.currentId, 'seed-map'); assert.equal(store.state.drafts['seed-map:answer'].answer, '原草稿'); assert.equal(store.state.reviews['seed-map'].due, 123); assert.ok(store.state.saves['seed-map'].favorite); assert.ok(readdirSync(dir).some(n => n.includes('before-scenes')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('scene validation and quarantine never fall back to legacy new questions', () => {
  const q = seeds.find(q => q.id === 'scene-map');
  assert.throws(() => validateQuestion({ ...q, title: '什么是地图投影？' }, sources, []));
  assert.throws(() => validateQuestion({ ...q, choices: [{ id: 'a', label: '一' }, { id: 'a', label: '二' }] }, sources, []));
  const state = freshState(); state.reports = seeds.filter(q => q.contentDesignVersion === 2).map(q => ({ questionId: q.id }));
  assert.equal(selectNext(state, seeds), null);
});

test('dialogue lifecycle: verified output, rejection, retry, cancellation and choice-only feedback', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'pickoneq-dialogue-')); const store = createStore(dir);
  let reject = false, hold = false, release, captured;
  const modelCall = async ({ system, input }) => {
    captured = input;
    if (hold && system === dialoguePrompt) await new Promise(resolve => { release = resolve; });
    const source = input.sources[0];
    if (system === dialoguePrompt) return { unavailable: false, reply: '地图的表达存在取舍。', followup: '你会怎样比较面积？', evidence: [{ claim: '地图的表达存在取舍。', sourceId: source.id, quote: source.excerpt }] };
    if (system === dialogueVerifyPrompt) return { approved: !reject, checks: { supported: !reject, citations: true, responsive: true, boundaries: true } };
    return { summary: '判断成立，但没有提供理由。', captured: [input.choice], corrections: [], additions: [], verdict: 'supported', evidence: [{ kind: 'captured', claim: input.choice, userQuote: input.choice, sourceId: source.id, sourceQuote: source.excerpt }] };
  };
  const { app } = createApp({ store, modelCall, credentials: { get: () => 'fake-test-key', status: () => ({ configured: true, storage: 'session' }) }, port: 4357 });
  const server = app.listen(4357, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:4357/api/'; const boot = await (await fetch(base + 'bootstrap')).json();
  const post = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PickOneQ-Token': boot.csrf }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };
  const wait = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('timeout'); };
  try {
    await post('conversation', { questionId: 'scene-map' }); const id = Object.keys(store.state.conversations)[0];
    const turns = () => store.state.conversations[id].turns;
    await t.test('only selected judgment is sent separately and never passes a review', async () => {
      store.mutate(s => { s.reviews['scene-map'] = { interval: 3, due: 1, reason: 'later' }; });
      const result = await post('answer', { id: 'scene-map', choiceId: '2', answer: '', confidence: null, mode: 'answer', requestId: randomUUID() });
      assert.equal(result.status, 200); assert.equal(captured.answer, ''); assert.equal(captured.choice, '还要知道地图如何绘制'); assert.equal(store.state.attempts[0].feedback.verdict, 'partial'); assert.equal(store.state.reviews['scene-map'].due, 1);
      assert.equal((await post('draft', { id: 'scene-map', choiceId: 'invalid', answer: '', confidence: null })).status, 422);
    });
    await t.test('multiple rounds persist, use sources, do not advance new-question count', async () => {
      const count = store.state.newSinceReview;
      for (let i = 0; i < 8; i++) { await post(`conversation/${id}/message`, { requestId: randomUUID(), message: `第${i}轮，请解释` }); await wait(() => turns().at(-1).status === 'complete'); }
      assert.equal(captured.history.length, 6); assert.ok(captured.summary.length); assert.equal(store.state.newSinceReview, count); assert.equal(createStore(dir).state.conversations[id].turns.length, 8);
    });
    await t.test('rejected reply is not exposed and retry uses the same round', async () => {
      reject = true; const requestId = randomUUID(); const body = { requestId, message: '再解释一次' };
      await post(`conversation/${id}/message`, body); await wait(() => turns().at(-1).status === 'failed'); assert.equal(turns().at(-1).reply, undefined);
      reject = false; await post(`conversation/${id}/message`, { ...body, retry: true }); await wait(() => turns().at(-1).status === 'complete');
      await post(`conversation/${id}/message`, body); assert.equal(turns().filter(t => t.id === requestId).length, 1);
    });
    await t.test('cancel prevents late model output from publishing', async () => {
      hold = true; await post(`conversation/${id}/message`, { requestId: randomUUID(), message: '等待中的问题' }); await wait(() => !!release);
      await post(`conversation/${id}/cancel`, {}); release(); await new Promise(r => setTimeout(r, 30));
      assert.equal(turns().at(-1).status, 'cancelled'); assert.equal(turns().at(-1).reply, undefined);
    });
  } finally { await new Promise(r => server.close(r)); rmSync(dir, { recursive: true, force: true }); }
});
