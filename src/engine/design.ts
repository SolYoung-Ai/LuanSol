/* 设计执行 Agent + 文字排版 Agent
 * 双引擎：① 视觉素材（程序化矢量插画 / 用户配置模型后由真实图像模型生成）
 *        ② 程序化包装设计（真实可编辑文字层、图形层、图层顺序、刀模映射）
 * 严禁把整张生成图当作最终印刷稿：所有文字与图形都是独立图层。 */
import type { DesignBrief, DesignDoc, Face, FaceId, ImageLayer, Layer, Palette, SchemeId, ShapeKind, ShapeLayer, TextLayer, TextRole } from '../types';
import { STYLE_PRESETS } from './brief';
import { faceSizes } from './structure';
import { clamp, escapeXml, ptToMm, readableOn, round, seeded, uid, wrapText } from './utils';

export const FONTS = [
  { id: '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif', label: '现代黑体' },
  { id: '"Songti SC","STSong","Noto Serif CJK SC",serif', label: '优雅宋体' },
  { id: 'Georgia,"Times New Roman",serif', label: '经典衬线' },
  { id: '"Helvetica Neue",Arial,sans-serif', label: '国际无衬线' },
];

export const SCHEME_META: Record<SchemeId, { title: string; en: string; desc: string; tags: string[] }> = {
  minimal: { title: '高级极简', en: 'QUIET MINIMAL', desc: '大留白、克制字距、单一强调色，让品牌名成为唯一主角。', tags: ['留白', '细线', '宋体'] },
  illustration: { title: '创意插画', en: 'ILLUSTRATED', desc: '以原创矢量插画构建氛围，色彩更有记忆点。', tags: ['插画', '层次', '柔和'] },
  commercial: { title: '品牌商业', en: 'BRAND SYSTEM', desc: '色块与网格建立系统感，适合上架与系列化延伸。', tags: ['色块', '网格', '识别度'] },
};

export const cloneDesign = (d: DesignDoc): DesignDoc => JSON.parse(JSON.stringify(d)) as DesignDoc;

/* ---------------- 视觉素材：统一图元（SVG / PDF 共用同一份几何） ---------------- */
export type Prim =
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill: string; opacity: number; rx?: number }
  | { k: 'circle'; cx: number; cy: number; r: number; fill: string; opacity: number }
  | { k: 'poly'; pts: [number, number][]; fill?: string; stroke?: string; strokeWidth?: number; opacity: number; close?: boolean }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number; opacity: number };
const n = (v: number) => round(v, 2);

