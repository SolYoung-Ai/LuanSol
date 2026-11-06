/* ============================================================
 * 深浅色主题
 * ------------------------------------------------------------
 * 为什么用 documentElement 上的 data-theme 而不是 React 状态驱动样式：
 *   首屏就要是对的。主题必须在 main.tsx 里、React 挂载之前就写到 <html> 上，
 *   否则会先闪一帧白色再变深色（白闪比不做深色还伤体验）。
 * 只存两档：light / dark。跟随系统（prefers-color-scheme）不作为默认，
 * 因为用户点过开关之后，他的选择必须一直有效。
 * ============================================================ */

export type Theme = 'light' | 'dark';
const THEME_KEY = 'lunasol.theme';

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch { /* 隐私模式 */ }
  return 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // 让系统级控件（滚动条、原生输入框）也跟着换，否则深色页面里会出现白底控件
  document.documentElement.style.colorScheme = theme;
}

export function saveTheme(theme: Theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* 隐私模式 */ }
}
