/* ============================================================
   全站唯一的顶部导航
   ------------------------------------------------------------
   版式参考 B.AI：字标贴最左，导航项紧跟字标右侧（左对齐，不再居中），
   右侧只放账户动作。这样宽屏上眼睛从左往右读，不会被中间一块空白劈开。
   顺序：首页 / 产品⌄ / Luna AI / 关于。
   「产品」本身不跳页，只是悬停/点击展开一张卡，里面现在只有「包装工作台」
   （就是 /studio）。留这一层是为了以后加别的产品线时不用再动导航结构。
   复刻设计整条产品线已下线（2026-11-17），老链接由 App 的路由兜到底，不做 404。
   账户菜单只做「余额 / 账户 / 帮助 / 退出」；
   管理员（PRICING.adminEmail）多一项「生成兑换码」，直通 /admin。
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../cloud/auth';
import { useSubscription } from '../cloud/subscription';
import { useProfile } from '../cloud/profile';
import { PRICING } from '../cloud/plans';
import { go, useHash } from '../ui';
import { useLang } from '../i18n';

/** 悬停即预热工作台的 chunk：点下去时组件已经在内存里，不再等一次下载。
 *  只在第一次真的 hover 时取，失败也无所谓（点下去还有一次正常加载）。 */
let studioWarmed = false;
function warmStudio() {
  if (studioWarmed) return;
  studioWarmed = true;
  void import('../studio/StudioPage').catch(() => { studioWarmed = false; });
}

/** 字标：导航里只留 LunaSol（顶部 72px 内加一行 9px 副标会变成噪点），
 *  页脚空间宽裕时才带副标。 */
export function SiteLogo({ onClick, sub = false }: { onClick?: () => void; sub?: boolean }) {
  const { t } = useLang();
  return <button className="site-logo" onClick={onClick || (() => go('/'))} aria-label={t('LunaSol 首页', 'LunaSol home')}>
    {/* 新标志：橙圆压黑圆。纯几何，跟标签页图标同一套坐标，放大缩小都不糊 */}
    <svg className="site-logo-mark" viewBox="0 0 64 64" aria-hidden>
      <circle cx="37" cy="35" r="21.5" fill="#161616" />
      <circle cx="27" cy="29" r="21.5" fill="#F47735" />
    </svg>
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
  /* 产品下拉：悬停展开，离开 160ms 收回，触屏点一下就切换 */
  const [prod, setProd] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const prodRef = useRef<HTMLDivElement>(null);
  const prodTimer = useRef(0);
  const openProd = () => {
    if (prodTimer.current) { window.clearTimeout(prodTimer.current); prodTimer.current = 0; }
    setProd(true);
    warmStudio();
  };
  const closeProd = () => {
    if (prodTimer.current) window.clearTimeout(prodTimer.current);
    prodTimer.current = window.setTimeout(() => { prodTimer.current = 0; setProd(false); }, 160);
  };
  const path = hash.split('?')[0];

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

  /* 产品下拉：Esc 收起、点别处收起。宽屏靠 hover，触屏靠点击，
     两条路都走这里，不会出现「点了别处还挂着」的残留。 */
  useEffect(() => {
    if (!prod) return;
    const away = (e: MouseEvent) => {
      if (prodRef.current && !prodRef.current.contains(e.target as Node)) setProd(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setProd(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [prod]);

  // 换路由关掉浮层，否则从菜单里跳页后菜单还挂在那儿
  useEffect(() => {
    setMenu(false); setSheet(false); setProd(false);
    if (prodTimer.current) { window.clearTimeout(prodTimer.current); prodTimer.current = 0; }
  }, [path]);

  const user = auth.user;
  const credits = sub.usedLeft;
  // 昵称在 auth.user.label（CloudBase user_metadata），头像先看资料表再看 metadata
  const name = user?.label || '';
  const avatar = profile?.avatar_url || user?.avatarUrl || '';
  // 管理员入口按 plans.ts 的权威邮箱判断，不在界面里另写一份
  const isAdmin = !!user && user.email === PRICING.adminEmail;

  return <>
    <nav ref={navRef} className={`site-nav ${stuck ? 'is-stuck' : ''} ${prod || menu ? 'has-pop' : ''}`} aria-label={t('主导航', 'Main')}>
      <div className="site-wrap site-nav-in">
        <SiteLogo />

        <div className="site-links">
          <button
            className={`site-link ${path === '/' ? 'is-on' : ''}`}
            onClick={() => go('/')}
            aria-current={path === '/' ? 'page' : undefined}
          >{t('首页', 'Home')}</button>

          {/* 导航上只写「产品」，展开后才是包装工作台（/studio）。
              现在只有这一条产品线，但先把这一层做出来，以后加第二条不用动结构。
              悬停展开、离开收回；触屏没有 hover，点一下切换。 */}
          <div
            className="site-drop-wrap"
            ref={prodRef}
            onPointerEnter={openProd}
            onPointerLeave={closeProd}
          >
            <button
              className={`site-link site-drop-btn ${path === '/studio' ? 'is-on' : ''} ${prod ? 'is-open' : ''}`}
              /* 点击只负责展开：触屏上没有 hover，点一下要能开；
                 关闭交给「点别处 / Esc / 指针离开」，不然焦点先开后点击又立刻翻回去 */
              onClick={() => { openProd(); setProd(true); }}
              onFocus={openProd}
              aria-haspopup="true"
              aria-expanded={prod}
            >
              {t('产品', 'Products')}
              <svg className="site-link-caret" viewBox="0 0 12 12" aria-hidden>
                <path d="M3 4.6 6 7.6 9 4.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {prod && <div className="site-drop" role="menu">
              <button
                className="site-drop-item"
                role="menuitem"
                onClick={() => { setProd(false); go('/studio'); }}
              >
                <b>{t('包装工作台', 'Packaging workbench')}</b>
                <span>{t('需求、刀模、3D 预览与印前检查', 'Brief, dieline, 3D preview and pre-press')}</span>
              </button>
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
              {isAdmin && <>
                <button className="site-menu-item is-admin" role="menuitem" onClick={() => { setMenu(false); go('/admin'); }}>
                  {t('生成兑换码', 'Redeem codes')} <em>{t('管理员', 'Admin')}</em>
                </button>
                <div className="site-menu-split" />
              </>}
              <button className="site-menu-item" role="menuitem" onClick={() => go('/credits')}>
                {t('积分与充值', 'Credits')} <em>→</em>
              </button>
              <button className="site-menu-item" role="menuitem" onClick={() => go('/account')}>
                {t('账户设置', 'Account')} <em>→</em>
              </button>
              <button className="site-menu-item" role="menuitem" onClick={() => go('/about')}>
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
      <button className="site-sheet-link" onClick={() => go('/studio')}>
        {t('包装工作台', 'Workbench')}<span>→</span>
      </button>
      <button className="site-sheet-link" onClick={() => go('/luna')}>
        Luna AI<span>→</span>
      </button>
      <button className="site-sheet-link" onClick={() => go('/about')}>
        {t('关于', 'About')}<span>→</span>
      </button>
      {user
        ? <>
          {isAdmin && <button className="site-sheet-link" onClick={() => { setSheet(false); go('/admin'); }}>
            {t('生成兑换码', 'Redeem codes')}<span>{t('管理员', 'Admin')}</span>
          </button>}
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
