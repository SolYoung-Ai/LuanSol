/* ============================================================
   Studio 2.0 — 九步问卷的每一步
   ------------------------------------------------------------
   设计口径：
   · 一步只问一件事，页面上不出现长表单；
   · 每个答案写进 Ans<T> 时都带上来源（user / option / ai）；
   · 勾选即可、不勾也行，只有影响后续设计的项才卡「下一步」。
   ============================================================ */
import React, { useRef, useState } from 'react';
import {
  CATEGORIES, COLORS, PAGES, PATTERNS, STYLES, ans, formsFor, recommendSize, sizeOk, sizeText,
  type FormId, type PatternId, type SizeMM, type StyleId, type StudioProject,
} from './types';
import { compressImageForUpload } from '../workflow/imageUtils';
import { tl } from '../langStore';

/** 选中标记：白勾 + 描边，压在深底上时换成纯白 */
const Check = ({ light = false }: { light?: boolean }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
    <path d="M3.2 8.4l3 3.1 6.6-6.9" fill="none" stroke={light ? '#fff' : '#191919'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export interface StepProps {
  p: StudioProject;
  set: (fn: (p: StudioProject) => StudioProject) => void;
  next: () => void;
  t: (zh: string, en: string) => string;
}

export interface StepMeta {
  n: number;
  zh: string;
  en: string;
  subZh: string;
  subEn: string;
  /** 影响后续设计、必须回答的步骤 */
  required?: boolean;
}

export const STEPS: StepMeta[] = [
  { n: 1, zh: '产品类别', en: 'Product category', subZh: '先确定大类，后面的包装形式会跟着变。', subEn: 'Pick a category — the formats follow from it.', required: true },
  { n: 2, zh: '产品信息', en: 'Product details', subZh: '写清楚是什么、里面有什么、凭什么让人买。', subEn: 'What it is, what is inside, why people buy it.' },
  { n: 3, zh: '包装形式', en: 'Packaging format', subZh: '按你的类别给出常见结构，选一个最接近的。', subEn: 'Common structures for your category.' , required: true },
  { n: 4, zh: '包装尺寸', en: 'Packaging size', subZh: '推荐尺寸由 AI 按常见规格推算，需要你确认。', subEn: 'Suggested sizes are estimates — confirm before use.', required: true },
  { n: 5, zh: '设计风格', en: 'Design style', subZh: '一个主风格定调，最多再加两个辅助风格。', subEn: 'One lead style, up to two supporting.', required: true },
  { n: 6, zh: '颜色', en: 'Colour', subZh: '挑出主色，也可以直接给色值或上传参考图。', subEn: 'Pick colours, add a hex, or upload a reference.' },
  { n: 7, zh: '图案', en: 'Graphics', subZh: '包装正面用什么视觉，可以多选。', subEn: 'What carries the front panel — pick any.' },
  { n: 8, zh: '品牌 Logo', en: 'Brand logo', subZh: '有就用你的，没有也能继续。', subEn: 'Use yours, or continue without one.' },
  { n: 9, zh: '补充要求', en: 'Extra notes', subZh: '还有别的想法，写在这里。', subEn: 'Anything else worth knowing.' },
];

/* ------------------------------------------------------------ */
/* 小部件                                                        */
/* ------------------------------------------------------------ */

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="st-hint">{children}</p>;
}

function TextBox({ value, onChange, placeholder, max = 120, area = false, rows = 3 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max?: number;
  area?: boolean;
  rows?: number;
}) {
  const props = {
    value,
    maxLength: max,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
  };
  return <>
    {area
      ? <textarea className="st-input st-area" rows={rows} {...props} />
      : <input className="st-input" {...props} />}
    <span className="st-counter">{value.length} / {max}</span>
  </>;
}

/** 上传一张图并压缩：参考图与 Logo 共用，超出体积时按长边与质量迭代 */
async function readImage(file: File): Promise<string> {
  const c = await compressImageForUpload(file, { maxEdge: 1200, maxBytes: 480 * 1024 });
  return c.dataUrl;
}

function UploadTile({ label, hint, value, onChange, onClear }: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (data: string) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="st-upload">
    <input
      ref={ref} type="file" accept="image/*" hidden
      onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setBusy(true); setErr('');
        try { onChange(await readImage(f)); }
        catch { setErr(tl('这张图读不出来，换一张试试（支持 JPG / PNG / WebP）', 'Could not read this image — try another (JPG / PNG / WebP)')); }
        finally { setBusy(false); }
      }}
    />
    {value
      ? <div className="st-upload-preview">
        <img src={value} alt={label} />
        <div className="st-upload-actions">
          <button onClick={() => ref.current?.click()}>{tl('换一张', 'Replace')}</button>
          <button onClick={onClear}>{tl('移除', 'Remove')}</button>
        </div>
      </div>
      : <button className="st-upload-drop" onClick={() => ref.current?.click()} disabled={busy} type="button">
        <span className="st-upload-plus" aria-hidden>＋</span>
        <b>{busy ? tl('正在处理…', 'Processing…') : label}</b>
        <em>{hint}</em>
      </button>}
    {err && <p className="st-err">{err}</p>}
  </div>;
}

