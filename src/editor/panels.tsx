/* ============================================================
 * 设计台 · 左侧功能面板
 * ------------------------------------------------------------
 * 点击图标栏后展开的 280–320px 面板，包含：
 *   文字 / 形状 / 贴纸 / 图片 / 背景 / 图层，以及占位面板（视频/品牌/动画/音频）。
 * 面板只负责「展示与收集用户输入」，真正动到画布的动作通过 engine 回传。
 * ============================================================ */
import React, { useRef, useState } from 'react';
import { EditorEngine } from './engine';
import { FONTS, FONT_PAIRS, FONT_CATS, FontCat, FontPair } from './fonts';
import { SHAPE_GROUPS, STICKER_GROUPS, shapeIcon, ShapeDef } from './shapes';
import { COLOR_SWATCHES, GRADIENTS, PATTERNS } from './backgrounds';
import { useLang } from '../i18n';

/* ---------- 通用面板头 ---------- */
function PanelHead({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="ed-panel-head">
    <span>{title}</span>
    <button onClick={onClose} aria-label="关闭"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
  </div>;
}

/* ---------- 文字面板 ---------- */
export function TextPanel({ engine, onClose }: { engine: EditorEngine; onClose: () => void }) {
  const { lang, t } = useLang();
  const [fontQuery, setFontQuery] = useState('');
  const [fontCat, setFontCat] = useState<FontCat>('all');
  const [showFonts, setShowFonts] = useState(false);

  const addTitle = () => engine.addText({ text: lang === 'en' ? 'Add a title' : '添加标题', fontSize: 84, fontWeight: 700 });
  const addSubtitle = () => engine.addText({ text: lang === 'en' ? 'Add a subtitle' : '添加副标题', fontSize: 48, fontWeight: 500 });
  const addBody = () => engine.addText({ text: lang === 'en' ? 'Add body text' : '添加正文', fontSize: 30, fontWeight: 400 });

  const applyPair = (p: FontPair) => {
    engine.addText({ text: p.title, fontFamily: p.titleFamily, fontSize: 64, fontWeight: 700, top: 500 });
  };

  const filtered = FONTS.filter((f) => (fontCat === 'all' || f.cat === fontCat)
    && (fontQuery.trim() === '' || f.name.zh.includes(fontQuery.trim()) || f.name.en.toLowerCase().includes(fontQuery.trim().toLowerCase()) || f.family.toLowerCase().includes(fontQuery.trim().toLowerCase())));

  return <div className="ed-panel">
    <PanelHead title={t('文字', 'Text')} onClose={onClose} />

    <div className="ed-panel-scroll">
      {/* 添加文字 */}
      <div className="ed-sec-title">{t('添加文字', 'Add text')}</div>
      <div className="ed-add-row">
        {[
          { l: t('标题', 'Title'), big: true, fn: addTitle },
          { l: t('副标题', 'Subtitle'), big: false, fn: addSubtitle },
          { l: t('正文', 'Body'), big: false, fn: addBody },
        ].map((x) => (
          <button key={x.l} className={`ed-add-text ${x.big ? 'is-title' : ''}`} onClick={x.fn}>
            {x.l}
          </button>
        ))}
      </div>

      {/* 弯曲文字 */}
      <div className="ed-sec-title">{t('弯曲文字', 'Curved text')}</div>
      <div className="ed-curve-row">
        <button onClick={() => engine.addText({ text: lang === 'en' ? 'Curved up' : '向上弯曲', fontSize: 40, fontWeight: 600, top: 600 })} title={t('向上弯曲', 'Curve up')}>
          <svg viewBox="0 0 48 24" width="40" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20 Q24 -4 44 20" /></svg>
          {t('向上弯曲', 'Up')}
        </button>
        <button onClick={() => engine.addText({ text: lang === 'en' ? 'Curved down' : '向下弯曲', fontSize: 40, fontWeight: 600, top: 600 })} title={t('向下弯曲', 'Curve down')}>
          <svg viewBox="0 0 48 24" width="40" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4 Q24 28 44 4" /></svg>
          {t('向下弯曲', 'Down')}
        </button>
      </div>

      {/* 字体搭配 */}
      <div className="ed-sec-title">{t('字体搭配', 'Font pairs')}</div>
      <div className="ed-pair-row">
        {FONT_PAIRS.slice(0, 3).map((p) => (
          <button key={p.id} className={`ed-pair ed-pair-${p.style}`} onClick={() => applyPair(p)}>
            <b style={{ fontFamily: p.titleFamily }}>{lang === 'en' ? p.name.en : p.name.zh}</b>
            <span style={{ fontFamily: p.bodyFamily }}>{lang === 'en' ? 'Aa Bb' : '一小段正文'}</span>
          </button>
        ))}
      </div>

      {/* 字体搜索 / 分类 */}
      <div className="ed-sec-title">{t('字体', 'Fonts')}</div>
      <button className="ed-font-trigger" onClick={() => setShowFonts((v) => !v)}>
        <span>Plus Jakarta Sans</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {showFonts && (
        <div className="ed-font-box">
          <input className="ed-input" value={fontQuery} onChange={(e) => setFontQuery(e.target.value)} placeholder={t('搜索字体', 'Search fonts')} />
          <div className="ed-chips">
            {FONT_CATS.map((c) => (
              <button key={c.id} className={`ed-chip ${fontCat === c.id ? 'on' : ''}`} onClick={() => setFontCat(c.id)}>
                {lang === 'en' ? c.en : c.zh}
              </button>
            ))}
          </div>
          <div className="ed-font-list">
            {filtered.map((f) => (
              <button key={f.family} className="ed-font-item" onClick={() => { setShowFonts(false); engine.addText({ text: lang === 'en' ? 'Title' : '标题', fontFamily: f.family, fontSize: 64, fontWeight: 700 }); }}>
                <span style={{ fontFamily: f.family }}>{lang === 'en' ? f.name.en : f.name.zh}</span>
                <span style={{ fontFamily: f.family }}>Aa</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="ed-empty">{t('没有符合搜索条件的结果。', 'No results match your search.')}</div>}
          </div>
          <button className="ed-upload-font">{t('上传字体', 'Upload font')}</button>
        </div>
      )}
    </div>
  </div>;
}

/* ---------- 形状面板 ---------- */
export function ShapesPanel({ engine, onClose }: { engine: EditorEngine; onClose: () => void }) {
  const { lang, t } = useLang();
  return <div className="ed-panel">
    <PanelHead title={t('形状', 'Shapes')} onClose={onClose} />
    <div className="ed-panel-scroll">
      {SHAPE_GROUPS.map((g) => (
        <div key={g.id}>
          <div className="ed-sec-title">{lang === 'en' ? g.name.en : g.name.zh}</div>
          <div className="ed-shape-grid">
            {g.items.map((it) => (
              <button key={it.id} className="ed-shape-cell" onClick={() => engine.addShape(it.kind || 'rect', '#7c4dff')} title={lang === 'en' ? it.name.en : it.name.zh}>
                <span dangerouslySetInnerHTML={{ __html: shapeIcon(it.kind || 'rect') }} />
                <em>{lang === 'en' ? it.name.en : it.name.zh}</em>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>;
}

/* ---------- 贴纸面板 ---------- */
export function StickersPanel({ engine, onClose }: { engine: EditorEngine; onClose: () => void }) {
  const { lang, t } = useLang();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('basic');

  const group = STICKER_GROUPS.find((g) => g.id === cat) || STICKER_GROUPS[1];
  const items = group.items.filter((it) => query.trim() === '' || it.name.zh.includes(query.trim()) || it.name.en.toLowerCase().includes(query.trim().toLowerCase()));

  return <div className="ed-panel">
    <PanelHead title={t('贴纸', 'Stickers')} onClose={onClose} />
    <div className="ed-panel-scroll">
      <input className="ed-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('搜索贴纸', 'Search stickers')} />
      <div className="ed-chips">
        {STICKER_GROUPS.filter((g) => g.items.length > 0).map((g) => (
          <button key={g.id} className={`ed-chip ${cat === g.id ? 'on' : ''}`} onClick={() => setCat(g.id)}>
            {g.name.zh}
          </button>
        ))}
      </div>
      <div className="ed-sticker-grid">
        {items.map((it) => (
          <button key={it.id} className="ed-sticker-cell" onClick={() => engine.addSticker(it, undefined, undefined)} title={it.name.zh}>
            <span dangerouslySetInnerHTML={{ __html: shapeIcon(it.kind || 'circle', it.fill || '#7c4dff') }} />
          </button>
        ))}
      </div>
    </div>
  </div>;
}

/* ---------- 图片面板 ---------- */
export function ImagesPanel({ engine, onClose }: { engine: EditorEngine; onClose: () => void }) {
  const { t } = useLang();
  const [uploads, setUploads] = useState<string[]>([]);
  const [tab, setTab] = useState<'upload' | 'grid' | 'library'>('upload');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const read = (file: File) => {
    const r = new FileReader();
    r.onload = () => { setUploads((u) => [r.result as string, ...u]); void engine.addImage(r.result as string); };
    r.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    Array.from(e.dataTransfer.files).forEach(read);
  };

  return <div className="ed-panel">
    <PanelHead title={t('图片', 'Images')} onClose={onClose} />
    <div className="ed-tabs">
      {(['upload', 'grid', 'library'] as const).map((k) => (
        <button key={k} className={`ed-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
          {k === 'upload' ? t('上传内容', 'Uploads') : k === 'grid' ? t('网格', 'Grid') : t('图库照片', 'Library')}
        </button>
      ))}
    </div>
    <div className="ed-panel-scroll">
      {tab === 'upload' && (
        <>
          <div className="ed-sec-title">{t('上传图片', 'Upload images')}</div>
          <div
            className={`ed-drop ${drag ? 'drag' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M12 3v13M7 8l5-5 5 5" /></svg>
            <span>{t('点击上传', 'Click to upload')}</span>
            <em>{t('或将图片拖拽至此', 'or drag & drop here')}</em>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) read(e.target.files[0]); e.target.value = ''; }} />
          {uploads.length > 0 && <div className="ed-sec-title">{t('已上传', 'Uploaded')}</div>}
          <div className="ed-upload-grid">
            {uploads.map((u, i) => (
              <button key={i} className="ed-upload-cell" onClick={() => void engine.addImage(u)}>
                <img src={u} alt="" />
              </button>
            ))}
          </div>
          <div className="ed-hint">{t('你上传的图片在这里显示。', 'Your uploaded images appear here.')}</div>
        </>
      )}
      {(tab === 'grid' || tab === 'library') && (
        <div className="ed-placeholder">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5L5 20" /></svg>
          <p>{tab === 'library' ? t('图库照片即将上线。', 'Stock photos coming soon.') : t('网格视图即将上线。', 'Grid view coming soon.')}</p>
        </div>
      )}
    </div>
  </div>;
}

/* ---------- 背景面板 ---------- */
export function BackgroundPanel({ engine, onClose }: { engine: EditorEngine; onClose: () => void }) {
  const { lang, t } = useLang();
  const [custom, setCustom] = useState('#ffffff');
  const [patternColor, setPatternColor] = useState('#c8b6ff');
  const [patternOn, setPatternOn] = useState(false);

  return <div className="ed-panel">
    <PanelHead title={t('背景', 'Background')} onClose={onClose} />
    <div className="ed-panel-scroll">
      <div className="ed-sec-title">{t('页面背景', 'Page background')}</div>
      <div className="ed-color-row">
        <label className="ed-custom-color" title={t('自定义颜色', 'Custom color')}>
          <input type="color" value={custom} onChange={(e) => { setCustom(e.target.value); engine.setBackground({ type: 'color', color: e.target.value }); }} />
          <span className="ed-rainbow" />
        </label>
        {COLOR_SWATCHES.slice(0, 8).map((s) => (
          <button key={s.color} className="ed-swatch" style={{ background: s.color }} title={s.name} onClick={() => engine.setBackground({ type: 'color', color: s.color })} />
        ))}
      </div>
      <div className="ed-color-row">
        {COLOR_SWATCHES.slice(8).map((s) => (
          <button key={s.color} className="ed-swatch" style={{ background: s.color }} title={s.name} onClick={() => engine.setBackground({ type: 'color', color: s.color })} />
        ))}
      </div>

      <div className="ed-sec-title">{t('渐变', 'Gradients')}</div>
      <div className="ed-grad-row">
        {GRADIENTS.map((g) => (
          <button key={g.from + g.to} className="ed-grad" style={{ background: `linear-gradient(180deg, ${g.from}, ${g.to})` }} onClick={() => engine.setBackground({ type: 'gradient', from: g.from, to: g.to })} />
        ))}
      </div>

      <div className="ed-sec-title">{t('图案', 'Patterns')}</div>
      <div className="ed-pattern-tools">
        <label className="ed-color-dot" title={t('图案颜色', 'Pattern color')}>
          <input type="color" value={patternColor} onChange={(e) => { setPatternColor(e.target.value); if (patternOn) engine.setBackground({ type: 'pattern', pattern: 'dots', color: e.target.value }); }} />
          <span style={{ background: patternColor }} />
        </label>
        <label className="ed-toggle">
          <input type="checkbox" checked={patternOn} onChange={(e) => {
            setPatternOn(e.target.checked);
            engine.setBackground(e.target.checked ? { type: 'pattern', pattern: 'dots', color: patternColor } : { type: 'color', color: '#ffffff' });
          }} />
          <span>{t('图案背景', 'Pattern')}</span>
        </label>
      </div>
      <div className="ed-grad-row">
        {PATTERNS.map((p) => (
          <button key={p.id} className="ed-grad ed-pattern" style={{ background: '#fff' }} title={lang === 'en' ? p.name.en : p.name.zh} onClick={() => { setPatternOn(true); engine.setBackground({ type: 'pattern', pattern: p.id, color: patternColor }); }}>
            <span dangerouslySetInnerHTML={{ __html: patternPreview(p.id, patternColor) }} />
          </button>
        ))}
      </div>
    </div>
  </div>;
}

function patternPreview(id: string, color: string): string {
  const c = color;
  switch (id) {
    case 'dots': return `<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="5" fill="${c}"/></svg>`;
    case 'grid': return `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M0 20h40M20 0v40" stroke="${c}" stroke-width="1.5"/></svg>`;
    case 'diagonal': return `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M0 40L40 0M0 0l40 40" stroke="${c}" stroke-width="1.5"/></svg>`;
    case 'checker': return `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M0 0h20v20H0zM20 20h20v20H20z" fill="${c}"/></svg>`;
    case 'wave': return `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M0 20q5-10 10 0t10 0 10 0 10 0" stroke="${c}" stroke-width="2" fill="none"/></svg>`;
    case 'cross': return `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M19 0h2v40h-2zM0 19h40v2H0z" fill="${c}"/></svg>`;
    default: return `<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="5" fill="${c}"/></svg>`;
  }
}

/* ---------- 图层面板 ---------- */
export function LayersPanel({ engine, layers, activeId, onClose }: {
  engine: EditorEngine; layers: { id: string; name: string; kind: string; index: number }[]; activeId: string | null; onClose: () => void;
}) {
  const { t } = useLang();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // 列表从顶层到底层展示（index 大的在上）
  const list = [...layers].reverse();

  return <div className="ed-panel">
    <PanelHead title={t('图层', 'Layers')} onClose={onClose} />
    <div className="ed-panel-scroll">
      {list.length === 0 && <div className="ed-empty">{t('画布还没有元素。', 'No elements yet.')}</div>}
      {list.map((l) => (
        <div key={l.id} className={`ed-layer ${activeId === l.id ? 'on' : ''}`} onClick={() => engine.selectById(l.id)}>
          <span className="ed-layer-ic">
            {l.kind === 'text' ? 'T' : l.kind === 'image' ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.3" /></svg> : l.kind === 'line' ? '—' : '◆'}
          </span>
          {renaming === l.id ? (
            <input className="ed-layer-edit" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => { engine.renameById(l.id, draft.trim() || l.name); setRenaming(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { engine.renameById(l.id, draft.trim() || l.name); setRenaming(null); } if (e.key === 'Escape') setRenaming(null); }} />
          ) : <span className="ed-layer-name">{l.name}</span>}
          <div className="ed-layer-ops" onClick={(e) => e.stopPropagation()}>
            <button title={t('上移', 'Move up')} onClick={() => engine.moveLayer(l.id, 1)}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg></button>
            <button title={t('下移', 'Move down')} onClick={() => engine.moveLayer(l.id, -1)}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg></button>
            <button title={t('重命名', 'Rename')} onClick={() => { setRenaming(l.id); setDraft(l.name); }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg></button>
            <button title={t('删除', 'Delete')} onClick={() => engine.removeById(l.id)}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg></button>
          </div>
        </div>
      ))}
    </div>
  </div>;
}

/* ---------- 占位面板 ---------- */
export function PlaceholderPanel({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useLang();
  return <div className="ed-panel">
    <PanelHead title={title} onClose={onClose} />
    <div className="ed-placeholder">
      <p>{t('该功能即将上线。', 'This feature is coming soon.')}</p>
    </div>
  </div>;
}
