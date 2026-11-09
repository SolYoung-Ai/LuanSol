/* 左侧纵向工具栏：选择（AI 对话）、文字、素材、上传、视图、刀模。
 * 每个按钮都绑定真实面板或视图切换，不再有「点了没反应」的按钮。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { Icon, IconName } from '../../components/icons';
import { toolBtn, ToolId } from '../constants';

const TOOLS: { id: ToolId; icon: IconName; label: string; shortcut?: string }[] = [
  { id: 'select', icon: 'select', label: '选择 / Luna 对话', shortcut: 'V' },
  { id: 'text', icon: 'text', label: '文字', shortcut: 'T' },
  { id: 'assets', icon: 'shape', label: '素材库（形状 / 图标 / 纹样）' },
  { id: 'upload', icon: 'upload', label: '上传自己的图片' },
  { id: 'ruler', icon: 'ruler', label: '视图与网格' },
  { id: 'dieline', icon: 'scissors', label: '刀模与印前检查' },
];

export default function LeftToolbar() {
  const ed = useEditor();

  const pick = (id: ToolId) => {
    ed.setActiveTool(id);
    if (id === 'dieline') ed.setViewMode('dieline');
    else if (ed.viewMode === 'dieline') ed.setViewMode('design');
  };

  return (
    <div className="editor-left-tools">
      {TOOLS.map((tool) => {
        const active = ed.activeTool === tool.id;
        return (
          <button
            key={tool.id}
            className={`editor-tool ${active ? 'on' : ''}`}
            onClick={() => pick(tool.id)}
            title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
            aria-label={tool.label}
            aria-pressed={active}
            style={toolBtn}
          >
            <Icon name={tool.icon} size={19} />
            {active && <span className="editor-tool-bar" />}
          </button>
        );
      })}
    </div>
  );
}
