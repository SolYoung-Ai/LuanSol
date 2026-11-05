import React, { useState } from 'react';
import { CATEGORIES, FLOW_STEPS, INSPIRATIONS, QUICK_START, type InspirationItem } from '../data';
import { ProductMockup } from '../components/visuals';
import { Button, Card, Modal, SectionLabel, go } from '../ui';
import { useApp } from '../store';
import { createEmptyBrief, parseUtterance } from '../engine/brief';
import type { StructureId } from '../types';

const sizeFor: Record<string, { l: number; w: number; h: number }> = {
  box: { l: 200, w: 150, h: 80 }, label: { l: 90, w: 120, h: 0 }, pouch: { l: 140, w: 60, h: 220 }, custom: { l: 200, w: 150, h: 80 },
};

export default function Home() {
  const { update, addChat, setToast } = useApp();
  const [cat, setCat] = useState('全部');
  const [active, setActive] = useState<InspirationItem | null>(null);
  const list = cat === '全部' ? INSPIRATIONS : INSPIRATIONS.filter((i) => i.category === cat);

  const start = (packType: string, extra: Partial<ReturnType<typeof createEmptyBrief>> = {}) => {
    const b = { ...createEmptyBrief(), packType, size: sizeFor[packType] || sizeFor.box, ...extra };
    update({ brief: b, chat: [], schemes: [], design: null, report: null, activeId: null });
    go('/create');
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
    {/* 首屏 */}
    <section className="hero">
      <div className="hero-left">
        <div className="hero-eyebrow">LUNASOL · AI PACKAGING DESIGN STUDIO</div>
        <h1>让包装设计，<br /><em>从想法开始。</em></h1>
        <p className="hero-sub">不需要设计经验。告诉 AI 你想做什么，LunaSol 帮你完成从创意、排版、刀模到印刷文件的全过程。</p>
        <div className="hero-actions">
          <Button size="lg" onClick={() => start('box')}>立即开始创作 <span aria-hidden>↗</span></Button>
          <Button size="lg" variant="outline" onClick={() => go('/inspiration')}>探索包装灵感</Button>
        </div>
        <div className="hero-note">不需要 Photoshop · 不需要懂刀模 · 不需要会排版</div>
      </div>
      <div className="hero-right">
        <div className="hero-mock hero-mock-a"><ProductMockup kind="box" palette={INSPIRATIONS[0].palette} brand="山隐茶集" sub="HIGHLAND OOLONG" /></div>
        <div className="hero-mock hero-mock-b"><ProductMockup kind="pouch" palette={INSPIRATIONS[1].palette} brand="屿光咖啡" sub="ISLAND ROASTERS" /></div>
        <div className="hero-mock hero-mock-c"><ProductMockup kind="bottle" palette={INSPIRATIONS[3].palette} brand="素白研" sub="SOOBAI LAB" /></div>
        <div className="hero-stamp">01 / ORIGINAL WORK</div>
      </div>
    </section>

    {/* 数据条 */}
    <section className="strip"><div className="strip-inner">
      {[['06', '种真实包装结构'], ['03', '套明显不同的方案'], ['3mm', '自动出血处理'], ['300', 'DPI 印刷输出'], ['100%', '文字可编辑图层']].map(([v, l]) =>
        <div className="strip-item" key={l}><strong>{v}</strong><span>{l}</span></div>)}
    </div></section>

    {/* 创作入口 */}
    <section className="section section-pad" id="start">
      <SectionLabel en="WHAT DO YOU WANT TO MAKE">你想制作什么？</SectionLabel>
      <div className="section-head"><h2>从一种包装开始，<br />不用先学设计。</h2><p>选一个最接近的形态，剩下的由 AI 通过对话补齐。</p></div>
      <div className="quick-grid">
        {QUICK_START.map((q, i) => <Card key={q.id} hover className="quick-card" onClick={() => { start(q.id); if (q.id === 'custom') setToast('自定义包装：进入创作中心后可上传参考图，关键尺寸与结构仍需你确认'); }}>
          <div className="quick-top"><span className="quick-index">0{i + 1} / {q.en}</span><span className="quick-arrow">↗</span></div>
          <div className="quick-visual"><ProductMockup kind={q.kind} palette={q.palette} brand="LunaSol" sub={q.en} /></div>
          <h3>{q.title}</h3><p>{q.desc}</p>
        </Card>)}
      </div>
    </section>

    {/* 工作流 */}
    <section className="section section-flow">
      <div className="flow-grid">
        <div className="flow-left">
          <SectionLabel en="HOW IT WORKS">一次完整的包装设计</SectionLabel>
          <h2>输入尺寸 → 描述需求<br />→ AI 设计 → 印刷文件</h2>
          <p>专业的事交给系统：结构计算、文字层级、出血、分辨率、字体、刀模，全部在后台完成。你只需要做选择。</p>
          <Button variant="outline" onClick={() => go('/create')}>看看创作中心 <span aria-hidden>→</span></Button>
        </div>
        <div className="flow-steps">{FLOW_STEPS.map((s, i) => <div className="flow-step" key={s}>
          <span className="flow-num">{String(i + 1).padStart(2, '0')}</span><span className="flow-name">{s}</span><span className="flow-line" />
        </div>)}</div>
      </div>
    </section>

    {/* 灵感库 */}
    <section className="section section-pad" id="inspiration">
      <div className="section-head row"><div><SectionLabel en="GALLERY">灵感展示</SectionLabel><h2>好的包装，先有一个方向。</h2></div>
        <Button variant="ghost" onClick={() => go('/inspiration')}>查看全部灵感 <span aria-hidden>→</span></Button></div>
      <div className="chips">{CATEGORIES.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="gallery">
        {list.slice(0, 6).map((item, i) => <button key={item.id} className={`gallery-item ${i === 0 ? 'gallery-big' : ''}`} onClick={() => setActive(item)}>
          <ProductMockup kind={item.kind} palette={item.palette} brand={item.brand} sub={item.sub} />
          <div className="gallery-meta"><span>{item.category} · {item.style}</span><strong>{item.brand}</strong></div>
        </button>)}
      </div>
    </section>

    {/* 智能体架构 */}
    <section className="section section-pad section-soft">
      <SectionLabel en="BEHIND THE SCENES">不是一个聊天框</SectionLabel>
      <div className="section-head"><h2>八个各司其职的智能体，<br />共享同一份项目数据。</h2><p>不会出现重复提问，也不会让不同环节各说各话。</p></div>
      <div className="agent-grid">
        {[
          ['01', '需求理解', '把自然语言逐步收敛成结构化需求'], ['02', '包装结构', '按尺寸推荐结构并计算真实刀模'],
          ['03', '创意设计', '制定风格、配色与视觉元素方向'], ['04', '文字排版', '规划层级、字号、字距与安全边距'],
          ['05', '设计执行', '生成可编辑图层，而不是一张图片'], ['06', '3D 预览', '把平面稿映射到真实结构模型'],
          ['07', '印前检查', '尺寸、出血、分辨率、字体、颜色'], ['08', '文件输出', '毫米级 PDF / SVG / DXF / 高清图'],
        ].map(([n, t, d]) => <div className="agent" key={n}><span>{n}</span><h4>{t}</h4><p>{d}</p></div>)}
      </div>
    </section>

    {/* CTA */}
    <section className="cta"><div><span className="cta-kicker">START WITH A SENTENCE</span><h2>你只需要说一句话。<br />剩下的，交给 LunaSol。</h2></div>
      <Button size="lg" onClick={() => { start('box'); addChat({ role: 'ai', text: '告诉我，你想做什么包装？', kind: 'question' }); }}>立即开始创作 <span aria-hidden>↗</span></Button>
    </section>

    <Modal open={!!active} title={active ? `${active.brand} · 设计方向` : ''} onClose={() => setActive(null)} wide>
      {active && <div className="inspire-detail">
        <div className="inspire-visual"><ProductMockup kind={active.kind} palette={active.palette} brand={active.brand} sub={active.sub} /></div>
        <div className="inspire-info">
          <p className="inspire-desc">{active.desc}</p>
          <div className="kv"><span>品类</span><strong>{active.category}</strong></div>
          <div className="kv"><span>风格</span><strong>{active.style}</strong></div>
          <div className="kv"><span>配色</span><strong className="swatches">{active.palette.bg && [active.palette.bg, active.palette.primary, active.palette.accent].map((c) => <i key={c} style={{ background: c }} />)}</strong></div>
          <div className="kv"><span>结构</span><strong>{active.structure}</strong></div>
          <div className="kv"><span>关键词</span><strong>{active.keywords.join('、')}</strong></div>
          <div className="inspire-note">LunaSol 只提取风格、配色与构图逻辑，生成全新原创方案，不复制第三方品牌作品。</div>
          <Button onClick={() => useInspiration(active)}>使用这个设计方向 <span aria-hidden>→</span></Button>
        </div>
      </div>}
    </Modal>
  </div>;
}
