import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { Button, Card, Empty, Modal, Notice, PageHead, SectionLabel, Tag, Toggle, go, useHash } from '../ui';
import { CATEGORIES, INSPIRATIONS, STRUCTURE_GROUPS, type InspirationItem } from '../data';
import { ProductMockup, DesignView, DielineView } from '../components/visuals';
import { createEmptyBrief } from '../engine/brief';
import { buildDieline, dielineStats, groupName, structDesc, structName, structUse, STRUCTURES, structureById } from '../engine/structure';
import { useLang } from '../i18n';
import { mockupSvg } from '../engine/export';
import type { StructureId } from '../types';
import { downloadBlob, formatDate, svgToDataUrl } from '../engine/utils';
import { useAuth } from '../cloud/auth';
import { useSubscription } from '../cloud/subscription';
import { useCloudSync } from '../cloud/useCloudSync';

const SAMPLE: Record<StructureId, { l: number; w: number; h: number }> = {
  tuck: { l: 200, w: 150, h: 80 }, topBottom: { l: 200, w: 150, h: 80 }, drawer: { l: 200, w: 150, h: 80 },
  mailer: { l: 240, w: 180, h: 60 },
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
    <PageHead kicker="INSPIRATION / 07" title="包装灵感库" desc="看一个方向，而不是抄一个作品。LunaSol 只提取风格、配色与构图逻辑。" />
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
  const { lang, t } = useLang();
  const [group, setGroup] = useState<(typeof STRUCTURE_GROUPS)[number]>('盒类');
  const [advanced, setAdvanced] = useState(s.settings.advancedMode);
  const [detail, setDetail] = useState<StructureId | null>(null);
  const list = STRUCTURES.filter((x) => x.group === group);
  const detailDieline = detail ? buildDieline(detail, SAMPLE[detail]) : null;
  const useStructure = (id: StructureId) => {
    const packType = id === 'pouch' ? 'pouch' : /label/.test(id) ? 'label' : 'box';
    update({ brief: { ...createEmptyBrief(), packType, structure: id, size: SAMPLE[id] }, chat: [], schemes: [], design: null, report: null, activeId: null });
    setToast(t(`已选择「${structName(structureById(id), lang)}」，接下来只需描述需求`, `Selected “${structName(structureById(id), lang)}” — next just describe what you need`)); go('/create');
  };
  return <div className="page">
    <PageHead kicker="STRUCTURE LIBRARY / 08" title={t('包装结构库', 'Structure library')} desc={t('普通用户看实物效果与适用场景；有经验的用户可以查看结构参数与刀模。', 'Most people just need the look and the use case; experienced users can inspect parameters and dielines.')}
      right={<Toggle checked={advanced} onChange={setAdvanced} label={t('显示结构参数', 'Show parameters')} />} />
    <div className="chips">{STRUCTURE_GROUPS.map((g) => <button key={g} className={`chip ${group === g ? 'active' : ''}`} onClick={() => setGroup(g)}>{groupName(g, lang)}</button>)}</div>
    <div className="structure-grid">{list.map((st) => {
      const d = buildDieline(st.id, SAMPLE[st.id]);
      const stats = dielineStats(d);
      return <Card key={st.id} className="structure-card">
        <div className="structure-visual"><DielineView sheet={d.sheets[0]} dieline={d} showArtwork={false} /></div>
        <div className="structure-info"><span className="structure-group">{groupName(st.group, lang)}</span><h3>{structName(st, lang)}</h3><p>{structDesc(st, lang)}</p>
          <div className="structure-use">{t('适用：', 'Best for: ')}{structUse(st, lang)}</div>
          {advanced && <div className="structure-tech">
            <div><span>{t('展开图', 'Sheets')}</span><strong>{t(`${d.sheets.length} 张`, `${d.sheets.length}`)}</strong></div>
            <div><span>{t('展开尺寸', 'Flat size')}</span><strong>{d.sheets[0].width} × {d.sheets[0].height} mm</strong></div>
            <div><span>{t('裁切线', 'Cut lines')}</span><strong>{t(`${stats.cut} 段`, `${stats.cut}`)}</strong></div>
            <div><span>{t('压痕线', 'Crease lines')}</span><strong>{t(`${stats.crease} 段`, `${stats.crease}`)}</strong></div>
            <div><span>{t('出血 / 安全区', 'Bleed / safe area')}</span><strong>{d.bleed} / {d.safe} mm</strong></div>
            <div><span>{t('生产难度', 'Production difficulty')}</span><strong>{'●'.repeat(st.difficulty)}{'○'.repeat(3 - st.difficulty)}</strong></div>
          </div>}
          <div className="structure-actions"><Button size="sm" onClick={() => useStructure(st.id)}>{t('用这个结构创作', 'Design with this structure')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDetail(st.id)}>{t('查看刀模 ↗', 'View dieline ↗')}</Button></div>
        </div>
      </Card>;
    })}</div>
    <Notice tone="info">{t('第一版已实现插舌盒、天地盖、抽屉盒、自立袋、矩形与圆形标签的真实几何展开；其余品类会按同一结构引擎逐步扩充，不会只放一个视觉模板。', 'This first release covers real geometric dielines for tuck-end cartons, two-piece lid and base boxes, drawer boxes, stand-up pouches and rectangular or round labels. More categories will extend the same structure engine — never a visual-only template.')}</Notice>
    <Modal open={!!detail} title={detail ? t(`${structName(structureById(detail), lang)} · 真实展开刀模`, `${structName(structureById(detail), lang)} · Real dieline`) : ''} onClose={() => setDetail(null)} wide>
      {detailDieline && <><div className="dieline-modal-grid">{detailDieline.sheets.map((sh) => <div key={sh.id}><div className="dieline-cap">{sh.name} · {sh.width} × {sh.height} mm</div><DielineView sheet={sh} dieline={detailDieline} showArtwork={false} /></div>)}</div>
        <div className="legend"><span><i className="lg-cut" />{t('裁切线', 'Cut lines')}</span><span><i className="lg-crease" />{t('压痕线', 'Crease lines')}</span><span><i className="lg-bleed" />{t('出血线', 'Bleed')}</span><span><i className="lg-safe" />{t('安全区', 'Safe area')}</span></div>
        <p className="modal-p">{t('裁切线 = 面片并集的外露边，压痕线 = 相邻面片公共边，全部由几何计算得出。', 'Cut lines are the exposed edges of the panel union, crease lines the shared edges of adjacent panels — all derived geometrically.')}</p></>}
    </Modal>
  </div>;
}

