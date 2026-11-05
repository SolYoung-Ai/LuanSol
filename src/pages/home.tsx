import React, { useState } from 'react';
import { CATEGORIES, INSPIRATIONS, type InspirationItem } from '../data';
import { ProductMockup } from '../components/visuals';
import { DoodleArrow, DoodleBox, DoodleUnderline } from '../components/doodle';
import { HeroScene, SceneBigBox, SceneIdeas, SceneRun, SceneSketch, SceneStudio } from '../components/scenes';
import { Button, Modal, SectionLabel, go } from '../ui';
import { useApp } from '../store';
import { createEmptyBrief, parseUtterance } from '../engine/brief';
import type { StructureId } from '../types';

const sizeFor: Record<string, { l: number; w: number; h: number }> = {
  box: { l: 200, w: 150, h: 80 }, label: { l: 90, w: 120, h: 0 }, pouch: { l: 140, w: 60, h: 220 }, custom: { l: 200, w: 150, h: 80 },
};

/* 第一屏的包装形态入口（用真实包装作品做视觉主角） */
const WORKS = [
  { kind: 'box' as const, brand: '山隐茶集', sub: 'TEA BOX', palette: { bg: '#f3eee4', primary: '#20463a', accent: '#c8a86b', ink: '#1d1d1b', muted: '#8d8d8a' }, label: '纸盒', note: '茶叶、点心、伴手礼', cls: 'work-card-1' },
  { kind: 'pouch' as const, brand: '屿光咖啡', sub: 'COFFEE POUCH', palette: { bg: '#efe2cd', primary: '#8a5a3b', accent: '#a8352c', ink: '#3b2b20', muted: '#8d8d8a' }, label: '包装袋', note: '咖啡、零食、散装', cls: 'work-card-2' },
  { kind: 'bottle' as const, brand: '素白研', sub: 'BOTTLE', palette: { bg: '#f7f6f2', primary: '#1d1d1b', accent: '#c9c4b8', ink: '#1d1d1b', muted: '#8d8d8a' }, label: '瓶罐', note: '护肤、香氛、清洁', cls: 'work-card-3' },
  { kind: 'label' as const, brand: '见山', sub: 'LABEL', palette: { bg: '#eef1ef', primary: '#22395c', accent: '#c8a86b', ink: '#1b2733', muted: '#8d8d8a' }, label: '标签', note: '瓶贴、罐贴、封口贴', cls: '' },
];