export function shapePrims(l: ShapeLayer): Prim[] {
  const { w, h, seed } = l;
  const rnd = seeded(seed || 7);
  const f = l.fill, sw = Math.max(0.2, l.strokeWidth || 0.6);
  const out: Prim[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, opacity = 1, stroke = l.stroke || f) =>
    out.push({ k: 'line', x1, y1, x2, y2, stroke, strokeWidth: sw, opacity });
  const circle = (cx: number, cy: number, r: number, opacity = 1) => out.push({ k: 'circle', cx, cy, r, fill: f, opacity });
  switch (l.shape) {
    case 'rect': out.push({ k: 'rect', x: 0, y: 0, w, h, fill: f, opacity: l.opacity, rx: l.rx }); break;
    case 'circle': circle(w / 2, h / 2, Math.min(w, h) / 2, l.opacity); break;
    case 'line': line(0, h / 2, w, h / 2, l.opacity); break;
    case 'mountain': {
      const layers = 3;
      for (let i = 0; i < layers; i++) {
        const base = h * (0.55 + i * 0.16);
        const peaks = 3 + i;
        const pts: [number, number][] = [[0, h], [0, base]];
        for (let j = 0; j <= peaks; j++) {
          const x = (w / peaks) * j;
          const peak = base - h * (0.16 + rnd() * 0.28) * (j % 2 ? 1 : 0.6);
          pts.push([x, peak]);
          if (j < peaks) pts.push([x + w / peaks / 2, base - h * (0.03 + rnd() * 0.08)]);
        }
        pts.push([w, base], [w, h]);
        out.push({ k: 'poly', pts, fill: f, opacity: (0.13 + i * 0.16) * l.opacity, close: true });
      }
      circle(w * 0.76, h * 0.22, Math.min(w, h) * 0.09, 0.42 * l.opacity);
      break;
    }
    case 'wave': {
      for (let i = 0; i < 5; i++) {
        const pts: [number, number][] = [];
        for (let x = 0; x <= w; x += Math.max(2, w / 24)) {
          pts.push([x, h * (0.3 + i * 0.12) + Math.sin((x / w) * Math.PI * 3 + i) * h * 0.05]);
        }
        out.push({ k: 'poly', pts, stroke: f, strokeWidth: sw, opacity: (0.25 + i * 0.12) * l.opacity });
      }
      break;
    }
    case 'sun': {
      circle(w / 2, h / 2, Math.min(w, h) * 0.32, 0.85 * l.opacity);
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12, r1 = Math.min(w, h) * 0.38, r2 = Math.min(w, h) * 0.48;
        line(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1, w / 2 + Math.cos(a) * r2, h / 2 + Math.sin(a) * r2, 0.55);
      }
      break;
    }
    case 'arch': {
      const pts: [number, number][] = [[0, h], [0, h * 0.42]];
      for (let i = 0; i <= 20; i++) { const a = Math.PI - (Math.PI * i) / 20; pts.push([w / 2 + Math.cos(a) * w / 2, h * 0.42 - Math.sin(a) * h * 0.42]); }
      pts.push([w, h]);
      out.push({ k: 'poly', pts, stroke: f, strokeWidth: sw * 2, opacity: 0.75 * l.opacity });
      break;
    }
    case 'grid': {
      const step = Math.max(6, w / 10);
      for (let x = step; x < w; x += step) line(x, 0, x, h, 0.3);
      for (let y = step; y < h; y += step) line(0, y, w, y, 0.3);
      break;
    }
    case 'botanical': {
      for (let b = 0; b < 3; b++) {
        const ox = w * (0.2 + b * 0.3), oy = h * 0.98;
        const pts: [number, number][] = [[ox, oy]];
        for (let i = 1; i <= 8; i++) pts.push([ox + Math.sin(i * 0.5 + b) * w * 0.03, oy - (h * 0.72 * i) / 8]);
        out.push({ k: 'poly', pts, stroke: f, strokeWidth: sw, opacity: 0.6 * l.opacity });
        for (let i = 2; i <= 7; i += 2) {
          const px = pts[i][0], py = pts[i][1], s = (i % 4 ? 1 : -1);
          out.push({ k: 'poly', pts: [[px, py], [px + s * w * 0.07, py - h * 0.05], [px + s * w * 0.02, py - h * 0.1]], fill: f, opacity: 0.35 * l.opacity, close: true });
        }
      }
      break;
    }
    case 'dots': {
      for (let i = 0; i < 46; i++) circle(rnd() * w, rnd() * h, 0.4 + rnd() * Math.min(w, h) * 0.012, 0.2 + rnd() * 0.5);
      break;
    }
    case 'stripes': {
      for (let x = -h; x < w; x += Math.max(5, w / 16)) line(x, h, x + h, 0, 0.35);
      break;
    }
    case 'blob': {
      const pts: [number, number][] = [];
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
      for (let i = 0; i < 28; i++) {
        const a = (Math.PI * 2 * i) / 28;
        const rr = r * (0.78 + 0.22 * Math.sin(a * 3 + seed) + 0.08 * Math.cos(a * 5));
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      out.push({ k: 'poly', pts, fill: f, opacity: 0.75 * l.opacity, close: true });
      break;
    }
    case 'seal': {
      out.push({ k: 'rect', x: 0, y: 0, w, h, fill: f, opacity: 0.9 * l.opacity, rx: Math.min(w, h) * 0.08 });
      out.push({ k: 'rect', x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.8, fill: 'none', opacity: 0.7 * l.opacity });
      break;
    }
  }
  return out;
}

const primSvg = (p: Prim): string => {
  switch (p.k) {
    case 'rect': return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" ${p.rx ? `rx="${n(p.rx)}"` : ''} fill="${p.fill}" opacity="${n(p.opacity)}"/>`;
    case 'circle': return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${p.fill}" opacity="${n(p.opacity)}"/>`;
    case 'poly': return `<${p.close ? 'polygon' : 'polyline'} points="${p.pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="${p.fill || 'none'}" stroke="${p.stroke || 'none'}" stroke-width="${n(p.strokeWidth || 0)}" opacity="${n(p.opacity)}"/>`;
    case 'line': return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${p.stroke}" stroke-width="${n(p.strokeWidth)}" opacity="${n(p.opacity)}"/>`;
  }
};

