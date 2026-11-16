/* ============================================================
   全站唯一的顶部导航
   ------------------------------------------------------------
   版式参考 B.AI：字标贴最左，导航项紧跟字标右侧（左对齐，不再居中），
   右侧只放账户动作。这样宽屏上眼睛从左往右读，不会被中间一块空白劈开。
   顺序：首页 / 产品⌄ / Luna AI / 关于。
   「产品」是下拉：包装设计（介绍页）、复刻设计（按参考图出稿）。
   左边栏（开始 / Luna AI / 包装设计 / 复刻设计）已经整块撤掉，
   入口全部收到这条导航与账户菜单里，所以这里必须能到达每个真实页面。
   账户菜单只做「余额 / 账户 / 帮助 / 退出」。
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../cloud/auth';
import { useSubscription } from '../cloud/subscription';
import { useProfile } from '../cloud/profile';
import { go, useHash } from '../ui';
import { useLang } from '../i18n';

/** 产品下拉里的条目。
 *  复刻设计原来只挂在左侧栏，侧栏撤掉之后必须在这里给一个真实入口。 */
const PRODUCT_MENU = [
  { zh: '包装设计', en: 'Packaging design', desc: '从想法到可印刷的刀版', descEn: 'From idea to a print-ready dieline', path: '/product' },
  { zh: '复刻设计', en: 'Replicate', desc: '按参考图一比一出稿', descEn: 'Reproduce a reference pack exactly', path: '/replicate' },
];

/** 字标：导航里只留 LunaSol（顶部 72px 内加一行 9px 副标会变成噪点），
 *  页脚空间宽裕时才带副标。 */
export function SiteLogo({ onClick, sub = false }: { onClick?: () => void; sub?: boolean }) {
  const { t } = useLang();
  return <button className="site-logo" onClick={onClick || (() => go('/'))} aria-label={t('LunaSol 首页', 'LunaSol home')}>
    <b>Luna<i>Sol</i></b>
    {sub && <span>{t('人人都能成为设计师', 'Everyone can be a designer')}</span>}
  </button>;
}