/* ------------------------------------------------------------ */
/* 第一步 · 产品类别                                              */
/* ------------------------------------------------------------ */

function StepCategory({ p, set, t }: StepProps) {
  return <div className="st-cat-grid">
    {CATEGORIES.map((c) => {
      const on = p.answers.category.v === c.id;
      return <button
        key={c.id}
        className={`st-cat ${on ? 'on' : ''}`}
        onClick={() => set((cur) => {
          const keepForm = cur.answers.form.v && formsFor(c.id).some((f) => f.id === cur.answers.form.v);
          return {
            ...cur,
            answers: {
              ...cur.answers,
              category: ans(c.id, 'option'),
              form: keepForm ? cur.answers.form : ans<FormId | ''>('', 'none', false),
              size: keepForm ? cur.answers.size : null,
            },
            suggestion: keepForm ? cur.suggestion : { form: '', dims: null, at: 0 },
          };
        })}
        aria-pressed={on}
      >
        <b>{t(c.zh, c.en)}</b>
        <em>{t(c.hintZh, c.hintEn)}</em>
        {on && <span className="st-tick"><Check light /></span>}
      </button>;
    })}
  </div>;
}

/* ------------------------------------------------------------ */
/* 第二步 · 产品信息                                              */
/* ------------------------------------------------------------ */

function StepProduct({ p, set, next, t }: StepProps) {
  const a = p.answers;
  return <div className="st-form">
    <label className="st-field">
      <span className="st-label">{t('产品名称', 'Product name')}<i>{t('必填，会成为项目名称', 'Required — becomes the project name')}</i></span>
      <TextBox
        value={a.productName.v} max={40}
        placeholder={t('例如：山隐·明前龙井', 'e.g. Shanyin Longjing tea')}
        onChange={(v) => set((cur) => ({ ...cur, answers: { ...cur.answers, productName: ans(v, v.trim() ? 'user' : 'none', !!v.trim()) } }))}
      />
    </label>

    <label className="st-field">
      <span className="st-label">{t('产品内容', 'What is inside')}<i>{t('可选', 'Optional')}</i></span>
      <TextBox
        value={a.productContent.v} max={200} area rows={3}
        placeholder={t('里面装的是什么：规格、净含量、口味、材质……', 'What it contains: spec, net weight, flavour, material…')}
        onChange={(v) => set((cur) => ({ ...cur, answers: { ...cur.answers, productContent: ans(v, v.trim() ? 'user' : 'none', !!v.trim()) } }))}
      />
    </label>

    <label className="st-field">
      <span className="st-label">{t('产品卖点', 'Selling points')}<i>{t('可选，一句也行', 'Optional')}</i></span>
      <TextBox
        value={a.sellingPoints.v} max={160} area rows={2}
        placeholder={t('为什么买它：产地、工艺、口感、成分……', 'Why buy it: origin, craft, taste, ingredients…')}
        onChange={(v) => set((cur) => ({ ...cur, answers: { ...cur.answers, sellingPoints: ans(v, v.trim() ? 'user' : 'none', !!v.trim()) } }))}
      />
    </label>

    <Hint>{t('名称必填；内容与卖点可以先空着，没写的部分不会被 AI 编出来。',
      'The name is required; contents and selling points can wait. AI will not invent what you leave blank.')}</Hint>
    {!!a.productName.v.trim() && <button className="st-skip" onClick={next} type="button">
      {t('产品写完了，去选包装形式', 'Done — pick a format')} →
    </button>}
  </div>;
}