/* ============================ 9. 我的工作台 ============================ */
export function Projects() {
  const { s, newProject, loadProject, deleteProject, duplicateProject, setToast } = useApp();
  const [confirm, setConfirm] = useState<string | null>(null);
  const auth = useAuth();
  const sync = useCloudSync();
  const [syncing, setSyncing] = useState<string | null>(null);
  return <div className="page">
    <PageHead kicker="MY WORKSPACE / 09" title="我的工作台" desc={auth.user
      ? `已登录 ${auth.user.label}：项目自动保存到本机，并同步到你的云端空间（${sync.message}）。`
      : `项目保存在本机浏览器（${s.storage}），自动保存，可随时恢复历史版本。登录后可同步到云端。`}
      right={<div className="head-actions">
        <Button variant="outline" onClick={() => { if (!auth.user) { setToast('请先在右上角登录，再同步到云端'); go('/account'); return; } void sync.syncNow(); }}>
          {auth.user ? '同步到云端' : '登录后云同步'}
        </Button>
        <Button onClick={() => { newProject(); go('/wizard'); }}>＋ 新建项目</Button>
      </div>} />
    {s.projects.length === 0 ? <Empty title="还没有作品" desc="用九步向导整理尺寸、风格与文案，创建你的第一个包装项目。" action={<Button onClick={() => { newProject(); go('/wizard'); }}>开始九步设计</Button>} /> :
      <div className="project-grid">{s.projects.map((p) => <Card key={p.id} className="project-card">
        <button className="project-thumb" onClick={() => { loadProject(p.id); go('/project/' + p.id); }}>
          {p.design?.faces.front ? <DesignView face={p.design.faces.front} /> : <div className="project-blank">LunaSol</div>}
        </button>
        <div className="project-info"><div className="project-status"><Tag tone={p.status === 'exported' ? 'green' : p.status === 'checked' ? 'amber' : 'plain'}>{{ draft: '草稿', designing: '设计中', checked: '已检查', exported: '已导出' }[p.status]}</Tag>
          {auth.user && sync.ownerOf(p.id) && sync.ownerOf(p.id) !== auth.user.id && <Tag tone="amber">其他账号</Tag>}
          <span>{formatDate(p.updatedAt)}</span></div>
          <h3>{p.name}</h3><p>{structureById(p.structure).name} · {p.brief.size.l} × {p.brief.size.w} × {p.brief.size.h} mm</p>
          <div className="project-actions"><Button size="sm" onClick={() => { loadProject(p.id); go(p.design ? '/editor' : '/create'); }}>打开</Button>
            <Button size="sm" variant="ghost" onClick={() => { loadProject(p.id); go('/project/' + p.id); }}>详情</Button>
            {auth.user && <Button size="sm" variant="ghost" disabled={syncing === p.id} onClick={async () => {
              setSyncing(p.id);
              const ok = await sync.pushOne(p.id);
              setSyncing(null);
              setToast(ok ? `「${p.name}」已同步到云端` : '同步失败，请查看账户页的提示');
            }}>{syncing === p.id ? '同步中…' : '存云端'}</Button>}
            <Button size="sm" variant="ghost" onClick={() => { duplicateProject(p.id); setToast('已复制项目'); }}>复制</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(p.id)}>删除</Button></div>
        </div>
      </Card>)}</div>}
    <Modal open={!!confirm} title="删除项目" onClose={() => setConfirm(null)}>
      <p className="modal-p">删除后该项目的设计稿与历史版本将从本机浏览器移除，无法恢复。云端副本需要到「账户」页删除。</p>
      <div className="modal-buttons"><Button variant="outline" onClick={() => setConfirm(null)}>取消</Button>
        <Button onClick={() => { if (confirm) deleteProject(confirm); setConfirm(null); setToast('项目已删除'); }}>确认删除</Button></div>
    </Modal>
  </div>;
}

