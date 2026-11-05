/* ============================================================
 * 十步向导：每一步的具体内容
 * ============================================================ */
import React, { useMemo, useRef, useState } from 'react';
import {
  FORM_META, STRUCTURE_EXTRA, effectiveSize, type PackageForm, type ProjectDraft, type Unit,
} from './draft';
import { STRUCTURES, structureById } from '../engine/structure';
import { OptionCard, MultiChips, NumField, Note, Why, FieldLabel, TextField, ColorInput, Swatch, StepSection } from './controls';
import {
  STYLES, STYLE_GROUPS, recommendStyles, styleById, buildStylePrompt, TRADITION_COUNT,
} from './styles';
import { generatePalettes, extractLogoColors, isHex, hexToRgb, rgbToHex, recommendPrimary, withColor, nameOfColor } from './colors';
import { generateLogoOptions, adjustLogoSvg, readLogoFile, fileToDataUrl, svgDataUrl, LOGO_STYLES, LOGO_INDUSTRIES, LOGO_POSITIONS, TRADEMARK_NOTE } from './logo';
import { validateBarcode, encodeBarcode, verifyBarcode, barcodeSvg, PREVIEW_CODE, RETAIL_WARNING } from './barcode';
import type { AISettings } from '../types';
import { aiEnabled } from '../engine/llm';
import { runAITask } from '../ai/provider';
import { buildAIContext } from '../ai/context';
import type { PaletteDraft } from './draft';

export interface StepProps {
  d: ProjectDraft;
  set: (p: Partial<ProjectDraft> | ((d: ProjectDraft) => Partial<ProjectDraft>)) => void;
  ai: AISettings;
  toast: (s: string) => void;
}

const dim = (d: ProjectDraft, key: string, def = 0) => d.package_dimensions.values[key] ?? def;
const setDim = (p: StepProps, key: string, v: number) => p.set((d) => ({
  package_dimensions: { ...d.package_dimensions, values: { ...d.package_dimensions.values, [key]: v } },
}));
const setExtra = (p: StepProps, key: string, v: number) => p.set((d) => ({
  package_dimensions: { ...d.package_dimensions, extra: { ...d.package_dimensions.extra, [key]: v } },
}));
const setStruct = (p: StepProps, id: string) => p.set((d) => ({
  package_dimensions: {
    ...d.package_dimensions, structureId: id as never, structureConfirmed: false,
    extra: Object.fromEntries((STRUCTURE_EXTRA[id as keyof typeof STRUCTURE_EXTRA] || []).map((e) => [e.key, e.def])),
  },
}));

const AGE_OPTIONS = ['儿童', '年轻人', '成年人', '中老年人', '全年龄段'];
const GROUP_OPTIONS = ['女性消费者', '男性消费者', '家庭用户', '商务人士', '年轻潮流人群', '高端消费群体', '大众消费群体'];
const TIER_OPTIONS = ['平价亲民', '大众中端', '中高端', '高端礼品'];
const PRODUCT_GROUPS: { group: string; items: string[] }[] = [
  { group: '食品', items: ['零食', '糕点', '糖果', '茶叶', '咖啡', '其他食品'] },
  { group: '饮品', items: ['茶饮', '咖啡', '果汁', '酒类', '其他饮品'] },
  { group: '美妆个护', items: ['护肤品', '化妆品', '洗护用品', '香水', '身体护理'] },
  { group: '日用品', items: ['家居用品', '清洁用品', '文具', '生活用品'] },
  { group: '健康产品', items: ['营养品', '保健食品', '其他健康产品'] },
  { group: '礼品与文创', items: ['节日礼品', '文创产品', '品牌周边', '定制礼盒'] },
];
const COMMON_COLORS = ['#20463a', '#1d1d1b', '#f3eee4', '#b9603f', '#a8352c', '#c8a86b', '#2b4f8a', '#4b6b4a', '#e7b9bf', '#8a5a3b', '#7b2d35', '#c7d5cc'];
const MOTIF_HINTS: Record<string, string[]> = {
  茶叶: ['山水', '茶树', '茶叶', '山野'], 咖啡: ['咖啡豆', '咖啡杯', '产地', '植物'],
  糕点: ['食材', '糕点', '花卉', '节日元素'], 酒类: ['山川', '谷物', '印章', '纹样'],
  护肤品: ['植物', '水波', '极简线条'], 礼品: ['花卉', '丝带', '节日元素'],
};

/* ---------------- 尺寸示意图：随包装形态变化（干净的工程线稿） ---------------- */
export function DimensionDiagram({ form }: { form: PackageForm }) {
  const common = { fill: 'none', stroke: '#8b8b86', strokeWidth: 1.1 };
  const dimLine = { stroke: '#1d1d1b', strokeWidth: 1 };
  const txt = { fontSize: 10, fill: '#3a3a36', fontFamily: 'Arial, sans-serif' };
  if (form === 'label') return <svg viewBox="0 0 240 170" className="v3-diagram" role="img" aria-label="标签宽高示意">
    <rect x="70" y="28" width="100" height="106" rx="6" {...common} fill="#f4f3ef" />
    <line x1="70" y1="148" x2="170" y2="148" {...dimLine} /><line x1="70" y1="142" x2="70" y2="154" {...dimLine} /><line x1="170" y1="142" x2="170" y2="154" {...dimLine} />
    <text x="120" y="164" textAnchor="middle" {...txt}>宽度 W</text>
    <line x1="52" y1="28" x2="52" y2="134" {...dimLine} /><line x1="46" y1="28" x2="58" y2="28" {...dimLine} /><line x1="46" y1="134" x2="58" y2="134" {...dimLine} />
    <text x="18" y="84" {...txt}>高度 H</text>
    <text x="120" y="86" textAnchor="middle" fontSize="9" fill="#a5a199">标签形状可选</text>
  </svg>;
  if (form === 'pouch') return <svg viewBox="0 0 240 170" className="v3-diagram" role="img" aria-label="包装袋与折角示意">
    <path d="M76 26 H164 V134 Q120 146 76 134 Z" fill="#f4f3ef" stroke="#8b8b86" strokeWidth="1.1" />
    <path d="M76 36 H164" {...common} />
    <path d="M164 26 L182 38 V128 L164 134" fill="#eceae4" stroke="#8b8b86" strokeWidth="1.1" />
    <line x1="76" y1="156" x2="164" y2="156" {...dimLine} /><text x="120" y="168" textAnchor="middle" {...txt}>袋宽 W</text>
    <line x1="58" y1="26" x2="58" y2="134" {...dimLine} /><text x="16" y="84" {...txt}>袋高 H</text>
    <line x1="164" y1="38" x2="182" y2="38" stroke="#1d1d1b" strokeWidth="1" />
    <text x="188" y="82" fontSize="9" fill="#3a3a36">侧边折角</text>
  </svg>;
  if (form === 'bottle') return <svg viewBox="0 0 240 170" className="v3-diagram" role="img" aria-label="瓶身周长与标签示意">
    <path d="M102 18 H138 V38 Q138 46 148 54 Q160 64 160 84 V138 Q160 146 152 146 H88 Q80 146 80 138 V84 Q80 64 92 54 Q102 46 102 38 Z" fill="#f4f3ef" stroke="#8b8b86" strokeWidth="1.1" />
    <rect x="80" y="86" width="80" height="42" fill="#e8e7e2" stroke="#1d1d1b" strokeWidth="1" />
    <line x1="80" y1="140" x2="160" y2="140" {...dimLine} /><text x="120" y="158" textAnchor="middle" {...txt}>标签宽度 / 周长</text>
    <line x1="172" y1="86" x2="172" y2="128" {...dimLine} /><text x="178" y="110" fontSize="9" fill="#3a3a36">标签高度</text>
    <path d="M92 66 A28 12 0 0 0 148 66" stroke="#1d1d1b" strokeWidth="1" fill="none" strokeDasharray="3 3" />
    <text x="120" y="62" textAnchor="middle" fontSize="9" fill="#3a3a36">直径 Ø</text>
  </svg>;
  return <svg viewBox="0 0 240 170" className="v3-diagram" role="img" aria-label="包装盒长宽高示意">
    <path d="M64 58 L136 34 L196 58 L124 82 Z" fill="#eeede8" stroke="#8b8b86" strokeWidth="1.1" />
    <path d="M64 58 L124 82 V142 L64 118 Z" fill="#f7f6f2" stroke="#8b8b86" strokeWidth="1.1" />
    <path d="M124 82 L196 58 V118 L124 142 Z" fill="#e8e7e2" stroke="#8b8b86" strokeWidth="1.1" />
    <line x1="64" y1="152" x2="124" y2="152" {...dimLine} /><line x1="64" y1="146" x2="64" y2="158" {...dimLine} /><line x1="124" y1="146" x2="124" y2="158" {...dimLine} />
    <text x="94" y="166" textAnchor="middle" {...txt}>长度 L</text>
    <line x1="206" y1="58" x2="206" y2="118" {...dimLine} /><line x1="200" y1="58" x2="212" y2="58" {...dimLine} /><line x1="200" y1="118" x2="212" y2="118" {...dimLine} />
    <text x="212" y="92" fontSize="9" fill="#3a3a36">高度 H</text>
    <line x1="136" y1="24" x2="196" y2="24" {...dimLine} /><text x="166" y="18" textAnchor="middle" {...txt}>宽度 W</text>
  </svg>;
}

