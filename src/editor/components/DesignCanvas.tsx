/* 中间画布：面切换 + 缩放控制 + 平面设计/3D/刀模三视图内容。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { Icon } from '../../components/icons';
import Viewer3D from '../../components/Viewer3D';
import LayerView from './LayerView';
import DielineView from './DielineView';
import AssetLibrary from './AssetLibrary';
import { FACE_LABELS, MM_TO_PX, zoomBtn } from '../constants';
import type { FaceId } from '../../types';

const FACE_ORDER: FaceId[] = ['front', 'back', 'left', 'right', 'top'];

export default function DesignCanvas() {
  const ed = useEditor();
  const face = ed.face;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f4f4f2', minWidth: 0 }}>
      {/* 面切换 + 缩放控制条 */}
      <div style={{
        height: 38, borderBottom: '1px solid #e5e5e5', display: 'flex',
        alignItems: 'center', padding: '0 12px', gap: 4, background: '#fff',
      }}>
        {ed.activeTool === 'assets' ? (
          <div style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>素材库</div>
        ) : (
          <>
            {/* 平面设计视图才显示面切换 */}
            {ed.viewMode === 'design' && FACE_ORDER.map((f) => (
              <button
                key={f}
                onClick={() => ed.setCurrentFace(f)}
                style={{
                  padding: '4px 12px', fontSize: 12,
                  background: ed.currentFace === f ? '#333' : '#fff',
                  color: ed.currentFace === f ? '#fff' : '#666',
                  border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer',
                }}
              >
                {FACE_LABELS[f]}
              </button>
            ))}

            <div style={{ flex: 1 }} />

            {/* 缩放控制 */}
            <button onClick={() => ed.setZoom((z) => Math.max(0.1, +(z - 0.1).toFixed(2)))} style={zoomBtn} title="缩小">
              <Icon name="minus" size={13} />
            </button>
            <button
              onClick={() => ed.setZoom(1)}
              style={{ ...zoomBtn, minWidth: 52 }}
              title="重置为 100%"
            >
              {Math.round(ed.zoom * 100)}%
            </button>
            <button onClick={() => ed.setZoom((z) => Math.min(5, +(z + 0.1).toFixed(2)))} style={zoomBtn} title="放大">
              <Icon name="plus" size={13} />
            </button>
            <button onClick={ed.fitToScreen} style={{ ...zoomBtn, display: 'flex', alignItems: 'center', gap: 4 }} title="适应屏幕">
              <Icon name="fit" size={13} />
              适应
            </button>
          </>
        )}
      </div>

      {/* 画布区域 */}
      <div
        className="studio-canvas-wrap"
        style={{
          flex: 1, overflow: 'auto', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 24,
          cursor: ed.isPanning ? 'grab' : 'default',
        }}
        onMouseDown={ed.onCanvasMouseDown}
        onMouseMove={ed.onCanvasMouseMove}
        onMouseUp={ed.onCanvasMouseUp}
        onMouseLeave={ed.onCanvasMouseLeave}
      >
        {ed.activeTool === 'assets' ? (
          <div style={{ width: '100%', height: '100%' }}>
            <AssetLibrary />
          </div>
        ) : (
          <>
        {/* 平面设计视图 */}
        {ed.viewMode === 'design' && face && (
          <div style={{
            position: 'relative',
            width: face.w * ed.zoom * MM_TO_PX,
            height: face.h * ed.zoom * MM_TO_PX,
            background: face.bg,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
            backgroundImage: ed.showGrid ? `
              linear-gradient(to right, rgba(59,130,246,0.2) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(59,130,246,0.2) 1px, transparent 1px)
            ` : undefined,
            backgroundSize: ed.showGrid ? `${10 * ed.zoom * MM_TO_PX}px ${10 * ed.zoom * MM_TO_PX}px` : undefined,
          }}
            onMouseMove={ed.onMouseMove}
            onMouseUp={ed.onMouseUp}
            onMouseLeave={ed.onMouseUp}
            onClick={ed.clearSelection}
          >
            {/* 智能参考线 */}
            {ed.guides.v !== undefined && (
              <div style={{
                position: 'absolute', left: ed.guides.v * ed.zoom * MM_TO_PX,
                top: 0, bottom: 0, width: 1, background: '#ef4444',
                zIndex: 100, pointerEvents: 'none',
              }} />
            )}
            {ed.guides.h !== undefined && (
              <div style={{
                position: 'absolute', top: ed.guides.h * ed.zoom * MM_TO_PX,
                left: 0, right: 0, height: 1, background: '#ef4444',
                zIndex: 100, pointerEvents: 'none',
              }} />
            )}

            {/* 图层 */}
            {face.layers.filter((l) => !l.hidden).map((layer) => (
              <LayerView key={layer.id} layer={layer} />
            ))}
          </div>
        )}

        {/* 3D 视图 */}
        {ed.viewMode === '3d' && ed.design && (
          <div style={{ width: '100%', height: '100%' }}>
            <Viewer3D
              design={ed.design}
              structure={ed.brief.structure || 'tuck'}
              size={ed.brief.size.l ? ed.brief.size : { l: 200, w: 150, h: 80 }}
              open={true}
              material="kraft"
              background="light"
              light={0.8}
              autoRotate={true}
            />
          </div>
        )}

        {/* 刀模与印前视图 */}
        {ed.viewMode === 'dieline' && <DielineView />}
          </>
        )}
      </div>
    </div>
  );
}