/* ============================ 10. 项目详情 ============================ */
export function ProjectDetail() {
  const hash = useHash();
  const { lang, t } = useLang();
  const id = hash.split('/')[2];
  const { s, loadProject, restoreVersion, duplicateProject, deleteProject, setToast } = useApp();
  const { isPro } = useSubscription();
  const p = s.projects.find((x) => x.id === id);
  const [confirm, setConfirm] = useState(false);
  if (!p) return <div className="page page-narrow"><Empty title={t('找不到这个项目', 'Project not found')} desc={t('它可能已被删除，或保存在另一台设备的浏览器里。', 'It may have been deleted, or it lives in another device\'s browser.')} action={<Button onClick={() => go('/projects')}>{t('返回我的工作台', 'Back to workspace')}</Button>} /></div>;

  const downloadJson = () => downloadBlob(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), `${p.name}.json`);
  const shareHtml = () => {
    const svg = p.design ? mockupSvg(p.design) : '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="680"><rect width="900" height="680" fill="#f7f6f2"/></svg>';
    const html = `<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><title>${p.name} · LunaSol ${t('预览', 'preview')}</title><style>body{margin:0;background:#f7f6f2;font-family:-apple-system,"PingFang SC",sans-serif;color:#1d1d1b;display:flex;align-items:center;justify-content:center;min-height:100vh}main{text-align:center;padding:40px}img{max-width:min(86vw,760px);box-shadow:0 24px 60px #00000014}h1{font-weight:400;font-size:26px;letter-spacing:2px}p{color:#7d7a72;font-size:13px}</style></head><body><main><img src="${p.design ? svgToDataUrl(svg) : ''}" alt="${t('包装效果图', 'Package mockup')}"><h1>${p.name}</h1><p>${p.brief.size.l} × ${p.brief.size.w} × ${p.brief.size.h} mm · ${structName(structureById(p.structure), lang)} · LunaSol AI Packaging Studio</p></main></body></html>`;
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${p.name}${t('-分享预览', '-preview')}.html`);
    setToast(t('已生成可离线打开的分享预览页', 'Shareable preview page generated — it opens offline'));
  };
  return <div className="page page-narrow">
    <PageHead kicker="PROJECT / 10" title={p.name} desc={t(`创建于 ${formatDate(p.createdAt)} · 最后修改 ${formatDate(p.updatedAt)}`, `Created ${formatDate(p.createdAt)} · last modified ${formatDate(p.updatedAt)}`)}
      right={<div className="head-actions"><Button variant="outline" onClick={() => { loadProject(p.id); go(p.design ? '/editor' : '/create'); }}>{t('继续编辑', 'Keep editing')}</Button>
        <Button onClick={() => { loadProject(p.id); go('/export'); }}>{t('导出文件', 'Export files')} <span aria-hidden>→</span></Button></div>} />
    <div className="detail-grid">
      <Card className="pad-card"><div className="project-hero">{p.design?.faces.front ? <DesignView face={p.design.faces.front} /> : <div className="project-blank">LunaSol</div>}</div></Card>
      <Card className="pad-card"><SectionLabel en="PROJECT DATA">{t('项目信息', 'Project data')}</SectionLabel>
        {([
          [t('包装类型', 'Structure'), structName(structureById(p.structure), lang)],
          [t('成品尺寸', 'Finished size'), `${p.brief.size.l} × ${p.brief.size.w} × ${p.brief.size.h} mm`],
          [t('产品 / 品牌', 'Product / brand'), `${p.brief.product || '—'} / ${p.brief.brand || '—'}`],
          [t('设计风格', 'Style'), p.brief.style || '—'],
          [t('配色', 'Colours'), p.brief.colors.join(' / ') || '—'],
          [t('当前方案', 'Current option'), p.design
            ? ({ minimal: t('高级极简', 'Refined minimal'), illustration: t('创意插画', 'Creative illustration'), commercial: t('品牌商业', 'Brand commercial') } as const)[p.design.scheme]
            : '—'],
          [t('历史版本', 'Versions'), t(`${p.versions.length} 个`, `${p.versions.length}`)],
          [t('检查状态', 'Prepress'), p.status === 'checked' || p.status === 'exported' ? t('已进行印前检查', 'Prepress checked') : t('尚未检查', 'Not checked')],
        ] as [string, string][]).map(([k, v]) => <div className="kv" key={k}><span>{k}</span><strong>{v}</strong></div>)}
        <div className="detail-actions"><Button size="sm" variant="outline" onClick={shareHtml}>{t('分享预览页', 'Share preview page')}</Button>
          <Button size="sm" variant="outline" onClick={downloadJson}>{t('下载项目 JSON', 'Download project JSON')}</Button>
          <Button size="sm" variant="ghost" onClick={() => { duplicateProject(p.id); setToast(t('已复制项目', 'Project duplicated')); }}>{t('复制项目', 'Duplicate project')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>{t('删除', 'Delete')}</Button></div>
      </Card>
    </div>
    <Card className="pad-card versions-card"><SectionLabel en="VERSION HISTORY">{t('历史版本', 'Version history')}</SectionLabel>
      {p.versions.length === 0 ? <p className="muted">{t('编辑设计后会自动生成版本。', 'Versions are created automatically as you edit.')}</p> :
        <>
          <div className="version-table">{[...p.versions].slice(isPro ? -p.versions.length : -3).reverse().map((v) => <div key={v.id}><span>{v.label}</span><em>{formatDate(v.at)}</em>
            <Button size="sm" variant="ghost" onClick={() => { loadProject(p.id); restoreVersion(v.id); setToast(t('已恢复该版本', 'Version restored')); }}>{t('恢复', 'Restore')}</Button></div>)}</div>
          {!isPro && p.versions.length > 3 && <p className="muted">
            {t(`免费版可恢复最近 3 个版本；开通会员后可恢复全部 ${p.versions.length} 个（旧版本不会被删除，续期后即可看到）。`, `The free plan restores the 3 most recent versions; with a membership you can restore all ${p.versions.length} (older versions are kept, so they appear once you subscribe).`)}<Button size="sm" variant="ghost" onClick={() => go('/subscribe')}>{t('开通会员 →', 'Become a member →')}</Button>
          </p>}
        </>}
    </Card>
    <Modal open={confirm} title={t('删除项目', 'Delete project')} onClose={() => setConfirm(false)}><p className="modal-p">{t('该操作不可撤销。', 'This cannot be undone.')}</p>
      <div className="modal-buttons"><Button variant="outline" onClick={() => setConfirm(false)}>{t('取消', 'Cancel')}</Button>
        <Button onClick={() => { deleteProject(p.id); setConfirm(false); go('/projects'); setToast(t('项目已删除', 'Project deleted')); }}>{t('确认删除', 'Delete')}</Button></div></Modal>
  </div>;
}
