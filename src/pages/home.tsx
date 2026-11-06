import React, { useState } from 'react';
import { CATEGORIES, INSPIRATIONS, QUICK_START, type InspirationItem } from '../data';
import { ProductMockup } from '../components/visuals';
import { Button, Card, Modal, SectionLabel, go } from '../ui';
import { useApp } from '../store';
import { createEmptyBrief, parseUtterance } from '../engine/brief';
import type { StructureId } from '../types';
import { createEmptyDraft, defaultDimensions, type PackageForm } from '../v3/draft';
import { WIZARD_STEPS } from '../v3/steps';
import { PRICING } from '../cloud/plans';

const sizeFor: Record<string, { l: number; w: number; h: number }> = {
  box: { l: 200, w: 150, h: 80 }, label: { l: 90, w: 120, h: 0 }, pouch: { l: 140, w: 60, h: 220 }, custom: { l: 200, w: 150, h: 80 },
};

export default function Home() {
  const { update, setToast } = useApp();
  const [cat, setCat] = useState('全部');
  const [active, setActive] = useState<InspirationItem | null>(null);
  const list = cat === '全部' ? INSPIRATIONS : INSPIRATIONS.filter((i) => i.category === cat);

  /** 从首页进入新的十步向导；选择形态时预填第一步 */
  const startWizard = (form?: PackageForm) => {
    const d = createEmptyDraft();
    if (form) { d.package_type = form; d.package_dimensions = defaultDimensions(form); }
    update({ draft: d, brief: createEmptyBrief(), chat: [], schemes: [], design: null, report: null, activeId: null });
    go('/wizard');
  };

  const useInspiration = (item: InspirationItem) => {
    const packType: string = item.structure === 'pouch' ? 'pouch' : /label/.test(item.structure) ? 'label' : 'box';
    const b = createEmptyBrief();
    let parsed = parseUtterance(b, `我想做一个${item.category}包装，风格是${item.style}`).brief;
    parsed = {
      ...parsed, packType, size: sizeFor[packType], structure: item.structure as StructureId,
      style: item.style, colors: [item.palette.bg, item.palette.primary, item.palette.accent],
      motif: item.keywords.includes('山水') ? '山水' : item.keywords.includes('植物线条') || item.keywords.includes('麦穗') ? '植物线条' : '几何',
      brand: '', product: item.category,
    };
    update({ brief: parsed, chat: [], schemes: [], design: null, report: null, activeId: null });
    setActive(null);
    setToast(`已提取「${item.style}」设计方向，接下来只需补充品牌名和尺寸`);
    go('/create');
  };

  return <div className="home">
    {/* ---------------- 首屏：干净的品牌介绍 + 产品入口 ---------------- */}
    <section className="hero hero-v3">
      <div className="hero-left">
        <div className="hero-eyebrow">LUNASOL · AI PACKAGING DESIGN STUDIO</div>
        <h1>让包装设计，<br />变得简单。</h1>
        <p className="hero-sub">没有设计经验也没关系。<br />从一个尺寸和一个想法开始，让 AI 帮你完成包装设计。</p>
        <div className="hero-actions">
          <Button size="lg" onClick={() => startWizard()}>开始设计 <span aria-hidden>→</span></Button>
          <Button size="lg" variant="outline" onClick={() => go('/inspiration')}>探索设计灵感</Button>
        </div>
        <div className="hero-note">尺寸 · Logo · 风格 · 配色 · 文案 · 印刷文件，全程引导完成</div>
      </div>
      <div className="hero-right hero-right-v3">
        <div className="hero-v3-frame">
          <div className="hero-v3-frame-label">01 / PACKAGING PREVIEW</div>
          <ProductMockup kind="box" palette={INSPIRATIONS[0].palette} brand="山隐茶集" sub="HIGHLAND OOLONG" />
        </div>
      </div>
    </section>

    {/* ---------------- 创作入口 ---------------- */}
    <section className="section section-pad" id="start">
      <SectionLabel en="START WITH A SHAPE">从一种包装形态开始</SectionLabel>
      <div className="section-head"><h2>选一个最接近的形态，<br />剩下的由系统逐步引导。</h2><p>不需要一次填完所有参数，每一步只问你一件事。</p></div>
      <div className="quick-grid">
        {QUICK_START.map((q, i) => <Card key={q.id} hover className="quick-card" onClick={() => startWizard(q.id as PackageForm)}>
          <div className="quick-top"><span className="quick-index">0{i + 1} / {q.en}</span><span className="quick-arrow">→</span></div>
          <div className="quick-visual"><ProductMockup kind={q.kind} palette={q.palette} brand="LunaSol" sub={q.en} /></div>
          <h3>{q.title}</h3><p>{q.desc}</p>
        </Card>)}
      </div>
    </section>

    {/* ---------------- 流程说明 ---------------- */}
    <section className="section section-flow">
      <div className="flow-grid">
        <div className="flow-left">
          <SectionLabel en="HOW IT WORKS">十步完成一个包装</SectionLabel>
          <h2>从尺寸到印刷文件，<br />一条清晰的路径。</h2>
          <p>每一步只处理一个决定，并配有 AI 助手：可以补充一句想法获取建议、逐条采纳，也可以完全手动填写。所有内容自动保存、随时返回修改；后台接入模型后，同一套流程会自动切换为真实 AI。</p>
          <Button variant="outline" onClick={() => startWizard()}>进入创作流程 <span aria-hidden>→</span></Button>
        </div>
        <div className="flow-steps">{WIZARD_STEPS.map((s, i) => <div className="flow-step" key={s.id}>
          <span className="flow-num">{String(i + 1).padStart(2, '0')}</span><span className="flow-name">{s.short}</span><span className="flow-line" />
        </div>)}</div>
      </div>
    </section>

    {/* ---------------- 作品展示：彩色只留给包装本身 ---------------- */}
    <section className="section section-pad" id="inspiration">
      <div className="section-head row"><div><SectionLabel en="GALLERY">设计灵感</SectionLabel><h2>好的包装，先有一个方向。</h2></div>
        <Button variant="ghost" onClick={() => go('/inspiration')}>查看全部灵感 <span aria-hidden>→</span></Button></div>
      <div className="chips">{CATEGORIES.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="gallery">
        {list.slice(0, 6).map((item, i) => <button key={item.id} className={`gallery-item ${i === 0 ? 'gallery-big' : ''}`} onClick={() => setActive(item)}>
          <ProductMockup kind={item.kind} palette={item.palette} brand={item.brand} sub={item.sub} />
          <div className="gallery-meta"><span>{item.category} · {item.style}</span><strong>{item.brand}</strong></div>
        </button>)}
      </div>
    </section>

    {/* ---------------- 能力说明 ---------------- */}
    <section className="section section-pad section-soft">
      <SectionLabel en="PROFESSIONAL OUTPUT">设计结果可以直接交付</SectionLabel>
      <div className="section-head"><h2>可编辑的平面稿，<br />真实的结构与印刷文件。</h2><p>文字是独立图层，刀模按实际尺寸计算，导出前逐项检查。</p></div>
      <div className="agent-grid">
        {[
          ['01', '可编辑图层', '品牌名、产品名、文案与条码各自独立，随时修改'],
          ['02', '真实结构', '按成品尺寸生成刀模、折痕线与安全边距'],
          ['03', '配色系统', '主色、辅助色、点缀色按比例应用并实时预览'],
          ['04', '3D 预览', '把平面稿映射到真实结构模型查看实物效果'],
          ['05', '印前检查', '尺寸、出血、DPI、色彩、字体与条码可读性'],
          ['06', '文件输出', '毫米级 PDF / SVG / 高清 PNG / 刀模 DXF'],
        ].map(([n, t, d]) => <div className="agent" key={n}><span>{n}</span><h4>{t}</h4><p>{d}</p></div>)}
      </div>
    </section>

    {/* ---------------- 订阅说明 ---------------- */}
    <section className="section section-pad section-soft" id="plans">
      <div className="section-head row"><div>
        <SectionLabel en="PRICING">免费开始，需要更多再订阅</SectionLabel>
        <h2>新用户免费体验 {PRICING.freeTrialUses} 次 AI，<br />不够再订阅。</h2>
        <p>模型由平台统一接入（GPT-4o 与 DeepSeek-V3 自动调度），你不需要、也无法自己配置 API。</p>
      </div><Button variant="outline" onClick={() => go('/subscribe')}>查看完整方案 <span aria-hidden>→</span></Button></div>
      <div className="plan-grid">
        <Card className="pad-card plan-card">
          <div className="plan-name">免费体验</div>
          <div className="plan-price">¥0</div>
          <ul className="plan-feats">
            <li>{PRICING.freeTrialUses} 次 AI 调用（新注册自动获得）</li>
            <li>内置确定性设计引擎</li>
            <li>本机保存项目</li>
          </ul>
        </Card>
        <Card className="pad-card plan-card plan-card-pro">
          <div className="plan-badge">推荐</div>
          <div className="plan-name">会员</div>
          <div className="plan-price">¥{PRICING.proMonthlyPriceRMB}<span>/月</span></div>
          <ul className="plan-feats">
            <li>每月 {PRICING.proMonthlyQuota} 次 AI 调用</li>
            <li>GPT-4o + DeepSeek-V3 自动调度</li>
            <li>云端同步与全部导出能力</li>
          </ul>
          <Button variant="accent" onClick={() => go('/subscribe')}>订阅会员</Button>
        </Card>
      </div>
    </section>

    <section className="cta"><div><span className="cta-kicker">START NOW</span><h2>从一句话开始，<br />完成你的第一个包装。</h2></div>
      <Button size="lg" onClick={() => startWizard()}>开始设计 <span aria-hidden>→</span></Button>
    </section>

    <Modal open={!!active} title={active ? `${active.brand} · 设计方向` : ''} onClose={() => setActive(null)} wide>
      {active && <div className="inspire-detail">
        <div className="inspire-visual"><ProductMockup kind={active.kind} palette={active.palette} brand={active.brand} sub={active.sub} /></div>
        <div className="inspire-info">
          <p className="inspire-desc">{active.desc}</p>
          <div className="kv"><span>品类</span><strong>{active.category}</strong></div>
          <div className="kv"><span>风格</span><strong>{active.style}</strong></div>
          <div className="kv"><span>配色</span><strong className="swatches">{[active.palette.bg, active.palette.primary, active.palette.accent].map((c) => <i key={c} style={{ background: c }} />)}</strong></div>
          <div className="kv"><span>结构</span><strong>{active.structure}</strong></div>
          <div className="kv"><span>关键词</span><strong>{active.keywords.join('、')}</strong></div>
          <div className="inspire-note">LunaSol 只提取风格、配色与构图逻辑，生成全新原创方案，不复制第三方品牌作品。</div>
          <Button onClick={() => useInspiration(active)}>使用这个设计方向 <span aria-hidden>→</span></Button>
        </div>
      </div>}
    </Modal>
  </div>;
}
