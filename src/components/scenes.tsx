import React from 'react';
import { makeRnd, hLine, hPoly, hEllipse, hArc, hDot, hSmooth, drawPerson, type Pose, type Rnd } from './hand';
import { Ink, type DProps } from './doodle';

/** 场景内部使用的笔画描述 */
interface S { d: string; w?: number; o?: number; fill?: string }

/* ============================================================
 * LunaSol 叙事场景 (narrative scenes)
 * ------------------------------------------------------------
 * 每一幅都是"有故事的画面"，而不是几个独立小图标的拼贴：
 *   A 桌前创作 —— 人物伏案，剪刀、纸张、盒子和草稿都在同一张桌子上
 *   B 开箱惊喜 —— 巨大的纸盒被打开，星星、植物和图案从里面冒出来
 *   C 抱着奔跑 —— 人物抱着包装盒跑，后面拖一串不规则涂鸦
 *   D 笔变成盒 —— 人物握笔作画，线条一路延伸长成真正的包装盒
 * ============================================================ */

const cache = new Map<string, S[]>();
function build(key: string, fn: (r: Rnd) => S[]): S[] {
  let v = cache.get(key);
  if (!v) { v = fn(makeRnd(hash(key))); cache.set(key, v); }
  return v;
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------- 通用零件 ---------- */

/**
 * 制图工作台：一块有厚度的台面 + 外八桌腿 + 一道横撑。
 * 台面前沿要略带起伏，纯直线会立刻暴露"几何线条"。
 */
function table(r: Rnd, x: number, y: number, w: number, depth: number, legH: number): S[] {
  const out: S[] = [];
  // 台面板（前缘微微起伏）
  out.push(...hPoly(r, [[x, y], [x + w * 0.5, y - 1.5], [x + w, y + 1], [x + w, y + depth], [x + w * 0.5, y + depth + 1.5], [x, y + depth]], true, { bow: 0.014, jit: 0.8 }).map(d => ({ d, w: 2.9 })));
  // 台面下的围板
  out.push({ d: hLine(r, x + 4, y + depth + 12, x + w - 5, y + depth + 10, { bow: 0.012, over: 0.005 }), w: 2.1, o: 0.8 });
  // 抽屉 + 把手（把大片空白的前脸切开）
  const dy = y + depth + 26;
  out.push(...hPoly(r, [[x + 26, dy], [x + w - 28, dy - 2], [x + w - 28, dy + 40], [x + 27, dy + 42]], true, { bow: 0.016, jit: 0.8 }).map(d => ({ d, w: 2.2 })));
  out.push({ d: hLine(r, x + w / 2 - 22, dy + 20, x + w / 2 + 22, dy + 18, { bow: 0.05, over: 0.012 }), w: 2.2 });
  // 桌腿（外八，带弧度）
  out.push(...hPoly(r, [[x + 18, y + depth], [x + 9, y + depth + legH * 0.55], [x + 14, y + depth + legH]], false, { bow: 0.035, jit: 0.8 }).map(d => ({ d, w: 2.6 })));
  out.push(...hPoly(r, [[x + w - 18, y + depth], [x + w - 9, y + depth + legH * 0.55], [x + w - 14, y + depth + legH]], false, { bow: 0.035, jit: 0.8 }).map(d => ({ d, w: 2.6 })));
  // 横撑
  out.push({ d: hLine(r, x + 12, y + depth + legH * 0.66, x + w - 13, y + depth + legH * 0.63, { bow: 0.02, over: 0.006 }), w: 2 });
  // 底下垫着的一叠废纸
  out.push(...hPoly(r, [[x + 26, y + depth + legH - 26], [x + 84, y + depth + legH - 30], [x + 86, y + depth + legH - 12], [x + 28, y + depth + legH - 8]], true, { bow: 0.03, jit: 0.7 }).map(d => ({ d, w: 2 })));
  return out;
}

/** 小纸盒（等轴测），可选正面标签 */
function smallBox(r: Rnd, x: number, y: number, w: number, h: number, lw = 2.8, label = false): S[] {
  const d = h * 0.42;
  const out: S[] = [
    ...hPoly(r, [[x, y + d], [x + w / 2, y], [x + w, y + d]], false, { bow: 0.04 }).map(p => ({ d: p, w: lw })),
    ...hPoly(r, [[x, y + d], [x, y + h], [x + w / 2, y + h + d]], false, { bow: 0.04 }).map(p => ({ d: p, w: lw })),
    ...hPoly(r, [[x + w, y + d], [x + w, y + h], [x + w / 2, y + h + d]], false, { bow: 0.04 }).map(p => ({ d: p, w: lw })),
    ...hPoly(r, [[x, y + d], [x + w / 2, y + d * 2], [x + w, y + d]], false, { bow: 0.05 }).map(p => ({ d: p, w: lw })),
  ];
  if (label) {
    // 正面一块标签 + 一行"文字"
    out.push(...hPoly(r, [[x + w * 0.14, y + h * 0.34], [x + w * 0.42, y + h * 0.34], [x + w * 0.42, y + h * 0.62], [x + w * 0.14, y + h * 0.62]], true, { bow: 0.03, jit: 0.5 }).map(p => ({ d: p, w: lw * 0.72 })));
    out.push({ d: hLine(r, x + w * 0.17, y + h * 0.44, x + w * 0.39, y + h * 0.43, { bow: 0.05 }), w: lw * 0.6 });
    out.push({ d: hLine(r, x + w * 0.17, y + h * 0.53, x + w * 0.33, y + h * 0.52, { bow: 0.05 }), w: lw * 0.6 });
  }
  return out;
}

/** 摊在桌上的草图纸：纸 + 一个盒子草稿 + 两笔标注 */
function sketchSheet(r: Rnd, x: number, y: number, w: number, h: number): S[] {
  const out: S[] = [];
  out.push(...hPoly(r, [[x, y + 4], [x + w - 3, y], [x + w, y + h - 3], [x + 3, y + h]], true, { bow: 0.025, jit: 0.6 }).map(d => ({ d, w: 2.3 })));
  // 纸上画着的一个小盒草稿
  const bx = x + w * 0.16, by = y + h * 0.3, bw = w * 0.32, bh = h * 0.42;
  out.push(...hPoly(r, [[bx, by + 3], [bx + bw / 2, by], [bx + bw, by + 3]], false, { bow: 0.05 }).map(d => ({ d, w: 1.9 })));
  out.push(...hPoly(r, [[bx, by + 3], [bx, by + bh], [bx + bw / 2, by + bh + 3]], false, { bow: 0.05 }).map(d => ({ d, w: 1.9 })));
  out.push(...hPoly(r, [[bx + bw, by + 3], [bx + bw, by + bh], [bx + bw / 2, by + bh + 3]], false, { bow: 0.05 }).map(d => ({ d, w: 1.9 })));
  out.push({ d: hLine(r, x + w * 0.6, y + h * 0.44, x + w * 0.86, y + h * 0.38, { bow: 0.1 }), w: 1.8 });
  out.push({ d: hLine(r, x + w * 0.62, y + h * 0.64, x + w * 0.8, y + h * 0.62, { bow: 0.1 }), w: 1.7 });
  return out;
}

/** 马克笔杯：杯身 + 把手 + 几支笔 */
function mug(r: Rnd, x: number, y: number, w: number, h: number): S[] {
  const out: S[] = [];
  out.push(...hPoly(r, [[x, y + 4], [x + w, y], [x + w - 2, y + h], [x + 3, y + h + 2]], true, { bow: 0.035, jit: 0.7 }).map(d => ({ d, w: 2.5 })));
  out.push(...hPoly(r, [[x + w, y + h * 0.3], [x + w + 13, y + h * 0.34], [x + w + 12, y + h * 0.62], [x + w - 1, y + h * 0.64]], false, { bow: 0.05, jit: 0.5 }).map(d => ({ d, w: 2.2 })));
  return out;
}

function star(r: Rnd, cx: number, cy: number, R: number, w = 2.7): S {
  const pts: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : R * 0.42;
    pts.push([cx + Math.cos(a) * rad * (1 + (r() - 0.5) * 0.14), cy + Math.sin(a) * rad * (1 + (r() - 0.5) * 0.14)]);
  }
  return { d: hPoly(r, pts, true, { bow: 0.03, jit: 0.7 }).join(' '), w };
}

function leaf(r: Rnd, cx: number, cy: number, R: number, ang: number, w = 2.5): S[] {
  const c = Math.cos(ang), s = Math.sin(ang);
  const p = (x: number, y: number) => [cx + x * c - y * s, cy + x * s + y * c] as [number, number];
  const a = p(-R, 0), b = p(0, -R * 0.62), c2 = p(R, 0), d = p(0, R * 0.62);
  return [
    { d: hSmooth(r, [a, b, c2, d], true, 0.9), w },
    { d: hLine(r, a[0], a[1], c2[0], c2[1], { bow: 0.05 }), w: w - 0.6 },
  ];
}

function flower(r: Rnd, cx: number, cy: number, R: number, w = 2.4): S[] {
  const out: S[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    out.push({ d: hEllipse(r, cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, R * 0.34, R * 0.28, { n: 7, wob: 0.15, jit: 0.6 }), w });
  }
  out.push({ d: hDot(r, cx, cy, R * 0.24), w: w - 0.4, fill: 'currentColor' });
  return out;
}

function squiggle(r: Rnd, x: number, y: number, len: number, w = 2.3): S {
  const pts: number[][] = [];
  const n = Math.max(3, Math.round(len / 14));
  for (let i = 0; i <= n; i++) {
    pts.push([x + (len * i) / n, y + Math.sin(i * 1.9 + r() * 0.6) * (5 + r() * 4)]);
  }
  return { d: hPoly(r, pts, false, { bow: 0.05, jit: 0.9 }).join(' '), w };
}

