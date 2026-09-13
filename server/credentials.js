import { Entry } from '@napi-rs/keyring';

export function createCredentials() {
  let sessionKey = null;
  const entry = () => new Entry('PickOneQ', 'deepseek-api-key');
  return {
    get() { if (sessionKey) return sessionKey; try { return entry().getPassword(); } catch { return null; } },
    status() { return { configured: Boolean(this.get()), storage: sessionKey ? 'session' : 'system' }; },
    set(key, remember = true) {
      if (remember) {
        try { entry().setPassword(key); sessionKey = null; }
        catch { throw new Error('系统凭据存储不可用。可取消“记住 Key”，仅在本次运行中使用。'); }
      } else { try { entry().deletePassword(); } catch {} sessionKey = key; }
    },
    remove() { sessionKey = null; try { entry().deletePassword(); } catch (e) { if (this.get()) throw new Error('未能移除系统凭据，请重试。'); } },
  };
}