/* ============================ STEP 01 尺寸 ============================ */
export function StepSize(p: StepProps) {
  const { d } = p;
  const dm = d.package_dimensions;
  const meta = FORM_META[d.package_type];
  const [unit, setUnit] = useState<Unit>(dm.unit);
  const changeForm = (f: PackageForm) => p.set({
    package_type: f,
    package_dimensions: { ...dm, unit, values: Object.fromEntries(FORM_META[f].fields.map((x) => [x.key, x.def])), choice: FORM_META[f].choice?.options[0] || '', structureId: '', structureConfirmed: false, extra: {} },
  });
  const structs = meta.structures.map(structureById);
  const extras = dm.structureId ? STRUCTURE_EXTRA[dm.structureId] || [] : [];
  return <>
    <StepSection title="首先选择包装形态">
      <div className="v3-grid v3-grid-3">
        {(Object.keys(FORM_META) as PackageForm[]).map((f) => <OptionCard key={f} active={d.package_type === f} title={FORM_META[f].label} desc={FORM_META[f].desc} tag={FORM_META[f].en} onClick={() => changeForm(f)} />)}
      </div>
      <Note>包装形态与产品类型是两件事：这里只决定「做成什么形状」，下一步才问「里面装什么」。</Note>
    </StepSection>

    <StepSection title="我知道尺寸吗？" aside={<div className="v3-units">{[('mm' as Unit), ('cm' as Unit), ('inch' as Unit)].map((u) => <button key={u} className={unit === u ? 'on' : ''} onClick={() => { setUnit(u); p.set((x) => ({ package_dimensions: { ...x.package_dimensions, unit: u } })); }}>{u === 'inch' ? 'inch' : u}</button>)}</div>}>
      <div className="v3-grid v3-grid-2">
        <OptionCard active={dm.known} title="我知道包装尺寸" desc="直接输入成品尺寸，系统会据此计算刀模与排版。" onClick={() => p.set((x) => ({ package_dimensions: { ...x.package_dimensions, known: true } }))} />
        <OptionCard active={!dm.known} title="我还不确定尺寸" desc="先用推荐尺寸继续，之后再回来改。" onClick={() => p.set((x) => ({ package_dimensions: { ...x.package_dimensions, known: false } }))} />
      </div>
      {!dm.known && <Note tone="warn">
        <strong>简单量一下：</strong>用直尺量成品的长、宽、高；贴标则量瓶身周长与标签高度。
        也可以先用常见尺寸（例如 200 × 150 × 80 mm）继续，最终印刷前请务必换成实测值——结构尺寸不实，刀模就不可能准确。
      </Note>}
    </StepSection>

    <StepSection title={`输入${meta.label}尺寸`} aside={<span className="v3-aside">单位：{unit === 'inch' ? 'in' : unit}</span>}>
      <div className="v3-size-row">
        <div className="v3-size-fields">
          {meta.fields.map((f) => <NumField key={f.key} label={f.label} value={dim(d, f.key)} unit={unit} min={f.min} max={f.max}
            hint={f.hint} placeholder="留空自动计算" onChange={(v) => setDim(p, f.key, v)} />)}
          {meta.choice && <div className="v3-fieldlabel">{meta.choice.label}</div>}
          {meta.choice && <div className="v3-chips">{meta.choice.options.map((o) => <button key={o} className={`v3-chip ${dm.choice === o ? 'on' : ''}`}
            onClick={() => p.set((x) => ({ package_dimensions: { ...x.package_dimensions, choice: o, structureId: o === '圆形' || o === '椭圆' ? 'labelRound' : 'labelRect' } }))}>{o}</button>)}</div>}
        </div>
        <div className="v3-diagram-wrap"><DimensionDiagram form={d.package_type} /><span>尺寸示意图 · {meta.en}</span></div>
      </div>
    </StepSection>

    <StepSection title="确认包装结构" aside={<button className="v3-link" onClick={async () => {
      const r = await runAITask('size.structure', buildAIContext(p.d), p.ai);
      const id = (r.suggestions[0]?.value as { structureId?: string } | undefined)?.structureId;
      if (!id || !meta.structures.includes(id as never)) return;
      setStruct(p, id);
      p.toast(`已推荐「${structureById(id as never).name}」，仍需确认下方结构参数`);
    }}>让 AI 帮我推荐</button>}>
      <div className="v3-grid v3-grid-3">
        {structs.map((st) => <OptionCard key={st.id} active={dm.structureId === st.id} title={st.name} desc={st.use} onClick={() => setStruct(p, st.id)} />)}
      </div>
      {dm.structureId && <div className="v3-extra">
        <FieldLabel hint="这些参数决定粘合位、插舌、盖高等真实几何，不能用三个外形尺寸代替">结构补充参数（mm）</FieldLabel>
        <div className="v3-size-fields v3-size-fields-inline">
          {extras.map((e) => <NumField key={e.key} label={e.label} value={dm.extra[e.key] ?? e.def} min={e.min} max={e.max} hint={e.hint} onChange={(v) => setExtra(p, e.key, v)} />)}
        </div>
        <button className="v3-link" onClick={() => p.set((x) => ({ package_dimensions: { ...x.package_dimensions, structureConfirmed: true } }))}>
          {dm.structureConfirmed ? '✓ 结构参数已确认' : '确认结构参数'}
        </button>
      </div>}
      <Note tone="warn">结构由实际几何参数生成展开刀模，不是把矩形图片当作刀模。尺寸或结构参数不完整时，后续导出会被印前检查拦截。</Note>
    </StepSection>
    <Why text="成品尺寸决定展开面积、文字大小、安全边距与刀模，是整个流程唯一不能靠猜的参数。" />
  </>;
}

