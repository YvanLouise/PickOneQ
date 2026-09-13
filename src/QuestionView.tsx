import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, CircleHelp, Clock3, ExternalLink, Flag, Lightbulb, PencilLine, RotateCcw } from 'lucide-react';
import type { Action, Attempt, Question, Snapshot } from './types';
import { DomainIcon, Spinner, dateText } from './ui';
import { useCardGesture } from './useCardGesture';
import { Conversation } from './Conversation';

type Props = { data: Snapshot; action: Action; notify: (message: string) => void; settings: () => void };
export function QuestionView({ data, action, notify, settings }: Props) {
  const { state, questions } = data;
  const q = questions.find(q => q.id === state.currentId)!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showReport, setShowReport] = useState(false);
  const requestPending = useRef(false);
  const save = state.saves[q.id] || {};
  const attempt = [...state.attempts].reverse().find(a => a.questionId === q.id);
  const today = new Date().toLocaleDateString();
  const learnedToday = questions.filter(item => state.learned[item.id] && new Date(state.learned[item.id].at).toLocaleDateString() === today);
  const perform = async (path: string, body: unknown) => {
    if (requestPending.current) return false;
    requestPending.current = true;
    setBusy(true); setError('');
    try { await action(path, body); if (path === 'next' || path === 'stage') window.scrollTo({ top: 0, behavior: 'smooth' }); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { requestPending.current = false; setBusy(false); }
  };
  const card = useCardGesture(state.stage === 'question', () => perform('next', {}));
  useEffect(() => { setError(''); setShowReport(false); }, [q.id]);
  return <>
    {state.currentKind === 'review' && <div className="context-note"><RotateCcw size={16} /> 还记得吗？试着不看解释，再回答一次。</div>}
    {state.currentKind === 'related' && <div className="context-note"><CompassMark /> 沿着好奇，再走一步 <button onClick={() => perform('next', {})}>返回混合探索</button></div>}
    <article ref={card} className={`question-card ${state.stage !== 'question' ? 'reading-card' : ''}`}>
      <div className="question-meta"><span><DomainIcon domain={q.domain} />{data.domains.find(d => d.id === q.domain)?.name}</span>
        <button className={`icon-button ${save.favorite ? 'selected' : ''}`} aria-label={save.favorite ? '取消收藏' : '收藏问题'} title={save.favorite ? '取消收藏' : '收藏问题'} onClick={() => perform('save', { id: q.id, kind: 'favorite', value: !save.favorite })}><Bookmark fill={save.favorite ? 'currentColor' : 'none'} size={23} /></button></div>
      {state.currentKind === 'explore' && <div className="explore-note">来自你尚未选择的领域</div>}
      <h1 className="question-title">{q.title}</h1>
      <p className="question-background">{q.background}</p>
      {state.stage === 'question' && <>
        <div className="primary-actions"><button className="button primary" onClick={() => perform('stage', { stage: 'answer' })} disabled={busy}><PencilLine />我来回答</button><button className="button secondary" onClick={() => perform('stage', { stage: 'learn' })} disabled={busy}><BookOpen />直接学习</button></div>
        <p className="gentle-divider"><span />先想一想，再看解释。<span /></p>
      </>}
      {state.stage === 'answer' && <AnswerForm key={q.id} q={q} data={data} action={action} settings={settings} onComplete={() => perform('stage', { stage: 'learn' })} />}
      {state.stage === 'learn' && <Explanation key={q.id} q={q} attempt={attempt} {...{ data, action, notify, settings }} onRelated={() => perform('next', { relatedTo: q.id })} />}
      {error && <div role="alert" className="inline-error">{error}</div>}
    </article>
    {state.stage === 'question' && <><section className="mobile-progress"><div><strong>▥ 今日进度</strong><small>持续拾问，积累更大的自己。</small></div><span>✓ 已拾 <b>{learnedToday.length}</b> 问</span><span>♧ 探索领域 <b>{new Set(learnedToday.map(item => item.domain)).size}</b> 个</span></section><button className="mobile-next" disabled={busy} onClick={() => perform('next', {})}>{busy ? '正在拾起下一问…' : '⌄ 下滑进入下一问'}</button></>}
    <div className="question-footer"><button className={`text-button ${save.later ? 'selected' : ''}`} onClick={async () => { await perform('save', { id: q.id, kind: 'later', value: !save.later }); }}><Clock3 size={20} />{save.later ? '已收入拾遗' : '稍后再看'}</button>
      <button className="text-button next-button" disabled={busy} onClick={() => perform('next', {})}>{busy ? <Spinner /> : <>下一问 <ArrowRight /></>}</button></div>
    <div className="question-fineprint"><span>{q.origin === 'example' ? '精选示例' : 'AI 生成 · 已通过资料核验'} · {q.difficulty} · v{q.version}</span><button className="text-button small" onClick={() => setShowReport(!showReport)}><Flag size={14} />内容反馈</button></div>
    {showReport && <div className="report-strip"><span>指出问题，帮助我们修正。</span>{['事实有误', '题意不清', '评价不合理'].map(reason => <button className="chip" key={reason} onClick={async () => { await perform('report', { id: q.id, reason }); setShowReport(false); notify('已记录反馈，这道题将暂停推荐。'); }}>{reason}</button>)}</div>}
  </>;
}
function CompassMark() { return <ArrowRight size={16} />; }

