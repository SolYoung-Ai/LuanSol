/* ============================================================
 * 需求汇总与生成：十步数据统一传给设计智能体
 * ============================================================ */
import React, { useState } from 'react';
import { useApp } from '../store';
import { Button, go } from '../ui';
import { WIZARD_STEPS, stepDone } from './steps';
import { effectiveSize, draftToBrief, FORM_META, dimensionComplete, type ProjectDraft } from './draft';
import { buildStylePrompt, styleById } from './styles';
import { buildSchemes, makeShape, addImageLayer, cloneDesign } from '../engine/design';
import { aiEnabled, aiStatusLabel } from '../engine/llm';
import { runAITask } from '../ai/provider';
import { buildAIContext } from '../ai/context';
import { PackagePreview } from './Preview';
import { Note, Swatch } from './controls';
import { verifyBarcode, encodeBarcode } from './barcode';
import type { AISettings, DesignDoc } from '../types';

interface Plan { title: string; focus: string }

/** 三方向规划统一走 AI 任务层：未接入用本地引擎，接入后由模型规划，
 *  失败或违规一律如实回退，不把模拟结果冒充 AI。 */
async function designPlan(d: ProjectDraft, ai: AISettings): Promise<{ plans: Plan[]; note: string; source: string }> {
  const r = await runAITask('review.directions', buildAIContext(d), ai);
  const plans: Plan[] = r.suggestions.slice(0, 3).map((s) => {
    const v = (s.value || {}) as { title?: string; focus?: string };
    return { title: v.title || s.title, focus: v.focus || s.detail };
  });
  while (plans.length < 3) plans.push({ title: `方案 ${String.fromCharCode(65 + plans.length)}`, focus: '按当前需求生成的可编辑矢量方案。' });
  const extra = r.source === 'ai'
    ? 'AI 已整合十步数据参与方向规划；图形与文字仍由矢量引擎输出为独立可编辑图层。'
    : r.source === 'fallback' ? 'AI 未通过校验或调用失败，已回退内置设计引擎（未伪装为 AI 结果）。'
      : '未配置 AI：由内置设计引擎整合十步数据并生成三套矢量方案（未调用 AI）。';
  return { plans, note: `${r.note} ${extra}`, source: r.source };
}

