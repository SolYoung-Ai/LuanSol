/* ============================================================
   Studio 2.0 — 包装工作台（编辑器版）
   ------------------------------------------------------------
   版式参考专业设计工具（Framer 那一类）：
     左：面板（需求页面 / 图层 / 素材）
     中：画布 —— 当前这一步就是画布上的一张纸，可以缩放
     右：Luna AI 顾问，实时读你填的需求来回答
   与旧版向导的差别不是换个皮肤：
     · 九步不再是「必须按顺序走完的表单」，而是九个可以随时跳的页面；
     · 每一步的完成状态直接标在左侧列表上，缺什么一眼看得到；
     · 需求总结是第 10 页，确认后仍然只到「待生成」——不拿示意图冒充结果。
   ============================================================ */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { go, useHash } from '../ui';
import { useLang } from '../i18n';
import { useAuth } from '../cloud/auth';
import { useApp } from '../store';
import { useSubscription } from '../cloud/subscription';
import { Icon } from '../components/icons';
import {
  cacheOne, dropCached, listStudio, pushStudio, removeStudio,
} from './api';
import { STEPS, StepBody } from './steps';
import {
  CATEGORIES, PATTERNS, STYLES, createStudioProject, exportStructured, formDef,
  missingRequired, recommendSize, sizeText,
  type Ans, type StudioProject,
} from './types';
import { useStudioProject } from './useStudio';
import { mergeRows, rowsFromCache, timeLabel, type StudioRow } from './rows';
import StudioChat from './StudioChat';

const TOTAL = STEPS.length;
const SUMMARY_PAGE = TOTAL + 1;
const MAX_CHAT = 60;

/* ------------------------------------------------------------ */
/* 小工具                                                        */
/* ------------------------------------------------------------ */

const stepOf = (p: StudioProject) => Math.min(SUMMARY_PAGE, Math.max(1, p.step || 1));

/** 进入第四步时先把 AI 建议塞进去（未经确认），避免用户看到空尺寸 */
function withSuggestion(p: StudioProject): StudioProject {
  if (p.step !== 4 || p.answers.size || !p.answers.form.v) return p;
  const dims = recommendSize(p.answers.form.v);
  if (!dims) return p;
  return {
    ...p,
    answers: { ...p.answers, size: { mode: 'recommended', dims, src: 'ai', confirmed: false } },
    suggestion: { form: p.answers.form.v, dims, at: Date.now() },
  };
}

/** 这一步有没有内容：用于左侧列表的状态点，不做强制校验 */
function filled(p: StudioProject, n: number): boolean {
  const a = p.answers;
  switch (n) {
    case 1: return !!a.category.v;
    case 2: return !!a.productName.v.trim();
    case 3: return !!a.form.v;
    case 4: return !!a.size && (a.size.mode === 'custom' || a.size.confirmed);
    case 5: return !!a.stylePrimary.v;
    case 6: return a.colors.v.length > 0 || a.customColors.v.length > 0 || !!a.colorRef.v;
    case 7: return a.patterns.v.length > 0;
    case 8: return !!a.logo.mode;
    case 9: return !!a.extra.v.trim();
    default: return p.status === 'confirmed';
  }
}

/** 画布上方那一行摘要：有就写，没有就写「未定」，不替用户补 */
function sheetMeta(p: StudioProject): string[] {
  const a = p.answers;
  const cat = CATEGORIES.find((c) => c.id === a.category.v);
  const form = formDef(a.form.v);
  return [
    a.productName.v.trim() || '未命名设计',
    cat?.zh || '类别未定',
    form?.zh || '形式未定',
    a.size ? sizeText(a.size.dims) : '尺寸未定',
  ];
}

/* ------------------------------------------------------------ */
/* 外壳：顶部栏 + 三个面板                                        */
/* ------------------------------------------------------------ */

type MobileView = 'left' | 'canvas' | 'ai';

interface FrameProps {
  /** 左上角返回去哪：工作台里回「项目列表」，首页状态回站内首页 */
  backTo: string;
  backLabel: string;
  title: React.ReactNode;
  save?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: { id: string; label: string }[];
  tab?: string;
  onTab?: (id: string) => void;
  left: React.ReactNode;
  leftFoot?: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  view: MobileView;
  onView: (v: MobileView) => void;
  panelLabel: string;
}

