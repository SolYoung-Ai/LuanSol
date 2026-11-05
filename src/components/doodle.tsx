import React, { useEffect, useRef, useState } from 'react';

/* ============================================================
 * LunaSol 原创手绘视觉系统 —— 黑白线稿（HEYTEA 式手绘语言）
 * 所有描边统一 currentColor，圆角线帽，pathLength 描边动画，
 * 滚动进入视口时自然"画"出来；尊重 prefers-reduced-motion。
 * ============================================================ */

type DProps = { className?: string; style?: React.CSSProperties; title?: string };

// 所有描边元素共用：描边动画基础属性
const DD = { className: 'dd', pathLength: 1 } as const;
// 实心小点 / 填充元素（淡入）
const DF = { className: 'ddf' } as const;

// 用 React state 承载 "是否已进入视口"，让 draw 类由 React 渲染，
// 避免命令式 classList.add 被后续 re-render 覆盖而导致描边动画被中途打断（只画出几个点）。
function useDrawReveal<T extends SVGElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setShown(true); io.disconnect(); break; }
      }
    }, { threshold: 0.18 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

function Svg({ vb, className, style, title, children }: DProps & { vb: string; children: React.ReactNode }) {
  const { ref, shown } = useDrawReveal<SVGSVGElement>();
  return (
    <svg ref={ref} viewBox={vb} className={`doodle${shown ? ' draw' : ''}${className ? ` ${className}` : ''}`} style={style}
      role="img" aria-label={title} fill="none" stroke="currentColor"
      strokeWidth={3.1} strokeLinecap="round" strokeLinejoin="round" preserveAspectRatio="xMidYMid meet">
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/* ---------- 品牌吉祥物：手捧小盒的人物（Luna） ---------- */
export function DoodlePersonHoldingBox(p: DProps) {
  return <Svg vb="0 0 130 156" title={p.title || '手捧包装盒的人物'} {...p}>
    <circle cx="72" cy="30" r="15" {...DD} />
    <path d="M64 35 Q72 41 80 35" {...DD} />
    <path d="M72 45 C70 64 67 84 71 104" {...DD} />
    <path d="M71 104 C67 122 65 138 62 150" {...DD} />
    <path d="M71 104 C77 122 81 138 86 150" {...DD} />
    <path d="M71 62 C84 66 93 76 95 92" {...DD} />
    <path d="M69 60 C53 56 42 47 39 33" {...DD} />
    {/* 手中立方体小盒 */}
    <path d="M16 30 L42 30 L42 48 L16 48 Z" {...DD} />
    <path d="M16 30 L23 19 L49 19 L42 30" {...DD} />
    <path d="M42 30 L49 19 L49 37 L42 48" {...DD} />
  </Svg>;
}

/* ---------- 思考中的人物 ---------- */
export function DoodlePersonThinking(p: DProps) {
  return <Svg vb="0 0 130 156" title={p.title || '思考中的人物'} {...p}>
    <circle cx="70" cy="30" r="15" {...DD} />
    <path d="M64 34 Q70 40 76 34" {...DD} />
    <path d="M70 45 C68 64 66 84 70 104" {...DD} />
    <path d="M70 104 C66 122 64 138 61 150" {...DD} />
    <path d="M70 104 C76 122 80 138 85 150" {...DD} />
    <path d="M70 62 C56 66 48 78 47 92" {...DD} />
    <path d="M72 60 C82 56 90 50 92 42" {...DD} />
    {/* 思考气泡 + 星 */}
    <path d="M98 24 C92 10 108 4 116 12 C124 4 138 12 132 26 C140 36 126 48 114 40 C104 50 92 40 98 24 Z" {...DD} />
    <path d="M104 26 l3 6 l6 1 l-4 5 l1 6 l-6 -3 l-6 3 l1 -6 l-4 -5 l6 -1 z" {...DD} />
  </Svg>;
}

/* ---------- 正在绘制包装的人物（画板前） ---------- */
export function DoodlePersonDrawing(p: DProps) {
  return <Svg vb="0 0 150 156" title={p.title || '正在绘制包装的人物'} {...p}>
    {/* 画板 / 桌面 */}
    <path d="M82 92 L138 92 L138 138 L82 138 Z" {...DD} />
    <path d="M92 104 L128 104 L128 122 L92 122 Z" {...DD} />
    <path d="M100 113 l8 0 l-4 6 z" {...DD} />
    {/* 人物 */}
    <circle cx="44" cy="30" r="15" {...DD} />
    <path d="M37 35 Q44 41 51 35" {...DD} />
    <path d="M44 45 C42 64 40 82 44 100" {...DD} />
    <path d="M44 100 C40 118 38 134 36 150" {...DD} />
    <path d="M44 100 C50 118 54 134 58 150" {...DD} />
    <path d="M44 62 C58 66 70 82 78 92" {...DD} />
    <path d="M44 60 C30 62 22 72 20 86" {...DD} />
    {/* 画笔 */}
    <path d="M70 90 L86 104" {...DD} />
    <path d="M84 102 l5 3 l-2 5 z" {...DF} />
  </Svg>;
}

/* ---------- 正在打包 / 摆放包装的人物 ---------- */
export function DoodlePersonPackaging(p: DProps) {
  return <Svg vb="0 0 140 156" title={p.title || '正在整理包装的人物'} {...p}>
    <circle cx="48" cy="30" r="15" {...DD} />
    <path d="M41 35 Q48 41 55 35" {...DD} />
    <path d="M48 45 C46 64 44 82 48 100" {...DD} />
    <path d="M48 100 C44 118 42 134 40 150" {...DD} />
    <path d="M48 100 C54 118 58 134 62 150" {...DD} />
    <path d="M48 62 C62 66 74 80 82 92" {...DD} />
    <path d="M48 60 C34 62 26 72 24 84" {...DD} />
    {/* 地上的包装盒堆 */}
    <path d="M86 132 L120 132 L120 150 L86 150 Z" {...DD} />
    <path d="M86 132 L94 121 L128 121 L120 132" {...DD} />
    <path d="M120 132 L128 121 L128 139 L120 150" {...DD} />
    <path d="M70 112 L94 112 L94 130 L70 130 Z" {...DD} />
    <path d="M70 112 L76 103 L100 103 L94 112" {...DD} />
  </Svg>;
}

/* ---------- 拿着尺子测量的人物 ---------- */
export function DoodlePersonMeasuring(p: DProps) {
  return <Svg vb="0 0 140 156" title={p.title || '拿着尺子测量的人物'} {...p}>
    <circle cx="48" cy="30" r="15" {...DD} />
    <path d="M41 35 Q48 41 55 35" {...DD} />
    <path d="M48 45 C46 64 44 82 48 100" {...DD} />
    <path d="M48 100 C44 118 42 134 40 150" {...DD} />
    <path d="M48 100 C54 118 58 134 62 150" {...DD} />
    <path d="M48 62 C60 64 70 74 74 86" {...DD} />
    <path d="M48 60 C36 62 28 70 24 80" {...DD} />
    {/* 尺子 */}
    <path d="M22 96 L96 84" {...DD} />
    <path d="M30 95 L31 89 M40 93 L41 87 M50 92 L51 86 M60 90 L61 84 M70 88 L71 82 M80 87 L81 81 M90 85 L91 79" {...DD} />
  </Svg>;
}

/* ---------- 包装盒（立方体） ---------- */
export function DoodleBox(p: DProps) {
  return <Svg vb="0 0 120 120" title={p.title || '包装盒'} {...p}>
    <path d="M18 44 L60 24 L102 44 L60 64 Z" {...DD} />
    <path d="M18 44 L18 96 L60 116 L60 64" {...DD} />
    <path d="M102 44 L102 96 L60 116" {...DD} />
    <path d="M18 44 L60 64 L102 44" {...DD} />
    <path d="M60 64 L60 116" {...DD} />
  </Svg>;
}

/* ---------- 打开的包装盒（翻盖） ---------- */
export function DoodleOpenBox(p: DProps) {
  return <Svg vb="0 0 130 120" title={p.title || '打开的包装盒'} {...p}>
    <path d="M16 50 L62 30 L108 50 L62 70 Z" {...DD} />
    <path d="M16 50 L16 96 L62 116 L62 70" {...DD} />
    <path d="M108 50 L108 96 L62 116" {...DD} />
    <path d="M16 50 L8 36 L54 16 L62 30" {...DD} />
    <path d="M108 50 L116 36 L70 16 L62 30" {...DD} />
    <path d="M62 70 L62 116" {...DD} />
  </Svg>;
}

/* ---------- 纸袋 ---------- */
export function DoodlePaperBag(p: DProps) {
  return <Svg vb="0 0 120 130" title={p.title || '纸袋'} {...p}>
    <path d="M28 40 L92 40 L100 118 L20 118 Z" {...DD} />
    <path d="M28 40 C28 22 92 22 92 40" {...DD} />
    <path d="M44 34 C44 18 76 18 76 34" {...DD} />
    <path d="M62 50 L62 110" {...DD} strokeDasharray="4 5" />
  </Svg>;
}

/* ---------- 瓶子 ---------- */
export function DoodleBottle(p: DProps) {
  return <Svg vb="0 0 90 150" title={p.title || '瓶子'} {...p}>
    <path d="M36 18 L54 18 L54 34 C66 42 66 52 64 60 L64 132 L26 132 L26 60 C24 52 24 42 36 34 Z" {...DD} />
    <path d="M26 86 L64 86" {...DD} />
    <path d="M33 100 L57 100" {...DD} />
  </Svg>;
}

/* ---------- 标签 / 贴纸 ---------- */
export function DoodleLabel(p: DProps) {
  return <Svg vb="0 0 110 130" title={p.title || '标签'} {...p}>
    <path d="M24 36 L86 36 L86 110 L24 110 Z" {...DD} />
    <path d="M24 36 L40 18 L92 18 L92 36" {...DD} />
    <path d="M24 36 L24 110" {...DD} />
    <circle cx="55" cy="64" r="14" {...DD} />
    <path d="M40 90 L70 90" {...DD} />
  </Svg>;
}

/* ---------- 小花 ---------- */
export function DoodleFlower(p: DProps) {
  return <Svg vb="0 0 90 90" title={p.title || '小花'} {...p}>
    <circle cx="45" cy="45" r="9" {...DF} />
    <path d="M45 18 C40 30 40 36 45 45 C50 36 50 30 45 18 Z" {...DD} />
    <path d="M45 72 C40 60 40 54 45 45 C50 54 50 60 45 72 Z" {...DD} />
    <path d="M18 45 C30 40 36 40 45 45 C36 50 30 50 18 45 Z" {...DD} />
    <path d="M72 45 C60 40 54 40 45 45 C54 50 60 50 72 45 Z" {...DD} />
  </Svg>;
}

/* ---------- 树（创意生长） ---------- */
export function DoodleTree(p: DProps) {
  return <Svg vb="0 0 140 160" title={p.title || '长出创意的树'} {...p}>
    <path d="M64 158 L70 158 L68 96 L66 96 Z" {...DD} />
    <path d="M67 110 C58 108 52 100 52 90 M67 120 C76 118 84 110 84 98" {...DD} />
    <path d="M30 70 C30 44 50 30 70 34 C94 28 116 44 112 70 C124 84 116 106 92 104 C78 116 50 114 42 100 C22 100 20 82 30 70 Z" {...DD} />
    <path d="M44 70 q8 -10 18 -4" {...DD} />
    <path d="M84 78 q8 -8 16 -2" {...DD} />
    {/* 树上长出小盒 */}
    <path d="M92 34 L104 28 L118 34 L104 40 Z" {...DD} />
    <path d="M92 34 L92 46 L104 52 L104 40" {...DD} />
    <path d="M118 34 L118 46 L104 52" {...DD} />
  </Svg>;
}

/* ---------- 星星 ---------- */
export function DoodleStar(p: DProps) {
  return <Svg vb="0 0 90 90" title={p.title || '星星'} {...p}>
    <path d="M45 14 L53 36 L76 38 L58 53 L64 76 L45 62 L26 76 L32 53 L14 38 L37 36 Z" {...DD} />
  </Svg>;
}

/* ---------- 手绘箭头 ---------- */
export function DoodleArrow(p: DProps & { flip?: boolean }) {
  const vb = p.flip ? '0 0 130 60' : '0 0 130 60';
  const d = p.flip
    ? 'M120 30 C92 22 60 22 30 32 M30 32 L46 22 M30 32 L46 42'
    : 'M10 30 C38 22 70 22 100 32 M100 32 L84 22 M100 32 L84 42';
  return <Svg vb={vb} title={p.title || '手绘箭头'} {...p}><path d={d} {...DD} /></Svg>;
}

/* ---------- 手绘勾选 ---------- */
export function DoodleCheck(p: DProps) {
  return <Svg vb="0 0 90 90" title={p.title || '勾选'} {...p}>
    <circle cx="45" cy="45" r="30" {...DD} />
    <path d="M30 47 L41 60 L62 32" {...DD} />
  </Svg>;
}

/* ---------- 闪光 / 火花 ---------- */
export function DoodleSpark(p: DProps) {
  return <Svg vb="0 0 90 90" title={p.title || '闪光'} {...p}>
    <path d="M45 10 C47 34 53 41 78 45 C53 49 47 56 45 80 C43 56 37 49 12 45 C37 41 43 34 45 10 Z" {...DD} />
  </Svg>;
}

/* ---------- 波浪手绘线（分隔 / 装饰） ---------- */
export function DoodleWave(p: DProps) {
  return <Svg vb="0 0 200 30" title={p.title || '波浪线'} {...p}>
    <path d="M4 16 q14 -12 28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0" {...DD} strokeWidth={2.4} />
  </Svg>;
}

/* ---------- 品牌吉祥物别名 ---------- */
export const Mascot = DoodlePersonHoldingBox;

/* ---------- 首页创意场景：人物 + 树 + 盒 + 星 + 花 ---------- */
export function HeroScene(p: DProps) {
  return <Svg vb="0 0 520 420" title={p.title || 'LunaSol 创意工作室场景'} {...p}>
    {/* 地面手绘线 */}
    <path d="M40 372 C160 360 360 360 484 372" {...DD} />
    {/* 左：手捧盒的人物（吉祥物） */}
    <g transform="translate(36 150) scale(1)">
      <circle cx="72" cy="30" r="15" {...DD} />
      <path d="M64 35 Q72 41 80 35" {...DD} />
      <path d="M72 45 C70 64 67 84 71 104" {...DD} />
      <path d="M71 104 C67 122 65 138 62 150" {...DD} />
      <path d="M71 104 C77 122 81 138 86 150" {...DD} />
      <path d="M71 62 C84 66 93 76 95 92" {...DD} />
      <path d="M69 60 C53 56 42 47 39 33" {...DD} />
      <path d="M16 30 L42 30 L42 48 L16 48 Z" {...DD} />
      <path d="M16 30 L23 19 L49 19 L42 30" {...DD} />
      <path d="M42 30 L49 19 L49 37 L42 48" {...DD} />
    </g>
    {/* 中：长出创意的树 */}
    <g transform="translate(190 150) scale(1.05)">
      <path d="M64 158 L70 158 L68 96 L66 96 Z" {...DD} />
      <path d="M30 70 C30 44 50 30 70 34 C94 28 116 44 112 70 C124 84 116 106 92 104 C78 116 50 114 42 100 C22 100 20 82 30 70 Z" {...DD} />
      <path d="M92 34 L104 28 L118 34 L104 40 Z" {...DD} />
      <path d="M92 34 L92 46 L104 52 L104 40" {...DD} />
      <path d="M118 34 L118 46 L104 52" {...DD} />
    </g>
    {/* 右：打开的盒 + 星 + 花 */}
    <g transform="translate(372 196)">
      <path d="M16 50 L62 30 L108 50 L62 70 Z" {...DD} />
      <path d="M16 50 L16 96 L62 116 L62 70" {...DD} />
      <path d="M108 50 L108 96 L62 116" {...DD} />
      <path d="M16 50 L8 36 L54 16 L62 30" {...DD} />
      <path d="M108 50 L116 36 L70 16 L62 30" {...DD} />
      <path d="M62 70 L62 116" {...DD} />
    </g>
    <g transform="translate(470 150) scale(0.7)"><path d="M45 14 L53 36 L76 38 L58 53 L64 76 L45 62 L26 76 L32 53 L14 38 L37 36 Z" {...DD} /></g>
    <g transform="translate(330 120) scale(0.6)"><circle cx="45" cy="45" r="9" {...DF} /><path d="M45 18 C40 30 40 36 45 45 C50 36 50 30 45 18 Z" {...DD} /><path d="M45 72 C40 60 40 54 45 45 C50 54 50 60 45 72 Z" {...DD} /><path d="M18 45 C30 40 36 40 45 45 C36 50 30 50 18 45 Z" {...DD} /><path d="M72 45 C60 40 54 40 45 45 C54 50 60 50 72 45 Z" {...DD} /></g>
    {/* 飘散的小元素 */}
    <g transform="translate(150 120) scale(0.5)"><path d="M45 10 C47 34 53 41 78 45 C53 49 47 56 45 80 C43 56 37 49 12 45 C37 41 43 34 45 10 Z" {...DD} /></g>
    <g transform="translate(300 250) scale(0.5)"><path d="M45 14 L53 36 L76 38 L58 53 L64 76 L45 62 L26 76 L32 53 L14 38 L37 36 Z" {...DD} /></g>
  </Svg>;
}
