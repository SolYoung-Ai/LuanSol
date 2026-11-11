/* 左侧纵向工具栏：选择（AI 对话）、文字、素材、上传、视图、刀模。
 * 每个按钮都绑定真实面板或视图切换，不再有「点了没反应」的按钮。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { Icon, IconName } from '../../components/icons';
import { toolBtn, ToolId } from '../constants';
import { useLang } from '../../i18n';

/** 工具名存双语：常量在模块加载时求值，拿不到当前语言 */
const TOOLS: { id: ToolId; icon: IconName; zh: string; en: string; shortcut?: string }[] = [
  { id: 'select', icon: 'select', zh: '选择 / Luna 对话', en: 'Select / Luna chat', shortcut: 'V' },
  { id: 'text', icon: 'text', zh: '文字', en: 'Text', shortcut: 'T' },
  { id: 'assets', icon: 'shape', zh: '素材库（形状 / 图标 / 纹样）', en: 'Asset library (shapes / icons / motifs)' },
  { id: 'upload', icon: 'upload', zh: '上传自己的图片', en: 'Upload your own image' },
  { id: 'ruler', icon: 'ruler', zh: '视图与网格', en: 'View and grid' },
  { id: 'dieline', icon: 'scissors', zh: '刀模与印前检查', en: 'Dieline and prepress' },
];

export default function LeftToolbar() {
  const ed = useEditor();
  const { lang } = useLang();

  const pick = (id: ToolId) => {
    ed.setActiveTool(id);
    if (id === 'dieline') ed.setViewMode('dieline');
    else if (ed.viewMode === 'dieline') ed.setViewMode('design');
  };

  return (
    <div className="editor-left-tools">
      {TOOLS.map((tool) => {
        const active = ed.activeTool === tool.id;
        const label = lang === 'en' ? tool.en : tool.zh;
        return (
          <button
            key={tool.id}
            className={`editor-tool ${active ? 'on' : ''}`}
            onClick={() => pick(tool.id)}
            title={`${label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
            aria-label={label}
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
