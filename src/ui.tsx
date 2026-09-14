import { Home, Compass, Layers3, UserRound, Orbit, Sprout, Landmark, ChartNoAxesCombined, Brain, Cpu, ArrowRight, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export const navItems = [{ id: 'home', label: '拾一问', icon: Home }, { id: 'directions', label: '方向', icon: Compass }, { id: 'saved', label: '拾遗', icon: Layers3 }, { id: 'profile', label: '我的', icon: UserRound }];
export const domainIcons = { science: Orbit, life: Sprout, history: Landmark, economics: ChartNoAxesCombined, psychology: Brain, technology: Cpu };
export function DomainIcon({ domain, size = 22 }: { domain: string; size?: number }) { const Icon = domainIcons[domain as keyof typeof domainIcons] || Compass; return <Icon size={size} strokeWidth={1.6} />; }
export function Spinner() { return <LoaderCircle size={18} className="spin" aria-label="处理中" />; }
export function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="empty"><Compass size={44} strokeWidth={1} /><h3>{title}</h3><p>{children}</p></div>; }
export function Modal({ title, children, close }: { title: string; children: ReactNode; close?: () => void }) {
  const modal = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const preferred = modal.current?.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [autofocus]');
      const first = modal.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], textarea:not(:disabled)');
      (preferred || first)?.focus();
    });
    return () => { clearTimeout(timer); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && close) close(); }}><section ref={modal} className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => {
    if (e.key === 'Escape' && close) close();
    if (e.key === 'Tab') { const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], textarea:not(:disabled)')); const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  }}>{close && <button className="icon-button close" aria-label="关闭" onClick={close}><X /></button>}<h2>{title}</h2>{children}</section></div>;
}
export function ArrowLabel({ children }: { children: ReactNode }) { return <>{children}<ArrowRight size={19} /></>; }
export const dateText = (time: number) => new Date(time).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });