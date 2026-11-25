/* ============================================================
   Studio 2.0 阶段四 — 右侧 AI 设计师对话
   ------------------------------------------------------------
   普通咨询 → 直接回答；
   修改意图 → DeepSeek 计划 → Schema/权限校验 → 操作预览 →
   用户确认 → 原子执行 → 一条可撤销历史 → 结果回执。
   前端只拿平台代理令牌，不接触任何模型密钥；不涉及生图就不会
   调用 Seedream / GPT Image。确认前画布绝不会被修改。
   ============================================================ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/icons';
import { useLang } from '../i18n';
import { loadAI, llmChatWithReasoning } from '../engine/llm';
import { isCancelled } from '../engine/cancel';
import { FREE_CHAT_MODEL } from '../cloud/chatModels';
import { LUNA_PERSONA_PROMPT } from '../engine/persona';
import type { FacePanel } from './frames';
import type {
  StudioAnswers, StudioChatMsg, StudioDesign, StudioProject,
} from './types';
import { buildAIContext, contextBrief, designDigest } from './ai/context';
import { planStudioAction } from './ai/planner';
import { executePlan, planIsStale, previewPlan } from './ai/executor';
import type { StudioAISnapshot, StudioAIPlan } from './ai/types';

const MAX_MSGS = 60;
const HISTORY_FOR_MODEL = 10;

const msgId = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface Props {
  messages: StudioChatMsg[];
  onChange: (next: StudioChatMsg[]) => void;
  cloudbaseUid: string;
  /** 没有打开项目时给一句说明，不假装读到了需求 */
  idle?: boolean;
  onOpenProject?: () => void;
  project?: StudioProject | null;
  design?: StudioDesign | null;
  faceKey?: string;
  panel?: FacePanel | null;
  selectedIds?: string[];
  /** 需求步骤的顾问上下文；没有设计稿时走这条只读对话 */
  context?: string;
  /** 提交 AI 修改：设计稿 + 可选项目字段（结构尺寸），一次历史 */
  onApplyAI?: (design: StudioDesign, answers: StudioAnswers | null, mergeKey: string) => void;
  /** 全局撤销（历史栈） */
  onUndo?: () => void;
}

const statusLabel: Record<string, { zh: string; en: string }> = {
  pending: { zh: '待确认', en: 'Waiting for you' },
  applied: { zh: '已执行', en: 'Applied' },
  rejected: { zh: '已取消', en: 'Cancelled' },
  failed: { zh: '执行失败', en: 'Failed' },
  stale: { zh: '画布已变化', en: 'Canvas changed' },
  superseded: { zh: '已被新计划替代', en: 'Superseded' },
  undone: { zh: '已撤销', en: 'Undone' },
};