export default function Review() {
  const { s, update, patchDraft, setToast, saveProject, syncProject } = useApp();
  const d = s.draft;
  const [busy, setBusy] = useState(false);
  const [planNote, setPlanNote] = useState('');
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const cfg = styleById(d.style_id);
  const styleName = cfg?.style_name || '现代极简';
  const size = effectiveSize(d);
  const dc = dimensionComplete(d);
  const configured = aiEnabled(s.ai);

  const rows: { label: string; value: React.ReactNode; step: number }[] = [
    { label: '包装尺寸', step: 0, value: `${FORM_META[d.package_type].label} · ${size.l} × ${size.w}${size.h ? ` × ${size.h}` : ''} mm · ${d.package_dimensions.structureId ? (FORM_META[d.package_type].structures.includes(d.package_dimensions.structureId as never) ? d.package_dimensions.structureId : '—') : '未选结构'}` },
    { label: 'Logo', step: 1, value: d.brand_logo ? `已上传 ${d.brand_logo.name}` : d.logo_svg ? 'AI 制作 SVG Logo（独立矢量素材）' : '暂时不需要 / 跳过' },
    { label: '目标消费群体', step: 2, value: [...d.target_audience.ages, ...d.target_audience.groups, ...d.target_audience.tiers].join('、') || '未指定（按大众群体）' },
    { label: '产品类型', step: 3, value: `${d.product_category.group ? d.product_category.group + ' · ' : ''}${d.product_category.type || d.product_category.custom || '未填写'}` },
    { label: '包装风格', step: 4, value: cfg ? `${styleName}（${cfg.era}）· ${cfg.pattern_elements.slice(0, 3).join('、')}` : '未选择' },
    { label: '主颜色', step: 5, value: d.primary_color ? <span className="v3-inline-val"><Swatch color={d.primary_color} size={16} />{d.primary_color}</span> : '未选择' },
    { label: '配色方案', step: 6, value: d.color_palette ? <span className="v3-inline-val">{[d.color_palette.primary, d.color_palette.secondary, d.color_palette.accent, d.color_palette.bg].map((c) => <Swatch key={c} color={c} size={16} />)}{d.color_palette.name}</span> : '未选择（将按风格推荐）' },
    { label: '插画类型', step: 7, value: d.illustration_type === 'none' ? '不需要插画（不添加装饰）' : d.illustration_type ? `${d.illustration_type === 'line' ? '线稿' : '插画'} · ${d.illustration_description || '按风格默认纹样'}` : '未选择' },
    { label: '产品名称与文案', step: 8, value: `${d.copy_content.brandName || '未填品牌'} · ${d.copy_content.productName || '未填产品名'}${d.copy_content.tagline ? ` · ${d.copy_content.tagline}` : ''}` },
    { label: '条形码', step: 9, value: d.barcode_asset.needed === false ? '暂时不需要' : d.barcode_asset.svg ? `${d.barcode_asset.type} · ${d.barcode_asset.value}${d.barcode_asset.previewOnly ? '（预览占位，不可零售）' : ''}` : d.barcode_asset.asset ? `已上传 ${d.barcode_asset.asset.name}` : '未添加' },
  ];

  const generate = async () => {
    if (!dc.ok) { setToast(`第 01 步还不完整：${dc.missing.join('、')}`); return; }
    if (!d.style_id) { setToast('请先选择设计风格'); return; }
    setBusy(true);
    const plan = await designPlan(d, s.ai);
    setPlans(plan.plans); setPlanNote(plan.note);

    // 十步数据 → 统一 DesignBrief（下游结构 / 3D / 印前 / 导出全部复用）
    const brief = draftToBrief(d, styleName);
    let schemes: DesignDoc[] = buildSchemes(brief, cfg);

    // 三套方向各自带上 AI / 本地规划的设计理念
    schemes = schemes.map((doc, i) => ({ ...doc, rationale: `${plan.plans[i]?.title || ''}：${plan.plans[i]?.focus || ''}\n${doc.rationale}` }));

    // Logo 与条码作为独立图层附加（文字始终是可编辑图层）
    const logoSrc = d.brand_logo?.src || (d.logo_svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.logo_svg)}` : '');
    schemes = schemes.map((doc) => {
      let next = cloneDesign(doc);
      if (logoSrc && next.faces.front) {
        next = addImageLayer(next, 'front', { src: logoSrc, naturalW: 600, naturalH: 300 }, '品牌 Logo');
        // addImageLayer 默认按「插画素材」铺满正面（84%×62%）。Logo 必须是小巧的独立标识，
        // 放在右上角，不能盖住品牌名 / 产品名 / 宣传语等已确认的可编辑文字图层。
        const front = next.faces.front!;
        const logo = front.layers.find((l) => l.name === '品牌 Logo');
        if (logo) {
          const lw = Math.min(front.w * 0.16, 34);
          const lh = lw * 0.5;
          logo.x = front.w - lw - front.w * 0.03;
          logo.y = front.h * 0.035;
          logo.w = lw;
          logo.h = lh;
          (logo as { fit?: string }).fit = 'contain';
        }
      }
      if (d.barcode_asset.svg && d.barcode_asset.type !== 'upload') {
        const r = encodeBarcode(d.barcode_asset.type, d.barcode_asset.value, d.barcode_asset.scale);
        const v = verifyBarcode(r);
        const face = next.faces.back || next.faces.front;
        if (face && v.ok) {
          const bw = Math.min(38, face.w * 0.36), bh = bw * 0.5;
          face.layers.push(makeShape('条形码 · 独立矢量图层', 'barcode',
            { x: face.w - bw - 6, y: face.h - bh - 6, w: bw, h: bh },
            { fill: '#111111', stroke: '#111111', seed: 991, barcode: { type: d.barcode_asset.type, value: d.barcode_asset.value }, locked: false }));
        }
      }
      return next;
    });

    update({ brief, schemes, design: null, report: null, chat: [], activeId: null });
    patchDraft({ design_variants: schemes.map((x) => x.id), step: 9, visited: WIZARD_STEPS.map((_, i) => i) });
    saveProject(`${d.copy_content.brandName || 'LunaSol'} · ${d.copy_content.productName || d.product_category.type || '包装设计'}`);
    syncProject();
    setToast(plan.note);
    setBusy(false);
    go('/schemes');
  };

  return <div className="page v3-review">
    <div className="v3-wizard-head">
      <div className="v3-wizard-kicker"><span>FINAL CHECK</span><span>STEP 01–10 已完成 {WIZARD_STEPS.filter((_, i) => stepDone(d, i)).length} / 10</span></div>
    </div>
    <header className="v3-step-head"><h1>你的包装设计需求已经准备好了。</h1>
      <p>下面每一项都可以返回修改。确认后，系统会把十步数据一起交给设计引擎，生成三个明显不同的方向。</p></header>
    <div className="v3-review-ai">
      <span className={`v3-ai-pill ${configured ? 'on' : ''}`}>{aiStatusLabel(s.ai)}</span>
      <span>十步数据作为同一份上下文交给设计智能体；接入模型后由 AI 规划方向，未接入时由内置引擎整合，图形与文字始终是可编辑图层。</span>
    </div>

    <div className="v3-review-grid">
      <div>
        <div className="v3-summary">
          {rows.map((r) => <div className="v3-summary-row" key={r.label}>
            <span className="v3-summary-label">{r.label}</span>
            <span className="v3-summary-val">{r.value}</span>
            <button className="v3-link" onClick={() => { patchDraft({ step: r.step, visited: [...new Set([...d.visited, r.step])] }); go('/wizard'); }}>返回修改</button>
          </div>)}
        </div>

        {!dc.ok && <Note tone="warn">尺寸 / 结构还不完整：{dc.missing.join('、')}。请先返回第 01 步补齐，否则不能生成真实刀模。</Note>}

        {cfg && <details className="v3-prompt"><summary>查看传给设计引擎的完整风格配置与提示词</summary><pre>{buildStylePrompt(cfg, {
          product: d.product_category.type || d.product_category.custom, brand: d.copy_content.brandName,
          audience: [...d.target_audience.groups, ...d.target_audience.tiers].join('、'),
          form: FORM_META[d.package_type].label, primary: d.primary_color,
          motif: d.illustration_type === 'none' ? '不需要图案' : d.illustration_description,
        })}</pre></details>}

        {plans && <div className="v3-plans"><strong>三个设计方向</strong>{plans.map((x) => <div key={x.title}><b>{x.title}</b><span>{x.focus}</span></div>)}</div>}
        {planNote && <Note tone={configured ? 'ok' : 'info'}>{planNote} 关键文字均为独立可编辑图层；未配置模型时不会宣称是 AI 生成。</Note>}

        <div className="v3-review-actions">
          <Button variant="outline" onClick={() => go('/wizard')}>返回流程</Button>
          <Button size="lg" disabled={busy || !dc.ok || !d.style_id} onClick={generate}>{busy ? '正在整合需求…' : '开始生成包装设计 →'}</Button>
        </div>
        <Note>生成后进入「三套设计方向」页面，选择一套即可继续在线编辑、3D 预览、印前检查与文件导出。</Note>
      </div>
      <aside className="v3-wizard-aside"><PackagePreview d={d} /></aside>
    </div>
  </div>;
}
