/* ============================================================
 * 全站左侧栏（桌面 ≥861px）
 * ------------------------------------------------------------
 * 为什么要有它：原来的顶部导航把三个入口压在中间一条细线上，
 * 1440 屏上一整行只有几个字，页面两侧全是空的（积分页、帮助页尤其明显）。
 * 现在改成常驻左栏，导航、账号、余额都收进这一列，正文区整体右移。
 *
 * 结构与 Luna 页自己的侧栏完全一致（同一套圆角玻璃卡 + 同一套内边距）：
 *   brand  —— 品牌头（logo + 名称 + 副标题）
 *   links  —— 开始 / Luna Ai / 包装设计 / 复刻设计
 *   slot   —— 分界线下的「场景区」，随当前导航变化：
 *              · 包装设计 → 新建包装 / 项目
 *              · 复刻设计 → 新建复刻 / 记录 / 模型
 *              · Luna     → 会话列表（新建对话 / 搜索 / 历史）
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
import { useApp, visibleProjects, visibleReplicas } from '../store';
import { useChatStore } from '../cloud/useChatStore';
import { applyTheme, readTheme, saveTheme, type Theme } from '../theme';

/** 四个主入口。包装设计与复刻设计是两条独立的产品线，各自一套草稿箱，
 *  所以在这里是平级的两项，而不是塞在同一个「工作台」下面。 */
const SIDE_LINKS: { zh: string; en: string; path: string; icon: IconName; match: string[] }[] = [
  // 「开始」放在最上面：两张创作入口卡都在这页，点进去就是包装设计流程
  { zh: '开始', en: 'Start', path: '/start', icon: 'home', match: ['/start', '/home'] },
  { zh: 'Luna Ai', en: 'Luna AI', path: '/luna', icon: 'spark', match: ['/luna'] },
  {
    zh: '包装设计', en: 'Packaging', path: '/workspace', icon: 'folder',
    match: ['/workspace', '/projects', '/studio', '/new', '/project', '/structures',
      '/wizard', '/review', '/create', '/brief', '/schemes', '/editor', '/preview', '/prepress', '/export'],
  },
  // 复刻设计：列表页 /replicate，工作区 /replicate/new、/replicate/edit。
  // 注意不能把 '/replicate' 写进上面那条，否则点进复刻时高亮会落在「包装设计」上。
  { zh: '复刻设计', en: 'Recreate', path: '/replicate', icon: 'copy', match: ['/replicate'] },
];

/** 哪些路由算「在某个入口里」，分界线下方就展开对应场景区。 */
const matchOf = (path: string) => SIDE_LINKS.find((l) => l.path === path)!.match;
const inWorkbench = (path: string) => matchOf('/workspace').some((p) => path.startsWith(p));
const inReplicate = (path: string) => matchOf('/replicate').some((p) => path.startsWith(p));

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

/** 分界线下的「包装设计」场景区：新建包装 / 项目。
 *  包装设计与复刻设计各有各的一套动作，所以拆成两个组件而不是一个带 if 的组件：
 *  两边的按钮、计数、目标路径全都不一样，混在一起最容易点错。 */
export function SidePackaging({ onNavigate }: { onNavigate?: () => void }) {
  const { s } = useApp();
  const { lang, t } = useLang();
  const hash = useHash();
  const path = hash.split('?')[0];
  const inProjects = path === '/workspace' || path === '/projects';
  const inNew = path === '/new';

  const total = visibleProjects(s.projects).length;

  return <div className="sd-panel sd-wb">
    <div className="sd-panel-label">{lang === 'en' ? 'Packaging' : '包装设计'}</div>

    <button className={`sd-act ${inNew ? 'on' : ''}`} onClick={() => { onNavigate?.(); go('/new?fresh=1'); }}>
      <span className="sd-ic"><Icon name="plus" size={16} /></span>
      <span>{t('新建包装', 'New packaging')}</span>
    </button>

    <button className={`sd-act ${inProjects ? 'on' : ''}`} onClick={() => { onNavigate?.(); if (!inProjects) go('/workspace?tab=all'); }}>
      <span className="sd-ic"><Icon name="folder" size={16} /></span>
      <span>{t('项目', 'Projects')}</span>
      <em className="sd-act-n">{total}</em>
    </button>
  </div>;
}