function Frame(p: FrameProps) {
  const { t } = useLang();
  return <div className={`st-ed st-ed-v-${p.view}`}>
    <header className="st-ed-top">
      <div className="st-ed-top-l">
        <button className="st-ed-back" onClick={() => go(p.backTo)} aria-label={p.backLabel}>
          <Icon name="chevronLeft" size={16} />
          <span>{p.backLabel}</span>
        </button>
        <div className="st-ed-brand">Luna<i>Sol</i><em>{t('包装工作台', 'Workbench')}</em></div>
      </div>

      <div className="st-ed-top-c">
        <div className="st-ed-name">{p.title}</div>
        {p.save}
      </div>

      <div className="st-ed-top-r">{p.actions}</div>
    </header>

    <div className="st-ed-switch" role="tablist" aria-label={t('视图', 'View')}>
      <button className={p.view === 'left' ? 'on' : ''} onClick={() => p.onView('left')} role="tab">{p.panelLabel}</button>
      <button className={p.view === 'canvas' ? 'on' : ''} onClick={() => p.onView('canvas')} role="tab">{t('画布', 'Canvas')}</button>
      <button className={p.view === 'ai' ? 'on' : ''} onClick={() => p.onView('ai')} role="tab">Luna AI</button>
    </div>

    <div className="st-ed-body">
      <aside className="st-ed-left">
        {!!p.tabs?.length && <div className="st-ed-tabs" role="tablist">
          {p.tabs.map((x) => <button
            key={x.id}
            role="tab"
            aria-selected={p.tab === x.id}
            className={p.tab === x.id ? 'on' : ''}
            onClick={() => p.onTab?.(x.id)}
          >{x.label}</button>)}
        </div>}
        <div className="st-ed-pane">{p.left}</div>
        {p.leftFoot && <div className="st-ed-left-foot">{p.leftFoot}</div>}
      </aside>

      <main className="st-ed-canvas">{p.center}</main>

      <aside className="st-ed-right">{p.right}</aside>
    </div>
  </div>;
}

/* ------------------------------------------------------------ */
/* 路由入口                                                       */
/* ------------------------------------------------------------ */

function Booting({ text }: { text: string }) {
  return <div className="st-ed-boot">
    <span className="st-spin" aria-hidden />
    {text}
  </div>;
}

export default function StudioEditor() {
  const { t } = useLang();
  const auth = useAuth();
  const hash = useHash();
  const id = new URLSearchParams(hash.split('?')[1] || '').get('id') || '';

  if (!auth.ready) return <Booting text={t('正在确认登录状态…', 'Checking your session…')} />;
  return id ? <ProjectEditor key={id} id={id} /> : <ProjectHome />;
}

/* ------------------------------------------------------------ */
/* 没有打开项目：项目列表 + 开始页                                  */
/* ------------------------------------------------------------ */

