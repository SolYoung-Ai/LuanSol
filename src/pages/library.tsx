import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { Button, Card, Empty, Modal, Notice, PageHead, SectionLabel, Tag, Toggle, go, useHash } from '../ui';
import { CATEGORIES, INSPIRATIONS, STRUCTURE_GROUPS, type InspirationItem } from '../data';
import { ProductMockup, DesignView, DielineView } from '../components/visuals';
import { createEmptyBrief } from '../engine/brief';
import { buildDieline, dielineStats, STRUCTURES, structureById } from '../engine/structure';
import { mockupSvg } from '../engine/export';
import type { StructureId } from '../types';
import { downloadBlob, formatDate, svgToDataUrl } from '../engine/utils';
import { DoodleStar, DoodleBox, DoodleOpenBox, DoodleFlower } from '../components/doodle';

const SAMPLE: Record<StructureId, { l: number; w: number; h: number }> = {
  tuck: { l: 200, w: 150, h: 80 }, topBottom: { l: 200, w: 150, h: 80 }, drawer: { l: 200, w: 150, h: 80 },
  pouch: { l: 140, w: 60, h: 220 }, labelRect: { l: 90, w: 120, h: 0 }, labelRound: { l: 90, w: 90, h: 0 },
};

/* ============================ 7. 包装灵感库 ============================ */
export function Inspiration() {
  const { update, setToast } = useApp();
  const [cat, setCat] = useState('全部');
  const [item, setItem] = useState<InspirationItem | null>(null);
  const list = cat === '全部' ? INSPIRATIONS : INSPIRATIONS.filter((i) => i.category === cat);
  const useStyle = (x: InspirationItem) => {
    const packType = x.structure === 'pouch' ? 'pouch' : /label/.test(x.structure) ? 'label' : 'box';
    update({
      brief: { ...createEmptyBrief(), packType, size: SAMPLE[x.structure], structure: x.structure, product: x.category, style: x.style, colors: [x.palette.bg, x.palette.primary, x.palette.accent], motif: x.keywords.find((k) => /山水|植物|几何/.test(k)) || '', brand: '' },
      chat: [], schemes: [], design: null, report: null, activeId: null,
    });
    setToast(`已提取「${x.style}」设计方向`);
    setItem(null); go('/create');
  };
  return <div className="page">
    <PageHead kicker="INSPIRATION / 07" title="包装灵感库" desc="看一个方向，而不是抄一个作品。LunaSol 只提取风格、配色与构图逻辑。" doodle={<DoodleStar className="page-doodle-inline" />} />
    <div className="chips">{CATEGORIES.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
    <div className="inspire-grid">{list.map((x) => <button className="inspire-card" key={x.id} onClick={() => setItem(x)}>
      <ProductMockup kind={x.kind} palette={x.palette} brand={x.brand} sub={x.sub} />
      <div className="inspire-card-meta"><span>{x.category} · {x.style}</span><strong>{x.brand}</strong><em>{x.keywords.slice(0, 3).join(' / ')}</em></div>
    </button>)}</div>
    <Modal open={!!item} title={item ? `${item.brand} · 设计方向` : ''} onClose={() => setItem(null)} wide>
      {item && <div className="inspire-detail">
        <div className="inspire-visual"><ProductMockup kind={item.kind} palette={item.palette} brand={item.brand} sub={item.sub} /></div>
        <div className="inspire-info"><p className="inspire-desc">{item.desc}</p>
          <div className="kv"><span>品类</span><strong>{item.category}</strong></div><div className="kv"><span>风格</span><strong>{item.style}</strong></div>
          <div className="kv"><span>配色</span><strong className="swatches">{[item.palette.bg, item.palette.primary, item.palette.accent].map((c) => <i key={c} style={{ background: c }} />)}</strong></div>
          <div className="kv"><span>结构</span><strong>{structureById(item.structure).name}</strong></div>
          <div className="kv"><span>关键词</span><strong>{item.keywords.join('、')}</strong></div>
          <div className="inspire-note">系统只提取设计方向并生成全新原创方案，不会复制第三方品牌作品。</div>
          <Button onClick={() => useStyle(item)}>使用这个设计方向 <span aria-hidden>→</span></Button>
        </div>
      </div>}
    </Modal>
  </div>;
}

/* ============================ 8. 包装结构库 ============================ */
export function Structures() {
  const { s, update, setToast } = useApp();
  const [group, setGroup] = useState<(typeof STRUCTURE_GROUPS)[number]>('盒类');
  const [advanced, setAdvanced] = useState(s.settings.advancedMode);
  const [detail, setDetail] = useState<StructureId | null>(null);
  const list = STRUCTURES.filter((x) => x.group === group);
  const detailDieline = detail ? buildDieline(detail, SAMPLE[detail]) : null;
  const useStructure = (id: StructureId) => {
    const packType = id === 'pouch' ? 'pouch' : /label/.test(id) ? 'label' : 'box';
    update({ brief: { ...createEmptyBrief(), packType, structure: id, size: SAMPLE[id] }, chat: [], schemes: [], design: null, report: null, activeId: null });
    setToast(`已选择「${structureById(id).name}」，接下来只需描述需求`); go('/create');
  };
  return <div className="page">
    <PageHead kicker="STRUCTURE LIBRARY / 08" title="包装结构库" desc="普通用户看实物效果与适用场景；有经验的用户可以查看结构参数与刀模。"
      right={<Toggle checked={advanced} onChange={setAdvanced} label="显示结构参数" />}
      doodle={<DoodleBox className="page-doodle-inline" />} />
    <div className="chips">{STRUCTURE_GROUPS.map((g) => <button key={g} className={`chip ${group === g ? 'active' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}</div>
    <div className="structure-grid">{list.map((st) => {
      const d = buildDieline(st.id, SAMPLE[st.id]);
      const stats = dielineStats(d);
      return <Card key={st.id} className="structure-card">
        <div className="structure-visual"><DielineView sheet={d.sheets[0]} dieline={d} showArtwork={false} /></div>
        <div className="structure-info"><span className="structure-group">{st.group}</span><h3>{st.name}</h3><p>{st.desc}</p>
          <div className="structure-use">适用：{st.use}</div>
          {advanced && <div className="structure-tech">
            <div><span>展开图</span><strong>{d.sheets.length} 张</strong></div>
            <div><span>展开尺寸</span><strong>{d.sheets[0].width} × {d.sheets[0].height} mm</strong></div>
            <div><span>裁切线</span><strong>{stats.cut} 段</strong></div>
            <div><span>压痕线</span><strong>{stats.crease} 段</strong></div>
            <div><span>出血 / 安全区</span><strong>{d.bleed} / {d.safe} mm</strong></div>
            <div><span>生产难度</span><strong>{'●'.repeat(st.difficulty)}{'○'.repeat(3 - st.difficulty)}</strong></div>
          </div>}
          <div className="structure-actions"><Button size="sm" onClick={() => useStructure(st.id)}>用这个结构创作</Button>
            <Button size="sm" variant="ghost" onClick={() => setDetail(st.id)}>查看刀模 ↗</Button></div>
        </div>
      </Card>;
    })}</div>
    <Notice tone="info">第一版已实现插舌盒、天地盖、抽屉盒、自立袋、矩形与圆形标签的真实几何展开；其余品类会按同一结构引擎逐步扩充，不会只放一个视觉模板。</Notice>
    <Modal open={!!detail} title={detail ? `${structureById(detail).name} · 真实展开刀模` : ''} onClose={() => setDetail(null)} wide>
      {detailDieline && <><div className="dieline-modal-grid">{detailDieline.sheets.map((sh) => <div key={sh.id}><div className="dieline-cap">{sh.name} · {sh.width} × {sh.height} mm</div><DielineView sheet={sh} dieline={detailDieline} showArtwork={false} /></div>)}</div>
        <div className="legend"><span><i className="lg-cut" />裁切线</span><span><i className="lg-crease" />压痕线</span><span><i className="lg-bleed" />出血线</span><span><i className="lg-safe" />安全区</span></div>
        <p className="modal-p">裁切线 = 面片并集的外露边，压痕线 = 相邻面片公共边，全部由几何计算得出。</p></>}
    </Modal>
  </div>;
}

/* ============================ 9. 我的作品 ============================ */
export function Projects() {
  const { s, newProject, loadProject, deleteProject, duplicateProject, setToast } = useApp();
  const [confirm, setConfirm] = useState<string | null>(null);
  return <div className="page">
    <PageHead kicker="MY PROJECTS / 09" title="我的作品" desc={`项目保存在本机浏览器（${s.storage}），自动保存，可随时恢复历史版本。`}
      right={<Button onClick={() => { newProject(); go('/create'); }}>＋ 新建项目</Button>}
      doodle={<DoodleOpenBox className="page-doodle-inline" />} />
    {s.projects.length === 0 ? <Empty title="还没有作品" desc="从一句话开始，创建你的第一个包装项目。" action={<Button onClick={() => { newProject(); go('/create'); }}>开始创作</Button>} /> :
      <div className="project-grid">{s.projects.map((p) => <Card key={p.id} className="project-card">
        <button className="project-thumb" onClick={() => { loadProject(p.id); go('/project/' + p.id); }}>
          {p.design?.faces.front ? <DesignView face={p.design.faces.front} /> : <div className="project-blank">LunaSol</div>}
        </button>
        <div className="project-info"><div className="project-status"><Tag tone={p.status === 'exported' ? 'green' : p.status === 'checked' ? 'amber' : 'plain'}>{{ draft: '草稿', designing: '设计中', checked: '已检查', exported: '已导出' }[p.status]}</Tag><span>{formatDate(p.updatedAt)}</span></div>
          <h3>{p.name}</h3><p>{structureById(p.structure).name} · {p.brief.size.l} × {p.brief.size.w} × {p.brief.size.h} mm</p>
          <div className="project-actions"><Button size="sm" onClick={() => { loadProject(p.id); go(p.design ? '/editor' : '/create'); }}>打开</Button>
            <Button size="sm" variant="ghost" onClick={() => { loadProject(p.id); go('/project/' + p.id); }}>详情</Button>
            <Button size="sm" variant="ghost" onClick={() => { duplicateProject(p.id); setToast('已复制项目'); }}>复制</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(p.id)}>删除</Button></div>
        </div>
      </Card>)}</div>}
    <Modal open={!!confirm} title="删除项目" onClose={() => setConfirm(null)}>
      <p className="modal-p">删除后该项目的设计稿与历史版本将从本机浏览器移除，无法恢复。</p>
      <div className="modal-buttons"><Button variant="outline" onClick={() => setConfirm(null)}>取消</Button>
        <Button onClick={() => { if (confirm) deleteProject(confirm); setConfirm(null); setToast('项目已删除'); }}>确认删除</Button></div>
    </Modal>
  </div>;
}

/* ============================ 10. 项目详情 ============================ */
export function ProjectDetail() {
  const hash = useHash();
  const id = hash.split('/')[2];
  const { s, loadProject, restoreVersion, duplicateProject, deleteProject, setToast } = useApp();
  const p = s.projects.find((x) => x.id === id);
  const [confirm, setConfirm] = useState(false);
  if (!p) return <div className="page page-narrow"><Empty title="找不到这个项目" desc="它可能已被删除，或保存在另一台设备的浏览器里。" action={<Button onClick={() => go('/projects')}>返回我的作品</Button>} /></div>;

  const downloadJson = () => downloadBlob(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), `${p.name}.json`);
  const shareHtml = () => {
    const svg = p.design ? mockupSvg(p.design) : '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="680"><rect width="900" height="680" fill="#f7f6f2"/></svg>';
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${p.name} · LunaSol 预览</title><style>body{margin:0;background:#f7f6f2;font-family:-apple-system,"PingFang SC",sans-serif;color:#1d1d1b;display:flex;align-items:center;justify-content:center;min-height:100vh}main{text-align:center;padding:40px}img{max-width:min(86vw,760px);box-shadow:0 24px 60px #00000014}h1{font-weight:400;font-size:26px;letter-spacing:2px}p{color:#7d7a72;font-size:13px}</style></head><body><main><img src="${p.design ? svgToDataUrl(svg) : ''}" alt="包装效果图"><h1>${p.name}</h1><p>${p.brief.size.l} × ${p.brief.size.w} × ${p.brief.size.h} mm · ${structureById(p.structure).name} · LunaSol AI Packaging Studio</p></main></body></html>`;
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${p.name}-分享预览.html`);
    setToast('已生成可离线打开的分享预览页');
  };
  return <div className="page page-narrow">
    <PageHead kicker="PROJECT / 10" title={p.name} desc={`创建于 ${formatDate(p.createdAt)} · 最后修改 ${formatDate(p.updatedAt)}`}
      right={<div className="head-actions"><Button variant="outline" onClick={() => { loadProject(p.id); go(p.design ? '/editor' : '/create'); }}>继续编辑</Button>
        <Button onClick={() => { loadProject(p.id); go('/export'); }}>导出文件 <span aria-hidden>→</span></Button></div>}
      doodle={<DoodleFlower className="page-doodle-inline" />} />
    <div className="detail-grid">
      <Card className="pad-card"><div className="project-hero">{p.design?.faces.front ? <DesignView face={p.design.faces.front} /> : <div className="project-blank">LunaSol</div>}</div></Card>
      <Card className="pad-card"><SectionLabel en="PROJECT DATA">项目信息</SectionLabel>
        {([['包装类型', structureById(p.structure).name], ['成品尺寸', `${p.brief.size.l} × ${p.brief.size.w} × ${p.brief.size.h} mm`],
        ['产品 / 品牌', `${p.brief.product || '—'} / ${p.brief.brand || '—'}`], ['设计风格', p.brief.style || '—'],
        ['配色', p.brief.colors.join(' / ') || '—'], ['当前方案', p.design ? ({ minimal: '高级极简', illustration: '创意插画', commercial: '品牌商业' } as const)[p.design.scheme] : '—'],
        ['历史版本', `${p.versions.length} 个`], ['检查状态', p.status === 'checked' || p.status === 'exported' ? '已进行印前检查' : '尚未检查']] as [string, string][]).map(([k, v]) => <div className="kv" key={k}><span>{k}</span><strong>{v}</strong></div>)}
        <div className="detail-actions"><Button size="sm" variant="outline" onClick={shareHtml}>分享预览页</Button>
          <Button size="sm" variant="outline" onClick={downloadJson}>下载项目 JSON</Button>
          <Button size="sm" variant="ghost" onClick={() => { duplicateProject(p.id); setToast('已复制项目'); }}>复制项目</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>删除</Button></div>
      </Card>
    </div>
    <Card className="pad-card versions-card"><SectionLabel en="VERSION HISTORY">历史版本</SectionLabel>
      {p.versions.length === 0 ? <p className="muted">编辑设计后会自动生成版本。</p> :
        <div className="version-table">{[...p.versions].reverse().map((v) => <div key={v.id}><span>{v.label}</span><em>{formatDate(v.at)}</em>
          <Button size="sm" variant="ghost" onClick={() => { loadProject(p.id); restoreVersion(v.id); setToast('已恢复该版本'); }}>恢复</Button></div>)}</div>}
    </Card>
    <Modal open={confirm} title="删除项目" onClose={() => setConfirm(false)}><p className="modal-p">该操作不可撤销。</p>
      <div className="modal-buttons"><Button variant="outline" onClick={() => setConfirm(false)}>取消</Button>
        <Button onClick={() => { deleteProject(p.id); setConfirm(false); go('/projects'); setToast('项目已删除'); }}>确认删除</Button></div></Modal>
  </div>;
}