/** 分界线下的「复刻设计」场景区：新建复刻 / 记录 / 模型。
 *  和包装设计一样有独立的草稿位置——复刻也是会做一半停下来的活，
 *  没有草稿箱就只能一次做完，实际用起来做不了。
 *
 *  为什么「模型」放在记录下面而不是上面：日常路径是「接着做上次那条」，
 *  模型是起步阶段才会去逛的一次性入口，放最后不会挡住高频操作。 */
export function SideRecreate({ onNavigate }: { onNavigate?: () => void }) {
  const { s } = useApp();
  const { lang, t } = useLang();
  const hash = useHash();
  const path = hash.split('?')[0];
  const inList = path === '/replicate';
  const inModels = path === '/replicate/models';
  const inNew = path.startsWith('/replicate') && !inList && !inModels;

  const total = visibleReplicas(s.replicates).length;

  return <div className="sd-panel sd-wb">
    <div className="sd-panel-label">{lang === 'en' ? 'Recreate' : '复刻设计'}</div>

    <button className={`sd-act ${inNew ? 'on' : ''}`} onClick={() => { onNavigate?.(); go('/replicate/new'); }}>
      <span className="sd-ic"><Icon name="plus" size={16} /></span>
      <span>{t('新建复刻', 'New recreation')}</span>
    </button>

    <button className={`sd-act ${inList ? 'on' : ''}`} onClick={() => { onNavigate?.(); if (!inList) go('/replicate'); }}>
      <span className="sd-ic"><Icon name="layers" size={16} /></span>
      <span>{t('记录', 'Records')}</span>
      <em className="sd-act-n">{total}</em>
    </button>

    <button className={`sd-act ${inModels ? 'on' : ''}`} onClick={() => { onNavigate?.(); if (!inModels) go('/replicate/models'); }}>
      <span className="sd-ic"><Icon name="grid" size={16} /></span>
      <span>{t('模型', 'Models')}</span>
    </button>
  </div>;
}

/** 分界线下的 Luna 会话区：新建对话 / 搜索 / 会话列表。
 *
 *  为什么放在全站左栏里，而不是 Luna 页自己再画一条侧栏：
 *  以前 /luna 是独立整屏布局，从左栏页面点进来时「全站左栏消失 + Luna 侧栏出现」，
 *  .app 的 padding-left 还要从 244px 过渡到 0，整块内容横移一下，
 *  看起来就像刷新闪了一帧。现在 Luna 与工作台共用同一条左栏，
 *  切页只是中间这段内容换掉，左栏原地不动。
 *
 *  移动端（≤860px）仍由 luna.tsx 的抽屉渲染这一份，两处同一个组件，不写第二套。 */
