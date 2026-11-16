/* ============================================================
   首页（2.0 · 单屏版）
   ------------------------------------------------------------
   一屏只讲一句话：让设计不再复杂。下面就是唯一的动作。
   之前的三屏（品类 / 三步 / 收尾 CTA）按需求整段移除——
   品牌页不需要在首屏就把方法论讲完，点到 Product 才看能力。
   页面高度按「导航 + 一屏 + 页脚」配平，滚轮不会掉出一截空白。
   ============================================================ */
import React from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';

function Arrow() {
  return <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
    <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export default function SiteHome() {
  const { t } = useLang();
  const start = () => go('/studio');

  return <div className="site-page site-home">
    <section className="site-home-hero">
      <div className="site-wrap site-home-in">
        <h1 className="site-home-h1">{t('让设计不再复杂', 'Design, made simple')}</h1>
        <div className="site-home-cta">
          <button className="site-btn" onClick={start}>
            {t('开始吧！设计师', 'Start designing')}<Arrow />
          </button>
        </div>
      </div>
    </section>
  </div>;
}
