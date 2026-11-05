import React, { useEffect, useState } from 'react';
import { DoodleOpenBox, DoodlePersonHoldingBox } from './components/doodle';

export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, '') || '/');
  useEffect(() => { const h = () => setHash(window.location.hash.replace(/^#/, '') || '/'); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return hash;
}
export const go = (path: string) => { window.location.hash = path.startsWith('/') ? path : `/${path}`; window.scrollTo({ top: 0, behavior: 'smooth' }); };

export function Logo({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  return <button className="logo" onClick={onClick || (() => go('/'))} aria-label="LunaSol 首页">
    <span className="logo-mark" aria-hidden><DoodleOpenBox style={{ width: 30, height: 28 }} /></span>
    <span className="logo-text"><span className="logo-word">LunaSol</span>{!compact && <span className="logo-sub">AI PACKAGING STUDIO</span>}</span>
  </button>;
}

const NAV = [
  { label: '首页', path: '/' }, { label: '开始创作', path: '/create' }, { label: '灵感库', path: '/inspiration' },
  { label: '包装类型', path: '/structures' }, { label: '我的作品', path: '/projects' },
];

export function Nav({ onLogin }: { onLogin: () => void }) {
  const hash = useHash();
  return <header className="nav">
    <div className="nav-inner">
      <Logo />
      <nav className="nav-links">{NAV.map((n) => <a key={n.path} href={`#${n.path}`} className={hash === n.path || (n.path !== '/' && hash.startsWith(n.path)) ? 'active' : ''}>{n.label}</a>)}</nav>
      <div className="nav-actions">
        <button className="link-btn" onClick={onLogin}>登录</button>
        <button className="btn btn-dark btn-sm" onClick={() => go('/create')}>开始设计 <span aria-hidden>↗</span></button>
      </div>
    </div>
  </header>;
}

export function Button({ variant = 'dark', size = 'md', children, className = '', ...rest }:
{ variant?: 'dark' | 'light' | 'outline' | 'ghost' | 'accent'; size?: 'sm' | 'md' | 'lg' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>{children}</button>;
}

export function SectionLabel({ children, en }: { children: React.ReactNode; en?: string }) {
  return <div className="section-label"><span className="dot" /><span>{children}</span>{en && <em>{en}</em>}</div>;
}

export function Card({ children, className = '', onClick, hover = false }: { children: React.ReactNode; className?: string; onClick?: () => void; hover?: boolean }) {
  return <div className={`card ${hover ? 'card-hover' : ''} ${className}`} onClick={onClick}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return <div className="toggle-row">
    <div><div className="toggle-label">{label}</div>{hint && <div className="toggle-hint">{hint}</div>}</div>
    <button role="switch" aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button>
  </div>;
}

export function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return <div className="stepbar">{steps.map((s, i) => <React.Fragment key={s}>
    <div className={`step ${i === current ? 'current' : ''} ${i < current ? 'done' : ''}`}><span className="step-num">{i < current ? '✓' : String(i + 1).padStart(2, '0')}</span><span>{s}</span></div>
    {i < steps.length - 1 && <div className={`step-line ${i < current ? 'done' : ''}`} />}
  </React.Fragment>)}</div>;
}

export function Empty({ title, desc, action }: { title: string; desc: string; action?: React.ReactNode }) {
  return <div className="empty"><div className="empty-mark"><DoodlePersonHoldingBox className="empty-doodle" /></div><h3>{title}</h3><p>{desc}</p>{action}</div>;
}

export function Modal({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return <div className="modal-backdrop" onClick={onClose}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="关闭">✕</button></div>
      <div className="modal-body">{children}</div>
    </div>
  </div>;
}

export function Tag({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'dark' | 'green' | 'amber' | 'red' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' | 'success' }) {
  return <div className={`notice notice-${tone}`}><span className="notice-icon">{tone === 'warn' ? '!' : tone === 'success' ? '✓' : 'i'}</span><div>{children}</div></div>;
}

export function Spinner({ label = 'AI 正在工作' }: { label?: string }) {
  return <span className="spinner-wrap"><span className="spinner" />{label}</span>;
}

export function PageHead({ kicker, title, desc, right, doodle }: { kicker?: string; title: string; desc?: string; right?: React.ReactNode; doodle?: React.ReactNode }) {
  return <div className="page-head"><div>{kicker && <div className="kicker">{kicker}</div>}<h1>{title}</h1>{desc && <p>{desc}</p>}{doodle && <div className="page-doodle-inline">{doodle}</div>}</div>{right && <div className="page-head-right">{right}</div>}</div>;
}
