/* ============================================================
   品牌开场动画
   ------------------------------------------------------------
   构成：黑圆从右上压下来落位 → 橙圆从左侧背面滑出、轻微过冲后压上 →
   字标 LunaSol 逐字落位（Sol 用品牌橙）→ 副标出现 → 整层淡出。
   字标不写全大写：站内写法一直是 LunaSol，开场对齐。
   约束：纯 SVG + CSS 动画（不加载视频、不拉字体、不用位图）；
   2.4 秒结束，右下角随时可跳过；同一会话只播一次（sessionStorage）；
   系统开了「减少动态效果」时直接跳过。
   ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n';

const KEY = 'lunasol.intro.seen.v3';
const LETTERS = ['L', 'u', 'n', 'a', 'S', 'o', 'l'];

export default function SiteIntro({ enabled }: { enabled: boolean }) {
  const { t } = useLang();
  const [show, setShow] = useState(false);
  const [out, setOut] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let seen = true;
    try { seen = sessionStorage.getItem(KEY) === '1'; } catch { seen = false; }
    if (seen) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 让首页先画出来，再盖开场层：首屏永远不会被动画挡住渲染
    const raf = window.requestAnimationFrame(() => {
      setShow(true);
      try { sessionStorage.setItem(KEY, '1'); } catch { /* 隐私模式：本次仍可播放 */ }
      const life = reduce ? 600 : 2500;
      timers.current.push(window.setTimeout(() => finish(false), life));
    });
    return () => {
      window.cancelAnimationFrame(raf);
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // 播完必须把滚动锁解开：开场层盖着时滚动被禁，不还原会「整页不能滚」
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [show]);

  function finish(byUser: boolean) {
    if (out) return;
    setOut(true);
    timers.current.push(window.setTimeout(() => setShow(false), byUser ? 220 : 440));
  }

  if (!show) return null;

  return <div className={`site-intro ${out ? 'is-out' : ''}`} role="presentation">
    <div className="site-intro-in">
      {/* 新标志（橙圆压黑圆）与标签页图标同一套比例：viewBox 92 = 64 等比放大 */}
      <svg className="site-intro-mark" viewBox="0 0 92 92" aria-hidden>
        <circle className="si-black" cx="52.3" cy="51.2" r="33.1" />
        <circle className="si-orange" cx="36.7" cy="41.1" r="33.1" />
      </svg>
      <div className="site-intro-word" aria-label="LunaSol">
        {LETTERS.map((ch, i) => <span key={i}>{ch}</span>)}
      </div>
      <div className="site-intro-sub">{t('人人都能成为设计师', 'Everyone can be a designer')}</div>
    </div>
    <button className="site-intro-skip" onClick={() => finish(true)}>{t('跳过', 'Skip')}</button>
  </div>;
}
