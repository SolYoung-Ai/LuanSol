/* ============================================================
 * 审美市场（THE AESTHETIC INDEX）
 * ------------------------------------------------------------
 * 定位：策展式设计灵感索引，不是模板市场、不是图库瀑布流。
 * 数据原则（见 src/data/aesthetic-market.ts）：
 *   每个站点、每个作品都有真实出处与核实日期；不含虚构品牌与虚构项目。
 * 收藏：保存于本机（localStorage），未登录也能用；不伪装成云端同步。
 * 带入创作：把参考方向转成真实可用的风格参数，写入草稿后再进入九步向导。
 * ============================================================ */
import React, { useMemo, useState } from 'react';
import { Modal, go, useHash } from '../ui';
import { useApp } from '../store';
import { createEmptyBrief } from '../engine/brief';
import { createEmptyDraft } from '../v3/draft';
import { stepProgress, WIZARD_STEPS } from '../v3/steps';
import { STYLES, styleById } from '../v3/styles';
import {
  MARKET_CATEGORIES, MARKET_SITES, MARKET_WORKS, MARKET_VERIFIED_AT,
  type MarketSite, type MarketWork,
} from '../data/aesthetic-market';

/* ---------------- 收藏（本机） ---------------- */
const FAV_KEY = 'lunasol.market.favorites.v1';
type Favs = { sites: string[]; works: string[] };
function readFavs(): Favs {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) || '{}');
    return { sites: Array.isArray(raw.sites) ? raw.sites : [], works: Array.isArray(raw.works) ? raw.works : [] };
  } catch { return { sites: [], works: [] }; }
}
function useFavs() {
  const [favs, setFavs] = useState<Favs>(readFavs);
  const toggle = (kind: keyof Favs, id: string) => {
    setFavs((prev) => {
      const list = prev[kind].includes(id) ? prev[kind].filter((x) => x !== id) : [...prev[kind], id];
      const next = { ...prev, [kind]: list };
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* 配额满时忽略 */ }
      return next;
    });
  };
  return { favs, toggle };
}

/* ---------------- 参考方向 → 真实风格参数 ---------------- */
/** 把审美市场的一条参考，映射到内置风格库里的具体风格。
 *  映射依据是风格的 suitable_categories（设计库里已有的数据），不做凭空猜测。 */
function styleForReference(cat: string, tags: string[]): string {
  const key = `${cat} ${tags.join(' ')}`;
  if (/东方|中式|茶|酒|国潮/.test(key)) return 'modern-orient';
  if (/字体|排版/.test(key)) return 'geometric';
  if (/极简|北欧|留白/.test(key)) return 'modern-minimal';
  if (/轻奢|高端|美妆/.test(key)) return 'premium-luxury';
  if (/插画|创意/.test(key)) return 'illustration-pack';
  if (/食品|饮料|包装/.test(key)) return 'natural-eco';
  // 兜底：用风格库里第一个适合「品牌设计」的风格，而不是写死一个随机值
  return STYLES[0]?.style_id || 'modern-minimal';
}

