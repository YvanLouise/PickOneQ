import { useEffect, useRef, useState } from 'react';
import type { Action, Question, Snapshot } from './types';
import './conversation.css';

export function Conversation({ q, data, action, settings }: { q: Question; data: Snapshot; action: Action; settings: () => void }) {
  const [opened, setOpened] = useState(false);
  const key = `pickoneq-chat-${q.id}-${q.version}`;
  const [input, setInput] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const pending = useRef(false);
  const request = useRef<{ id: string; message: string } | null>(null);
  const session = Object.values(data.state.conversations || {}).find(s => s.questionId === q.id && s.questionVersion === q.version);
  const active = session?.turns.some(t => ['generating', 'verifying'].includes(t.status));
  useEffect(() => { try { localStorage.setItem(key, input); } catch { /* Server keeps submitted messages. */ } }, [input, key]);
  useEffect(() => {
    if (!opened || !active || !session) return;
    const timer = window.setInterval(() => { void action(`conversation/${session.id}`, undefined, 'GET').catch(e => setError(e.message)); }, 1200);
    return () => clearInterval(timer);
  }, [opened, active, session?.id, action]);
  const open = async () => {
    try { await action('conversation', { questionId: q.id }); setOpened(true); } catch (e) { setError((e as Error).message); }
  };
  const send = async (message: string, retryId?: string) => {
    if (!session || pending.current || !message.trim()) return;
    pending.current = true; setSending(true); setError('');
    if (!request.current || request.current.message !== message) request.current = { id: crypto.randomUUID(), message };
    try {
      await action(`conversation/${session.id}/message`, { message, requestId: retryId || request.current.id, retry: !!retryId });
      if (!retryId) setInput(''); request.current = null;
    } catch (e) { setError((e as Error).message); }
    finally { pending.current = false; setSending(false); }
  };
  return <section className="conversation">
    <div className="conversation-heading"><div><small>沿着这一问，继续走</small><h2>把没想通的，聊明白。</h2></div><button className="text-button" onClick={() => opened ? setOpened(false) : void open()}>{opened ? '收起对话' : session?.turns.length ? '继续上次对话' : '继续聊这一问'}</button></div>
    {opened && <>
      <p className="small-copy muted">本轮文字与必要上下文会发送给 DeepSeek，通常需要生成和核验两次请求。回复通过核验后展示；对话不会自动安排复习。</p>
      {!data.credential.configured && <div className="soft-note"><span>配置 DeepSeek 后即可围绕当前问题继续追问。</span><button className="inline-link" onClick={settings}>前往配置</button></div>}
      {session && session.turns.filter(t => t.status === 'complete').length > 6 && <p className="soft-note">长对话以最近六轮为主要上下文，较早内容会整理为摘要；必要时请补充你所指的条件。</p>}
      <div className="chat-turns" aria-live="polite">{session?.turns.map(t => <article className="chat-turn" key={t.id}><p className="chat-user">{t.user}</p>{t.status === 'complete' ? <div className="chat-reply"><p>{t.reply}</p>{t.followup && <p className="chat-followup">{t.followup}</p>}{!!t.evidence?.length && <details><summary>本轮依据 · {t.evidence.length} 条</summary>{t.evidence.map((e, i) => <blockquote key={i}><strong>{data.sources.find(s => s.id === e.sourceId)?.publisher}</strong><p>{e.quote}</p></blockquote>)}</details>}</div> : ['failed', 'cancelled'].includes(t.status) ? <div className="inline-error">{t.error}<button className="text-button" disabled={!!active || sending} onClick={() => send(t.user, t.id)}>重试本轮</button></div> : <p role="status">{t.status === 'generating' ? '正在理解你的问题…' : '正在核对资料与回复…'}</p>}</article>)}</div>
      <div className="chat-starters">{['这一步没想通', '换个例子', '如果条件变了呢'].map(text => <button className="chip" key={text} disabled={!!active} onClick={() => setInput(text)}>{text}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); void send(input); }}><label htmlFor={`chat-${q.id}`}>你还想弄清什么？</label><textarea id={`chat-${q.id}`} value={input} maxLength={8000} onChange={e => setInput(e.target.value)} placeholder="可以追问原因，也可以试着换一个条件。" /><div className="form-actions"><small className="muted">输入保存在本机 · {input.length}/8000</small>{active ? <button type="button" className="button secondary compact" onClick={() => action(`conversation/${session!.id}/cancel`).catch(e => setError(e.message))}>停止等待</button> : data.credential.configured ? <button className="button primary compact" disabled={sending || !input.trim()}>{sending ? '正在发送…' : '发送问题'}</button> : <button type="button" className="button secondary compact" onClick={settings}>配置模型</button>}</div></form>
    </>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}