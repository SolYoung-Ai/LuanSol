/* AI 创作流程容器：按 workflow.stage 渲染对应阶段，刷新后可从同一阶段恢复。
 * 未实现的节点工作流/组装阶段做诚实降级，不放假按钮。 */
import React, { useEffect, useState } from 'react';
import type { Project, ProjectWorkflow, WorkflowStage } from '../types';
import { useApp } from '../store';
import CreationEntry from './CreationEntry';
import AnalysisStage from './AnalysisStage';
import ConceptStage from './ConceptStage';
import WorkflowStageView from './WorkflowStage';
import { EditorProvider } from '../editor/EditorContext';
import EditorShell from '../editor/EditorShell';
import type { ToolId } from '../editor/constants';
import { Icon } from '../components/icons';

const STEPS: { stage: WorkflowStage; label: string }[] = [
  { stage: 'entry', label: '创作入口' },
  { stage: 'analysis', label: 'AI 分析' },
  { stage: 'concepts', label: '设计方案' },
  { stage: 'planning', label: '任务规划' },
  { stage: 'workflow', label: '工作流' },
  { stage: 'assembled', label: '自动组装' },
  { stage: 'editor', label: '编辑器' },
];

/** 根据已存在的数据判断最远可到达的阶段（数据在就能回去，不依赖 currentIdx） */
function farthestStage(project: Project): WorkflowStage {
  if (project.design) return 'editor';
  const wf = project.workflow;
  if (!wf) return 'entry';
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

/** 组装结果阶段：展示各面预览 + 进入流程内编辑器 */
function AssembledStage({ onEnterEditor }: { onEnterEditor: (tool: ToolId) => void }) {
  const { s, patchWorkflow } = useApp();
  const project = s.projects.find((p) => p.id === s.activeId);
  const doc = project?.design;

  if (!project || !doc) {
    return (
      <div className="page" style={{ maxWidth: 560, margin: '0 auto', padding: '70px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 18 }}>还没有组装结果</h2>
        <p style={{ color: '#888', fontSize: 13 }}>请先在工作流生成素材并自动组装。</p>
      </div>
    );
  }

  const faceEntries = Object.entries(doc.faces);
  const totalLayers = faceEntries.reduce((n, [, f]) => n + f.layers.length, 0);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 80px' }}>
      <h2 style={{ fontSize: 20, margin: '0 0 6px', color: '#222' }}>AI 自动组装完成</h2>
      <p style={{ fontSize: 13, color: '#888', lineHeight: 1.8, margin: '0 0 20px' }}>
        共 {faceEntries.length} 个面、{totalLayers} 个图层。AI 图片均为独立图层，品牌/产品名/净含量为可编辑文字图层，
        未用整张图片充当印刷稿，未伪造条码与 Logo。进入编辑器后可逐图层调整文字、位置、尺寸与配色。
      </p>

      {/* 各面预览 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {faceEntries.map(([fid, face]) => (
          <div key={fid} style={{ border: '1px solid #eee', borderRadius: 12, padding: 12, background: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 8 }}>
              {FACE_NAME[fid] || fid}
              <span style={{ color: '#bbb', fontWeight: 400, marginLeft: 6 }}>
                {Math.round(face.w)}×{Math.round(face.h)}mm · {face.layers.length}层
              </span>
            </div>
            <FaceThumb face={face} />
          </div>
        ))}
      </div>

      {/* 组装说明 */}
      {doc.rationale && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: '#fafafa', border: '1px solid #eee', fontSize: 12, color: '#777', lineHeight: 1.8 }}>
          {doc.rationale}
        </div>
      )}

      {/* 操作行 */}
      <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => onEnterEditor('select')}
          className="v4-btn-dark"
          style={{ padding: '12px 26px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Icon name="spark" size={16} /> 进入编辑器继续调整
        </button>
        <button
          onClick={() => patchWorkflow(project.id, { stage: 'workflow' })}
          className="v4-btn-line"
          style={{ padding: '12px 22px', fontSize: 14 }}
        >
          返回工作流
        </button>
        <button
          onClick={() => { window.location.hash = '#/workspace'; }}
          className="v4-btn-line"
          style={{ padding: '12px 22px', fontSize: 14 }}
        >
          返回工作台
        </button>
      </div>
    </div>
  );
}

const FACE_NAME: Record<string, string> = {
  front: '正面', back: '背面', left: '左侧面', right: '右侧面', top: '顶面',
};

/** 单面缩略图：固定渲染宽度后整体缩放，保证 mm 坐标与字号比例一致 */
const RENDER_W = 240;
function FaceThumb({ face }: { face: import('../types').Face }) {
  const scale = RENDER_W / face.w;
  return (
    <div style={{ width: '100%', position: 'relative', paddingTop: `${(face.h / face.w) * 100}%`, overflow: 'hidden', borderRadius: 8 }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <div style={{ width: face.w, height: face.h, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'relative', background: face.bg, overflow: 'hidden' }}>
          {face.layers.map((l) => {
            const base: React.CSSProperties = {
              position: 'absolute', left: l.x, top: l.y, width: l.w, height: l.h,
              opacity: l.opacity, transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
            };
            if (l.type === 'image') {
              return <img key={l.id} src={l.src} alt={l.name} style={{ ...base, objectFit: l.fit }} />;
            }
            if (l.type === 'text') {
              return (
                <div key={l.id} style={{
                  ...base, color: l.color, fontSize: l.fontSize, fontWeight: l.fontWeight,
                  fontFamily: l.fontFamily, textAlign: l.align, letterSpacing: l.letterSpacing,
                  lineHeight: l.lineHeight, display: 'flex', flexDirection: 'column',
                  justifyContent: 'center', alignItems: l.align === 'center' ? 'center' : l.align === 'right' ? 'flex-end' : 'flex-start',
                }}>
                  {l.text}
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

/** 流程内嵌入的编辑器：填满导航栏与步骤条之下的整屏，复用编辑器全套组件 */
function EmbeddedEditor({ projectId, initialTool }: { projectId: string; initialTool: ToolId }) {
  return (
    <div className="embedded-editor" style={{
      height: 'calc(100vh - var(--v4-nav-h, 72px) - 49px)',
      minHeight: 480,
    }}>
      <EditorProvider projectId={projectId} initialTool={initialTool}>
        <EditorShell embedded />
      </EditorProvider>
    </div>
  );
}

export default function CreationFlow() {
  const { s, patchWorkflow } = useApp();
  const project = s.projects.find((p) => p.id === s.activeId);
  const wf = project?.workflow;
  // 进入流程内编辑器时的初始工具（select=正常编辑，assets=直接打开素材库）
  const [editorTool, setEditorTool] = useState<ToolId>('select');

  const goStage = (stage: WorkflowStage) => {
    if (project) patchWorkflow(project.id, { stage });
  };

  /** 进入流程内编辑器，并指定初始工具 */
  const enterEditor = (tool: ToolId) => {
    setEditorTool(tool);
    if (project) patchWorkflow(project.id, { stage: 'editor' });
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
      body = <WorkflowStageView onEnterEditor={enterEditor} />;
      break;
    case 'assembled':
      body = <AssembledStage onEnterEditor={enterEditor} />;
      break;
    case 'editor':
      body = project ? <EmbeddedEditor projectId={project.id} initialTool={editorTool} /> : null;
      break;
    default:
      body = <CreationEntry />;
  }

  return (
    <div>
      <StepBar current={wf.stage} farthest={farthestStage(project)} onStepClick={goStage} onSave={handleSave} />
      {body}
    </div>
  );
}
