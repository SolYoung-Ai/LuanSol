/* ============================================================
 * 编辑器内置素材（原生矢量，不依赖任何外部图库）
 * ------------------------------------------------------------
 * 每个素材返回一段 100×100 的 SVG 字符串，颜色由用户当前选择决定。
 * 插入画布时栅格化为 PNG（透明底），因此 2D / 3D / PNG / PDF 导出
 * 都能正常显示，不会出现「编辑器看得到、导出丢图」。
 * ============================================================ */

export type MaterialGroup = 'shape' | 'icon' | 'pattern';

export interface MaterialDef {
  id: string;
  name: string;
  group: MaterialGroup;
  /** 生成指定颜色的 SVG */
  svg: (color: string) => string;
}

const svgWrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${inner}</svg>`;

/** 实心图形 */
const solid = (inner: string) => (color: string) =>
  svgWrap(`<g fill="${color}">${inner}</g>`);
/** 线条图标 */
const line = (inner: string, width = 5) => (color: string) =>
  svgWrap(`<g fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`);

export const MATERIALS: MaterialDef[] = [
  /* ------------------------------ 形状 ------------------------------ */
  { id: 'sq', name: '正方形', group: 'shape', svg: solid('<rect x="8" y="8" width="84" height="84"/>') },
  { id: 'rrect', name: '圆角矩形', group: 'shape', svg: solid('<rect x="8" y="14" width="84" height="72" rx="16"/>') },
  { id: 'circle', name: '圆形', group: 'shape', svg: solid('<circle cx="50" cy="50" r="42"/>') },
  { id: 'ellipse', name: '椭圆', group: 'shape', svg: solid('<ellipse cx="50" cy="50" rx="44" ry="30"/>') },
  { id: 'tri', name: '三角形', group: 'shape', svg: solid('<path d="M50 8 94 88H6Z"/>') },
  { id: 'diamond', name: '菱形', group: 'shape', svg: solid('<path d="M50 6 94 50 50 94 6 50Z"/>') },
  { id: 'hex', name: '六边形', group: 'shape', svg: solid('<path d="M28 10h44l22 40-22 40H28L6 50Z"/>') },
  { id: 'star', name: '五角星', group: 'shape', svg: solid('<path d="M50 6l13 28 31 4-22 22 5 31-27-14-27 14 5-31L6 38l31-4Z"/>') },
  { id: 'heart', name: '心形', group: 'shape', svg: solid('<path d="M50 90C22 70 8 54 8 36 8 22 19 12 32 12c8 0 14 4 18 10 4-6 10-10 18-10 13 0 24 10 24 24 0 18-14 34-42 54Z"/>') },
  { id: 'capsule', name: '胶囊', group: 'shape', svg: solid('<rect x="6" y="30" width="88" height="40" rx="20"/>') },
  { id: 'archshape', name: '拱形', group: 'shape', svg: solid('<path d="M10 92V50a40 40 0 0 1 80 0v42Z"/>') },
  { id: 'drop', name: '水滴', group: 'shape', svg: solid('<path d="M50 6c18 24 32 38 32 54a32 32 0 0 1-64 0c0-16 14-30 32-54Z"/>') },
  { id: 'arrow', name: '箭头', group: 'shape', svg: solid('<path d="M6 38h52V18l36 32-36 32V62H6Z"/>') },
  { id: 'burst', name: '爆炸贴', group: 'shape', svg: solid('<path d="M50 2l8 16 17-6 2 18 18 2-6 17 16 8-16 8 6 17-18 2-2 18-17-6-8 16-8-16-17 6-2-18-18-2 6-17-16-8 16-8-6-17 18-2 2-18 17 6Z"/>') },
  { id: 'cross', name: '十字', group: 'shape', svg: solid('<path d="M38 6h24v32h32v24H62v32H38V62H6V38h32Z"/>') },
  { id: 'semicircle', name: '半圆', group: 'shape', svg: solid('<path d="M6 78a44 44 0 0 1 88 0Z"/>') },

  /* ------------------------------ 图标 ------------------------------ */
  { id: 'leaf', name: '叶片', group: 'icon', svg: solid('<path d="M84 12C52 14 20 30 16 62c-2 14 8 24 22 22 32-4 44-40 46-72Z"/><path d="M20 84C36 62 54 48 76 38" stroke="#fff" stroke-width="4" fill="none" opacity=".5"/>') },
  { id: 'cup', name: '茶杯', group: 'icon', svg: line('<path d="M20 34h50v24a25 25 0 0 1-50 0Z"/><path d="M70 40h10a10 10 0 0 1 0 20H70"/><path d="M28 20c0-6 8-6 8-12M44 20c0-6 8-6 8-12"/>') },
  { id: 'sunicon', name: '太阳', group: 'icon', svg: line('<circle cx="50" cy="50" r="18"/><path d="M50 6v12M50 82v12M6 50h12M82 50h12M19 19l9 9M72 72l9 9M81 19l-9 9M28 72l-9 9"/>') },
  { id: 'moon', name: '月牙', group: 'icon', svg: solid('<path d="M62 8a42 42 0 1 0 0 84A44 44 0 0 1 62 8Z"/>') },
  { id: 'mountain', name: '山峦', group: 'icon', svg: line('<path d="M6 82 36 28l18 30 12-18 28 42Z"/><path d="M24 50h10M60 56h8"/>') },
  { id: 'waveicon', name: '水波', group: 'icon', svg: line('<path d="M6 38c12-14 24 14 36 0s24 14 36 0M6 60c12-14 24 14 36 0s24 14 36 0"/>') },
  { id: 'flower', name: '花朵', group: 'icon', svg: line('<circle cx="50" cy="46" r="8"/><path d="M50 38c-4-16 4-24 8-26 6 8 2 20-8 26M58 46c16-4 24 4 26 8-8 6-20 2-26-8M50 54c4 16-4 24-8 26-6-8-2-20 8-26M42 46c-16 4-24-4-26-8 8-6 20-2 26 8M50 76v18"/>') },
  { id: 'wheat', name: '麦穗', group: 'icon', svg: line('<path d="M50 92V24"/><path d="M50 32c-12 0-18-8-18-16 12 0 18 8 18 16ZM50 32c12 0 18-8 18-16-12 0-18 8-18 16ZM50 52c-12 0-18-8-18-16 12 0 18 8 18 16ZM50 52c12 0 18-8 18-16-12 0-18 8-18 16ZM50 72c-12 0-18-8-18-16 12 0 18 8 18 16ZM50 72c12 0 18-8 18-16-12 0-18 8-18 16Z"/>') },
  { id: 'recycle', name: '可回收', group: 'icon', svg: line('<path d="M50 14l14 24H36Z"/><path d="M78 40l14 24-14 24"/><path d="M22 84L8 60l14-24"/><path d="M36 84h14M64 84h14"/>') },
  { id: 'globe', name: '地球', group: 'icon', svg: line('<circle cx="50" cy="50" r="42"/><path d="M8 50h84M50 8c14 14 14 70 0 84-14-14-14-70 0-84Z"/>') },
  { id: 'shield', name: '品质保障', group: 'icon', svg: line('<path d="M50 8 84 22v26c0 22-16 36-34 44-18-8-34-22-34-44V22Z"/><path d="M34 50l12 12 22-24"/>') },
  { id: 'crown', name: '皇冠', group: 'icon', svg: solid('<path d="M8 32l20 16 22-30 22 30 20-16-10 50H18Z"/>') },
  { id: 'tag', name: '标签', group: 'icon', svg: line('<path d="M54 8H88v34L50 80 20 50Z"/><circle cx="74" cy="24" r="6"/>') },
  { id: 'snow', name: '雪花', group: 'icon', svg: line('<path d="M50 8v84M16 28l68 44M84 28L16 72M50 26l-10-10M50 26l10-10M50 74l-10 10M50 74l10 10"/>') },
  { id: 'fire', name: '火焰', group: 'icon', svg: solid('<path d="M54 4c4 20 26 26 26 52a30 30 0 0 1-60 0c0-16 8-24 16-34 2 10 6 14 12 16-4-12-2-24 6-34Z"/>') },
  { id: 'tea', name: '茶芽', group: 'icon', svg: solid('<path d="M50 94V44c0-18 12-32 32-34 2 22-12 36-32 38V30c-14 4-24 16-24 32 0 12 8 20 20 22Z"/>') },
  { id: 'mountainline', name: '远山线', group: 'icon', svg: line('<path d="M4 76 32 36l14 20 12-16 38 36"/><path d="M4 88h92"/>') },
  { id: 'organic', name: '有机叶', group: 'icon', svg: line('<path d="M82 18C46 20 22 38 22 62c0 10 8 16 18 16 24 0 40-28 42-60Z"/><path d="M26 86c8-20 24-34 42-44"/>') },
  { id: 'noadd', name: '0 添加', group: 'icon', svg: line('<circle cx="50" cy="50" r="40"/><path d="M28 72 72 28"/><path d="M36 38h28M36 50h28M36 62h18"/>') },
  { id: 'vegan', name: '素食', group: 'icon', svg: line('<path d="M50 14c22 14 30 34 22 52-6 14-22 20-34 12-14-8-16-26-8-40 6-10 14-18 20-24Z"/><path d="M32 82c8-18 22-32 36-42"/>') },

  /* ------------------------------ 纹样 ------------------------------ */
  {
    id: 'p_stripe', name: '斜条纹', group: 'pattern',
    svg: (c) => svgWrap(`<g fill="${c}">${Array.from({ length: 8 }, (_, i) => `<rect x="${-60 + i * 24}" y="-20" width="10" height="150" transform="rotate(20 50 50)"/>`).join('')}</g>`),
  },
  {
    id: 'p_dot', name: '波点', group: 'pattern',
    svg: (c) => svgWrap(`<g fill="${c}">${Array.from({ length: 36 }, (_, i) => {
      const x = 10 + (i % 6) * 16, y = 10 + Math.floor(i / 6) * 16;
      return `<circle cx="${x}" cy="${y}" r="4.2"/>`;
    }).join('')}</g>`),
  },
  {
    id: 'p_grid', name: '网格', group: 'pattern',
    svg: (c) => svgWrap(`<g stroke="${c}" stroke-width="2.4">${Array.from({ length: 7 }, (_, i) => {
      const p = 12 + i * 13;
      return `<path d="M${p} 4v92M4 ${p}h92"/>`;
    }).join('')}</g>`),
  },
  {
    id: 'p_check', name: '棋盘格', group: 'pattern',
    svg: (c) => svgWrap(`<g fill="${c}">${Array.from({ length: 25 }, (_, i) => {
      const col = i % 5, row = Math.floor(i / 5);
      return (col + row) % 2 ? `<rect x="${col * 20}" y="${row * 20}" width="20" height="20"/>` : '';
    }).join('')}</g>`),
  },
  {
    id: 'p_wave', name: '水波纹', group: 'pattern',
    svg: (c) => svgWrap(`<g fill="none" stroke="${c}" stroke-width="3">${Array.from({ length: 7 }, (_, i) => `<path d="M-4 ${12 + i * 13}q13-10 26 0t26 0t26 0t26 0"/>`).join('')}</g>`),
  },
  {
    id: 'p_cloud', name: '祥云', group: 'pattern',
    svg: (c) => svgWrap(`<g fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round">${Array.from({ length: 9 }, (_, i) => {
      const x = 14 + (i % 3) * 32, y = 16 + Math.floor(i / 3) * 32;
      return `<path d="M${x - 10} ${y + 6}a7 7 0 0 1 10-10 8 8 0 0 1 14 2 7 7 0 0 1 2 12"/>`;
    }).join('')}</g>`),
  },
  {
    id: 'p_sunburst', name: '放射线', group: 'pattern',
    svg: (c) => svgWrap(`<g stroke="${c}" stroke-width="3" stroke-linecap="round">${Array.from({ length: 16 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 16;
      return `<path d="M${50 + Math.cos(a) * 24} ${50 + Math.sin(a) * 24}L${50 + Math.cos(a) * 46} ${50 + Math.sin(a) * 46}"/>`;
    }).join('')}</g>`),
  },
  {
    id: 'p_scale', name: '鱼鳞', group: 'pattern',
    svg: (c) => svgWrap(`<g fill="none" stroke="${c}" stroke-width="2.6">${Array.from({ length: 20 }, (_, i) => {
      const row = Math.floor(i / 5), col = i % 5;
      const x = col * 22 + (row % 2 ? 11 : 0), y = row * 22 + 6;
      return `<path d="M${x} ${y}a11 11 0 0 0 22 0"/>`;
    }).join('')}</g>`),
  },
];

export const MATERIAL_GROUPS: { id: MaterialGroup; label: string }[] = [
  { id: 'shape', label: '形状' },
  { id: 'icon', label: '图标' },
  { id: 'pattern', label: '纹样' },
];
