import React, { useEffect, useId, useRef, useState } from 'react';
import { makeRnd, hLine, hPoly, hEllipse, hArc, hDot, hSmooth, drawPerson, type Pose, type Rnd } from './hand';

/* ============================================================
 * LunaSol 手绘视觉系统 —— 黑色马克笔线稿
 * ------------------------------------------------------------
 * 所有图形由 hand.ts 的笔触引擎程序化生成：
 *  · 线条有弓形、粗细变化、端点出头，不是几何描边
 *  · 同一角色「Luna」贯穿全站，骨架与五官完全一致
 *  · 遮罩扫描做"画出来"的效果
 *    （默认态永远可见，动画只是锦上添花，绝不会只剩几个点）
 * ============================================================ */

export type DProps = { className?: string; style?: React.CSSProperties; title?: string };

/** 笔画：可以直接是 path 字符串，也可以带宽度等参数的完整对象 */
export type Stroke = string | { d: string; w?: number; o?: number; fill?: string; noDash?: boolean };

/* ---------- 滚动进入视口时"画出来" ---------- */
function useDrawReveal<T extends SVGElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { setShown(true); io.disconnect(); break; }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

/* ---------- 通用墨线画布 ---------- */
export function Ink({ vb, strokes, className, style, title, animate = true }:
{ vb: string; strokes: Stroke[] } & DProps & { animate?: boolean }) {
  const { ref, shown } = useDrawReveal<SVGSVGElement>();
  const uid = useId().replace(/[:]/g, '');
  // viewBox 尺寸，用于 mask 扫描
  const [, , vw, vh] = vb.split(/\s+/).map(Number);
  const W = vw || 400, H = vh || 400;
  // 遮罩区域比画布大一圈，保证超出 viewBox 的出头笔画不被裁掉
  const mx = -W * 0.5, my = -H * 0.5, mw = W * 2, mh = H * 2;
  const masked = shown && animate;
  return (
    <svg ref={ref} viewBox={vb}
      className={`doodle${masked ? ' draw' : ''}${className ? ` ${className}` : ''}`}
      style={style} role="img" aria-label={title} fill="none" stroke="currentColor"
      strokeLinecap="round" strokeLinejoin="round" preserveAspectRatio="xMidYMid meet">
      {title ? <title>{title}</title> : null}
      <defs>
        {/* 扫描遮罩：一条白色矩形从左向右扫出，
            图形像被笔从左到右"画"出来。
            底色是黑（= 隐藏），未播放动画时白条为满宽 = 全部可见。 */}
        <mask id={`m${uid}`} maskUnits="userSpaceOnUse" x={mx} y={my} width={mw} height={mh}>
          <rect x={mx} y={my} width={mw} height={mh} fill="#000" />
          {/* 白条从画面左侧偏外扫到右侧偏外：出头的笔画也会被扫到 */}
          <rect className="dd-sweep" x={-W * 0.12} y={my} width={W * 1.24} height={mh} fill="#fff" />
        </mask>
      </defs>
      <g mask={masked ? `url(#m${uid})` : undefined}>
        {strokes.map((raw, i) => {
          const s = (typeof raw === 'string' ? { d: raw } : raw) as
            { d: string; w?: number; o?: number; fill?: string; noDash?: boolean };
          const w = s.w ?? 3.1;
          return <React.Fragment key={i}>
            {/* 马克笔复笔：偏移的浅色第二道，制造笔触不均 */}
            {s.o !== 0 && i % 3 === 1 && (
              <path d={s.d} strokeWidth={w * 0.6} opacity={0.3} transform="translate(1.2 -0.9)" className="dd" />
            )}
            <path d={s.d} strokeWidth={w} opacity={s.o ?? 1}
              className={s.noDash ? 'ddf' : 'dd'}
              fill={s.fill ?? 'none'}
              style={{ ['--i' as string]: Math.min(i, 26) } as React.CSSProperties} />
          </React.Fragment>;
        })}
      </g>
    </svg>
  );
}