function sparkle(r: Rnd, cx: number, cy: number, R: number, w = 2.4): S {
  const pts: number[][] = [
    [cx, cy - R], [cx + R * 0.26, cy - R * 0.26], [cx + R, cy],
    [cx + R * 0.26, cy + R * 0.26], [cx, cy + R], [cx - R * 0.26, cy + R * 0.26],
    [cx - R, cy], [cx - R * 0.26, cy - R * 0.26],
  ];
  return { d: hPoly(r, pts, true, { bow: 0.05, jit: 0.7 }).join(' '), w };
}

/** 一支笔（笔杆 + 笔尖墨点） */
function pencil(r: Rnd, x1: number, y1: number, x2: number, y2: number, w = 2.6): S[] {
  return [
    { d: hLine(r, x1, y1, x2, y2, { bow: 0.04, over: 0.01 }), w },
    { d: hDot(r, x2, y2, 3.2), w: w - 0.3, fill: 'currentColor' },
  ];
}

/**
 * 手绘箭头：从 A 弯到 B，带一个箭头。
 * 画在场景内部（而不是 HTML 覆盖层），批注就永远不会指错东西。
 */
function handArrow(r: Rnd, ax: number, ay: number, bx: number, by: number, w = 2.4): S[] {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const bow = (r() - 0.5) * 0.3 * len;
  const mx = (ax + bx) / 2 + nx * bow, my = (ay + by) / 2 + ny * bow;
  const hl = len * 0.19;
  const a1: [number, number] = [bx - ux * hl + nx * hl * 0.5, by - uy * hl + ny * hl * 0.5];
  const a2: [number, number] = [bx - ux * hl - nx * hl * 0.5, by - uy * hl - ny * hl * 0.5];
  return [
    { d: hSmooth(r, [[ax, ay], [mx, my], [bx, by]], false, 0.8), w },
    { d: hLine(r, a1[0], a1[1], bx, by, { bow: 0.02, over: 0 }), w: w * 0.95 },
    { d: hLine(r, a2[0], a2[1], bx, by, { bow: 0.02, over: 0 }), w: w * 0.95 },
  ];
}

/**
 * 敞开的纸箱（从略高于箱口的角度看进去）：
 * 内底菱形 + 箱口 + 前后两个箱面 + 向上翻开的两个箱盖。
 */
