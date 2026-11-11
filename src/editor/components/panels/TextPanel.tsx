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
import { useLang } from '../../../i18n';

/* 预设与字体名单存双语：常量在模块加载时求值，拿不到当前语言。
 * 预设插进画布的示例文字按语言取——英文界面插进去的就是英文示例。 */
const PRESETS: { id: TextPreset; zh: string; en: string; sampleZh: string; sampleEn: string; style: React.CSSProperties }[] = [
  { id: 'title', zh: '主标题', en: 'Headline', sampleZh: '主标题', sampleEn: 'Headline', style: { fontSize: 20, fontWeight: 700, fontFamily: '"Songti SC",serif' } },
  { id: 'subtitle', zh: '副标题', en: 'Subheading', sampleZh: '副标题', sampleEn: 'Subheading', style: { fontSize: 13, letterSpacing: 2 } },
  { id: 'body', zh: '正文', en: 'Body copy', sampleZh: '正文内容', sampleEn: 'Body copy', style: { fontSize: 11 } },
  { id: 'price', zh: '价格', en: 'Price', sampleZh: '¥128', sampleEn: '$18', style: { fontSize: 18, fontWeight: 700, color: '#c0392b' } },
  { id: 'label', zh: '英文标签', en: 'Small label', sampleZh: 'PREMIUM', sampleEn: 'PREMIUM', style: { fontSize: 9, letterSpacing: 2.4 } },
];