/* ---------- 缓存：同一图形只生成一次 ---------- */
const cache = new Map<string, Stroke[]>();
function build(key: string, fn: (r: Rnd) => Stroke[]): Stroke[] {
  let v = cache.get(key);
  if (!v) { v = fn(makeRnd(hash(key))); cache.set(key, v); }
  return v;
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ============================================================
 * 小道具（作为批注、标注、点缀用，不是主视觉）
 * ============================================================ */

/** 手绘立方包装盒（带盖缝） */
export function DoodleBox(p: DProps) {
  const s = build('box', r => {
    const out: Stroke[] = [];
    out.push(...hPoly(r, [[22, 46], [60, 26], [98, 46]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[22, 46], [22, 96], [60, 116]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[98, 46], [98, 96], [60, 116]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[22, 46], [60, 66], [98, 46]], false, { bow: 0.05 }));
    out.push(...hPoly(r, [[60, 66], [60, 116]], false, { bow: 0.02, over: 0.008 }));
    out.push({ d: hArc(r, 60, 66, 14, Math.PI * 0.15, Math.PI * 0.85, { n: 4, wob: 0.08 }), w: 2.2 });
    return out;
  });
  return <Ink vb="0 0 120 130" strokes={s} {...p} />;
}

/** 手绘开口包装盒（掀盖） */
export function DoodleOpenBox(p: DProps) {
  const s = build('openbox', r => {
    const out: Stroke[] = [];
    out.push(...hPoly(r, [[20, 52], [62, 32], [104, 52]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[20, 52], [20, 96], [62, 116]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[104, 52], [104, 96], [62, 116]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[20, 52], [8, 36], [52, 14], [62, 32]], false, { bow: 0.06 }));
    out.push(...hPoly(r, [[104, 52], [116, 34], [72, 12], [62, 32]], false, { bow: 0.06 }));
    out.push(...hPoly(r, [[62, 70], [62, 116]], false, { bow: 0.02, over: 0.008 }));
    return out;
  });
  return <Ink vb="0 0 126 128" strokes={s} {...p} />;
}

/** 手绘自立袋 */
export function DoodlePouch(p: DProps) {
  const s = build('pouch', r => {
    const out: Stroke[] = [];
    out.push(...hPoly(r, [[32, 44], [88, 44], [96, 118], [24, 118]], true, { bow: 0.035 }));
    out.push(...hPoly(r, [[32, 44], [36, 26], [84, 26], [88, 44]], false, { bow: 0.05 }));
    out.push(...hPoly(r, [[44, 30], [46, 16], [74, 16], [76, 30]], false, { bow: 0.06 }));
    out.push({ d: hArc(r, 60, 62, 15, Math.PI * 0.12, Math.PI * 0.88, { n: 4, wob: 0.09 }), w: 2.2 });
    out.push({ d: hLine(r, 40, 92, 80, 92, { bow: 0.06 }), w: 2.2 });
    return out;
  });
  return <Ink vb="0 0 120 130" strokes={s} {...p} />;
}

/** 手绘瓶罐 */
export function DoodleBottle(p: DProps) {
  const s = build('bottle', r => {
    const out: Stroke[] = [];
    out.push(...hPoly(r, [[38, 26], [54, 26], [54, 40]], false, { bow: 0.03 }));
    out.push(...hPoly(r, [[38, 26], [38, 40]], false, { bow: 0.03 }));
    out.push(...hPoly(r, [[34, 40], [58, 40]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[34, 40], [26, 58], [26, 128], [66, 128], [66, 58], [58, 40]], false, { bow: 0.03 }));
    out.push({ d: hLine(r, 26, 84, 66, 84, { bow: 0.04 }), w: 2.3 });
    out.push({ d: hLine(r, 34, 100, 58, 100, { bow: 0.06 }), w: 2 });
    return out;
  });
  return <Ink vb="0 0 92 140" strokes={s} {...p} />;
}

/** 手绘标签贴纸（带撕角） */
export function DoodleLabel(p: DProps) {
  const s = build('label', r => {
    const out: Stroke[] = [];
    out.push(...hPoly(r, [[26, 34], [86, 34], [86, 108], [26, 108]], false, { bow: 0.03 }));
    out.push(...hPoly(r, [[26, 34], [42, 16], [92, 16], [86, 34]], false, { bow: 0.05 }));
    out.push({ d: hEllipse(r, 56, 62, 15, 15, { n: 9, wob: 0.08 }), w: 2.4 });
    out.push({ d: hLine(r, 40, 92, 72, 92, { bow: 0.06 }), w: 2.2 });
    return out;
  });
  return <Ink vb="0 0 112 126" strokes={s} {...p} />;
}

/** 手绘礼品盒（带十字丝带） */
export function DoodleGift(p: DProps) {
  const s = build('gift', r => {
    const out: Stroke[] = [];
    out.push(...hPoly(r, [[24, 52], [60, 34], [96, 52], [60, 70]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[24, 52], [24, 100], [60, 118], [60, 70]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[96, 52], [96, 100], [60, 118]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[24, 52], [60, 34], [96, 52]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[44, 43], [60, 34], [76, 43], [60, 52]], false, { bow: 0.06 }));
    out.push({ d: hLine(r, 42, 59, 42, 109, { bow: 0.03 }), w: 2.2 });
    out.push({ d: hLine(r, 78, 59, 78, 109, { bow: 0.03 }), w: 2.2 });
    return out;
  });
  return <Ink vb="0 0 120 130" strokes={s} {...p} />;
}

/** 手绘剪刀 */
export function DoodleScissors(p: DProps) {
  const s = build('scissors', r => {
    const out: Stroke[] = [];
    out.push(...hPoly(r, [[18, 82], [62, 42], [82, 26]], false, { bow: 0.04 }));
    out.push(...hPoly(r, [[30, 92], [64, 52], [92, 34]], false, { bow: 0.04 }));
    out.push({ d: hEllipse(r, 20, 92, 13, 11, { n: 8, wob: 0.09 }), w: 2.6 });
    out.push({ d: hEllipse(r, 34, 104, 13, 11, { n: 8, wob: 0.09 }), w: 2.6 });
    out.push({ d: hDot(r, 62, 42, 3.4), w: 2.4, fill: 'currentColor' });
    return out;
  });
  return <Ink vb="0 0 110 120" strokes={s} {...p} />;
}

/** 手绘铅笔 */
export function DoodlePencil(p: DProps) {
  const s = build('pencil', r => {
    const out: Stroke[] = [];
    out.push(...hPoly(r, [[14, 96], [86, 30]], false, { bow: 0.02, over: 0.01 }));
    out.push(...hPoly(r, [[20, 104], [92, 38]], false, { bow: 0.02, over: 0.01 }));
    out.push(...hPoly(r, [[86, 30], [92, 38], [78, 40]], false, { bow: 0.05 }));
    out.push({ d: hLine(r, 14, 96, 6, 104, { bow: 0.05 }), w: 2.4 });
    out.push({ d: hLine(r, 34, 78, 40, 84, { bow: 0.04 }), w: 2 });
    return out;
  });
  return <Ink vb="0 0 104 116" strokes={s} {...p} />;
}

/** 手绘直尺 */
export function DoodleRuler(p: DProps) {
  const s = build('ruler', r => {
    const out: Stroke[] = [];
    out.push(...hPoly(r, [[14, 40], [112, 22], [112, 46], [14, 64]], true, { bow: 0.03 }));
    const ticks: number[][][] = [];
    for (let i = 0; i < 6; i++) {
      const x = 24 + i * 16;
      const y = 40 + (x - 24) * (18 / 88) * -1 + 0;
      ticks.push([[x, y], [x, y + 11]]);
    }
    out.push(...ticks.map(t => ({ d: hLine(r, t[0][0], t[0][1], t[1][0], t[1][1], { bow: 0.02, over: 0 }), w: 1.9 })));
    return out;
  });
  return <Ink vb="0 0 124 76" strokes={s} {...p} />;
}

/** 手绘胶带圈 */
export function DoodleTape(p: DProps) {
  const s = build('tape', r => {
    const out: Stroke[] = [];
    out.push({ d: hEllipse(r, 50, 42, 34, 15, { n: 9, wob: 0.07 }), w: 3 });
    out.push({ d: hEllipse(r, 50, 42, 16, 7, { n: 8, wob: 0.1 }), w: 2.4 });
    out.push({ d: hLine(r, 16, 42, 16, 66, { bow: 0.05 }), w: 2.4 });
    out.push({ d: hLine(r, 84, 42, 84, 66, { bow: 0.05 }), w: 2.4 });
    return out;
  });
  return <Ink vb="0 0 100 80" strokes={s} {...p} />;
}

/** 手绘星星 */
export function DoodleStar(p: DProps) {
  const s = build('star', r => {
    const pts: number[][] = [];
    const R = 36, r0 = 15;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? R : r0;
      pts.push([45 + Math.cos(a) * rad * (1 + (r() - 0.5) * 0.1), 45 + Math.sin(a) * rad * (1 + (r() - 0.5) * 0.1)]);
    }
    return [{ d: hPoly(r, pts, true, { bow: 0.03, jit: 0.9 }).join(' '), w: 3 }];
  });
  return <Ink vb="0 0 90 90" strokes={s} {...p} />;
}