function openCarton(r: Rnd, cx: number, top: number, w: number, h: number, lw = 3.1): S[] {
  const out: S[] = [];
  const hw = w / 2;
  const dy = h * 0.42;                       // 透视深度
  const rimL: [number, number] = [cx - hw, top + dy * 0.62];
  const rimT: [number, number] = [cx, top];
  const rimR: [number, number] = [cx + hw, top + dy * 0.62];
  const rimB: [number, number] = [cx, top + dy * 1.24];
  const botB: [number, number] = [cx, top + dy * 1.24 + h];

  // 内底（往里收一圈，读起来才有"能往里看"的深度）
  const k = 0.3;
  const inL: [number, number] = [cx - hw * (1 - k), top + dy * 0.62 + dy * 0.18];
  const inT: [number, number] = [cx, top + dy * 0.42];
  const inR: [number, number] = [cx + hw * (1 - k), top + dy * 0.62 + dy * 0.18];
  const inB: [number, number] = [cx, top + dy * 1.24 - dy * 0.18];
  out.push({ d: hSmooth(r, [inL, inT, inR, inB], true, 0.9), w: lw * 0.78 });

  // 箱口
  out.push(...hPoly(r, [rimL, rimT, rimR, rimB], true, { bow: 0.028, jit: 0.8 }).map(d => ({ d, w: lw })));
  // 前左箱面
  out.push(...hPoly(r, [rimL, rimB, botB, [rimL[0], rimL[1] + h]], false, { bow: 0.028, jit: 0.8 }).map(d => ({ d, w: lw })));
  // 前右箱面
  out.push(...hPoly(r, [rimB, rimR, [rimR[0], rimR[1] + h], botB], false, { bow: 0.028, jit: 0.8 }).map(d => ({ d, w: lw })));
  // 竖直折角线
  out.push({ d: hLine(r, rimB[0], rimB[1], botB[0], botB[1], { bow: 0.02, over: 0.008 }), w: lw * 0.8 });

  // 向上翻开的两个箱盖
  const f1: [number, number] = [rimL[0] - 46, rimL[1] - 58];
  const f2: [number, number] = [rimT[0] - 40, rimT[1] - 58];
  const g1: [number, number] = [rimT[0] + 40, rimT[1] - 58];
  const g2: [number, number] = [rimR[0] + 46, rimR[1] - 58];
  out.push(...hPoly(r, [rimL, f1, f2, rimT], true, { bow: 0.04, jit: 0.9 }).map(d => ({ d, w: lw * 0.92 })));
  out.push(...hPoly(r, [rimT, g1, g2, rimR], true, { bow: 0.04, jit: 0.9 }).map(d => ({ d, w: lw * 0.92 })));
  return out;
}

/* ============================================================
 * 场景 A：桌前创作
 * ============================================================ */
export function SceneStudio(p: DProps) {
  const s = build('scene-studio', r => {
    const out: S[] = [];
    // 地面
    out.push({ d: hLine(r, 16, 322, 404, 318, { bow: 0.012, over: 0.004 }), w: 2.4 });

    // 人物：站在工作台后面俯身作画（先画 → 被台面遮住下半身，更像"在桌后"）
    const pose: Pose = {
      head: [138, 92], hr: 25,
      neck: [137, 120], chest: [136, 140], waist: [132, 168], hip: [128, 196],
      armL: [[108, 146], [92, 176], [96, 208]],
      armR: [[164, 144], [180, 168], [192, 194]],
      legL: [[118, 196], [110, 248], [102, 304]],
      legR: [[140, 196], [152, 248], [162, 302]],
      face: 'focus', hair: 'messy', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3 }));

    // 工作台
    out.push(...table(r, 92, 224, 248, 18, 82));
    // 草图纸
    out.push(...sketchSheet(r, 196, 206, 108, 28));
    // 剪刀
    out.push(...hPoly(r, [[286, 210], [324, 199]], false, { bow: 0.04 }).map(d => ({ d, w: 2.4 })));
    out.push(...hPoly(r, [[292, 218], [330, 207]], false, { bow: 0.04 }).map(d => ({ d, w: 2.4 })));
    out.push({ d: hEllipse(r, 284, 220, 9.5, 7.5, { n: 8, wob: 0.1 }), w: 2.2 });
    out.push({ d: hEllipse(r, 296, 229, 9.5, 7.5, { n: 8, wob: 0.1 }), w: 2.2 });
    // 胶带
    out.push({ d: hEllipse(r, 122, 216, 19, 8.5, { n: 8, wob: 0.09 }), w: 2.4 });
    out.push({ d: hEllipse(r, 122, 216, 8.5, 3.8, { n: 7, wob: 0.12 }), w: 2 });
    // 立着的小盒
    out.push(...smallBox(r, 312, 172, 40, 34, 2.5));
    // 笔（压在纸上，落在最上层）
    out.push(...pencil(r, 194, 194, 218, 212, 2.6));
    // 头顶的灵感小圈
    out.push({ d: hEllipse(r, 172, 64, 9, 7.5, { n: 7, wob: 0.13 }), w: 2.1 });
    out.push(star(r, 196, 42, 11, 2.3));
    return out;
  });
  return <Ink vb="0 0 420 340" strokes={s} {...p} />;
}

