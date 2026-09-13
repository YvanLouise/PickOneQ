import { useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Compass, ExternalLink, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Action, Snapshot } from './types';
import { DomainIcon, Empty, Spinner } from './ui';
import './directions.css';

type Props = { data: Snapshot; action: Action; notify: (message: string) => void; open: (id: string) => void };
const presets = [
  { name: '自由漫游', note: '不设领域偏好，跨学科遇见', weights: {} },
  { name: '理解日常', note: '心理、经济与互联网', weights: { psychology: 2, economics: 2, technology: 2 } },
  { name: '追问原理', note: '自然科学、生命与技术', weights: { science: 3, life: 2, technology: 2 } },
  { name: '看见联系', note: '历史、经济与思维', weights: { history: 2, economics: 2, psychology: 2 } },
];
export function Directions({ data, action, notify, open }: Props) {
  const preferences = data.state.preferences;
  const coverage = data.topicCoverage || {};
  const [domainQuery, setDomainQuery] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>('science');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState('');
  const [topicMessage, setTopicMessage] = useState('');
  const selected = data.domains.filter(d => preferences.weights[d.id] > 0);
  const verified = data.sources.filter(s => s.verified);
  const sourceTopics = (id: string) => coverage[id] || [];
  const matches = (value: string) => value.toLocaleLowerCase().includes(domainQuery.trim().toLocaleLowerCase());
  const domains = data.domains.filter(d => (filter !== 'selected' || preferences.weights[d.id] > 0) && (!domainQuery.trim() || [d.name, d.subtitle, ...d.keywords, ...verified.filter(s => s.domain === d.id).flatMap(s => [s.title, ...sourceTopics(s.id)])].some(matches)));
  const save = async (path: string, body: unknown, method = 'POST') => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { return await action(path, body, method); }
    catch (e) { notify((e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  };
  const change = async (weights: Record<string, number>, exploration = preferences.exploration) => { const result = await save('preferences', { weights, exploration }); if (result) setMessage('探索偏好已保存，从后续推荐开始生效。'); };
  const toggleTopic = async (topic: string) => { const followed = preferences.topics.includes(topic); const result = await save('topic', { topic }, followed ? 'DELETE' : 'POST'); if (result) setTopicMessage(followed ? `已移除主题“${topic}”。` : result.message); };
  const addTopic = async (topic = newTopic) => {
    const value = topic.trim();
    if (value.length < 2) return;
    if (preferences.topics.includes(value)) { setTopicMessage(`“${value}”已经在关注主题中。`); return; }
    const result = await save('topic', { topic: value });
    if (!result) return;
    setTopicMessage(result.message);
    if (result.covered) setNewTopic('');
  };
  const unfamiliarShare = selected.length > 0 && selected.length < data.domains.length ? preferences.exploration : 0;
  return <div className="directions-page page-content">
    <header className="page-intro"><span className="serif overline">有方向，也有意外的风景</span><h1>为好奇，选一条路。</h1><p>从感兴趣的事开始，慢慢走到还不了解的地方。</p></header>
    <section className="direction-compass"><div className="compass-symbol"><Compass size={42} strokeWidth={1} /></div><div><small>你的探索罗盘</small><h2>{selected.length ? `正在关注 ${selected.length} 个方向` : '世界很大，先随处走走'}</h2><p>{selected.length ? selected.map(d => d.name).join(' · ') : '还没有偏好的领域，将在六个方向间混合探索。'}</p></div><span className="direction-count"><b>{preferences.topics.length}</b> 个关注主题</span></section>
    <section className="direction-presets" aria-label="探索偏好组合">{presets.map(p => <button key={p.name} disabled={busy} onClick={() => change(p.weights as Record<string, number>)}><strong>{p.name}<ArrowRight size={15} /></strong><small>{p.note}</small></button>)}</section><p className="preset-note">组合会替换领域偏好，保留已关注主题与陌生领域比例。</p>
    <section className="topic-add-panel" aria-labelledby="add-topic-title">
      <div className="topic-add-heading"><span><Plus size={24} /></span><div><h2 id="add-topic-title">添加新主题</h2><p>写下一个具体的好奇，AI 会优先围绕它准备问题。</p></div></div>
      <div className="topic-add-workspace"><form className="topic-add-form" onSubmit={e => { e.preventDefault(); void addTopic(); }}><input aria-label="输入新主题" value={newTopic} maxLength={60} onChange={e => { setNewTopic(e.target.value); setTopicMessage(''); }} placeholder="例如：记忆是怎样形成的" /><button className="button primary compact" disabled={busy || newTopic.trim().length < 2}>{busy ? <Spinner /> : <Plus size={16} />}检查并添加</button></form>
        <div className="topic-suggestions"><span>可以试试</span>{['地图', '记忆', '机会成本', 'DNS', '细胞', '贸易'].map(topic => <button type="button" key={topic} disabled={busy} className={preferences.topics.includes(topic) ? 'active' : ''} onClick={() => void addTopic(topic)}>{preferences.topics.includes(topic) && <Check size={12} />}{topic}</button>)}</div>
        {topicMessage && <p className="topic-add-status" role="status">{topicMessage}</p>}<small>只添加现有可信资料覆盖的主题；超出范围时会给出明确提示，不会凭空生成内容。</small></div>
    </section>
    <div className="direction-section-title"><h2>探索六个方向</h2><span>{verified.length} 份可追溯资料</span></div>
    <div className="direction-search" role="search"><Search size={19} /><input aria-label="搜索六个方向" value={domainQuery} maxLength={60} onChange={e => setDomainQuery(e.target.value)} placeholder="筛选领域、资料或已有主题…" />{domainQuery && <button type="button" aria-label="清除搜索" onClick={() => setDomainQuery('')}><X size={16} /></button>}</div>
    <div className="direction-filters">{[['all', '全部方向'], ['selected', `已关注 ${selected.length}`]].map(([id, label]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}<span aria-live="polite">{busy ? <Spinner /> : '偏好自动保存'}</span></div>
    {message && <p className="soft-note" role="status">{message}</p>}
    {!domains.length && <Empty title={domainQuery ? '没有匹配的方向' : '还没有关注的方向'}>{domainQuery ? '换一个关键词，或清除搜索查看全部方向。' : '切回全部方向，挑一个想深入了解的领域。'}</Empty>}
    <section className="direction-domains">{domains.map(d => {
      const weight = preferences.weights[d.id] || 0;
      const sources = verified.filter(s => s.domain === d.id);
      const questions = data.questions.filter(q => q.domain === d.id && q.contentDesignVersion === 2 && !data.state.reports.some(r => r.questionId === q.id));
      const learned = questions.filter(q => data.state.learned[q.id]).length;
      const visibleSources = domainQuery.trim() && !matches(d.name) && !d.keywords.some(matches) ? sources.filter(s => [s.title, ...sourceTopics(s.id)].some(matches)) : sources;
      return <article key={d.id} className={`direction-domain ${weight ? 'followed' : ''}`}>
        <div className="direction-domain-heading"><DomainIcon domain={d.id} size={28} /><div><h3>{d.name}</h3><p>{d.subtitle}</p></div><button className={`chip ${weight ? 'active' : ''}`} aria-pressed={!!weight} disabled={busy} onClick={() => change({ ...preferences.weights, [d.id]: weight ? 0 : 2 })}>{weight ? <Check size={14} /> : <Plus size={14} />}{weight ? '已关注' : '关注'}</button></div>
        <p className="direction-domain-meta">{sources.length} 个资料专题 · {questions.length} 道可读问题{learned > 0 && ` · 已学习 ${learned} 问`}</p>
        <div className="direction-topic-preview">{sources.map(s => <span key={s.id}>{sourceTopics(s.id)[0] || s.title}</span>)}</div>
        <div className="direction-domain-controls"><label>推荐频率<select disabled={busy} aria-label={`${d.name}推荐频率`} value={weight} onChange={e => change({ ...preferences.weights, [d.id]: Number(e.target.value) })}><option value={0}>未关注</option><option value={1}>少一些</option><option value={2}>适量</option><option value={3}>多一些</option></select></label><button aria-expanded={expanded === d.id} aria-controls={`detail-${d.id}`} onClick={() => setExpanded(expanded === d.id ? null : d.id)}>主题与资料<ChevronDown size={15} className={expanded === d.id ? 'expanded' : ''} /></button></div>
        {expanded === d.id && <div className="direction-domain-detail" id={`detail-${d.id}`}><p>可探索的范围以现有摘录为准，关注主题会同时关注所属领域。</p>{visibleSources.map(source => {
          const aliases = sourceTopics(source.id);
          const topic = aliases.find(t => t.length >= 2) || source.title;
          const followed = preferences.topics.includes(topic);
          return <div className="direction-source" key={source.id}><div><h4>{aliases[0] || source.title}</h4><p>{aliases.slice(1).join(' · ') || '基础概念与理解'}</p><a href={source.url} target="_blank" rel="noreferrer">{source.publisher}<ExternalLink size={11} /></a></div><button className={`chip ${followed ? 'active' : ''}`} disabled={busy} aria-label={`${followed ? '取消关注' : '关注主题'} ${topic}`} aria-pressed={followed} onClick={() => toggleTopic(topic)}>{followed ? <Check size={14} /> : <Plus size={14} />}{followed ? '已关注' : '关注'}</button></div>;
        })}<h4 className="direction-question-label">从这些问题开始</h4>{questions.slice(0, 2).map(q => <button key={q.id} className="direction-question" onClick={() => open(q.id)}><span>{q.title}</span><ArrowRight size={16} /></button>)}{!questions.length && <p>这个方向暂时没有可读问题，配置模型后可围绕资料准备新题。</p>}</div>}
      </article>;
    })}</section>
    <section className="settings-panel direction-tuning"><div className="direction-section-title"><h2><SlidersHorizontal size={19} />给未知留一点位置</h2><strong>{Math.round(preferences.exploration * 100)}%</strong></div><p>在未关注的领域中，发现新的兴趣。</p><div className="direction-ratios">{[0, .1, .2, .3, .4, .5].map(value => <button disabled={busy} aria-pressed={preferences.exploration === value} className={preferences.exploration === value ? 'active' : ''} key={value} onClick={() => change(preferences.weights, value)}>{value * 100}%</button>)}</div><div className="direction-mix" aria-label={`推荐结构示意：陌生领域约 ${unfamiliarShare * 100}%`}>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i >= 10 - unfamiliarShare * 10 ? 'unfamiliar' : ''} />)}</div><p className="small-copy">{selected.length === 0 ? '未选方向时，跨六个领域自由探索；选择后启用陌生领域比例。' : selected.length === data.domains.length ? '你已关注全部领域，当前没有陌生领域。取消部分关注后，比例设置会生效。' : `混合探索时，约 ${Math.round((1 - unfamiliarShare) * 100)}% 来自兴趣领域，约 ${Math.round(unfamiliarShare * 100)}% 来自陌生领域。`} 配比是推荐倾向，不是每十问的固定安排；实际还取决于可用题目。</p></section>
    <section className="settings-panel"><div className="direction-section-title"><h2>留在心上的主题</h2><span>{preferences.topics.length} / 50</span></div>{preferences.topics.length ? <div className="direction-followed-topics">{preferences.topics.map(topic => <button key={topic} className="chip active" disabled={busy} aria-label={`移除主题 ${topic}`} onClick={() => void toggleTopic(topic)}>{topic}<X size={14} /></button>)}</div> : <p>还没有关注主题。使用上方独立的“添加新主题”，写下你想探索的事。</p>}<p className="small-copy muted">主题用于后续备题。移除主题不会删除学习记录，也不会取消所属领域；领域开关单独控制混合探索偏好。</p></section>
  </div>;
}
