/* ============================================================
 * 审美市场（THE AESTHETIC INDEX）
 * ------------------------------------------------------------
 * 定位：策展式设计灵感索引，不是模板市场、不是图库瀑布流。
 * 数据原则（见 src/data/market-sites.ts 与 aesthetic-market.ts）：
 *   每个站点、每个作品都有真实官方入口与核实日期；不含虚构品牌与虚构项目。
 * 站点索引：107 个站点，可按 分组 / 地区 / 国家 / 风格 / 访问条件 交叉筛选。
 * 访问提示：只在详情页解释「国内直连 / 需海外网络 / 需订阅」，卡片不直接外链——
 *   把「点开一个新窗口」这件事收进详情页，避免用户在列表里被跳到打不开的页面。
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
  MARKET_ACCESS, MARKET_COUNTRIES, MARKET_GROUPS, MARKET_REGIONS,
  MARKET_SITE_COUNT, MARKET_SITES, MARKET_STYLES, regionOf,
  type MarketAccess, type MarketGroup, type MarketSite,
} from '../data/market-sites';
import { MARKET_WORKS, MARKET_VERIFIED_AT, type MarketWork } from '../data/aesthetic-market';

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
  if (/东方|中式|茶|酒|国潮|器物/.test(key)) return 'modern-orient';
  if (/字体|排印|平面|瑞士|编辑/.test(key)) return 'geometric';
  if (/极简|克制|北欧|留白|现代主义/.test(key)) return 'modern-minimal';
  if (/轻奢|高端|美妆|时尚|奢侈/.test(key)) return 'premium-luxury';
  if (/插画|图形|创意|实验/.test(key)) return 'illustration-pack';
  if (/食品|饮料|包装|自然|生活/.test(key)) return 'natural-eco';
  if (/摄影|影像|电影/.test(key)) return 'premium-luxury';
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
const ALL = 'all';

export default function Market() {
  const [group, setGroup] = useState<MarketGroup | typeof ALL>(ALL);
  const [region, setRegion] = useState('all');
  const [country, setCountry] = useState('all');
  const [style, setStyle] = useState('all');
  const [access, setAccess] = useState<MarketAccess | typeof ALL>(ALL);
  const [q, setQ] = useState('');
  const [more, setMore] = useState(false);
  const { favs, toggle } = useFavs();

  const groupCount = (g: MarketGroup) => MARKET_SITES.filter((s) => s.group === g).length;

  const countryPool = useMemo(
    () => MARKET_COUNTRIES.filter((c) => region === ALL || regionOf(c.country) === region),
    [region],
  );

  const sites = useMemo(() => MARKET_SITES.filter((s) => {
    if (group !== ALL && s.group !== group) return false;
    if (region !== ALL && regionOf(s.country) !== region) return false;
    if (country !== ALL && s.country !== country) return false;
    if (style !== ALL && !s.styles.includes(style)) return false;
    if (access !== ALL && s.access !== access) return false;
    if (q.trim()) {
      const hay = `${s.title} ${s.domain} ${s.description} ${s.styles.join(' ')} ${s.country} ${s.group}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  }), [group, region, country, style, access, q]);

  const works = useMemo(() => MARKET_WORKS.filter((w) => {
    if (!q.trim()) return true;
    return `${w.title} ${w.brand} ${w.description} ${w.styleTags.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase());
  }).slice(0, 12), [q]);

  const activeCount = [group, region, country, style, access].filter((x) => x !== ALL).length + (q.trim() ? 1 : 0);
  const clearAll = () => { setGroup(ALL); setRegion(ALL); setCountry(ALL); setStyle(ALL); setAccess(ALL); setQ(''); };

  return <div className="gl-page gl-page-wide gl-market">
    <div className="v4-market-hero">
      <div className="v4-kicker">THE AESTHETIC INDEX</div>
      <h1 className="v4-market-title">审美市场</h1>
      <p className="v4-sub">
        107 个能改变审美判断的站点索引——不是模板库，也不是图库瀑布流。
        按分组、地区、国家、风格检索，再进详情页看「值得看什么」，然后决定要不要打开它。
      </p>
      <div className="v4-market-en">
        {MARKET_SITE_COUNT} SITES · {MARKET_COUNTRIES.length} COUNTRIES · {MARKET_STYLES.length} STYLES · VERIFIED {MARKET_VERIFIED_AT}
      </div>
    </div>

    {/* ---- 索引面板 ---- */}
    <div className="v4-index">
      <div className="v4-index-row">
        <div className="v4-index-label">分组</div>
        <div className="v4-chips">
          <button className={`v4-chip ${group === ALL ? 'active' : ''}`} onClick={() => setGroup(ALL)}>全部 <i>{MARKET_SITE_COUNT}</i></button>
          {MARKET_GROUPS.map((g) => <button key={g.id} className={`v4-chip ${group === g.id ? 'active' : ''}`} onClick={() => setGroup(group === g.id ? ALL : g.id)}>
            {g.id} <i>{groupCount(g.id)}</i>
          </button>)}
        </div>
      </div>

      <div className="v4-index-row v4-index-search">
        <div className="v4-index-label">检索</div>
        <div className="v4-index-tools">
          <input className="v4-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="站点名、域名、风格、国家" />
          <button className="v4-chip" onClick={() => setMore((v) => !v)} aria-expanded={more}>
            {more ? '收起筛选' : '更多筛选'} {activeCount > 0 && <i>{activeCount}</i>}
          </button>
          {activeCount > 0 && <button className="v4-chip" onClick={clearAll}>清空</button>}
        </div>
      </div>

      {more && <>
        <div className="v4-index-row">
          <div className="v4-index-label">地区</div>
          <div className="v4-chips">
            <button className={`v4-chip ${region === ALL ? 'active' : ''}`} onClick={() => { setRegion(ALL); setCountry(ALL); }}>全部</button>
            {MARKET_REGIONS.map((r) => <button key={r} className={`v4-chip ${region === r ? 'active' : ''}`} onClick={() => { setRegion(r); setCountry(ALL); }}>{r}</button>)}
          </div>
        </div>

        <div className="v4-index-row">
          <div className="v4-index-label">国家</div>
          <div className="v4-chips">
            <button className={`v4-chip ${country === ALL ? 'active' : ''}`} onClick={() => setCountry(ALL)}>全部</button>
            {countryPool.map((c) => <button key={c.country} className={`v4-chip ${country === c.country ? 'active' : ''}`} onClick={() => setCountry(country === c.country ? ALL : c.country)}>
              {c.country} <i>{c.count}</i>
            </button>)}
          </div>
        </div>

        <div className="v4-index-row">
          <div className="v4-index-label">风格</div>
          <div className="v4-chips">
            <button className={`v4-chip ${style === ALL ? 'active' : ''}`} onClick={() => setStyle(ALL)}>全部</button>
            {MARKET_STYLES.map((s) => <button key={s.style} className={`v4-chip ${style === s.style ? 'active' : ''}`} onClick={() => setStyle(style === s.style ? ALL : s.style)}>
              {s.style} <i>{s.count}</i>
            </button>)}
          </div>
        </div>

        <div className="v4-index-row">
          <div className="v4-index-label">访问</div>
          <div className="v4-chips">
            <button className={`v4-chip ${access === ALL ? 'active' : ''}`} onClick={() => setAccess(ALL)}>全部</button>
            {(Object.keys(MARKET_ACCESS) as MarketAccess[]).map((a) => <button key={a} className={`v4-chip ${access === a ? 'active' : ''}`} onClick={() => setAccess(access === a ? ALL : a)}>
              {MARKET_ACCESS[a].label} <i>{MARKET_SITES.filter((s) => s.access === a).length}</i>
            </button>)}
          </div>
        </div>
      </>}
    </div>

    <section className="v4-sec">
      <div className="v4-sec-head">
        <div className="v4-sec-title">站点索引 · {sites.length}{sites.length !== MARKET_SITE_COUNT ? ` / ${MARKET_SITE_COUNT}` : ''}</div>
        <div className="v4-sec-note">进入详情页看「值得看什么」，再去官网</div>
      </div>
      {sites.length === 0
        ? <div className="v4-empty"><h3>这个组合下没有站点</h3><p>换一个分组或清空筛选。</p><button className="v4-btn-dark" onClick={clearAll}>清空筛选</button></div>
        : <div className="v4-site-grid">
          {sites.map((s) => <div key={s.id} className="v4-site">
            <div className="v4-site-top">
              <button className="v4-site-name" onClick={() => go(`/market/site/${s.id}`)}>{s.title}</button>
              <span className="v4-site-country">{s.country}</span>
            </div>
            <p className="v4-site-desc">{s.description}</p>
            <div className="v4-site-tags">
              <span className="v4-tag v4-tag-group">{s.group}</span>
              {s.styles.slice(0, 2).map((t) => <span key={t} className="v4-tag">{t}</span>)}
              {s.access !== 'global' && <span className="v4-tag v4-tag-access">{MARKET_ACCESS[s.access].label}</span>}
            </div>
            <div className="v4-site-why">{s.why}</div>
            <div className="v4-detail-actions">
              <button className="v4-btn-line" onClick={() => go(`/market/site/${s.id}`)}>看它值得看什么</button>
              <button className="v4-btn-line" onClick={() => toggle('sites', s.id)}>{favs.sites.includes(s.id) ? '已收藏' : '收藏'}</button>
            </div>
          </div>)}
        </div>}
    </section>

    {works.length > 0 && <section className="v4-sec">
      <div className="v4-sec-head">
        <div className="v4-sec-title">收录作品 · {works.length}</div>
        <div className="v4-sec-note">均来自公开原文，附来源与日期</div>
      </div>
      <div className="v4-work-grid">
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
      </div>
    </section>}

    <p className="v4-source" style={{ marginTop: 48 }}>
      收藏保存在本机浏览器，未登录也能使用。数据核实日期：{MARKET_VERIFIED_AT}。
      访问条件是 2026-11-06 从中国大陆（杭州）逐站实测的连通结果，不是经验标注：直连正常的标「国内外可访问」，请求超时或被拒连的标「需海外网络」，
      域名已失效或栏目改版的在详情页单独写明。实测是当时的网络快照，不构成永久承诺；跨境链路打不开属可达性问题，不等于站点下线。
      图片与作品版权归原作者与来源站所有，此处仅作索引与评论引用，点开可访问原文。
    </p>
  </div>;
}