/* ============================================================
 * 场景 B：打开巨大的纸盒，创意从里面冒出来
 * ============================================================ */
export function SceneBigBox(p: DProps) {
  const s = build('scene-bigbox', r => {
    const out: S[] = [];
    // 地面
    out.push({ d: hLine(r, 16, 302, 404, 298, { bow: 0.012, over: 0.004 }), w: 2.4 });
    // 巨大的敞口纸箱
    out.push(...openCarton(r, 252, 170, 190, 108, 3.2));

    // 人物：站在盒子左侧，抬手把盖子掀开
    const pose: Pose = {
      head: [74, 112], hr: 24,
      neck: [80, 140], chest: [88, 158], waist: [100, 184], hip: [112, 208],
      armL: [[61, 164], [44, 152], [36, 124]],
      armR: [[115, 160], [136, 146], [148, 116]],
      legL: [[102, 208], [92, 250], [82, 292]],
      legR: [[124, 206], [136, 248], [148, 290]],
      face: 'joy', hair: 'short', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3 }));

    // 从盒里冒出来的创意
    out.push(star(r, 214, 108, 19, 2.8));
    out.push(star(r, 300, 70, 13, 2.4));
    out.push(sparkle(r, 348, 130, 12, 2.3));
    out.push(...leaf(r, 178, 74, 21, -0.7, 2.5));
    out.push(...leaf(r, 262, 40, 16, 0.5, 2.3));
    out.push(...flower(r, 336, 56, 13, 2.2));
    out.push(squiggle(r, 166, 134, 50, 2.1));
    out.push(squiggle(r, 300, 22, 42, 2));
    out.push({ d: hDot(r, 140, 58, 3.6), w: 2.2, fill: 'currentColor' });
    out.push({ d: hDot(r, 372, 100, 3), w: 2, fill: 'currentColor' });
    return out;
  });
  return <Ink vb="0 0 420 320" strokes={s} {...p} />;
}

/* ============================================================
 * 场景 C：抱着包装盒奔跑，后面拖一串涂鸦
 * ============================================================ */
export function SceneRun(p: DProps) {
  const s = build('scene-run', r => {
    const out: S[] = [];
    // 地面（带速度感的弧线）
    out.push({ d: hLine(r, 14, 268, 402, 264, { bow: 0.012, over: 0.004 }), w: 2.4 });
    // 身后拖的涂鸦尾迹
    out.push(squiggle(r, 24, 198, 60, 2.3));
    out.push(squiggle(r, 42, 152, 46, 2.1));
    out.push({ d: hEllipse(r, 50, 228, 13, 11, { n: 9, wob: 0.12 }), w: 2.1 });
    out.push(star(r, 34, 106, 12, 2.2));
    out.push(sparkle(r, 80, 76, 10, 2));
    out.push({ d: hDot(r, 20, 152, 3.4), w: 2, fill: 'currentColor' });
    // 速度线
    out.push({ d: hLine(r, 116, 120, 162, 114, { bow: 0.06, over: 0.01 }), w: 2 });
    out.push({ d: hLine(r, 130, 142, 172, 138, { bow: 0.06, over: 0.01 }), w: 1.9 });

    // 人物：向前奔跑，怀里抱着盒子
    const pose: Pose = {
      head: [248, 84], hr: 25,
      neck: [254, 112], chest: [260, 130], waist: [268, 168], hip: [274, 198],
      armL: [[232, 136], [214, 158], [234, 182]],
      armR: [[288, 134], [310, 158], [288, 184]],
      legL: [[266, 198], [228, 220], [182, 210]],
      legR: [[282, 196], [316, 220], [356, 252]],
      face: 'joy', hair: 'messy', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3 }));
    // 怀里的盒子
    out.push(...smallBox(r, 228, 140, 68, 48, 2.9));
    // 盒子上冒出的创意小元素
    out.push(star(r, 264, 116, 12, 2.3));
    out.push(squiggle(r, 296, 128, 32, 2));
    out.push({ d: hDot(r, 230, 114, 3), w: 2, fill: 'currentColor' });
    return out;
  });
  return <Ink vb="0 0 420 300" strokes={s} {...p} />;
}

