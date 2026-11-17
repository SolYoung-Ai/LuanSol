/* ============================================================
   Studio 2.0 — /studio 路由入口
   ------------------------------------------------------------
   · /studio            → 包装工作台（没打开项目：左侧项目列表 + 中间开始页）
   · /studio?id=st_xxx  → 直接打开这个项目的编辑器
   这里不再包一层懒加载：StudioPage 本身就是 App 里的动态 chunk，
   再嵌一层 lazy 只会在弱网下多一次「先转圈、再取一次 chunk」。
   ============================================================ */
import React from 'react';
import StudioEditor from './StudioEditor';

export default function StudioPage() {
  return <StudioEditor />;
}
