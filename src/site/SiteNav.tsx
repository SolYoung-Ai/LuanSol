/* ============================================================
   公开站点的顶部导航
   ------------------------------------------------------------
   左：字标。中：Home / Product / About（真居中，不用 flex 挤）。
   右：未登录是「登录」，已登录是「头像 + 积分 + 账户菜单」。
   不使用旧站 Nav 的原因：旧 Nav 顶部挂着「Luna Ai / 包装设计 / 复刻设计」
   四个产品入口，那是旧信息架构，2.0 的公开站点只讲三件事。
   账户菜单只做「余额 / 账户 / 帮助 / 退出」——不把用户送回旧版工作台。
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../cloud/auth';
import { useSubscription } from '../cloud/subscription';
import { useProfile } from '../cloud/profile';
import { go, useHash } from '../ui';
import { useLang } from '../i18n';

const LINKS = [
  { zh: 'Home', en: 'Home', path: '/' },
  { zh: 'Product', en: 'Product', path: '/product' },
  { zh: 'About', en: 'About', path: '/about' },
];

/** 字标：导航里只留 LunaSol（顶部 72px 内加一行 9px 副标会变成噪点），
 *  页脚空间宽裕时才带副标。 */
export function SiteLogo({ onClick, sub = false }: { onClick?: () => void; sub?: boolean }) {
  const { t } = useLang();
  return <button className="site-logo" onClick={onClick || (() => go('/'))} aria-label={t('LunaSol 首页', 'LunaSol home')}>
    <b>Luna<i>Sol</i></b>
    {sub && <span>{t('AI 包装设计工作室', 'AI Packaging Studio')}</span>}
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

  // 换路由关掉所有浮层，否则从菜单里跳页后菜单还挂在那儿
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
          {LINKS.map((l) => (
            <button
              key={l.path}
              className={`site-link ${path === l.path ? 'is-on' : ''}`}
              onClick={() => go(l.path)}
              aria-current={path === l.path ? 'page' : undefined}
            >{t(l.zh, l.en)}</button>
          ))}
        </div>

        <div className="site-actions" ref={menuRef}>
          {/* 不等 auth.ready：云端会话恢复在冷启动时可能要几秒，
              期间右侧空白会让人以为「没有登录入口」。
              已登录用户会短暂看到「登录」再换成头像，比空着可接受。 */}
          {!user && <button className="site-login" onClick={onLogin}>{t('登录', 'Log in')}</button>}

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
      {LINKS.map((l) => (
        <button key={l.path} className="site-sheet-link" onClick={() => go(l.path)}>
          {t(l.zh, l.en)}<span>→</span>
        </button>
      ))}
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
