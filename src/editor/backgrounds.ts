/* 设计台 · 背景色板与渐变、图案定义 */

export interface Swatch { color: string; name?: string }

export const COLOR_SWATCHES: Swatch[] = [
  { color: '#ffffff', name: '白' },
  { color: '#1a1a1a', name: '黑' },
  { color: '#3d2b1f', name: '深棕' },
  { color: '#7c4dff', name: '紫' },
  { color: '#c8b6ff', name: '淡紫' },
  { color: '#ff7ab8', name: '粉' },
  { color: '#ffd60a', name: '黄' },
  { color: '#a8e6cf', name: '薄荷' },
  { color: '#ff5a5f', name: '红' },
  { color: '#ff8c42', name: '橙' },
  { color: '#ffb020', name: '橙黄' },
  { color: '#2ecc71', name: '绿' },
  { color: '#38d9c0', name: '青绿' },
  { color: '#38b6ff', name: '青' },
  { color: '#5a7cff', name: '蓝' },
  { color: '#a78bfa', name: '蓝紫' },
];

export interface GradientDef { from: string; to: string; angle?: number }

export const GRADIENTS: GradientDef[] = [
  { from: '#ff8c42', to: '#ff5a5f' },
  { from: '#5a7cff', to: '#38b6ff' },
  { from: '#7c4dff', to: '#ff7ab8' },
  { from: '#38d9c0', to: '#a8e6cf' },
  { from: '#7c4dff', to: '#1a1a1a' },
  { from: '#ffd6e8', to: '#ffffff' },
];

export interface PatternDef { id: string; name: { zh: string; en: string } }

export const PATTERNS: PatternDef[] = [
  { id: 'dots', name: { zh: '点阵', en: 'Dots' } },
  { id: 'grid', name: { zh: '网格', en: 'Grid' } },
  { id: 'diagonal', name: { zh: '斜线', en: 'Diagonal' } },
  { id: 'checker', name: { zh: '棋盘格', en: 'Checker' } },
  { id: 'wave', name: { zh: '波浪', en: 'Wave' } },
  { id: 'cross', name: { zh: '十字', en: 'Cross' } },
];
