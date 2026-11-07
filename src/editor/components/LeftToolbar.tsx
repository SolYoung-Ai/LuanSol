/* 左侧纵向专业工具栏：选择、文字、图片、形状、素材、标尺、刀模。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { Icon, IconName } from '../../components/icons';
import { toolBtn, ToolId } from '../constants';

const TOOLS: { id: ToolId; icon: IconName; label: string; shortcut: string }[] = [
  { id: 'select', icon: 'select', label: '选择工具', shortcut: 'V' },
  { id: 'text', icon: 'text', label: '文字工具', shortcut: 'T' },
  { id: 'image', icon: 'image', label: '图片工具', shortcut: '' },
  { id: 'shape', icon: 'shape', label: '形状工具', shortcut: '' },
  { id: 'assets', icon: 'folder', label: '素材库', shortcut: '' },
  { id: 'ruler', icon: 'ruler', label: '标尺与参考线', shortcut: '' },
  { id: 'dieline', icon: 'scissors', label: '刀模工具', shortcut: '' },
];

export default function LeftToolbar() {
  const ed = useEditor();

  return (
    <div className="editor-left-tools" style={{
      width: 48, borderRight: '1px solid #e5e5e5', display: 'flex',
      flexDirection: 'column', alignItems: 'center', padding: '6px 0',
      background: '#fafafa', gap: 2,
    }}>
      {TOOLS.map((tool) => {
        const active = ed.activeTool === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => ed.setActiveTool(tool.id)}
            title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
            style={{
              ...toolBtn,
              color: active ? '#e8783a' : '#444',
              background: active ? '#fff3ec' : 'none',
              borderRadius: 6,
            }}
          >
            <Icon name={tool.icon} size={19} />
            {/* 激活指示条 */}
            {active && <span style={{
              position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)',
              width: 3, height: 20, background: '#e8783a', borderRadius: 2,
            }} />}
          </button>
        );
      })}
    </div>
  );
}
