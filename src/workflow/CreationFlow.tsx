/* ============================================================
 * AI 创作流程容器
 * ------------------------------------------------------------
 * 四步：创作入口 → 确认需求 → 设计方案 → 编辑器
 * 阶段由 workflow.stage 驱动，刷新后从同一阶段恢复。
 *
 * 旧数据归一化（不丢数据，只换入口）：
 *   analysis / planning / workflow → 确认需求（重新填/确认后再生成）
 *   旧版 concepts（有文字方案、无整包图）→ 确认需求
 *   assembled → 有设计稿直接进编辑器
 * ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import type { Project, ProjectWorkflow, WorkflowStage } from '../types';
import { useApp } from '../store';
import { useHash } from '../ui';
import CreationEntry from './CreationEntry';
import RequirementsStage from './RequirementsStage';
import ConceptStage from './ConceptStage';
import { EditorProvider } from '../editor/EditorContext';
import EditorShell from '../editor/EditorShell';
import type { ToolId } from '../editor/constants';
import { Icon } from '../components/icons';

const STEPS: { stage: WorkflowStage; label: string }[] = [
  { stage: 'entry', label: '创作入口' },
  { stage: 'requirements', label: '确认需求' },
  { stage: 'concepts', label: '设计方案' },
  { stage: 'editor', label: '编辑器' },
];

/** 把任意历史阶段归一到新四步流程，避免旧项目落到空白页。
 *  已经是新流程的阶段必须原样尊重——否则从编辑器点回「创作入口 / 确认需求」会被
 *  「有 design 就进编辑器」的规则弹回编辑器，步骤条看起来能点却没有反应。 */
function normalizeStage(project: Project): WorkflowStage {
  const wf = project.workflow;
  if (!wf) return 'entry';
  const s = wf.stage;
  if (s === 'entry' || s === 'requirements' || s === 'editor') return s;
  if (s === 'concepts') {
    // 有整包图或刚点了生成 = 新流程方案页；旧版只有文字方案 → 回到确认需求重新生成
    return (wf.conceptImages?.length || 0) > 0 || wf.autoGenPending
      ? 'concepts'
      : wf.concepts.length === 0 ? 'concepts' : 'requirements';
  }
  // 旧阶段 analysis / planning / workflow / assembled：有设计稿进编辑器，否则回需求页
  if (s === 'assembled') return 'editor';
  if (project.design) return 'editor';
  return 'requirements';
}

/** 数据已到达的最远阶段，决定步骤条可点击范围。 */
function farthestStage(project: Project): WorkflowStage {
  if (project.design) return 'editor';
  const wf = project.workflow;
  if (!wf) return 'entry';
  if ((wf.conceptImages?.length || 0) > 0) return 'concepts';
  if (wf.stage !== 'entry') return 'requirements';
  return 'entry';
}

function StepBar({
  current, farthest, onStepClick, onSave,
}: {
  current: WorkflowStage;
  farthest: WorkflowStage;
  onStepClick: (s: WorkflowStage) => void;
  onSave: () => void;
}) {
  const curIdx = STEPS.findIndex((s) => s.stage === current);
  const farIdx = STEPS.findIndex((s) => s.stage === farthest);
  const [saved, setSaved] = useState(false);

  React.useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  return (
    <div className="wf-stepbar">
      <div className="wf-stepbar-inner">
        {STEPS.map((step, i) => {
          const done = i < curIdx;
          const active = i === curIdx;
          const clickable = i <= farIdx && i !== curIdx;
          return (
            <React.Fragment key={step.stage}>
              <button
                className={`wf-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}
                onClick={() => clickable && onStepClick(step.stage)}
                disabled={!clickable}
              >
                <span className="wf-step-dot">{done ? <Icon name="check" size={12} /> : i + 1}</span>
                <span className="wf-step-label">{step.label}</span>
              </button>
              {i < STEPS.length - 1 && <span className="wf-step-sep"><Icon name="chevronRight" size={13} /></span>}
            </React.Fragment>
          );
        })}
        <div style={{ flex: 1 }} />
        <span className="wf-saved-hint">已自动保存草稿</span>
        <button className="wf-mini-btn" onClick={() => { onSave(); setSaved(true); }}>
          {saved ? '✓ 已保存' : '保存草稿'}
        </button>
      </div>
    </div>
  );
}

/** 流程内嵌入的编辑器：填满导航与步骤条之下整屏，复用编辑器全套组件 */
function EmbeddedEditor({ projectId, initialTool }: { projectId: string; initialTool: ToolId }) {
  return (
    <div className="embedded-editor" style={{ height: 'calc(100vh - var(--v4-nav-h, 72px) - 49px)', minHeight: 480 }}>
      <EditorProvider projectId={projectId} initialTool={initialTool}>
        <EditorShell embedded />
      </EditorProvider>
    </div>
  );
}

export default function CreationFlow() {
  const { s, patchWorkflow, setToast, startEmptyDraft } = useApp();
  const hash = useHash();
  const freshHandled = useRef(false);
  const project = s.projects.find((p) => p.id === s.activeId);
  const wf: ProjectWorkflow | undefined = project?.workflow;

  // 「开始设计 / 新建设计」= 全新草稿：清掉当前工作区（项目本身仍保留在工作台草稿箱），
  // 从创作入口第 1 步重新开始。刷新页面 / 从工作台打开旧草稿时不带 fresh 参数。
  useEffect(() => {
    if (freshHandled.current) return;
    freshHandled.current = true;
    const fresh = new URLSearchParams(hash.split('?')[1] || '').get('fresh') === '1';
    if (!fresh) return;
    // 放在下一帧：让已挂载的编辑器先完成自身的 loadProject，再切换成新草稿，
    // 否则它会把旧项目重新写回 activeId。
    window.setTimeout(() => startEmptyDraft(), 0);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/new`);
    // 不清理这个 timer：StrictMode 会先 cleanup 再重跑 effect，清理会把唯一一次建稿动作吞掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stage = project ? normalizeStage(project) : 'entry';

  // 换步骤时把页面滚回顶部：确认需求页通常很长，用户滚到底再点「编辑器」时，
  // 编辑器会带着上一次的滚动位置出现，导致顶部导航和步骤条被推出视口。
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage]);

  const goStage = (stage: WorkflowStage) => {
    if (!project) return;
    if (stage === 'editor' && !project.design) {
      setToast('请先在设计方案中选一张并继续设计');
      return;
    }
    patchWorkflow(project.id, { stage });
  };

  const handleSave = () => {
    if (project) patchWorkflow(project.id, { updatedAt: Date.now() });
  };

  // 无工作流 = 创作入口（首次）
  if (!project || !wf) {
    return (
      <div>
        <StepBar current="entry" farthest="entry" onStepClick={() => {}} onSave={handleSave} />
        <CreationEntry />
      </div>
    );
  }

  let body: React.ReactNode;
  switch (stage) {
    case 'requirements':
      body = <RequirementsStage />;
      break;
    case 'concepts':
      body = <ConceptStage />;
      break;
    case 'editor':
      body = <EmbeddedEditor projectId={project.id} initialTool="select" />;
      break;
    case 'entry':
    default:
      body = <CreationEntry />;
      break;
  }

  return (
    <div>
      <StepBar current={stage} farthest={farthestStage(project)} onStepClick={goStage} onSave={handleSave} />
      {body}
    </div>
  );
}