function PlanCard({
  m, t, busy, dangerAck, setDangerAck, onConfirm, onReject, currentDigest, onUndoAI,
}: {
  m: StudioChatMsg;
  t: (zh: string, en: string) => string;
  busy: boolean;
  dangerAck: boolean;
  setDangerAck: (v: boolean) => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  currentDigest: string;
  onUndoAI: () => void;
}) {
  const plan = m.plan;
  if (!plan) return <div className="st-ed-msg assistant">{m.content}</div>;

  const status = m.planStatus || 'pending';
  const stale = status === 'pending' && plan.baseDigest !== currentDigest;
  const pending = status === 'pending';
  const applied = status === 'applied';
  const canUndo = applied && !!m.afterDigest && m.afterDigest === currentDigest && !busy;

  return <div className={`st-ai-plan ${plan.permission === 'danger' ? 'is-danger' : ''} ${pending ? 'is-pending' : ''}`}>
    <div className="st-ai-plan-head">
      <span className={`st-ai-plan-badge ${plan.permission}`}>
        {plan.permission === 'danger' ? t('需额外确认', 'Extra confirm') : t('普通修改', 'Edit')}
      </span>
      <b>{plan.summary}</b>
      <em className={stale && pending ? 'is-stale' : ''}>{t(statusLabel[status]?.zh || status, statusLabel[status]?.en || status)}</em>
    </div>

    {plan.items.length > 0 && <div className="st-ai-plan-items">
      {plan.items.map((it, i) => <div className="st-ai-plan-item" key={`${it.targetId}-${i}`}>
        <div className="st-ai-plan-target">
          <strong>{it.targetName}</strong>
          <span>{it.targetType} · {it.targetId.slice(0, 18)}</span>
        </div>
        <div className="st-ai-plan-changes">
          {it.change.map((c) => <div key={`${c.field}-${c.label}`}>
            <span>{c.label}</span>
            <code>{c.before || '—'}</code>
            <i aria-hidden>→</i>
            <code className="after">{c.after || '—'}</code>
          </div>)}
        </div>
      </div>)}
    </div>}

    <div className="st-ai-plan-meta">
      <span>{t(`未改动 ${plan.unchangedCount} 个当前面对象`, `${plan.unchangedCount} objects on this face stay unchanged`)}</span>
      <span>{plan.crossPanel ? t(`涉及其它面板：${plan.targetFaces.join(' / ')}`, `Other panel: ${plan.targetFaces.join(' / ')}`) : t('不涉及其它面板', 'No other panel')}</span>
      {plan.structuralImpact.map((x) => <span key={x}>{x}</span>)}
    </div>

    {plan.warnings.length > 0 && <div className="st-ai-plan-warn">
      <Icon name="alert" size={13} />
      <div>{plan.warnings.map((w) => <p key={w}>{w}</p>)}</div>
    </div>}

    {plan.permission === 'danger' && pending && <div className="st-ai-plan-danger">
      <b>{t('这项操作影响范围较大', 'This affects more than one object')}</b>
      {plan.dangerReasons.map((r) => <span key={r}>{r}</span>)}
      <label>
        <input type="checkbox" checked={dangerAck} onChange={(e) => setDangerAck(e.target.checked)} />
        {t('我确认执行这项高风险修改', 'I understand and want to apply it')}
      </label>
    </div>}

    {pending && stale && <p className="st-ai-plan-stale">{t('预览后画布已经被改动，这份计划不再有效。请重新描述一次。', 'The canvas changed after this preview, so the plan is no longer valid. Please ask again.')}</p>}

    {pending && <div className="st-ai-plan-actions">
      {stale
        ? <button type="button" className="st-ai-ghost" onClick={() => onReject(m.id)}>{t('关闭', 'Close')}</button>
        : <>
          <button type="button" className="st-ai-ghost" onClick={() => onReject(m.id)} disabled={busy}>{t('不执行', 'Cancel')}</button>
          <button type="button" className="st-ai-primary" disabled={busy || (plan.permission === 'danger' && !dangerAck)}
            onClick={() => onConfirm(m.id)}>
            <Icon name="check" size={14} />{t('确认修改', 'Apply changes')}
          </button>
        </>}
    </div>}

    {applied && m.results && <div className="st-ai-results">
      {m.results.map((r, i) => <div key={`${r.name}-${i}`} className={r.ok ? 'ok' : 'fail'}>
        <Icon name={r.ok ? 'check' : 'alert'} size={12} />
        <span>{r.message}</span>
      </div>)}
    </div>}

    {applied && canUndo && <div className="st-ai-plan-undo">
      <button type="button" className="st-ai-ghost" onClick={onUndoAI} disabled={busy}>
        <Icon name="undo" size={13} />{t('撤销这次 AI 操作', 'Undo this AI edit')}
      </button>
    </div>}
  </div>;
}

