/* ============================================================
 * 全站左侧栏（桌面 ≥861px）
 * ------------------------------------------------------------
 * 为什么要有它：原来的顶部导航把三个入口压在中间一条细线上，
 * 1440 屏上一整行只有几个字，页面两侧全是空的（积分页、帮助页尤其明显）。
 * 现在改成常驻左栏，导航、账号、余额都收进这一列，正文区整体右移。
 *
 * 结构与 Luna 页自己的侧栏完全一致（同一套圆角玻璃卡 + 同一套内边距）：
 *   brand  —— 品牌头（logo + 名称 + 副标题）
 *   links  —— Luna / 工作台 / 审美市场
 *   slot   —— 分界线下的「场景区」，随当前导航变化：
 *              · 工作台 → 四步创作流程（可点，直接跳到对应阶段）
 *              · Luna   → 由 Luna 页自己的侧栏渲染（新建对话 / 会话列表）
 *   account—— 头像 + 昵称 + 积分 + 使用进度 + 查看计划，点开是账户菜单
 *
 * 手机端（≤860px）完全不用这套：.v4-nav 顶部条 + 抽屉保持原样，
 * 这里所有样式都写在 @media (min-width: 861px) 里。
 * ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { go, useHash } from '../ui';
import { Icon } from './icons';
import type { IconName } from './icons';
import Coin from './Coin';
import { useAuth } from '../cloud/auth';
import { useSubscription } from '../cloud/subscription';
import { useProfile } from '../cloud/profile';
import { useLang } from '../i18n';
import { useApp } from '../store';
import { applyTheme, readTheme, saveTheme, type Theme } from '../theme';
import type { WorkflowStage } from '../types';

/** 三个主入口。工作台包含设计流程的全部子路由，都算「在工作台里」。 */
const SIDE_LINKS: { zh: string; en: string; path: string; icon: IconName; match: string[] }[] = [
  // 「开始」放在最上面：两张创作入口卡都在这页，点进去就是工作台流程
  { zh: '开始', en: 'Start', path: '/start', icon: 'home', match: ['/start', '/home'] },
  { zh: 'Luna', en: 'Luna', path: '/luna', icon: 'spark', match: ['/luna'] },
  {
    zh: '工作台', en: 'Workspace', path: '/workspace', icon: 'folder',
    match: ['/workspace', '/projects', '/studio', '/new', '/project', '/structures',
      '/wizard', '/review', '/create', '/brief', '/schemes', '/editor', '/preview', '/prepress', '/export'],
  },
  { zh: '审美市场', en: 'Aesthetic Index', path: '/market', icon: 'grid', match: ['/market', '/inspiration'] },
];

/** 四步创作流程：与工作台页顶部的流程图、CreationFlow 的阶段一一对应。 */
const FLOW_STEPS: { n: string; stage: WorkflowStage; zh: string; en: string; dzh: string; den: string }[] = [
  { n: '01', stage: 'entry', zh: '创作入口', en: 'Start', dzh: '有方向 / 从零开始', den: 'Brief or scratch' },
  { n: '02', stage: 'requirements', zh: '确认需求', en: 'Requirements', dzh: '配色 · 卖点 · LOGO · 条码', den: 'Color · Copy · Logo' },
  { n: '03', stage: 'concepts', zh: '设计方案', en: 'Concepts', dzh: '生成 3 张，选一张', den: 'Pick one of three' },
  { n: '04', stage: 'editor', zh: '编辑器', en: 'Editor', dzh: '2D / 3D 精修导出', den: 'Refine & export' },
];

export function SideNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const hash = useHash();
  const { lang, t } = useLang();
  const path = hash.split('?')[0];
  return <nav className="sd-links" aria-label={t('主导航', 'Main navigation')}>
    {SIDE_LINKS.map((l) => {
      const on = l.match.some((p) => (p === '/' ? path === '/' : path.startsWith(p)));
      return <button
        key={l.path}
        className={`sd-link ${on ? 'active' : ''}`}
        onClick={() => { onNavigate?.(); go(l.path); }}
        aria-current={on ? 'page' : undefined}
        title={lang === 'en' ? l.en : l.zh}
      >
        <span className="sd-ic"><Icon name={l.icon} size={17} /></span>
        <span>{lang === 'en' ? l.en : l.zh}</span>
      </button>;
    })}
  </nav>;
}

/** 品牌行：字标 + 语言 / 深浅色。从顶部导航搬过来的两个工具按钮，位置换了但功能不变。 */
export function SideBrand() {
  const { lang, setLang, t } = useLang();
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  };
  return <div className="sd-brand">
    <button className="sd-wordmark" onClick={() => go('/')} aria-label={t('LunaSol 首页', 'LunaSol home')}>
      <img src="./logo.png" alt="" />
      <span className="sd-brand-text">
        <strong>Luna<span style={{ color: '#e8783a' }}>Sol</span></strong>
      </span>
    </button>
    <div className="sd-tools">
      <button className="sd-icon-btn" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        aria-label={lang === 'zh' ? '切换到英文' : 'Switch to Simplified Chinese'}
        title={lang === 'zh' ? '切换到英文' : 'Switch to Simplified Chinese'}>{lang === 'zh' ? 'EN' : '中'}</button>
      <button className="sd-icon-btn" onClick={toggleTheme}
        aria-label={theme === 'dark' ? t('切换到浅色模式', 'Switch to light mode') : t('切换到深色模式', 'Switch to dark mode')}
        title={theme === 'dark' ? t('浅色模式', 'Light mode') : t('深色模式', 'Dark mode')}>
        {theme === 'dark'
          ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6" /></svg>
          : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20 14.4A8.6 8.6 0 1 1 9.6 4a6.9 6.9 0 0 0 10.4 10.4Z" /></svg>}
      </button>
    </div>
  </div>;
}