function ProjectHome() {
  const { t } = useLang();
  const auth = useAuth();
  const sub = useSubscription();
  const { setToast } = useApp();
  const [rows, setRows] = useState<StudioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudErr, setCloudErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState('');
  const [view, setView] = useState<MobileView>('left');
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
  }, [uid, loadCloud]);

  const visible = useMemo(() => rows.filter((r) => !r.blank), [rows]);
  const last = visible[0] || null;
  const toLogin = () => go(`/login?next=${encodeURIComponent('/studio')}`);

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

  const list = <div className="st-ed-projects">
    <button className="st-ed-new" onClick={startNew} disabled={busy}>
      <Icon name="plus" size={15} />
      {t('新建包装项目', 'New packaging project')}
    </button>

    {!uid && <p className="st-ed-note">
      {t('登录后会按账号保存，换设备也能接着填。', 'Sign in and briefs are saved to your account, on any device.')}
      <button onClick={toLogin}>{t('去登录', 'Sign in')}</button>
    </p>}

    {uid && cloudErr && <p className="st-ed-note warn">
      {t(`云端列表没读出来：${cloudErr}`, `Cloud list failed: ${cloudErr}`)}
      <button onClick={() => void loadCloud()}>{t('重试', 'Retry')}</button>
    </p>}

    <div className="st-ed-sec-label">
      {t('我的设计', 'My designs')}
      {!!visible.length && <em>{visible.length}</em>}
    </div>

    {uid && loading && !visible.length && <div className="st-ed-skel"><i /><i /><i /></div>}

    {uid && !loading && !visible.length && <p className="st-ed-empty">
      {t('还没有项目。第一个会出现在这里。', 'Nothing yet — your first one lands here.')}
    </p>}

    {visible.map((r) => <div className={`st-ed-proj ${deleting === r.id ? 'is-confirm' : ''}`} key={r.id}>
      {deleting === r.id
        ? <>
          <span className="st-ed-proj-confirm">{t('删掉这个项目？', 'Delete this?')}</span>
          <button className="st-ed-proj-yes" onClick={() => void removeOne(r.id)}>{t('删除', 'Delete')}</button>
          <button className="st-ed-proj-no" onClick={() => setDeleting('')}>{t('取消', 'Cancel')}</button>
        </>
        : <>
          <button className="st-ed-proj-open" onClick={() => go(`/studio?id=${encodeURIComponent(r.id)}`)}>
            <b>{r.name}</b>
            <em>
              {r.status === 'confirmed'
                ? t('需求已确认', 'Confirmed')
                : r.step ? t(`第 ${Math.min(r.step, SUMMARY_PAGE)} 页`, `Page ${Math.min(r.step, SUMMARY_PAGE)}`) : t('云端项目', 'In cloud')}
              <span aria-hidden> · </span>{timeLabel(r.updatedAt)}
            </em>
          </button>
          <button
            className="st-ed-proj-del"
            onClick={() => setDeleting(r.id)}
            title={t('删除项目', 'Delete project')}
            aria-label={t('删除项目', 'Delete project')}
          ><Icon name="trash" size={14} /></button>
        </>}
    </div>)}
  </div>;

  const center = <div className="st-ed-home">
    <span className="st-eyebrow">{t('LunaSol · 包装工作台', 'LunaSol · Workbench')}</span>
    <h1>{t('从一个问题开始，', 'Start with a question,')}<br />{t('把包装需求说清楚。', 'and get the brief right.')}</h1>
    <p>{t('左边是页面，右边是 Luna。九页问完，需求就成了结构化数据，可以直接交给生成。',
      'Pages on the left, Luna on the right. Nine pages and the brief becomes structured data, ready for generation.')}</p>
    <div className="st-ed-home-actions">
      <button className="st-btn st-btn-dark" onClick={startNew} disabled={busy}>
        {t('开始一个新设计', 'Start a new design')}<span aria-hidden>→</span>
      </button>
      {last && <button className="st-btn st-btn-ghost" onClick={() => go(`/studio?id=${encodeURIComponent(last.id)}`)}>
        {t('继续上次设计', 'Continue last design')}
      </button>}
    </div>

    {last && <button className="st-ed-resume" onClick={() => go(`/studio?id=${encodeURIComponent(last.id)}`)}>
      <span className="st-ed-resume-tag">{t('上次做到', 'Last time')}</span>
      <b>{last.name}</b>
      <em>{last.status === 'confirmed'
        ? t('需求已确认', 'Brief confirmed')
        : t(`第 ${Math.min(last.step || 1, SUMMARY_PAGE)} 页 / 共 ${SUMMARY_PAGE} 页`, `Page ${Math.min(last.step || 1, SUMMARY_PAGE)} of ${SUMMARY_PAGE}`)} · {timeLabel(last.updatedAt)}</em>
      <span className="st-ed-resume-go" aria-hidden>→</span>
    </button>}
  </div>;

  return <Frame
    backTo="/"
    backLabel={t('首页', 'Home')}
    title={<span className="st-ed-name-soft">{t('选择或新建一个项目', 'Pick a project or start one')}</span>}
    actions={uid
      ? <span className="st-ed-credits"><b>{sub.usedLeft ?? '—'}</b>{t('积分', 'credits')}</span>
      : <button className="st-ed-login" onClick={toLogin}>{t('登录', 'Log in')}</button>}
    left={list}
    leftFoot={<span className="st-ed-foot-note">{t('需求按账号保存', 'Briefs saved per account')}</span>}
    center={center}
    right={<StudioChat
      messages={[]}
      onChange={() => { /* 没有项目时不落库 */ }}
      context=""
      cloudbaseUid={uid}
      idle
      onOpenProject={startNew}
    />}
    view={view}
    onView={setView}
    panelLabel={t('项目', 'Projects')}
  />;
}

/* ------------------------------------------------------------ */
/* 打开一个项目：编辑器                                            */
/* ------------------------------------------------------------ */

