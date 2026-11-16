import React, { useCallback, useEffect, useState } from 'react';
import { useLang } from '../i18n';

/* 品牌开场（V5）
 * ------------------------------------------------------------
 * 三拍：折线勾出包装盒轮廓 → 字标逐字落位 → 品牌副标与一句 slogan。
 * 只播一次（sessionStorage），可点击/回车/Esc 跳过，
 * 系统开启「减少动态效果」时整段不播，避免眩晕。
 * 覆盖层用 fixed，不参与布局，也不阻塞首页渲染（React 首帧之后才出现）。
 */

const KEY = 'lunasol.splash.v5';

function shouldSkip() {
  try { if (sessionStorage.getItem(KEY) === '1') return true; } catch { /* 隐私模式 */ }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  return false;
}

export default function BrandSplash() {
  const { t } = useLang();
  const [phase, setPhase] = useState<'play' | 'out' | 'done'>(() => (shouldSkip() ? 'done' : 'play'));

  const finish = useCallback(() => {
    setPhase((p) => (p === 'play' ? 'out' : p));
  }, []);

  useEffect(() => {
    if (phase !== 'play') return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    const timer = window.setTimeout(finish, 2500);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      root.style.overflow = prev;
    };
  }, [phase, finish]);

  useEffect(() => {
    if (phase !== 'out') return;
    try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    const timer = window.setTimeout(() => setPhase('done'), 560);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'done') return null;

  return <div className={`bs ${phase === 'out' ? 'is-out' : ''}`} role="presentation" onClick={finish}>
    <div className="bs-stage">
      <svg className="bs-mark" viewBox="0 0 96 96" aria-hidden>
        {/* 等轴包装盒：顶面菱形 + 两侧面 */}
        <path className="bs-line" d="M48 22 L70 33 L70 63 L48 74 L26 63 L26 33 Z" />
        <path className="bs-line" d="M26 33 L48 44 L70 33" />
        <path className="bs-line bs-accent" d="M48 44 L48 74" />
        <path className="bs-fold" d="M37 27.5 L59 38.5" />
        <circle className="bs-tick" cx="48" cy="44" r="2.4" fill="var(--mk-brand)" stroke="none" />
      </svg>

      <p className="bs-word" aria-label="LunaSol">
        {['L', 'u', 'n', 'a'].map((c, i) => <span key={c + i} style={{ animationDelay: `${0.62 + i * 0.055}s` }}>{c}</span>)}
        {['S', 'o', 'l'].map((c, i) => <span key={'s' + i} style={{ animationDelay: `${0.84 + i * 0.055}s` }}><em>{c}</em></span>)}
      </p>
      <p className="bs-sub">AI PACKAGING DESIGN STUDIO</p>
      <p className="bs-tag">{t('从想法，到完整包装。', 'From Idea to Packaging.')}</p>
    </div>
    <button className="bs-skip" onClick={(e) => { e.stopPropagation(); finish(); }}>
      {t('跳过 SKIP', 'SKIP')}
    </button>
  </div>;
}
