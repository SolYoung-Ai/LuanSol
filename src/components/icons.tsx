/* LunaSol 统一线性图标库（Lucide 风格）。
 * 全站编辑器只使用这里的 24x24 描边 SVG，禁止再使用 Emoji。
 * 统一 strokeWidth=1.8，currentColor 继承文字颜色。 */
import React from 'react';

export type IconName =
  | 'select' | 'move' | 'text' | 'image' | 'shape' | 'grid' | 'palette'
  | 'ruler' | 'scissors' | 'undo' | 'redo' | 'save' | 'upload' | 'trash'
  | 'copy' | 'lock' | 'unlock' | 'eye' | 'eyeOff' | 'edit' | 'plus' | 'minus'
  | 'close' | 'check' | 'alert' | 'fit' | 'prepress' | 'fullscreen' | 'more'
  | 'download' | 'box3d' | 'layers' | 'spark' | 'chevronUp' | 'chevronDown'
  | 'chevronLeft' | 'chevronRight' | 'alignLeft' | 'alignHCenter' | 'alignRight'
  | 'alignTop' | 'alignVCenter' | 'alignBottom' | 'distH' | 'distV'
  | 'folder' | 'imageOff' | 'square' | 'clock' | 'refresh' | 'zoomIn' | 'zoomOut'
  | 'search' | 'send' | 'message' | 'brain' | 'panelLeft' | 'menu';

// 每个图标的内部 SVG 路径（viewBox 0 0 24 24）
const PATHS: Record<IconName, React.ReactNode> = {
  // 选择工具：光标箭头
  select: <path d="M4 3l7 17 2.5-7.5L21 10z" />,
  // 移动工具：四向箭头
  move: <><path d="M12 2v20" /><path d="M2 12h20" /><path d="M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" /></>,
  // 文字工具：T
  text: <><path d="M5 6h14" /><path d="M12 6v13" /><path d="M9 19h6" /></>,
  // 图片
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5L5 20" /></>,
  // 形状
  shape: <><rect x="4" y="4" width="10" height="10" rx="1" /><circle cx="16" cy="16" r="4" /></>,
  // 网格
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  // 调色板
  palette: <><path d="M12 3a9 9 0 100 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 004-4c0-4.4-4-7.7-9-7.7z" /><circle cx="7.5" cy="11.5" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  // 标尺
  ruler: <><path d="M3 15L15 3l6 6L9 21z" /><path d="M7 11l2 2M10 8l2 2M13 5l2 2" /></>,
  // 剪刀/刀模
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.5 15.5M14.5 9.5L20 20M8.5 8.5L14 14" /></>,
  // 撤销
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 015 5v1" /></>,
  // 重做
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 00-5 5v1" /></>,
  // 保存
  save: <><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  // 上传
  upload: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M12 3v13" /><path d="M7 8l5-5 5 5" /></>,
  // 删除
  trash: <><path d="M3 6h18" /><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /></>,
  // 复制
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>,
  // 锁定
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  // 解锁
  unlock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 017.5-2" /></>,
  // 显示
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  // 隐藏
  eyeOff: <><path d="M17.94 17.94A10.07 10.07 0 0112 19c-6.5 0-10-7-10-7a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 5c6.5 0 10 7 10 7a18.5 18.5 0 01-2.16 3.19" /><path d="M14.12 14.12a3 3 0 11-4.24-4.24" /><line x1="2" y1="2" x2="22" y2="22" /></>,
  // 编辑
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></>,
  // 加号
  plus: <><path d="M12 5v14M5 12h14" /></>,
  // 减号
  minus: <path d="M5 12h14" />,
  // 关闭
  close: <path d="M18 6L6 18M6 6l12 12" />,
  // 对勾
  check: <path d="M20 6L9 17l-5-5" />,
  // 警告
  alert: <><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  // 适应画布
  fit: <><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" /></>,
  // 印前检查
  prepress: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
  // 全屏
  fullscreen: <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" />,
  // 更多
  more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
  // 下载
  download: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>,
  // 3D 立方体
  box3d: <><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.3 7L12 12l8.7-5M12 22V12" /></>,
  // 图层
  layers: <><path d="M12 2L2 7l10 5 10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></>,
  // 闪电/生成
  spark: <path d="M13 2L3 14h9l-1 8 10-12h-9z" />,
  // 箭头
  chevronUp: <path d="M18 15l-6-6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 18l-6-6 6-6" />,
  chevronRight: <path d="M9 18l6-6-6-6" />,
  // 对齐
  alignLeft: <><path d="M3 6h18M3 12h12M3 18h15" /><path d="M3 3v18" /></>,
  alignHCenter: <><path d="M8 6h8M6 12h12M7 18h10" /><path d="M12 3v18" /></>,
  alignRight: <><path d="M3 6h18M9 12h12M6 18h18" /><path d="M21 3v18" /></>,
  alignTop: <><path d="M6 3v18M12 3v12M18 3v15" /><path d="M3 3h18" /></>,
  alignVCenter: <><path d="M3 8v8M3 6h18M3 12h18M3 18h18" /><path d="M3 12h18" /></>,
  alignBottom: <><path d="M6 3v18M12 9v12M18 6v15" /><path d="M3 21h18" /></>,
  distH: <><path d="M3 6h4M17 6h4M3 18h4M17 18h4" /><rect x="7" y="4" width="3" height="16" /><rect x="14" y="4" width="3" height="16" /><path d="M3 12h4M17 12h4" /></>,
  distV: <><path d="M6 3v4M6 17v4M18 3v4M18 17v4" /><rect x="4" y="7" width="16" height="3" /><rect x="4" y="14" width="16" height="3" /><path d="M12 3v4M12 17v4" /></>,
  // 文件夹
  folder: <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />,
  // 图片缺失
  imageOff: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 3l18 18" /><path d="M21 16l-5-5" /></>,
  // 方形
  square: <rect x="4" y="4" width="16" height="16" rx="1" />,
  // 时钟
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  // 刷新
  refresh: <><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></>,
  // 搜索
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  // 发送（向上箭头）
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  // 对话气泡
  message: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  // 思考（灯泡）
  brain: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 00-4 12.7c.6.5 1 1.2 1 2V18h6v-1.3c0-.8.4-1.5 1-2A7 7 0 0012 2z" /></>,
  panelLeft: <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></>,
  // 汉堡菜单：三条等长横线
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
};

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 18, strokeWidth = 1.8, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export default Icon;