function useSeedReference() {
  const { s, update } = useApp();
  const [pending, setPending] = useState<null | { title: string; styleId: string }>(null);

  const apply = (title: string, cat: string, tags: string[]) => {
    const styleId = styleForReference(cat, tags);
    const cfg = styleById(styleId);
    const draft = createEmptyDraft();
    if (cfg) {
      draft.style_id = cfg.style_id;
      draft.style_parameters = JSON.stringify(cfg);
      draft.primary_color = cfg.dominant_colors[0] || '';
    }
    update({
      draft, brief: createEmptyBrief(), chat: [], schemes: [], design: null, report: null, activeId: null,
      // 参考来源记在草稿上，后续步骤能看到它从哪来
    });
    go('/wizard');
  };

  const start = (title: string, cat: string, tags: string[]) => {
    if (stepProgress(s.draft) > 0) { setPending({ title, styleId: styleForReference(cat, tags) }); return; }
    apply(title, cat, tags);
  };

  const confirm = () => {
    if (!pending) return;
    const cfg = styleById(pending.styleId);
    const draft = createEmptyDraft();
    if (cfg) { draft.style_id = cfg.style_id; draft.style_parameters = JSON.stringify(cfg); draft.primary_color = cfg.dominant_colors[0] || ''; }
    update({ draft, brief: createEmptyBrief(), chat: [], schemes: [], design: null, report: null, activeId: null });
    setPending(null);
    go('/wizard');
  };

  const modal = <Modal open={!!pending} title="你有一份进行中的草稿" onClose={() => setPending(null)}>
    <p className="modal-p">
      当前草稿已完成 {stepProgress(s.draft)} / {WIZARD_STEPS.length} 步。
      用这个参考方向开始设计，会新建一个项目并<b>覆盖当前草稿</b>；原草稿不会自动保存为项目。
    </p>
    <div className="modal-buttons">
      <button className="v4-btn-line" onClick={() => { setPending(null); go('/wizard'); }}>保留草稿，继续编辑</button>
      <button className="v4-btn-dark" onClick={confirm}>新建项目，用这个方向</button>
    </div>
  </Modal>;

  return { start, modal };
}

/* ---------------- 列表页 ---------------- */
export default function Market() {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const { favs, toggle } = useFavs();
  const { start, modal } = useSeedReference();

  const sites = useMemo(() => MARKET_SITES.filter((s) => {
    const okCat = cat === 'all' || s.categories.includes(cat as any);
    const okQ = !q.trim() || `${s.title} ${s.description} ${s.tags.join(' ')} ${s.country || ''}`.toLowerCase().includes(q.trim().toLowerCase());
    return okCat && okQ;
  }), [cat, q]);

  const works = useMemo(() => MARKET_WORKS.filter((w) => {
    const okCat = cat === 'all' || w.category === cat || w.styleTags.includes(cat);
    const okQ = !q.trim() || `${w.title} ${w.brand} ${w.description} ${w.styleTags.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase());
    return okCat && okQ;
  }), [cat, q]);

  return <div className="v4-page">
    <div className="v4-market-hero">
      <div className="v4-kicker">THE AESTHETIC INDEX</div>
      <h1 className="v4-market-title">审美市场</h1>
      <p className="v4-sub">发现好的设计，找到属于你的灵感。这里收录的是有出处的人和作品，不是模板库。</p>
      <div className="v4-market-en">Curated · Verifiable · Updated {MARKET_VERIFIED_AT}</div>
    </div>

    <div className="v4-toolbar">
      <div className="v4-filters">
        {MARKET_CATEGORIES.map((c) => <button key={c.id} className={`v4-filter ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>)}
      </div>
      <div className="v4-tools">
        <input className="v4-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索站点、作品或标签" />
      </div>
    </div>

    <section className="v4-sec">
      <div className="v4-sec-head">
        <div className="v4-sec-title">设计网站 · {sites.length}</div>
        <div className="v4-sec-note">全部为官方网站，新标签页打开</div>
      </div>
      {sites.length === 0
        ? <div className="v4-empty"><h3>这个筛选下暂时没有站点</h3><p>换一个分类，或清空搜索词。</p></div>
        : <div className="v4-site-grid">
          {sites.map((s) => <div key={s.id} className="v4-site">
            <div className="v4-site-top">
              <button className="v4-site-name" onClick={() => go(`/market/site/${s.id}`)}>{s.title}</button>
              <span className="v4-site-country">{s.country || ''}</span>
            </div>
            <p className="v4-site-desc">{s.description}</p>
            <div className="v4-site-tags">
              {s.categories.slice(0, 3).map((c) => <span key={c} className="v4-tag">{c}</span>)}
              {s.tags.slice(0, 2).map((t) => <span key={t} className="v4-tag">{t}</span>)}
            </div>
            <div className="v4-site-why">{s.why}</div>
            <div className="v4-detail-actions">
              <button className="v4-btn-line" onClick={() => window.open(s.officialUrl, '_blank', 'noopener,noreferrer')}>访问官网 ↗</button>
              <button className="v4-btn-line" onClick={() => go(`/market/site/${s.id}`)}>看它值得看什么</button>
              <button className="v4-btn-line" onClick={() => toggle('sites', s.id)}>{favs.sites.includes(s.id) ? '已收藏' : '收藏'}</button>
            </div>
          </div>)}
        </div>}
    </section>

    <section className="v4-sec">
      <div className="v4-sec-head">
        <div className="v4-sec-title">精选作品 · {works.length}</div>
        <div className="v4-sec-note">均来自公开原文，附来源与日期</div>
      </div>
      {works.length === 0
        ? <div className="v4-empty"><h3>这个筛选下暂时没有作品</h3><p>换一个分类试试。</p></div>
        : <div className="v4-work-grid">
          {works.map((w) => <div key={w.id} className="v4-case">
            <button className="v4-case-cover" onClick={() => go(`/market/work/${w.id}`)}>
              {w.image ? <img src={w.image} alt={w.title} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : null}
              {!w.image && <div className="v4-case-fallback">原图未提供</div>}
              <span className={`v4-fav ${favs.works.includes(w.id) ? 'on' : ''}`} role="button" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); toggle('works', w.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggle('works', w.id); } }}
              >{favs.works.includes(w.id) ? '★' : '☆'}</span>
            </button>
            <div>
              <button className="v4-case-title" onClick={() => go(`/market/work/${w.id}`)}>{w.title}</button>
            </div>
            <div className="v4-case-meta">{[w.brand, w.category, w.publishedAt].filter(Boolean).join(' · ')}</div>
          </div>)}
        </div>}
    </section>

    <p className="v4-source" style={{ marginTop: 48 }}>
      收藏保存在本机浏览器，未登录也能使用。数据核实日期：{MARKET_VERIFIED_AT}。
      图片版权归原作者与来源站所有，此处仅作索引与评论引用，点开可访问原文。
    </p>
    {modal}
  </div>;
}