export function LunaChats({ onPicked }: { onPicked?: () => void }) {
  const chat = useChatStore();
  const auth = useAuth();
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  // 未登录时对话不落云端，列表必然是空的：这里如实说明，不放一个点了没反应的「新建对话」
  if (!auth.user) {
    return <div className="sd-panel sd-chats">
      <div className="lc-list-empty" style={{ marginTop: 8 }}>
        {t('登录后在这里看到对话历史', 'Sign in to see your chats here')}
      </div>
    </div>;
  }

  const list = chat.conversations.filter((c) =>
    query.trim() ? c.title.toLowerCase().includes(query.trim().toLowerCase()) : true);

  const pick = (id: string) => { chat.selectConversation(id); onPicked?.(); };
  const makeNew = () => { chat.newConversation(); onPicked?.(); };
  const commitEdit = () => {
    if (editingId && editDraft.trim()) chat.renameConversation(editingId, editDraft.trim());
    setEditingId(null);
  };

  return <div className="sd-panel sd-chats">
    <button className="lc-new" onClick={makeNew}>
      <Icon name="plus" size={16} />
      <span>{t('新建对话', 'New chat')}</span>
    </button>

    <div className="lc-search">
      <Icon name="search" size={15} />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('搜索对话', 'Search chats')} />
    </div>

    <div className="lc-group-label">{t('聊天', 'Chats')}</div>
    <div className="lc-list">
      {list.map((c) => (
        <div key={c.id} className={`lc-item ${c.id === chat.activeId ? 'active' : ''}`} onClick={() => pick(c.id)}>
          <Icon name="message" size={15} className="lc-item-ic" />
          {editingId === c.id ? (
            <input
              className="lc-item-edit"
              value={editDraft}
              autoFocus
              onChange={(e) => setEditDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
              onBlur={commitEdit}
            />
          ) : <span className="lc-item-title">{c.title}</span>}
          <div className="lc-item-ops" onClick={(e) => e.stopPropagation()}>
            <button title={t('重命名', 'Rename')} onClick={() => { setEditingId(c.id); setEditDraft(c.title); }}>
              <Icon name="edit" size={14} />
            </button>
            <button title={t('删除', 'Delete')} onClick={() => void chat.deleteConversation(c.id)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      ))}
      {list.length === 0 && <div className="lc-list-empty">{t('没有对话', 'No chats yet')}</div>}
    </div>
  </div>;
}

/** 头像 + 昵称 + 余额 + 用量进度，点开是账户菜单（账户信息 / 积分与充值 / 帮助 / 开发者 / 退出） */
export function SideAccount({ onLogin, syncLabel, onNavigate, compact }: {
  onLogin?: () => void;
  /** 同步状态只作为悬停提示（title），不再当副标题：账号卡全站统一为单行，
   *  否则切到 Luna 时卡片会突然多出一行、高度跳一下 */
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
    { label: t('积分', 'Credits'), path: '/credits' },
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
      {/* 昵称一行居中，不再挂「积分可用 / 已同步」这类副标题：
          头像、昵称、余额三者在同一中线上，视觉上是一行而不是两行 */}
      <div className="sd-acct-meta is-single" title={syncLabel || auth.user.label}>
        <strong>{auth.user.label}</strong>
      </div>
      <div className="sd-acct-cr">
        <b>{left ?? '–'}</b>
        <Coin size={16} title={t('积分', 'Credits')} />
      </div>
      <Icon name={open ? 'chevronDown' : 'chevronUp'} size={13} className="sd-acct-chev" />
    </button>

    <div className="sd-usage" title={usage
      ? t(`可用 ${usage.left} 积分 · 已用 ${usage.used} 积分`, `${usage.left} credits left · ${usage.used} used`)
      : undefined}>
      <div className="sd-bar"><i style={{ width: `${usedPct}%` }} /></div>
      <span className="sd-usage-text">
        {usage
          ? t(`已使用 ${usedPct}%`, `${usedPct}% used`)
          : (auth.user ? t('统计中…', 'Calculating…') : t('登录后可用', 'Sign in'))}
      </span>
    </div>

    <button className="sd-plan" onClick={() => { onNavigate?.(); go('/credits'); }}>
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

  // 编辑器（/studio）是整屏工作区，没有左栏可用；Luna 现在也走这条左栏，
  // 只是分界线下方的场景区换成会话列表（见 LunaChats）。
  if (path.startsWith('/studio')) return null;
  const isLuna = path.startsWith('/luna');
  // 分界线下方的场景区随入口切换：Luna → 会话列表；包装设计 → 新建/项目；复刻设计 → 新建/记录
  const isPackaging = inWorkbench(path);
  const isRecreate = inReplicate(path);
  return <aside className="sd-nav">
    <SideBrand />
    <SideNavLinks />
    {isLuna
      ? <><div className="sd-divider" /><LunaChats /></>
      : isPackaging
        ? <><div className="sd-divider" /><SidePackaging /></>
        : isRecreate
          ? <><div className="sd-divider" /><SideRecreate /></>
          : null}
    {!isLuna && <div className="sd-spacer" />}
    <SideAccount onLogin={onLogin} compact={folded} />
    <SideFold folded={folded} onClick={() => setFolded((f) => !f)} />
  </aside>;
}