/* ============================ STEP 02 Logo ============================ */
export function StepLogo(p: StepProps) {
  const { d } = p;
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<{ title: string; reason: string }[] | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const spec = d.logo_ai_spec;
  const setSpec = (k: keyof typeof spec, v: string) => p.set({ logo_ai_spec: { ...spec, [k]: v } });
  const asset = d.brand_logo;

  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    const r = await readLogoFile(f);
    if (!r.asset) { p.toast(r.message); return; }
    p.set({ brand_logo: r.asset, logo_creation_mode: 'own', logo_svg: '', logo_selected: '' });
    p.toast(r.message);
  };

  const gen = async () => {
    if (!spec.brandName.trim()) { p.toast('请先填写品牌名称'); return; }
    setBusy(true);
    // Logo 方向也走统一任务层：后台接入 GPT 后，这里会直接使用模型给出的方向
    const r = await runAITask('logo.directions', buildAIContext(p.d), p.ai);
    const suggestions = r.suggestions.slice(0, 3).map((s) => ({ title: s.title, reason: s.detail }));
    setAdvice(suggestions); setAiUsed(r.source === 'ai');
    const opts = generateLogoOptions(spec);
    p.set({ logo_options: opts, logo_creation_mode: 'ai', brand_logo: null, logo_selected: '', logo_svg: '' });
    p.toast(r.source === 'ai' ? 'AI 已给出三个 Logo 方向，矢量草图由本地引擎绘制' : '内置矢量模板生成三个方向（未调用 AI）');
    setBusy(false);
  };

  return <>
    <StepSection title="你已经有 Logo 了吗？">
      <div className="v3-grid v3-grid-3">
        <OptionCard active={d.logo_creation_mode === 'own'} title="我已经有 Logo" desc="上传 PNG / JPG / SVG / PDF" onClick={() => p.set({ logo_creation_mode: 'own' })} />
        <OptionCard active={d.logo_creation_mode === 'ai'} title="我还没有 Logo" desc="用 AI 制作三个方向" onClick={() => p.set({ logo_creation_mode: 'ai' })} />
        <OptionCard active={d.logo_creation_mode === 'none'} title="暂时不需要" desc="以后随时可以回来添加" onClick={() => p.set({ logo_creation_mode: 'none', brand_logo: null, logo_svg: '' })} />
      </div>
    </StepSection>

    {d.logo_creation_mode === 'own' && <StepSection title="上传 Logo 文件">
      <div className={`v3-drop ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }} onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,application/pdf" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
        {asset ? <div className="v3-drop-preview"><img src={asset.src} alt="Logo 预览" /><div>
          <strong>{asset.name}</strong><span>{asset.mime === 'application/pdf' ? 'PDF 原始文件已保留' : `${asset.naturalW} × ${asset.naturalH} px`}</span>
          <span>{asset.transparent ? '透明背景' : '非透明背景'} · {asset.sharp ? '清晰度达标' : '清晰度偏低'}</span>
        </div></div> : <div className="v3-drop-empty"><strong>拖拽文件到这里，或点击上传</strong><span>PNG · JPG · SVG · PDF，单文件不超过 12 MB</span></div>}
      </div>
      {asset && <>
        <div className="v3-btnrow">
          <button className="v3-link" onClick={() => fileRef.current?.click()}>替换文件</button>
          <button className="v3-link" onClick={() => p.set({ brand_logo: null })}>删除</button>
          <button className="v3-link" onClick={() => { const b = new Blob([asset.src.split(',')[1] ? atob(asset.src.split(',')[1]) : ''], { type: asset.mime }); void b; p.toast('原始文件已保留在本机项目中，不会被自动修改'); }}>查看原始文件信息</button>
        </div>
        {!asset.sharp && <Note tone="warn">检测到分辨率偏低。按 300 DPI 计算，Logo 宽度建议不少于 600 px；系统不会把它简单放大后标记为合格。</Note>}
        <div className="v3-extra">
          <FieldLabel hint="所有修改都必须由你主动选择，系统不会擅自改动原始 Logo">需要对 Logo 做调整吗？</FieldLabel>
          <MultiChips options={['保持原始 Logo', '调整 Logo 大小', '更换 Logo 颜色', '去除不需要的背景']}
            value={[asset.keepOriginal ? '保持原始 Logo' : '', ...(asset.scale !== 1 ? ['调整 Logo 大小'] : []), ...(asset.recolor ? ['更换 Logo 颜色'] : []), ...(asset.removeBg ? ['去除不需要的背景'] : [])].filter(Boolean)}
            onChange={(v) => p.set({ brand_logo: {
              ...asset, keepOriginal: v.includes('保持原始 Logo'),
              scale: v.includes('调整 Logo 大小') ? (asset.scale !== 1 ? asset.scale : 1.15) : 1,
              recolor: v.includes('更换 Logo 颜色') ? (asset.recolor || '#20463a') : '',
              removeBg: v.includes('去除不需要的背景'),
            } })} />
          <div className="v3-inline">
            {asset.scale !== 1 && <label className="v3-mini">缩放 <input type="range" min="0.6" max="1.6" step="0.05" value={asset.scale} onChange={(e) => p.set({ brand_logo: { ...asset, scale: Number(e.target.value) } })} /> {Math.round(asset.scale * 100)}%</label>}
            {asset.recolor && <ColorInput label="Logo 颜色" value={asset.recolor} onChange={(v) => p.set({ brand_logo: { ...asset, recolor: v } })} />}
          </div>
          {asset.removeBg && <Note>去背景仅在浏览器可处理时生效；当前版本会保留原始文件与调整记录，导出前请检查效果。</Note>}
        </div>
      </>}
    </StepSection>}

    {d.logo_creation_mode === 'ai' && <StepSection title="AI Logo 制作">
      <div className="v3-grid v3-grid-2">
        <TextField label="品牌名称 *" value={spec.brandName} placeholder="例如：山隐茶集" onChange={(v) => setSpec('brandName', v)} />
        <label className="v3-textfield"><FieldLabel>品牌行业</FieldLabel><select value={spec.industry} onChange={(e) => setSpec('industry', e.target.value)}>
          <option value="">请选择</option>{LOGO_INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="v3-textfield"><FieldLabel>品牌定位</FieldLabel><select value={spec.position} onChange={(e) => setSpec('position', e.target.value)}>
          <option value="">请选择</option>{LOGO_POSITIONS.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="v3-textfield"><FieldLabel>希望的设计风格</FieldLabel><select value={spec.style} onChange={(e) => setSpec('style', e.target.value)}>{LOGO_STYLES.map((x) => <option key={x}>{x}</option>)}</select></label>
        <ColorInput label="喜欢的颜色" value={spec.color} onChange={(v) => setSpec('color', v)} />
        <TextField label="图形偏好" value={spec.motif} placeholder="例如：山、茶叶、圆形（可留空）" onChange={(v) => setSpec('motif', v)} />
      </div>
      <button className="btn btn-dark btn-md" disabled={busy} onClick={gen}>{busy ? '生成中…' : '生成 3 个 Logo 方向'}</button>
      {advice && <Note tone={aiUsed ? 'ok' : 'info'}>{aiUsed ? 'AI 已给出方向建议' : '未配置 AI 模型，使用内置矢量模板（未调用 AI）'}：{advice.map((a) => a.title).join(' / ')}</Note>}
      {d.logo_options.length > 0 && <div className="v3-logo-grid">
        {d.logo_options.map((o, i) => <button key={o.id} className={`v3-logo-card ${d.logo_selected === o.id ? 'on' : ''}`} onClick={() => p.set({ logo_selected: o.id, logo_svg: o.svg })}>
          <img src={svgDataUrl(o.svg)} alt={o.name} /><strong>{advice?.[i]?.title || o.name}</strong><span>{advice?.[i]?.reason || o.note}</span>
          {d.logo_selected === o.id && <em>已选择 ✓</em>}
        </button>)}
      </div>}
      {d.logo_svg && <div className="v3-extra">
        <FieldLabel>选中后可继续调整并单独保存</FieldLabel>
        <div className="v3-btnrow">
          <button className="v3-link" onClick={() => p.set({ logo_svg: adjustLogoSvg(d.logo_svg, { scale: 1.1 }) })}>放大一点</button>
          <button className="v3-link" onClick={() => p.set({ logo_svg: adjustLogoSvg(d.logo_svg, { scale: 0.9 }) })}>缩小一点</button>
          <button className="v3-link" onClick={() => { const blob = new Blob([d.logo_svg], { type: 'image/svg+xml' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${spec.brandName || 'LunaSol'}-logo.svg`; a.click(); URL.revokeObjectURL(a.href); p.toast('已下载 SVG 矢量 Logo'); }}>下载 SVG</button>
          <button className="v3-link" onClick={gen}>重新生成</button>
        </div>
        <Note tone="warn">{TRADEMARK_NOTE} Logo 会作为独立素材保存，之后可随时上传、替换与编辑。</Note>
      </div>}
      {!spec.brandName.trim() && <Note tone="warn">还没有品牌名称。请先填写品牌名称，AI 才能生成对应的 Logo 方向。</Note>}
    </StepSection>}

    {d.logo_creation_mode === 'none' && <Note>已跳过 Logo。后续在编辑器里仍可上传或重新制作，不影响现在继续。</Note>}
    <Why text="Logo 是包装上识别度最高的元素，作为独立素材保存后，换色、缩放和替换都不会影响其它图层。" />
  </>;
}

