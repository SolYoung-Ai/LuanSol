/* ============================================================
 * 设计台 · 顶部工具栏
 * ------------------------------------------------------------
 * 第一行：文件名、撤销/重做、保存状态、分享/导出。
 * 第二行（选中文字时）：字体、字号、颜色、加粗/斜体/下划线、对齐、行距、字距。
 * 文字样式通过 engine.canvas 直接操作选中对象。
 * ============================================================ */
import React, { useRef, useState } from 'react';
import { EditorEngine } from './engine';
import { FONTS } from './fonts';
import { useLang } from '../i18n';
import { IText, Textbox } from 'fabric';

interface ToolbarProps {
  engine: EditorEngine;
  title: string;
  onTitleChange: (s: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  saved: boolean;
  selected: { kind: string; name: string } | null;
  onExport: () => void;
}

export function Toolbar({ engine, title, onTitleChange, canUndo, canRedo, saved, selected, onExport }: ToolbarProps) {
  const { lang, t } = useLang();
  const [editingTitle, setEditingTitle] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const isText = selected?.kind === 'text';

  return (
    <div className="ed-topbar">
      <div className="ed-topbar-row">
        <div className="ed-topbar-left">
          <button className="ed-menu-btn" onClick={() => goHome()}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20a1 1 0 001 1h11a1 1 0 001-1V9.5" /></svg>
          </button>
          <span className="ed-menu-item">{t('文件', 'File')}</span>
          <span className="ed-menu-item">{t('视图', 'View')}</span>
          <div className="ed-divider-v" />
          <button className="ed-icon-btn" disabled={!canUndo} onClick={() => engine.undo()} title={t('撤销', 'Undo')}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 015 5v1" /></svg>
          </button>
          <button className="ed-icon-btn" disabled={!canRedo} onClick={() => engine.redo()} title={t('重做', 'Redo')}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 00-5 5v1" /></svg>
          </button>
        </div>

        <div className="ed-topbar-center" onClick={() => { setEditingTitle(true); setTimeout(() => titleRef.current?.select(), 0); }}>
          {editingTitle ? (
            <input ref={titleRef} value={title} onChange={(e) => onTitleChange(e.target.value)}
              onBlur={() => setEditingTitle(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false); }} />
          ) : (
            <span>{title || t('未命名设计', 'Untitled design')}</span>
          )}
        </div>

        <div className="ed-topbar-right">
          <span className={`ed-saved ${saved ? '' : 'dirty'}`}>{saved ? t('已保存', 'Saved') : t('未保存', 'Unsaved')}</span>
          <button className="ed-export-btn" onClick={onExport}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
            {t('导出', 'Export')}
          </button>
        </div>
      </div>

      {isText && <TextToolbar engine={engine} />}
    </div>
  );
}

function goHome() {
  window.location.hash = '#/start';
}

/* 文字编辑工具栏 */
function TextToolbar({ engine }: { engine: EditorEngine }) {
  const { t } = useLang();
  const obj = engine.getActive() as (IText | Textbox) | null;
  if (!obj) return null;

  const setProp = (patch: Record<string, any>) => {
    obj.set(patch);
    engine.canvas.requestRenderAll();
    engine.commit();
  };

  const fontSize = obj.fontSize ?? 64;
  const fontFamily = (obj.fontFamily as string) || 'Plus Jakarta Sans';
  const fill = (obj.fill as string) || '#1a1a1a';
  const bold = (obj.fontWeight === 'bold' || obj.fontWeight === 700);
  const italic = obj.fontStyle === 'italic';
  const underline = obj.underline === true;

  return (
    <div className="ed-textbar">
      {/* 字体 */}
      <select className="ed-font-select" value={fontFamily} onChange={(e) => setProp({ fontFamily: e.target.value })}>
        {FONTS.map((f) => <option key={f.family} value={f.family}>{f.name.zh}</option>)}
      </select>

      <button className={`ed-tb-btn ${bold ? 'on' : ''}`} onClick={() => setProp({ fontWeight: bold ? 400 : 700 })} title={t('加粗', 'Bold')}><b>B</b></button>
      <button className={`ed-tb-btn ${italic ? 'on' : ''}`} onClick={() => setProp({ fontStyle: italic ? 'normal' : 'italic' })} title={t('斜体', 'Italic')}><i>I</i></button>
      <button className={`ed-tb-btn ${underline ? 'on' : ''}`} onClick={() => setProp({ underline: !underline })} title={t('下划线', 'Underline')}><u>U</u></button>

      <div className="ed-divider-v" />

      {/* 字号 */}
      <div className="ed-size-ctl">
        <button onClick={() => setProp({ fontSize: Math.max(8, fontSize - 8) })}>−</button>
        <span>{Math.round(fontSize)}</span>
        <button onClick={() => setProp({ fontSize: fontSize + 8 })}>+</button>
      </div>

      {/* 颜色 */}
      <label className="ed-color-pick" title={t('颜色', 'Color')}>
        <input type="color" value={toHex(fill)} onChange={(e) => setProp({ fill: e.target.value })} />
        <span style={{ background: fill }} />
      </label>

      <div className="ed-divider-v" />

      {/* 对齐 */}
      {[['left', 'M4 6h16M4 12h10M4 18h14'], ['center', 'M8 6h8M6 12h12M7 18h10'], ['right', 'M4 6h16M10 12h16M6 18h16']].map(([align, d]) => (
        <button key={align} className={`ed-tb-btn ${obj.textAlign === align ? 'on' : ''}`} onClick={() => setProp({ textAlign: align })} title={align === 'left' ? t('左对齐', 'Align left') : align === 'center' ? t('居中', 'Center') : t('右对齐', 'Align right')}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d={d} /></svg>
        </button>
      ))}

      {/* 行距 */}
      <div className="ed-size-ctl">
        <button onClick={() => setProp({ lineHeight: Math.max(0.7, (obj.lineHeight ?? 1.1) - 0.1) })} title={t('减小行距', 'Less spacing')}>−</button>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 3v18M12 7l-6 6M12 17l-6-6" /></svg>
        <button onClick={() => setProp({ lineHeight: (obj.lineHeight ?? 1.1) + 0.1 })} title={t('增大行距', 'More spacing')}>+</button>
      </div>

      {/* 字距 */}
      <div className="ed-size-ctl">
        <button onClick={() => setProp({ charSpacing: Math.max(-200, (obj.charSpacing ?? 0) - 30) })} title={t('减小字距', 'Tighter tracking')}>−</button>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 6v12M15 6v12M4 9h3M17 9h3M4 15h3M17 15h3" /></svg>
        <button onClick={() => setProp({ charSpacing: (obj.charSpacing ?? 0) + 30 })} title={t('增大字距', 'Wider tracking')}>+</button>
      </div>
    </div>
  );
}

function toHex(color: string): string {
  // fabric fill 可能是 rgb(...) 或 #hex，这里尽力转成 input[type=color] 能接受的 hex
  if (!color) return '#1a1a1a';
  if (color.startsWith('#')) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    return '#' + [m[1], m[2], m[3]].map((x) => parseInt(x, 10).toString(16).padStart(2, '0')).join('');
  }
  return '#1a1a1a';
}
