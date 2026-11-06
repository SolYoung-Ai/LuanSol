import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './cloud/auth';

export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, '') || '/');
  useEffect(() => { const h = () => setHash(window.location.hash.replace(/^#/, '') || '/'); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return hash;
}
export const go = (path: string) => { window.location.hash = path.startsWith('/') ? path : `/${path}`; window.scrollTo({ top: 0, behavior: 'smooth' }); };

export function Logo({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  return <button className="logo" onClick={onClick || (() => go('/'))} aria-label="LunaSol 首页">
    <span className="logo-word">LunaSol</span>
    {!compact && <span className="logo-sub">AI PACKAGING STUDIO</span>}
  </button>;
}

export function Nav({ onLogin }: { onLogin: () => void }) {
  const hash = useHash();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const go2 = (p: string) => { setOpen(false); go(p); };
  const requestLogin = () => { setOpen(false); onLogin(); };

  const accountItems = [
    { label: '个人主页', path: '/account' },
    { label: '作品集', path: '/projects' },
    { label: '我的订阅', path: '/subscribe' },
    { label: '账号信息', path: '/settings' },
  ];

  return <header className="nav nav-min">
    <div className="nav-inner">
      <div className="nav-left">
        <Logo compact />
        <div className="nav-avatar-wrap" ref={menuRef}>
          <button className="nav-avatar-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
            {auth.user
              ? <span className="nav-avatar">{auth.user.label.slice(0, 1).toUpperCase()}</span>
              : <span className="nav-avatar nav-avatar-guest" aria-hidden>👤</span>}
            <span className="nav-avatar-name">{auth.user ? auth.user.label : '未登录'}</span>
            <span className="nav-caret" aria-hidden>▾</span>
          </button>
          {open && <div className="nav-menu" role="menu">
            {auth.user ? <>
              <div className="nav-menu-user">
                <span className="nav-avatar nav-avatar-sm">{auth.user.label.slice(0, 1).toUpperCase()}</span>
                <div><strong>{auth.user.label}</strong><span>{auth.user.account || '已登录'}</span></div>
              </div>
              <div className="nav-menu-divider" />
              {accountItems.map((m) => <button key={m.path} className="nav-menu-item" role="menuitem" onClick={() => go2(m.path)}>{m.label}</button>)}
              <div className="nav-menu-divider" />
              <button className="nav-menu-item" role="menuitem" onClick={() => go2('/inspiration')}>灵感库</button>
              <button className="nav-menu-item" role="menuitem" onClick={() => go2('/structures')}>包装类型</button>
              <div className="nav-menu-divider" />
              <button className="nav-menu-item nav-menu-danger" role="menuitem" onClick={async () => { setOpen(false); await auth.signOut(); }}>退出登录</button>
            </> : <>
              <button className="nav-menu-item nav-menu-primary" role="menuitem" onClick={requestLogin}>登录 / 注册</button>
              <div className="nav-menu-divider" />
              <button className="nav-menu-item" role="menuitem" onClick={() => go2('/inspiration')}>灵感库</button>
              <button className="nav-menu-item" role="menuitem" onClick={() => go2('/structures')}>包装类型</button>
              <button className="nav-menu-item" role="menuitem" onClick={() => go2('/projects')}>我的工作台</button>
              <button className="nav-menu-item" role="menuitem" onClick={() => go2('/subscribe')}>订阅方案</button>
            </>}
          </div>}
        </div>
      </div>
      <div className="nav-actions">
        {!auth.user && <button className="link-btn" onClick={onLogin}>登录</button>}
        <button className="btn btn-dark btn-sm" onClick={() => go('/subscribe')}>订阅 <span aria-hidden>↗</span></button>
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
  return <div className="empty"><div className="empty-mark">◇</div><h3>{title}</h3><p>{desc}</p>{action}</div>;
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

export function PageHead({ kicker, title, desc, right }: { kicker?: string; title: string; desc?: string; right?: React.ReactNode }) {
  return <div className="page-head"><div>{kicker && <div className="kicker">{kicker}</div>}<h1>{title}</h1>{desc && <p>{desc}</p>}</div>{right && <div className="page-head-right">{right}</div>}</div>;
}
