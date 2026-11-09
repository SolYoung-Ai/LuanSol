/* 左栏面板容器：按当前工具切换 对话 / 文字 / 素材 / 上传 / 视图。
 * 只有「选择」工具保留 AI 对话；其余工具才显示对应素材面板，
 * 避免所有按钮点下去都只看到同一块聊天区（之前「按钮用不了」的根因）。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import AIAssistant from './AIAssistant';
import TextPanel from './panels/TextPanel';
import MaterialPanel from './panels/MaterialPanel';
import UploadPanel from './panels/UploadPanel';
import ViewPanel from './panels/ViewPanel';

export default function LeftPanel() {
  const ed = useEditor();
  let content: React.ReactNode;
  switch (ed.activeTool) {
    case 'text': content = <TextPanel />; break;
    case 'assets':
    case 'shape': content = <MaterialPanel />; break;
    case 'image':
    case 'upload': content = <UploadPanel />; break;
    case 'ruler': content = <ViewPanel />; break;
    default: content = <AIAssistant />;
  }
  return <div className="editor-left-panel">{content}</div>;
}
