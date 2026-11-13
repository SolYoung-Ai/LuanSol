import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './cloud/auth';
import { useSubscription } from './cloud/subscription';
import { useProfile } from './cloud/profile';
import { useApp, visibleProjects, visibleReplicas } from './store';
import { useLang } from './i18n';
import { applyTheme, readTheme, saveTheme, type Theme } from './theme';

export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, '') || '/');
  useEffect(() => { const h = () => setHash(window.location.hash.replace(/^#/, '') || '/'); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return hash;
}
/* 切换路由时立刻归零，不做平滑滚动：smooth 动画会和 App 里 [hash] 的
   即时归零、以及 Luna 页的 body overflow:hidden 抢滚动位置，中途会看到
   页面「抽一下」。方向感交给页面淡入过渡，不交给滚动条。 */
export const go = (path: string) => { window.location.hash = path.startsWith('/') ? path : `/${path}`; window.scrollTo(0, 0); };

export function Logo({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  const { t } = useLang();
  return <button className="logo" onClick={onClick || (() => go('/'))} aria-label={t('LunaSol 首页', 'LunaSol home')}>
    <span className="logo-word">Luna<span style={{ color: '#e8783a' }}>Sol</span></span>
    {!compact && <span className="logo-sub">{t('人人都能成为设计师', 'Anyone can be a designer')}</span>}
  </button>;
}

/** 全站唯一的顶层导航。
 *  V4.1 信息架构：左侧品牌字标，中间三个主入口，右侧「语言 / 深浅色 / 个人中心」。
 *  个人功能（登录、账号、订阅、设置、帮助）全部收进右上角的头像菜单，
 *  顶级导航不允许再出现重复的「登录」「订阅」按钮。 */
const NAV_ITEMS = [
  { zh: '开始', en: 'Start', enShort: 'Start', path: '/' },
  /* 与桌面左栏保持同名；窄屏用短标签，避免入口挤成省略号 */
  { zh: 'Luna Ai', en: 'Luna AI', enShort: 'Luna', path: '/luna' },
  { zh: '包装设计', en: 'Packaging', enShort: 'Pack', path: '/workspace' },
  { zh: '复刻设计', en: 'Recreate', enShort: 'Copy', path: '/replicate' },
];

export function Nav({ onLogin }: { onLogin: () => void }) {
  const hash = useHash();
  const auth = useAuth();
  const sub = useSubscription();
  const profile = useProfile();
  const { s } = useApp();
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  // 抽屉是固定定位的，从侧栏或页面内部改 hash 时也要收起，别让它盖在下一页上
  useEffect(() => { setMobileNavOpen(false); }, [hash]);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  };

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
    { label: t('登录 / 注册', 'Sign in / Create account'), primary: true, action: requestLogin },
    { label: t('我的工作台', 'Workspace'), path: '/workspace' },
    { label: t('账户信息', 'Account'), path: '/account' },
    { label: t('积分', 'Credits'), path: '/credits' },
    { label: t('帮助与反馈', 'Help & feedback'), path: '/help' },
  ];
  /* 个人资料与账号安全已合并成「账户信息」一页：
     资料、密码、换绑邮箱都在 /account，菜单里不再拆成两个入口。 */
  const userItems: { label: string; path?: string; action?: () => void; adminOnly?: boolean }[] = [
    { label: t('账户信息', 'Account'), path: '/account' },
    { label: t('积分', 'Credits'), path: '/credits' },
    { label: t('帮助与反馈', 'Help & feedback'), path: '/help' },
    { label: t('开发者管理', 'Developer'), path: '/admin', adminOnly: true },
  ];
  const isAdmin = auth.user?.email === 'solyoungwork@gmail.com';

  /* 桌面左栏两个场景区的移动端对应入口。手机没有常驻左栏，
     全部收进汉堡抽屉，功能不缺项；两组分开列，避免「新建」出现两次分不清。 */
  const mobileGroups: { label: string; items: { label: string; path: string; on: boolean; count?: number }[] }[] = [
    {
      label: t('包装设计', 'Packaging'),
      items: [
        { label: t('新建设计', 'New design'), path: '/new?fresh=1', on: path.startsWith('/new') },
        {
          label: t('项目', 'Projects'), path: '/workspace?tab=all',
          on: path === '/workspace' || path === '/projects', count: visibleProjects(s.projects).length,
        },
      ],
    },
    {
      label: t('复刻设计', 'Recreate'),
      items: [
        { label: t('新建复刻', 'New recreation'), path: '/replicate/new', on: path.startsWith('/replicate/') },
        {
          label: t('复刻记录', 'My recreations'), path: '/replicate',
          on: path === '/replicate', count: visibleReplicas(s.replicates).length,
        },
      ],
    },
  ];

  return <header className="v4-nav">
    <div className="v4-nav-inner">
      <div className="v4-nav-brand">
        <button className="v4-wordmark" onClick={() => go('/')} aria-label="LunaSol">
          <img className="v4-nav-logo" src="./logo.png" alt="" />
          <span className="wm-letter">L</span><span className="wm-letter">u</span><span className="wm-letter">n</span><span className="wm-letter">a</span><span className="wm-letter" style={{ color: '#e8783a' }}>S</span><span className="wm-letter" style={{ color: '#e8783a' }}>o</span><span className="wm-letter" style={{ color: '#e8783a' }}>l</span>
        </button>
        <button
          className="v4-burger"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-label={t('菜单', 'Menu')}
          aria-expanded={mobileNavOpen}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
      </div>

      {mobileNavOpen && (
        <div className="v4-mobile-nav" ref={mobileNavRef}>
          <div className="v4-mobile-nav-label">{t('导航', 'Navigate')}</div>
          {NAV_ITEMS.map((n) => (
            <button key={n.path} className={`v4-mobile-nav-item ${active(n.path) ? 'active' : ''}`} onClick={() => { setMobileNavOpen(false); go(n.path); }}>
              <span>{lang === 'en' ? n.en : n.zh}</span>
            </button>
          ))}
          {mobileGroups.map((g) => <div key={g.label}>
            <div className="v4-mobile-nav-label">{g.label}</div>
            {g.items.map((n) => (
              <button key={n.path} className={`v4-mobile-nav-item ${n.on ? 'active' : ''}`} onClick={() => { setMobileNavOpen(false); go(n.path); }}>
                <span>{n.label}</span>
                {n.count !== undefined && <em className="v4-mobile-nav-count">{n.count}</em>}
              </button>
            ))}
          </div>)}
        </div>
      )}

      <nav className="v4-nav-center" aria-label="Primary">
        {NAV_ITEMS.map((n) => <button key={n.path} className={`v4-nav-item ${active(n.path) ? 'active' : ''}`} onClick={() => go(n.path)} aria-current={active(n.path) ? 'page' : undefined}>
          {/* 窄屏放不下长标签时换成短标签，而不是把导航挤成省略号或溢出 */}
          <span className="v4-nav-label-long">{lang === 'en' ? n.en : n.zh}</span>
          <span className="v4-nav-label-short">{lang === 'en' ? n.enShort : n.zh}</span>
        </button>)}
      </nav>

      <div className="v4-nav-right" ref={menuRef}>
        {/* 语言：显示的是「点了会变成什么」，而不是当前语言，点击即切换 */}
        <button
          className="v4-icon-btn v4-lang-btn"
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          aria-label={lang === 'zh' ? '切换到英文' : 'Switch to Simplified Chinese'}
          title={lang === 'zh' ? '切换到英文' : 'Switch to Simplified Chinese'}
        >{lang === 'zh' ? 'EN' : '中'}</button>

        <button
          className="v4-icon-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? t('切换到浅色模式', 'Switch to light mode') : t('切换到深色模式', 'Switch to dark mode')}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark'
            ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6" /></svg>
            : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20 14.4A8.6 8.6 0 1 1 9.6 4a6.9 6.9 0 0 0 10.4 10.4Z" /></svg>}
        </button>

        <div className="v4-nav-user">
          {auth.user && sub.usedLeft !== null && (
            <button
              className="v4-credits-pill"
              onClick={() => go('/credits')}
              title={t('积分余额', 'Credit balance')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" style={{ verticalAlign: '-2px' }}>
                <circle cx="12" cy="12" r="11" fill="#f5c451" stroke="#d4a027" strokeWidth="1.5" />
                <text x="12" y="15.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#7a5a10" fontFamily="Arial">LS</text>
              </svg>
              {sub.usedLeft}
            </button>
          )}
          <button className={`v4-avatar-btn ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t('个人中心', 'Account menu')}>
            {auth.user
              ? (() => {
                  const cloudAvatar = profile.profile?.avatar_url || '';
                  return cloudAvatar
                    ? <img src={cloudAvatar} alt={t('头像', 'Avatar')} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    : <span className="v4-avatar">{auth.user.label.slice(0, 1).toUpperCase()}</span>;
                })()
              : <span className="v4-avatar v4-avatar-guest" aria-hidden>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="12" cy="8.2" r="3.1" />
                    <path d="M5.8 19.2c.7-3.5 3.2-5.2 6.2-5.2s5.5 1.7 6.2 5.2" />
                  </svg>
                </span>}
          </button>

          {open && <div className="v4-menu" role="menu">
            {auth.user ? <>
              <div className="v4-menu-user">
                {(() => {
                  const cloudAvatar = profile.profile?.avatar_url || '';
                  return cloudAvatar
                    ? <img src={cloudAvatar} alt={t('头像', 'Avatar')} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    : <span className="v4-avatar v4-avatar-sm">{auth.user.label.slice(0, 1).toUpperCase()}</span>;
                })()}
                <div className="v4-menu-user-text"><strong>{auth.user.label}</strong><span>{auth.user.account || t('已登录', 'Signed in')}</span></div>
              </div>
              <div className="v4-menu-sep" />
              {userItems.filter((m) => !m.adminOnly || isAdmin).map((m) => <button key={m.label} className="v4-menu-item" role="menuitem" onClick={() => go2(m.path!)}>{m.label}</button>)}
              <div className="v4-menu-sep" />
              <button className="v4-menu-item v4-menu-danger" role="menuitem" onClick={async () => { setOpen(false); await auth.signOut(); }}>{t('退出登录', 'Sign out')}</button>
            </> : <>
              <div className="v4-menu-hint">{t('未登录 · 作品只保存在本机', 'Not signed in · work saved on this device')}</div>
              <div className="v4-menu-sep" />
              {guestItems.map((m) => <button key={m.label} className={`v4-menu-item ${m.primary ? 'v4-menu-primary' : ''}`} role="menuitem" onClick={() => (m.action ? m.action() : go2(m.path!))}>{m.label}</button>)}
            </>}
          </div>}
        </div>
      </div>
    </div>
  </header>;
}

export function Button({ variant = 'dark', size = 'md', children, className = '', ...rest }:
{ variant?: 'dark' | 'light' | 'outline' | 'ghost' | 'accent'; size?: 'sm' | 'md' | 'lg' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>{children}</button>;
}

export function SectionLabel({ children, en }: { children: React.ReactNode; en?: string }) {
  // 英文界面下不再重复挂一个英文小字（原本是给中文标题配的英文注脚）
  const { lang } = useLang();
  return <div className="section-label"><span className="dot" /><span>{children}</span>{en && lang !== 'en' && <em>{en}</em>}</div>;
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
  const { t } = useLang();
  if (!open) return null;
  return <div className="modal-backdrop" onClick={onClose}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label={t('关闭', 'Close')}>✕</button></div>
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

/** 「开始设计」等尚未开放入口的统一占位弹窗：引导用户先去体验 Luna 对话 */
export function ComingSoonModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Modal open={open} title="功能开发中" onClose={onClose}>
    <p className="modal-p">
      这个入口还在加紧打磨中。你可以先去体验 <strong>Luna 对话</strong>——把你的设计想法直接告诉她，
      她会帮你梳理方向、出配色与结构建议，对话全程免费。
    </p>
    <div className="modal-buttons">
      <button className="v4-btn-line" onClick={onClose}>知道了</button>
      <button className="v4-btn-dark" onClick={() => { onClose(); go('/luna'); }}>去体验 Luna 对话</button>
    </div>
  </Modal>;
}
