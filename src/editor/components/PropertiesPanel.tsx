/* 右侧属性面板：根据选中对象动态显示通用/文字/图片/形状属性，未选中显示工程属性。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { inputStyle } from '../constants';
import type { TextLayer, ImageLayer, ShapeLayer } from '../../types';

function NumberField({ label, value, step = 0.1, onChange }: {
  label: string; value: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <label>
      <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>{label}</div>
      <input
        type="number" step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={inputStyle}
      />
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontWeight: 600, fontSize: 12, margin: '12px 0 8px',
      paddingTop: 10, borderTop: '1px solid #eee', color: '#333',
    }}>
      {children}
    </div>
  );
}

export default function PropertiesPanel() {
  const ed = useEditor();
  const l = ed.selectedL;

  return (
    <div style={{ padding: 14, borderBottom: '1px solid #eee', maxHeight: '55%', overflowY: 'auto' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 4 }}>
        {l ? `选中：${l.name}` : '工程属性'}
      </div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 12 }}>
        {l ? `类型：${l.type === 'text' ? '文字' : l.type === 'image' ? '图片' : '形状'}` : '未选中图层'}
      </div>

      {/* 未选中：工程属性 */}
      {!l && (
        <div style={{ fontSize: 12, color: '#555', lineHeight: 2 }}>
          <div>当前面：{ed.currentFace}</div>
          <div>面尺寸：{ed.face ? `${ed.face.w} × ${ed.face.h} mm` : '—'}</div>
          <div>背景色：{ed.face?.bg || '—'}</div>
          <div>缩放：{Math.round(ed.zoom * 100)}%</div>
        </div>
      )}

      {l && (
        <div>
          {/* 通用属性 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <NumberField label="X (mm)" value={l.x} onChange={(v) => ed.updateLayer(l.id, { x: v })} />
            <NumberField label="Y (mm)" value={l.y} onChange={(v) => ed.updateLayer(l.id, { y: v })} />
            <NumberField label="宽度 (mm)" value={l.w} onChange={(v) => ed.updateLayer(l.id, { w: Math.max(1, v) })} />
            <NumberField label="高度 (mm)" value={l.h} onChange={(v) => ed.updateLayer(l.id, { h: Math.max(1, v) })} />
            <NumberField label="旋转 (°)" value={l.rotation} step={1} onChange={(v) => ed.updateLayer(l.id, { rotation: v })} />
            <NumberField label="透明度" value={l.opacity} onChange={(v) => ed.updateLayer(l.id, { opacity: Math.min(1, Math.max(0, v)) })} />
          </div>

          {/* 文字属性 */}
          {l.type === 'text' && (() => {
            const tl = l as TextLayer;
            return (
              <>
                <SectionTitle>文字属性</SectionTitle>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>文字内容</div>
                  <textarea
                    value={tl.text} rows={3}
                    onChange={(e) => ed.updateLayer(tl.id, { text: e.target.value })}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <NumberField label="字号 (pt)" value={tl.fontSize} step={1} onChange={(v) => ed.updateLayer(tl.id, { fontSize: Math.max(1, v) })} />
                  <label>
                    <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>字重</div>
                    <select value={tl.fontWeight} onChange={(e) => ed.updateLayer(tl.id, { fontWeight: parseInt(e.target.value) })} style={inputStyle}>
                      <option value="300">300 细</option>
                      <option value="400">400 常规</option>
                      <option value="500">500 中等</option>
                      <option value="600">600 半粗</option>
                      <option value="700">700 粗</option>
                    </select>
                  </label>
                  <label>
                    <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>颜色</div>
                    <input type="color" value={tl.color} onChange={(e) => ed.updateLayer(tl.id, { color: e.target.value })} style={{ ...inputStyle, height: 32, padding: 2 }} />
                  </label>
                  <NumberField label="行高" value={tl.lineHeight} onChange={(v) => ed.updateLayer(tl.id, { lineHeight: Math.max(0.5, v) })} />
                  <NumberField label="字距 (em)" value={tl.letterSpacing} step={0.01} onChange={(v) => ed.updateLayer(tl.id, { letterSpacing: v })} />
                  <label>
                    <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>对齐</div>
                    <select value={tl.align} onChange={(e) => ed.updateLayer(tl.id, { align: e.target.value as TextLayer['align'] })} style={inputStyle}>
                      <option value="left">左对齐</option>
                      <option value="center">居中</option>
                      <option value="right">右对齐</option>
                    </select>
                  </label>
                </div>
                <label style={{ display: 'block', marginTop: 8 }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>字体</div>
                  <select value={tl.fontFamily} onChange={(e) => ed.updateLayer(tl.id, { fontFamily: e.target.value })} style={inputStyle}>
                    <option value="system-ui, sans-serif">系统无衬线</option>
                    <option value="Georgia, serif">Georgia 衬线</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                    <option value="Courier New, monospace">Courier New 等宽</option>
                  </select>
                </label>
              </>
            );
          })()}

          {/* 图片属性 */}
          {l.type === 'image' && (() => {
            const il = l as ImageLayer;
            return (
              <>
                <SectionTitle>图片属性</SectionTitle>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>填充模式</div>
                  <select value={il.fit} onChange={(e) => ed.updateLayer(il.id, { fit: e.target.value as ImageLayer['fit'] })} style={inputStyle}>
                    <option value="contain">完整显示 (contain)</option>
                    <option value="cover">铺满裁切 (cover)</option>
                  </select>
                </label>
                <label style={{ display: 'block' }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>替换图片</div>
                  <input
                    type="file" accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const img = new Image();
                        img.onload = () => ed.updateLayer(il.id, {
                          src: reader.result as string,
                          naturalW: img.naturalWidth, naturalH: img.naturalHeight,
                        });
                        img.src = reader.result as string;
                      };
                      reader.readAsDataURL(file);
                    }}
                    style={{ fontSize: 11 }}
                  />
                </label>
              </>
            );
          })()}

          {/* 形状属性 */}
          {l.type === 'shape' && (() => {
            const sl = l as ShapeLayer;
            return (
              <>
                <SectionTitle>形状属性</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label>
                    <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>填充色</div>
                    <input type="color" value={sl.fill} onChange={(e) => ed.updateLayer(sl.id, { fill: e.target.value })} style={{ ...inputStyle, height: 32, padding: 2 }} />
                  </label>
                  <NumberField label="描边宽度" value={sl.strokeWidth} step={0.1} onChange={(v) => ed.updateLayer(sl.id, { strokeWidth: v })} />
                  <NumberField label="圆角 (mm)" value={sl.rx || 0} onChange={(v) => ed.updateLayer(sl.id, { rx: Math.max(0, v) })} />
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
