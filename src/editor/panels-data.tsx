/* ============================================================
 * 设计台 · 左侧图标栏数据
 * ------------------------------------------------------------
 * 从上到下：模板 / 文字 / 形状 / 贴纸 / 图片 / 视频 / 背景 / 品牌 / 动画 / 音频 / 图层
 * 其中「视频 / 品牌 / 动画 / 音频」在 MVP 阶段先做占位（点了提示「即将上线」），
 * 其余面板可用。
 * ============================================================ */

export type PanelId =
  | 'templates' | 'text' | 'shapes' | 'stickers' | 'images'
  | 'video' | 'background' | 'brand' | 'animation' | 'audio' | 'layers';

export interface PanelDef {
  id: PanelId;
  name: { zh: string; en: string };
  /** 占位面板（未实现功能） */
  placeholder?: boolean;
}

export const PANELS: PanelDef[] = [
  { id: 'templates', name: { zh: '模板', en: 'Templates' } },
  { id: 'text', name: { zh: '文字', en: 'Text' } },
  { id: 'shapes', name: { zh: '形状', en: 'Shapes' } },
  { id: 'stickers', name: { zh: '贴纸', en: 'Stickers' } },
  { id: 'images', name: { zh: '图片', en: 'Images' } },
  { id: 'video', name: { zh: '视频', en: 'Video' }, placeholder: true },
  { id: 'background', name: { zh: '背景', en: 'Background' } },
  { id: 'brand', name: { zh: '品牌', en: 'Brand' }, placeholder: true },
  { id: 'animation', name: { zh: '动画', en: 'Animate' }, placeholder: true },
  { id: 'audio', name: { zh: '音频', en: 'Audio' }, placeholder: true },
  { id: 'layers', name: { zh: '图层', en: 'Layers' } },
];

/** 图标栏里每个面板对应的 SVG 小图标（内联，避免再扩图标库） */
export function panelIcon(id: PanelId, size = 20): React.ReactNode {
  const s = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (id) {
    case 'templates': return <svg {...s}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case 'text': return <svg {...s}><path d="M5 6h14" /><path d="M12 6v13" /><path d="M9 19h6" /></svg>;
    case 'shapes': return <svg {...s}><rect x="4" y="4" width="10" height="10" rx="1" /><circle cx="16" cy="16" r="4" /></svg>;
    case 'stickers': return <svg {...s}><path d="M12 3a9 9 0 100 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4.4-4-7.7-9-7.7z" /><circle cx="8" cy="10" r="1.2" /><circle cx="11" cy="6.5" r="1.2" /></svg>;
    case 'images': return <svg {...s}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5L5 20" /></svg>;
    case 'video': return <svg {...s}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></svg>;
    case 'background': return <svg {...s}><path d="M12 3a9 9 0 100 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4.4-4-7.7-9-7.7z" /><circle cx="7.5" cy="11.5" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="7.5" r="1" /></svg>;
    case 'brand': return <svg {...s}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></svg>;
    case 'animation': return <svg {...s}><path d="M4 12h3l2-7 3 14 3-10 2 3h3" /></svg>;
    case 'audio': return <svg {...s}><path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>;
    case 'layers': return <svg {...s}><path d="M12 2L2 7l10 5 10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></svg>;
    default: return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2" /></svg>;
  }
}