/* ---------------- 图层 → SVG ---------------- */
export function layerMarkup(l: Layer): string {
  if (l.hidden) return '';
  const t = `translate(${n(l.x)} ${n(l.y)})` + (l.rotation ? ` rotate(${n(l.rotation)} ${n(l.w / 2)} ${n(l.h / 2)})` : '');
  let inner = '';
  if (l.type === 'shape') inner = shapePrims(l).map(primSvg).join('');
  else if (l.type === 'image') inner = `<image href="${l.src}" x="0" y="0" width="${n(l.w)}" height="${n(l.h)}" preserveAspectRatio="${l.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}"/>`;
  else {
    const fs = ptToMm(l.fontSize);
    const lines = wrapText(l.text, Math.max(1, l.w), fs, l.letterSpacing);
    const anchor = l.align === 'center' ? 'middle' : l.align === 'right' ? 'end' : 'start';
    const tx = l.align === 'center' ? l.w / 2 : l.align === 'right' ? l.w : 0;
    const tspans = lines.map((line, i) => `<tspan x="${n(tx)}" ${i ? `dy="${n(fs * l.lineHeight)}"` : ''}>${escapeXml(line)}</tspan>`).join('');
    inner = `<text x="${n(tx)}" y="${n(fs * 0.88)}" fill="${l.color}" font-family="${escapeXml(l.fontFamily)}" font-size="${n(fs)}" font-weight="${l.fontWeight}" letter-spacing="${n(l.letterSpacing)}em" text-anchor="${anchor}" xml:space="preserve">${tspans}</text>`;
  }
  return `<g transform="${t}" opacity="${n(l.opacity)}" data-layer="${l.id}">${inner}</g>`;
}

export function faceMarkup(face: Face, roundClip = false): string {
  const clip = roundClip
    ? `<clipPath id="round"><circle cx="${n(face.w / 2)}" cy="${n(face.h / 2)}" r="${n(Math.min(face.w, face.h) / 2)}"/></clipPath>`
    : '';
  const body = `<rect x="0" y="0" width="${n(face.w)}" height="${n(face.h)}" fill="${face.bg}"/>${face.layers.map(layerMarkup).join('')}`;
  return `${clip}<g ${roundClip ? 'clip-path="url(#round)"' : ''}>${body}</g>`;
}

export function faceSvg(face: Face, opts: { roundClip?: boolean; scale?: number } = {}): string {
  const s = opts.scale || 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(face.w * s)}" height="${n(face.h * s)}" viewBox="0 0 ${n(face.w)} ${n(face.h)}">${faceMarkup(face, !!opts.roundClip)}</svg>`;
}

/* ---------------- 文字智能体：分类 + 视觉层级 + 自动适配 ---------------- */
export interface ClassifiedText { role: TextRole; text: string; placeholder?: boolean }
export function classifyText(b: DesignBrief): ClassifiedText[] {
  const out: ClassifiedText[] = [
    { role: 'brand', text: b.brand || 'LunaSol', placeholder: !b.brand },
    { role: 'product', text: b.product ? `${b.product}${/茶|咖啡|礼|盒|袋|贴/.test(b.product) ? '' : ''}` : '精选好物', placeholder: !b.product },
    { role: 'tagline', text: b.tagline || suggestTagline(b), placeholder: !b.tagline },
    { role: 'info', text: b.spec ? `净含量 ${b.spec.replace(/净含量[:：]?/, '')}` : '净含量：请填写', placeholder: !b.spec },
    { role: 'info', text: b.description || '产品说明：请替换为真实介绍文字', placeholder: !b.description },
    { role: 'legal', text: '配料 / 产地 / 保质期 / 生产信息：请按实际核实后填写', placeholder: true },
  ];
  for (const t of b.extraText) out.push({ role: 'custom', text: t });
  return out;
}

export function suggestTagline(b: DesignBrief) {
  if (/茶/.test(b.product)) return '一盏山野，慢享自然';
  if (/咖啡/.test(b.product)) return '把日常，冲得香一点';
  if (/礼|文创/.test(b.product)) return '把心意，好好包起来';
  if (/美妆|护肤/.test(b.product)) return '留给肌肤一点安静';
  if (/食|零食|果/.test(b.product)) return '好原料，简单做';
  return '为日常，做一点好东西';
}

const baseLayer = (name: string, x: number, y: number, w: number, h: number) => ({
  id: uid('ly'), name, x, y, w, h, rotation: 0, opacity: 1, locked: false,
});

