/* ============================================================
   Studio 2.0 — 需求采集（无缝页面）
   ------------------------------------------------------------
   这一阶段用户是在「读一份说明书」，不是在做图：
   所以中间不是一张带阴影的纸卡，而是直接铺在页面上的长文，
   没有卡片边界、没有缩放、没有工具条——滚下去就是下一页。
   做图的部分全部留给编辑器（DesignStage）。
   ============================================================ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import { useApp } from '../store';
import { Icon } from '../components/icons';
import { STEPS, StepBody } from './steps';
import {
  CATEGORIES, PATTERNS, STYLES, exportStructured, formDef, missingRequired, sizeText,
  type Ans, type StudioProject,
} from './types';
import { Booting, Frame, type MobileView } from './Frame';
import { useStudioProject } from './useStudio';
import { buildDesign } from './design';
import StudioChat from './StudioChat';

const TOTAL = STEPS.length;
export const SUMMARY_PAGE = TOTAL + 1;
const MAX_CHAT = 60;

const stepOf = (p: StudioProject) => Math.min(SUMMARY_PAGE, Math.max(1, p.step || 1));

const recommendSizeOf = (p: StudioProject) => formDef(p.answers.form.v)?.size || null;

/** 进入第四步时先把 AI 建议塞进去（未经确认），避免用户看到空尺寸 */
function withSuggestion(p: StudioProject): StudioProject {
  if (p.step !== 4 || p.answers.size || !p.answers.form.v) return p;
  const dims = recommendSizeOf(p);
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

function crumbsOf(p: StudioProject): string[] {
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

export default function BriefFlow({ id, onDesign }: { id: string; onDesign: () => void }) {
  const { t } = useLang();
  const { setToast } = useApp();
  const { project, loadState, saveState, savedAt, message, update, saveNow, uid } = useStudioProject(id);
  const [tab, setTab] = useState('pages');
  const [view, setView] = useState<MobileView>('canvas');
  const [warn, setWarn] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const page = project ? stepOf(project) : 1;

  const goPage = useCallback((n: number) => {
    setWarn('');
    update((cur) => withSuggestion({ ...cur, step: Math.min(SUMMARY_PAGE, Math.max(1, n)) }));
  }, [update]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [page]);

  const missing = useMemo(() => (project ? missingRequired(project) : []), [project]);

  /* 交给 AI 的上下文：当前页 + 结构化需求。
     必须在所有条件 return 之前——hook 数量前后不一致会白屏（React #310）。 */
  const context = useMemo(() => {
    if (!project) return '';
    const br = exportStructured(project);
    const meta = page <= TOTAL ? STEPS[page - 1] : null;
    const cur = meta ? `第 ${page} / ${TOTAL} 页 · ${meta.zh}` : '需求总结页';
    return `【用户正在填的页面】${cur}
【结构化需求】
${JSON.stringify({ written: br.written, selected: br.selected, ai: br.ai, pending: br.pending })}`;
  }, [project, page]);

  const openDesign = () => { setWarn(''); onDesign(); };

  const confirm = async () => {
    if (!project) return;
    if (missing.length) {
      // goPage 会把 warn 清空，所以先跳页、再把提示写回去
      goPage(missing[0].step);
      setWarn(t(`还缺：${missing.map((m) => m.zh).join('、')}`, `Still missing: ${missing.map((m) => m.en).join(', ')}`));
      return;
    }
    update((cur) => {
      const base: StudioProject = {
        ...cur,
        status: 'confirmed',
        confirmedAt: cur.confirmedAt || Date.now(),
        step: SUMMARY_PAGE,
      };
      return { ...base, design: cur.design || buildDesign(base) };
    });
    const ok = await saveNow();
    setToast(ok
      ? t('需求已确认，正在打开编辑器', 'Brief confirmed — opening the canvas')
      : t('需求已确认，保存在本机，联网后会自动同步', 'Brief confirmed and saved locally — it will sync when online'));
    openDesign();
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

  /* ---------------- 左侧：页面 ---------------- */
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
    <div className="st-ed-sec-label">{t('需求条目', 'Brief items')}</div>
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

  /* ---------------- 中间：无缝页面 ---------------- */
  const meta = page <= TOTAL ? STEPS[page - 1] : null;
  const crumbs = crumbsOf(project);
  const pct = Math.round(((page - 1) / TOTAL) * 100);

  const flow = <div className="st-flow" ref={scrollRef}>
    <div className="st-flow-prog" aria-hidden><i style={{ width: `${page > TOTAL ? 100 : pct}%` }} /></div>

    <div className="st-flow-in">
      <div className="st-flow-kicker">
        <span>{page <= TOTAL ? t(`第 ${page} 页 / 共 ${TOTAL} 页`, `Page ${page} of ${TOTAL}`) : t('最后一页', 'Final page')}</span>
        <em>{crumbs.join('  ·  ')}</em>
      </div>

      {meta && <div className="st-flow-body" key={page}>
        <h1>{t(meta.zh, meta.en)}</h1>
        <p className="st-flow-sub">{t(meta.subZh, meta.subEn)}</p>
        <StepBody p={project} set={update} next={() => goPage(page + 1)} t={t} />
        {warn && <p className="st-warn" role="status">{warn}</p>}
      </div>}

      {!meta && <div className="st-flow-body" key="summary">
        <SummaryBody
          p={project}
          missing={missing}
          warn={warn}
          onEdit={goPage}
          onConfirm={() => void confirm()}
          onDesign={openDesign}
          t={t}
        />
      </div>}
    </div>

    <div className="st-flow-foot">
      <button className="st-flow-nav" onClick={() => goPage(page - 1)} disabled={page <= 1}>
        <Icon name="chevronLeft" size={15} />{t('上一页', 'Back')}
      </button>
      <button className="st-flow-dots" onClick={() => goPage(SUMMARY_PAGE)} title={t('看需求总结', 'Review the brief')}>
        {Array.from({ length: TOTAL + 1 }, (_, i) => i + 1).map((n) => <i
          key={n}
          className={`${page === n ? 'on' : ''} ${n <= TOTAL && filled(project, n) ? 'is-filled' : ''}`}
        />)}
      </button>
      {page >= SUMMARY_PAGE
        ? <button className="st-flow-nav is-primary" onClick={project.status === 'confirmed' ? openDesign : () => void confirm()}>
          {project.status === 'confirmed' ? t('进入编辑器', 'Open canvas') : t('确认需求', 'Confirm')}<Icon name="chevronRight" size={15} />
        </button>
        : <button className="st-flow-nav is-primary" onClick={() => goPage(page + 1)}>
          {t('下一页', 'Next')}<Icon name="chevronRight" size={15} />
        </button>}
    </div>
  </div>;

  const actions = <>
    {project.status === 'confirmed' && <button className="st-ed-primary" onClick={openDesign}>
      {t('进入编辑器', 'Open canvas')}<Icon name="chevronRight" size={15} />
    </button>}
    {!(page === SUMMARY_PAGE && project.status === 'confirmed') && <button
      className={project.status === 'confirmed' ? 'st-ed-ghost' : 'st-ed-primary'}
      onClick={() => (page === SUMMARY_PAGE ? void confirm() : goPage(SUMMARY_PAGE))}
    >
      {page === SUMMARY_PAGE ? t('确认需求', 'Confirm brief') : t('查看总结', 'Review')}
      <Icon name="chevronRight" size={15} />
    </button>}
  </>;

  return <Frame
    mode="flow"
    backTo="/studio"
    backLabel={t('项目', 'Projects')}
    title={<span className="st-ed-name" title={project.name}>{project.name}</span>}
    save={<span className={`st-save ${saveState}`} title={message || undefined}><i aria-hidden />{saveLabel}</span>}
    actions={actions}
    tabs={[
      { id: 'pages', label: t('页面', 'Pages') },
      { id: 'layers', label: t('需求', 'Brief') },
      { id: 'assets', label: t('素材', 'Assets') },
    ]}
    tab={tab}
    onTab={setTab}
    left={tab === 'pages' ? pagesPane : tab === 'layers' ? layersPane : assetsPane}
    leftFoot={<button className="st-ed-back-list" onClick={() => go('/studio')}>
      <Icon name="folder" size={14} />{t('所有项目', 'All projects')}
    </button>}
    center={flow}
    right={<StudioChat
      messages={project.chat || []}
      onChange={(next) => update((cur) => ({ ...cur, chat: next.slice(-MAX_CHAT) }))}
      context={context}
      cloudbaseUid={uid}
    />}
    view={view}
    onView={setView}
    panelLabel={t('目录', 'Contents')}
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

function SummaryBody({ p, missing, warn, onEdit, onConfirm, onDesign, t }: {
  p: StudioProject;
  missing: { step: number; zh: string; en: string }[];
  warn: string;
  onEdit: (n: number) => void;
  onConfirm: () => void;
  onDesign: () => void;
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
    <p className="st-flow-sub">{confirmed
      ? t('这份需求已经确认。编辑器里的每一版都以它为准，改动需要重新确认。', 'Confirmed. Every version on the canvas follows this brief.')
      : t('每一项都标了来源。确认之后就会打开编辑器，第一版版面按这些信息排。', 'Each line shows where it came from. Confirm and the canvas opens with a first layout.')}</p>

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
        ? <>
          <span className="st-ed-ok"><Icon name="check" size={13} />{t('需求已确认', 'Brief confirmed')}</span>
          <button className="st-btn st-btn-dark" onClick={onDesign}>
            {t('进入编辑器做图', 'Open the canvas')}<span aria-hidden>→</span>
          </button>
        </>
        : <>
          <button className="st-btn st-btn-ghost" onClick={() => onEdit(p.step <= 10 ? p.step : 1)}>{t('继续填写', 'Keep editing')}</button>
          <button className="st-btn st-btn-dark" onClick={onConfirm}>
            {t('确认需求，打开编辑器', 'Confirm and open the canvas')}<span aria-hidden>→</span>
          </button>
        </>}
    </div>
  </div>;
}