/** 手绘闪光 */
export function DoodleSpark(p: DProps) {
  const s = build('spark', r => {
    const out: Stroke[] = [];
    out.push(...hPoly(r, [[45, 8], [40, 32], [50, 40], [40, 48], [45, 82], [50, 52], [42, 44], [52, 36]], true, { bow: 0.05, jit: 1.1 }));
    return out;
  });
  return <Ink vb="0 0 90 90" strokes={s} {...p} />;
}

/** 手绘勾选 */
export function DoodleCheck(p: DProps) {
  const s = build('check', r => {
    const out: Stroke[] = [];
    out.push({ d: hEllipse(r, 45, 45, 32, 31, { n: 10, wob: 0.07 }), w: 2.8 });
    out.push({ d: hPoly(r, [[28, 47], [40, 61], [63, 30]], false, { bow: 0.05, jit: 0.8 }).join(' '), w: 3.4 });
    return out;
  });
  return <Ink vb="0 0 90 90" strokes={s} {...p} />;
}

/** 手绘箭头（可翻转） */
export function DoodleArrow(p: DProps & { flip?: boolean }) {
  const s = build(`arrow-${p.flip ? 'f' : 'n'}`, r => {
    const out: Stroke[] = [];
    if (p.flip) {
      out.push({ d: hPoly(r, [[122, 26], [70, 18], [24, 30]], false, { bow: 0.05, jit: 1.2 }).join(' '), w: 3 });
      out.push({ d: hPoly(r, [[24, 30], [44, 18]], false, { bow: 0.06 }).join(' '), w: 2.8 });
      out.push({ d: hPoly(r, [[24, 30], [44, 42]], false, { bow: 0.06 }).join(' '), w: 2.8 });
    } else {
      out.push({ d: hPoly(r, [[8, 26], [60, 18], [108, 30]], false, { bow: 0.05, jit: 1.2 }).join(' '), w: 3 });
      out.push({ d: hPoly(r, [[108, 30], [88, 18]], false, { bow: 0.06 }).join(' '), w: 2.8 });
      out.push({ d: hPoly(r, [[108, 30], [88, 42]], false, { bow: 0.06 }).join(' '), w: 2.8 });
    }
    return out;
  });
  return <Ink vb="0 0 130 56" strokes={s} {...p} />;
}