/** 把历史阶段归一到四步流程里的某一步（与 CreationFlow.normalizeStage 同口径） */
function flowStageOf(project: { workflow?: { stage?: WorkflowStage }; design?: unknown } | undefined): WorkflowStage {
  const raw = project?.workflow?.stage;
  if (!raw) return 'entry';
  if (raw === 'analysis' || raw === 'planning' || raw === 'workflow') return 'requirements';
  if (raw === 'assembled') return 'editor';
  return raw;
}

/** 分界线下的场景区：当前在「工作台」时，列出四步流程，点一下直接跳到该阶段。
 *  这就是「在侧边预览每一步」——不用先进项目、不用记路由。 */
export function SideFlow({ onNavigate }: { onNavigate?: () => void }) {
  const { s, patchWorkflow, setToast } = useApp();
  const { lang, t } = useLang();
  const hash = useHash();
  const project = s.projects.find((p) => p.id === s.activeId);
  const current = flowStageOf(project);

  const jump = (stage: WorkflowStage) => {
    onNavigate?.();
    // 还没有草稿时不能假装跳过去：如实提示，并把用户带到创作入口
    if (!project || !project.workflow) {
      if (stage !== 'entry') {
        setToast(t('还没有进行中的草稿，先从「创作入口」开始',
          'No draft in progress yet — start from “Start” first.'));
      }
      go('/new');
      return;
    }
    if (stage === 'editor' && !project.design) {
      setToast(t('请先在「设计方案」里选一张，再进编辑器',
        'Pick one concept under “Concepts” before opening the editor.'));
      return;
    }
    patchWorkflow(project.id, { stage });
    go('/new');
  };

  return <div className="sd-panel">
    <div className="sd-panel-label">{lang === 'en' ? 'Workflow' : '设计流程'}</div>
    {FLOW_STEPS.map((st) => {
      const on = hash.split('?')[0] === '/new' && current === st.stage;
      return <button key={st.n} className={`sd-step ${on ? 'on' : ''}`} onClick={() => jump(st.stage)}
        aria-current={on ? 'step' : undefined}>
        <span className="sd-step-n">{st.n}</span>
        <span className="sd-step-t">
          <strong>{lang === 'en' ? st.en : st.zh}</strong>
          <em>{lang === 'en' ? st.den : st.dzh}</em>
        </span>
      </button>;
    })}
  </div>;
}

