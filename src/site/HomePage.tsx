/* ============================================================
   首页（2.0 · 单屏版）
   ------------------------------------------------------------
   一屏只讲一句话：让设计不再复杂。下面就是唯一的动作。
   之前的三屏（品类 / 三步 / 收尾 CTA）按需求整段移除——
   品牌页不需要在首屏就把方法论讲完，点到 Product 才看能力。
   页面高度按「导航 + 一屏 + 页脚」配平，滚轮不会掉出一截空白。

   动效：指针在白底上移动时，跟出一团极淡的暖光，大字反向微移 8px。
   全部走 CSS 变量 + rAF，没有 React 状态，所以不会因为鼠标动就重渲染。
   触屏与「减少动态效果」下整个效果直接关掉（is-live 不会挂上）。
   ============================================================ */
import React, { useEffect, useRef } from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';

function Arrow() {
  return <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
    <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export default function SiteHome() {
  const { t } = useLang();
  const heroRef = useRef<HTMLElement>(null);
  const raf = useRef(0);
  const start = () => go('/studio');

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    // 触屏没有指针，跟着手指跑只会变成一坨抖动的光斑
    const fine = window.matchMedia?.('(pointer: fine)').matches;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return;

    let mx = 50;
    let my = 46;
    const paint = () => {
      raf.current = 0;
      // 大字位移取反，幅度只有 8px：远看是静止的，近看有一点呼吸
      hero.style.setProperty('--mx', `${mx}%`);
      hero.style.setProperty('--my', `${my}%`);
      hero.style.setProperty('--tx', `${(50 - mx) * 0.16}px`);
      hero.style.setProperty('--ty', `${(46 - my) * 0.16}px`);
    };
    const onMove = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      mx = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
      my = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
      if (!raf.current) raf.current = window.requestAnimationFrame(paint);
    };
    const onEnter = () => hero.classList.add('is-live');
    const onLeave = () => hero.classList.remove('is-live');

    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerenter', onEnter);
    hero.addEventListener('pointerleave', onLeave);
    return () => {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerenter', onEnter);
      hero.removeEventListener('pointerleave', onLeave);
      if (raf.current) window.cancelAnimationFrame(raf.current);
    };
  }, []);

  return <div className="site-page site-home">
    <section className="site-home-hero" ref={heroRef}>
      <div className="site-home-glow" aria-hidden />
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
