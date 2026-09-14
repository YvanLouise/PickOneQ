import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot, Action } from './types';

export function useAppData() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const token = useRef('');
  const accept = useCallback((next: Snapshot) => {
    token.current = next.csrf;
    setData(old => !old || next.state.revision >= old.state.revision ? next : { ...next, state: old.state });
    setError('');
    setConnection('online');
    setLastSyncAt(Date.now());
  }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/bootstrap');
      if (!r.ok) throw new Error('本地服务连接失败');
      accept(await r.json());
    } catch {
      setConnection('offline');
      setError('无法连接本地服务，请确认应用仍在运行。');
    }
  }, [accept]);
  useEffect(() => {
    void refresh();
    const reconnect = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(reconnect, 15000);
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);
    document.addEventListener('visibilitychange', reconnect);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', reconnect);
      document.removeEventListener('visibilitychange', reconnect);
    };
  }, [refresh]);
  const action: Action = useCallback(async (path, body, method = 'POST') => {
    try {
      const r = await fetch(`/api/${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-PickOneQ-Token': token.current }, body: body === undefined ? undefined : JSON.stringify(body) });
      const raw = await r.text();
      const json = raw ? JSON.parse(raw) : {};
      if (!r.ok) throw new Error(json.error || '操作失败，请重试');
      if (json.state) accept(json);
      else { setConnection('online'); setError(''); setLastSyncAt(Date.now()); }
      return json;
    } catch (cause) {
      if (cause instanceof Error && !(cause instanceof TypeError) && !(cause instanceof SyntaxError)) throw cause;
      setConnection('offline');
      setError('本地服务暂时不可用，当前页面和输入已保留。');
      throw new Error('本地服务暂时不可用，当前页面和输入已保留，重新连接后可以继续。');
    }
  }, [accept]);
  return { data, action, error, refresh, connection, lastSyncAt };
}