export function makeText(
  name: string, text: string, role: TextRole, box: { x: number; y: number; w: number; h: number },
  o: Partial<TextLayer> = {},
): TextLayer {
  const l: TextLayer = {
    ...baseLayer(name, box.x, box.y, box.w, box.h), type: 'text', text, role,
    fontFamily: FONTS[0].id, fontSize: 18, fontWeight: 400, color: '#1d1d1b',
    align: 'left', letterSpacing: 0.04, lineHeight: 1.5, ...o,
  };
  return fitText(l);
}

/** 字号自适应：空间不足时缩小，仍不足则标记溢出（由印前检查报警，不擅自删字） */
export function fitText(l: TextLayer): TextLayer {
  let fs = l.fontSize;
  while (fs > 5) {
    const fsMm = ptToMm(fs);
    const lines = wrapText(l.text, l.w, fsMm, l.letterSpacing);
    if (lines.length * fsMm * l.lineHeight <= l.h + 0.5) { l.fontSize = fs; return l; }
    fs -= 0.5;
  }
  l.fontSize = 5;
  return l;
}

export function textOverflow(l: TextLayer) {
  const fsMm = ptToMm(l.fontSize);
  return wrapText(l.text, l.w, fsMm, l.letterSpacing).length * fsMm * l.lineHeight > l.h + 0.5;
}

export function makeShape(name: string, shape: ShapeKind, box: { x: number; y: number; w: number; h: number }, o: Partial<ShapeLayer> = {}): ShapeLayer {
  return { ...baseLayer(name, box.x, box.y, box.w, box.h), type: 'shape', shape, fill: '#20463a', stroke: '#20463a', strokeWidth: 0.6, seed: Math.floor(Math.random() * 9000) + 1, ...o };
}

/* ---------------- 设计方案生成 ---------------- */
function pickPalette(b: DesignBrief, scheme: SchemeId): Palette {
  const preset = STYLE_PRESETS.find((p) => p.id === b.style) || STYLE_PRESETS[0];
  const c = b.colors.length ? b.colors : [preset.palette[0], preset.palette[1]];
  const bg = c[0] || preset.palette[0];
  const primary = c[1] || preset.palette[1];
  const accent = c[2] || preset.palette[2];
  const ink = readableOn(bg);
  if (scheme === 'commercial') {
    const dark = readableOn(primary) === '#ffffff' ? primary : '#1d1d1b';
    return { bg: dark, primary: readableOn(dark), accent: accent === dark ? '#c8a86b' : accent, ink: readableOn(dark), muted: readableOn(dark) === '#ffffff' ? '#c9c4b8' : '#6d6a63' };
  }
  return { bg, primary, accent, ink, muted: ink === '#ffffff' ? '#d7d2c6' : '#7d7a72' };
}