export default function SiteNav({ onLogin }: { onLogin: () => void }) {
  const hash = useHash();
  const auth = useAuth();
  const sub = useSubscription();
  const { profile } = useProfile();
  const { lang, setLang, t } = useLang();
  const [stuck, setStuck] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [drop, setDrop] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const path = hash.split('?')[0];

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);

  // 产品下拉：点开之后点空白或 Esc 都要收起（桌面悬停走下面的 enter/leave）
  useEffect(() => {
    if (!drop) return;
    const away = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDrop(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrop(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [drop]);

  // 换路由关掉所有浮层，否则从菜单里跳页后菜单还挂在那儿
  useEffect(() => { setMenu(false); setSheet(false); setDrop(false); }, [path]);

  // 桌面悬停即展开：鼠标移开留 120ms 宽限，避免斜着划过时闪断
  const openDrop = () => {
    window.clearTimeout(hoverTimer.current);
    setDrop(true);
  };
  const closeDropSoon = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setDrop(false), 120);
  };
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const user = auth.user;
  const credits = sub.usedLeft;
  // 昵称在 auth.user.label（CloudBase user_metadata），头像先看资料表再看 metadata
  const name = user?.label || '';
  const avatar = profile?.avatar_url || user?.avatarUrl || '';

  return <>
    <nav className={`site-nav ${stuck ? 'is-stuck' : ''}`} aria-label={t('主导航', 'Main')}>
      <div className="site-wrap site-nav-in">
        <SiteLogo />

        <div className="site-links">
          <button
            className={`site-link ${path === '/' ? 'is-on' : ''}`}
            onClick={() => go('/')}
            aria-current={path === '/' ? 'page' : undefined}
          >{t('首页', 'Home')}</button>

          <div
            className="site-drop-wrap"
            ref={dropRef}
            onMouseEnter={openDrop}
            onMouseLeave={closeDropSoon}
          >
            <button
              className={`site-link site-drop-btn ${path === '/product' ? 'is-on' : ''} ${drop ? 'is-open' : ''}`}
              onClick={() => setDrop((v) => !v)}
              aria-expanded={drop}
              aria-haspopup="menu"
            >
              {t('产品', 'Product')}
              <svg className="site-link-caret" viewBox="0 0 12 12" aria-hidden>
                <path d="M3 4.6 6 7.6 9 4.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {drop && <div className="site-drop" role="menu">
              {PRODUCT_MENU.map((m) => <button
                key={m.path}
                className="site-drop-item"
                role="menuitem"
                onClick={() => { setDrop(false); go(m.path); }}
              >
                <b>{t(m.zh, m.en)}</b>
                <span>{t(m.desc, m.descEn)}</span>
              </button>)}
            </div>}
          </div>

          <button
            className={`site-link ${path.startsWith('/luna') ? 'is-on' : ''}`}
            onClick={() => go('/luna')}
            aria-current={path.startsWith('/luna') ? 'page' : undefined}
          >Luna AI</button>

          <button
            className={`site-link ${path === '/about' ? 'is-on' : ''}`}
            onClick={() => go('/about')}
            aria-current={path === '/about' ? 'page' : undefined}
          >{t('关于', 'About')}</button>
        </div>

        <div className="site-actions" ref={menuRef}>
          {/* 不等 auth.ready：云端会话恢复在冷启动时可能要几秒，
              期间右侧空白会让人以为「没有登录入口」。
              已登录用户会短暂看到「登录」再换成头像，比空着可接受。
              注意 onClick 必须包一层：直接挂 onLogin 会把 MouseEvent 当参数传进去。 */}
          {!user && <button className="site-login" onClick={() => onLogin()}>{t('登录', 'Log in')}</button>}

          {user && <>
            <button
              className="site-user"
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              aria-haspopup="menu"
            >
              <span className="site-user-av">
                {avatar ? <img src={avatar} alt="" /> : (name || 'L').slice(0, 1).toUpperCase()}
              </span>
              <span className="site-user-credits">{credits === null ? '—' : credits}</span>
              <svg className="site-user-caret" viewBox="0 0 12 12" aria-hidden>
                <path d="M3 4.6 6 7.6 9 4.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {menu && <div className="site-menu" role="menu">
              <div className="site-menu-head">
                <div className="site-menu-name">{name || t('已登录', 'Signed in')}</div>
                <div className="site-menu-mail">{user.email || user.account || ''}</div>
                <div className="site-menu-bal">
                  <b>{credits === null ? '—' : credits}</b>
                  <span>{t('积分可用', 'credits')}</span>
                </div>
              </div>
              <button className="site-menu-item" role="menuitem" onClick={() => go('/credits')}>
                {t('积分与充值', 'Credits')} <em>→</em>
              </button>
              <button className="site-menu-item" role="menuitem" onClick={() => go('/account')}>
                {t('账户设置', 'Account')} <em>→</em>
              </button>
              <button className="site-menu-item" role="menuitem" onClick={() => go('/help')}>
                {t('帮助与反馈', 'Help')} <em>→</em>
              </button>
              <button
                className="site-menu-item is-danger"
                role="menuitem"
                onClick={async () => { setMenu(false); await auth.signOut(); go('/'); }}
              >{t('退出登录', 'Log out')}</button>
            </div>}
          </>}

          {!user && <button className="site-lang" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} aria-label={t('切换语言', 'Switch language')}>
            {lang === 'zh' ? 'EN' : '中'}
          </button>}

          <button
            className="site-burger"
            aria-expanded={sheet}
            aria-label={t('菜单', 'Menu')}
            onClick={() => setSheet((v) => !v)}
          ><i /></button>
        </div>
      </div>
    </nav>

    {sheet && <div className="site-sheet">
      <button className="site-sheet-link" onClick={() => go('/')}>
        {t('首页', 'Home')}<span>→</span>
      </button>
      {/* 手机上不做二级浮层：产品菜单只有一条，直接摊平成「产品 / 包装设计」两级行 */}
      <button className="site-sheet-link" onClick={() => go('/product')}>
        {t('产品', 'Product')}<span>→</span>
      </button>
      <button className="site-sheet-link is-sub" onClick={() => go('/product')}>
        {t('包装设计', 'Packaging design')}<span>→</span>
      </button>
      <button className="site-sheet-link is-sub" onClick={() => go('/replicate')}>
        {t('复刻设计', 'Replicate')}<span>→</span>
      </button>
      <button className="site-sheet-link" onClick={() => go('/luna')}>
        Luna AI<span>→</span>
      </button>
      <button className="site-sheet-link" onClick={() => go('/about')}>
        {t('关于', 'About')}<span>→</span>
      </button>
      {user
        ? <>
          <button className="site-sheet-link" onClick={() => go('/credits')}>
            {t('积分与充值', 'Credits')}<span>{credits === null ? '—' : credits}</span>
          </button>
          <button className="site-sheet-link" onClick={() => go('/account')}>
            {t('账户设置', 'Account')}<span>→</span>
          </button>
          <button className="site-sheet-link" onClick={async () => { setSheet(false); await auth.signOut(); go('/'); }}>
            {t('退出登录', 'Log out')}<span>→</span>
          </button>
        </>
        : <button className="site-sheet-link" onClick={() => { setSheet(false); onLogin(); }}>
          {t('登录 / 注册', 'Log in')}<span>→</span>
        </button>}
      <div className="site-sheet-foot">
        <span>LunaSol © 2026</span>
        <button className="site-lang" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
          {lang === 'zh' ? 'EN' : '中文'}
        </button>
      </div>
    </div>}
  </>;
}
