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

/** 全站唯一的顶层导航。
 *  V4 信息架构：左侧只有用户头像（唯一的个人功能入口），中间三个主入口，右侧留白。
 *  不允许再出现重复的「登录」「订阅」按钮——个人功能全部收进头像菜单。 */
const NAV_ITEMS = [
  { label: '开始', path: '/', en: 'START' },
  { label: '工作台', path: '/workspace', en: 'WORKSPACE' },
  { label: '审美市场', path: '/market', en: 'THE AESTHETIC INDEX' },
];

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
  const path = hash.split('?')[0];
  // 「开始」是一个区域而不是单页：首页、九步向导、方案、编辑器、3D、印前、导出都属于它
  const CREATE_PATHS = ['/wizard', '/review', '/create', '/brief', '/schemes', '/editor', '/preview', '/prepress', '/export'];
  const active = (p: string) => {
    if (p === '/') return path === '/' || CREATE_PATHS.some((x) => path.startsWith(x));
    return path.startsWith(p);
  };

  const guestItems: { label: string; path?: string; action?: () => void; primary?: boolean }[] = [
    { label: '登录 / 注册', primary: true, action: requestLogin },
    { label: '我的工作台', path: '/workspace' },
    { label: '账号信息', path: '/account' },
    { label: '订阅与会员', path: '/subscribe' },
    { label: '个人设置', path: '/settings' },
    { label: '帮助与反馈', path: '/help' },
  ];
  const userItems: { label: string; path?: string; action?: () => void }[] = [
    { label: '账号信息', path: '/account' },
    { label: '我的作品', path: '/workspace' },
    { label: '我的收藏', path: '/workspace?tab=favorites' },
    { label: '订阅状态', path: '/subscribe' },
    { label: '账户设置', path: '/settings' },
    { label: '帮助与反馈', path: '/help' },
  ];

  return <header className="v4-nav">
    <div className="v4-nav-inner">
      <div className="v4-nav-left" ref={menuRef}>
        <button className={`v4-avatar-btn ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="个人中心">
          {auth.user
            ? <span className="v4-avatar">{auth.user.label.slice(0, 1).toUpperCase()}</span>
            : <span className="v4-avatar v4-avatar-guest" aria-hidden>○</span>}
        </button>
        {open && <div className="v4-menu" role="menu">
          {auth.user ? <>
            <div className="v4-menu-user">
              <span className="v4-avatar v4-avatar-sm">{auth.user.label.slice(0, 1).toUpperCase()}</span>
              <div className="v4-menu-user-text"><strong>{auth.user.label}</strong><span>{auth.user.account || '已登录'}</span></div>
            </div>
            <div className="v4-menu-sep" />
            {userItems.map((m) => <button key={m.label} className="v4-menu-item" role="menuitem" onClick={() => go2(m.path!)}>{m.label}</button>)}
            <div className="v4-menu-sep" />
            <button className="v4-menu-item v4-menu-danger" role="menuitem" onClick={async () => { setOpen(false); await auth.signOut(); }}>退出登录</button>
          </> : <>
            <div className="v4-menu-hint">未登录 · 作品只保存在本机</div>
            <div className="v4-menu-sep" />
            {guestItems.map((m) => <button key={m.label} className={`v4-menu-item ${m.primary ? 'v4-menu-primary' : ''}`} role="menuitem" onClick={() => (m.action ? m.action() : go2(m.path!))}>{m.label}</button>)}
          </>}
        </div>}
      </div>

      <nav className="v4-nav-center" aria-label="主导航">
        {NAV_ITEMS.map((n) => <button key={n.path} className={`v4-nav-item ${active(n.path) ? 'active' : ''}`} onClick={() => go(n.path)} aria-current={active(n.path) ? 'page' : undefined}>
          {n.label}
        </button>)}
      </nav>

      <div className="v4-nav-right" aria-hidden />
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