/** 手绘波浪线（分隔用） */
export function DoodleWave(p: DProps) {
  const s = build('wave', r => {
    const pts: number[][] = [];
    for (let i = 0; i <= 12; i++) pts.push([6 + i * 16, 16 + Math.sin(i * 1.5) * 5]);
    return [{ d: hPoly(r, pts, false, { bow: 0.04, jit: 1 }).join(' '), w: 2.4 }];
  });
  return <Ink vb="0 0 200 32" strokes={s} {...p} />;
}

/** 手绘小花 */
export function DoodleFlower(p: DProps) {
  const s = build('flower', r => {
    const out: Stroke[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const cx = 45 + Math.cos(a) * 21, cy = 45 + Math.sin(a) * 21;
      out.push({ d: hEllipse(r, cx, cy, 11, 9, { n: 8, wob: 0.13, jit: 0.8 }), w: 2.5 });
    }
    out.push({ d: hDot(r, 45, 45, 8), w: 2.4, fill: 'currentColor' });
    return out;
  });
  return <Ink vb="0 0 90 90" strokes={s} {...p} />;
}

/** 手绘叶子 */
export function DoodleLeaf(p: DProps) {
  const s = build('leaf', r => {
    const out: Stroke[] = [];
    out.push({ d: hSmooth(r, [[22, 70], [40, 30], [76, 16], [70, 54], [22, 70]], true, 1.2), w: 2.7 });
    out.push({ d: hLine(r, 22, 70, 72, 22, { bow: 0.04 }), w: 2 });
    return out;
  });
  return <Ink vb="0 0 92 86" strokes={s} {...p} />;
}

