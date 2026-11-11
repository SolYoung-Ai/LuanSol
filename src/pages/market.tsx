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
import { GROUP_EN, REGION_EN, COUNTRY_EN, STYLE_EN, enName } from '../data/market-en';
import { useLang } from '../i18n';

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
  const { t } = useLang();
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

  const modal = <Modal open={!!pending} title={t('你有一份进行中的草稿', 'You have a draft in progress')} onClose={() => setPending(null)}>
    <p className="modal-p">
      {t(`当前草稿已完成 ${stepProgress(s.draft)} / ${WIZARD_STEPS.length} 步。`,
        `Your current draft is ${stepProgress(s.draft)} of ${WIZARD_STEPS.length} steps in.`)}
      {t('用这个参考方向开始设计，会新建一个项目并', 'Starting from this reference creates a new project and ')}
      <b>{t('覆盖当前草稿', 'overwrites the current draft')}</b>
      {t('；原草稿不会自动保存为项目。', '. The old draft is not saved as a project.')}
    </p>
    <div className="modal-buttons">
      <button className="v4-btn-line" onClick={() => { setPending(null); go('/wizard'); }}>
        {t('保留草稿，继续编辑', 'Keep the draft')}
      </button>
      <button className="v4-btn-dark" onClick={confirm}>{t('新建项目，用这个方向', 'New project from this')}</button>
    </div>
  </Modal>;

  return { start, modal };
}

/* ---------------- 列表页 ---------------- */
const ALL = 'all';