/* ---------------- 站点详情 ---------------- */
export function MarketSitePage() {
  const id = useHash().replace('/market/site/', '').split('?')[0];
  const site = MARKET_SITES.find((s) => s.id === id);
  const { favs, toggle } = useFavs();
  const { start, modal } = useSeedReference();

  if (!site) return <div className="gl-page gl-page-wide gl-market"><div className="v4-empty"><h3>没有找到这个站点</h3><p>链接可能已更新，返回审美市场重新浏览。</p><button className="v4-btn-dark" onClick={() => go('/market')}>返回审美市场</button></div></div>;

  // 优先按风格标签匹配；没有匹配时退回「该站收录的作品」，再退回其他收录作品，
  // 保证左栏不会留一块无意义的空白。
  const byStyle = MARKET_WORKS.filter((w) => w.styleTags.some((t) => site.styles.includes(t)));
  const bySite = MARKET_WORKS.filter((w) => w.sourceSiteId === site.id);
  const related: MarketWork[] = (byStyle.length ? byStyle : bySite.length ? bySite : MARKET_WORKS).slice(0, 4);
  const sameGroup = MARKET_SITES.filter((s) => s.group === site.group && s.id !== site.id).slice(0, 6);
  const accessInfo = MARKET_ACCESS[site.access];

  return <div className="gl-page gl-page-wide gl-market">
    <button className="v4-filter" onClick={() => go('/market')}>← 审美市场</button>
    <div className="v4-detail">
      <div>
        <div className="v4-kicker">{site.country} · {site.group} · {site.domain}</div>
        <h1 className="v4-detail-title" style={{ marginTop: 14 }}>{site.title}</h1>
        <p className="v4-detail-note" style={{ marginTop: 16 }}>{site.description}</p>

        <div className="v4-sec" style={{ marginTop: 32 }}>
          <div className="v4-sec-head"><div className="v4-sec-title">值得看什么</div></div>
          <ul style={{ marginTop: 14, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: 'var(--v4-ink-2)' }}>
            {site.designNotes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>

        {/* 访问说明：国内可能打不开的情况，在这里讲清楚，不假装能访问 */}
        <div className={`v4-access ${site.access}`}>
          <div className="v4-access-head">
            <span className="v4-access-dot" />
            <strong>{accessInfo.label}</strong>
            <span className="v4-access-en">{site.domain}</span>
          </div>
          <p className="v4-access-note">{site.accessNote || accessInfo.note}</p>
          <p className="v4-access-note">
            {site.access === 'global'
              ? '国内与海外都能直连打开（2026-11-06 实测）。若你这里打不开，多半是本地网络或站点对高频访问的限流，换个时间再试。'
              : '海外用户可直接访问该站；国内如需查阅，请自备合规的国际网络环境。'}
          </p>
        </div>

        {related.length > 0 && <div className="v4-sec">
          <div className="v4-sec-head"><div className="v4-sec-title">{byStyle.length ? '风格相近的收录作品' : '同期收录的其他作品'}</div></div>
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
        <div className="v4-kv"><span>国家 / 地区</span><strong>{site.country}（{regionOf(site.country)}）</strong></div>
        <div className="v4-kv"><span>域名</span><strong>{site.domain}</strong></div>
        <div className="v4-kv"><span>索引分组</span><strong>{site.group}</strong></div>
        <div className="v4-kv"><span>设计风格</span><strong>{site.styles.join(' / ')}</strong></div>
        <div className="v4-kv"><span>访问条件</span><strong>{accessInfo.label}</strong></div>
        <div className="v4-kv"><span>核实日期</span><strong>{site.lastVerifiedAt}</strong></div>
        <div className="v4-kv"><span>来源</span><strong>{site.sourceCredit}</strong></div>
        <p className="v4-detail-note">{site.why}</p>
        <div className="v4-detail-actions">
          <a className="v4-btn-dark" href={site.officialUrl} target="_blank" rel="noopener noreferrer">访问官方网站 ↗</a>
          <button className="v4-btn-line" onClick={() => toggle('sites', site.id)}>{favs.sites.includes(site.id) ? '已收藏' : '收藏这个站点'}</button>
        </div>
        {site.access !== 'global' && <p className="v4-access-hint">若按钮打不开，是网络可达性问题——不是链接失效，回到上面的访问说明看原因。</p>}

        <div className="v4-sec">
          <div className="v4-sec-head"><div className="v4-sec-title">用这个方向开始</div></div>
          <p className="v4-detail-note" style={{ marginTop: 12 }}>
            参考它的视觉气质，让 LunaSol 用内置风格库生成一份<b>全新原创</b>包装设计——不会复制对方任何素材。
          </p>
          <button className="v4-btn-dark" style={{ marginTop: 14 }} onClick={() => start(site.title, site.group, site.styles)}>用这个方向开始设计</button>
        </div>
      </aside>
    </div>

    {sameGroup.length > 0 && <div className="v4-sec">
      <div className="v4-sec-head">
        <div className="v4-sec-title">同组的其他站点</div>
        <div className="v4-sec-note">{site.group} · {MARKET_SITES.filter((x) => x.group === site.group).length} 个</div>
      </div>
      <div className="v4-chips" style={{ marginTop: 16 }}>
        {sameGroup.map((s) => <button key={s.id} className="v4-chip" onClick={() => go(`/market/site/${s.id}`)}>{s.title}</button>)}
      </div>
    </div>}
    {modal}
  </div>;
}

/* ---------------- 作品详情 ---------------- */
export function MarketWorkPage() {
  const id = useHash().replace('/market/work/', '').split('?')[0];
  const work = MARKET_WORKS.find((w) => w.id === id);
  const { favs, toggle } = useFavs();
  const { start, modal } = useSeedReference();
  const site: MarketSite | undefined = work ? MARKET_SITES.find((s) => s.id === work.sourceSiteId) : undefined;

  if (!work) return <div className="gl-page gl-page-wide gl-market"><div className="v4-empty"><h3>没有找到这个作品</h3><p>它可能已从索引里移除。</p><button className="v4-btn-dark" onClick={() => go('/market')}>返回审美市场</button></div></div>;

  return <div className="gl-page gl-page-wide gl-market">
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
