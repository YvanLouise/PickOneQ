// PickOneQ embedded-Node credentials store (Android / nodejs-mobile).
// Drop-in replacement for server/credentials.js: the desktop build uses the
// native @napi-rs/keyring addon, which cannot run on Android. This module keeps
// the same interface and persists the key to a file with mode 0o600 instead.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function createCredentials(directory = resolve('.local')) {
  const file = () => resolve(directory, 'credentials.json');
  let sessionKey = null;

  const readStored = () => {
    try {
      const stored = JSON.parse(readFileSync(file(), 'utf8'));
      return typeof stored?.key === 'string' ? stored.key : null;
    } catch {
      return null;
    }
  };

  const get = () => {
    if (sessionKey) return sessionKey;
    return readStored();
  };

  const status = () => ({ configured: Boolean(get()), storage: sessionKey ? 'session' : 'system' });

  const set = (key, remember = true) => {
    if (remember) {
      try {
        mkdirSync(directory, { recursive: true });
        writeFileSync(file(), JSON.stringify({ key }), { mode: 0o600 });
        sessionKey = null;
      } catch {
        // Persisting failed: keep the key usable for this run only.
        sessionKey = key;
      }
    } else {
      try { rmSync(file(), { force: true }); } catch {}
      sessionKey = key;
    }
  };

  const remove = () => {
    sessionKey = null;
    try { rmSync(file(), { force: true }); } catch {}
  };

  return { get, status, set, remove };
}