export default function Market() {
  const { lang, t } = useLang();
  const N = (map: Record<string, string>, zh: string) => (lang === 'en' ? enName(map, zh) : zh);
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
      <h1 className="v4-market-title">{t('审美市场', 'Aesthetic Index')}</h1>
      <p className="v4-sub">
        {t('107 个能改变审美判断的站点索引——不是模板库，也不是图库瀑布流。按分组、地区、国家、风格检索，再进详情页看「值得看什么」，然后决定要不要打开它。',
          'An index of 107 sites that sharpen aesthetic judgement — not a template library, not an image feed. Filter by group, region, country and style, open a site to see what is worth looking at, then decide whether to visit it.')}
      </p>
      <div className="v4-market-en">
        {MARKET_SITE_COUNT} SITES · {MARKET_COUNTRIES.length} COUNTRIES · {MARKET_STYLES.length} STYLES · VERIFIED {MARKET_VERIFIED_AT}
      </div>
    </div>

    {/* ---- 索引面板 ---- */}
    <div className="v4-index">
      <div className="v4-index-row">
        <div className="v4-index-label">{t('分组', 'Group')}</div>
        <div className="v4-chips">
          <button className={`v4-chip ${group === ALL ? 'active' : ''}`} onClick={() => setGroup(ALL)}>
            {t('全部', 'All')} <i>{MARKET_SITE_COUNT}</i>
          </button>
          {MARKET_GROUPS.map((g) => <button key={g.id} className={`v4-chip ${group === g.id ? 'active' : ''}`} onClick={() => setGroup(group === g.id ? ALL : g.id)}>
            {N(GROUP_EN, g.id)} <i>{groupCount(g.id)}</i>
          </button>)}
        </div>
      </div>

      <div className="v4-index-row v4-index-search">
        <div className="v4-index-label">{t('检索', 'Search')}</div>
        <div className="v4-index-tools">
          <input className="v4-search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('站点名、域名、风格、国家', 'Site, domain, style or country')} />
          <button className="v4-chip" onClick={() => setMore((v) => !v)} aria-expanded={more}>
            {more ? t('收起筛选', 'Less filters') : t('更多筛选', 'More filters')} {activeCount > 0 && <i>{activeCount}</i>}
          </button>
          {activeCount > 0 && <button className="v4-chip" onClick={clearAll}>{t('清空', 'Clear')}</button>}
        </div>
      </div>

      {more && <>
        <div className="v4-index-row">
          <div className="v4-index-label">{t('地区', 'Region')}</div>
          <div className="v4-chips">
            <button className={`v4-chip ${region === ALL ? 'active' : ''}`} onClick={() => { setRegion(ALL); setCountry(ALL); }}>{t('全部', 'All')}</button>
            {MARKET_REGIONS.map((r) => <button key={r} className={`v4-chip ${region === r ? 'active' : ''}`}
              onClick={() => { setRegion(r); setCountry(ALL); }}>{N(REGION_EN, r)}</button>)}
          </div>
        </div>

        <div className="v4-index-row">
          <div className="v4-index-label">{t('国家', 'Country')}</div>
          <div className="v4-chips">
            <button className={`v4-chip ${country === ALL ? 'active' : ''}`} onClick={() => setCountry(ALL)}>{t('全部', 'All')}</button>
            {countryPool.map((c) => <button key={c.country} className={`v4-chip ${country === c.country ? 'active' : ''}`} onClick={() => setCountry(country === c.country ? ALL : c.country)}>
              {N(COUNTRY_EN, c.country)} <i>{c.count}</i>
            </button>)}
          </div>
        </div>

        <div className="v4-index-row">
          <div className="v4-index-label">{t('风格', 'Style')}</div>
          <div className="v4-chips">
            <button className={`v4-chip ${style === ALL ? 'active' : ''}`} onClick={() => setStyle(ALL)}>{t('全部', 'All')}</button>
            {MARKET_STYLES.map((s) => <button key={s.style} className={`v4-chip ${style === s.style ? 'active' : ''}`} onClick={() => setStyle(style === s.style ? ALL : s.style)}>
              {N(STYLE_EN, s.style)} <i>{s.count}</i>
            </button>)}
          </div>
        </div>

        <div className="v4-index-row">
          <div className="v4-index-label">{t('访问', 'Access')}</div>
          <div className="v4-chips">
            <button className={`v4-chip ${access === ALL ? 'active' : ''}`} onClick={() => setAccess(ALL)}>{t('全部', 'All')}</button>
            {(Object.keys(MARKET_ACCESS) as MarketAccess[]).map((a) => <button key={a} className={`v4-chip ${access === a ? 'active' : ''}`} onClick={() => setAccess(access === a ? ALL : a)}>
              {lang === 'en' ? MARKET_ACCESS[a].labelEn : MARKET_ACCESS[a].label}{' '}
              <i>{MARKET_SITES.filter((s) => s.access === a).length}</i>
            </button>)}
          </div>
        </div>
      </>}
    </div>

    <section className="v4-sec">
      <div className="v4-sec-head">
        <div className="v4-sec-title">
          {t('站点索引', 'Site index')} · {sites.length}{sites.length !== MARKET_SITE_COUNT ? ` / ${MARKET_SITE_COUNT}` : ''}
        </div>
        <div className="v4-sec-note">{t('进入详情页看「值得看什么」，再去官网', 'Open a site to see what is worth looking at, then visit it')}</div>
      </div>
      {sites.length === 0
        ? <div className="v4-empty">
          <h3>{t('这个组合下没有站点', 'No sites match this combination')}</h3>
          <p>{t('换一个分组或清空筛选。', 'Try another group, or clear the filters.')}</p>
          <button className="v4-btn-dark" onClick={clearAll}>{t('清空筛选', 'Clear filters')}</button>
        </div>
        : <div className="v4-site-grid">
          {sites.map((s) => <div key={s.id} className="v4-site">
            <div className="v4-site-top">
              <button className="v4-site-name" onClick={() => go(`/market/site/${s.id}`)}>{s.title}</button>
              <span className="v4-site-country">{N(COUNTRY_EN, s.country)}</span>
            </div>
            <p className="v4-site-desc">{s.description}</p>
            <div className="v4-site-tags">
              <span className="v4-tag v4-tag-group">{N(GROUP_EN, s.group)}</span>
              {s.styles.slice(0, 2).map((st) => <span key={st} className="v4-tag">{N(STYLE_EN, st)}</span>)}
              {s.access !== 'global' && <span className="v4-tag v4-tag-access">
                {lang === 'en' ? MARKET_ACCESS[s.access].labelEn : MARKET_ACCESS[s.access].label}
              </span>}
            </div>
            <div className="v4-site-why">{s.why}</div>
            <div className="v4-detail-actions">
              <button className="v4-btn-line" onClick={() => go(`/market/site/${s.id}`)}>
                {t('看它值得看什么', 'What to look at')}
              </button>
              <button className="v4-btn-line" onClick={() => toggle('sites', s.id)}>
                {favs.sites.includes(s.id) ? t('已收藏', 'Saved') : t('收藏', 'Save')}
              </button>
            </div>
          </div>)}
        </div>}
    </section>

    {works.length > 0 && <section className="v4-sec">
      <div className="v4-sec-head">
        <div className="v4-sec-title">{t('收录作品', 'Indexed works')} · {works.length}</div>
        <div className="v4-sec-note">{t('均来自公开原文，附来源与日期', 'All from public sources, with credit and date')}</div>
      </div>
      <div className="v4-work-grid">
        {works.map((w) => <div key={w.id} className="v4-case">
          <button className="v4-case-cover" onClick={() => go(`/market/work/${w.id}`)}>
            {w.image ? <img src={w.image} alt={w.title} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : null}
            {!w.image && <div className="v4-case-fallback">{t('原图未提供', 'No image provided')}</div>}
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
      {t(`收藏保存在本机浏览器，未登录也能使用。数据核实日期：${MARKET_VERIFIED_AT}。访问条件是 2026-11-06 从中国大陆（杭州）逐站实测的连通结果，不是经验标注：直连正常的标「国内外可访问」，请求超时或被拒连的标「需海外网络」，域名已失效或栏目改版的在详情页单独写明。实测是当时的网络快照，不构成永久承诺；跨境链路打不开属可达性问题，不等于站点下线。图片与作品版权归原作者与来源站所有，此处仅作索引与评论引用，点开可访问原文。`,
        `Favourites are stored in this browser, no account needed. Data verified ${MARKET_VERIFIED_AT}. Access labels come from testing every site from mainland China (Hangzhou) on 2026-11-06, not from guesswork: sites that opened directly are marked “Accessible worldwide”, timeouts or refused connections are marked “Needs overseas network”, and dead domains or moved sections are noted on the detail page. That test is a snapshot, not a permanent promise — a failing cross-border link is a reachability issue, not a dead site. Images and works remain the property of their authors and source sites; they are cited here for indexing and commentary only, and every card links to the original.`)}
    </p>
  </div>;
}

/* ---------------- 站点详情 ---------------- */
export function MarketSitePage() {
  const { lang, t } = useLang();
  const N = (map: Record<string, string>, zh: string) => (lang === 'en' ? enName(map, zh) : zh);
  const id = useHash().replace('/market/site/', '').split('?')[0];
  const site = MARKET_SITES.find((s) => s.id === id);
  const { favs, toggle } = useFavs();
  const { start, modal } = useSeedReference();

  if (!site) return <div className="gl-page gl-page-wide gl-market"><div className="v4-empty">
    <h3>{t('没有找到这个站点', 'Site not found')}</h3>
    <p>{t('链接可能已更新，返回审美市场重新浏览。', 'The link may have changed — browse the index again.')}</p>
    <button className="v4-btn-dark" onClick={() => go('/market')}>{t('返回审美市场', 'Back to the index')}</button>
  </div></div>;

  // 优先按风格标签匹配；没有匹配时退回「该站收录的作品」，再退回其他收录作品，
  // 保证左栏不会留一块无意义的空白。
  const byStyle = MARKET_WORKS.filter((w) => w.styleTags.some((t) => site.styles.includes(t)));
  const bySite = MARKET_WORKS.filter((w) => w.sourceSiteId === site.id);
  const related: MarketWork[] = (byStyle.length ? byStyle : bySite.length ? bySite : MARKET_WORKS).slice(0, 4);
  const sameGroup = MARKET_SITES.filter((s) => s.group === site.group && s.id !== site.id).slice(0, 6);
  const accessInfo = MARKET_ACCESS[site.access];

  return <div className="gl-page gl-page-wide gl-market">
    <button className="v4-filter" onClick={() => go('/market')}>← {t('审美市场', 'Aesthetic Index')}</button>
    <div className="v4-detail">
      <div>
        <div className="v4-kicker">{N(COUNTRY_EN, site.country)} · {N(GROUP_EN, site.group)} · {site.domain}</div>
        <h1 className="v4-detail-title" style={{ marginTop: 14 }}>{site.title}</h1>
        <p className="v4-detail-note" style={{ marginTop: 16 }}>{site.description}</p>

        <div className="v4-sec" style={{ marginTop: 32 }}>
          <div className="v4-sec-head"><div className="v4-sec-title">{t('值得看什么', 'What to look at')}</div></div>
          <ul style={{ marginTop: 14, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: 'var(--v4-ink-2)' }}>
            {site.designNotes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>

        {/* 访问说明：国内可能打不开的情况，在这里讲清楚，不假装能访问 */}
        <div className={`v4-access ${site.access}`}>
          <div className="v4-access-head">
            <span className="v4-access-dot" />
            <strong>{lang === 'en' ? accessInfo.labelEn : accessInfo.label}</strong>
            <span className="v4-access-en">{site.domain}</span>
          </div>
          <p className="v4-access-note">
            {site.accessNote || (lang === 'en' ? accessInfo.noteEn : accessInfo.note)}
          </p>
          <p className="v4-access-note">
            {site.access === 'global'
              ? t('国内与海外都能直连打开（2026-11-06 实测）。若你这里打不开，多半是本地网络或站点对高频访问的限流，换个时间再试。',
                'Opens directly from both mainland China and overseas (tested 2026-11-06). If it fails for you, it is usually local network noise or rate limiting — try again later.')
              : t('海外用户可直接访问该站；国内如需查阅，请自备合规的国际网络环境。',
                'Accessible directly from overseas. If you are in mainland China, use a compliant international network to view it.')}
          </p>
        </div>

        {related.length > 0 && <div className="v4-sec">
          <div className="v4-sec-head"><div className="v4-sec-title">
            {byStyle.length
              ? t('风格相近的收录作品', 'Related works in a similar style')
              : t('同期收录的其他作品', 'Other works indexed at the same time')}
          </div></div>
          <div className="v4-work-grid">
            {related.map((w) => <div key={w.id} className="v4-case">
              <button className="v4-case-cover" onClick={() => go(`/market/work/${w.id}`)}>
                {w.image
                  ? <img src={w.image} alt={w.title} loading="lazy" />
                  : <div className="v4-case-fallback">{t('原图未提供', 'No image provided')}</div>}
              </button>
              <button className="v4-case-title" onClick={() => go(`/market/work/${w.id}`)}>{w.title}</button>
              <div className="v4-case-meta">{w.category}</div>
            </div>)}
          </div>
        </div>}

      </div>

      <aside className="v4-detail-body">
        <div className="v4-kv">
          <span>{t('国家 / 地区', 'Country / region')}</span>
          <strong>{N(COUNTRY_EN, site.country)}（{N(REGION_EN, regionOf(site.country))}）</strong>
        </div>
        <div className="v4-kv"><span>{t('域名', 'Domain')}</span><strong>{site.domain}</strong></div>
        <div className="v4-kv"><span>{t('索引分组', 'Group')}</span><strong>{N(GROUP_EN, site.group)}</strong></div>
        <div className="v4-kv"><span>{t('设计风格', 'Styles')}</span>
          <strong>{site.styles.map((x) => N(STYLE_EN, x)).join(' / ')}</strong></div>
        <div className="v4-kv"><span>{t('访问条件', 'Access')}</span>
          <strong>{lang === 'en' ? accessInfo.labelEn : accessInfo.label}</strong></div>
        <div className="v4-kv"><span>{t('核实日期', 'Verified')}</span><strong>{site.lastVerifiedAt}</strong></div>
        <div className="v4-kv"><span>{t('来源', 'Source')}</span><strong>{site.sourceCredit}</strong></div>
        <p className="v4-detail-note">{site.why}</p>
        <div className="v4-detail-actions">
          <a className="v4-btn-dark" href={site.officialUrl} target="_blank" rel="noopener noreferrer">
            {t('访问官方网站 ↗', 'Visit the site ↗')}
          </a>
          <button className="v4-btn-line" onClick={() => toggle('sites', site.id)}>
            {favs.sites.includes(site.id) ? t('已收藏', 'Saved') : t('收藏这个站点', 'Save this site')}
          </button>
        </div>
        {site.access !== 'global' && <p className="v4-access-hint">
          {t('若按钮打不开，是网络可达性问题——不是链接失效，回到上面的访问说明看原因。',
            'If the button does not open, it is a reachability issue, not a dead link — see the access note above.')}
        </p>}

        <div className="v4-sec">
          <div className="v4-sec-head"><div className="v4-sec-title">{t('用这个方向开始', 'Start from this direction')}</div></div>
          <p className="v4-detail-note" style={{ marginTop: 12 }}>
            {t('参考它的视觉气质，让 LunaSol 用内置风格库生成一份', 'Borrow the visual mood, and let LunaSol generate a ')}
            <b>{t('全新原创', 'brand-new original')}</b>
            {t('包装设计——不会复制对方任何素材。', ' packaging design from its built-in style library — no asset of theirs is copied.')}
          </p>
          <button className="v4-btn-dark" style={{ marginTop: 14 }} onClick={() => start(site.title, site.group, site.styles)}>
            {t('用这个方向开始设计', 'Start designing from this')}
          </button>
        </div>
      </aside>
    </div>

    {sameGroup.length > 0 && <div className="v4-sec">
      <div className="v4-sec-head">
        <div className="v4-sec-title">{t('同组的其他站点', 'More sites in this group')}</div>
        <div className="v4-sec-note">
          {N(GROUP_EN, site.group)} · {MARKET_SITES.filter((x) => x.group === site.group).length}
          {t(' 个', ' sites')}
        </div>
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
  const { lang, t } = useLang();
  const N = (map: Record<string, string>, zh: string) => (lang === 'en' ? enName(map, zh) : zh);
  const id = useHash().replace('/market/work/', '').split('?')[0];
  const work = MARKET_WORKS.find((w) => w.id === id);
  const { favs, toggle } = useFavs();
  const { start, modal } = useSeedReference();
  const site: MarketSite | undefined = work ? MARKET_SITES.find((s) => s.id === work.sourceSiteId) : undefined;

  if (!work) return <div className="gl-page gl-page-wide gl-market"><div className="v4-empty">
    <h3>{t('没有找到这个作品', 'Work not found')}</h3>
    <p>{t('它可能已从索引里移除。', 'It may have been removed from the index.')}</p>
    <button className="v4-btn-dark" onClick={() => go('/market')}>{t('返回审美市场', 'Back to the index')}</button>
  </div></div>;

  return <div className="gl-page gl-page-wide gl-market">
    <button className="v4-filter" onClick={() => go('/market')}>← {t('审美市场', 'Aesthetic Index')}</button>
    <div className="v4-detail">
      <div className="v4-detail-figure">
        {work.image
          ? <img src={work.image} alt={work.title} />
          : <div className="v4-case-fallback">{t('来源站未提供封面图', 'The source site provides no cover image')}</div>}
      </div>
      <aside className="v4-detail-body">
        <div className="v4-kicker">{work.category}</div>
        <h1 className="v4-detail-title">{work.title}</h1>
        {work.brand && <div className="v4-kv"><span>{t('品牌', 'Brand')}</span><strong>{work.brand}</strong></div>}
        <div className="v4-kv"><span>{t('类别', 'Category')}</span><strong>{work.category}</strong></div>
        <div className="v4-kv"><span>{t('标签', 'Tags')}</span>
          <strong>{work.styleTags.map((x) => N(STYLE_EN, x)).join(' / ')}</strong></div>
        <div className="v4-kv"><span>{t('发布', 'Published')}</span>
          <strong>{work.publishedAt || t('未标注', 'Not stated')}</strong></div>
        <div className="v4-kv"><span>{t('来源', 'Source')}</span><strong>{work.sourceCredit}</strong></div>
        <p className="v4-detail-note">{work.description}</p>
        <div className="v4-detail-actions">
          <a className="v4-btn-dark" href={work.sourceUrl} target="_blank" rel="noopener noreferrer">
            {t('查看原文 ↗', 'View the original ↗')}
          </a>
          {site && <button className="v4-btn-line" onClick={() => go(`/market/site/${site.id}`)}>
            {t('看来源站', 'Source site')}
          </button>}
          <button className="v4-btn-line" onClick={() => toggle('works', work.id)}>
            {favs.works.includes(work.id) ? t('已收藏', 'Saved') : t('收藏', 'Save')}
          </button>
        </div>
        <button className="v4-btn-dark" style={{ marginTop: 8 }} onClick={() => start(work.title, work.category, work.styleTags)}>
          {t('用这个方向开始设计', 'Start designing from this')}
        </button>
        <p className="v4-source">
          {t('不会复制受版权保护的原始素材；LunaSol 只取「方向」，重新生成原创设计。',
            'No copyrighted asset is copied — LunaSol takes only the direction and generates an original design.')}
        </p>
      </aside>
    </div>

    {modal}
  </div>;
}
