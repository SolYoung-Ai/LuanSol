/* ============================================================
 * 文字面板（左栏「文字」）
 * ------------------------------------------------------------
 * 上半部分：五个常用预设，一键加入画布；
 * 下半部分：选中文字图层后，直接改内容、字体、字号、字重、对齐、
 * 行距、字距、颜色、渐变、弧形，全部即时写回图层。
 * ============================================================ */
import React from 'react';
import { useEditor } from '../../EditorContext';
import { Icon } from '../../../components/icons';
import type { TextLayer } from '../../../types';
import type { TextPreset } from '../../constants';

const PRESETS: { id: TextPreset; label: string; sample: string; style: React.CSSProperties }[] = [
  { id: 'title', label: '主标题', sample: '主标题', style: { fontSize: 20, fontWeight: 700, fontFamily: '"Songti SC",serif' } },
  { id: 'subtitle', label: '副标题', sample: '副标题', style: { fontSize: 13, letterSpacing: 2 } },
  { id: 'body', label: '正文', sample: '正文内容', style: { fontSize: 11 } },
  { id: 'price', label: '价格', sample: '¥128', style: { fontSize: 18, fontWeight: 700, color: '#c0392b' } },
  { id: 'label', label: '英文标签', sample: 'PREMIUM', style: { fontSize: 9, letterSpacing: 2.4 } },
];

const FONTS: { id: string; label: string }[] = [
  { id: '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif', label: '苹方 / 黑体' },
  { id: '"Songti SC","STSong","Noto Serif CJK SC",serif', label: '宋体' },
  { id: '"Kaiti SC","STKaiti","KaiTi",serif', label: '楷体' },
  { id: '"Yuanti SC","YouYuan",sans-serif', label: '圆体' },
  { id: '"FangSong","STFangsong",serif', label: '仿宋' },
  { id: '"STXingkai","Xingkai SC",cursive', label: '行楷' },
  { id: '"Helvetica Neue",Helvetica,Arial,sans-serif', label: 'Helvetica' },
  { id: 'Georgia,"Times New Roman",serif', label: 'Georgia' },
  { id: '"Courier New",monospace', label: '等宽' },
];

const COLORS = ['#111111', '#ffffff', '#C0392B', '#D9602C', '#E8B04B', '#2F6B4F', '#1F3A5F', '#7A5AA8', '#8A8A8A'];

function Row({ label, children, value }: { label: string; children: React.ReactNode; value?: string }) {
  return (
    <div className="ed-row">
      <div className="ed-row-head"><span>{label}</span>{value !== undefined && <em>{value}</em>}</div>
      {children}
    </div>
  );
}

