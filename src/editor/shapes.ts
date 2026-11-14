/* ============================================================
 * 设计台 · 形状 / 贴纸 定义
 * ------------------------------------------------------------
 * 形状面板分组（基本 / 装饰 / 更多基础 / 线条箭头 / 更多形状），
 * 贴纸面板分组（Basic Shapes / Lines & Dividers / Frames 等），
 * 两者共用一组 SVG 图标数据，落到画布时交给 engine 对应的 kind 处理。
 * ============================================================ */

export interface ShapeDef {
  id: string;
  name: { zh: string; en: string };
  /** engine.addShape 用的 kind，或贴纸的 svg 路径 */
  kind?: string;
  svg?: string;
  fill?: string;
}

export interface ShapeGroup {
  id: string;
  name: { zh: string; en: string };
  items: ShapeDef[];
}

/* 形状面板分组 */
export const SHAPE_GROUPS: ShapeGroup[] = [
  {
    id: 'basic', name: { zh: '基本形状', en: 'Basic' },
    items: [
      { id: 'rect', name: { zh: '矩形', en: 'Rectangle' }, kind: 'rect' },
      { id: 'circle', name: { zh: '圆形', en: 'Circle' }, kind: 'circle' },
      { id: 'triangle', name: { zh: '三角形', en: 'Triangle' }, kind: 'triangle' },
      { id: 'line', name: { zh: '直线', en: 'Line' }, kind: 'line' },
    ],
  },
  {
    id: 'decor', name: { zh: '装饰性', en: 'Decorative' },
    items: [
      { id: 'star', name: { zh: '星形', en: 'Star' }, kind: 'star' },
      { id: 'diamond', name: { zh: '菱形', en: 'Diamond' }, kind: 'diamond' },
      { id: 'divider', name: { zh: '分割线', en: 'Divider' }, kind: 'divider' },
      { id: 'frame', name: { zh: '相框', en: 'Frame' }, kind: 'frame' },
    ],
  },
  {
    id: 'more-basic', name: { zh: '更多基础图形', en: 'More basic' },
    items: [
      { id: 'roundRect', name: { zh: '圆角矩形', en: 'Rounded' }, kind: 'roundRect' },
      { id: 'hexagon', name: { zh: '多边形', en: 'Polygon' }, kind: 'hexagon' },
    ],
  },
  {
    id: 'lines-arrows', name: { zh: '线条和箭头', en: 'Lines & arrows' },
    items: [
      { id: 'arrow', name: { zh: '箭头', en: 'Arrow' }, kind: 'arrow' },
      { id: 'doubleArrow', name: { zh: '双箭头', en: 'Double arrow' }, kind: 'doubleArrow' },
      { id: 'dashedLine', name: { zh: '虚线', en: 'Dashed' }, kind: 'dashedLine' },
    ],
  },
  {
    id: 'more-shapes', name: { zh: '更多形状', en: 'More shapes' },
    items: [
      { id: 'heart', name: { zh: '心形', en: 'Heart' }, kind: 'heart' },
      { id: 'speech', name: { zh: '对话框', en: 'Speech' }, kind: 'speech' },
      { id: 'plus', name: { zh: '加号', en: 'Plus' }, kind: 'plus' },
      { id: 'diamond2', name: { zh: '菱形', en: 'Diamond' }, kind: 'diamond' },
      { id: 'trapezoid', name: { zh: '梯形', en: 'Trapezoid' }, kind: 'trapezoid' },
      { id: 'halfCircle', name: { zh: '半圆', en: 'Semicircle' }, kind: 'halfCircle' },
      { id: 'ring', name: { zh: '环形', en: 'Ring' }, kind: 'ring' },
      { id: 'cloud', name: { zh: '云朵', en: 'Cloud' }, kind: 'cloud' },
      { id: 'bolt', name: { zh: '闪电', en: 'Bolt' }, kind: 'bolt' },
    ],
  },
];