const FONTS: { id: string; zh: string; en: string }[] = [
  { id: '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif', zh: '苹方 / 黑体', en: 'PingFang / Hei' },
  { id: '"Songti SC","STSong","Noto Serif CJK SC",serif', zh: '宋体', en: 'Songti' },
  { id: '"Kaiti SC","STKaiti","KaiTi",serif', zh: '楷体', en: 'Kaiti' },
  { id: '"Yuanti SC","YouYuan",sans-serif', zh: '圆体', en: 'Yuanti' },
  { id: '"FangSong","STFangsong",serif', zh: '仿宋', en: 'Fangsong' },
  { id: '"STXingkai","Xingkai SC",cursive', zh: '行楷', en: 'Xingkai' },
  { id: '"Helvetica Neue",Helvetica,Arial,sans-serif', zh: 'Helvetica', en: 'Helvetica' },
  { id: 'Georgia,"Times New Roman",serif', zh: 'Georgia', en: 'Georgia' },
  { id: '"Courier New",monospace', zh: '等宽', en: 'Monospace' },
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
  const { lang, t } = useLang();
  const tl = ed.selectedL && ed.selectedL.type === 'text' ? (ed.selectedL as TextLayer) : null;
  const set = (patch: Partial<TextLayer>, record = true) => { if (tl) ed.updateLayer(tl.id, patch, record); };

  return (
    <div className="ed-panel">
      <div className="ed-panel-head">
        <div className="ed-panel-title"><Icon name="text" size={17} /><span>{t('文字', 'Text')}</span></div>
        <p>{t('点一个样式加入画布，再改字体、字色与排版', 'Add a style to the artboard, then adjust font, colour and layout')}</p>
      </div>

      <div className="ed-panel-body">
        <div className="ed-section-label">{t('添加文字', 'Add text')}</div>
        <div className="ed-preset-grid">
          {PRESETS.map((p) => (
            <button key={p.id} className="ed-preset" onClick={() => ed.addTextPreset(p.id)} title={t(`添加${p.zh}`, `Add ${p.en}`)}>
              <span className="ed-preset-sample" style={p.style}>{lang === 'en' ? p.sampleEn : p.sampleZh}</span>
              <span className="ed-preset-name">{lang === 'en' ? p.en : p.zh}</span>
            </button>
          ))}
        </div>

        {!tl && (
          <div className="ed-hint-card">
            <Icon name="select" size={16} />
            <p>{t('选中画布上的文字图层，这里会展开完整的字体与排版设置。', 'Select a text layer on the artboard to open the full type and layout controls here.')}</p>
          </div>
        )}

        {tl && (
          <>
            <div className="ed-section-label">{t('内容', 'Content')}</div>
            <textarea
              className="ed-textarea"
              rows={2}
              value={tl.text}
              onChange={(e) => set({ text: e.target.value, placeholder: false })}
              placeholder={t('输入文字内容', 'Enter the text')}
            />

            <div className="ed-section-label">{t('字体', 'Font')}</div>
            <div className="ed-font-list">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  className={`ed-font ${tl.fontFamily === f.id ? 'on' : ''}`}
                  style={{ fontFamily: f.id }}
                  onClick={() => set({ fontFamily: f.id })}
                >
                  <span>{lang === 'en' ? f.en : f.zh}</span>
                  <em>{t('包装设计 Aa', 'Packaging Aa')}</em>
                </button>
              ))}
            </div>

            <Row label={t('字号', 'Font size')} value={`${Math.round(tl.fontSize)} pt`}>
              <input type="range" min={5} max={90} step={0.5} value={tl.fontSize}
                onPointerDown={ed.pushHistory}
                onChange={(e) => set({ fontSize: Number(e.target.value) }, false)} />
            </Row>

            <Row label={t('字重', 'Weight')}>
              <div className="ed-seg">
                {[300, 400, 500, 600, 700, 800].map((w) => (
                  <button key={w} className={tl.fontWeight === w ? 'on' : ''}
                    onClick={() => set({ fontWeight: w })}>{w}</button>
                ))}
              </div>
            </Row>

            <Row label={t('对齐', 'Align')}>
              <div className="ed-seg">
                {([['left', 'alignLeft'], ['center', 'alignHCenter'], ['right', 'alignRight']] as const).map(([a, ic]) => (
                  <button key={a} className={tl.align === a ? 'on' : ''} onClick={() => set({ align: a })} title={a}>
                    <Icon name={ic} size={15} />
                  </button>
                ))}
              </div>
            </Row>

            <Row label={t('行距', 'Line height')} value={`${tl.lineHeight.toFixed(2)} em`}>
              <input type="range" min={0.8} max={2.6} step={0.02} value={tl.lineHeight}
                onPointerDown={ed.pushHistory}
                onChange={(e) => set({ lineHeight: Number(e.target.value) }, false)} />
            </Row>

            <Row label={t('字距', 'Letter spacing')} value={`${tl.letterSpacing.toFixed(2)} em`}>
              <input type="range" min={-0.08} max={0.6} step={0.01} value={tl.letterSpacing}
                onPointerDown={ed.pushHistory}
                onChange={(e) => set({ letterSpacing: Number(e.target.value) }, false)} />
            </Row>

            <div className="ed-section-label">{t('字色', 'Colour')}</div>
            <div className="ed-swatch-row">
              {COLORS.map((c) => (
                <button key={c} className={`ed-swatch ${!tl.gradient?.enabled && tl.color === c ? 'on' : ''}`}
                  style={{ background: c }} onClick={() => set({ color: c, gradient: { ...(tl.gradient || { from: c, to: '#ffffff', angle: 90 }), enabled: false } })}
                  title={c} />
              ))}
              <label className="ed-color-pick" title={t('自定义颜色', 'Custom colour')}>
                <input type="color" value={tl.color} onChange={(e) => set({ color: e.target.value })} />
                <Icon name="palette" size={15} />
              </label>
            </div>

            <div className="ed-switch-row">
              <div>
                <strong>{t('文字渐变', 'Text gradient')}</strong>
                <em>{t('双色渐变可做金属 / 烫金质感', 'Two-colour gradients give a metallic or foil look')}</em>
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
                aria-label={t('切换文字渐变', 'Toggle text gradient')}
              ><span /></button>
            </div>

            {tl.gradient?.enabled && (
              <div className="ed-gradient-box">
                <div className="ed-gradient-preview" style={{ background: `linear-gradient(${tl.gradient.angle}deg, ${tl.gradient.from}, ${tl.gradient.to})` }}>
                  <span style={{ fontFamily: tl.fontFamily, fontWeight: tl.fontWeight }}>{tl.text || t('渐变文字', 'Gradient text')}</span>
                </div>
                <div className="ed-gradient-colors">
                  <label>{t('起始', 'From')}<input type="color" value={tl.gradient.from}
                    onChange={(e) => set({ gradient: { ...tl.gradient!, from: e.target.value } })} /></label>
                  <label>{t('结束', 'To')}<input type="color" value={tl.gradient.to}
                    onChange={(e) => set({ gradient: { ...tl.gradient!, to: e.target.value } })} /></label>
                </div>
                <Row label={t('渐变角度', 'Gradient angle')} value={`${Math.round(tl.gradient.angle)}°`}>
                  <input type="range" min={0} max={360} step={1} value={tl.gradient.angle}
                    onPointerDown={ed.pushHistory}
                    onChange={(e) => set({ gradient: { ...tl.gradient!, angle: Number(e.target.value) } }, false)} />
                </Row>
              </div>
            )}

            <Row label={t('弯曲', 'Curve')} value={tl.curve ? `${tl.curve}` : t('直线', 'Straight')}>
              <input type="range" min={-100} max={100} step={1} value={tl.curve || 0}
                onPointerDown={ed.pushHistory}
                onChange={(e) => set({ curve: Number(e.target.value) }, false)} />
              <div className="ed-tiny-actions">
                <button onClick={() => set({ curve: -60 })}>{t('下弧', 'Arc down')}</button>
                <button onClick={() => set({ curve: 0 })}>{t('拉直', 'Straighten')}</button>
                <button onClick={() => set({ curve: 60 })}>{t('上弧', 'Arc up')}</button>
              </div>
            </Row>

            <div className="ed-quick-actions">
              <button onClick={() => ed.duplicateLayer(tl.id)}><Icon name="copy" size={14} /> {t('复制', 'Duplicate')}</button>
              <button onClick={() => ed.moveLayerUp(tl.id)}><Icon name="chevronUp" size={14} /> {t('上移', 'Up')}</button>
              <button onClick={() => ed.moveLayerDown(tl.id)}><Icon name="chevronDown" size={14} /> {t('下移', 'Down')}</button>
              <button className="danger" onClick={() => ed.deleteLayer(tl.id)}><Icon name="trash" size={14} /> {t('删除', 'Delete')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