/* ------------------------------------------------------------ */
/* 第三步 · 包装形式                                              */
/* ------------------------------------------------------------ */

function StepForm({ p, set, t }: StepProps) {
  const cat = p.answers.category.v || 'other';
  const list = formsFor(cat);
  return <div className="st-form-grid">
    {list.map((f) => {
      const on = p.answers.form.v === f.id;
      return <button
        key={f.id}
        className={`st-form-card ${on ? 'on' : ''}`}
        aria-pressed={on}
        onClick={() => set((cur) => {
          const rec = recommendSize(f.id);
          const keepRec = cur.answers.size?.mode === 'recommended';
          return {
            ...cur,
            answers: {
              ...cur.answers,
              form: ans(f.id, 'option'),
              size: keepRec && rec
                ? { mode: 'recommended', dims: rec, src: 'ai', confirmed: false }
                : cur.answers.size,
            },
            suggestion: { form: f.id, dims: rec, at: Date.now() },
          };
        })}
      >
        <b>{t(f.zh, f.en)}</b>
        <em>{t('约 ', 'about ')}{f.size.l}×{f.size.w}×{f.size.h} mm</em>
        {on && <span className="st-tick"><Check light /></span>}
      </button>;
    })}
  </div>;
}

/* ------------------------------------------------------------ */
/* 第四步 · 包装尺寸                                              */
/* ------------------------------------------------------------ */

function StepSize({ p, set, t }: StepProps) {
  const a = p.answers;
  const rec = recommendSize(a.form.v) || p.suggestion.dims;
  const mode = a.size?.mode || '';
  const [draft, setDraft] = useState<SizeMM>(a.size?.mode === 'custom' ? a.size.dims : { l: 120, w: 60, h: 180 });

  const setCustom = (v: SizeMM) => {
    setDraft(v);
    if (sizeOk(v)) {
      set((cur) => ({ ...cur, answers: { ...cur.answers, size: { mode: 'custom', dims: v, src: 'user', confirmed: true } } }));
    } else {
      set((cur) => ({ ...cur, answers: { ...cur.answers, size: null } }));
    }
  };

  return <div className="st-size">
    <button
      className={`st-size-card ${mode === 'recommended' ? 'on' : ''}`}
      onClick={() => set((cur) => {
        const kept = cur.answers.size;
        // 已经确认过同一个推荐尺寸时，再点一次不该把它退回「待确认」
        const same = kept && kept.mode === 'recommended' && kept.confirmed
          && rec && kept.dims.l === rec.l && kept.dims.w === rec.w && kept.dims.h === rec.h;
        return {
          ...cur,
          answers: {
            ...cur.answers,
            size: rec
              ? { mode: 'recommended', dims: rec, src: 'ai', confirmed: !!same }
              : null,
          },
          suggestion: { form: cur.answers.form.v, dims: rec, at: Date.now() },
        };
      })}
    >
      <span className="st-size-head">
        <b>{t('推荐尺寸', 'Suggested size')}</b>
        <span className="st-ai-badge">{t('AI 建议', 'AI suggested')}</span>
      </span>
      <span className="st-size-dim">{rec ? sizeText(rec) : t('先选包装形式', 'Pick a format first')}</span>
      <em>{t('按该形式的常见成品规格推算，不是你的产品实测值。', 'Estimated from common specs for this format — not measured.')}</em>
    </button>

    <div className={`st-size-card ${mode === 'custom' ? 'on' : ''}`}>
      <span className="st-size-head">
        <b>{t('自定义尺寸', 'Custom size')}</b>
        <span className="st-unit">{t('单位 mm', 'mm')}</span>
      </span>
      <div className="st-size-inputs">
        {(['l', 'w', 'h'] as const).map((k) => (
          <label key={k}>
            <span>{k === 'l' ? t('长', 'L') : k === 'w' ? t('宽', 'W') : t('高', 'H')}</span>
            <input
              type="number" inputMode="numeric" min={10} max={1000} step={1}
              value={Number.isFinite(draft[k]) ? draft[k] : ''}
              onChange={(e) => {
                const n = Number(e.target.value);
                setCustom({ ...draft, [k]: Number.isFinite(n) ? n : 0 });
              }}
            />
          </label>
        ))}
      </div>
      <em>{t('填 10 – 1000 mm 之间的成品尺寸；出血与刀版在后续阶段处理。', '10–1000 mm finished size; bleed and dieline come later.')}</em>
    </div>

    {mode === 'recommended' && a.size && !a.size.confirmed && <div className="st-confirm-size">
      <span>{t(`确认使用 ${sizeText(a.size.dims)}？`, `Use ${sizeText(a.size.dims)}?`)}</span>
      <button className="st-btn st-btn-dark sm" onClick={() => set((cur) => ({
        ...cur,
        answers: { ...cur.answers, size: cur.answers.size ? { ...cur.answers.size, confirmed: true } : null },
      }))}>{t('确认这个尺寸', 'Confirm size')}</button>
    </div>}

    {mode === 'recommended' && a.size?.confirmed && <div className="st-ok-line">
      <Check /> {t('尺寸已确认，设计会按这个尺寸出刀版。', 'Size confirmed — the dieline will use it.')}
    </div>}
  </div>;
}

