import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Check, Compass, Mountain, Sparkles } from 'lucide-react';
import { useAppData } from './api';
import { navItems, Modal, Spinner } from './ui';
import { QuestionView } from './QuestionView';
import { KeySettings, Profile, Saved } from './Pages';
import { Directions } from './Directions';

export default function App() {
  const { data, action, error, refresh } = useAppData();
  const [page, setPage] = useState('home');
  const [settings, setSettings] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [toast, setToast] = useState('');
  const [splash, setSplash] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => { const timer = window.setTimeout(() => setSplash(false), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 200 : 2100); return () => clearTimeout(timer); }, []);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  if (!data) return <div className="loading-screen"><Mountain size={44} /><h1>拾一问</h1>{error ? <><p>{error}</p><button className="button primary" onClick={refresh}>重新连接</button></> : <Spinner />}</div>;
  const onboardingStep = setupStep === 0 && data.credential.configured ? 1 : setupStep;
  const open = async (id: string) => { try { await action('open', { id }); setPage('home'); window.scrollTo(0, 0); } catch (e) { setToast((e as Error).message); } };
  const props = { data, action, notify: setToast };
  return <div className={`app-shell ${page === 'home' && data.state.stage === 'question' ? 'mobile-discovery' : ''}`}>
    {splash && <div className="launch-screen" role="status" aria-label="拾一问，正在开启探索"><div className="launch-halo" /><img src="/app-icon.png" alt="拾一问图标" /><h1>拾一问</h1><p>一个问题，打开更大的世界</p><button onClick={() => setSplash(false)}>跳过</button></div>}
    <header className="mobile-hero"><div><h1>拾一问</h1><span>PickOneQ</span><p>好奇一问，<br />让世界更大一点。</p></div><aside>一个问题<br />打开更大的世界<br />—</aside></header>
    <aside className="sidebar"><a href="#" className="brand" onClick={e => { e.preventDefault(); setPage('home'); }}><Mountain className="brand-mark" strokeWidth={1.1} /><span>拾一问<small>PickOneQ</small></span></a><nav aria-label="主导航">{navItems.map(({ id, label, icon: Icon }) => <button className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} key={id} onClick={() => setPage(id)}><Icon strokeWidth={1.6} fill={id === 'home' && page === id ? 'currentColor' : 'none'} /><span>{label}</span></button>)}</nav><div className="sidebar-poem">好奇一问，<br />让世界更大一点。<i /></div></aside>
    <main className="main"><header className="topbar"><div><h2>{page === 'home' ? '自由探索' : page === 'directions' ? '我的方向' : page === 'saved' ? '拾遗' : '我的世界'}</h2><p>在好奇中，遇见更大的世界。</p></div><button className="mode-indicator" onClick={() => setSettings(true)}>{data.credential.configured ? <Sparkles size={21} /> : <BookOpen size={21} />}<span>{data.credential.configured ? data.generation.busy ? '正在准备新问题' : '好奇，正在生长' : '精选示例'}<small>{data.credential.configured ? data.generation.busy ? data.generation.phase === 'verifying' ? '正在独立核验' : '正在生成问题与解释' : `已有 ${data.generation.ready} 道 AI 新题` : '从一个问题开始'}<ArrowRight size={13} /></small></span></button></header>
      <div className="main-inner">{page === 'home' ? <QuestionView {...props} settings={() => setSettings(true)} /> : page === 'directions' ? <Directions {...props} open={open} /> : page === 'saved' ? <Saved {...props} open={open} /> : <Profile {...props} showSettings={() => setSettings(true)} />}</div>
      <footer className="site-footer">山外有山，问题之外，还有更大的世界。</footer>
    </main>
    {!data.state.onboarding && <Modal title={onboardingStep === 0 ? '欢迎来到拾一问' : '先选几个好奇的方向'}>{onboardingStep === 0 ? <KeySettings {...{ data, action }} first done={() => setSetupStep(1)} /> : <><p>可以多选，也可以直接开始，在不同领域间自由探索。</p><div className="onboarding-domains">{data.domains.map(d => <button key={d.id} className={`chip ${data.state.preferences.weights[d.id] ? 'active' : ''}`} onClick={() => action('preferences', { weights: { ...data.state.preferences.weights, [d.id]: data.state.preferences.weights[d.id] ? 0 : 2 }, exploration: 0.2 }).catch(e => setToast(e.message))}>{data.state.preferences.weights[d.id] ? <Check size={15} /> : <Compass size={15} />}{d.name}</button>)}</div><button autoFocus className="button primary full" onClick={() => action('onboarding').catch(e => setToast(e.message))}>拾起第一问<ArrowRight size={18} /></button></>}</Modal>}
    {settings && data.state.onboarding && <Modal title="模型设置" close={() => setSettings(false)}><KeySettings {...{ data, action }} done={() => setSettings(false)} /></Modal>}
    {data.storageNotice && <div className="toast storage-notice" role="alert"><span>{data.storageNotice}</span><button aria-label="关闭数据恢复提示" onClick={() => action('notice').catch(e => setToast(e.message))}>知道了</button></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}
