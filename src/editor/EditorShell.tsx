/* 编辑器整体布局：顶部工具栏 + 左侧工具/AI 面板 + 画布 + 右侧属性/图层 + 弹窗。 */
import React from 'react';
import TopToolbar from './components/TopToolbar';
import LeftToolbar from './components/LeftToolbar';
import AIAssistant from './components/AIAssistant';
import DesignCanvas from './components/DesignCanvas';
import PropertiesPanel from './components/PropertiesPanel';
import LayersPanel from './components/LayersPanel';
import PrepressModal from './components/PrepressModal';

export default function EditorShell() {
  return (
    <div className="editor-shell" style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden', background: '#fff',
    }}>
      {/* 顶部工具栏 */}
      <TopToolbar />

      {/* 主体工作区 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左侧纵向工具栏 */}
        <LeftToolbar />

        {/* AI 对话面板 */}
        <AIAssistant />

        {/* 中间画布 */}
        <DesignCanvas />

        {/* 右侧属性 + 图层 */}
        <div style={{
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