/* ------------------------------------------------------------ */
/* 第五步 · 设计风格                                              */
/* ------------------------------------------------------------ */

function StepStyle({ p, set, t }: StepProps) {
  const a = p.answers;
  const sec = a.styleSecondary.v;
  const others = STYLES.filter((s) => s.id !== a.stylePrimary.v);
  return <div className="st-style">
    <div className="st-style-grid">
      {STYLES.map((s) => {
        const on = a.stylePrimary.v === s.id;
        return <button
          key={s.id}
          className={`st-style-card ${on ? 'on' : ''}`}
          aria-pressed={on}
          onClick={() => set((cur) => ({
            ...cur,
            answers: {
              ...cur.answers,
              stylePrimary: ans<StyleId | ''>(s.id, 'option'),
              styleSecondary: ans(cur.answers.styleSecondary.v.filter((x) => x !== s.id), 'option'),
            },
          }))}
        >
          <span className="st-style-meta"><b>{t(s.zh, s.en)}</b><em>{t(s.hintZh, s.hintEn)}</em></span>
          {on && <span className="st-style-on">{t('主风格', 'Lead')}</span>}
        </button>;
      })}
    </div>

    <div className="st-sec">
      <div className="st-sec-head">
        <h3>{t('辅助风格', 'Supporting styles')}</h3>
        <span className="st-count">{t(`最多 2 个 · 已选 ${sec.length}`, `Up to 2 · ${sec.length} picked`)}</span>
      </div>
      {!a.stylePrimary.v
        ? <Hint>{t('先选一个主风格。', 'Pick a lead style first.')}</Hint>
        : <div className="st-chips">
          {others.map((s) => {
            const on = sec.includes(s.id);
            const full = sec.length >= 2 && !on;
            return <button
              key={s.id}
              className={`st-chip ${on ? 'on' : ''}`}
              disabled={full}
              onClick={() => set((cur) => {
                const cur2 = cur.answers.styleSecondary.v;
                const next = cur2.includes(s.id) ? cur2.filter((x) => x !== s.id) : [...cur2, s.id].slice(0, 2);
                return { ...cur, answers: { ...cur.answers, styleSecondary: ans<StyleId[]>(next, 'option') } };
              })}
            >{t(s.zh, s.en)}{on && <span aria-hidden> ✓</span>}</button>;
          })}
        </div>}
    </div>
  </div>;
}

/* ------------------------------------------------------------ */
/* 第六步 · 颜色                                                  */
/* ------------------------------------------------------------ */

