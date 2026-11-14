/* ============================================================
 * 设计台 · 字体目录
 * ------------------------------------------------------------
 * 只列系统安全字体（浏览器能直接渲染，不依赖远程字体文件），
 * 中文字体回退到 sans-serif / serif。分类：无衬线 / 衬线 / 展示 / 手写。
 * ============================================================ */

export type FontCat = 'all' | 'sans' | 'serif' | 'display' | 'hand';

export interface FontDef {
  family: string;
  name: { zh: string; en: string };
  cat: Exclude<FontCat, 'all'>;
}

export const FONTS: FontDef[] = [
  { family: 'Inter, -apple-system, sans-serif', name: { zh: 'Inter', en: 'Inter' }, cat: 'sans' },
  { family: 'Plus Jakarta Sans, -apple-system, sans-serif', name: { zh: 'Plus Jakarta Sans', en: 'Plus Jakarta Sans' }, cat: 'sans' },
  { family: 'Poppins, -apple-system, sans-serif', name: { zh: 'Poppins', en: 'Poppins' }, cat: 'sans' },
  { family: 'Montserrat, -apple-system, sans-serif', name: { zh: 'Montserrat', en: 'Montserrat' }, cat: 'sans' },
  { family: 'system-ui, -apple-system, sans-serif', name: { zh: '黑体', en: 'Sans' }, cat: 'sans' },
  { family: 'Georgia, serif', name: { zh: 'Georgia', en: 'Georgia' }, cat: 'serif' },
  { family: 'Times New Roman, serif', name: { zh: 'Times', en: 'Times' }, cat: 'serif' },
  { family: 'Songti SC, STSong, serif', name: { zh: '宋体', en: 'Song' }, cat: 'serif' },
  { family: 'Impact, sans-serif', name: { zh: 'Impact', en: 'Impact' }, cat: 'display' },
  { family: 'Arial Black, sans-serif', name: { zh: 'Arial Black', en: 'Arial Black' }, cat: 'display' },
  { family: 'Comic Sans MS, cursive', name: { zh: '漫画体', en: 'Comic' }, cat: 'hand' },
  { family: 'Kaiti SC, STKaiti, cursive', name: { zh: '楷体', en: 'Kaiti' }, cat: 'hand' },
];

/** 字体搭配推荐 */
export interface FontPair {
  id: string;
  name: { zh: string; en: string };
  title: string;
  body: string;
  titleFamily: string;
  bodyFamily: string;
  style: 'classic' | 'modern' | 'magazine' | 'bold' | 'hand';
}

export const FONT_PAIRS: FontPair[] = [
  {
    id: 'classic', name: { zh: '经典', en: 'Classic' },
    title: 'Georgia', body: 'Times New Roman', titleFamily: 'Georgia, serif', bodyFamily: 'Times New Roman, serif', style: 'classic',
  },
  {
    id: 'modern', name: { zh: '现代', en: 'Modern' },
    title: 'Inter', body: 'system-ui', titleFamily: 'Inter, -apple-system, sans-serif', bodyFamily: 'system-ui, -apple-system, sans-serif', style: 'modern',
  },
  {
    id: 'magazine', name: { zh: '杂志风', en: 'Magazine' },
    title: 'Playfair Display', body: 'Georgia', titleFamily: 'Georgia, serif', bodyFamily: 'Georgia, serif', style: 'magazine',
  },
  {
    id: 'bold', name: { zh: '强势', en: 'Bold' },
    title: 'Arial Black', body: 'Inter', titleFamily: 'Arial Black, sans-serif', bodyFamily: 'Inter, -apple-system, sans-serif', style: 'bold',
  },
  {
    id: 'hand', name: { zh: '手写感', en: 'Handwritten' },
    title: 'Comic Sans', body: 'system-ui', titleFamily: 'Comic Sans MS, cursive', bodyFamily: 'system-ui, -apple-system, sans-serif', style: 'hand',
  },
];

export const FONT_CATS: { id: FontCat; zh: string; en: string }[] = [
  { id: 'all', zh: '全部', en: 'All' },
  { id: 'sans', zh: '无衬线', en: 'Sans' },
  { id: 'serif', zh: '衬线', en: 'Serif' },
  { id: 'display', zh: '展示', en: 'Display' },
  { id: 'hand', zh: '手写', en: 'Hand' },
];