function AnswerForm({ q, data, action, settings, onComplete, mode = 'answer' }: { q: Question; data: Snapshot; action: Action; settings: () => void; onComplete: () => void; mode?: 'answer' | 'restate' }) {
  const stored = data.state.drafts[`${q.id}:${mode}`];
  const recoveryKey = `pickoneq-draft-${q.id}-${mode}`;
  const [answer, setAnswer] = useState(() => { try { return localStorage.getItem(recoveryKey) ?? stored?.answer ?? ''; } catch { return stored?.answer ?? ''; } });
  const [choiceId, setChoiceId] = useState<string | null>(() => { try { return localStorage.getItem(`${recoveryKey}-choice`) ?? stored?.choiceId ?? null; } catch { return stored?.choiceId ?? null; } });
  const [confidence, setConfidence] = useState<'guess' | 'some' | 'sure' | null>(stored?.confidence ?? null);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('草稿自动保存');
  const sequence = useRef(0);
  const submission = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    const n = ++sequence.current;
    try { localStorage.setItem(recoveryKey, answer); localStorage.setItem(`${recoveryKey}-choice`, choiceId || ''); } catch { setSaved('浏览器存储不可用，正在保存到本地服务'); }
    const timeout = window.setTimeout(() => {
      void action('draft', { id: q.id, answer, choiceId: choiceId || null, confidence, mode }).then(() => { if (sequence.current === n) setSaved('草稿已保存'); }).catch(() => { if (sequence.current === n) setSaved('本地服务保存失败，草稿仍保留在浏览器'); });
    }, 400);
    return () => clearTimeout(timeout);
  }, [answer, choiceId, confidence, q.id, action, mode, recoveryKey]);
  const submit = async () => {
    setBusy(true); setError('');
    const signature = JSON.stringify({ answer, choiceId, confidence, mode });
    if (submission.current?.signature !== signature) submission.current = { signature, id: crypto.randomUUID() };
    try { await action('answer', { id: q.id, answer, choiceId: choiceId || null, confidence, mode, requestId: submission.current.id }); onComplete(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="answer-form">
    <div className="section-label"><PencilLine size={18} />{mode === 'restate' ? '用自己的话，再解释一次' : '从你的理解开始'}<span>{saved}</span></div>
    {mode === 'answer' && q.choices && <div className="judgment-choices" role="group" aria-label="你的初步判断">{q.choices.map(c => <button key={c.id} type="button" disabled={busy} aria-pressed={choiceId === c.id} onClick={() => setChoiceId(choiceId === c.id ? null : c.id)}>{c.label}</button>)}<small className="muted">可以选一个判断，也可以直接写下自己的想法；理由可不填。</small></div>}
    <textarea autoFocus value={answer} maxLength={8000} onChange={e => setAnswer(e.target.value)} placeholder="用自己的话回答即可，不需要标准答案。哪怕只有一句猜想，也值得写下来。" aria-label={mode === 'restate' ? '重新解释' : '你的回答'} disabled={busy} />
    <div className="confidence-row"><span>你有多大把握？<small>（可不选）</small></span><div>{([['guess', '猜的'], ['some', '有些把握'], ['sure', '很确定']] as const).map(([value, label]) => <button disabled={busy} key={value} className={`chip ${confidence === value ? 'active' : ''}`} aria-pressed={confidence === value} onClick={() => setConfidence(confidence === value ? null : value)}>{label}</button>)}</div></div>
    {!data.credential.configured && <div className="soft-note"><Lightbulb size={18} /><span>当前是精选示例体验。回答会保存，配置 Key 后可获得个人反馈。<button className="inline-link" onClick={settings}>配置 DeepSeek</button></span></div>}
    {hint && <div className="hint"><Lightbulb size={18} />{q.hint}</div>}
    {error && <p role="alert" className="inline-error">{error}</p>}
    <div className="form-actions"><button className="text-button" onClick={() => setHint(!hint)}><CircleHelp size={17} />{hint ? '收起提示' : '给我一点提示'}</button><button className="button primary compact" disabled={(!answer.trim() && !choiceId) || busy} onClick={submit}>{busy ? <><Spinner />正在理解你的回答</> : <>提交回答<ArrowRight size={18} /></>}</button></div>
    <button className="text-button skip-learning" disabled={busy} onClick={async () => { try { await action('draft', { id: q.id, answer, choiceId: choiceId || null, confidence, mode }); onComplete(); } catch (e) { setError((e as Error).message); } }}><BookOpen size={17} />先看看解释</button>
  </section>;
}

function Explanation({ q, attempt, data, action, notify, settings, onRelated }: Props & { q: Question; attempt?: Attempt; onRelated: () => void }) {
  const [restate, setRestate] = useState(false);
  const [busy, setBusy] = useState(false);
  const feeling = data.state.learned[q.id]?.feeling;
  const choose = async (value: string) => {
    setBusy(true);
    try { await action('learn', { id: q.id, feeling: value }); notify(value === 'understood' ? '已记录这次学习。理解会在下一次回忆中更清晰。' : value === 'unclear' ? '已安排明天再问，也可以继续重述。' : '已安排三天后再问，可在拾遗中取消。'); }
    catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="explanation">
    {attempt && <section className="feedback"><div className="section-label"><PencilLine size={18} />最近一次作答反馈</div><blockquote>{attempt.choiceLabel && <p>你的判断：{attempt.choiceLabel}</p>}{attempt.answer || '未补充理由，本次仅评价判断。'}</blockquote><h3>{attempt.feedback.summary}</h3>
      <div className="feedback-part"><h4>你抓住了什么</h4>{attempt.feedback.captured.length ? attempt.feedback.captured.map((item, i) => <p key={i}>{item}</p>) : <p className="muted">本次暂无可可靠确认的内容。</p>}</div>
      <div className="feedback-part"><h4>需要修正什么</h4>{attempt.feedback.corrections.length ? attempt.feedback.corrections.map((item, i) => { const correction = typeof item === 'string' ? { type: 'fact', text: item } : item; return <p key={i}><span className={`feedback-kind ${correction.type}`}>{correction.type === 'fact' ? '事实错误' : '推理跳跃'}</span>{correction.text}</p>; }) : <p className="muted">本次没有指出明确错误。</p>}</div>
      <div className="feedback-part"><h4>关键补充</h4>{attempt.feedback.additions.length ? attempt.feedback.additions.map((item, i) => <p key={i}><span className="feedback-kind addition">尚未提及</span>{item}</p>) : <p className="muted">暂无影响核心理解的遗漏。</p>}</div><small>{attempt.model} · 反馈记录 {dateText(attempt.at)} · 题目 v{attempt.questionVersion}</small></section>}
    <section className="one-line"><span>一句话理解</span><p>{q.answer}</p></section>
    <section><h2>为什么会这样？</h2>{q.reasoning.map((line, i) => <div className="reason" key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{line}</p></div>)}</section>
    <section><h2>换个角度想一想</h2><p>{q.example}</p></section>
    <aside className="misconception"><Lightbulb size={22} /><div><h3>一个容易忽略的误区</h3><p>{q.misconception}</p></div></aside>
    <section className="concept-reveal"><small>你刚刚遇见的概念</small><h2>{q.concepts.join(' · ')}</h2><p>{q.conceptReveal || '用这个概念，重新理解刚才的情境。'}</p></section>
    <section className="sources"><h2>知识有出处</h2><p className="muted small-copy">解释基于以下资料。展开可核对保存的原文摘录。</p>{q.citations.map(c => { const source = data.sources.find(s => s.id === c.sourceId)!; return <details key={c.sourceId}><summary><span>{source.publisher}<strong>{source.title}</strong></span><BookOpen size={18} /></summary><blockquote lang="en">{c.quote}</blockquote><div className="source-bottom"><span>资料快照 · {new Date(source.retrievedAt).toLocaleDateString('zh-CN')}</span><a href={source.url} target="_blank" rel="noreferrer">阅读原文<ExternalLink size={14} /></a></div></details>; })}</section>
    <section className="reflection"><h3>现在，理解更清晰了吗？</h3><div className="feeling-options">{[['understood', '理解了', Check], ['unclear', '仍有疑问', CircleHelp], ['later', '以后再问', Clock3]].map(([value, label, Icon]) => { const I = Icon as typeof Check; return <button disabled={busy} className={`chip ${feeling === value ? 'active' : ''}`} key={value as string} aria-pressed={feeling === value} onClick={() => choose(value as string)}><I size={17} />{label as string}</button>; })}</div><button className="text-button" onClick={() => setRestate(!restate)}><PencilLine size={16} />{restate ? '收起重述' : '用一句话再解释，看看是否真的理解'}</button></section>
    {restate && <AnswerForm q={q} data={data} action={action} settings={settings} mode="restate" onComplete={() => setRestate(false)} />}
    <Conversation q={q} data={data} action={action} />
    <div className="chat-starters"><span className="small-copy muted">这个解释有帮助吗？（可跳过）</span>{[['helpful','有帮助'],['not-helpful','还没讲清']].map(([type,label]) => <button className="chip" key={type} onClick={() => action('event', { type, questionId: q.id }).then(() => notify('已记录你的反馈。')).catch(e => notify(e.message))}>{label}</button>)}</div>
    <button className="related-question" onClick={onRelated}><span><small>换个情境试试</small><strong>{q.relatedId ? q.relatedPrompt : '查看是否有已准备好的迁移题'}</strong></span><ArrowRight /></button>
    <button className="text-button" onClick={() => action('stage', { stage: 'answer' }).catch(e => notify(e.message))}><ArrowLeft size={16} />返回回答</button>
  </div>;
}
