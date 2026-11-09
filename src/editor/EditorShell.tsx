/* 编辑器整体布局：顶部工具栏 + 左侧工具/AI 面板 + 画布 + 右侧属性/图层 + 弹窗。 */
import React from 'react';
import TopToolbar from './components/TopToolbar';
import LeftToolbar from './components/LeftToolbar';
import LeftPanel from './components/LeftPanel';
import DesignCanvas from './components/DesignCanvas';
import PropertiesPanel from './components/PropertiesPanel';
import LayersPanel from './components/LayersPanel';
import PrepressModal from './components/PrepressModal';

export default function EditorShell({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className="editor-shell" style={{
      display: 'flex', flexDirection: 'column',
      height: embedded ? '100%' : '100vh', overflow: 'hidden', background: '#fff',
    }}>
      {/* 顶部工具栏 */}
      <TopToolbar />

      {/* 主体工作区 */}
      <div className="editor-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左侧纵向工具栏 */}
        <LeftToolbar />

        {/* 左侧工具面板：对话 / 文字 / 素材 / 上传 / 视图 */}
        <LeftPanel />

        {/* 中间画布 */}
        <DesignCanvas />

        {/* 右侧属性 + 图层 */}
        <div className="editor-right-panel" style={{
          width: 300, borderLeft: '1px solid #e5e5e5',
          display: 'flex', flexDirection: 'column', background: '#fff', minWidth: 0,
        }}>
          <PropertiesPanel />
          <LayersPanel />
        </div>
      </div>

      {/* 印前检查弹窗 */}
      <PrepressModal />
    </div>
  );
}