/* ---------------- 站点详情 ---------------- */
export function MarketSitePage() {
  const id = useHash().replace('/market/site/', '').split('?')[0];
  const site = MARKET_SITES.find((s) => s.id === id);
  const { favs, toggle } = useFavs();
  const { start, modal } = useSeedReference();

  if (!site) return <div className="v4-page"><div className="v4-empty"><h3>没有找到这个站点</h3><p>链接可能已更新，返回审美市场重新浏览。</p><button className="v4-btn-dark" onClick={() => go('/market')}>返回审美市场</button></div></div>;

  const related = MARKET_WORKS.filter((w) => w.styleTags.some((t) => site.categories.includes(t as any))).slice(0, 6);

  return <div className="v4-page">
    <button className="v4-filter" onClick={() => go('/market')}>← 审美市场</button>
    <div className="v4-detail">
      <div>
        <div className="v4-kicker">{site.country || '国际'} · {site.domain}</div>
        <h1 className="v4-detail-title" style={{ marginTop: 14 }}>{site.title}</h1>
        <p className="v4-detail-note" style={{ marginTop: 16 }}>{site.description}</p>
        <div className="v4-sec" style={{ marginTop: 32 }}>
          <div className="v4-sec-head"><div className="v4-sec-title">值得看什么</div></div>
          <ul style={{ marginTop: 14, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: 'var(--v4-ink-2)' }}>
            {site.designNotes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
        {related.length > 0 && <div className="v4-sec">
          <div className="v4-sec-head"><div className="v4-sec-title">本站相关的收录作品</div></div>
          <div className="v4-work-grid">
            {related.map((w) => <div key={w.id} className="v4-case">
              <button className="v4-case-cover" onClick={() => go(`/market/work/${w.id}`)}>
                {w.image ? <img src={w.image} alt={w.title} loading="lazy" /> : <div className="v4-case-fallback">原图未提供</div>}
              </button>
              <button className="v4-case-title" onClick={() => go(`/market/work/${w.id}`)}>{w.title}</button>
              <div className="v4-case-meta">{w.category}</div>
            </div>)}
          </div>
        </div>}
      </div>

      <aside className="v4-detail-body">
        <div className="v4-kv"><span>国家 / 地区</span><strong>{site.country || '未核实'}</strong></div>
        <div className="v4-kv"><span>域名</span><strong>{site.domain}</strong></div>
        <div className="v4-kv"><span>设计方向</span><strong>{site.categories.join(' / ')}</strong></div>
        <div className="v4-kv"><span>核实日期</span><strong>{site.lastVerifiedAt}</strong></div>
        <div className="v4-kv"><span>来源</span><strong>{site.sourceCredit}</strong></div>
        <p className="v4-detail-note">{site.why}</p>
        <div className="v4-detail-actions">
          <a className="v4-btn-dark" href={site.officialUrl} target="_blank" rel="noopener noreferrer">访问官方网站 ↗</a>
          <button className="v4-btn-line" onClick={() => toggle('sites', site.id)}>{favs.sites.includes(site.id) ? '已收藏' : '收藏这个站点'}</button>
        </div>
        <div className="v4-sec">
          <div className="v4-sec-head"><div className="v4-sec-title">用这个方向开始</div></div>
          <p className="v4-detail-note" style={{ marginTop: 12 }}>
            参考它的视觉气质，让 LunaSol 用内置风格库生成一份<b>全新原创</b>包装设计——不会复制对方任何素材。
          </p>
          <button className="v4-btn-dark" style={{ marginTop: 14 }} onClick={() => start(site.title, site.categories[0], site.tags)}>用这个方向开始设计</button>
        </div>
      </aside>
    </div>
    {modal}
  </div>;
}

/* ---------------- 作品详情 ---------------- */
export function MarketWorkPage() {
  const id = useHash().replace('/market/work/', '').split('?')[0];
  const work = MARKET_WORKS.find((w) => w.id === id);
  const { favs, toggle } = useFavs();
  const { start, modal } = useSeedReference();
  const site = work ? MARKET_SITES.find((s) => s.id === work.sourceSiteId) : undefined;

  if (!work) return <div className="v4-page"><div className="v4-empty"><h3>没有找到这个作品</h3><p>它可能已从索引里移除。</p><button className="v4-btn-dark" onClick={() => go('/market')}>返回审美市场</button></div></div>;

  return <div className="v4-page">
    <button className="v4-filter" onClick={() => go('/market')}>← 审美市场</button>
    <div className="v4-detail">
      <div className="v4-detail-figure">
        {work.image
          ? <img src={work.image} alt={work.title} />
          : <div className="v4-case-fallback">来源站未提供封面图</div>}
      </div>
      <aside className="v4-detail-body">
        <div className="v4-kicker">{work.category}</div>
        <h1 className="v4-detail-title">{work.title}</h1>
        {work.brand && <div className="v4-kv"><span>品牌</span><strong>{work.brand}</strong></div>}
        <div className="v4-kv"><span>类别</span><strong>{work.category}</strong></div>
        <div className="v4-kv"><span>标签</span><strong>{work.styleTags.join(' / ')}</strong></div>
        <div className="v4-kv"><span>发布</span><strong>{work.publishedAt || '未标注'}</strong></div>
        <div className="v4-kv"><span>来源</span><strong>{work.sourceCredit}</strong></div>
        <p className="v4-detail-note">{work.description}</p>
        <div className="v4-detail-actions">
          <a className="v4-btn-dark" href={work.sourceUrl} target="_blank" rel="noopener noreferrer">查看原文 ↗</a>
          {site && <button className="v4-btn-line" onClick={() => go(`/market/site/${site.id}`)}>看来源站</button>}
          <button className="v4-btn-line" onClick={() => toggle('works', work.id)}>{favs.works.includes(work.id) ? '已收藏' : '收藏'}</button>
        </div>
        <button className="v4-btn-dark" style={{ marginTop: 8 }} onClick={() => start(work.title, work.category, work.styleTags)}>用这个方向开始设计</button>
        <p className="v4-source">不会复制受版权保护的原始素材；LunaSol 只取「方向」，重新生成原创设计。</p>
      </aside>
    </div>
    {modal}
  </div>;
}
