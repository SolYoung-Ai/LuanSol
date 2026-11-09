/* 视图面板：网格、缩放与当前面信息（左栏「标尺」）。 */
import React from 'react';
import { useEditor } from '../../EditorContext';
import { Icon } from '../../../components/icons';
import { FACE_LABELS } from '../../constants';

export default function ViewPanel() {
  const ed = useEditor();
  const f = ed.face;

  return (
    <div className="ed-panel">
      <div className="ed-panel-head">
        <div className="ed-panel-title"><Icon name="ruler" size={17} /><span>视图与参考</span></div>
        <p>对齐、网格与画布缩放</p>
      </div>
      <div className="ed-panel-body">
        <div className="ed-switch-row">
          <div>
            <strong>显示网格</strong>
            <em>每格 10mm，用于对齐元素</em>
          </div>
          <button className={`ed-switch ${ed.showGrid ? 'on' : ''}`} onClick={() => ed.setShowGrid((v) => !v)} aria-label="显示网格">
            <span />
          </button>
        </div>

        <div className="ed-section-label">缩放</div>
        <div className="ed-zoom-row">
          <button onClick={() => ed.setZoom((z) => Math.max(0.1, +(z - 0.1).toFixed(2)))}><Icon name="minus" size={15} /></button>
          <strong>{Math.round(ed.zoom * 100)}%</strong>
          <button onClick={() => ed.setZoom((z) => Math.min(5, +(z + 0.1).toFixed(2)))}><Icon name="plus" size={15} /></button>
          <button className="wide" onClick={ed.fitToScreen}><Icon name="fit" size={14} /> 适应屏幕</button>
        </div>

        <div className="ed-section-label">当前面</div>
        <div className="ed-kv">
          <div><span>包装面</span><strong>{FACE_LABELS[ed.currentFace] || ed.currentFace}</strong></div>
          <div><span>成品尺寸</span><strong>{f ? `${f.w} × ${f.h} mm` : '—'}</strong></div>
          <div><span>结构</span><strong>{ed.brief.structure || '—'}</strong></div>
          <div><span>图层数</span><strong>{f?.layers.length ?? 0}</strong></div>
        </div>

        <div className="ed-hint-card">
          <Icon name="ruler" size={16} />
          <p>按住空格拖动可平移画布；选中元素后拖动控制点缩放，Shift 保持比例。</p>
        </div>
      </div>
    </div>
  );
}
