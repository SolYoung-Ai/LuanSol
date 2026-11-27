/* ============================================================
   Studio 2.0 — 包装工作台的入口与项目首页
   ------------------------------------------------------------
   三段式，各走各的页面：
     /studio                      → 工作台首页（项目网格）
     /studio?id=X                 → 需求采集（无缝长页）
     /studio?id=X&view=design     → 编辑器（画布 / 图层 / 贴纸）
   首页不套三栏：没有打开项目时，中间空着的那块画布只会让人发愣。
   ============================================================ */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { go, useHash } from '../ui';
import { useLang } from '../i18n';
import { useAuth } from '../cloud/auth';
import { CLOUD_SYNC } from '../cloud/config';
import { localIdentity } from '../cloud/localIdentity';
import { useSubscription } from '../cloud/subscription';
import { useProfile } from '../cloud/profile';
import { useApp } from '../store';
import { Icon } from '../components/icons';
import { cacheOne, dropCached, listStudio, pushStudio, removeStudio } from './api';
import { createStudioProject, pageOfStep } from './types';
import { mergeRows, rowsFromCache, timeLabel, type StudioRow } from './rows';
import { Booting } from './Frame';
import BriefFlow, { SUMMARY_PAGE } from './BriefFlow';
import DesignStage from './DesignStage';

export default function StudioEditor() {
  const { t } = useLang();
  const auth = useAuth();
  const hash = useHash();
  const q = new URLSearchParams(hash.split('?')[1] || '');
  const id = q.get('id') || '';
  const view = q.get('view') || '';

  if (!auth.ready) return <Booting text={t('正在确认登录状态…', 'Checking your session…')} />;

  if (!id) return <Workbench />;

  if (view === 'design') {
    return <DesignStage id={id} onBrief={() => go(`/studio?id=${encodeURIComponent(id)}`)} />;
  }
  return <BriefFlow id={id} onDesign={() => go(`/studio?id=${encodeURIComponent(id)}&view=design`)} />;
}

/* ------------------------------------------------------------ */
/* 工作台首页                                                     */
/* ------------------------------------------------------------ */