/** 手绘思考气泡 */
export function DoodleThought(p: DProps) {
  const s = build('thought', r => {
    const out: Stroke[] = [];
    out.push({ d: hEllipse(r, 48, 44, 38, 30, { n: 10, wob: 0.08 }), w: 2.7 });
    out.push({ d: hEllipse(r, 26, 86, 8, 6.5, { n: 8, wob: 0.12 }), w: 2.4 });
    out.push({ d: hEllipse(r, 14, 102, 4.5, 3.6, { n: 7, wob: 0.14 }), w: 2.2 });
    return out;
  });
  return <Ink vb="0 0 100 116" strokes={s} {...p} />;
}

/* ============================================================
 * 品牌角色「Luna」—— 全站统一的原创手绘人物
 * 瘦长比例、微驼肩线、翘起的一撮短发。
 * ============================================================ */

const MASCOT_POSE: Pose = {
  head: [100, 54], hr: 27,
  neck: [100, 84], chest: [100, 104], waist: [102, 150], hip: [103, 186],
  armL: [[70, 106], [56, 138], [60, 172]],
  armR: [[130, 106], [144, 138], [140, 172]],
  legL: [[94, 186], [88, 222], [82, 248]],
  legR: [[112, 186], [116, 222], [120, 248]],
  face: 'smile', hair: 'messy',
};

function withBox(strokes: Stroke[], r: Rnd, cx: number, cy: number, w: number, h: number): Stroke[] {
  const x = cx - w / 2, y = cy - h / 2;
  return [
    ...strokes,
    ...hPoly(r, [[x, y + h * 0.22], [x + w / 2, y], [x + w, y + h * 0.22]], false, { bow: 0.04 }).map(d => ({ d, w: 3 })),
    ...hPoly(r, [[x, y + h * 0.22], [x, y + h], [x + w / 2, y + h * 1.18]], false, { bow: 0.04 }).map(d => ({ d, w: 3 })),
    ...hPoly(r, [[x + w, y + h * 0.22], [x + w, y + h], [x + w / 2, y + h * 1.18]], false, { bow: 0.04 }).map(d => ({ d, w: 3 })),
    ...hPoly(r, [[x, y + h * 0.22], [x + w / 2, y + h * 0.44], [x + w, y + h * 0.22]], false, { bow: 0.05 }).map(d => ({ d, w: 3 })),
    { d: hLine(r, x + w / 2, y + h * 0.44, x + w / 2, y + h * 1.18, { bow: 0.02, over: 0.008 }), w: 2.4 },
  ];
}

