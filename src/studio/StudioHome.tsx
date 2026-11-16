/* ============================================================
   Studio 2.0 — 欢迎界面 + 启动弹窗 + 我的设计
   ------------------------------------------------------------
   进入 /studio 先给一个启动弹窗（三入口），关掉之后是本页：
   一句标题、一个主按钮、一张「继续上次设计」卡、一份真实项目列表。
   没有历史项目就不画空列表，也不显示一条都没填的空项目。
   ============================================================ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { go } from '../ui';
import { useLang } from '../i18n';
import { useAuth } from '../cloud/auth';
import { useApp } from '../store';
import {
  cacheOne, dropCached, listStudio, pushStudio, readCacheFor, removeStudio,
  type StudioMeta,
} from './api';
import { createStudioProject, isBlankStudio, type StudioProject } from './types';
import { CategoryArt } from './art';

const LAUNCH_KEY = 'lunasol.studio.launch.v1';
/* 未登录点「开始一个新设计」→ 去登录 → 回来继续建项目。
   不记这一笔的话，登录回来会停在一屏欢迎界面，要再点一次。 */
const INTENT_KEY = 'lunasol.studio.intent.v1';
const TOTAL_STEPS = 9;

interface Row {
  id: string;
  name: string;
  updatedAt: number;
  step?: number;
  status?: 'draft' | 'confirmed';
  blank?: boolean;
  cloudOnly?: boolean;
}

function rowsFromCache(uid: string): Row[] {
  return readCacheFor(uid).map((p: StudioProject) => ({
    id: p.id, name: p.name, updatedAt: p.updatedAt, step: p.step,
    status: p.status, blank: isBlankStudio(p),
  }));
}

