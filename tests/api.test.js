import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { sources } from '../server/seeds.js';

test('isolated API end-to-end: onboarding, learning, persistence, errors and security', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'pickoneq-test-'));
  const store = createStore(dir);
  let key = null, failModel = false;
  const credentials = { get: () => key, status: () => ({ configured: !!key, storage: 'session' }), set: k => { key = k; }, remove: () => { key = null; } };
  const modelCall = async ({ input }) => {
    if (failModel) throw new Error('模型请求受到限流，请稍后重试。');
    if (input.test) return { ok: true };
    return { summary: '方向合理', captured: ['你提到了投影'], corrections: [], additions: ['面积失真'], verdict: 'supported', evidence: [
      { kind: 'captured', claim: '你提到了投影', userQuote: '投影', sourceId: 's-map', sourceQuote: sources.find(s => s.id === 's-map').excerpt },
      { kind: 'addition', claim: '面积失真', sourceId: 's-map', sourceQuote: sources.find(s => s.id === 's-map').excerpt },
    ] };
  };
  const { app } = createApp({ store, credentials, modelCall, port: 0 });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/`;
  const headers = { Host: '127.0.0.1:0', 'Content-Type': 'application/json' };
  const request = async (path, body, method = 'POST', extra = {}) => {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const r = httpRequest(url + path, { method, agent: false, headers: { ...headers, ...(payload === undefined ? {} : { 'Content-Length': Buffer.byteLength(payload) }), ...extra } }, response => {
        let raw = ''; response.on('data', data => { raw += data; });
        response.on('end', () => { try { resolve({ status: response.statusCode, body: JSON.parse(raw) }); } catch (e) { reject(e); } });
      });
      r.on('error', reject); if (payload !== undefined) r.write(payload); r.end();
    });
  };
  try {
    const boot = await request('bootstrap', undefined, 'GET'); assert.equal(boot.status, 200); headers['X-PickOneQ-Token'] = boot.body.csrf;
    await t.test('direction coverage maps to traceable sources', () => {
      assert.equal(Object.keys(boot.body.topicCoverage).length, 30);
      assert.ok(boot.body.topicCoverage['s-map'].includes('地图'));
      for (const id of Object.keys(boot.body.topicCoverage)) assert.ok(boot.body.sources.some(source => source.id === id && source.verified));
    });
    await t.test('setup skips key explicitly and persists onboarding', async () => {
      assert.equal((await request('onboarding', {})).body.state.onboarding, true);
      assert.equal(createStore(dir).state.onboarding, true);
    });
    await t.test('draft saved without score; blank answer rejected', async () => {
      await request('draft', { id: 'seed-map', answer: '因为投影', confidence: null });
      const attempt = await request('answer', { id: 'seed-map', answer: '因为投影', confidence: null, mode: 'answer', requestId: randomUUID() });
      assert.equal(attempt.status, 412); assert.equal(store.state.attempts.length, 0); assert.equal(store.state.drafts['seed-map:answer'].answer, '因为投影');
      assert.equal((await request('answer', { id: 'seed-map', answer: ' ', confidence: null, mode: 'answer', requestId: randomUUID() })).status, 400);
    });
    await t.test('skip adds history but not saved tasks', async () => {
      const next = await request('next', {}); assert.equal(next.status, 200); assert.equal(Object.keys(next.body.state.saves).length, 0);
    });
    await t.test('later and favorite coexist; remove one preserves the other', async () => {
      await request('save', { id: 'seed-map', kind: 'later', value: true });
      await request('save', { id: 'seed-map', kind: 'favorite', value: true });
      await request('save', { id: 'seed-map', kind: 'later', value: false });
      assert.equal(store.state.saves['seed-map'].favorite, true);
    });
    await t.test('learning does not mark mastery and can schedule/cancel review', async () => {
      await request('learn', { id: 'seed-map', feeling: 'understood' }); assert.equal(store.state.learned['seed-map'].mastered, undefined);
      await request('learn', { id: 'seed-map', feeling: 'later' }); assert.equal(store.state.reviews['seed-map'].interval, 3);
      store.mutate(s => { s.currentId = 'seed-map'; s.currentKind = 'review'; s.history.push({ questionId: 'seed-map', kind: 'review', at: Date.now() }); s.reviews['seed-map'].due = 0; });
      await request('learn', { id: 'seed-map', feeling: 'understood' }); assert.equal(store.state.reviews['seed-map'].interval, 3); assert.ok(store.state.reviews['seed-map'].due > Date.now());
      await request('review', { id: 'seed-map', action: 'cancel' }); assert.equal(store.state.reviews['seed-map'], undefined);
    });
    await t.test('unsupported custom topic does not hallucinate coverage', async () => {
      assert.equal((await request('topic', { topic: '星际曲率发动机制造' })).body.covered, false);
      assert.equal((await request('topic', { topic: '基因编辑' })).body.covered, false);
      assert.equal((await request('topic', { topic: '地图' })).body.covered, true);
      assert.equal((await request('topic', { topic: '我想了解记忆如何形成' })).body.covered, true);
      assert.equal((await request('topic', { topic: '地图' }, 'DELETE')).body.state.preferences.topics.includes('地图'), false);
    });
    await t.test('topic limit rejects overflow and allows removing followed topics', async () => {
      const original = structuredClone(store.state.preferences);
      store.mutate(s => { s.preferences.topics = ['地图', ...Array.from({ length: 49 }, (_, i) => `主题${i}`)]; });
      assert.equal((await request('topic', { topic: '记忆' })).status, 422);
      assert.equal(store.state.preferences.topics.length, 50);
      assert.equal((await request('topic', { topic: '地图' }, 'DELETE')).status, 200);
      assert.equal(store.state.preferences.topics.length, 49);
      store.mutate(s => { s.preferences = original; });
    });
    await t.test('verified key is never returned or written to state; feedback persists exact version', async () => {
      const r = await request('credentials', { key: 'test-key-not-real', remember: false, model: 'deepseek-flash' }); assert.equal(r.status, 200);
      assert.ok(!JSON.stringify(r.body).includes('test-key-not-real'));
      await request('open', { id: 'seed-map' });
      const body = { id: 'seed-map', answer: '因为投影', confidence: 'some', mode: 'answer', requestId: randomUUID() };
      assert.equal((await request('answer', body)).status, 200);
      assert.equal(store.state.attempts.length, 1); assert.equal(store.state.attempts[0].questionVersion, 1);
      assert.equal((await request('answer', body)).status, 200); assert.equal(store.state.attempts.length, 1);
      assert.ok(!readFileSync(join(dir, 'state.json'), 'utf8').includes('test-key-not-real'));
    });
    await t.test('failed model preserves draft and never records success', async () => {
      failModel = true;
      const r = await request('answer', { id: 'seed-map', answer: '球体投影', confidence: 'sure', mode: 'answer', requestId: randomUUID() });
      assert.equal(r.status, 422); assert.equal(store.state.attempts.length, 1); assert.equal(store.state.drafts['seed-map:answer'].answer, '球体投影');
    });
    await t.test('reports quarantine question while preserving record', async () => {
      await request('report', { id: 'seed-map', reason: '事实有误' }); assert.equal(store.state.reports[0].questionVersion, 1);
    });
    await t.test('reject external host, origin and missing CSRF', async () => {
      assert.equal((await request('bootstrap', undefined, 'GET', { Host: 'evil.test' })).status, 403);
      assert.equal((await request('bootstrap', undefined, 'GET', { Origin: 'https://evil.test' })).status, 403);
      assert.equal((await request('next', {}, 'POST', { 'X-PickOneQ-Token': '' })).status, 403);
    });
    await t.test('export and restore require CSRF and exclude credentials', async () => {
      const exp = await request('export'); assert.equal(exp.body.format, 'pickoneq-v2'); assert.ok(!JSON.stringify(exp.body).includes('test-key-not-real'));
      assert.equal((await request('export', undefined, 'GET')).status, 404);
      assert.equal((await request('import', { backup: exp.body, confirm: 'wrong' })).status, 422);
      assert.equal((await request('import', { backup: exp.body, confirm: '恢复备份' })).status, 200);
    });
    await t.test('clearing requires exact confirmation', async () => {
      assert.equal((await request('data', { confirm: 'wrong' }, 'DELETE')).status, 422);
      assert.equal((await request('data', { confirm: '清空学习记录' }, 'DELETE')).status, 200);
      assert.equal(store.state.attempts.length, 0); assert.equal(key, 'test-key-not-real');
    });
  } finally { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); }
});
