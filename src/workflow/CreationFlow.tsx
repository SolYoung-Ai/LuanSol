/* AI 创作流程容器：按 workflow.stage 渲染对应阶段，刷新后可从同一阶段恢复。
 * 未实现的节点工作流/组装阶段做诚实降级，不放假按钮。 */
import React, { useEffect, useState } from 'react';
import type { ProjectWorkflow, WorkflowStage } from '../types';
import { useApp } from '../store';
import CreationEntry from './CreationEntry';
import AnalysisStage from './AnalysisStage';
import ConceptStage from './ConceptStage';
import WorkflowStageView from './WorkflowStage';
import { Icon } from '../components/icons';

const STEPS: { stage: WorkflowStage; label: string }[] = [
  { stage: 'entry', label: '创作入口' },
  { stage: 'analysis', label: 'AI 分析' },
  { stage: 'concepts', label: '设计方案' },
  { stage: 'planning', label: '任务规划' },
  { stage: 'workflow', label: '工作流' },
  { stage: 'assembled', label: '自动组装' },
];

/** 根据已存在的数据判断最远可到达的阶段（数据在就能回去，不依赖 currentIdx） */
function farthestStage(wf: ProjectWorkflow): WorkflowStage {
  if (wf.tasks.length > 0) return 'workflow';
  if (wf.selectedConceptId) return 'planning';
  if (wf.concepts.length > 0) return 'concepts';
  if (wf.analysis) return 'analysis';
  return 'entry';
}

function StepBar({
  current,
  farthest,
  onStepClick,
  onSave,
}: {
  current: WorkflowStage;
  farthest: WorkflowStage;
  onStepClick: (s: WorkflowStage) => void;
  onSave: () => void;
}) {
  const currentIdx = STEPS.findIndex((s) => s.stage === current);
  const farthestIdx = STEPS.findIndex((s) => s.stage === farthest);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const handleSave = () => {
    onSave();
    setSaved(true);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '14px 20px', borderBottom: '1px solid #eee',
      background: '#fff', overflowX: 'auto',
    }}>
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const clickable = i <= farthestIdx;
        return (
          <React.Fragment key={step.stage}>
            <span
              onClick={() => clickable && onStepClick(step.stage)}
              style={{
                fontSize: 12, whiteSpace: 'nowrap',
                color: active ? '#222' : done ? '#666' : clickable ? '#999' : '#ccc',
                fontWeight: active ? 700 : 500,
                cursor: clickable ? 'pointer' : 'default',
                textDecoration: done ? 'underline dotted' : 'none',
                textUnderlineOffset: 3,
              }}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <span style={{ color: '#ddd', margin: '0 4px' }}>
                <Icon name="chevronRight" size={13} />
              </span>
            )}
          </React.Fragment>
        );
      })}

      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: '#aaa', marginRight: 10, whiteSpace: 'nowrap' }}>
        已自动保存草稿
      </span>
      <button
        onClick={handleSave}
        style={{
          fontSize: 12, whiteSpace: 'nowrap',
          padding: '5px 12px', borderRadius: 6,
          border: '1px solid #ddd', background: saved ? '#f0fdf4' : '#fff',
          color: saved ? '#16a34a' : '#444', cursor: 'pointer',
        }}
      >
        {saved ? '✓ 已保存草稿' : '保存草稿'}
      </button>
    </div>
  );
}

/** 未实现阶段的诚实面板 */
function ComingNext({ stage }: { stage: WorkflowStage }) {
  const { s } = useApp();
  const project = s.projects.find((p) => p.id === s.activeId);
  const concept = project?.workflow?.concepts.find((c) => c.id === project.workflow?.selectedConceptId);

  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto', padding: '70px 20px', textAlign: 'center' }}>
      <div style={{ color: '#888', marginBottom: 18 }}><Icon name="brain" size={36} /></div>
      <h2 style={{ fontSize: 20, color: '#222', margin: '0 0 10px' }}>节点工作流正在开发中</h2>
      <p style={{ color: '#888', fontSize: 13, lineHeight: 1.8, margin: 0 }}>
        你已确认设计方向
        {concept ? `「${concept.name}」` : ''}
        。下一步的任务拆分、节点式 AI 素材生成与自动组装属于 P1–P3 阶段，当前版本尚未开放，不会用假按钮演示。
      </p>

      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 12 }}>
        <button
          onClick={() => { window.location.hash = '#/workspace'; }}
          className="v4-btn-line"
          style={{ padding: '11px 22px' }}
        >
          返回工作台
        </button>
        {project && (
          <button
            onClick={() => { window.location.hash = `#/studio?id=${project.id}`; }}
            className="v4-btn-dark"
            style={{ padding: '11px 24px' }}
          >
            进入现有包装编辑器
          </button>
        )}
      </div>
    </div>
  );
}

export default function CreationFlow() {
  const { s, patchWorkflow } = useApp();
  const project = s.projects.find((p) => p.id === s.activeId);
  const wf = project?.workflow;

  const goStage = (stage: WorkflowStage) => {
    if (project) patchWorkflow(project.id, { stage });
  };

  const handleSave = () => {
    if (project) patchWorkflow(project.id, { updatedAt: Date.now() });
  };

  // 无工作流 = 创作入口
  if (!wf) {
    return (
      <div>
        <StepBar current="entry" farthest="entry" onStepClick={() => {}} onSave={handleSave} />
        <CreationEntry />
      </div>
    );
  }

  let body: React.ReactNode;
  switch (wf.stage) {
    case 'entry':
      body = <CreationEntry />;
      break;
    case 'analysis':
      body = <AnalysisStage />;
      break;
    case 'concepts':
      body = <ConceptStage />;
      break;
    case 'planning':
    case 'workflow':
      body = <WorkflowStageView />;
      break;
    case 'assembled':
      body = <ComingNext stage={wf.stage} />;
      break;
    default:
      body = <CreationEntry />;
  }

  return (
    <div>
      <StepBar current={wf.stage} farthest={farthestStage(wf)} onStepClick={goStage} onSave={handleSave} />
      {body}
    </div>
  );
}