/* ============================ STEP 03 人群 ============================ */
export function StepAudience(p: StepProps) {
  const a = p.d.target_audience;
  const setA = (k: 'ages' | 'groups' | 'tiers', v: string[]) => p.set({ target_audience: { ...a, [k]: v } });
  const recommend = async () => {
    const r = await runAITask('audience.profile', buildAIContext(p.d), p.ai);
    const first = r.suggestions[0];
    if (!first) return;
    const v = (first.value || {}) as { advice?: string };
    const advice = v.advice || first.detail;
    p.set((d) => ({ target_audience: { ...d.target_audience, aiRecommend: true, advice } }));
    p.toast(r.source === 'ai' ? 'AI 已按产品与风格给出视觉表达建议' : '已按当前人群与品类给出视觉表达建议（本地引擎）');
  };
  return <>
    <StepSection title="年龄群体"><MultiChips options={AGE_OPTIONS} value={a.ages} onChange={(v) => setA('ages', v)} /></StepSection>
    <StepSection title="消费群体" aside={<span className="v3-aside">可多选</span>}><MultiChips options={GROUP_OPTIONS} value={a.groups} onChange={(v) => setA('groups', v)} /></StepSection>
    <StepSection title="消费定位"><MultiChips options={TIER_OPTIONS} value={a.tiers} onChange={(v) => setA('tiers', v)} /></StepSection>
    <div className="v3-btnrow"><button className="btn btn-outline btn-md" onClick={recommend}>让 AI 帮我推荐</button></div>
    {(a.aiRecommend || a.advice) && <Note tone="ok"><strong>推荐方向</strong><br />{a.advice}</Note>}
    <Note>只需要简单选择，不需要填写人群画像报告。此步可以跳过，系统会按大众消费群体处理。</Note>
    <Why text="人群会影响字体气质、配色明度和信息密度，但不需要复杂的市场调研。" />
  </>;
}

/* ============================ STEP 04 产品类型 ============================ */
export function StepProduct(p: StepProps) {
  const c = p.d.product_category;
  return <>
    <StepSection title="选择产品品类">
      {PRODUCT_GROUPS.map((g) => <div className="v3-group" key={g.group}>
        <FieldLabel>{g.group}</FieldLabel>
        <MultiChips options={g.items} value={c.type === g.items.find((x) => x === c.type) ? [c.type] : []}
          onChange={(v) => p.set({ product_category: { ...c, type: v[v.length - 1] || '', custom: '', note: '' } })} />
      </div>)}
    </StepSection>
    <StepSection title="其它 / 自定义"><TextField label="自定义产品类型" value={c.custom} placeholder="例如：手工香皂礼盒" onChange={(v) => p.set({ product_category: { ...c, custom: v, type: '' } })} /></StepSection>
    <Note tone="warn">食品、化妆品、保健食品等品类：系统不会自行编造配料、功效、认证、许可和法规信息。相关文字需要你在第 09 步按实际填写并自行核实。</Note>
    <Note>系统需要区分「包装形态」（第 01 步）与「产品类型」（本步）。例如：天地盖盒 + 茶叶，两者不会混淆。</Note>
    <Why text="品类决定推荐的内容层级与布局，但不会替代你提供真实的法定信息。" />
  </>;
}