function ProjectEditor({ id }: { id: string }) {
  const { t } = useLang();
  const { setToast } = useApp();
  const { project, loadState, saveState, savedAt, message, update, saveNow, uid } = useStudioProject(id);
  const [tab, setTab] = useState('pages');
  const [view, setView] = useState<MobileView>('canvas');
  const [zoom, setZoom] = useState(100);
  const [warn, setWarn] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  const page = project ? stepOf(project) : 1;

  const goPage = useCallback((n: number) => {
    setWarn('');
    update((cur) => withSuggestion({ ...cur, step: Math.min(SUMMARY_PAGE, Math.max(1, n)) }));
    canvasRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [update]);

  /* 切页时把画布滚回顶部：不然从长页跳到短页会停在空白里 */
  useEffect(() => { canvasRef.current?.scrollTo({ top: 0 }); }, [page]);

  const missing = useMemo(() => (project ? missingRequired(project) : []), [project]);

  /* 交给 AI 的上下文：当前页 + 结构化需求。
     必须放在所有条件 return 之前——hook 数量前后不一致会直接白屏（React #310）。 */
  const context = useMemo(() => {
    if (!project) return '';
    const br = exportStructured(project);
    const meta = page <= TOTAL ? STEPS[page - 1] : null;
    const cur = meta ? `第 ${page} / ${TOTAL} 页 · ${meta.zh}` : '需求总结页';
    return `【用户正在填的页面】${cur}
【结构化需求】
${JSON.stringify({ written: br.written, selected: br.selected, ai: br.ai, pending: br.pending })}`;
  }, [project, page]);

  const confirm = async () => {
    if (!project) return;
    if (missing.length) {
      // goPage 会把 warn 清空，所以先跳页、再把提示写回去
      goPage(missing[0].step);
      setWarn(t(`还缺：${missing.map((m) => m.zh).join('、')}`, `Still missing: ${missing.map((m) => m.en).join(', ')}`));
      return;
    }
    update((cur) => ({ ...cur, status: 'confirmed', confirmedAt: Date.now(), step: SUMMARY_PAGE }));
    const ok = await saveNow();
    setToast(ok
      ? t('需求已确认并保存到云端', 'Brief confirmed and saved')
      : t('需求已确认，保存在本机，联网后会自动同步', 'Brief confirmed and saved locally — it will sync when online'));
  };

  const saveLabel = saveState === 'saving' ? t('保存中…', 'Saving…')
    : saveState === 'saved' ? t(`已保存 ${savedAt ? new Date(savedAt).toTimeString().slice(0, 5) : ''}`, `Saved ${savedAt ? new Date(savedAt).toTimeString().slice(0, 5) : ''}`)
      : saveState === 'error' ? t('云端失败 · 已存本机', 'Cloud failed · saved locally')
        : saveState === 'local' ? t('只存在本机', 'Local only')
          : t('自动保存', 'Auto-save');

  /* ---------------- 加载 / 未登录 / 找不到 ---------------- */
  if (loadState === 'loading') {
    return <div className="st-ed"><Booting text={t('正在打开这个项目…', 'Opening this project…')} /></div>;
  }

  if (loadState === 'locked') {
    return <div className="st-ed">
      <div className="st-ed-gate">
        <h1>{t('登录后才能打开这个设计', 'Sign in to open this design')}</h1>
        <p>{t('设计按账号存档，登录后就能接着填，换设备也一样。',
          'Designs are stored per account — sign in and this brief picks up where it stopped.')}</p>
        <div className="st-ed-gate-actions">
          <button className="st-btn st-btn-dark" onClick={() => go(`/login?next=${encodeURIComponent(`/studio?id=${id}`)}`)}>
            {t('去登录', 'Sign in')}<span aria-hidden>→</span>
          </button>
          <button className="st-btn st-btn-ghost" onClick={() => go('/studio')}>{t('回到项目列表', 'Back to projects')}</button>
        </div>
      </div>
    </div>;
  }

  if (!project) {
    return <div className="st-ed">
      <div className="st-ed-gate">
        <h1>{t('找不到这个项目', 'Project not found')}</h1>
        <p>{t('它可能被删除了，或者属于另一个账号。不同账号之间读不到彼此的设计。',
          'It may have been deleted, or it belongs to another account.')}</p>
        <button className="st-btn st-btn-dark" onClick={() => go('/studio')}>{t('回到项目列表', 'Back to projects')}</button>
      </div>
    </div>;
  }

  /* ---------------- 左侧：需求页面 ---------------- */
  const pagesPane = <div className="st-ed-pages">
    <div className="st-ed-sec-label">{t('页面', 'Pages')}<em>{STEPS.filter((s) => filled(project, s.n)).length} / {TOTAL}</em></div>
    {STEPS.map((s) => <button
      key={s.n}
      className={`st-ed-page ${page === s.n ? 'on' : ''} ${filled(project, s.n) ? 'is-filled' : ''}`}
      onClick={() => goPage(s.n)}
      aria-current={page === s.n ? 'page' : undefined}
    >
      <span className="st-ed-page-n">{String(s.n).padStart(2, '0')}</span>
      <span className="st-ed-page-t">{t(s.zh, s.en)}{s.required && <i>{t('必答', 'Req')}</i>}</span>
      <span className="st-ed-page-dot" aria-hidden />
    </button>)}
    <button
      className={`st-ed-page ${page === SUMMARY_PAGE ? 'on' : ''} ${project.status === 'confirmed' ? 'is-filled' : ''}`}
      onClick={() => goPage(SUMMARY_PAGE)}
    >
      <span className="st-ed-page-n">—</span>
      <span className="st-ed-page-t">{t('需求总结', 'Brief summary')}</span>
      <span className="st-ed-page-dot" aria-hidden />
    </button>
  </div>;

  /* ---------------- 左侧：图层（按答案列） ---------------- */
  const layerRows: { label: string; value: string; step: number }[] = [
    { label: t('产品类别', 'Category'), value: CATEGORIES.find((c) => c.id === project.answers.category.v)?.zh || '—', step: 1 },
    { label: t('产品名称', 'Product'), value: project.answers.productName.v || '—', step: 2 },
    { label: t('产品内容', 'Contents'), value: project.answers.productContent.v || '—', step: 2 },
    { label: t('卖点', 'Selling points'), value: project.answers.sellingPoints.v || '—', step: 2 },
    { label: t('包装形式', 'Format'), value: formDef(project.answers.form.v)?.zh || '—', step: 3 },
    { label: t('尺寸', 'Size'), value: project.answers.size ? sizeText(project.answers.size.dims) : '—', step: 4 },
    { label: t('主风格', 'Lead style'), value: STYLES.find((s) => s.id === project.answers.stylePrimary.v)?.zh || '—', step: 5 },
    {
      label: t('辅助风格', 'Supporting'),
      value: project.answers.styleSecondary.v.map((x) => STYLES.find((s) => s.id === x)?.zh || x).join(' · ') || '—',
      step: 5,
    },
    {
      label: t('配色', 'Palette'),
      value: [...project.answers.colors.v, ...project.answers.customColors.v].join(' ') || '—',
      step: 6,
    },
    {
      label: t('图案', 'Graphics'),
      value: project.answers.patterns.v.map((x) => PATTERNS.find((y) => y.id === x)?.zh || x).join(' · ') || '—',
      step: 7,
    },
    {
      label: t('Logo', 'Logo'),
      value: project.answers.logo.mode === 'upload' ? t('已上传', 'Uploaded')
        : project.answers.logo.mode === 'reference' ? t('已上传参考图', 'Reference')
          : project.answers.logo.mode === 'none' ? t('暂时没有', 'None') : '—',
      step: 8,
    },
    { label: t('补充要求', 'Notes'), value: project.answers.extra.v || '—', step: 9 },
  ];

  const layersPane = <div className="st-ed-layers">
    <div className="st-ed-sec-label">{t('图层', 'Layers')}</div>
    {layerRows.map((r) => <button key={r.label} className="st-ed-layer" onClick={() => goPage(r.step)}>
      <b>{r.label}</b>
      <em title={r.value}>{r.value}</em>
    </button>)}
    <div className="st-ed-sec-label">{t('配色色值', 'Swatches')}</div>
    <div className="st-ed-swatches">
      {[...project.answers.colors.v, ...project.answers.customColors.v].map((hex) => <i key={hex} style={{ background: hex }} title={hex} />)}
      {!project.answers.colors.v.length && !project.answers.customColors.v.length && <span className="st-ed-hint-inline">{t('还没选颜色', 'No colour yet')}</span>}
    </div>
  </div>;

  /* ---------------- 左侧：素材 ---------------- */
  const assets: { label: string; src: string; step: number }[] = [];
  if (project.answers.colorRef.v) assets.push({ label: t('色彩参考', 'Colour reference'), src: project.answers.colorRef.v, step: 6 });
  if (project.answers.logo.image) assets.push({ label: 'Logo', src: project.answers.logo.image, step: 8 });
  if (project.answers.logo.refImage) assets.push({ label: t('Logo 参考图', 'Logo reference'), src: project.answers.logo.refImage, step: 8 });

  const assetsPane = <div className="st-ed-assets">
    <div className="st-ed-sec-label">{t('素材', 'Assets')}<em>{assets.length}</em></div>
    {!assets.length && <p className="st-ed-empty">
      {t('还没有上传素材。色彩参考图与 Logo 都在对应页面里上传。',
        'No assets yet — upload references and logos from their pages.')}
    </p>}
    {!!assets.length && <div className="st-ed-asset-grid">
      {assets.map((a) => <button key={a.label + a.src.slice(-12)} onClick={() => goPage(a.step)} title={a.label}>
        <img src={a.src} alt={a.label} />
        <span>{a.label}</span>
      </button>)}
    </div>}
    <div className="st-ed-asset-actions">
      <button onClick={() => goPage(6)}><Icon name="image" size={14} />{t('色彩参考图', 'Colour reference')}</button>
      <button onClick={() => goPage(8)}><Icon name="upload" size={14} />{t('品牌 Logo', 'Brand logo')}</button>
    </div>
  </div>;

  /* ---------------- 画布 ---------------- */
  const meta = page <= TOTAL ? STEPS[page - 1] : null;
  const crumbs = sheetMeta(project);

  const canvas = <div className="st-ed-stage-wrap" ref={canvasRef}>
    <div className="st-ed-sheet" style={{ zoom: zoom / 100 }}>
      <header className="st-ed-sheet-head">
        <div className="st-ed-crumbs">
          {crumbs.map((x, i) => <span key={i} className={i === 0 ? 'is-strong' : ''}>{x}</span>)}
        </div>
        <span className="st-ed-sheet-page">{page <= TOTAL ? `${String(page).padStart(2, '0')} / ${String(TOTAL).padStart(2, '0')}` : t('总结', 'Summary')}</span>
      </header>

      {meta && <div className="st-ed-sheet-body" key={page}>
        <h1>{t(meta.zh, meta.en)}</h1>
        <p className="st-ed-sub">{t(meta.subZh, meta.subEn)}</p>
        <StepBody p={project} set={update} next={() => goPage(page + 1)} t={t} />
        {warn && <p className="st-warn" role="status">{warn}</p>}
      </div>}

      {!meta && <SummaryBody
        p={project}
        missing={missing}
        warn={warn}
        onEdit={goPage}
        onConfirm={confirm}
        t={t}
      />}
    </div>
  </div>;

  const toolbar = <div className="st-ed-tools">
    <button className="st-ed-tool" onClick={() => goPage(page - 1)} disabled={page <= 1} aria-label={t('上一页', 'Previous page')}>
      <Icon name="chevronLeft" size={16} />
    </button>
    <span className="st-ed-tool-sep" aria-hidden />
    <button className="st-ed-tool" onClick={() => setZoom((z) => Math.max(60, z - 10))} aria-label={t('缩小', 'Zoom out')}>
      <Icon name="zoomOut" size={16} />
    </button>
    <button className="st-ed-tool-num" onClick={() => setZoom(100)} title={t('回到 100%', 'Reset to 100%')}>{zoom}%</button>
    <button className="st-ed-tool" onClick={() => setZoom((z) => Math.min(130, z + 10))} aria-label={t('放大', 'Zoom in')}>
      <Icon name="zoomIn" size={16} />
    </button>
    <span className="st-ed-tool-sep" aria-hidden />
    <button className="st-ed-tool" onClick={() => setZoom(100)} aria-label={t('适应画布', 'Fit')}>
      <Icon name="fit" size={16} />
    </button>
    <span className="st-ed-tool-sep" aria-hidden />
    <button className="st-ed-tool-txt" onClick={() => goPage(page + 1)} disabled={page >= SUMMARY_PAGE}>
      {page >= SUMMARY_PAGE ? t('已是最后一页', 'Last page') : t('下一页', 'Next page')}
      <Icon name="chevronRight" size={15} />
    </button>
  </div>;

  const actions = <>
    {project.status === 'confirmed' && <span className="st-ed-ok"><Icon name="check" size={13} />{t('需求已确认', 'Confirmed')}</span>}
    {/* 确认过之后不再重复给「确认需求」：那一步已经在总结页里交代完了 */}
    {!(page === SUMMARY_PAGE && project.status === 'confirmed') && <button
      className="st-ed-primary"
      onClick={() => (page === SUMMARY_PAGE ? void confirm() : goPage(SUMMARY_PAGE))}
    >
      {page === SUMMARY_PAGE ? t('确认需求', 'Confirm brief') : t('查看总结', 'Review brief')}
      <Icon name="chevronRight" size={15} />
    </button>}
  </>;

  return <Frame
    backTo="/studio"
    backLabel={t('项目', 'Projects')}
    title={<span className="st-ed-name" title={project.name}>{project.name}</span>}
    save={<span className={`st-save ${saveState}`} title={message || undefined}><i aria-hidden />{saveLabel}</span>}
    actions={actions}
    tabs={[
      { id: 'pages', label: t('页面', 'Pages') },
      { id: 'layers', label: t('图层', 'Layers') },
      { id: 'assets', label: t('素材', 'Assets') },
    ]}
    tab={tab}
    onTab={setTab}
    left={tab === 'pages' ? pagesPane : tab === 'layers' ? layersPane : assetsPane}
    leftFoot={<button className="st-ed-back-list" onClick={() => go('/studio')}>
      <Icon name="folder" size={14} />{t('所有项目', 'All projects')}
    </button>}
    center={<>
      {canvas}
      {toolbar}
    </>}
    right={<StudioChat
      messages={project.chat || []}
      onChange={(next) => update((cur) => ({ ...cur, chat: next.slice(-MAX_CHAT) }))}
      context={context}
      cloudbaseUid={uid}
    />}
    view={view}
    onView={setView}
    panelLabel={t('页面', 'Pages')}
  />;
}

/* ------------------------------------------------------------ */
/* 需求总结（第 10 页）                                            */
/* ------------------------------------------------------------ */

function badgeOf(a: Ans<unknown>, t: (zh: string, en: string) => string) {
  if (a.src === 'none' || a.v === '' || a.v === null) return { text: t('未填写', 'Empty'), tone: 'none' };
  if (a.src === 'user') return { text: t('你填写', 'You wrote'), tone: 'user' };
  if (a.src === 'option') return { text: t('你选择', 'You picked'), tone: 'pick' };
  return a.confirmed
    ? { text: t('AI 建议 · 已确认', 'AI · confirmed'), tone: 'ok' }
    : { text: t('AI 建议 · 待确认', 'AI · unconfirmed'), tone: 'warn' };
}

function SummaryRow({ label, value, badge, onEdit }: {
  label: string;
  value: React.ReactNode;
  badge: { text: string; tone: string };
  onEdit: () => void;
}) {
  const { t } = useLang();
  return <div className="st-row">
    <div className="st-row-label">{label}</div>
    <div className="st-row-value">{value}</div>
    <span className={`st-badge ${badge.tone}`}>{badge.text}</span>
    <button className="st-row-edit" onClick={onEdit}>{t('修改', 'Edit')}</button>
  </div>;
}

function SummaryBody({ p, missing, warn, onEdit, onConfirm, t }: {
  p: StudioProject;
  missing: { step: number; zh: string; en: string }[];
  warn: string;
  onEdit: (n: number) => void;
  onConfirm: () => void;
  t: (zh: string, en: string) => string;
}) {
  const a = p.answers;
  const cat = CATEGORIES.find((c) => c.id === a.category.v);
  const form = formDef(a.form.v);
  const primary = STYLES.find((s) => s.id === a.stylePrimary.v);
  const secondary = a.styleSecondary.v.map((id) => STYLES.find((s) => s.id === id)?.zh).filter(Boolean);
  const palette = [...a.colors.v, ...a.customColors.v];
  const patterns = a.patterns.v.map((x) => PATTERNS.find((y) => y.id === x)).filter((x): x is NonNullable<typeof x> => !!x);
  const confirmed = p.status === 'confirmed';

  return <div className="st-ed-summary">
    <span className="st-eyebrow">{t('需求总结', 'Brief summary')}</span>
    <h1>{p.name}</h1>
    <p className="st-ed-sub">{confirmed
      ? t('这份需求已经确认。后续生成都以它为准，改动需要重新确认。', 'Confirmed. Everything downstream follows this brief.')
      : t('每一项都标了来源。确认之后才会进入创意生成。', 'Every line shows where it came from. Generation starts after you confirm.')}</p>

    <div className="st-sum-card">
      <SummaryRow label={t('产品类别', 'Category')} onEdit={() => onEdit(1)} badge={badgeOf(a.category, t)}
        value={cat ? t(cat.zh, cat.en) : <i className="st-emptyv">{t('未选择', 'Not chosen')}</i>} />
      <SummaryRow label={t('产品名称', 'Product')} onEdit={() => onEdit(2)} badge={badgeOf(a.productName, t)}
        value={a.productName.v || <i className="st-emptyv">{t('未填写', 'Empty')}</i>} />
      <SummaryRow label={t('产品内容', 'Contents')} onEdit={() => onEdit(2)} badge={badgeOf(a.productContent, t)}
        value={a.productContent.v || <i className="st-emptyv">{t('未填写', 'Empty')}</i>} />
      <SummaryRow label={t('产品卖点', 'Selling points')} onEdit={() => onEdit(2)} badge={badgeOf(a.sellingPoints, t)}
        value={a.sellingPoints.v || <i className="st-emptyv">{t('未填写', 'Empty')}</i>} />
      <SummaryRow label={t('包装形式', 'Format')} onEdit={() => onEdit(3)} badge={badgeOf(a.form, t)}
        value={form ? t(form.zh, form.en) : <i className="st-emptyv">{t('未选择', 'Not chosen')}</i>} />
      <SummaryRow label={t('包装尺寸', 'Size')} onEdit={() => onEdit(4)}
        badge={a.size
          ? (a.size.mode === 'custom'
            ? { text: t('你填写', 'You set'), tone: 'user' }
            : a.size.confirmed
              ? { text: t('AI 建议 · 已确认', 'AI · confirmed'), tone: 'ok' }
              : { text: t('AI 建议 · 待确认', 'AI · unconfirmed'), tone: 'warn' })
          : { text: t('未填写', 'Empty'), tone: 'none' }}
        value={a.size ? sizeText(a.size.dims) : <i className="st-emptyv">{t('未选择', 'Not chosen')}</i>} />
      <SummaryRow label={t('主风格', 'Lead style')} onEdit={() => onEdit(5)} badge={badgeOf(a.stylePrimary, t)}
        value={primary ? t(primary.zh, primary.en) : <i className="st-emptyv">{t('未选择', 'Not chosen')}</i>} />
      <SummaryRow label={t('辅助风格', 'Supporting')} onEdit={() => onEdit(5)} badge={badgeOf(a.styleSecondary, t)}
        value={secondary.length ? secondary.join(' · ') : <i className="st-emptyv">{t('未选择', 'None')}</i>} />
      <SummaryRow label={t('配色', 'Palette')} onEdit={() => onEdit(6)} badge={badgeOf(a.colors, t)}
        value={palette.length
          ? <span className="st-sum-colors">{palette.map((hex) => <i key={hex} style={{ background: hex }} title={hex} />)}{a.colorRef.v ? <em>{t('含参考图', '+ reference')}</em> : null}</span>
          : <i className="st-emptyv">{t('未选择', 'None')}</i>} />
      <SummaryRow label={t('图案', 'Graphics')} onEdit={() => onEdit(7)} badge={badgeOf(a.patterns, t)}
        value={patterns.length ? patterns.map((x) => t(x.zh, x.en)).join(' · ') : <i className="st-emptyv">{t('未选择', 'None')}</i>} />
      <SummaryRow label={t('品牌 Logo', 'Logo')} onEdit={() => onEdit(8)}
        badge={{ text: a.logo.mode ? t('你选择', 'You picked') : t('未填写', 'Empty'), tone: a.logo.mode ? 'pick' : 'none' }}
        value={a.logo.mode === 'upload'
          ? (a.logo.image ? t('已上传 Logo', 'Logo uploaded') : t('还没选文件', 'No file yet'))
          : a.logo.mode === 'reference'
            ? (a.logo.refImage ? t('已上传参考图', 'Reference uploaded') : t('还没选文件', 'No file yet'))
            : a.logo.mode === 'none' ? t('暂时没有', 'Not yet')
              : <i className="st-emptyv">{t('未选择', 'Not chosen')}</i>} />
      <SummaryRow label={t('补充要求', 'Notes')} onEdit={() => onEdit(9)} badge={badgeOf(a.extra, t)}
        value={a.extra.v || <i className="st-emptyv">{t('未填写', 'Empty')}</i>} />
    </div>

    <p className="st-sum-note">{t('未填写的项保持为空：我们不会替你编造配方、功效、认证或规格。',
      'Blank stays blank — we never invent formulas, claims, certifications or specs.')}</p>

    {!!missing.length && <div className="st-missing-list">
      <b>{t('确认前还差：', 'Before confirming:')}</b>
      <div>{missing.map((m) => <button key={m.step} onClick={() => onEdit(m.step)}>{t(m.zh, m.en)}</button>)}</div>
    </div>}

    {warn && <p className="st-warn" role="status">{warn}</p>}

    <div className="st-ed-summary-actions">
      {confirmed
        ? <span className="st-ed-ok"><Icon name="check" size={13} />{t('需求已确认，创意生成正在开发中', 'Confirmed — concept generation is in development')}</span>
        : <>
          <button className="st-btn st-btn-ghost" onClick={() => onEdit(p.step <= TOTAL ? p.step : 1)}>{t('继续填写', 'Keep editing')}</button>
          <button className="st-btn st-btn-dark" onClick={onConfirm}>
            {t('确认需求，生成我的包装', 'Confirm and build my packaging')}<span aria-hidden>→</span>
          </button>
        </>}
    </div>
  </div>;
}
