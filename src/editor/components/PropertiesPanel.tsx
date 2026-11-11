/* 右侧属性面板：根据选中对象动态显示通用/文字/图片/形状属性，未选中显示工程属性。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { inputStyle } from '../constants';
import type { TextLayer, ImageLayer, ShapeLayer } from '../../types';
import { useLang } from '../../i18n';

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
  const { t } = useLang();
  const l = ed.selectedL;

  return (
    <div style={{ padding: 14, borderBottom: '1px solid #eee', maxHeight: '55%', overflowY: 'auto' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 4 }}>
        {l ? t(`选中：${l.name}`, `Selected: ${l.name}`) : t('工程属性', 'Artboard')}
      </div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 12 }}>
        {l ? t(`类型：${l.type === 'text' ? '文字' : l.type === 'image' ? '图片' : '形状'}`, `Type: ${l.type === 'text' ? 'text' : l.type === 'image' ? 'image' : 'shape'}`) : t('未选中图层', 'No layer selected')}
      </div>

      {/* 未选中：工程属性 */}
      {!l && (
        <div style={{ fontSize: 12, color: '#555', lineHeight: 2 }}>
          <div>{t('当前面', 'Face')}：{ed.currentFace}</div>
          <div>{t('面尺寸', 'Face size')}：{ed.face ? `${ed.face.w} × ${ed.face.h} mm` : '—'}</div>
          <div>{t('背景色', 'Background')}：{ed.face?.bg || '—'}</div>
          <div>{t('缩放', 'Zoom')}：{Math.round(ed.zoom * 100)}%</div>
        </div>
      )}

      {l && (
        <div>
          {/* 通用属性 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <NumberField label="X (mm)" value={l.x} onChange={(v) => ed.updateLayer(l.id, { x: v })} />
            <NumberField label="Y (mm)" value={l.y} onChange={(v) => ed.updateLayer(l.id, { y: v })} />
            <NumberField label={t('宽度 (mm)', 'Width (mm)')} value={l.w} onChange={(v) => ed.updateLayer(l.id, { w: Math.max(1, v) })} />
            <NumberField label={t('高度 (mm)', 'Height (mm)')} value={l.h} onChange={(v) => ed.updateLayer(l.id, { h: Math.max(1, v) })} />
            <NumberField label={t('旋转 (°)', 'Rotation (°)')} value={l.rotation} step={1} onChange={(v) => ed.updateLayer(l.id, { rotation: v })} />
            <NumberField label={t('透明度', 'Opacity')} value={l.opacity} onChange={(v) => ed.updateLayer(l.id, { opacity: Math.min(1, Math.max(0, v)) })} />
          </div>

          {/* 文字属性 */}
          {l.type === 'text' && (() => {
            const tl = l as TextLayer;
            return (
              <>
                <SectionTitle>{t('文字属性', 'Text')}</SectionTitle>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>{t('文字内容', 'Text content')}</div>
                  <textarea
                    value={tl.text} rows={3}
                    onChange={(e) => ed.updateLayer(tl.id, { text: e.target.value })}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <NumberField label={t('字号 (pt)', 'Font size (pt)')} value={tl.fontSize} step={1} onChange={(v) => ed.updateLayer(tl.id, { fontSize: Math.max(1, v) })} />
                  <label>
                    <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>{t('字重', 'Weight')}</div>
                    <select value={tl.fontWeight} onChange={(e) => ed.updateLayer(tl.id, { fontWeight: parseInt(e.target.value) })} style={inputStyle}>
                      <option value="300">{t('300 细', '300 Light')}</option>
                      <option value="400">{t('400 常规', '400 Regular')}</option>
                      <option value="500">{t('500 中等', '500 Medium')}</option>
                      <option value="600">{t('600 半粗', '600 Semi-bold')}</option>
                      <option value="700">{t('700 粗', '700 Bold')}</option>
                    </select>
                  </label>
                  <label>
                    <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>{t('颜色', 'Colour')}</div>
                    <input type="color" value={tl.color} onChange={(e) => ed.updateLayer(tl.id, { color: e.target.value })} style={{ ...inputStyle, height: 32, padding: 2 }} />
                  </label>
                  <NumberField label={t('行高', 'Line height')} value={tl.lineHeight} onChange={(v) => ed.updateLayer(tl.id, { lineHeight: Math.max(0.5, v) })} />
                  <NumberField label={t('字距 (em)', 'Letter spacing (em)')} value={tl.letterSpacing} step={0.01} onChange={(v) => ed.updateLayer(tl.id, { letterSpacing: v })} />
                  <label>
                    <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>{t('对齐', 'Align')}</div>
                    <select value={tl.align} onChange={(e) => ed.updateLayer(tl.id, { align: e.target.value as TextLayer['align'] })} style={inputStyle}>
                      <option value="left">{t('左对齐', 'Left')}</option>
                      <option value="center">{t('居中', 'Centre')}</option>
                      <option value="right">{t('右对齐', 'Right')}</option>
                    </select>
                  </label>
                </div>
                <label style={{ display: 'block', marginTop: 8 }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>{t('字体', 'Font')}</div>
                  <select value={tl.fontFamily} onChange={(e) => ed.updateLayer(tl.id, { fontFamily: e.target.value })} style={inputStyle}>
                    <option value="system-ui, sans-serif">{t('系统无衬线', 'System sans-serif')}</option>
                    <option value="Georgia, serif">{t('Georgia 衬线', 'Georgia serif')}</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                    <option value="Courier New, monospace">{t('Courier New 等宽', 'Courier New monospace')}</option>
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
                <SectionTitle>{t('图片属性', 'Image')}</SectionTitle>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>{t('填充模式', 'Fit mode')}</div>
                  <select value={il.fit} onChange={(e) => ed.updateLayer(il.id, { fit: e.target.value as ImageLayer['fit'] })} style={inputStyle}>
                    <option value="contain">{t('完整显示 (contain)', 'Fit inside (contain)')}</option>
                    <option value="cover">{t('铺满裁切 (cover)', 'Fill and crop (cover)')}</option>
                  </select>
                </label>
                <label style={{ display: 'block' }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>{t('替换图片', 'Replace image')}</div>
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
                <SectionTitle>{t('形状属性', 'Shape')}</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label>
                    <div style={{ marginBottom: 4, fontSize: 11, color: '#777' }}>{t('填充色', 'Fill')}</div>
                    <input type="color" value={sl.fill} onChange={(e) => ed.updateLayer(sl.id, { fill: e.target.value })} style={{ ...inputStyle, height: 32, padding: 2 }} />
                  </label>
                  <NumberField label={t('描边宽度', 'Stroke width')} value={sl.strokeWidth} step={0.1} onChange={(v) => ed.updateLayer(sl.id, { strokeWidth: v })} />
                  <NumberField label={t('圆角 (mm)', 'Corner radius (mm)')} value={sl.rx || 0} onChange={(v) => ed.updateLayer(sl.id, { rx: Math.max(0, v) })} />
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
