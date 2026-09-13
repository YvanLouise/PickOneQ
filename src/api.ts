import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot, Action } from './types';

export function useAppData() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const token = useRef('');
  const accept = useCallback((next: Snapshot) => {
    token.current = next.csrf;
    setData(old => !old || next.state.revision >= old.state.revision ? next : { ...next, state: old.state });
  }, []);
  const refresh = useCallback(async () => {
    try { const r = await fetch('/api/bootstrap'); if (!r.ok) throw new Error('本地服务连接失败'); accept(await r.json()); }
    catch { setError('无法连接本地服务，请确认应用仍在运行。'); }
  }, [accept]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000); return () => clearInterval(timer); }, [refresh]);
  const action: Action = useCallback(async (path, body, method = 'POST') => {
    const r = await fetch(`/api/${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-PickOneQ-Token': token.current }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || '操作失败，请重试');
    if (json.state) accept(json);
    return json;
  }, [accept]);
  return { data, action, error, refresh };
}
