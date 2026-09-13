import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';

test('invalid state is preserved and replaced with a safe fresh state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pickoneq-store-'));
  try {
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ version: 1, currentId: 'broken' }));
    const store = createStore(dir);
    assert.equal(store.state.currentId, 'scene-map'); assert.match(store.notice, /损坏/);
    assert.ok(readdirSync(dir).some(name => name.startsWith('state.json.corrupt-')));
    store.clearNotice(); assert.equal(store.notice, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('semantically invalid generated questions cannot break startup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pickoneq-questions-'));
  try {
    const store = createStore(dir); store.add({ id: 'broken-generated-question' });
    const credentials = { get: () => null, status: () => ({ configured: false, storage: 'system' }) };
    createApp({ store, credentials });
    assert.equal(store.generated.length, 0); assert.equal(store.state.currentId, 'scene-map'); assert.match(store.notice, /无法安全读取/);
    assert.ok(readdirSync(dir).some(name => name.startsWith('questions.json.corrupt-')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