/* 贴纸面板分组（用 SVG 直接渲染的装饰图形） */
export const STICKER_GROUPS: ShapeGroup[] = [
  {
    id: 'all', name: { zh: '全部', en: 'All' },
    items: [],
  },
  {
    id: 'basic', name: { zh: 'Basic Shapes', en: 'Basic Shapes' },
    items: [
      { id: 's-circle', name: { zh: '圆', en: 'Circle' }, kind: 'circle', fill: '#7c4dff' },
      { id: 's-ring', name: { zh: '圆环', en: 'Ring' }, kind: 'ring', fill: '#ff7ab8' },
      { id: 's-heart', name: { zh: '爱心', en: 'Heart' }, kind: 'heart', fill: '#ff5a5f' },
      { id: 's-star', name: { zh: '星形', en: 'Star' }, kind: 'star', fill: '#ffb020' },
      { id: 's-diamond', name: { zh: '菱形', en: 'Diamond' }, kind: 'diamond', fill: '#2ecc71' },
      { id: 's-half', name: { zh: '半圆', en: 'Half' }, kind: 'halfCircle', fill: '#38b6ff' },
      { id: 's-ellipse', name: { zh: '椭圆', en: 'Ellipse' }, kind: 'circle', fill: '#a78bfa' },
      { id: 's-cloud', name: { zh: '云朵', en: 'Cloud' }, kind: 'cloud', fill: '#9b9b9b' },
      { id: 's-bolt', name: { zh: '闪电', en: 'Bolt' }, kind: 'bolt', fill: '#ffd60a' },
      { id: 's-plus', name: { zh: '加号', en: 'Plus' }, kind: 'plus', fill: '#ff5a5f' },
    ],
  },
  {
    id: 'lines', name: { zh: 'Lines & Dividers', en: 'Lines & Dividers' },
    items: [
      { id: 'l-divider', name: { zh: '分割线', en: 'Divider' }, kind: 'divider' },
      { id: 'l-dashed', name: { zh: '虚线', en: 'Dashed' }, kind: 'dashedLine' },
      { id: 'l-arrow', name: { zh: '箭头', en: 'Arrow' }, kind: 'arrow' },
      { id: 'l-double', name: { zh: '双箭头', en: 'Double' }, kind: 'doubleArrow' },
    ],
  },
  {
    id: 'frames', name: { zh: 'Frames', en: 'Frames' },
    items: [
      { id: 'f-frame', name: { zh: '相框', en: 'Frame' }, kind: 'frame' },
      { id: 'f-round', name: { zh: '圆角框', en: 'Rounded' }, kind: 'roundRect' },
      { id: 'f-rect', name: { zh: '矩形', en: 'Rect' }, kind: 'rect' },
    ],
  },
];

/** 形状的 SVG 预览（面板里用小图标展示形状轮廓） */
export function shapeIcon(kind: string, color = '#5a5a5a', size = 44): string {
  const c = color;
  const sw = 2;
  switch (kind) {
    case 'rect': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><rect x="10" y="12" width="28" height="22" fill="none" stroke="${c}" stroke-width="${sw}"/></svg>`;
    case 'roundRect': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><rect x="10" y="12" width="28" height="22" rx="6" fill="none" stroke="${c}" stroke-width="${sw}"/></svg>`;
    case 'circle': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><circle cx="24" cy="24" r="13" fill="none" stroke="${c}" stroke-width="${sw}"/></svg>`;
    case 'triangle': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M24 12 L38 34 L10 34 Z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    case 'line': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><line x1="10" y1="24" x2="38" y2="24" stroke="${c}" stroke-width="${sw}"/></svg>`;
    case 'dashedLine': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><line x1="10" y1="24" x2="38" y2="24" stroke="${c}" stroke-width="${sw}" stroke-dasharray="5 4"/></svg>`;
    case 'divider': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><line x1="8" y1="24" x2="40" y2="24" stroke="${c}" stroke-width="4" stroke-linecap="round"/></svg>`;
    case 'star': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M24 9l4.6 9.3 10.3 1.5-7.5 7.3 1.8 10.3L24 32.5l-9.2 4.9 1.8-10.3-7.5-7.3 10.3-1.5z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    case 'diamond': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M24 8 L40 24 L24 40 L8 24 Z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    case 'frame': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><rect x="10" y="12" width="28" height="24" fill="none" stroke="${c}" stroke-width="3"/></svg>`;
    case 'hexagon': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M24 9l13 7.5v15L24 39l-13-7.5v-15z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    case 'arrow': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><line x1="8" y1="24" x2="40" y2="24" stroke="${c}" stroke-width="${sw}"/><path d="M34 17l6 7-6 7" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'doubleArrow': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><line x1="10" y1="24" x2="38" y2="24" stroke="${c}" stroke-width="${sw}"/><path d="M14 17l-6 7 6 7M34 17l6 7-6 7" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'heart': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M24 38S10 29 10 19a8 8 0 0114-5.5A8 8 0 0138 19c0 10-14 19-14 19z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    case 'speech': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M10 12h28a4 4 0 014 4v16a4 4 0 01-4 4H24l-8 6v-6h-6a4 4 0 01-4-4V16a4 4 0 014-4z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    case 'plus': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M24 14v20M14 24h20" stroke="${c}" stroke-width="4" stroke-linecap="round"/></svg>`;
    case 'trapezoid': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M14 34h20l5-16H9z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    case 'halfCircle': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M10 32a14 14 0 0128 0z" fill="none" stroke="${c}" stroke-width="${sw}"/></svg>`;
    case 'ring': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><circle cx="24" cy="24" r="13" fill="none" stroke="${c}" stroke-width="5"/></svg>`;
    case 'cloud': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M14 36a8 8 0 010-16 10 10 0 0119-2.5A8 8 0 0134 36z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    case 'bolt': return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><path d="M26 6L10 26h10l-2 16 16-20H24z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    default: return `<svg viewBox="0 0 48 48" width="${size}" height="${size}"><rect x="10" y="12" width="28" height="22" fill="none" stroke="${c}" stroke-width="${sw}"/></svg>`;
  }
}
