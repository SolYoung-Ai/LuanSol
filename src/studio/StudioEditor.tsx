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
import { useSubscription } from '../cloud/subscription';
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
  const { setToast } = useApp();
  const [rows, setRows] = useState<StudioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudErr, setCloudErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState('');
  const uid = auth.user?.id || '';

  const loadCloud = useCallback(async () => {
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
    if (uid) void loadCloud();
    else setLoading(false);   // 没登录就没有云端列表可等，别一直挂着骨架
  }, [uid, loadCloud]);

  const visible = useMemo(() => rows.filter((r) => !r.blank), [rows]);
  const toLogin = () => go(`/login?next=${encodeURIComponent('/studio')}`);

  const openRow = (r: StudioRow) => {
    const design = r.status === 'confirmed';
    go(`/studio?id=${encodeURIComponent(r.id)}${design ? '&view=design' : ''}`);
  };

  const startNew = () => {
    if (!uid) { toLogin(); return; }
    if (busy) return;
    setBusy(true);
    const p = createStudioProject(uid);
    cacheOne(p);
    void pushStudio(uid, p);
    go(`/studio?id=${encodeURIComponent(p.id)}`);
  };

  const removeOne = async (id: string) => {
    if (!uid) return;
    setDeleting('');
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

  return <div className="st-wb">
    <header className="st-wb-top">
      <button className="st-wb-back" onClick={() => go('/')}>
        <Icon name="chevronLeft" size={16} /><span>{t('首页', 'Home')}</span>
      </button>
      <div className="st-wb-brand">Luna<i>Sol</i><em>{t('包装工作台', 'Workbench')}</em></div>
      <div className="st-wb-right">
        {uid
          ? <span className="st-wb-credits"><b>{sub.usedLeft ?? '—'}</b>{t('积分', 'credits')}</span>
          : <button className="st-wb-login" onClick={toLogin}>{t('登录', 'Log in')}</button>}
      </div>
    </header>

    <main className="st-wb-main">
      <section className="st-wb-list">
        <div className="st-wb-bar">
          <h2>{t('我的设计', 'My designs')}</h2>
          {!!visible.length && <em>{visible.length}</em>}
          <div className="st-wb-bar-right">
            {!!uid && cloudErr && <button className="st-wb-retry" onClick={() => void loadCloud()}>
              {t('云端读取失败，重试', 'Cloud failed — retry')}
            </button>}
            <button className="st-btn st-btn-dark st-wb-new" onClick={startNew} disabled={busy}>
              {t('新建包装项目', 'New packaging project')}<span aria-hidden>→</span>
            </button>
          </div>
        </div>

        {uid && loading && !visible.length && <div className="st-wb-grid">
          {[0, 1, 2].map((i) => <div className="st-wb-skel" key={i}><i /><b /><em /></div>)}
        </div>}

        {!loading && !visible.length && <div className="st-wb-empty">
          <p>{uid
            ? t('还没有项目。第一份需求会出现在这里。', 'Nothing yet — your first brief lands here.')
            : t('登录后能看到你的设计列表。', 'Sign in to see your designs.')}</p>
          <button className="st-btn st-btn-ghost" onClick={uid ? startNew : toLogin}>
            {uid ? t('新建包装项目', 'New project') : t('去登录', 'Sign in')}
          </button>
        </div>}

        {!!visible.length && <div className="st-wb-grid">
          {visible.map((r) => <article className={`st-wb-card ${deleting === r.id ? 'is-confirm' : ''}`} key={r.id}>
            <button
              className="st-wb-thumb"
              onClick={() => openRow(r)}
              style={{ background: r.bg || '#FBF9F5', color: r.ink || '#191919' }}
              aria-label={r.name}
            >
              {r.status === 'confirmed'
                ? <>
                  <span className="st-wb-thumb-name">{r.name}</span>
                  <i className="st-wb-thumb-rule" style={{ background: r.accent || '#F47735' }} />
                  <em className="st-wb-thumb-tag">{r.hasSticker ? t('含贴纸', 'with graphic') : t('编辑器', 'canvas')}</em>
                </>
                : <span className="st-wb-thumb-draft">{t('需求草稿', 'Draft brief')}</span>}
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
      </section>

      <footer className="st-wb-foot">
        {t('需求与设计都按账号保存，换设备登录同一账号就能接着改。', 'Briefs and canvases are saved per account — sign in anywhere to continue.')}
      </footer>
    </main>
  </div>;
}