function mergeRows(cacheRows: Row[], cloud: StudioMeta[]): Row[] {
  const map = new Map<string, Row>();
  cacheRows.forEach((r) => map.set(r.id, r));
  cloud.forEach((c) => {
    const cur = map.get(c.id);
    if (!cur) {
      map.set(c.id, { id: c.id, name: c.name, updatedAt: c.updatedAt, cloudOnly: true });
    } else if (c.updatedAt > cur.updatedAt) {
      map.set(c.id, { ...cur, updatedAt: c.updatedAt, name: c.name || cur.name });
    } else if (c.name && (!cur.name || cur.name === '未命名设计')) {
      map.set(c.id, { ...cur, name: c.name });
    }
  });
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

const timeLabel = (ts: number): string => {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `今天 ${p(d.getHours())}:${p(d.getMinutes())}`
    : `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function StudioHome() {
  const { t } = useLang();
  const auth = useAuth();
  const { setToast } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudErr, setCloudErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState('');
  const [launch, setLaunch] = useState(() => {
    try { return sessionStorage.getItem(LAUNCH_KEY) !== '1'; } catch { return true; }
  });
  const listRef = useRef<HTMLElement>(null);

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

  /* 账号确定后再读本机缓存：uid 变了（换账号）要整份重读 */
  useEffect(() => {
    setRows(rowsFromCache(uid));
    if (uid) void loadCloud();
  }, [uid, loadCloud]);

  useEffect(() => {
    if (!launch) return;
    try { sessionStorage.setItem(LAUNCH_KEY, '1'); } catch { /* ignore */ }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [launch]);

  const visible = useMemo(() => rows.filter((r) => !r.blank), [rows]);
  const last = visible[0] || null;

  const toLogin = () => go(`/login?next=${encodeURIComponent('/studio')}`);

  const openProject = (id: string) => {
    if (!uid) { toLogin(); return; }
    go(`/studio?id=${encodeURIComponent(id)}`);
  };

  const startNew = async () => {
    // 未登录先用欢迎界面把人留住，点到「开始设计」才去登录
    if (!uid) {
      try { sessionStorage.setItem(INTENT_KEY, JSON.stringify({ kind: 'new', at: Date.now() })); } catch { /* ignore */ }
      toLogin();
      return;
    }
    if (busy) return;
    setBusy(true);
    const p = createStudioProject(uid);
    cacheOne(p);
    // 先把这一行推到云端：即便用户马上关掉页面，也能在别的设备继续
    void pushStudio(uid, p);
    openProject(p.id);
  };

  /* 登录回来接着建项目（只认一次，消费后立刻清掉） */
  const startRef = useRef(startNew);
  startRef.current = startNew;
  useEffect(() => {
    if (!uid) return;
    let raw = '';
    try { raw = sessionStorage.getItem(INTENT_KEY) || ''; } catch { raw = ''; }
    if (!raw) return;
    try { sessionStorage.removeItem(INTENT_KEY); } catch { /* ignore */ }
    let intent: { kind?: string; at?: number } = {};
    try { intent = JSON.parse(raw) as { kind?: string; at?: number }; } catch { return; }
    // 十分钟内才算「刚点过开始」，避免很久以后登录回来凭空冒出项目
    if (intent.kind !== 'new' || Date.now() - Number(intent.at || 0) > 10 * 60 * 1000) return;
    void startRef.current();
  }, [uid]);

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

  const closeLaunch = () => setLaunch(false);

  const goList = () => {
    closeLaunch();
    window.setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  return <div className="st-home">
    <section className="st-hero">
      <div className="st-hero-in">
        <span className="st-eyebrow">{t('LunaSol · 设计工作室', 'LunaSol · Studio')}</span>
        <h1>
          {t('从一个问题开始，', 'Start with a question,')}<br />
          {t('把包装需求说清楚。', 'and get the brief right.')}
        </h1>
        <p className="st-lede">
          {t('九个步骤，全程只做选择。产品、形式、尺寸、风格定下来，后面交给 AI。',
            'Nine steps, all choices. Once product, format, size and style are set, AI takes over.')}
        </p>
        <div className="st-hero-actions">
          <button className="st-btn st-btn-dark" onClick={startNew} disabled={busy}>
            {t('开始一个新设计', 'Start a new design')}<span aria-hidden>→</span>
          </button>
          {last && <button className="st-btn st-btn-ghost" onClick={() => openProject(last.id)}>
            {t('继续上次设计', 'Continue last design')}
          </button>}
        </div>
        {!uid && <p className="st-lede st-lede-mini">
          {t('开始设计需要登录：你的需求会按账号保存，换设备也能继续。',
            'Sign in to start — briefs are saved to your account and follow you across devices.')}
        </p>}
      </div>
      <div className="st-hero-art" aria-hidden>
        <CategoryArt id="gift" />
        <CategoryArt id="tea" />
        <CategoryArt id="beauty" />
      </div>
    </section>

    {last && <button className="st-resume" onClick={() => openProject(last.id)}>
      <span className="st-resume-tag">{t('继续上次设计', 'Continue')}</span>
      <span className="st-resume-main">
        <b>{last.name}</b>
        <em>
          {last.status === 'confirmed'
            ? t('需求已确认', 'Brief confirmed')
            : t(`进行到第 ${Math.min(last.step || 1, TOTAL_STEPS)} 步 / 共 ${TOTAL_STEPS} 步`, `Step ${Math.min(last.step || 1, TOTAL_STEPS)} of ${TOTAL_STEPS}`)}
          <span aria-hidden> · </span>{timeLabel(last.updatedAt)}
        </em>
      </span>
      <span className="st-resume-go" aria-hidden>→</span>
    </button>}

    <section className="st-mine" ref={listRef} id="mine">
      <header className="st-sec-head">
        <h2>{t('我的设计', 'My designs')}</h2>
        <span className="st-count">{visible.length ? t(`${visible.length} 个项目`, `${visible.length} projects`) : ''}</span>
      </header>

      {!uid && <div className="st-empty">
        <p>{t('登录后可以保存设计、跨设备继续，也能在「我的设计」里回看每一份需求。',
          'Sign in to save designs, continue on another device, and find every brief under “My designs”.')}</p>
        <button className="st-btn st-btn-dark" onClick={toLogin}>{t('登录 / 注册', 'Sign in')}</button>
      </div>}

      {uid && cloudErr && <div className="st-note warn">
        {t(`云端列表暂时没读出来：${cloudErr}`, `Could not load the cloud list: ${cloudErr}`)}
        <button onClick={() => void loadCloud()}>{t('重试', 'Retry')}</button>
      </div>}

      {uid && loading && !visible.length && <div className="st-grid">
        {[0, 1, 2].map((i) => <div className="st-skel" key={i} />)}
      </div>}

      {uid && !loading && !visible.length && <div className="st-empty">
        <p>{t('还没有设计项目。第一个项目会出现在这里。', 'No designs yet — your first one will show up here.')}</p>
        <button className="st-btn st-btn-ghost" onClick={startNew} disabled={busy}>{t('开始一个新设计', 'Start a new design')}</button>
      </div>}

      {uid && !!visible.length && <div className="st-grid">
        {visible.map((r) => <article className="st-card" key={r.id}>
          <button className="st-card-open" onClick={() => openProject(r.id)}>
            <span className={`st-card-badge ${r.status === 'confirmed' ? 'ok' : ''}`}>
              {r.status === 'confirmed'
                ? t('需求已确认', 'Confirmed')
                : r.step ? t(`第 ${Math.min(r.step, TOTAL_STEPS + 1)} 步`, `Step ${Math.min(r.step, TOTAL_STEPS + 1)}`) : t('云端项目', 'In cloud')}
            </span>
            <b className="st-card-name">{r.name}</b>
            <span className="st-card-meta">{timeLabel(r.updatedAt)}</span>
          </button>
          {deleting === r.id
            ? <div className="st-card-confirm">
              <span>{t('确认删除？', 'Delete this?')}</span>
              <button onClick={() => void removeOne(r.id)}>{t('删除', 'Delete')}</button>
              <button onClick={() => setDeleting('')}>{t('取消', 'Cancel')}</button>
            </div>
            : <button className="st-card-del" onClick={() => setDeleting(r.id)} aria-label={t('删除项目', 'Delete project')}>×</button>}
        </article>)}
      </div>}
    </section>

    {launch && createPortal(<div className="st-modal" role="dialog" aria-modal="true" aria-labelledby="st-launch-title">
      <button className="st-modal-mask" aria-label={t('关闭', 'Close')} onClick={closeLaunch} />
      <div className="st-modal-card">
        <button className="st-modal-x" onClick={closeLaunch} aria-label={t('关闭', 'Close')}>×</button>
        <span className="st-eyebrow">{t('LunaSol 设计工作室', 'LunaSol Studio')}</span>
        <h2 id="st-launch-title">{t('欢迎来到 LunaSol 设计工作室。', 'Welcome to LunaSol Studio.')}</h2>
        <p className="st-modal-sub">{t('今天，想为你的什么产品设计包装？', 'What product are we packaging today?')}</p>

        <div className="st-launch-list">
          <button className="st-launch-item" onClick={startNew} disabled={busy}>
            <span className="st-launch-ico" aria-hidden>＋</span>
            <span className="st-launch-txt">
              <b>{t('开始一个新设计', 'Start a new design')}</b>
              <em>{t('从产品类别开始，九步走完', 'Nine steps, starting with the category')}</em>
            </span>
            <span className="st-launch-go" aria-hidden>→</span>
          </button>

          <button
            className="st-launch-item"
            onClick={() => last && openProject(last.id)}
            disabled={!last}
          >
            <span className="st-launch-ico" aria-hidden>↺</span>
            <span className="st-launch-txt">
              <b>{t('继续上次设计', 'Continue last design')}</b>
              <em>{last
                ? `${last.name}${last.step ? t(` · 第 ${Math.min(last.step, TOTAL_STEPS)} 步`, ` · step ${Math.min(last.step, TOTAL_STEPS)}`) : ''}`
                : t('还没有未完成的设计', 'Nothing in progress yet')}</em>
            </span>
            <span className="st-launch-go" aria-hidden>→</span>
          </button>

          <button className="st-launch-item" onClick={uid ? goList : toLogin} disabled={!!uid && !visible.length}>
            <span className="st-launch-ico" aria-hidden>▤</span>
            <span className="st-launch-txt">
              <b>{t('我的设计', 'My designs')}</b>
              <em>{!uid
                ? t('登录后查看', 'Sign in to view')
                : visible.length
                  ? t(`${visible.length} 个项目`, `${visible.length} projects`)
                  : t('还没有项目', 'No projects yet')}</em>
            </span>
            <span className="st-launch-go" aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>, document.body)}
  </div>;
}