/* ============================================================
 * 场景 D：握笔作画，线条一路长成真正的包装盒
 * ============================================================ */
export function SceneSketch(p: DProps) {
  const s = build('scene-sketch', r => {
    const out: S[] = [];
    out.push({ d: hLine(r, 16, 268, 402, 264, { bow: 0.012, over: 0.004 }), w: 2.4 });
    // 人物：站着握笔
    const pose: Pose = {
      head: [86, 96], hr: 26,
      neck: [90, 126], chest: [94, 146], waist: [100, 184], hip: [104, 214],
      armL: [[66, 152], [48, 180], [54, 210]],
      armR: [[122, 150], [140, 166], [158, 182]],
      legL: [[96, 214], [90, 238], [86, 262]],
      legR: [[114, 214], [118, 238], [122, 262]],
      face: 'focus', hair: 'short', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3 }));
    // 笔
    out.push(...pencil(r, 162, 184, 182, 194));
    // 从笔尖延伸的线：先是波浪，然后逐渐立起来变成盒子
    const pts: number[][] = [];
    for (let i = 0; i <= 9; i++) {
      const t = i / 9;
      const x = 184 + t * 74;
      const y = 196 - Math.pow(t, 1.7) * 96 + Math.sin(i * 1.4) * 5;
      pts.push([x, y]);
    }
    out.push({ d: hPoly(r, pts, false, { bow: 0.05, jit: 0.9 }).join(' '), w: 2.7 });
    // 线最终变成的包装盒
    out.push(...smallBox(r, 258, 90, 92, 62, 3.1, true));
    // 盒子上的一点标注
    out.push({ d: hLine(r, 266, 120, 324, 120, { bow: 0.07 }), w: 2 });
    out.push({ d: hLine(r, 304, 98, 304, 146, { bow: 0.05, over: 0.01 }), w: 2 });
    // 零散涂鸦
    out.push(star(r, 340, 44, 13, 2.4));
    out.push({ d: hDot(r, 228, 60, 3.4), w: 2.2, fill: 'currentColor' });
    out.push(sparkle(r, 190, 72, 9, 2));
    return out;
  });
  return <Ink vb="0 0 420 300" strokes={s} {...p} />;
}

/* ============================================================
 * 首页主视觉：一整幅跨栏的宽场景
 * 左边整片留白给标题浮层；中段是工作台与正在干活的人；
 * 最右边是一只被打开的大纸箱，创意从箱口涌出来。
 * ============================================================ */
