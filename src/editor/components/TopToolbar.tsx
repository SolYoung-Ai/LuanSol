/* 顶部工具栏：返回、项目名称、保存状态、视图切换、网格、印前、撤销重做、导出。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { Icon, IconName } from '../../components/icons';
import { ViewMode } from '../constants';
import { useLang } from '../../i18n';

const VIEW_TABS: { id: ViewMode; zh: string; en: string; icon: IconName }[] = [
  { id: 'design', zh: '平面设计', en: 'Artwork', icon: 'square' },
  { id: '3d', zh: '3D 预览', en: '3D preview', icon: 'box3d' },
  { id: 'dieline', zh: '刀模与印前', en: 'Dieline & prepress', icon: 'scissors' },
];

function ToolButton({ icon, label, onClick, active, title, disabled }: {
  icon: IconName; label?: string; onClick: () => void; active?: boolean; title?: string; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 10px',
        background: active ? '#333' : '#fff',
        color: active ? '#fff' : '#333',
        border: '1px solid ' + (active ? '#333' : '#ddd'),
        borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13, opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

export default function TopToolbar() {
  const ed = useEditor();
  const { lang, t } = useLang();

  const renameProject = () => {
    const name = prompt(t('项目名称', 'Project name'), ed.design?.name || t('未命名项目', 'Untitled project'));
    if (name && name.trim()) {
      // 通过保存项目时更新名称
      ed.manualSave();
    }
  };

  return (
    <div className="editor-topbar" style={{
      height: 48, borderBottom: '1px solid #e5e5e5', display: 'flex',
      alignItems: 'center', padding: '0 14px', gap: 8, background: '#fff',
    }}>
      {/* 返回工作台 */}
      <button
        onClick={() => { window.location.hash = '#/workspace'; }}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#555' }}
        title={t('返回工作台', 'Back to workspace')}
      >
        <Icon name="chevronLeft" size={16} />
        {t('工作台', 'Workspace')}
      </button>

      <div style={{ width: 1, height: 20, background: '#e5e5e5', margin: '0 4px' }} />

      {/* 项目名称（可点击修改） */}
      <button
        onClick={renameProject}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#222' }}
        title={t('点击修改项目名称', 'Click to rename the project')}
      >
        {ed.design?.name || t('未命名项目', 'Untitled project')}
        <Icon name="edit" size={13} style={{ color: '#999' }} />
      </button>

      {/* 保存状态 */}
      <span style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 12,
        color: ed.saveStatus === 'saved' ? '#16a34a' : ed.saveStatus === 'saving' ? '#d97706' : '#999',
      }}>
        {ed.saveStatus === 'saving' && <><Icon name="clock" size={13} />{t('保存中…', 'Saving…')}</>}
        {ed.saveStatus === 'saved' && <><Icon name="check" size={13} />{t('已保存', 'Saved')}</>}
      </span>

      <div style={{ flex: 1 }} />

      {/* 视图切换 */}
      <div style={{ display: 'flex', gap: 4 }}>
        {VIEW_TABS.map((tab) => (
          <ToolButton
            key={tab.id}
            icon={tab.icon}
            label={lang === 'en' ? tab.en : tab.zh}
            active={ed.viewMode === tab.id}
            onClick={() => ed.setViewMode(tab.id)}
          />
        ))}
      </div>

      <div style={{ width: 1, height: 20, background: '#e5e5e5', margin: '0 4px' }} />

      {/* 网格开关 */}
      <ToolButton icon="grid" label={t('网格', 'Grid')} active={ed.showGrid} onClick={() => ed.setShowGrid((v) => !v)} />

      {/* 印前检查 */}
      <ToolButton icon="prepress" label={t('印前检查', 'Prepress check')} onClick={ed.openPrepress} />

      <div style={{ width: 1, height: 20, background: '#e5e5e5', margin: '0 4px' }} />

      {/* 撤销重做 */}
      <button
        onClick={ed.undo} disabled={!ed.canUndo}
        title={t('撤销 (Cmd+Z)', 'Undo (Cmd+Z)')}
        style={{ background: 'none', border: 'none', cursor: ed.canUndo ? 'pointer' : 'not-allowed', padding: 6, opacity: ed.canUndo ? 1 : 0.4, color: '#444' }}
      >
        <Icon name="undo" size={17} />
      </button>
      <button
        onClick={ed.redo} disabled={!ed.canRedo}
        title={t('重做 (Cmd+Shift+Z)', 'Redo (Cmd+Shift+Z)')}
        style={{ background: 'none', border: 'none', cursor: ed.canRedo ? 'pointer' : 'not-allowed', padding: 6, opacity: ed.canRedo ? 1 : 0.4, color: '#444' }}
      >
        <Icon name="redo" size={17} />
      </button>

      <div style={{ width: 1, height: 20, background: '#e5e5e5', margin: '0 4px' }} />

      {/* 导出 */}
      <ToolButton icon="download" label="PNG" onClick={ed.exportPNG} />
      <ToolButton icon="download" label="SVG" onClick={ed.exportSVG} />
      <ToolButton icon="download" label="PDF" onClick={ed.exportPDF} />
      <ToolButton icon="folder" label="ZIP" onClick={ed.exportZIP} active />
    </div>
  );
}