/* ============================ STEP 05 风格库 ============================ */
export function StepStyle(p: StepProps) {
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  const [big, setBig] = useState<string | null>(null);
  const cfg = big ? styleById(big) : null;
  const recommended = useMemo(() => recommendStyles({ category: p.d.product_category.type || p.d.product_category.custom, audience: [...p.d.target_audience.groups, ...p.d.target_audience.tiers].join(' '), form: p.d.package_type }), [p.d.product_category, p.d.target_audience, p.d.package_type]);
  const list = STYLES.filter((s) => {
    if (group === 'modern' && s.group !== 'modern') return false;
    if (group === 'tradition' && s.group !== 'tradition') return false;
    if (group === 'recommend' && !recommended.some((r) => r.style_id === s.style_id)) return false;
    if (group === 'favorites' && !p.d.style_favorites.includes(s.style_id)) return false;
    if (q && !`${s.style_name}${s.era}${s.description}${s.pattern_elements.join('')}${s.suitable_categories.join('')}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const fav = (id: string) => p.set((d) => ({ style_favorites: d.style_favorites.includes(id) ? d.style_favorites.filter((x) => x !== id) : [...d.style_favorites, id] }));
  const use = (id: string) => {
    const s = styleById(id);
    if (!s) return;
    p.set({ style_id: id, style_parameters: JSON.stringify(s), primary_color: '', color_palette: null, color_palettes: [], color_palette_id: '' });
    p.toast(`已使用「${s.style_name}」，主色与配色将按该风格重新推荐`);
  };
  return <>
    <StepSection title="风格库" aside={<span className="v3-aside">{STYLES.length} 个风格 · 其中 {TRADITION_COUNT} 组传统艺术风格</span>}>
      <div className="v3-filterbar">
        <div className="v3-chips">{STYLE_GROUPS.map((g) => <button key={g.id} className={`v3-chip ${group === g.id ? 'on' : ''}`} onClick={() => setGroup(g.id)}>{g.label}</button>)}</div>
        <input className="v3-search" value={q} placeholder="搜索风格 / 纹样 / 品类" onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="v3-style-grid">
        {list.map((s) => <div key={s.style_id} className={`v3-style-card ${p.d.style_id === s.style_id ? 'on' : ''}`}>
          <button className="v3-style-thumb" onClick={() => setBig(s.style_id)} aria-label={`放大预览 ${s.style_name}`}><img src={s.reference_thumbnail} alt={s.style_name} /></button>
          <button className={`v3-fav ${p.d.style_favorites.includes(s.style_id) ? 'on' : ''}`} onClick={() => fav(s.style_id)} aria-label="收藏">★</button>
          <div className="v3-style-info">
            <span className="v3-style-era">{s.era}</span><strong>{s.style_name}</strong>
            <p>{s.description}</p>
            <div className="v3-style-sw">{s.dominant_colors.slice(0, 4).map((c) => <Swatch key={c} color={c} size={16} />)}</div>
          </div>
          <div className="v3-style-actions"><button onClick={() => setBig(s.style_id)}>查看介绍</button><button className="primary" onClick={() => use(s.style_id)}>使用此风格</button></div>
        </div>)}
      </div>
      {!list.length && <Note>没有匹配的风格，试试其它关键词或切换分类。</Note>}
      <Note>第一版已为全部风格提供清晰的名称、介绍、设计规则与独立预览；预览由各自的纹样配置生成，不是用同一张图片冒充。风格为视觉设计参考，不代表严格的历史文物复原或学术鉴定。</Note>
    </StepSection>

    {cfg && <div className="v3-modal" onClick={() => setBig(null)}><div className="v3-modal-inner" onClick={(e) => e.stopPropagation()}>
      <div className="v3-modal-head"><div><span>{cfg.era} · {cfg.subtitle}</span><h3>{cfg.style_name}</h3></div><button onClick={() => setBig(null)} aria-label="关闭">✕</button></div>
      <div className="v3-modal-body">
        <img src={cfg.reference_thumbnail} alt={cfg.style_name} className="v3-modal-thumb" />
        <div className="v3-modal-text"><p>{cfg.description}</p>
          <div className="kv"><span>视觉特征</span><strong>{cfg.visual_features.join(' · ')}</strong></div>
          <div className="kv"><span>纹样元素</span><strong>{cfg.pattern_elements.join(' · ')}</strong></div>
          <div className="kv"><span>主色 / 辅助色</span><strong className="swatches">{[...cfg.dominant_colors, ...cfg.supporting_colors].slice(0, 6).map((c) => <i key={c} style={{ background: c }} />)}</strong></div>
          <div className="kv"><span>插画规则</span><strong>{cfg.illustration_guidance}</strong></div>
          <div className="kv"><span>字体规则</span><strong>{cfg.typography_guidance}</strong></div>
          <div className="kv"><span>构图规则</span><strong>{cfg.composition_guidance}</strong></div>
          <div className="kv"><span>适合品类</span><strong>{cfg.suitable_categories.join('、')}</strong></div>
          {cfg.group === 'tradition' && <div className="kv"><span>时代约束</span><strong>只使用 {cfg.era} 的视觉语法，不混用其它时期纹样</strong></div>}
        </div>
      </div>
      <details className="v3-prompt"><summary>查看传给 AI 的完整风格提示词</summary><pre>{buildStylePrompt(cfg, { product: p.d.product_category.type || '产品', brand: p.d.copy_content.brandName || '品牌', audience: p.d.target_audience.groups.join('、') || '大众', form: FORM_META[p.d.package_type].label, primary: p.d.primary_color || '风格主色', motif: p.d.illustration_description || '默认纹样' })}</pre></details>
      <div className="v3-modal-foot"><button className="btn btn-outline btn-md" onClick={() => fav(cfg.style_id)}>收藏</button><button className="btn btn-dark btn-md" onClick={() => { use(cfg.style_id); setBig(null); }}>使用此风格</button></div>
    </div></div>}
    <Why text="AI 会读取整份风格配置执行具体视觉特征，而不是只把风格名称拼进提示词。" />
  </>;
}

/* ============================ STEP 06 主色 ============================ */
export function StepColor(p: StepProps) {
  const st = styleById(p.d.style_id);
  const [rgbIn, setRgbIn] = useState('');
  const choose = (c: string) => { p.set({ primary_color: c, color_palette: null, color_palettes: [], color_palette_id: '' }); p.toast(`主色已设为 ${c}`); };
  const fromLogo = async () => {
    const src = p.d.brand_logo?.src;
    if (!src) { p.toast('请先上传 Logo，或先完成 AI Logo 制作'); return; }
    if (p.d.brand_logo?.mime === 'application/pdf') { p.toast('PDF 无法在浏览器提取颜色，请手动选择主色'); return; }
    const cs = await extractLogoColors(src);
    if (!cs.length) { p.toast('未从 Logo 中提取到明显的品牌色，请手动选择'); return; }
    choose(cs[0]); p.toast(`已从 Logo 提取品牌色 ${cs[0]}`);
  };
  const applyRgb = () => {
    const m = rgbIn.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) { p.toast('请输入例如 32, 70, 58'); return; }
    choose(rgbToHex(Number(m[1]), Number(m[2]), Number(m[3])));
  };
  return <>
    <StepSection title="选择主颜色">
      <ColorInput label="颜色选择器 / HEX" value={p.d.primary_color || '#20463a'} onChange={choose} />
      <div className="v3-inline"><label className="v3-textfield"><FieldLabel hint="例如 32, 70, 58">RGB 输入</FieldLabel>
        <div className="v3-rgb"><input className="mono" value={rgbIn} placeholder="32, 70, 58" onChange={(e) => setRgbIn(e.target.value)} /><button className="v3-link" onClick={applyRgb}>应用</button></div></label></div>
      {p.d.primary_color && <div className="v3-current"><Swatch color={p.d.primary_color} size={54} /><div><strong>当前主色 {p.d.primary_color}</strong><span>{nameOfColor(p.d.primary_color)} · RGB {hexToRgb(p.d.primary_color).join(' / ')}</span></div></div>}
    </StepSection>
    <StepSection title="常用颜色"><div className="v3-swatches">{COMMON_COLORS.map((c) => <button key={c} className={p.d.primary_color === c ? 'on' : ''} onClick={() => choose(c)} title={c}><i style={{ background: c }} /><span>{nameOfColor(c)}</span></button>)}</div></StepSection>
    <StepSection title="快速获取主色"><div className="v3-btnrow">
      <button className="btn btn-outline btn-md" onClick={fromLogo}>从已上传 Logo 提取品牌色</button>
      <button className="btn btn-outline btn-md" onClick={async () => {
        const r = await runAITask('color.primary', buildAIContext(p.d), p.ai);
        const c = (r.suggestions[0]?.value as { color?: string } | undefined)?.color || recommendPrimary(st);
        choose(c);
        p.toast(r.source === 'ai' ? `AI 已按风格推荐主色 ${c}` : `已按「${st?.style_name || '当前配置'}」推荐 ${c}（本地引擎）`);
      }}>AI 根据风格推荐主色</button>
    </div></StepSection>
    <Why text="主色是整套配色的锚点，下一步的方案都会以它为基础展开，改主色后可重新生成配色。" />
  </>;
}

/* ============================ STEP 07 配色 ============================ */
export function StepPalette(p: StepProps) {
  const st = styleById(p.d.style_id);
  const gen = async () => {
    const base = generatePalettes({
      primary: p.d.primary_color, style: st,
      category: p.d.product_category.type || p.d.product_category.custom,
      audience: [...p.d.target_audience.groups, ...p.d.target_audience.tiers, ...p.d.target_audience.ages].join('、'),
      logoColors: p.d.brand_logo ? [p.d.primary_color] : [],
    });
    // 接入模型后，AI 配色排在前面，内置方案仍保留作为备选；未接入时行为完全不变
    if (aiEnabled(p.ai)) {
      const r = await runAITask('palette.schemes', buildAIContext(p.d), p.ai);
      const aiPalettes = r.suggestions.flatMap((s) => (s.value as { palettes?: PaletteDraft[] } | undefined)?.palettes || []);
      if (r.source === 'ai' && aiPalettes.length) {
        const list = [...aiPalettes, ...base].slice(0, 6);
        p.set({ color_palettes: list, color_palette: null, color_palette_id: '' });
        p.toast(`AI 给出 ${aiPalettes.length} 套配色，并与内置方案一起供你选择`);
        return;
      }
    }
    p.set({ color_palettes: base, color_palette: null, color_palette_id: '' });
    p.toast(st ? `已按「${st.style_name}」的配色逻辑生成 ${base.length} 套方案` : `已生成 ${base.length} 套配色方案`);
  };
  const list = p.d.color_palettes;
  return <>
    <StepSection title="AI 色彩搭配" aside={<button className="v3-link" onClick={gen}>{list.length ? '重新生成方案' : '生成配色方案'}</button>}>
      {!list.length && <div className="v3-empty">
        <p>系统会结合主色、{st ? `「${st.style_name}」风格配置` : '包装风格'}、产品类型、目标人群与 Logo 色彩，生成 4～6 套有主次比例的配色。</p>
        <button className="btn btn-dark btn-md" onClick={gen}>生成配色方案</button>
      </div>}
      {list.length > 0 && <div className="v3-palette-grid">{list.map((pl) => <div key={pl.id} className={`v3-palette ${p.d.color_palette_id === pl.id ? 'on' : ''}`}>
        <button className="v3-palette-main" onClick={() => p.set({ color_palette_id: pl.id, color_palette: pl })}>
          <div className="v3-palette-bars">{[pl.bg, pl.primary, pl.secondary, pl.accent].map((c, i) => <i key={i} style={{ background: c, flex: pl.ratio[i] }} />)}</div>
          <div className="v3-palette-preview" style={{ background: pl.bg, color: pl.ink }}>
            <span style={{ color: pl.primary }}>LunaSol</span><em>{p.d.copy_content.productName || p.d.product_category.type || '产品名称'}</em>
            <i style={{ background: pl.accent }} />
          </div>
          <strong>{pl.name}</strong>
          <div className="v3-palette-hex">{[pl.primary, pl.secondary, pl.accent, pl.bg].map((c) => <span key={c}>{c}</span>)}</div>
          <p>{pl.reason}</p>
          <span className="v3-ratio">比例 {pl.ratio.join(' / ')}</span>
          {p.d.color_palette_id === pl.id && <em className="v3-selected">已选中 ✓</em>}
        </button>
        <button className="v3-fav-mini" onClick={() => p.set((d) => ({ saved_palettes: d.saved_palettes.some((x) => x.id === pl.id) ? d.saved_palettes : [...d.saved_palettes, { ...pl }] }))}>收藏配色</button>
      </div>)}</div>}
    </StepSection>
    {p.d.color_palette && <StepSection title="自定义调整（修改后预览同步变化）">
      <div className="v3-editcolors">
        {(['primary', 'secondary', 'accent', 'bg'] as const).map((k) => <div key={k} className="v3-editcolor">
          <FieldLabel>{{ primary: '主色', secondary: '辅助色', accent: '点缀色', bg: '背景色' }[k]}</FieldLabel>
          <ColorInput value={p.d.color_palette![k]} onChange={(v) => p.set({ color_palette: withColor(p.d.color_palette!, k, v), color_palettes: p.d.color_palettes.map((x) => x.id === p.d.color_palette_id ? withColor(x, k, v) : x) })} />
        </div>)}
      </div>
      <Note>单独修改某个颜色时不会重算整套方案；改变主色或风格后，可以点「重新生成方案」让 AI 重新推荐。</Note>
    </StepSection>}
    {p.d.saved_palettes.length > 0 && <StepSection title="已保存的配色"><div className="v3-chips">{p.d.saved_palettes.map((x) => <button key={x.id} className="v3-chip" onClick={() => p.set({ color_palette: x, color_palette_id: x.id })}>
      <Swatch color={x.primary} size={14} />{x.name}</button>)}</div></StepSection>}
    <Why text="颜色之间有主次比例与搭配关系。仰韶彩陶与宋代单色釉使用的是完全不同的配色逻辑。" />
  </>;
}

/* ============================ STEP 08 图案 ============================ */
export function StepIllustration(p: StepProps) {
  const c = p.d.product_category.type || p.d.product_category.custom || '';
  const hints = Object.entries(MOTIF_HINTS).find(([k]) => c.includes(k))?.[1] || ['品牌相关元素', '产地元素', '材质纹理'];
  const st = styleById(p.d.style_id);
  return <>
    <StepSection title="你希望包装上出现什么样的图案？">
      <div className="v3-grid v3-grid-3">
        <OptionCard active={p.d.illustration_type === 'line'} title="A. 线稿" desc="单色线条、简洁轮廓，适合装饰与辅助说明；可使用传统纹样线稿。" onClick={() => p.set({ illustration_type: 'line' })} />
        <OptionCard active={p.d.illustration_type === 'illustration'} title="B. 插画" desc="彩色、场景化、产品主题或品牌原创插画；传统纹样的现代化表现。" onClick={() => p.set({ illustration_type: 'illustration' })} />
        <OptionCard active={p.d.illustration_type === 'none'} title="C. 不需要插画" desc="纯色、排版、纹理、材质与字体设计，不添加任何装饰图案。" onClick={() => p.set({ illustration_type: 'none', illustration_description: '' })} />
      </div>
    </StepSection>
    {p.d.illustration_type !== 'none' && p.d.illustration_type && <StepSection title="想要的具体图案">
      <TextField label="图案描述" value={p.d.illustration_description} multiline placeholder="例如：远山、茶树叶与一缕云气" hint="可留空，由系统按风格配置生成匹配的原创纹样"
        onChange={(v) => p.set({ illustration_description: v })} />
      <FieldLabel>常见选择（{c || '通用'}）</FieldLabel><div className="v3-chips">{hints.map((h) => <button key={h} className="v3-chip" onClick={() => p.set((d) => ({ illustration_description: [d.illustration_description, h].filter(Boolean).join('、') }))}>+ {h}</button>)}</div>
    </StepSection>}
    {st && <Note tone="info"><strong>当前风格：{st.style_name}（{st.era}）</strong><br />{st.illustration_guidance}</Note>}
    {p.d.illustration_type === 'none' && <Note tone="ok">已选择不需要插画。AI 不会擅自添加装饰图案，包装将只使用纯色、排版、纹理与材质。</Note>}
    <Why text="传统艺术风格会优先使用对应时期的装饰纹样逻辑，不会随意混搭不同历史时期的元素。" />
  </>;
}

/* ============================ STEP 09 文案 ============================ */
export function StepCopy(p: StepProps) {
  const c = p.d.copy_content;
  const setC = (k: keyof typeof c, v: string | boolean) => p.set({ copy_content: { ...c, [k]: v } as typeof c });
  const aiOrganize = async () => {
    if (!c.productName.trim()) { p.toast('请先填写产品名称，再让 AI 整理文案'); return; }
    const r = await runAITask('copy.suggestion', buildAIContext(p.d), p.ai);
    const lines = r.suggestions.map((s) => {
      const v = (s.value || {}) as { tagline?: string; subtitle?: string; description?: string };
      if (v.tagline) return `建议宣传语：${v.tagline}`;
      if (v.subtitle) return `建议副标题：${v.subtitle}`;
      if (v.description) return `建议产品介绍：${v.description}`;
      return '';
    }).filter(Boolean);
    // 一次写入：连续两次基于旧快照的 setC 会互相覆盖
    p.set({ copy_content: { ...c, aiSuggestion: `「${c.productName}」\n${lines.join('\n')}`, confirmed: false } });
    p.toast(r.source === 'ai' ? 'AI 已给出文案建议，确认后才会写入设计' : '已生成文案建议，确认后才会写入设计（本地引擎）');
  };
  const apply = () => {
    const lines = c.aiSuggestion.split('\n');
    const tag = lines.find((x) => x.startsWith('建议宣传语：'))?.replace('建议宣传语：', '') || '';
    const sub = lines.find((x) => x.startsWith('建议副标题：'))?.replace('建议副标题：', '') || '';
    const desc = lines.find((x) => x.startsWith('建议产品介绍：'))?.replace('建议产品介绍：', '') || '';
    p.set({ copy_content: { ...c, tagline: c.tagline || tag, subtitle: c.subtitle || sub, description: c.description || desc, confirmed: true } });
    p.toast('已按你的确认写入文案，可继续逐项修改');
  };
  return <>
    <StepSection title="模式">
      <div className="v3-grid v3-grid-2">
        <OptionCard active={c.mode === 'own'} title="我已经准备好了文字" desc="直接填写或粘贴完整文案。" onClick={() => setC('mode', 'own')} />
        <OptionCard active={c.mode === 'ai'} title="帮我整理包装文案" desc="AI 根据产品与风格提出建议，确认后才写入。" onClick={() => setC('mode', 'ai')} />
      </div>
    </StepSection>
    <StepSection title="包装上需要写什么" aside={<span className="v3-aside">非必要字段可留空</span>}>
      <div className="v3-grid v3-grid-2">
        <TextField label="品牌名称" value={c.brandName} placeholder="例如：山隐茶集" onChange={(v) => setC('brandName', v)} hint={!p.d.brand_logo && !p.d.logo_svg ? '没有 Logo 时，品牌名会以文字图层显示' : undefined} />
        <TextField label="产品名称 *" value={c.productName} placeholder="例如：高山乌龙茶" onChange={(v) => setC('productName', v)} />
        <TextField label="产品副标题" value={c.subtitle} placeholder="例如：2026 春摘 · 限量" onChange={(v) => setC('subtitle', v)} />
        <TextField label="品牌宣传语" value={c.tagline} placeholder="例如：一盏山野，慢享自然" onChange={(v) => setC('tagline', v)} />
        <TextField label="产品规格" value={c.spec} placeholder="例如：120g / 盒" onChange={(v) => setC('spec', v)} />
        <TextField label="产品净含量" value={c.netWeight} placeholder="例如：120g" onChange={(v) => setC('netWeight', v)} />
      </div>
      <TextField label="产品介绍" multiline value={c.description} placeholder="用一两句话描述产品；不要填写未经核实的功效与认证信息" onChange={(v) => setC('description', v)} />
      <TextField label="其它补充文字" multiline value={c.extra} placeholder="其它需要出现在包装上的文字，一行一条" onChange={(v) => setC('extra', v)} />
    </StepSection>
    {c.mode === 'ai' && <StepSection title="AI 文案建议">
      <div className="v3-btnrow"><button className="btn btn-outline btn-md" onClick={aiOrganize}>生成文案建议</button>
        {c.aiSuggestion && !c.confirmed && <button className="btn btn-dark btn-md" onClick={apply}>确认并写入</button>}</div>
      {c.aiSuggestion && <pre className="v3-suggestion">{c.aiSuggestion}</pre>}
      {c.confirmed && <Note tone="ok">建议已确认写入上方字段，仍可逐项修改。</Note>}
    </StepSection>}
    <Note tone="warn">所有文字都会成为独立可编辑图层，不会被绘制成不可编辑的像素。系统不会擅自修改你已确认的产品名称、商标与核心文案，也不会自行编造配料、生产日期、功效、认证和法规内容。文字过多时系统会提示空间不足并推荐优化排版。</Note>
    <Why text="品牌 Logo、产品名称与说明文字决定正面和背面的信息层级，印前检查会验证文字不超出安全边距、不重叠。" />
  </>;
}

/* ============================ STEP 10 条码 ============================ */
export function StepBarcode(p: StepProps) {
  const bc = p.d.barcode_asset;
  // 必须用函数式更新：usePreview / applyGenerated / upload 会在同一个事件里连续调用 setB，
  // 若基于渲染时的 bc 快照展开，后一次会覆盖前一次，导致 svg / previewOnly / type 丢失。
  const setB = (k: keyof typeof bc, v: unknown) => p.set((d) => ({ barcode_asset: { ...d.barcode_asset, [k]: v } as typeof bc }));
  const fileRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(bc.value || p.d.barcode_value);
  const validation = useMemo(() => validateBarcode(bc.type, localValue), [bc.type, localValue]);
  const encoded = useMemo(() => bc.type && localValue && validation.ok ? encodeBarcode(bc.type, localValue, bc.scale) : null, [bc.type, localValue, validation.ok, bc.scale]);
  const verified = useMemo(() => encoded ? verifyBarcode(encoded) : null, [encoded]);
  const svg = encoded?.ok ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(barcodeSvg(encoded, { label: true }))}` : '';

  const applyGenerated = () => {
    if (!encoded?.ok) return;
    setB('svg', barcodeSvg(encoded, { label: true }));
    setB('value', localValue); setB('previewOnly', false);
    p.set({ barcode_type: bc.type, barcode_value: localValue });
    p.toast(`已生成 ${bc.type} 矢量条码，${verified?.message || ''}`);
  };
  const usePreview = () => {
    const r = encodeBarcode(PREVIEW_CODE.type, PREVIEW_CODE.value);
    setB('type', PREVIEW_CODE.type); setB('value', PREVIEW_CODE.value); setB('svg', barcodeSvg(r, { label: true }));
    setB('previewOnly', true); setB('needed', true); setLocalValue(PREVIEW_CODE.value);
    p.set({ barcode_type: PREVIEW_CODE.type, barcode_value: PREVIEW_CODE.value });
    p.toast('已添加明确标记为预览用途的占位码，不可用于正式零售');
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    const src = await fileToDataUrl(f);
    const info = await new Promise<{ w: number; h: number }>((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 0, h: 0 }); im.src = src; });
    setB('asset', { name: f.name, src, naturalW: info.w, naturalH: info.h, sharp: info.w >= 500 });
    setB('needed', true); setB('type', 'upload'); setB('svg', '');
    p.set({ barcode_type: 'upload', barcode_value: f.name });
    p.toast(info.w >= 500 ? '条码文件已上传，清晰度达标' : '条码文件分辨率偏低，建议提供至少 500 px 宽的高清图或 SVG');
  };
  return <>
    <StepSection title="需要条形码吗？">
      <div className="v3-grid v3-grid-2">
        <OptionCard active={bc.needed === true} title="需要条形码" desc="上传现有条码，或按有效编码生成。" onClick={() => setB('needed', true)} />
        <OptionCard active={bc.needed === false} title="暂时不需要" desc="可以先跳过，之后在编辑器里补。" onClick={() => { setB('needed', false); setB('svg', ''); p.set({ barcode_type: '', barcode_value: '' }); }} />
      </div>
    </StepSection>
    {bc.needed && <>
      <StepSection title="A. 上传现有条形码">
        <div className="v3-drop" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,application/pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
          {bc.asset ? <div className="v3-drop-preview"><img src={bc.asset.src} alt="条码" /><div><strong>{bc.asset.name}</strong><span>{bc.asset.naturalW} × {bc.asset.naturalH} px · {bc.asset.sharp ? '清晰度达标' : '清晰度偏低'}</span></div></div>
            : <div className="v3-drop-empty"><strong>点击上传条码文件</strong><span>PNG · JPG · SVG · PDF（PDF 需可识别）</span></div>}
        </div>
        {bc.asset && !bc.asset.sharp && <Note tone="warn">上传的位图分辨率偏低，可能无法扫描。建议提供原始矢量或高清图；系统不会把低分辨率图片放大后标记为合格。</Note>}
      </StepSection>
      <StepSection title="B. 自动生成条形码">
        <div className="v3-grid v3-grid-2">
          <label className="v3-textfield"><FieldLabel>条码类型</FieldLabel><select value={bc.type} onChange={(e) => { setB('type', e.target.value); setB('svg', ''); }}>
            <option value="">请选择</option>{['EAN-13', 'UPC-A', 'Code 128'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <TextField label={bc.type === 'Code 128' ? '内部 SKU / 编码' : '商品编码（含校验位）'} mono value={localValue} placeholder={bc.type === 'EAN-13' ? '13 位数字' : bc.type === 'UPC-A' ? '12 位数字' : '例如 SKU-2026-001'}
            onChange={(v) => { setLocalValue(v); setB('value', v); }} />
        </div>
        {bc.type && localValue && <Note tone={validation.ok ? 'ok' : 'warn'}>{validation.message}{bc.type === 'Code 128' ? ' 此编码仅用于内部管理，不可作为零售商品条码。' : ''}</Note>}
        {encoded?.ok && svg && <div className="v3-barcode-preview"><img src={svg} alt="生成的条码" /><div>
          <strong>{bc.type} · {localValue}</strong><span>成品宽度 {encoded.widthMm.toFixed(2)} mm · 静区 {encoded.quietMm.toFixed(2)} mm（左右各）</span>
          <span>{verified?.message}</span>
          <div className="v3-inline"><label className="v3-mini">缩放 <input type="range" min="0.8" max="1.4" step="0.05" value={bc.scale} onChange={(e) => setB('scale', Number(e.target.value))} /> {Math.round(bc.scale * 100)}%</label>
            <label className="v3-mini">位置 <select value={bc.position} onChange={(e) => setB('position', e.target.value)}>{['背面右下', '背面左下', '侧面下方'].map((x) => <option key={x}>{x}</option>)}</select></label></div>
          <button className="btn btn-dark btn-sm" onClick={applyGenerated}>应用这个条码</button>
        </div></div>}
        {bc.type === 'Code 128' && <Note>Code 128 适合内部 SKU 管理。还没有正式商品条码时，也可以使用明确标记为预览用途的占位码。</Note>}
        <div className="v3-btnrow"><button className="v3-link" onClick={usePreview}>使用预览占位码（不可用于零售）</button></div>
      </StepSection>
      {bc.svg && <Note tone="ok">条码已作为独立矢量图形保存，大小与位置：{bc.scale.toFixed(2)}× / {bc.position}。导出前会执行结构与校验位检查。</Note>}
      <Note tone="warn">{RETAIL_WARNING}</Note>
    </>}
    <Why text="零售条码需要合法取得的商品编码；没有也可以先跳过，不会阻断当前项目。" />
  </>;
}

export const STEP_BODIES: ((p: StepProps) => React.ReactElement)[] = [
  StepSize, StepLogo, StepAudience, StepProduct, StepStyle, StepColor, StepPalette, StepIllustration, StepCopy, StepBarcode,
];