function StepColor({ p, set, t }: StepProps) {
  const a = p.answers;
  const [custom, setCustom] = useState('#C4693F');
  const picked = [...a.colors.v, ...a.customColors.v];
  return <div className="st-color">
    <div className="st-swatches">
      {COLORS.map((c) => {
        const on = a.colors.v.includes(c.hex);
        return <button
          key={c.hex}
          className={`st-swatch ${on ? 'on' : ''}`}
          aria-pressed={on}
          title={`${t(c.zh, c.en)} ${c.hex}`}
          onClick={() => set((cur) => {
            const cur2 = cur.answers.colors.v;
            const next = cur2.includes(c.hex) ? cur2.filter((x) => x !== c.hex) : [...cur2, c.hex];
            return { ...cur, answers: { ...cur.answers, colors: ans(next, 'option') } };
          })}
        >
          <i style={{ background: c.hex }} />
          <span>{t(c.zh, c.en)}</span>
          {on && <b className="st-swatch-tick"><Check light /></b>}
        </button>;
      })}
    </div>

    <div className="st-custom-color">
      <label>
        <span>{t('自定义颜色', 'Custom colour')}</span>
        <input type="color" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <code>{custom.toUpperCase()}</code>
      </label>
      <button className="st-btn st-btn-ghost sm" onClick={() => set((cur) => {
        const hex = custom.toUpperCase();
        if (!/^#[0-9A-F]{6}$/.test(hex)) return cur;
        const next = cur.answers.customColors.v.includes(hex)
          ? cur.answers.customColors.v
          : [...cur.answers.customColors.v, hex].slice(0, 4);
        return { ...cur, answers: { ...cur.answers, customColors: ans(next, 'user') } };
      })}>{t('加入配色', 'Add colour')}</button>
    </div>

    {!!picked.length && <div className="st-picked">
      <span className="st-picked-label">{t('当前配色', 'Current palette')}</span>
      {picked.map((hex) => <span className="st-picked-dot" key={hex} title={hex}>
        <i style={{ background: hex }} />
        <button onClick={() => set((cur) => ({
          ...cur,
          answers: {
            ...cur.answers,
            colors: ans(cur.answers.colors.v.filter((x) => x !== hex), 'option'),
            customColors: ans(cur.answers.customColors.v.filter((x) => x !== hex), 'user'),
          },
        }))} aria-label={`移除 ${hex}`}>×</button>
      </span>)}
    </div>}

    <div className="st-sec">
      <div className="st-sec-head"><h3>{t('色彩参考图', 'Colour reference')}</h3>
        <span className="st-count">{t('可选', 'Optional')}</span></div>
      <UploadTile
        label={t('上传参考图', 'Upload a reference')}
        hint={t('配色、氛围、同类包装都可以', 'Palette, mood, a competitor pack')}
        value={a.colorRef.v}
        onChange={(data) => set((cur) => ({ ...cur, answers: { ...cur.answers, colorRef: ans(data, 'user') } }))}
        onClear={() => set((cur) => ({ ...cur, answers: { ...cur.answers, colorRef: ans<string | null>(null, 'none', false) } }))}
      />
    </div>
  </div>;
}

/* ------------------------------------------------------------ */
/* 第七步 · 图案                                                  */
/* ------------------------------------------------------------ */

function StepPattern({ p, set, t }: StepProps) {
  const on = p.answers.patterns.v;
  const toggle = (id: PatternId) => set((cur) => {
    const cur2 = cur.answers.patterns.v;
    const next = cur2.includes(id) ? cur2.filter((x) => x !== id) : [...cur2, id];
    return { ...cur, answers: { ...cur.answers, patterns: ans(next, 'option') } };
  });
  return <div className="st-form">
    <div className="st-pat-grid">
      {PATTERNS.map((x) => {
        const picked = on.includes(x.id);
        return <button key={x.id} className={`st-pat ${picked ? 'on' : ''}`} aria-pressed={picked} onClick={() => toggle(x.id)}>
          <b>{t(x.zh, x.en)}</b>
          {picked && <span className="st-pat-on" aria-hidden><Check /></span>}
        </button>;
      })}
    </div>
    <Hint>{t('可以多选。选「AI 自由设计」就等于把这一项交给我们。', 'Pick as many as you like. “Let AI decide” hands this part over.')}</Hint>
  </div>;
}

/* ------------------------------------------------------------ */
/* 第八步 · 品牌 Logo                                             */
/* ------------------------------------------------------------ */

function StepLogo({ p, set, t }: StepProps) {
  const logo = p.answers.logo;
  const pick = (mode: 'upload' | 'reference' | 'none') =>
    set((cur) => ({ ...cur, answers: { ...cur.answers, logo: { ...cur.answers.logo, mode } } }));

  return <div className="st-form">
    <div className="st-logo-modes">
      {([
        { id: 'upload', zh: '上传 Logo', en: 'Upload logo', d: '有现成的标识文件', dEn: 'I have a logo file' },
        { id: 'reference', zh: '上传参考图', en: 'Upload reference', d: '只有参考样式，需要重画', dEn: 'A reference to redraw from' },
        { id: 'none', zh: '暂时没有', en: 'Not yet', d: '先按产品名称处理', dEn: 'Use the product name' },
      ] as const).map((m) => <button
        key={m.id}
        className={`st-logo-mode ${logo.mode === m.id ? 'on' : ''}`}
        aria-pressed={logo.mode === m.id}
        onClick={() => pick(m.id)}
      >
        <b>{t(m.zh, m.en)}</b>
        <em>{t(m.d, m.dEn)}</em>
        {logo.mode === m.id && <span className="st-tick"><Check light /></span>}
      </button>)}
    </div>

    {logo.mode === 'upload' && <UploadTile
      label="Logo"
      hint={t('PNG 透明底或 JPG 都可以', 'PNG with transparency or JPG')}
      value={logo.image}
      onChange={(data) => set((cur) => ({ ...cur, answers: { ...cur.answers, logo: { ...cur.answers.logo, image: data } } }))}
      onClear={() => set((cur) => ({ ...cur, answers: { ...cur.answers, logo: { ...cur.answers.logo, image: null } } }))}
    />}

    {logo.mode === 'reference' && <UploadTile
      label={t('Logo 参考图', 'Logo reference')}
      hint={t('拍下或截图的都可以，用于重画', 'A photo or screenshot is fine')}
      value={logo.refImage}
      onChange={(data) => set((cur) => ({ ...cur, answers: { ...cur.answers, logo: { ...cur.answers.logo, refImage: data } } }))}
      onClear={() => set((cur) => ({ ...cur, answers: { ...cur.answers, logo: { ...cur.answers.logo, refImage: null } } }))}
    />}

    {logo.mode === 'none' && <Hint>{t('没问题。没有 Logo 时，包装正面会用产品名称排版，不会凭空造一个品牌标识。',
      'Fine. Without a logo the front panel uses the product name — we will not invent a brand mark.')}</Hint>}
  </div>;
}

/* ------------------------------------------------------------ */
/* 第九步 · 补充要求                                              */
/* ------------------------------------------------------------ */

function StepExtra({ p, set, t }: StepProps) {
  return <div className="st-form">
    <label className="st-field">
      <span className="st-label">{t('还有别的要求吗？', 'Anything else?')}<i>{t('可选', 'Optional')}</i></span>
      <TextBox
        value={p.answers.extra.v} max={400} area rows={5}
        placeholder={t('例如：必须在 3 月前上市、要能放进 20 尺柜、客户指定了某家印厂……',
          'e.g. must ship before March, needs to fit a 20ft container, the printer is already chosen…')}
        onChange={(v) => set((cur) => ({ ...cur, answers: { ...cur.answers, extra: ans(v, v.trim() ? 'user' : 'none', !!v.trim()) } }))}
      />
    </label>
    <Hint>{t('这里写的内容会原样交给后续流程，不会被 AI「自动补充」。',
      'What you write here is passed on as-is. Nothing gets auto-filled.')}</Hint>
  </div>;
}

/* ------------------------------------------------------------ */

function BodyOf(n: number, props: StepProps) {
  switch (n) {
    case 1: return <StepCategory {...props} />;
    case 2: return <StepProduct {...props} />;
    case 3: return <StepForm {...props} />;
    case 4: return <StepSize {...props} />;
    case 5: return <StepStyle {...props} />;
    case 6: return <StepColor {...props} />;
    case 7: return <StepPattern {...props} />;
    case 8: return <StepLogo {...props} />;
    default: return <StepExtra {...props} />;
  }
}

/** 一页里可能合并了多个单项：按 PAGES 里的 steps 依次渲染，第二项起加小标题 */
export function StepBody(props: StepProps & { page: number }) {
  const def = PAGES.find((x) => x.n === props.page) || PAGES[PAGES.length - 1];
  return <div className="st-page-group">
    {def.steps.map((n, i) => {
      const meta = STEPS.find((x) => x.n === n);
      return <div key={n} className={`st-page-block ${i > 0 ? 'is-sub' : ''}`}>
        {i > 0 && meta && <div className="st-page-h">
          <span>{String(n).padStart(2, '0')}</span>
          <b>{props.t(meta.zh, meta.en)}</b>
        </div>}
        {BodyOf(n, props)}
      </div>;
    })}
  </div>;
}