export function HeroScene(p: DProps) {
  const s = build('hero-scene', r => {
    const out: S[] = [];

    /* ---------- 地面 ---------- */
    out.push({ d: hLine(r, 8, 448, 1392, 442, { bow: 0.008, over: 0.003 }), w: 2.6 });
    // 地面的碎纸与小石子
    out.push({ d: hLine(r, 742, 434, 766, 431, { bow: 0.06, over: 0.02 }), w: 1.9, o: 0.8 });
    out.push({ d: hLine(r, 1330, 430, 1352, 428, { bow: 0.06, over: 0.02 }), w: 1.9, o: 0.8 });

    /* ---------- 工作台（人物右手边） ---------- */
    out.push(...table(r, 690, 252, 370, 18, 178));

    /* ---------- 主角：站在工作台旁，一手按纸一手握笔 ---------- */
    const pose: Pose = {
      head: [612, 122], hr: 30,
      neck: [614, 156], chest: [612, 174], waist: [608, 224], hip: [604, 274],
      armL: [[573, 180], [560, 226], [558, 272]],
      armR: [[651, 178], [672, 202], [700, 228]],
      legL: [[586, 280], [576, 350], [570, 428]],
      legR: [[622, 280], [632, 350], [640, 428]],
      face: 'focus', hair: 'messy', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3.1 }));

    /* ---------- 台面上的东西 ---------- */
    // 草图纸
    out.push(...sketchSheet(r, 712, 224, 130, 34));
    // 笔（压在纸上，最后画，保证压在最上层）
    out.push(...pencil(r, 698, 226, 730, 250, 2.7));
    // 已经做好的小盒（带标签）
    out.push(...smallBox(r, 858, 186, 62, 46, 2.8, true));
    // 马克笔杯
    out.push(...mug(r, 938, 210, 36, 44));
    out.push({ d: hLine(r, 950, 212, 946, 186, { bow: 0.04, over: 0.01 }), w: 2.2 });
    out.push({ d: hLine(r, 960, 210, 966, 182, { bow: 0.04, over: 0.01 }), w: 2.2 });
    // 胶带
    out.push({ d: hEllipse(r, 1014, 252, 21, 9, { n: 8, wob: 0.09 }), w: 2.4 });
    out.push({ d: hEllipse(r, 1014, 252, 9, 4, { n: 7, wob: 0.12 }), w: 2 });

    /* ---------- 中上方：漂浮的成品盒与涂鸦 ---------- */
    out.push(...smallBox(r, 756, 44, 58, 44, 2.8, true));
    out.push({ d: hEllipse(r, 785, 28, 7.5, 6, { n: 7, wob: 0.13 }), w: 2 });
    out.push(star(r, 700, 62, 12, 2.3));
    out.push(squiggle(r, 660, 96, 46, 2.1));
    out.push(sparkle(r, 872, 122, 11, 2.1));
    out.push({ d: hDot(r, 648, 46, 3.2), w: 2.1, fill: 'currentColor' });

    /* ---------- 最右边：被打开的大纸箱 + 涌出来的创意 ---------- */
    out.push(...openCarton(r, 1196, 258, 236, 90, 3.2));
    out.push(star(r, 1116, 166, 22, 2.9));
    out.push(star(r, 1262, 118, 15, 2.5));
    out.push(sparkle(r, 1356, 196, 14, 2.3));
    out.push(...leaf(r, 1066, 186, 22, -0.8, 2.5));
    out.push(...leaf(r, 1200, 122, 18, 0.6, 2.4));
    out.push(...flower(r, 1316, 86, 15, 2.3));
    out.push(squiggle(r, 1148, 100, 54, 2.1));
    out.push(squiggle(r, 1286, 52, 44, 2));
    out.push({ d: hDot(r, 1382, 150, 3.6), w: 2.2, fill: 'currentColor' });
    out.push({ d: hDot(r, 1020, 128, 3.2), w: 2.1, fill: 'currentColor' });

    /* ---------- 批注箭头（画在场景里，永远指得准） ---------- */
    // 「一张纸就能开始」→ 指向台面上的草稿纸
    out.push(...handArrow(r, 772, 186, 780, 220, 2.3));
    // 「真的能印出来」→ 指向漂浮的成品盒
    out.push(...handArrow(r, 848, 76, 822, 92, 2.3));

    return out;
  });
  return <Ink vb="0 0 1400 464" strokes={s} {...p} />;
}

/* ============================================================
 * 「我们是谁」用图：一个人打开装满创意的盒子
 * ============================================================ */
export function SceneIdeas(p: DProps) {
  const s = build('scene-ideas', r => {
    const out: S[] = [];
    out.push({ d: hLine(r, 14, 300, 386, 296, { bow: 0.012, over: 0.004 }), w: 2.4 });
    // 人：站在盒子左侧，弯身抱住装满创意的盒子
    const pose: Pose = {
      head: [76, 100], hr: 25,
      neck: [82, 128], chest: [90, 146], waist: [102, 172], hip: [112, 196],
      armL: [[62, 152], [52, 182], [52, 214]],
      armR: [[118, 148], [130, 166], [152, 188]],
      legL: [[102, 196], [92, 240], [84, 286]],
      legR: [[124, 194], [138, 236], [150, 284]],
      face: 'joy', hair: 'bun', facing: 1,
    };
    out.push(...drawPerson(r, pose, { w: 3 }));
    // 大盒子（被抱住）——要正好落在地面上
    out.push(...smallBox(r, 158, 148, 158, 104, 3));
    // 盒子里冒出来的创意
    out.push(star(r, 192, 116, 17, 2.7));
    out.push(star(r, 264, 96, 12, 2.3));
    out.push(sparkle(r, 298, 136, 11, 2.2));
    out.push(...leaf(r, 228, 88, 19, -0.6, 2.4));
    out.push(...flower(r, 290, 76, 13, 2.2));
    out.push(squiggle(r, 148, 94, 50, 2.1));
    out.push({ d: hDot(r, 136, 72, 3.4), w: 2.2, fill: 'currentColor' });
    out.push({ d: hDot(r, 326, 112, 3), w: 2, fill: 'currentColor' });
    return out;
  });
  return <Ink vb="0 0 400 320" strokes={s} {...p} />;
}