/** 头像 + 昵称 + 余额 + 用量进度，点开是账户菜单（账户信息 / 积分与充值 / 帮助 / 开发者 / 退出） */
export function SideAccount({ onLogin, syncLabel, onNavigate, compact }: {
  onLogin?: () => void;
  /** Luna 页会传「已同步到云端」这类状态，其他页不传 */
  syncLabel?: string;
  onNavigate?: () => void;
  /** 折叠成图标轨时只留头像：未登录则留一个圆形登录入口 */
  compact?: boolean;
}) {
  const auth = useAuth();
  const sub = useSubscription();
  const profile = useProfile();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const avatarUrl = profile.profile?.avatar_url || auth.user?.avatarUrl || '';
  const initial = (auth.user?.label || auth.user?.email || 'U').slice(0, 1).toUpperCase();
  const left = sub.usedLeft;
  // 百分比与「积分与充值」页同源：都取 usage（分母 = 1000 或近期充值量）
  const usage = sub.usage;
  const usedPct = usage?.pct ?? 0;

  if (!auth.user) {
    // 折叠成窄轨时，「登录 / 注册」这一整行放不下，换成一个圆形入口
    if (compact) {
      return <div className="sd-account">
        <button className="sd-acct sd-acct-login" onClick={() => { onNavigate?.(); onLogin?.(); }}
          title={t('登录 / 注册', 'Sign in')} aria-label={t('登录 / 注册', 'Sign in')}>
          <div className="sd-acct-av"><Icon name="user" size={15} /></div>
        </button>
      </div>;
    }
    return <div className="sd-account">
      <button className="sd-plan sd-plan-solid" onClick={() => { onNavigate?.(); onLogin?.(); }}>
        {t('登录 / 注册', 'Sign in')}
      </button>
    </div>;
  }

  const isAdmin = auth.user.email === 'solyoungwork@gmail.com';
  const items: { label: string; path: string; adminOnly?: boolean }[] = [
    { label: t('账户信息', 'Account'), path: '/account' },
    { label: t('积分与充值', 'Credits & Recharge'), path: '/subscribe' },
    { label: t('帮助与反馈', 'Help & feedback'), path: '/help' },
    { label: t('开发者管理', 'Developer'), path: '/admin', adminOnly: true },
  ];

  return <div className="sd-account" ref={boxRef}>
    {open && <div className="sd-menu" role="menu">
      <div className="sd-menu-head">
        <div className="sd-acct-av">{avatarUrl ? <img src={avatarUrl} alt="" /> : initial}</div>
        <div className="sd-acct-meta">
          <strong>{auth.user.label}</strong>
          <span>{auth.user.account || auth.user.email}</span>
        </div>
      </div>
      <div className="sd-menu-sep" />
      {items.filter((i) => !i.adminOnly || isAdmin).map((i) => (
        <button key={i.label} className="sd-menu-item" role="menuitem"
          onClick={() => { setOpen(false); onNavigate?.(); go(i.path); }}>{i.label}</button>
      ))}
      <div className="sd-menu-sep" />
      <button className="sd-menu-item sd-menu-danger" role="menuitem"
        onClick={async () => { setOpen(false); await auth.signOut(); }}>{t('退出登录', 'Sign out')}</button>
    </div>}

    <button className={`sd-acct ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}
      aria-haspopup="menu" aria-expanded={open}>
      <div className="sd-acct-av">{avatarUrl ? <img src={avatarUrl} alt="" /> : initial}</div>
      <div className="sd-acct-meta">
        <strong>{auth.user.label}</strong>
        <span>{syncLabel || (sub.isPro ? t('会员', 'Member') : t('免费版', 'Free'))}</span>
      </div>
      <div className="sd-acct-cr">
        <b>{left ?? '–'}</b>
        <Coin size={16} title={t('积分', 'Credits')} />
      </div>
      <Icon name={open ? 'chevronDown' : 'chevronUp'} size={13} className="sd-acct-chev" />
    </button>

    <div className="sd-usage" title={usage
      ? t(`已用 ${usage.used} / 共 ${usage.bucket} 积分`, `${usage.used} of ${usage.bucket} credits used`)
      : undefined}>
      <div className="sd-bar"><i style={{ width: `${usedPct}%` }} /></div>
      <span className="sd-usage-text">
        {usage
          ? t(`已使用 ${usedPct}%`, `${usedPct}% used`)
          : (auth.user ? t('统计中…', 'Calculating…') : t('登录后可用', 'Sign in'))}
      </span>
    </div>

    <button className="sd-plan" onClick={() => { onNavigate?.(); go('/subscribe'); }}>
      {t('查看计划', 'View plans')}
    </button>
  </div>;
}

/** 贴边的小胶囊：点一下收起 / 展开左栏（Luna 页与全站左栏共用同一颗） */
export function SideFold({ folded, onClick, label }: { folded: boolean; onClick: () => void; label?: string }) {
  const { t } = useLang();
  const text = label || (folded ? t('展开导航', 'Expand navigation') : t('收起导航', 'Collapse navigation'));
  return <button className={`sd-fold ${folded ? 'is-folded' : ''}`} onClick={onClick}
    title={text} aria-label={text} aria-expanded={!folded}>
    <Icon name={folded ? 'chevronRight' : 'chevronLeft'} size={12} />
  </button>;
}

/** 左栏收起状态：跨页面记忆，收起后正文自动向左扩展 */
const FOLD_KEY = 'lunasol_side_folded';
function readFold(): boolean {
  try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; }
}

/** 完整左栏：品牌 + 导航 + 场景区 + 账号 */
export default function SideNav({ onLogin }: { onLogin?: () => void }) {
  const hash = useHash();
  const path = hash.split('?')[0];
  const [folded, setFolded] = useState<boolean>(readFold);

  // 收起态挂在 body 上，CSS 才能同时调整卡片宽度和正文左边距
  useEffect(() => {
    document.body.classList.toggle('sd-folded', folded);
    try { localStorage.setItem(FOLD_KEY, folded ? '1' : '0'); } catch { /* 隐私模式忽略 */ }
  }, [folded]);
  useEffect(() => () => { document.body.classList.remove('sd-folded'); }, []);

  // 两类页面自带「工作区」布局，左栏会把它们的工具栏挤到换行，让位：
  //   /luna   —— 会话侧栏里已内嵌导航与账号卡
  //   /studio —— 设计流程 + 编辑器，需要整屏宽度
  if (path.startsWith('/luna') || path.startsWith('/studio')) return null;
  // 分界线下方的场景区：工作台显示四步流程；其他页面（账户/积分/帮助）留空
  const showFlow = SIDE_LINKS[2].match.some((p) => path.startsWith(p));
  return <aside className="sd-nav">
    <SideBrand />
    <SideNavLinks />
    {showFlow && <>
      <div className="sd-divider" />
      <SideFlow />
    </>}
    <div className="sd-spacer" />
    <SideAccount onLogin={onLogin} compact={folded} />
    <SideFold folded={folded} onClick={() => setFolded((f) => !f)} />
  </aside>;
}
