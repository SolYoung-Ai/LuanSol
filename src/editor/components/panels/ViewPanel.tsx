/* 视图面板：网格、缩放与当前面信息（左栏「标尺」）。 */
import React from 'react';
import { useEditor } from '../../EditorContext';
import { Icon } from '../../../components/icons';
import { faceLabel } from '../../constants';
import { structName, structureById } from '../../../engine/structure';
import { useLang } from '../../../i18n';

export default function ViewPanel() {
  const ed = useEditor();
  const { lang, t } = useLang();
  const f = ed.face;

  return (
    <div className="ed-panel">
      <div className="ed-panel-head">
        <div className="ed-panel-title"><Icon name="ruler" size={17} /><span>{t('视图与参考', 'View & guides')}</span></div>
        <p>{t('对齐、网格与画布缩放', 'Alignment, grid and canvas zoom')}</p>
      </div>
      <div className="ed-panel-body">
        <div className="ed-switch-row">
          <div>
            <strong>{t('显示网格', 'Show grid')}</strong>
            <em>{t('每格 10mm，用于对齐元素', 'One 10mm square per cell, for aligning elements')}</em>
          </div>
          <button className={`ed-switch ${ed.showGrid ? 'on' : ''}`} onClick={() => ed.setShowGrid((v) => !v)} aria-label={t('显示网格', 'Show grid')}>
            <span />
          </button>
        </div>

        <div className="ed-section-label">{t('缩放', 'Zoom')}</div>
        <div className="ed-zoom-row">
          <button onClick={() => ed.setZoom((z) => Math.max(0.1, +(z - 0.1).toFixed(2)))}><Icon name="minus" size={15} /></button>
          <strong>{Math.round(ed.zoom * 100)}%</strong>
          <button onClick={() => ed.setZoom((z) => Math.min(5, +(z + 0.1).toFixed(2)))}><Icon name="plus" size={15} /></button>
          <button className="wide" onClick={ed.fitToScreen}><Icon name="fit" size={14} /> {t('适应屏幕', 'Fit to screen')}</button>
        </div>

        <div className="ed-section-label">{t('当前面', 'Current face')}</div>
        <div className="ed-kv">
          <div><span>{t('包装面', 'Face')}</span><strong>{faceLabel(ed.currentFace, lang)}</strong></div>
          <div><span>{t('成品尺寸', 'Finished size')}</span><strong>{f ? `${f.w} × ${f.h} mm` : '—'}</strong></div>
          <div><span>{t('结构', 'Structure')}</span><strong>{ed.brief.structure ? structName(structureById(ed.brief.structure), lang) : '—'}</strong></div>
          <div><span>{t('图层数', 'Layers')}</span><strong>{f?.layers.length ?? 0}</strong></div>
        </div>

        <div className="ed-hint-card">
          <Icon name="ruler" size={16} />
          <p>{t('按住空格拖动可平移画布；选中元素后拖动控制点缩放，Shift 保持比例。', 'Hold space and drag to pan the canvas; drag a selected element\'s handles to resize, holding Shift to keep the ratio.')}</p>
        </div>
      </div>
    </div>
  );
}
