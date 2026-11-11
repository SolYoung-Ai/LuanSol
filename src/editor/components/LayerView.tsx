/* 单个图层渲染：文字/图片/形状 + 选中框、8 个缩放控制点、旋转手柄。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { useLang } from '../../i18n';
import type { Layer, TextLayer, ImageLayer, ShapeLayer } from '../../types';
import { HandlePos, HANDLE_POSITIONS, MM_TO_PX } from '../constants';
import { textMarkup } from '../../engine/design';

export default function LayerView({ layer }: { layer: Layer }) {
  const ed = useEditor();
  const { t } = useLang();
  const selected = ed.selectedLayer === layer.id;
  const z = ed.zoom;

  // 控制点定位
  const handleStyle = (h: HandlePos): React.CSSProperties => {
    const s: React.CSSProperties = {
      position: 'absolute', width: 10, height: 10,
      background: '#fff', border: '2px solid #f5c451', borderRadius: 2, zIndex: 10,
    };
    if (h === 'nw') { s.top = -6; s.left = -6; s.cursor = 'nwse-resize'; }
    if (h === 'n') { s.top = -6; s.left = '50%'; s.transform = 'translateX(-50%)'; s.cursor = 'ns-resize'; }
    if (h === 'ne') { s.top = -6; s.right = -6; s.cursor = 'nesw-resize'; }
    if (h === 'e') { s.top = '50%'; s.right = -6; s.transform = 'translateY(-50%)'; s.cursor = 'ew-resize'; }
    if (h === 'se') { s.bottom = -6; s.right = -6; s.cursor = 'nwse-resize'; }
    if (h === 's') { s.bottom = -6; s.left = '50%'; s.transform = 'translateX(-50%)'; s.cursor = 'ns-resize'; }
    if (h === 'sw') { s.bottom = -6; s.left = -6; s.cursor = 'nesw-resize'; }
    if (h === 'w') { s.top = '50%'; s.left = -6; s.transform = 'translateY(-50%)'; s.cursor = 'ew-resize'; }
    return s;
  };

  return (
    <div
      onMouseDown={(e) => ed.onLayerMouseDown(e, layer)}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: layer.x * z * MM_TO_PX,
        top: layer.y * z * MM_TO_PX,
        width: layer.w * z * MM_TO_PX,
        height: layer.h * z * MM_TO_PX,
        border: selected ? '2px solid #f5c451' : 'none',
        cursor: layer.locked ? 'not-allowed' : 'move',
        opacity: layer.opacity,
      }}
    >
      {/* 文字：与导出共用同一份 SVG，渐变 / 弧形所见即所得 */}
      {layer.type === 'text' && (
        <svg
          viewBox={`0 0 ${layer.w} ${layer.h}`}
          width="100%" height="100%"
          style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: textMarkup(layer as TextLayer) }}
        />
      )}

      {/* 图片 */}
      {layer.type === 'image' && (
        <img
          src={(layer as ImageLayer).src}
          alt={layer.name}
          style={{ width: '100%', height: '100%', objectFit: (layer as ImageLayer).fit }}
          draggable={false}
        />
      )}

      {/* 形状 */}
      {layer.type === 'shape' && (
        <div style={{
          width: '100%', height: '100%',
          background: (layer as ShapeLayer).fill,
          borderRadius: ((layer as ShapeLayer).rx || 0) * z * MM_TO_PX,
        }} />
      )}

      {/* 选中：控制点 + 旋转手柄 */}
      {selected && !layer.locked && (
        <>
          {HANDLE_POSITIONS.map((h) => (
            <div
              key={h}
              style={handleStyle(h)}
              onMouseDown={(e) => ed.onResizeMouseDown(e, layer, h)}
              onClick={(e) => e.stopPropagation()}
            />
          ))}

          {/* 旋转手柄连接线 */}
          <div style={{
            position: 'absolute', left: '50%', top: -14,
            width: 1, height: 8, background: '#f5c451', zIndex: 10, pointerEvents: 'none',
          }} />
          {/* 旋转手柄 */}
          <div
            style={{
              position: 'absolute', left: '50%', top: -26,
              transform: 'translateX(-50%)',
              width: 12, height: 12, borderRadius: '50%',
              background: '#fff', border: '2px solid #f5c451',
              cursor: 'grab', zIndex: 11,
            }}
            onMouseDown={(e) => ed.onRotateMouseDown(e, layer)}
            onClick={(e) => e.stopPropagation()}
            title={t('拖拽旋转（Shift 吸附 15°）', 'Drag to rotate (hold Shift to snap 15°)')}
          />
        </>
      )}
    </div>
  );
}
