/* ============================================================
   Studio 2.0 — 九步向导 + 需求总结
   ------------------------------------------------------------
   顶部：步骤进度（可点已走过的步骤回去改）
   中间：一次只出现一步，切步有过渡
   底部：上一步 / 下一步，自动保存状态一直在
   最后：需求总结卡 —— 每一项都标明是「你填写 / 你选择 / AI 建议」，
        没填的显示「未填写」，不替用户补。
   确认之后的按钮进入「待开发」状态，不放任何假图片。
   ============================================================ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import { useApp } from '../store';
import { useStudioProject } from './useStudio';
import { STEPS, StepBody } from './steps';
import {
  CATEGORIES, PATTERNS, STYLES, formDef, recommendSize, sizeText,
  missingRequired, type Ans, type StudioProject,
} from './types';
import { PatternArt } from './art';

const TOTAL = STEPS.length;

const timeOf = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

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

type Screen = 'wizard' | 'summary' | 'result';

export default function StudioWizard({ id }: { id: string }) {
  const { t } = useLang();
  const { setToast } = useApp();
  const { project, loadState, saveState, savedAt, message, update, saveNow } = useStudioProject(id);
  const [screen, setScreen] = useState<Screen>(() => (project?.status === 'confirmed' ? 'summary' : 'wizard'));
  const [maxStep, setMaxStep] = useState(() => project?.step || 1);
  const [warn, setWarn] = useState('');
  const topRef = useRef<HTMLDivElement>(null);

  /* 项目从缓存切到云端版本后，把「最远走到哪」补上 */
  useEffect(() => {
    if (project) setMaxStep((m) => Math.max(m, project.step));
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = project?.step || 1;
  const meta = STEPS[Math.min(step, TOTAL) - 1];

  const goStep = useCallback((n: number, opts?: { keepScreen?: boolean }) => {
    const to = Math.min(TOTAL, Math.max(1, n));
    setWarn('');
    if (!opts?.keepScreen) setScreen('wizard');
    update((cur) => withSuggestion({ ...cur, step: to }));
    setMaxStep((m) => Math.max(m, to));
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [update]);

  const next = useCallback(() => {
    if (!project) return;
    const a = project.answers;
    if (step === 1 && !a.category.v) { setWarn(t('先选一个产品类别。', 'Pick a category first.')); return; }
    if (step === 3 && !a.form.v) { setWarn(t('选一个最接近的包装形式。', 'Pick the closest packaging format.')); return; }
    if (step === 5 && !a.stylePrimary.v) { setWarn(t('选一个主风格。', 'Pick a lead style.')); return; }
    if (step === 4 && (!a.size || !a.size.confirmed)) {
      setWarn(a.size
        ? t('推荐尺寸还需要你点一下「确认这个尺寸」。', 'Confirm the suggested size before moving on.')
        : t('先选一个尺寸，或者填自定义尺寸。', 'Choose a size, or enter your own.'));
      return;
    }
    if (step >= TOTAL) { setScreen('summary'); return; }
    goStep(step + 1);
  }, [project, step, goStep, t]);

  const prev = useCallback(() => {
    if (step <= 1) return;
    goStep(step - 1);
  }, [step, goStep]);

  const missing = useMemo(() => (project ? missingRequired(project) : []), [project]);

  const confirm = async () => {
    if (!project) return;
    if (missing.length) {
      setWarn(t(`还缺：${missing.map((m) => m.zh).join('、')}`, `Still missing: ${missing.map((m) => m.en).join(', ')}`));
      goStep(missing[0].step);
      return;
    }
    update((cur) => ({ ...cur, status: 'confirmed', confirmedAt: Date.now(), step: TOTAL }));
    const ok = await saveNow();
    setScreen('result');
    setToast(ok
      ? t('需求已确认并保存到云端', 'Brief confirmed and saved')
      : t('需求已确认，保存在本机，联网后会自动同步', 'Brief confirmed and saved locally — it will sync when online'));
  };

  /* ------------------------------ 加载态 ------------------------------ */
  if (loadState === 'loading') {
    return <div className="st-wizard">
      <div className="st-loading">
        <span className="st-spin" aria-hidden />
        {t('正在打开这个设计项目…', 'Opening this design…')}
      </div>
    </div>;
  }

  if (!project) {
    return <div className="st-wizard">
      <div className="st-missing">
        <h1>{t('找不到这个项目', 'Project not found')}</h1>
        <p>{t('它可能被删除了，或者属于另一个账号。不同账号之间读不到彼此的设计。',
          'It may have been deleted, or it belongs to another account. Designs are private per account.')}</p>
        <button className="st-btn st-btn-dark" onClick={() => go('/studio')}>{t('回到工作室', 'Back to studio')}</button>
      </div>
    </div>;
  }

  const saveLabel = saveState === 'saving' ? t('保存中…', 'Saving…')
    : saveState === 'saved' ? t(`已保存 ${savedAt ? timeOf(savedAt) : ''}`, `Saved ${savedAt ? timeOf(savedAt) : ''}`)
      : saveState === 'error' ? t('云端保存失败，已存本机', 'Cloud save failed — saved locally')
        : saveState === 'local' ? t('只保存在本机', 'Saved locally')
          : t('自动保存已开启', 'Auto-save on');

  return <div className="st-wizard" ref={topRef}>
    <header className="st-bar">
      <button className="st-bar-back" onClick={() => go('/studio')} aria-label={t('回到工作室', 'Back to studio')}>
        <span aria-hidden>←</span>{t('工作室', 'Studio')}
      </button>
      <div className="st-bar-name" title={project.name}>{project.name}</div>
      <div className={`st-save ${saveState}`} title={message || undefined}>
        <i aria-hidden />
        {screen === 'wizard' ? saveLabel : project.status === 'confirmed' ? t('需求已确认', 'Brief confirmed') : saveLabel}
      </div>
    </header>

    {screen === 'wizard' && <>
      <div className="st-progress">
        <div className="st-progress-top">
          <span className="st-step-index">{String(step).padStart(2, '0')}<i>/ {String(TOTAL).padStart(2, '0')}</i></span>
          <span className="st-progress-hint">
            {meta.required ? t('必答', 'Required') : t('可跳过', 'Optional')}
          </span>
        </div>
        <div className="st-track" aria-hidden><i style={{ width: `${(step / TOTAL) * 100}%` }} /></div>
        <div className="st-dots">
          {STEPS.map((s) => <button
            key={s.n}
            className={`st-dot ${s.n === step ? 'on' : ''} ${s.n < step || s.n <= maxStep ? 'done' : ''}`}
            disabled={s.n > maxStep}
            onClick={() => goStep(s.n)}
            title={t(s.zh, s.en)}
            aria-current={s.n === step ? 'step' : undefined}
          ><span>{s.n}</span></button>)}
        </div>
      </div>

      <div className="st-step" key={step}>
        <h1 className="st-step-title">{t(meta.zh, meta.en)}</h1>
        <p className="st-step-sub">{t(meta.subZh, meta.subEn)}</p>
        <StepBody p={project} set={update} next={next} t={t} />
        {warn && <p className="st-warn" role="status">{warn}</p>}
      </div>

      <div className="st-actions">
        <button className="st-btn st-btn-ghost" onClick={prev} disabled={step === 1}>{t('上一步', 'Back')}</button>
        <button className="st-btn st-btn-dark" onClick={next}>
          {step >= TOTAL ? t('查看需求总结', 'Review brief') : t('下一步', 'Next')}<span aria-hidden>→</span>
        </button>
      </div>
    </>}

    {screen === 'summary' && <Summary
      p={project}
      missing={missing}
      onEdit={(n) => goStep(n)}
      onConfirm={confirm}
      warn={warn}
      t={t}
    />}

    {screen === 'result' && <ResultPending
      p={project}
      t={t}
      onEdit={() => setScreen('summary')}
    />}
  </div>;
}

/* ------------------------------------------------------------ */
/* 需求总结                                                       */
/* ------------------------------------------------------------ */

function badgeOf(a: Ans<unknown>, t: (zh: string, en: string) => string): { text: string; tone: string } {
  if (a.src === 'none' || a.v === '' || a.v === null) return { text: t('未填写', 'Empty'), tone: 'none' };
  if (a.src === 'user') return { text: t('你填写', 'You wrote'), tone: 'user' };
  if (a.src === 'option') return { text: t('你选择', 'You picked'), tone: 'pick' };
  return a.confirmed
    ? { text: t('AI 建议 · 已确认', 'AI · confirmed'), tone: 'ok' }
    : { text: t('AI 建议 · 待确认', 'AI · unconfirmed'), tone: 'warn' };
}

function Row({ label, value, badge, onEdit }: {
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

function Summary({ p, missing, onEdit, onConfirm, warn, t }: {
  p: StudioProject;
  missing: { step: number; zh: string; en: string }[];
  onEdit: (n: number) => void;
  onConfirm: () => void;
  warn: string;
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

  return <div className="st-summary">
    <div className="st-sum-head">
      <span className="st-eyebrow">{t('需求总结', 'Brief summary')}</span>
      <h1>{p.name}</h1>
      <p>{confirmed
        ? t('这份需求已经确认。后续生成都以它为准，改动需要重新确认。', 'Confirmed. Everything downstream follows this brief.')
        : t('检查一遍，确认后才会进入创意生成。每一项都标了它的来源。', 'Check once — generation starts only after you confirm. Each line shows where it came from.')}</p>
    </div>

    <div className="st-sum-card">
      <Row label={t('产品类别', 'Category')} onEdit={() => onEdit(1)} badge={badgeOf(a.category, t)}
        value={cat ? t(cat.zh, cat.en) : <i className="st-emptyv">{t('未选择', 'Not chosen')}</i>} />
      <Row label={t('产品名称', 'Product')} onEdit={() => onEdit(2)} badge={badgeOf(a.productName, t)}
        value={a.productName.v || <i className="st-emptyv">{t('未填写', 'Empty')}</i>} />
      <Row label={t('产品内容', 'Contents')} onEdit={() => onEdit(2)} badge={badgeOf(a.productContent, t)}
        value={a.productContent.v || <i className="st-emptyv">{t('未填写', 'Empty')}</i>} />
      <Row label={t('产品卖点', 'Selling points')} onEdit={() => onEdit(2)} badge={badgeOf(a.sellingPoints, t)}
        value={a.sellingPoints.v || <i className="st-emptyv">{t('未填写', 'Empty')}</i>} />
      <Row label={t('包装形式', 'Format')} onEdit={() => onEdit(3)} badge={badgeOf(a.form, t)}
        value={form ? t(form.zh, form.en) : <i className="st-emptyv">{t('未选择', 'Not chosen')}</i>} />
      <Row label={t('包装尺寸', 'Size')} onEdit={() => onEdit(4)}
        badge={a.size
          ? (a.size.mode === 'custom'
            ? { text: t('你填写', 'You set'), tone: 'user' }
            : a.size.confirmed
              ? { text: t('AI 建议 · 已确认', 'AI · confirmed'), tone: 'ok' }
              : { text: t('AI 建议 · 待确认', 'AI · unconfirmed'), tone: 'warn' })
          : { text: t('未填写', 'Empty'), tone: 'none' }}
        value={a.size ? sizeText(a.size.dims) : <i className="st-emptyv">{t('未选择', 'Not chosen')}</i>} />
      <Row label={t('主风格', 'Lead style')} onEdit={() => onEdit(5)} badge={badgeOf(a.stylePrimary, t)}
        value={primary ? t(primary.zh, primary.en) : <i className="st-emptyv">{t('未选择', 'Not chosen')}</i>} />
      <Row label={t('辅助风格', 'Supporting')} onEdit={() => onEdit(5)} badge={badgeOf(a.styleSecondary, t)}
        value={secondary.length ? secondary.join(' · ') : <i className="st-emptyv">{t('未选择', 'None')}</i>} />
      <Row label={t('配色', 'Palette')} onEdit={() => onEdit(6)} badge={badgeOf(a.colors, t)}
        value={palette.length
          ? <span className="st-sum-colors">{palette.map((hex) => <i key={hex} style={{ background: hex }} title={hex} />)}{a.colorRef.v ? <em>{t('含参考图', '+ reference')}</em> : null}</span>
          : <i className="st-emptyv">{t('未选择', 'None')}</i>} />
      <Row label={t('图案', 'Graphics')} onEdit={() => onEdit(7)} badge={badgeOf(a.patterns, t)}
        value={patterns.length
          ? <span className="st-sum-pats">{patterns.map((x) => <i key={x.id} title={t(x.zh, x.en)}><PatternArt id={x.id} /></i>)}</span>
          : <i className="st-emptyv">{t('未选择', 'None')}</i>} />
      <Row label={t('品牌 Logo', 'Logo')} onEdit={() => onEdit(8)}
        badge={{ text: a.logo.mode ? t('你选择', 'You picked') : t('未填写', 'Empty'), tone: a.logo.mode ? 'pick' : 'none' }}
        value={a.logo.mode === 'upload'
          ? (a.logo.image ? t('已上传 Logo', 'Logo uploaded') : t('还没选文件', 'No file yet'))
          : a.logo.mode === 'reference'
            ? (a.logo.refImage ? t('已上传参考图', 'Reference uploaded') : t('还没选文件', 'No file yet'))
            : a.logo.mode === 'none' ? t('暂时没有', 'Not yet')
              : <i className="st-emptyv">{t('未选择', 'Not chosen')}</i>} />
      <Row label={t('补充要求', 'Notes')} onEdit={() => onEdit(9)} badge={badgeOf(a.extra, t)}
        value={a.extra.v || <i className="st-emptyv">{t('未填写', 'Empty')}</i>} />
    </div>

    <div className="st-sum-note">
      {t('未填写的项保持为空：我们不会替你编造配方、功效、认证或规格。',
        'Blank stays blank — we never invent formulas, claims, certifications or specs.')}
    </div>

    {missing.length > 0 && <div className="st-missing-list">
      <b>{t('确认前还差：', 'Before confirming:')}</b>
      <div>{missing.map((m) => <button key={m.step} onClick={() => onEdit(m.step)}>{t(m.zh, m.en)}</button>)}</div>
    </div>}

    {warn && <p className="st-warn" role="status">{warn}</p>}

    <div className="st-actions">
      <button className="st-btn st-btn-ghost" onClick={() => onEdit(p.step)}>{t('返回修改', 'Back to edit')}</button>
      <button className="st-btn st-btn-dark" onClick={onConfirm}>
        {confirmed ? t('查看生成状态', 'View generation status') : t('确认需求，生成我的包装', 'Confirm and build my packaging')}
        <span aria-hidden>→</span>
      </button>
    </div>
  </div>;
}

/* ------------------------------------------------------------ */
/* 待开发：创意生成                                               */
/* ------------------------------------------------------------ */

function ResultPending({ p, t, onEdit }: {
  p: StudioProject;
  t: (zh: string, en: string) => string;
  onEdit: () => void;
}) {
  return <div className="st-result">
    <div className="st-result-art" aria-hidden>
      <span className="st-result-grid" />
      <span className="st-result-box" />
      <span className="st-result-tag">{t('开发中', 'In build')}</span>
    </div>
    <span className="st-eyebrow">{t('需求已保存', 'Brief saved')}</span>
    <h1>{t('创意生成正在开发中。', 'Concept generation is in development.')}</h1>
    <p>
      {t('这一阶段只做到「把需求说清楚」。你的答案已经存成结构化数据，下一阶段接入图片生成后，会直接在这里出包装方案 —— 我们不会用示意图冒充生成结果。',
        'This phase stops at a complete brief. Your answers are stored as structured data; once image generation is connected, concepts will appear here. We will not pass off mock-ups as results.')}
    </p>
    <div className="st-result-meta">
      <span>{t('项目', 'Project')}：{p.name}</span>
      <span>{t('状态', 'Status')}：{t('需求已确认', 'Confirmed')}</span>
    </div>
    <div className="st-actions">
      <button className="st-btn st-btn-ghost" onClick={onEdit}>{t('查看需求总结', 'View brief')}</button>
      <button className="st-btn st-btn-dark" onClick={() => go('/studio')}>{t('回到工作室', 'Back to studio')}</button>
    </div>
  </div>;
}
