/* ============================================================
   全站唯一的顶部导航
   ------------------------------------------------------------
   版式参考 B.AI：字标贴最左，导航项紧跟字标右侧（左对齐，不再居中），
   右侧只放账户动作。这样宽屏上眼睛从左往右读，不会被中间一块空白劈开。
   顺序：首页 / 产品⌄ / Luna AI / 关于。
   「产品」本身不跳页，只是悬停/点击展开一张卡，里面现在只有「包装工作台」
   （就是 /studio）。留这一层是为了以后加别的产品线时不用再动导航结构。
   复刻设计整条产品线已下线（2026-11-17），老链接由 App 的路由兜到底，不做 404。
   账户菜单只做「余额 / 账户 / 帮助 / 退出」。
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../cloud/auth';
import { useSubscription } from '../cloud/subscription';
import { useProfile } from '../cloud/profile';
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
  const menuRef = useRef<HTMLDivElement>(null);
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

  // 换路由关掉浮层，否则从菜单里跳页后菜单还挂在那儿
  useEffect(() => { setMenu(false); setSheet(false); }, [path]);

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

          {/* 全站只有一个产品：包装工作台（/studio）。不摆下拉、不摆还没做的产品位，
              免得看着像有别的功能。 */}
          <button
            className={`site-link ${path === '/studio' ? 'is-on' : ''}`}
            onClick={() => go('/studio')}
            onMouseEnter={warmStudio}
            onFocus={warmStudio}
            aria-current={path === '/studio' ? 'page' : undefined}
          >{t('包装工作台', 'Packaging workbench')}</button>
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
