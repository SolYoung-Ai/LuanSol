/* LunaSol 编辑器共享样式常量与基础配置。 */
import React from 'react';

// 输入框通用样式
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 12,
  boxSizing: 'border-box',
};

// 迷你按钮（图层列表里的小图标）
export const miniBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  padding: 2,
  lineHeight: 1,
};

// 小按钮（操作行）
export const smallBtn: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  padding: '3px 8px',
};

// 缩放按钮
export const zoomBtn: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  padding: '4px 10px',
  minWidth: 32,
};

// 对齐按钮
export const alignBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  padding: '4px 6px',
};

// 左侧纵向工具栏按钮
export const toolBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#444',
  position: 'relative',
};

// mm 转 px（96dpi 下 1mm = 3.7795px）
export const MM_TO_PX = 3.78;

// 缩放控制点方位
export type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLE_POSITIONS: HandlePos[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

// 编辑器工具类型
export type ToolId = 'select' | 'text' | 'image' | 'shape' | 'assets' | 'upload' | 'ruler' | 'dieline';

/** 文字面板的五个常用预设 */
export type TextPreset = 'title' | 'subtitle' | 'body' | 'price' | 'label';

// 三个正式工作视图
export type ViewMode = 'design' | '3d' | 'dieline';

// 包装面标签（英文名单独存：界面按语言取，别把中文硬编码进渲染）
export const FACE_LABELS: Record<string, string> = {
  front: '正面',
  back: '背面',
  left: '左侧',
  right: '右侧',
  top: '顶面',
};
export const FACE_LABELS_EN: Record<string, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
};
/** 按语言取包装面名 */
export const faceLabel = (id: string, lang: string) =>
  (lang === 'en' ? FACE_LABELS_EN[id] : FACE_LABELS[id]) || id;