export default function TextPanel() {
  const ed = useEditor();
  const tl = ed.selectedL && ed.selectedL.type === 'text' ? (ed.selectedL as TextLayer) : null;
  const set = (patch: Partial<TextLayer>, record = true) => { if (tl) ed.updateLayer(tl.id, patch, record); };

  return (
    <div className="ed-panel">
      <div className="ed-panel-head">
        <div className="ed-panel-title"><Icon name="text" size={17} /><span>文字</span></div>
        <p>点一个样式加入画布，再改字体、字色与排版</p>
      </div>

      <div className="ed-panel-body">
        <div className="ed-section-label">添加文字</div>
        <div className="ed-preset-grid">
          {PRESETS.map((p) => (
            <button key={p.id} className="ed-preset" onClick={() => ed.addTextPreset(p.id)} title={`添加${p.label}`}>
              <span className="ed-preset-sample" style={p.style}>{p.sample}</span>
              <span className="ed-preset-name">{p.label}</span>
            </button>
          ))}
        </div>

        {!tl && (
          <div className="ed-hint-card">
            <Icon name="select" size={16} />
            <p>选中画布上的文字图层，这里会展开完整的字体与排版设置。</p>
          </div>
        )}

        {tl && (
          <>
            <div className="ed-section-label">内容</div>
            <textarea
              className="ed-textarea"
              rows={2}
              value={tl.text}
              onChange={(e) => set({ text: e.target.value, placeholder: false })}
              placeholder="输入文字内容"
            />

            <div className="ed-section-label">字体</div>
            <div className="ed-font-list">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  className={`ed-font ${tl.fontFamily === f.id ? 'on' : ''}`}
                  style={{ fontFamily: f.id }}
                  onClick={() => set({ fontFamily: f.id })}
                >
                  <span>{f.label}</span>
                  <em>包装设计 Aa</em>
                </button>
              ))}
            </div>

            <Row label="字号" value={`${Math.round(tl.fontSize)} pt`}>
              <input type="range" min={5} max={90} step={0.5} value={tl.fontSize}
                onPointerDown={ed.pushHistory}
                onChange={(e) => set({ fontSize: Number(e.target.value) }, false)} />
            </Row>

            <Row label="字重">
              <div className="ed-seg">
                {[300, 400, 500, 600, 700, 800].map((w) => (
                  <button key={w} className={tl.fontWeight === w ? 'on' : ''}
                    onClick={() => set({ fontWeight: w })}>{w}</button>
                ))}
              </div>
            </Row>

            <Row label="对齐">
              <div className="ed-seg">
                {([['left', 'alignLeft'], ['center', 'alignHCenter'], ['right', 'alignRight']] as const).map(([a, ic]) => (
                  <button key={a} className={tl.align === a ? 'on' : ''} onClick={() => set({ align: a })} title={a}>
                    <Icon name={ic} size={15} />
                  </button>
                ))}
              </div>
            </Row>

            <Row label="行距" value={`${tl.lineHeight.toFixed(2)} em`}>
              <input type="range" min={0.8} max={2.6} step={0.02} value={tl.lineHeight}
                onPointerDown={ed.pushHistory}
                onChange={(e) => set({ lineHeight: Number(e.target.value) }, false)} />
            </Row>

            <Row label="字距" value={`${tl.letterSpacing.toFixed(2)} em`}>
              <input type="range" min={-0.08} max={0.6} step={0.01} value={tl.letterSpacing}
                onPointerDown={ed.pushHistory}
                onChange={(e) => set({ letterSpacing: Number(e.target.value) }, false)} />
            </Row>

            <div className="ed-section-label">字色</div>
            <div className="ed-swatch-row">
              {COLORS.map((c) => (
                <button key={c} className={`ed-swatch ${!tl.gradient?.enabled && tl.color === c ? 'on' : ''}`}
                  style={{ background: c }} onClick={() => set({ color: c, gradient: { ...(tl.gradient || { from: c, to: '#ffffff', angle: 90 }), enabled: false } })}
                  title={c} />
              ))}
              <label className="ed-color-pick" title="自定义颜色">
                <input type="color" value={tl.color} onChange={(e) => set({ color: e.target.value })} />
                <Icon name="palette" size={15} />
              </label>
            </div>

            <div className="ed-switch-row">
              <div>
                <strong>文字渐变</strong>
                <em>双色渐变可做金属 / 烫金质感</em>
              </div>
              <button
                className={`ed-switch ${tl.gradient?.enabled ? 'on' : ''}`}
                onClick={() => set({
                  gradient: {
                    from: tl.gradient?.from || tl.color,
                    to: tl.gradient?.to || '#E8B04B',
                    angle: tl.gradient?.angle ?? 90,
                    enabled: !tl.gradient?.enabled,
                  },
                })}
                aria-label="切换文字渐变"
              ><span /></button>
            </div>

            {tl.gradient?.enabled && (
              <div className="ed-gradient-box">
                <div className="ed-gradient-preview" style={{ background: `linear-gradient(${tl.gradient.angle}deg, ${tl.gradient.from}, ${tl.gradient.to})` }}>
                  <span style={{ fontFamily: tl.fontFamily, fontWeight: tl.fontWeight }}>{tl.text || '渐变文字'}</span>
                </div>
                <div className="ed-gradient-colors">
                  <label>起始<input type="color" value={tl.gradient.from}
                    onChange={(e) => set({ gradient: { ...tl.gradient!, from: e.target.value } })} /></label>
                  <label>结束<input type="color" value={tl.gradient.to}
                    onChange={(e) => set({ gradient: { ...tl.gradient!, to: e.target.value } })} /></label>
                </div>
                <Row label="渐变角度" value={`${Math.round(tl.gradient.angle)}°`}>
                  <input type="range" min={0} max={360} step={1} value={tl.gradient.angle}
                    onPointerDown={ed.pushHistory}
                    onChange={(e) => set({ gradient: { ...tl.gradient!, angle: Number(e.target.value) } }, false)} />
                </Row>
              </div>
            )}

            <Row label="弯曲" value={tl.curve ? `${tl.curve}` : '直线'}>
              <input type="range" min={-100} max={100} step={1} value={tl.curve || 0}
                onPointerDown={ed.pushHistory}
                onChange={(e) => set({ curve: Number(e.target.value) }, false)} />
              <div className="ed-tiny-actions">
                <button onClick={() => set({ curve: -60 })}>下弧</button>
                <button onClick={() => set({ curve: 0 })}>拉直</button>
                <button onClick={() => set({ curve: 60 })}>上弧</button>
              </div>
            </Row>

            <div className="ed-quick-actions">
              <button onClick={() => ed.duplicateLayer(tl.id)}><Icon name="copy" size={14} /> 复制</button>
              <button onClick={() => ed.moveLayerUp(tl.id)}><Icon name="chevronUp" size={14} /> 上移</button>
              <button onClick={() => ed.moveLayerDown(tl.id)}><Icon name="chevronDown" size={14} /> 下移</button>
              <button className="danger" onClick={() => ed.deleteLayer(tl.id)}><Icon name="trash" size={14} /> 删除</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