interface FaceSpec { w: number; h: number }
function buildFace(id: FaceId, spec: FaceSpec, b: DesignBrief, p: Palette, scheme: SchemeId): Face {
  const { w, h } = spec;
  const m = Math.min(8, Math.max(3, Math.min(w, h) * 0.06));
  const innerW = Math.max(10, w - m * 2);
  const layers: Layer[] = [];
  const texts = classifyText(b);
  const brand = texts.find((t) => t.role === 'brand')!;
  const product = texts.find((t) => t.role === 'product')!;
  const tagline = texts.find((t) => t.role === 'tagline')!;
  const infos = texts.filter((t) => t.role === 'info' || t.role === 'legal' || t.role === 'custom');
  const S = clamp(w * 0.16, 12, 44); // 主标题字号 pt
  const isSmall = id === 'left' || id === 'right' || id === 'top';
  const serif = b.style === '现代东方' || b.style === '复古怀旧' || b.style === '轻奢商业' || scheme === 'minimal';
  const font = serif ? FONTS[1].id : FONTS[0].id;

  if (scheme === 'minimal') {
    if (id === 'front' || id === 'top' || isSmall) {
      layers.push(makeShape('细分割线', 'line', { x: m, y: h * 0.30, w: innerW, h: 1 }, { fill: p.primary, opacity: 0.5 }));
      layers.push(makeText('品牌名称', brand.text, 'brand', { x: m, y: h * 0.10, w: innerW, h: h * 0.17 }, {
        fontFamily: font, fontSize: S, fontWeight: 500, color: p.ink, align: id === 'front' ? 'center' : 'left', letterSpacing: 0.16, lineHeight: 1.2, locked: false,
      }));
      layers.push(makeText('产品名称', product.text, 'product', { x: m, y: h * 0.38, w: innerW, h: h * 0.16 }, {
        fontFamily: font, fontSize: S * 0.62, fontWeight: 400, color: p.ink, align: 'center', letterSpacing: 0.22, lineHeight: 1.3, locked: false,
      }));
      layers.push(makeShape('印章', 'seal', { x: w - m - Math.min(w, h) * 0.13, y: h * 0.54, w: Math.min(w, h) * 0.13, h: Math.min(w, h) * 0.13 }, { fill: p.primary, opacity: 0.9 }));
      if (!isSmall) layers.push(makeText('宣传语', tagline.text, 'tagline', { x: m, y: h * 0.72, w: innerW, h: h * 0.12 }, { fontFamily: font, fontSize: S * 0.31, color: p.ink, align: 'center', letterSpacing: 0.1 }));
      layers.push(makeText('规格', infos[0].text, 'info', { x: m, y: h * 0.88, w: innerW, h: h * 0.08 }, { fontFamily: FONTS[0].id, fontSize: 7, color: p.muted, align: 'center', placeholder: infos[0].placeholder }));
    } else {
      layers.push(...buildInfoFace(spec, b, p, font, S, texts));
    }
  } else if (scheme === 'illustration') {
    const motif: ShapeKind = /山水|云|水墨/.test(b.motif) ? 'mountain' : /植物|花|叶/.test(b.motif) ? 'botanical' : /几何|条纹|波点/.test(b.motif) ? 'stripes' : 'mountain';
    layers.push(makeShape('主插画', motif, { x: 0, y: h * 0.25, w, h: h * 0.75 }, { fill: p.primary, opacity: 0.95, seed: 31 }));
    layers.push(makeShape('点缀', 'sun', { x: w * 0.62, y: h * 0.06, w: w * 0.3, h: h * 0.24 }, { fill: p.accent, opacity: 0.7 }));
    layers.push(makeText('品牌名称', brand.text, 'brand', { x: m, y: h * 0.07, w: innerW * 0.66, h: h * 0.14 }, { fontFamily: font, fontSize: S * 0.78, fontWeight: 600, color: p.ink, locked: false }));
    if (id === 'front' || id === 'top' || isSmall) {
      layers.push(makeShape('标题底板', 'rect', { x: m, y: h * 0.68, w: innerW, h: h * 0.19 }, { fill: p.bg, opacity: 0.86, rx: 1.5 }));
      layers.push(makeText('产品名称', product.text, 'product', { x: m + 3, y: h * 0.69, w: innerW - 6, h: h * 0.12 }, { fontFamily: font, fontSize: S * 0.7, fontWeight: 600, color: p.ink, locked: false }));
      layers.push(makeText('宣传语', tagline.text, 'tagline', { x: m + 3, y: h * 0.81, w: innerW - 6, h: h * 0.06 }, { fontSize: S * 0.3, color: p.ink }));
      layers.push(makeText('规格', infos[0].text, 'info', { x: m, y: h * 0.91, w: innerW, h: h * 0.06 }, { fontSize: 7, color: p.ink, align: 'center', placeholder: infos[0].placeholder }));
    } else layers.push(...buildInfoFace(spec, b, p, font, S, texts));
  } else {
    const bandH = h * 0.2;
    layers.push(makeShape('品牌色块', 'rect', { x: 0, y: 0, w, h: bandH }, { fill: p.primary }));
    layers.push(makeShape('网格', 'grid', { x: 0, y: bandH, w, h: h - bandH }, { fill: p.ink, opacity: 0.14, strokeWidth: 0.25 }));
    layers.push(makeText('品牌名称', brand.text, 'brand', { x: m, y: bandH * 0.22, w: innerW, h: bandH * 0.62 }, { fontFamily: FONTS[3].id, fontSize: S * 0.62, fontWeight: 700, color: p.bg, letterSpacing: 0.12, locked: false }));
    if (id === 'front' || id === 'top' || isSmall) {
      layers.push(makeText('产品名称', product.text, 'product', { x: m, y: h * 0.30, w: innerW, h: h * 0.22 }, { fontFamily: font, fontSize: S * 0.95, fontWeight: 700, color: p.ink, letterSpacing: 0.02, locked: false }));
      layers.push(makeShape('强调线', 'line', { x: m, y: h * 0.56, w: innerW * 0.28, h: 1 }, { fill: p.accent }));
      layers.push(makeText('宣传语', tagline.text, 'tagline', { x: m, y: h * 0.62, w: innerW, h: h * 0.12 }, { fontSize: S * 0.34, color: p.ink }));
      layers.push(makeText('规格', infos[0].text, 'info', { x: m, y: h * 0.86, w: innerW, h: h * 0.08 }, { fontSize: 7.5, color: p.muted, placeholder: infos[0].placeholder }));
    } else layers.push(...buildInfoFace(spec, b, p, font, S, texts));
  }
  return { id, w, h, bg: p.bg, layers };
}