export default function StudioChat({
  messages, onChange, cloudbaseUid, idle, onOpenProject,
  project, design, faceKey = 'front', panel = null, selectedIds = [], context = '',
  onApplyAI, onUndo,
}: Props) {
  const { t } = useLang();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dangerAck, setDangerAck] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const live = useRef(messages);
  live.current = messages;

  /** 设计稿/面板齐了才是可操作画布的 AI；需求步骤仍然只做顾问。 */
  const canvasReady = !!(project && design && panel);
  const ctx = useMemo(
    () => (project && design ? buildAIContext(project, design, faceKey, selectedIds) : null),
    [project, design, faceKey, selectedIds],
  );
  const digest = useMemo(() => (design ? designDigest(design) : ''), [design]);
  const brief = ctx ? contextBrief(ctx) : '';

  const commitMsgs = useCallback((fn: (list: StudioChatMsg[]) => StudioChatMsg[]) => {
    const next = fn(live.current).slice(-MAX_MSGS);
    live.current = next;
    onChange(next);
  }, [onChange]);

  const push = useCallback((m: StudioChatMsg) => commitMsgs((list) => [...list, m]), [commitMsgs]);

  /** 新消息贴底：只在对话区内部滚，不动整页 */
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { setDangerAck(false); }, [messages.length]);

  const patchMsg = useCallback((id: string, patch: Partial<StudioChatMsg>) => {
    commitMsgs((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, [commitMsgs]);

  const snapshot = useCallback((): StudioAISnapshot | null => {
    if (!project || !design || !panel) return null;
    return { project, design, face: faceKey, panel, selectedIds };
  }, [project, design, panel, faceKey, selectedIds]);

  const send = useCallback(async (raw?: string) => {
    const content = (raw ?? text).trim();
    if (!content || busy) return;
    if (idle || !project) { onOpenProject?.(); return; }
    if (canvasReady && (!design || !panel)) { onOpenProject?.(); return; }
    setText('');
    setErr('');
    setDangerAck(false);
    const history = live.current.slice(-HISTORY_FOR_MODEL);
    commitMsgs((list) => [
      ...list.map((m) => (m.planStatus === 'pending' ? { ...m, planStatus: 'superseded' as const } : m)),
      { id: msgId(), role: 'user', content, at: Date.now(), kind: 'text' },
    ]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const ai = { ...loadAI(), textModel: FREE_CHAT_MODEL, cloudbaseUid };

      /** 需求页没有画布：走原来的只读顾问，不给模型任何修改工具。 */
      if (!canvasReady || !ctx) {
        const r = await llmChatWithReasoning([
          {
            role: 'system',
            content: `${LUNA_PERSONA_PROMPT}

【你现在的位置】
用户正在 LunaSol 包装工作台里填写一份包装设计需求，右侧这个面板是只读顾问对话。
${context}

【回答要求】
- 先说结论再给理由，整段不超过 160 字；
- 只谈这一份包装：结构、尺寸、材质、配色、版式、文案、印刷工艺；
- 需求里没写的（配方、功效、认证、具体规格、价格）不要编造，直接说需求里没写；
- 不要输出表格、不要用 emoji、不要复述整份需求。`,
          },
          ...history.map((m) => ({ role: m.role, content: m.content })),
        ], ai, { signal: ctrl.signal });
        if (!ctrl.signal.aborted) {
          push({ id: msgId(), role: 'assistant', content: r.content, at: Date.now(), kind: 'text' });
        }
        return;
      }

      const plan = await planStudioAction(content, history, ctx, ai);
      if (ctrl.signal.aborted) return;

      if (!plan.actions.length) {
        push({
          id: msgId(), role: 'assistant', at: Date.now(), kind: 'text',
          content: plan.summary || plan.clarification || t('我需要再确认一下你的目标。', 'I need one more detail about the target.'),
        });
        return;
      }

      const snap = snapshot();
      if (!snap) throw new Error('当前画布没有准备好');
      const result = previewPlan(plan, snap);
      if (!result.ok || !result.preview) {
        push({
          id: msgId(), role: 'assistant', at: Date.now(), kind: 'text', error: true,
          content: t(`这份修改没有通过校验：${result.error}。画布没有被改动。`, `This edit did not pass validation: ${result.error}. Nothing was changed.`),
        });
        return;
      }

      push({
        id: msgId(), role: 'assistant', at: Date.now(), kind: 'plan',
        planStatus: 'pending', plan: result.preview,
        content: result.preview.summary,
      });
    } catch (e) {
      if (!isCancelled(e)) {
        push({
          id: msgId(), role: 'assistant', error: true, kind: 'error', at: Date.now(),
          content: t(
            `抱歉，${(e as Error).message || 'AI 暂时连不上'}。需求已经存好了，稍后再问我一次就行。`,
            `Sorry — ${(e as Error).message || 'the AI is unreachable'}. Your brief is saved; ask again in a moment.`,
          ),
        });
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy(false);
    }
  }, [busy, text, idle, project, design, panel, canvasReady, ctx, context, cloudbaseUid, commitMsgs, push, snapshot, t, onOpenProject]);

  const confirm = useCallback((id: string) => {
    const msg = live.current.find((m) => m.id === id);
    if (!msg?.plan || msg.planStatus !== 'pending' || busy) return;
    const snap = snapshot();
    if (!snap) return;
    const plan = msg.plan;
    if (plan.baseFace !== snap.face || planIsStale(plan, snap.design)) {
      patchMsg(id, { planStatus: 'stale' });
      push({ id: msgId(), role: 'assistant', at: Date.now(), kind: 'text', content: t('画布已经变了，这份计划作废。请重新说一次修改要求。', 'The canvas changed, so this plan is void. Please ask again.') });
      return;
    }
    if (plan.permission === 'danger' && !dangerAck) return;
    const apiPlan: StudioAIPlan = {
      mode: 'edit', summary: plan.summary,
      ...(plan.clarification ? { clarification: plan.clarification } : {}),
      actions: plan.actions,
    };
    setBusy(true);
    try {
      const r = executePlan(apiPlan, snap);
      if (!r.ok || !r.design) {
        patchMsg(id, { planStatus: 'failed', results: r.results });
        push({
          id: msgId(), role: 'assistant', at: Date.now(), kind: 'text', error: true,
          content: t(`执行被拒绝：${r.error}。所有动作都没有落盘，画布保持原样。`, `Execution refused: ${r.error}. No action was committed; the canvas is unchanged.`),
        });
        return;
      }
      const answersChanged = r.project && r.project.answers !== project?.answers;
      onApplyAI?.(r.design, answersChanged ? r.project!.answers : null, `ai:${plan.planId}`);
      const after = designDigest(r.design);
      patchMsg(id, {
        planStatus: 'applied',
        results: r.results,
        afterDigest: after,
      });
      push({
        id: msgId(), role: 'assistant', at: Date.now(), kind: 'result',
        content: t(`已执行 ${r.results.filter((x) => x.ok).length} 个动作，并记成一条可撤销历史。`, `${r.results.filter((x) => x.ok).length} actions applied as one undoable step.`),
        results: r.results,
        afterDigest: after,
      });
      setDangerAck(false);
    } finally {
      setBusy(false);
    }
  }, [busy, snapshot, dangerAck, project, patchMsg, push, onApplyAI, t]);

  const reject = useCallback((id: string) => {
    patchMsg(id, { planStatus: 'rejected' });
    push({ id: msgId(), role: 'assistant', at: Date.now(), kind: 'text', content: t('好，这次没有改动画布。', 'Okay — the canvas was not changed.') });
  }, [patchMsg, push, t]);

  const undoAI = useCallback(() => {
    if (busy) return;
    const latest = [...live.current].reverse().find((m) => m.planStatus === 'applied' && m.afterDigest === digest);
    onUndo?.();
    if (latest) patchMsg(latest.id, { planStatus: 'undone' });
    push({ id: msgId(), role: 'assistant', at: Date.now(), kind: 'text', content: t('已撤销上一步 AI 修改。', 'The last AI edit was undone.') });
  }, [busy, digest, onUndo, patchMsg, push, t]);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  const clear = () => onChange([]);

  const ideas = canvasReady
    ? [
      t('把当前选中的标题往上移 5mm', 'Move the selected title up 5 mm'),
      t('把插画缩小 15%', 'Scale the illustration down 15%'),
      t('这版正面还有哪里不专业？', 'What still feels unprofessional on the front?'),
    ]
    : [
      t('这个尺寸做礼盒会不会太空？', 'Will a gift box at this size feel empty?'),
      t('帮我想三个配色方向', 'Give me three colour directions'),
      t('正面版式怎么排更稳？', 'How should the front panel be laid out?'),
    ];

  return <div className="st-ed-ai">
    <header className="st-ed-ai-head">
      <div className="st-ed-ai-title">
        <span className="st-ed-ai-dot" aria-hidden />
        Luna AI
        <em>{canvasReady ? t('画布设计师', 'Canvas designer') : t('包装顾问', 'Packaging advisor')}</em>
      </div>
      <button
        className="st-ed-icon-btn"
        onClick={clear}
        disabled={!messages.length}
        title={t('清空这段对话', 'Clear this conversation')}
        aria-label={t('清空这段对话', 'Clear this conversation')}
      ><Icon name="edit" size={15} /></button>
    </header>

    {!idle && canvasReady && ctx && <div className="st-ai-context" title={brief}>
      <span>{t('当前', 'Now')}</span>
      <b>{ctx.currentFaceLabel}</b>
      <span>{ctx.currentPanelMm ? `${ctx.currentPanelMm.w}×${ctx.currentPanelMm.h}mm` : '—'}</span>
      <span>{t(`${ctx.elements.length} 个对象`, `${ctx.elements.length} objects`)}</span>
      <em>{ctx.selected.length
        ? t(`选中 ${ctx.selected.map((x) => x.name).join('、')}`, `Selected ${ctx.selected.map((x) => x.name).join(', ')}`)
        : t('未选中对象', 'Nothing selected')}</em>
    </div>}

    <div className="st-ed-ai-body" ref={bodyRef}>
      {idle && <div className="st-ed-ai-idle">
        <b>{t('先打开一个项目', 'Open a project first')}</b>
        <p>{t('打开或新建一个包装项目后，我会读到画布上的真实对象，再回答或修改。',
          'Once a project is open I read the real objects on the canvas, then answer or edit.')}</p>
        <button className="st-ed-mini-btn" onClick={onOpenProject}>{t('开始一个新设计', 'Start a new design')}</button>
      </div>}

      {!idle && !messages.length && <div className="st-ed-ai-hello">
        <b>{canvasReady
          ? t('我是 Luna，现在可以真正改画布。', 'I am Luna — I can now edit the canvas.')
          : t('我是 Luna，会跟着这份需求答。', 'I am Luna — I answer from this brief.')}</b>
        <p>{canvasReady
          ? t('说清对象和数值，我会先给预览，你确认后才会执行。', 'Name the object and the value. I show a preview first; nothing changes until you confirm.')
          : t('尺寸、配色、版式、工艺，卡住了就问我一句。', 'Sizes, colours, layout, finishing — ask whenever you are stuck.')}</p>
        <div className="st-ed-ai-ideas">
          {ideas.map((x) => <button key={x} onClick={() => void send(x)}>{x}</button>)}
        </div>
      </div>}

      {messages.map((m) => {
        if (m.kind === 'plan') return <PlanCard
          key={m.id}
          m={m}
          t={t}
          busy={busy}
          dangerAck={dangerAck}
          setDangerAck={setDangerAck}
          onConfirm={confirm}
          onReject={reject}
          currentDigest={digest}
          onUndoAI={undoAI}
        />;
        return <div key={m.id} className={`st-ed-msg ${m.role} ${m.error ? 'is-error' : ''}`}>
          {m.content}
          {m.results && m.results.length > 0 && <div className="st-ai-inline-results">
            {m.results.map((r, i) => <span key={`${r.name}-${i}`} className={r.ok ? 'ok' : 'fail'}>
              <Icon name={r.ok ? 'check' : 'alert'} size={12} />{r.message}
            </span>)}
          </div>}
        </div>;
      })}

      {busy && <div className="st-ed-msg assistant is-typing" aria-label={t('正在处理', 'Working')}>
        <i /><i /><i />
      </div>}

      {err && <p className="st-ed-ai-err">{err}</p>}
    </div>

    <form
      className="st-ed-ai-form"
      onSubmit={(e) => { e.preventDefault(); void send(); }}
    >
      <textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={idle
          ? t('先打开一个项目…', 'Open a project first…')
          : canvasReady
            ? t('说清对象和数值：把正面标题改成深绿色，往上移 5mm…', 'Name the object and value: make the front title dark green, move it up 5 mm…')
            : t('问点什么：尺寸 / 配色 / 版式 / 工艺…', 'Ask about size, colour, layout, finishing…')}
      />
      <div className="st-ed-ai-row">
        <span className="st-ed-ai-note">{canvasReady
          ? t('规划用 DeepSeek · 确认前不改画布', 'DeepSeek plans · nothing changes before confirm')
          : t('对话免费 · 不扣积分', 'Free · no credits')}</span>
        {busy
          ? <button type="button" className="st-ed-send is-stop" onClick={stop} aria-label={t('停止', 'Stop')}>
            <Icon name="close" size={15} />
          </button>
          : <button type="submit" className="st-ed-send" disabled={!text.trim() || !!idle} aria-label={t('发送', 'Send')}>
            <Icon name="send" size={15} />
          </button>}
      </div>
    </form>
  </div>;
}