function Workbench() {
  const { t } = useLang();
  const auth = useAuth();
  const sub = useSubscription();
  const { profile } = useProfile();
  const { setToast } = useApp();
  const [rows, setRows] = useState<StudioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudErr, setCloudErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState('');
  /* 云同步关闭时用本机身份：工作台不再要求登录 */
  const uid = CLOUD_SYNC ? (auth.user?.id || '') : localIdentity();

  const loadCloud = useCallback(async () => {
    /* 云同步关闭：列表只来自本机缓存，不发请求、也不显示云端错误 */
    if (!CLOUD_SYNC) { setLoading(false); return; }
    setLoading(true);
    const r = await listStudio();
    if (r.ok) {
      setCloudErr('');
      setRows((prev) => mergeRows(prev.filter((x) => !x.cloudOnly), r.data));
    } else {
      setCloudErr(r.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setRows(rowsFromCache(uid));
    if (uid && CLOUD_SYNC) void loadCloud();
    else setLoading(false);   // 没登录就没有云端列表可等，别一直挂着骨架
  }, [uid, loadCloud]);

  const visible = useMemo(() => rows.filter((r) => !r.blank), [rows]);
  const toLogin = () => go(`/login?next=${encodeURIComponent('/studio')}`);

  const openRow = (r: StudioRow) => {
    const design = r.status === 'confirmed';
    go(`/studio?id=${encodeURIComponent(r.id)}${design ? '&view=design' : ''}`);
  };

  const startNew = () => {
    if (CLOUD_SYNC && !uid) { toLogin(); return; }
    if (busy) return;
    setBusy(true);
    const p = createStudioProject(uid);
    cacheOne(p);
    if (CLOUD_SYNC) void pushStudio(uid, p);
    go(`/studio?id=${encodeURIComponent(p.id)}`);
  };

  const removeOne = async (id: string) => {
    if (!uid) return;
    setDeleting('');
    if (!CLOUD_SYNC) {
      dropCached(id);
      setRows((prev) => prev.filter((x) => x.id !== id));
      setToast(t('已从本机删除', 'Deleted from this device'));
      return;
    }
    const r = await removeStudio(uid, id);
    dropCached(id);
    setRows((prev) => prev.filter((x) => x.id !== id));
    setToast(r.ok
      ? t('已删除这个设计项目', 'Design deleted')
      : t(`已从本机移除，云端副本稍后可再删（${r.message}）`, `Removed locally; the cloud copy can be deleted later (${r.message})`));
  };

  const statusText = (r: StudioRow) => (r.status === 'confirmed'
    ? t('已进编辑器', 'On canvas')
    : r.step
      ? (pageOfStep(r.step) >= SUMMARY_PAGE
        ? t('需求已填完 · 待确认', 'Brief filled · to confirm')
        : t(`需求第 ${pageOfStep(r.step)} / ${SUMMARY_PAGE - 1} 页`, `Brief page ${pageOfStep(r.step)} of ${SUMMARY_PAGE - 1}`))
      : t('云端项目', 'In cloud'));

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const shown = useMemo(() => {
    const k = query.trim().toLowerCase();
    const list = k ? visible.filter((r) => r.name.toLowerCase().includes(k)) : visible;
    return [...list].sort((a, b) => (sort === 'name'
      ? a.name.localeCompare(b.name, 'zh-Hans-CN')
      : b.updatedAt - a.updatedAt));
  }, [visible, query, sort]);

  const avatar = profile?.avatar_url || auth.user?.avatarUrl || '';
  const initial = (auth.user?.label || auth.user?.email || 'U').slice(0, 1).toUpperCase();

  return <div className="st-wb">
    <header className="st-wb-top">
      <button className="st-wb-back" onClick={() => go('/')}>
        <Icon name="chevronLeft" size={16} /><span>{t('首页', 'Home')}</span>
      </button>
      <div className="st-wb-brand">Luna<i>Sol</i><span className="st-wb-split" aria-hidden />
        <em>{t('包装工作台', 'Workbench')}</em></div>

      <div className="st-wb-right">
        {!!uid && (cloudErr
          ? <button className="st-wb-retry" onClick={() => void loadCloud()}>
              {t('云端没连上 · 重试', 'Cloud offline — retry')}
            </button>
          : <span className="st-wb-sync"><i aria-hidden />{loading
              ? t('同步中', 'Syncing')
              : t('已同步', 'Synced')}</span>)}
        {uid
          ? <button className="st-wb-credits" onClick={() => go('/subscribe')}
              title={t('积分与套餐', 'Credits and plans')}>
              <b>{sub.usedLeft ?? '—'}</b>{t('积分', 'credits')}
            </button>
          : <button className="st-wb-login" onClick={toLogin}>{t('登录', 'Log in')}</button>}
        {!!uid && <button className="st-wb-me" onClick={() => go('/account')}
          title={t('账号', 'Account')} aria-label={t('账号', 'Account')}>
          {avatar ? <img src={avatar} alt="" /> : <span>{initial}</span>}
        </button>}
      </div>
    </header>

    <main className="st-wb-main">
      <div className="st-wb-cols">
        {/* 左栏：只回答「从哪开始」，把空出来的位置给作品 */}
        <aside className="st-wb-side">
          <section className="st-wb-start">
            <span className="st-wb-kicker">{uid ? t('开始新稿', 'New file') : t('先登录', 'Sign in first')}</span>
            <h1>{t('新建包装项目', 'New packaging project')}</h1>
            <p>{t(`需求分 ${SUMMARY_PAGE - 1} 页采集：类别、结构、尺寸、风格，填完直接进画布。`,
              'A short brief — category, structure, size, style — then straight to the canvas.')}</p>
            <button className="st-wb-cta" onClick={startNew} disabled={busy}>
              {uid ? t('开始', 'Start') : t('去登录', 'Sign in')}<Icon name="chevronRight" size={14} />
            </button>
          </section>

          <ol className="st-wb-flow">
            <li><b>01</b><span>{t('需求采集', 'Brief')}<em>{t(`${SUMMARY_PAGE - 1} 页，随时能回来改`, 'Editable anytime')}</em></span></li>
            <li><b>02</b><span>{t('画布', 'Canvas')}<em>{t('图层、出血、贴纸', 'Layers, bleed, artwork')}</em></span></li>
            <li><b>03</b><span>{t('刀模与印前', 'Die and prepress')}<em>{t('三视图、检查报告', 'Three views, check report')}</em></span></li>
          </ol>

          <div className="st-wb-facts">
            <div><b>{visible.length}</b><span>{t('份设计', 'designs')}</span></div>
            <div><b>{uid ? (sub.usedLeft ?? '—') : '—'}</b><span>{t('积分', 'credits')}</span></div>
          </div>

          <p className="st-wb-note">{t('需求与设计按账号保存，换设备登录同一账号就能接着改。',
            'Briefs and canvases are saved per account — sign in anywhere to continue.')}</p>
        </aside>

        <section className="st-wb-list">
          <div className="st-wb-bar">
            <h2>{t('我的设计', 'My designs')}</h2>
            {!!visible.length && <em>{visible.length}</em>}
            {visible.length > 1 && <div className="st-wb-tools">
              <label className="st-wb-search">
                <Icon name="search" size={13} />
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('按名称找', 'Find by name')} aria-label={t('搜索项目', 'Search projects')} />
              </label>
              <button className="st-wb-sort" onClick={() => setSort(sort === 'recent' ? 'name' : 'recent')}
                title={t('切换排序', 'Switch order')}>
                {sort === 'recent' ? t('最近修改', 'Recent') : t('按名称', 'Name')}
              </button>
            </div>}
          </div>

          {uid && loading && !visible.length && <div className="st-wb-grid">
            {[0, 1, 2].map((i) => <div className="st-wb-skel" key={i}><i /><b /><em /></div>)}
          </div>}

          {!loading && !visible.length && <div className="st-wb-empty">
            <h3>{uid ? t('还没有设计', 'No designs yet') : t('登录后才有列表', 'Sign in to see your designs')}</h3>
            <p>{uid
              ? t('新建一份，需求填完就进画布，刀模和印前检查都在里面。',
                'Start one — the brief leads straight into the canvas, die lines included.')
              : t('项目和设计都跟你账号走，不会丢在浏览器里。',
                'Projects follow your account, not this browser.')}</p>
            <button className="st-btn st-btn-dark" onClick={uid ? startNew : toLogin}>
              {uid ? t('新建包装项目', 'New project') : t('去登录', 'Sign in')}<span aria-hidden>→</span>
            </button>
          </div>}

          {!loading && !!visible.length && !shown.length && <div className="st-wb-nohit">
            {t('没有叫这个名字的项目。', 'No project matches that name.')}
            <button onClick={() => setQuery('')}>{t('清空搜索', 'Clear')}</button>
          </div>}

          {!!shown.length && <div className="st-wb-grid">
            <button className="st-wb-add" onClick={startNew} disabled={busy}>
              <Icon name="plus" size={20} />
              <span>{t('新建包装项目', 'New project')}</span>
            </button>
            {shown.map((r) => <article className={`st-wb-card ${deleting === r.id ? 'is-confirm' : ''}`} key={r.id}>
              <button
                className="st-wb-thumb"
                onClick={() => openRow(r)}
                style={{ background: r.bg || '#FBF8F3', color: r.ink || '#191919' }}
                aria-label={r.name}
              >
                <span className={`st-wb-dot ${r.status === 'confirmed' ? 'is-live' : ''}`} aria-hidden />
                {r.status === 'confirmed'
                  ? <>
                    <span className="st-wb-thumb-name">{r.name}</span>
                    <i className="st-wb-thumb-rule" style={{ background: r.accent || '#F47735' }} />
                    <em className="st-wb-thumb-tag">{r.hasSticker ? t('含贴纸', 'with artwork') : t('画布', 'canvas')}</em>
                  </>
                  : <>
                    <span className="st-wb-thumb-name is-draft">{r.name || t('未命名', 'Untitled')}</span>
                    <span className="st-wb-thumb-prog" aria-hidden>
                      <i style={{ width: `${Math.round((Math.min(pageOfStep(r.step || 1), SUMMARY_PAGE - 1) / (SUMMARY_PAGE - 1)) * 100)}%` }} />
                    </span>
                    <em className="st-wb-thumb-tag">{t(`需求 ${Math.min(pageOfStep(r.step || 1), SUMMARY_PAGE - 1)} / ${SUMMARY_PAGE - 1} 页`,
                      `Brief ${Math.min(pageOfStep(r.step || 1), SUMMARY_PAGE - 1)} of ${SUMMARY_PAGE - 1}`)}</em>
                  </>}
                <span className="st-wb-thumb-go">
                  {r.status === 'confirmed' ? t('继续编辑', 'Open') : t('继续填写', 'Resume')}
                  <Icon name="chevronRight" size={12} />
                </span>
              </button>

              {deleting === r.id
                ? <div className="st-wb-confirm">
                  <span>{t('删掉这个项目？', 'Delete this?')}</span>
                  <button className="st-wb-yes" onClick={() => void removeOne(r.id)}>{t('删除', 'Delete')}</button>
                  <button className="st-wb-no" onClick={() => setDeleting('')}>{t('取消', 'Cancel')}</button>
                </div>
                : <div className="st-wb-meta">
                  <b title={r.name}>{r.name}</b>
                  <em>{statusText(r)}<span aria-hidden> · </span>{timeLabel(r.updatedAt)}</em>
                  <button
                    className="st-wb-del"
                    onClick={() => setDeleting(r.id)}
                    title={t('删除项目', 'Delete project')}
                    aria-label={t('删除项目', 'Delete project')}
                  ><Icon name="trash" size={14} /></button>
                </div>}
            </article>)}
          </div>}

          {!!shown.length && <footer className="st-wb-foot">
            {t(`共 ${visible.length} 份，按${sort === 'name' ? '名称' : '最近修改'}排序`,
              `${visible.length} total · sorted by ${sort === 'name' ? 'name' : 'recent'}`)}
          </footer>}
        </section>
      </div>
    </main>
  </div>;
}