function buildInfoFace(spec: FaceSpec, b: DesignBrief, p: Palette, font: string, S: number, texts: ClassifiedText[]): Layer[] {
  const { w, h } = spec;
  const m = Math.min(8, Math.max(3, Math.min(w, h) * 0.06));
  const innerW = w - m * 2;
  const out: Layer[] = [
    makeText('背面品牌', texts[0].text, 'brand', { x: m, y: h * 0.07, w: innerW, h: h * 0.1 }, { fontFamily: font, fontSize: S * 0.45, color: p.ink, locked: false }),
    makeShape('分隔线', 'line', { x: m, y: h * 0.18, w: innerW, h: 1 }, { fill: p.primary, opacity: 0.6 }),
  ];
  const info = texts.filter((t) => t.role === 'info' || t.role === 'legal' || t.role === 'custom');
  let y = h * 0.23;
  for (const t of info) {
    out.push(makeText(t.role === 'custom' ? '附加文字' : '信息文字', t.text, t.role, { x: m, y, w: innerW, h: h * 0.16 }, { fontSize: 7.5, color: p.ink, lineHeight: 1.65, placeholder: t.placeholder }));
    y += h * 0.17;
  }
  return out;
}

export function buildSchemes(b: DesignBrief): DesignDoc[] {
  const sizes = faceSizes(b.structure, b.size);
  const schemes: SchemeId[] = ['minimal', 'illustration', 'commercial'];
  return schemes.map((scheme) => {
    const palette = pickPalette(b, scheme);
    const faces: Partial<Record<FaceId, Face>> = {};
    for (const [id, spec] of Object.entries(sizes) as [FaceId, FaceSpec][]) {
      faces[id] = buildFace(id, spec, b, palette, scheme);
    }
    const structureNote = b.structure === 'labelRect' || b.structure === 'labelRound' ? '标签结构' : b.structure === 'pouch' ? '自立袋结构' : '折叠纸盒结构';
    return {
      id: uid('design'), name: `${b.brand || 'LunaSol'} · ${SCHEME_META[scheme].title}`,
      scheme, palette, faces, createdAt: Date.now(),
      rationale: `${SCHEME_META[scheme].desc} 依据「${b.style || '现代极简'}」风格、${b.colors.length ? b.colors.join(' / ') : '推荐配色'} 与 ${structureNote} 生成。${
        b.motif ? `视觉元素采用「${b.motif}」方向的原创矢量插画。` : ''} 所有文字均为独立可编辑图层，未使用整张图片充当设计稿。`,
    };
  });
}

export function addImageLayer(design: DesignDoc, faceId: FaceId, img: { src: string; naturalW: number; naturalH: number }, note = 'AI 生成素材'): DesignDoc {
  const next = cloneDesign(design);
  const face = next.faces[faceId];
  if (!face) return next;
  const l: ImageLayer = {
    ...baseLayer(note, face.w * 0.08, face.h * 0.18, face.w * 0.84, face.h * 0.62),
    type: 'image', src: img.src, naturalW: img.naturalW, naturalH: img.naturalH, fit: 'cover',
  };
  face.layers.unshift(l);
  return next;
}

export function findLayer(design: DesignDoc, id: string): { face: Face; layer: Layer; index: number } | null {
  for (const face of Object.values(design.faces)) {
    if (!face) continue;
    const index = face.layers.findIndex((l) => l.id === id);
    if (index >= 0) return { face, layer: face.layers[index], index };
  }
  return null;
}

export function allLayers(design: DesignDoc): Layer[] {
  return Object.values(design.faces).filter(Boolean).flatMap((f) => (f as Face).layers);
}

export function layerLabel(l: Layer) { return l.name; }