/** 吉祥物：双手捧着包装盒 */
export function DoodlePersonHoldingBox(p: DProps) {
  const s = build('mascot', r => {
    const strokes = drawPerson(r, MASCOT_POSE, { w: 3 });
    // 盒子放在身体前方偏下一点，否则会整个被躯干盖住、看不出在"捧着"
    const box = withBox(strokes, r, 100, 202, 84, 56);
    // 两只手压在盒子上沿，交代"捧着"这个动作
    box.push({ d: hLine(r, 60, 172, 58, 186, { bow: 0.06, over: 0.012 }), w: 3 });
    box.push({ d: hLine(r, 140, 172, 142, 186, { bow: 0.06, over: 0.012 }), w: 3 });
    return box;
  });
  return <Ink vb="0 0 200 270" strokes={s} {...p} />;
}

/** 手绘下划线：给标题用的马克笔笔触 */
export function DoodleUnderline(p: DProps) {
  const s = build('underline', r => {
    const out: Stroke[] = [];
    out.push({ d: hPoly(r, [[6, 22], [54, 15], [104, 20], [150, 14], [196, 18]], false, { bow: 0.03, jit: 1 }).join(' '), w: 3.4 });
    out.push({ d: hPoly(r, [[14, 30], [70, 26], [128, 29]], false, { bow: 0.04, jit: 1.2 }).join(' '), w: 2.2, o: 0.55 });
    return out;
  });
  return <Ink vb="0 0 202 36" strokes={s} {...p} />;
}

/** 角色：思考中（手托下巴） */
export function DoodlePersonThinking(p: DProps) {
  const s = build('think', r => {
    const pose: Pose = {
      head: [104, 56], hr: 27,
      neck: [104, 86], chest: [104, 106], waist: [102, 152], hip: [102, 188],
      armL: [[74, 108], [56, 134], [84, 92]],
      armR: [[134, 108], [146, 140], [140, 176]],
      legL: [[94, 188], [88, 222], [82, 248]],
      legR: [[112, 188], [116, 222], [120, 248]],
      face: 'think', hair: 'short',
    };
    const st: Stroke[] = drawPerson(r, pose, { w: 3 });
    st.push({ d: hArc(r, 152, 44, 34, Math.PI * 1.08, Math.PI * 1.95, { n: 6, wob: 0.09 }), w: 2.7 });
    st.push({ d: hDot(r, 168, 36, 4.5), w: 2.6, fill: 'currentColor' });
    st.push({ d: hDot(r, 186, 26, 3), w: 2.4, fill: 'currentColor' });
    return st;
  });
  return <Ink vb="0 0 210 264" strokes={s} {...p} />;
}

/** 角色：正在图纸上绘制 */
export function DoodlePersonDrawing(p: DProps) {
  const s = build('drawing', r => {
    const pose: Pose = {
      head: [92, 58], hr: 27,
      neck: [92, 88], chest: [92, 108], waist: [90, 152], hip: [90, 186],
      armL: [[62, 112], [48, 140], [56, 168]],
      armR: [[122, 110], [140, 138], [148, 164]],
      legL: [[82, 186], [78, 222], [74, 248]],
      legR: [[100, 186], [104, 222], [108, 248]],
      face: 'focus', hair: 'short',
    };
    const st: Stroke[] = drawPerson(r, pose, { w: 3 });
    // 画板
    st.push(...hPoly(r, [[132, 148], [212, 140], [216, 226], [136, 234]], true, { bow: 0.035 }).map(d => ({ d, w: 2.8 })));
    st.push(...hPoly(r, [[148, 166], [190, 161], [192, 192], [150, 197]], true, { bow: 0.05 }).map(d => ({ d, w: 2.2 })));
    // 笔
    st.push({ d: hLine(r, 134, 166, 158, 186, { bow: 0.03 }), w: 2.6 });
    st.push({ d: hDot(r, 158, 187, 3.2), w: 2.4, fill: 'currentColor' });
    return st;
  });
  return <Ink vb="0 0 230 262" strokes={s} {...p} />;
}

