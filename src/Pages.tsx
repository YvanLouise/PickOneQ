import { useRef, useState } from 'react';
import { ArrowRight, Bookmark, Clock3, Download, KeyRound, RefreshCw, ShieldCheck, Smartphone, Trash2, Upload } from 'lucide-react';
import type { Action, Snapshot } from './types';
import { DomainIcon, Empty, Modal, Spinner, dateText } from './ui';
import { checkNativeUpdate, hasNativeUpdater, nativeVersionName } from './nativeUpdater';

type Props = { data: Snapshot; action: Action; notify: (message: string) => void };

export function Saved({ data, action, notify, open, explore }: Props & { open: (id: string) => void; explore: () => void }) {
  const [filter, setFilter] = useState('later');
  const counts = {
    later: data.questions.filter(q => data.state.saves[q.id]?.later).length,
    favorite: data.questions.filter(q => data.state.saves[q.id]?.favorite).length,
    review: data.questions.filter(q => data.state.reviews[q.id]).length,
  };
  const qlist = data.questions.filter(q => filter === 'review' ? data.state.reviews[q.id] : data.state.saves[q.id]?.[filter as 'later' | 'favorite'])
    .sort((a, b) => filter === 'review' ? data.state.reviews[a.id].due - data.state.reviews[b.id].due : 0);
  const remove = async (id: string) => {
    try {
      await action(filter === 'review' ? 'review' : 'save', filter === 'review' ? { id, action: 'cancel' } : { id, kind: filter, value: false });
      notify(filter === 'review' ? '已取消这次复习安排。' : filter === 'favorite' ? '已取消收藏。' : '已从稍后看移除。');
    } catch (e) { notify((e as Error).message); }
  };
  return <div className="page-content"><header className="page-intro"><span className="serif overline">把值得再想的问题，轻轻留下</span><h1>拾起那些未尽的好奇</h1><p>这里没有欠下的任务，只有你想再次遇见的问题。</p></header><div className="tabs" role="tablist" aria-label="拾遗分类">{[['later', '稍后看', Clock3], ['favorite', '收藏', Bookmark], ['review', '待复习', RefreshCw]].map(([id, label, Icon]) => { const I = Icon as typeof Clock3; return <button role="tab" aria-selected={filter === id} className={filter === id ? 'active' : ''} key={id as string} onClick={() => setFilter(id as string)}><I size={18} />{label as string}<span className="tab-count">{counts[id as keyof typeof counts]}</span></button>; })}</div>
    <section className="list-panel">{!qlist.length ? <div className="empty-with-action"><Empty title={filter === 'review' ? '等你想再问一次' : '为好奇留个位置'}>{filter === 'review' ? '学习后选择“以后再问”，它就会在这里等你。' : '遇见值得停留的问题，选择收藏或稍后再看。'}</Empty><button className="button secondary compact" onClick={explore}>去遇见一问<ArrowRight size={16} /></button></div> : qlist.map(q => <div className="question-row" key={q.id}><DomainIcon domain={q.domain} /><button className="row-title" onClick={() => open(q.id)}><small>{data.domains.find(d => d.id === q.domain)?.name}{filter === 'review' && ` · ${data.state.reviews[q.id].due < Date.now() ? '可以再想一想了' : `${dateText(data.state.reviews[q.id].due)}再问`}`}</small><h3>{q.title}</h3></button><button className="icon-button" aria-label={`移除${q.title}`} onClick={() => void remove(q.id)}><Trash2 size={18} /></button><button className="icon-button" aria-label={`打开${q.title}`} onClick={() => open(q.id)}><ArrowRight size={20} /></button></div>)}</section>
  </div>;
}
export function Profile({ data, action, notify, showSettings }: Props & { showSettings: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<Record<string, unknown> | null>(null);
  const [backupName, setBackupName] = useState('');
  const importInput = useRef<HTMLInputElement>(null);
  const learned = data.questions.filter(q => data.state.learned[q.id]);
  const concepts = [...new Set(learned.flatMap(q => q.concepts))];
  const nativeUpdater = hasNativeUpdater();
  const installedVersion = nativeVersionName();
  return <div className="page-content"><header className="page-intro"><span className="serif overline">一点一点，世界正在展开</span><h1>我的探索足迹</h1><p>记录遇见过的概念，也留住每一次重新理解。</p></header>
    <section className="learning-summary"><div><strong>{learned.length}</strong><span>已学习的问题</span></div><div><strong>{new Set(learned.map(q => q.domain)).size}</strong><span>走进的领域</span></div><div><strong>{data.state.attempts.length}</strong><span>获得反馈的作答</span></div></section>
    <section className="settings-panel"><h2>连接起来的概念</h2>{concepts.length ? <div className="concept-tags">{concepts.map(c => <span key={c}>{c}</span>)}</div> : <p>完成一问后，这里会留下你遇见的概念。</p>}<p className="small-copy muted">这些是探索记录，不代表学科掌握程度。</p></section>
    <section className="settings-panel model-summary"><div className="section-label"><KeyRound size={22} /><h2>模型与资料</h2><span className={`status-dot ${data.credential.configured ? 'connected' : ''}`} />{data.credential.configured ? '已连接 DeepSeek' : '精选示例模式'}</div><p>{data.credential.configured ? `${data.state.model} · ${data.credential.storage === 'system' ? 'Key 保存在系统凭据存储' : 'Key 仅在本次运行中保存'}` : '配置自己的 API Key，开启个人反馈和动态问题。'}</p>{data.credential.configured && <div className="generation-queue"><div><strong>{data.generation.ready}</strong><span>道已核验新题</span></div><div><strong>{data.generation.target}</strong><span>道目标库存</span></div><p>{data.generation.busy ? data.generation.phase === 'verifying' ? '问题与解释已经生成，正在独立核验资料和质量。' : '正在根据你的方向、主题和近期题型生成问题与完整解释。' : data.generation.needed > 0 ? data.generation.nextRetryAt > Date.now() ? `上次准备未通过，将在约 ${Math.max(1, Math.ceil((data.generation.nextRetryAt - Date.now()) / 60000))} 分钟后自动重试。` : '合格问题不足，后台将自动继续准备。' : '库存充足；每次取用或暂停问题后都会自动补充。'}</p></div>}<div className="model-actions"><button className="button secondary compact" onClick={showSettings}>模型设置<ArrowRight size={16} /></button><button className="text-button" disabled={!data.credential.configured || data.generation.busy || data.generation.nextRetryAt > Date.now()} onClick={async () => { try { await action('generate'); notify('正在生成问题与解释，通过独立核验后会自动加入问题流。'); } catch (e) { notify((e as Error).message); } }}>{data.generation.busy ? <Spinner /> : <RefreshCw size={17} />}{data.generation.busy ? data.generation.phase === 'verifying' ? '正在独立核验' : '正在生成问题' : '立即补充一道'}</button></div>{data.generation.error && <p role="status" className="inline-error">最近一次未入库：{data.generation.error}</p>}<details className="pool-details"><summary><ShieldCheck size={17} />可信资料池 · {data.sources.filter(s => s.verified).length} 份资料</summary>{data.domains.map(d => <div key={d.id}><h4>{d.name}</h4>{data.sources.filter(s => s.domain === d.id).map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.publisher} · {s.title}</a>)}</div>)}</details></section>
    <section className="settings-panel software-update"><div className="section-label"><Smartphone size={20} /><h2>软件更新</h2><span>{nativeUpdater ? installedVersion ? '当前版本 ' + installedVersion : 'Android 安装版' : '网页模式'}</span></div><div className="software-update__body"><div><strong>{nativeUpdater ? '保持拾一问为最新版本' : '安装版支持应用内更新'}</strong><p>{nativeUpdater ? '从官方发布清单检查新版本；下载完成后会校验安装包，再交给系统安装。' : '请在拾一问 Android 安装版中使用检查更新。当前网页内容会随服务端版本更新。'}</p></div><button className="button secondary compact" type="button" disabled={!nativeUpdater} onClick={checkNativeUpdate}><RefreshCw size={17} />{nativeUpdater ? '检查更新' : '仅安装版可用'}</button></div></section>
    <section className="settings-panel"><h2>本地数据</h2><p>学习记录保存在这台电脑。备份包含生成题、学习记录和已发送的对话，不包含 API Key。</p><div className="model-actions"><button className="button secondary compact" disabled={busy} onClick={async () => { setBusy(true); try { const value = await action('export'); const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `拾一问备份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); notify('备份已导出。'); } catch (e) { notify((e as Error).message); } finally { setBusy(false); } }}><Download size={17} />导出备份</button><button className="text-button" disabled={busy} onClick={() => importInput.current?.click()}><Upload size={16} />恢复备份</button><input ref={importInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (file.size > 32_000_000) return notify('备份文件超过 32 MB，无法导入。'); try { const value = JSON.parse(await file.text()); setBackup(value); setBackupName(file.name); } catch { notify('无法读取这个 JSON 备份。'); } }} /><button className="text-button danger" onClick={() => setConfirmDelete(true)}><Trash2 size={16} />清空学习记录</button></div></section>
    {backup && <Modal title="恢复本地备份" close={() => setBackup(null)}><p>将用“{backupName}”中的学习记录、偏好和生成题替换当前本地数据。API Key 保留。建议先导出当前备份。</p><label className="field-label">输入“恢复备份”确认<input autoFocus value={confirm} onChange={e => setConfirm(e.target.value)} /></label><button disabled={confirm !== '恢复备份' || busy} className="button primary full" onClick={async () => { setBusy(true); try { await action('import', { backup, confirm }); for (const key of Object.keys(localStorage)) if ((key.startsWith('pickoneq-draft-') || key.startsWith('pickoneq-chat-'))) localStorage.removeItem(key); setBackup(null); setConfirm(''); notify('备份已恢复。'); } catch (e) { notify((e as Error).message); } finally { setBusy(false); } }}>确认恢复</button></Modal>}
    {confirmDelete && <Modal title="清空本地学习记录" close={() => setConfirmDelete(false)}><p>这将删除学习记录、生成题目和偏好，系统凭据中的 Key 保留。建议先导出备份。</p><label className="field-label">输入“清空学习记录”确认<input autoFocus value={confirm} onChange={e => setConfirm(e.target.value)} /></label><button disabled={confirm !== '清空学习记录' || busy} className="button danger-button" onClick={async () => { setBusy(true); try { await action('data', { confirm }, 'DELETE'); for (const key of Object.keys(localStorage)) if ((key.startsWith('pickoneq-draft-') || key.startsWith('pickoneq-chat-'))) localStorage.removeItem(key); setConfirmDelete(false); notify('学习记录已清空。'); } catch (e) { notify((e as Error).message); } finally { setBusy(false); } }}>确认清空</button></Modal>}
  </div>;
}

export function KeySettings({ data, action, done, first = false }: { data: Snapshot; action: Action; done: () => void; first?: boolean }) {
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(true);
  const [model, setModel] = useState(data.state.model);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <><div className="setup-icon"><KeyRound size={28} strokeWidth={1.5} /></div><p>{first ? '带着一个问题，开始探索。配置你的 DeepSeek Key，即可获得针对自己回答的反馈。' : '使用你自己的 DeepSeek API Key，费用由模型服务商向你的账户收取。'}</p>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await action('credentials', { key, remember, model }); setKey(''); done(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
      <label className="field-label">API Key<input autoFocus type="password" autoComplete="off" placeholder={data.credential.configured ? '输入新 Key 以更换' : '在本机输入你的 API Key'} value={key} onChange={e => setKey(e.target.value)} disabled={busy} /></label>
      <label className="field-label">DeepSeek 模型<select value={model} onChange={e => setModel(e.target.value)} disabled={busy}><option value="deepseek-flash">DeepSeek Flash</option><option value="deepseek-v4-pro">DeepSeek V4 Pro</option></select></label>
      <label className="checkbox-label"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />在系统凭据存储中记住 Key</label>
      <div className="soft-note"><ShieldCheck size={19} /><span>生成或评价时，相关资料和本次回答会发送给 DeepSeek。Key 不保存在浏览器或学习记录中。不勾选记住时，仅在本次服务运行中保存。</span></div>
      <p className="small-copy muted">连接测试会发起一次小请求。进入应用后会提前备题，每道候选题包含生成与核验两次调用；本次运行自动尝试最多 6 道。</p>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <button className="button primary full" disabled={key.trim().length < 8 || busy}>{busy ? <><Spinner />正在验证连接</> : '验证并保存'}</button>
    </form>
    {first && <button className="text-button demo-button" disabled={busy} onClick={done}>先体验精选示例<ArrowRight size={17} /></button>}
    {!first && data.credential.configured && <button className="text-button danger demo-button" disabled={busy} onClick={async () => { setBusy(true); try { await action('credentials', undefined, 'DELETE'); done(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>移除已保存的 Key</button>}
  </>;
}
