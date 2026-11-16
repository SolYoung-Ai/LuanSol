/* ============================================================
   Studio 2.0 的矢量素材
   ------------------------------------------------------------
   全站硬约束：不用位图。类别卡、风格大图、图案小样全部是
   内联 SVG 几何绘制，不请求任何图片文件，也没有外部素材依赖。
   线稿统一用 currentColor，强调色统一用品牌橙，配色交给外层 CSS。
   ============================================================ */
import React from 'react';
import type { CategoryId, FormId, PatternId, StyleId } from './types';

const ORANGE = '#F47735';

/* ---------------------------- 产品类别 ---------------------------- */

export function CategoryArt({ id }: { id: CategoryId }) {
  const common = {
    viewBox: '0 0 64 64',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (id) {
    case 'food':
      return <svg {...common} aria-hidden>
        <path d="M17 22h30v30H17z" />
        <path d="M17 22l6-7h24l-6 7M47 22l-6-7" opacity=".5" />
        <path d="M24 36h16M24 42h10" opacity=".45" />
        <circle cx="42" cy="43" r="3.4" fill={ORANGE} stroke="none" />
      </svg>;
    case 'drink':
      return <svg {...common} aria-hidden>
        <path d="M27 9h10v7l4.5 6.5V48a6 6 0 0 1-6 6h-7A6 6 0 0 1 22.5 48V22.5L27 16z" />
        <path d="M26 12h12" />
        <rect x="23" y="32" width="18" height="12" rx="1.5" fill={ORANGE} stroke="none" opacity=".9" />
      </svg>;
    case 'tea':
      return <svg {...common} aria-hidden>
        <path d="M13 27h30v10a13 13 0 0 1-13 13h-4a13 13 0 0 1-13-13z" />
        <path d="M43 30h4a5 5 0 0 1 0 10h-4" />
        <path d="M22 18c0-3 3-3 3-6M31 18c0-3 3-3 3-6" opacity=".45" />
        <path d="M13 52h34" opacity=".35" />
      </svg>;
    case 'beauty':
      return <svg {...common} aria-hidden>
        <path d="M24 56V31h9v25z" />
        <path d="M24 31h9" />
        <path d="M26 31V16h5v15" />
        <path d="M26 16l5-6 3 6z" fill={ORANGE} stroke="none" />
        <path d="M33 40h12v16H33z" opacity=".45" />
      </svg>;
    case 'skincare':
      return <svg {...common} aria-hidden>
        <rect x="14" y="26" width="36" height="26" rx="6" />
        <rect x="12" y="16" width="40" height="9" rx="3.5" />
        <path d="M26 39h12" opacity=".45" />
        <circle cx="32" cy="39" r="2.4" fill={ORANGE} stroke="none" />
      </svg>;
    case 'health':
      return <svg {...common} aria-hidden>
        <path d="M20 14h24v10l-3 5v22a5 5 0 0 1-5 5H28a5 5 0 0 1-5-5V29l-3-5z" />
        <rect x="24" y="34" width="16" height="10" rx="5" transform="rotate(-30 32 39)" fill={ORANGE} stroke="none" opacity=".85" />
        <path d="M20 14h24" />
      </svg>;
    case 'daily':
      return <svg {...common} aria-hidden>
        <path d="M22 24h20v28a5 5 0 0 1-5 5H27a5 5 0 0 1-5-5z" />
        <path d="M32 24v-6h11v5h-6" />
        <path d="M32 10h7" />
        <path d="M22 36h20" opacity=".4" />
        <circle cx="38" cy="45" r="3" fill={ORANGE} stroke="none" />
      </svg>;
    case 'gift':
      return <svg {...common} aria-hidden>
        <path d="M14 26h36v26H14z" />
        <path d="M14 26h36M14 34h36" opacity=".4" />
        <path d="M32 26v26" stroke={ORANGE} />
        <path d="M32 26c-9 0-11-10-4-10 5 0 6 7 4 10zm0 0c9 0 11-10 4-10-5 0-6 7-4 10z" stroke={ORANGE} />
      </svg>;
    default:
      return <svg {...common} aria-hidden>
        <path d="M10 20h20v20H10zM34 20h20v20H34z" opacity=".55" />
        <path d="M10 44h20v12H10zM34 44h20v12H34z" opacity=".3" />
        <path d="M30 20v36M10 40h44" strokeDasharray="3 4" opacity=".5" />
        <circle cx="32" cy="38" r="2.6" fill={ORANGE} stroke="none" />
      </svg>;
  }
}

/* ---------------------------- 包装形式 ---------------------------- */

/** 包装形式的小剪影：和类别插画同一套线条语法，方便一眼对上结构 */
export function FormArt({ id }: { id: FormId }) {
  const common = {
    viewBox: '0 0 72 72',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (id) {
    case 'box':
      return <svg {...common}>
        <path d="M18 24h36v34H18z" />
        <path d="M18 24l7-8h29l-7 8" opacity=".5" />
        <path d="M25 40h22" opacity=".45" />
      </svg>;
    case 'outer':
      return <svg {...common}>
        <path d="M22 22h22v18H22z" />
        <path d="M22 22l5-5h22l-5 5" opacity=".5" />
        <path d="M30 46h24v18H30z" opacity=".55" />
      </svg>;
    case 'gift':
      return <svg {...common}>
        <path d="M14 30h44v28H14z" />
        <path d="M36 30v28" stroke={ORANGE} />
        <path d="M14 30l8-8h28l8 8" opacity=".45" />
        <path d="M36 22c-6 0-8-8-2-8 4 0 4 5 2 8zm0 0c6 0 8-8 2-8-4 0-4 5-2 8z" stroke={ORANGE} />
      </svg>;
    case 'pouch':
      return <svg {...common}>
        <path d="M22 16h28l4 10v32a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V26z" />
        <path d="M18 30h36" opacity=".5" />
        <path d="M26 16h20l-3-6H29z" opacity=".55" />
      </svg>;
    case 'bag3d':
      return <svg {...common}>
        <path d="M20 20h32v12l-6 32H26l-6-32z" />
        <path d="M20 20h32M14 32h44" opacity=".45" />
        <path d="M28 44h16" opacity=".35" />
      </svg>;
    case 'bag':
      return <svg {...common}>
        <path d="M24 18h24l3 8-4 34H25l-4-34z" />
        <path d="M24 18l-3-6h30l-3 6" opacity=".55" />
        <path d="M30 34h12" stroke={ORANGE} opacity=".85" />
      </svg>;
    case 'can':
      return <svg {...common}>
        <ellipse cx="36" cy="22" rx="16" ry="5" />
        <path d="M20 22v30c0 2.8 7.2 5 16 5s16-2.2 16-5V22" />
        <path d="M20 38h32" opacity=".35" />
      </svg>;
    case 'bottle':
      return <svg {...common}>
        <path d="M30 12h12v8l5 7v31a4 4 0 0 1-4 4H29a4 4 0 0 1-4-4V27l5-7z" />
        <path d="M29 14h14" opacity=".5" />
        <rect x="27" y="36" width="18" height="12" fill={ORANGE} stroke="none" opacity=".85" />
      </svg>;
    case 'tube':
      return <svg {...common}>
        <path d="M27 20h18l-2 38a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4z" />
        <path d="M27 20h18l-1-6H28z" opacity=".5" />
        <path d="M28 34h16v10H28z" fill={ORANGE} stroke="none" opacity=".8" />
      </svg>;
    case 'sachet':
      return <svg {...common}>
        <path d="M24 18h24v40H24z" />
        <path d="M24 18l12-6 12 6" opacity=".5" />
        <path d="M24 26h24" opacity=".4" />
        <path d="M32 36h8v8h-8z" stroke={ORANGE} />
      </svg>;
    case 'tote':
      return <svg {...common}>
        <path d="M18 26h36v34H18z" />
        <path d="M26 26v-8a10 10 0 0 1 20 0v8" />
        <path d="M30 40h12" opacity=".4" />
      </svg>;
    default:
      return <svg {...common}><path d="M18 24h36v34H18z" /></svg>;
  }
}

/* ---------------------------- 设计风格 ---------------------------- */

export function StyleArt({ id }: { id: StyleId }) {
  const box = { viewBox: '0 0 120 150', className: 'st-art-svg', 'aria-hidden': true } as const;
  switch (id) {
    case 'minimal':
      return <svg {...box}>
        <rect width="120" height="150" fill="#F7F5F1" />
        <path d="M26 30h68v90H26z" fill="#FFFFFF" />
        <path d="M38 44h44" stroke="#191919" strokeWidth="1.4" />
        <path d="M38 52h26" stroke="#191919" strokeWidth="1.4" opacity=".45" />
        <circle cx="70" cy="100" r="9" fill="none" stroke="#191919" strokeWidth="1.2" />
      </svg>;
    case 'luxury':
      return <svg {...box}>
        <rect width="120" height="150" fill="#1B1B1D" />
        <circle cx="60" cy="70" r="30" fill="none" stroke="#C8A96A" strokeWidth="1" opacity=".85" />
        <circle cx="60" cy="70" r="21" fill="none" stroke="#C8A96A" strokeWidth="1" opacity=".45" />
        <path d="M60 40v60" stroke="#C8A96A" strokeWidth=".8" opacity=".5" />
        <path d="M30 116h60" stroke="#C8A96A" strokeWidth="1" opacity=".7" />
        <path d="M46 126h28" stroke="#C8A96A" strokeWidth=".8" opacity=".4" />
      </svg>;
    case 'organic':
      return <svg {...box}>
        <rect width="120" height="150" fill="#F1EDE2" />
        <path d="M60 34c22 0 34 16 34 34 0 22-16 34-34 34S26 90 26 68c0-18 12-34 34-34z" fill="#7C8A5B" opacity=".22" />
        <path d="M60 104c0-26 10-44 26-52" stroke="#4C5A38" strokeWidth="1.6" fill="none" />
        <path d="M70 66c8-2 13-8 14-16-9 1-14 6-14 16z" fill="#4C5A38" opacity=".55" />
        <path d="M60 84c-8-2-12-7-13-15 8 1 13 6 13 15z" fill="#4C5A38" opacity=".35" />
        <circle cx="88" cy="42" r="3" fill={ORANGE} />
      </svg>;
    case 'oriental':
      return <svg {...box}>
        <rect width="120" height="150" fill="#F8F6F1" />
        <path d="M18 96c14-22 22-30 32-30s14 10 24 22 16 16 26 16" fill="none" stroke="#2A2A2A" strokeWidth="1.6" opacity=".75" />
        <path d="M18 110c14-16 22-22 32-22s14 8 24 18 16 12 26 12" fill="none" stroke="#2A2A2A" strokeWidth="1" opacity=".35" />
        <rect x="80" y="30" width="16" height="16" rx="1" fill={ORANGE} opacity=".9" />
        <path d="M84 38h8" stroke="#fff" strokeWidth="1.6" />
        <path d="M84 42h5" stroke="#fff" strokeWidth="1.2" opacity=".8" />
      </svg>;
    case 'retro':
      return <svg {...box}>
        <rect width="120" height="150" fill="#EFE3CE" />
        <g stroke="#B4552F" strokeWidth="1.1" opacity=".55">
          {Array.from({ length: 12 }).map((_, i) => (
            <path key={i} d={`M60 66 L${60 + 70 * Math.cos((i * Math.PI) / 6)} ${66 + 70 * Math.sin((i * Math.PI) / 6)}`} />
          ))}
        </g>
        <circle cx="60" cy="66" r="26" fill="#B4552F" opacity=".9" />
        <circle cx="60" cy="66" r="26" fill="none" stroke="#F6EDDC" strokeWidth="1.4" />
        <path d="M34 118h52" stroke="#5A3626" strokeWidth="1.4" opacity=".6" />
      </svg>;
    case 'illustration':
      return <svg {...box}>
        <rect width="120" height="150" fill="#FBE9E4" />
        <path d="M18 106c10-6 18-20 30-20s16 14 26 14 16-8 28-4" fill="none" stroke="#C4693F" strokeWidth="2" strokeLinecap="round" />
        <path d="M18 122c10-4 18-14 30-14s16 10 26 10 16-6 28-3" fill="none" stroke="#C4693F" strokeWidth="1.4" opacity=".5" strokeLinecap="round" />
        <circle cx="60" cy="52" r="16" fill="#F47735" opacity=".85" />
        <circle cx="43" cy="34" r="2.4" fill="#C4693F" />
        <circle cx="80" cy="30" r="1.8" fill="#C4693F" opacity=".6" />
      </svg>;
    case 'fresh':
      return <svg {...box}>
        <rect width="120" height="150" fill="#F2FAF6" />
        <circle cx="46" cy="60" r="26" fill="#9FD6B4" opacity=".85" />
        <circle cx="76" cy="86" r="30" fill="#C7E8A8" opacity=".8" />
        <circle cx="84" cy="46" r="10" fill="#4E9C74" opacity=".8" />
        <path d="M22 124h76" stroke="#4E9C74" strokeWidth="1.4" opacity=".4" />
        <path d="M96 110l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill={ORANGE} opacity=".8" />
      </svg>;
    case 'trend':
      return <svg {...box}>
        <rect width="120" height="150" fill="#FFFFFF" />
        <path d="M-10 130L90 10h34L24 130z" fill="#191919" />
        <path d="M0 150L100 30h16L16 150z" fill={ORANGE} opacity=".92" />
        <path d="M74 96l6 12 13 6-13 6-6 12-6-12-13-6 13-6z" fill="#FFFFFF" opacity=".9" />
        <path d="M16 24h26" stroke="#191919" strokeWidth="3" />
      </svg>;
    case 'tech':
      return <svg {...box}>
        <rect width="120" height="150" fill="#141821" />
        <g stroke="#3B475C" strokeWidth=".7" opacity=".7">
          {Array.from({ length: 6 }).map((_, i) => <path key={`v${i}`} d={`M${20 + i * 16} 20V130`} />)}
          {Array.from({ length: 8 }).map((_, i) => <path key={`h${i}`} d={`M12 ${22 + i * 15}H108`} />)}
        </g>
        <path d="M28 104l18-26 20 16 26-40" fill="none" stroke={ORANGE} strokeWidth="1.8" />
        {[[28, 104], [46, 78], [66, 94], [92, 54]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.2" fill="#141821" stroke={ORANGE} strokeWidth="1.6" />
        ))}
      </svg>;
    default:
      return <svg {...box}><rect width="120" height="150" fill="#F5F5F5" /></svg>;
  }
}

/* ---------------------------- 图案方向 ---------------------------- */

export function PatternArt({ id }: { id: PatternId }) {
  const box = { viewBox: '0 0 80 80', className: 'st-pat-svg', 'aria-hidden': true } as const;
  switch (id) {
    case 'text':
      return <svg {...box}>
        <rect width="80" height="80" fill="#F7F5F1" />
        <path d="M16 24h48M16 34h34M16 44h48M16 54h26" stroke="#191919" strokeWidth="3" strokeLinecap="round" opacity=".75" />
      </svg>;
    case 'geometric':
      return <svg {...box}>
        <rect width="80" height="80" fill="#F2EFE9" />
        <circle cx="28" cy="28" r="14" fill={ORANGE} opacity=".85" />
        <path d="M44 14h22v22H44z" fill="#191919" opacity=".8" />
        <path d="M14 46h22v22H14z" fill="#191919" opacity=".3" />
        <path d="M44 46h22v22H44z" fill="none" stroke="#191919" strokeWidth="1.6" />
      </svg>;
    case 'handdrawn':
      return <svg {...box}>
        <rect width="80" height="80" fill="#FBF6EE" />
        <path d="M14 52c8-10 14-14 20-14s10 8 16 8 10-6 16-4" fill="none" stroke="#C4693F" strokeWidth="2" strokeLinecap="round" />
        <path d="M14 62c8-6 14-9 20-9s10 5 16 5 10-4 16-2" fill="none" stroke="#C4693F" strokeWidth="1.3" opacity=".5" strokeLinecap="round" />
        <circle cx="52" cy="26" r="7" fill={ORANGE} opacity=".8" />
      </svg>;
    case 'botanical':
      return <svg {...box}>
        <rect width="80" height="80" fill="#F1F4EA" />
        <path d="M26 66V28" stroke="#4C5A38" strokeWidth="1.6" />
        <path d="M26 40c10 0 14-6 15-14-9 0-14 5-15 14zm0 16c-9 0-13-6-14-13 8 0 13 5 14 13z" fill="#7C8A5B" opacity=".8" />
        <path d="M54 66V32" stroke="#4C5A38" strokeWidth="1.4" opacity=".6" />
        <path d="M54 46c8-1 11-6 12-12-7 0-11 4-12 12z" fill="#7C8A5B" opacity=".45" />
      </svg>;
    case 'orientalPattern':
      return <svg {...box}>
        <rect width="80" height="80" fill="#F8F4EE" />
        <g stroke="#2A2A2A" strokeWidth="1.3" fill="none" opacity=".7">
          <path d="M8 52c8-12 12-16 18-16s8 8 14 12 10 4 16 4" />
          <path d="M8 64c8-10 12-14 18-14s8 7 14 10 10 4 16 4" />
        </g>
        <rect x="52" y="16" width="12" height="12" rx="1" fill={ORANGE} opacity=".9" />
      </svg>;
    case 'photo':
      return <svg {...box}>
        <rect width="80" height="80" fill="#EDE9E4" />
        <rect x="12" y="20" width="56" height="40" rx="3" fill="#FFFFFF" stroke="#191919" strokeWidth="1.2" opacity=".9" />
        <path d="M20 50l12-12 8 8 8-10 12 14z" fill="#7C93A6" opacity=".55" />
        <circle cx="28" cy="32" r="4" fill={ORANGE} opacity=".85" />
      </svg>;
    default:
      return <svg {...box}>
        <rect width="80" height="80" fill="#151821" />
        <path d="M40 16l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill={ORANGE} />
        <circle cx="58" cy="58" r="4" fill="#8FA6C4" opacity=".9" />
        <circle cx="22" cy="58" r="2.4" fill="#8FA6C4" opacity=".6" />
        <circle cx="58" cy="22" r="2" fill="#8FA6C4" opacity=".6" />
      </svg>;
  }
}

/** 颜色卡片上的小勾：白 + 描边，深浅底都看得见 */
export const Check = ({ light = false }: { light?: boolean }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
    <path d="M3.2 8.4l3 3.1 6.6-6.9" fill="none" stroke={light ? '#fff' : '#191919'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