/** 角色：拿着尺子测量 */
export function DoodlePersonMeasuring(p: DProps) {
  const s = build('measuring', r => {
    const pose: Pose = {
      head: [88, 56], hr: 26,
      neck: [88, 86], chest: [88, 106], waist: [90, 150], hip: [90, 186],
      armL: [[60, 110], [46, 138], [56, 164]],
      armR: [[116, 108], [134, 132], [146, 158]],
      legL: [[82, 186], [78, 222], [74, 248]],
      legR: [[100, 186], [104, 222], [108, 248]],
      face: 'focus', hair: 'short',
    };
    const st: Stroke[] = drawPerson(r, pose, { w: 3 });
    // 尺子
    st.push(...hPoly(r, [[20, 122], [150, 96], [152, 112], [22, 138]], true, { bow: 0.03 }).map(d => ({ d, w: 2.6 })));
    const ticks: number[][][] = [];
    for (let i = 0; i < 6; i++) {
      const x = 32 + i * 20, y = 120 - i * 4;
      ticks.push([[x, y], [x, y + 9]]);
    }
    st.push(...ticks.map(t => ({ d: hLine(r, t[0][0], t[0][1], t[1][0], t[1][1], { bow: 0.02, over: 0 }), w: 1.8 })));
    return st;
  });
  return <Ink vb="0 0 170 262" strokes={s} {...p} />;
}

/** 角色：正在整理/封装包装 */
export function DoodlePersonPackaging(p: DProps) {
  const s = build('packaging', r => {
    const pose: Pose = {
      head: [80, 56], hr: 26,
      neck: [80, 86], chest: [80, 106], waist: [82, 150], hip: [82, 186],
      armL: [[52, 110], [38, 136], [44, 164]],
      armR: [[108, 108], [126, 130], [138, 154]],
      legL: [[74, 186], [70, 222], [66, 248]],
      legR: [[92, 186], [96, 222], [100, 248]],
      face: 'smile', hair: 'bun',
    };
    const st: Stroke[] = drawPerson(r, pose, { w: 3 });
    // 地面盒堆
    st.push(...hPoly(r, [[112, 178], [148, 164], [184, 178]], false, { bow: 0.04 }).map(d => ({ d, w: 2.8 })));
    st.push(...hPoly(r, [[112, 178], [112, 212], [148, 226], [148, 164]], false, { bow: 0.04 }).map(d => ({ d, w: 2.8 })));
    st.push(...hPoly(r, [[184, 178], [184, 212], [148, 226]], false, { bow: 0.04 }).map(d => ({ d, w: 2.8 })));
    st.push(...hPoly(r, [[124, 146], [160, 132], [196, 146]], false, { bow: 0.04 }).map(d => ({ d, w: 2.8 })));
    st.push(...hPoly(r, [[124, 146], [124, 172], [160, 186], [160, 132]], false, { bow: 0.04 }).map(d => ({ d, w: 2.8 })));
    st.push(...hPoly(r, [[196, 146], [196, 172], [160, 186]], false, { bow: 0.04 }).map(d => ({ d, w: 2.8 })));
    return st;
  });
  return <Ink vb="0 0 212 262" strokes={s} {...p} />;
}

/** 角色：奔跑（抱着盒子） */
export function DoodlePersonRunning(p: DProps) {
  const s = build('running', r => {
    const pose: Pose = {
      head: [96, 52], hr: 25,
      neck: [100, 80], chest: [104, 100], waist: [112, 142], hip: [118, 176],
      armL: [[86, 104], [68, 126], [72, 150]],
      armR: [[122, 100], [146, 124], [146, 150]],
      legL: [[110, 178], [86, 214], [48, 214]],
      legR: [[124, 176], [146, 210], [178, 244]],
      face: 'joy', hair: 'messy',
    };
    const st: Stroke[] = drawPerson(r, pose, { w: 3 });
    st.push(...withBox([], r, 108, 124, 76, 56));
    return st;
  });
  return <Ink vb="0 0 210 240" strokes={s} {...p} />;
}

/** 品牌吉祥物别名 */
export const Mascot = DoodlePersonHoldingBox;