/* 第四屏：四步创作，每一步配一个动作场景 */
const STEPS = [
  { n: '01', t: '描述想法', d: '用一句话说清你要做什么', art: SceneStudio },
  { n: '02', t: 'AI 生成', d: '自动整理需求，给出三套方向', art: SceneBigBox },
  { n: '03', t: '调整设计', d: '对话式改稿，随时看 3D 效果', art: SceneSketch },
  { n: '04', t: '下载文件', d: '拿到可印刷的 PDF / SVG / DXF', art: SceneRun },
];

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
    {/* ---------- 第一屏：品牌主视觉 ----------
        整幅手绘场景铺满首屏，标题浮在左上的留白里，
        文字与插画通过手写批注和箭头产生空间互动，而不是左右两栏。 */}
    <section className="hero">
      <div className="hero-stage">
        <div className="hero-scene"><HeroScene /></div>
        <div className="hero-annot hero-annot-1">一张纸就能开始</div>
        <div className="hero-annot-arrow hero-annot-arrow-1"><DoodleArrow /></div>
        <div className="hero-annot hero-annot-2">真的能印出来</div>
        <div className="hero-annot-arrow hero-annot-arrow-2"><DoodleArrow flip /></div>
      </div>
      <div className="hero-copy">
        <div className="hero-eyebrow">LUNASOL · AI PACKAGING DESIGN STUDIO</div>
        <div className="hero-en en-hand">Make something your own.</div>
        <h1>把想法，<br />变成包装。</h1>
        <div className="hero-underline"><DoodleUnderline /></div>
        <p className="hero-sub">告诉 AI 你想做什么，<br />创意、排版、刀模到可印刷文件，全程帮你完成。</p>
        <div className="hero-actions">
          <Button size="lg" onClick={() => start('box')}>开始创作 <span aria-hidden>↗</span></Button>
          <Button size="lg" variant="outline" onClick={() => go('/inspiration')}>探索灵感</Button>
        </div>
      </div>
    </section>

    {/* ---------- 第二屏：我们是谁 ---------- */}
    <section className="section section-pad">
      <div className="whoare-grid">
        <div className="whoare-text">
          <SectionLabel en="WHO WE ARE">我们是谁？</SectionLabel>
          <h2 className="display">好设计，<br />本来就不该有门槛。</h2>
          <p>我们相信，每个人都可以把自己的想法变成一个真正的包装作品。你不需要会排版、不需要懂刀模、也不需要学 Photoshop——只要说出来，剩下的交给 LunaSol。</p>
          <Button variant="outline" onClick={() => go('/create')}>开始你的第一份设计 <span aria-hidden>→</span></Button>
        </div>
        <div className="whoare-art">
          <SceneIdeas />
          <div className="whoare-tag">打开就有惊喜</div>
        </div>
      </div>
    </section>

    {/* ---------- 第三屏：你想做什么（真实包装作品） ---------- */}
    <section className="section section-pad section-soft">
      <div className="section-head">
        <SectionLabel en="WHAT DO YOU WANT TO MAKE">你想做什么？</SectionLabel>
        <h2 className="display">五种包装形态，<br />挑一个最近的就行。</h2>
        <p>选错也没关系——创作过程中随时可以改尺寸、换结构。</p>
      </div>
      <div className="works-grid">
        {WORKS.map((w, i) => (
          <button key={w.brand} className={`work-card ${w.cls}`} onClick={() => start(['box', 'pouch', 'box', 'label'][i])}>
            <div className="work-shot">
              <ProductMockup kind={w.kind} palette={w.palette} brand={w.brand} sub={w.sub} />
            </div>
            <div className="work-cap"><strong>{w.label}</strong><span>{w.note}</span></div>
            {i === 0 && <div className="work-handlabel work-handlabel-1">留白多一点</div>}
            {i === 1 && <div className="work-handlabel work-handlabel-2">牛皮纸质感</div>}
          </button>
        ))}
      </div>
      <div className="section-head row" style={{ marginTop: 56 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <DoodleBox className="quick-doodle" />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>也可以上传现有包装照片，由 AI 反推结构与尺寸</span>
        </div>
        <Button variant="ghost" onClick={() => start('custom')}>自定义包装 <span aria-hidden>→</span></Button>
      </div>
    </section>

    {/* ---------- 第四屏：创作真的很简单 ---------- */}
    <section className="section section-pad steps-section">
      <div className="section-head">
        <SectionLabel en="HOW IT WORKS">创作真的很简单</SectionLabel>
        <h2 className="display">把复杂的事，交给 AI。</h2>
        <p>你只负责说清楚想要什么，剩下的四步自动完成。</p>
      </div>
      <div className="steps-track">
        {/* 贯穿四步的手绘连续路径 */}
        <div className="steps-path" aria-hidden>
          <svg viewBox="0 0 1200 90" preserveAspectRatio="none">
            <path d="M40 58 C170 22 250 66 360 44 C470 22 540 62 660 40 C780 18 860 58 980 36 C1060 22 1120 44 1160 34"
              fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d="M1128 22 L1160 34 L1136 52" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="steps-grid">
          {STEPS.map((s) => {
            const Art = s.art;
            return <div className="step-card" key={s.n}>
              <div className="step-art"><Art /></div>
              <div className="step-num">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>;
          })}
        </div>
      </div>
    </section>

    {/* ---------- 第五屏：设计灵感 ---------- */}
    <section className="section section-pad section-soft">
      <div className="section-head row">
        <div>
          <SectionLabel en="INSPIRATION">设计灵感</SectionLabel>
          <h2 className="display">好的包装，<br />先有一个方向。</h2>
        </div>
        <Button variant="ghost" onClick={() => go('/inspiration')}>查看全部灵感 <span aria-hidden>→</span></Button>
      </div>
      <div className="chips">{CATEGORIES.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="magazine">
        {list.slice(0, 4).map((item, i) => (
          <button key={item.id} className={`mag-item mag-${['a', 'b', 'c', 'd'][i]}`} onClick={() => setActive(item)}>
            <ProductMockup kind={item.kind} palette={item.palette} brand={item.brand} sub={item.sub} />
            <div className="mag-cap"><strong>{item.brand}</strong><span>{item.category} · {item.style}</span></div>
            {i === 0 && <div className="mag-hand mag-hand-1">深绿 + 米白</div>}
            {i === 1 && <div className="mag-hand mag-hand-2">牛皮纸底</div>}
            {i === 2 && <div className="mag-hand mag-hand-3">一个强视觉中心就够</div>}
          </button>
        ))}
      </div>
    </section>

    {/* ---------- 第六屏：结束画面 ---------- */}
    <section className="cta">
      <div className="cta-text">
        <span className="cta-kicker">START WITH A SENTENCE</span>
        <h2 className="display">你的下一个创意，<br />从这里开始。</h2>
        <div style={{ marginTop: 30, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Button size="lg" onClick={() => { start('box'); addChat({ role: 'ai', text: '告诉我，你想做什么包装？', kind: 'question' }); }}>开始创作 <span aria-hidden>↗</span></Button>
          <Button size="lg" variant="outline" onClick={() => go('/structures')}>看看包装结构</Button>
        </div>
      </div>
      <div className="cta-art"><SceneRun /></div>
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
