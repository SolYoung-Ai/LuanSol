/* ============================================================
 * P1 任务规划与工作流运行器（任务书第五部分 5.2 / 5.3）
 * ------------------------------------------------------------
 * 已确认设计方向后：
 *   1) AI 把方案拆成可独立运行的设计任务清单（真实 chat，文本免费）
 *   2) 每个任务独立运行：选 Flash/Pro → Seedream 生图 → 真实扣积分
 *   3) 结果可预览、切换版本、加入素材库（真实 Asset，可持久化恢复）
 * 状态机真实：pending / running / success / failed，失败可重试。
 * ============================================================ */
import React, { useState } from 'react';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useSubscription, recordUsage } from '../cloud/subscription';
import { PRICING } from '../cloud/plans';
import type { DesignTask, TaskVariant, ImageTier } from '../types';
import { callSeedream } from '../engine/seedream';
import { planTasks } from './planner';
import { assembleDesign, inferStructure, buildBrief, refineTextColors } from './assembler';
import CanvasView from './CanvasView';
import { uid } from '../engine/utils';
import { Icon } from '../components/icons';
import type { ToolId } from '../editor/constants';

const TYPE_LABEL: Record<DesignTask['type'], string> = {
  background: '背景', illustration: '插画', pattern: '图案',
  texture: '材质', decoration: '装饰', 'product-image': '产品图',
  typography: '文字', brand: '品牌', barcode: '条码',
  structural: '结构', assembly: '组装',
};

const FACE_LABEL: Record<string, string> = {
  front: '正面', back: '背面', left: '左侧面', right: '右侧面', top: '顶面', all: '通用',
};

const STATUS_LABEL: Record<DesignTask['status'], string> = {
  pending: '待运行', waiting: '排队中', running: '生成中',
  success: '已完成', failed: '失败', cancelled: '已取消',
};

const tierCost = (t: ImageTier) => t === 'flash' ? PRICING.costs.imageFlash : PRICING.costs.imagePro;

/** 加载 dataURL 获取真实尺寸 */
function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

export default function WorkflowStage({ onEnterEditor }: { onEnterEditor: (tool: ToolId) => void }) {
  const { s, patchWorkflow, updateProject, setToast, addAsset } = useApp();
  const auth = useAuth();
  const sub = useSubscription();
  const project = s.projects.find((p) => p.id === s.activeId);
  const wf = project?.workflow;

  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState('');
  const [preview, setPreview] = useState<TaskVariant | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'canvas'>('list');
  const [assembling, setAssembling] = useState(false);

  if (!wf || !project) return null;
  const tasks = wf.tasks || [];
  const concept = wf.concepts.find((c) => c.id === wf.selectedConceptId);

  /** 局部更新某个任务 */
  const patchTask = (taskId: string, patch: Partial<DesignTask>) => {
    const next = tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
    patchWorkflow(project.id, { tasks: next });
  };

  /** AI 拆分任务（文本，免费） */
  const handlePlan = async () => {
    if (!wf.analysis) { setPlanError('缺少分析报告，请先返回完成 AI 分析'); return; }
    if (!concept) { setPlanError('缺少设计方案，请先返回选择方案'); return; }
    setPlanning(true);
    setPlanError('');
    try {
      const aiWithUid = { ...s.ai, cloudbaseUid: auth.user?.id || '' };
      const newTasks = await planTasks(wf.analysis, concept, wf.productInfo, aiWithUid);
      patchWorkflow(project.id, { tasks: newTasks, stage: 'workflow' });
      setToast(`已拆出 ${newTasks.length} 个设计任务（文本分析免费）`);
    } catch (e: any) {
      setPlanError(e.message || '任务拆分失败');
    } finally {
      setPlanning(false);
    }
  };

  /** 运行单个任务：真实生图，检查余额，扣积分，追加为新版本 */
  const runTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const tier = task.imageTier;
    const cost = tierCost(tier);
    const balance = sub.usedLeft ?? 0;
    if (balance < cost) {
      setToast(`积分不足：${tier === 'flash' ? 'Flash' : 'Pro'} 生图需要 ${cost} 积分，当前余额 ${balance}。`);
      window.location.hash = '#/subscribe';
      return;
    }
    patchTask(taskId, { status: 'running', error: '' });
    try {
      const src = await callSeedream(task.prompt, { tier, uid: auth.user?.id });
      const { w, h } = await naturalSize(src);
      if (auth.user) {
        await recordUsage(auth.user.id, cost, 'image');
        sub.refresh();
      }
      const variant: TaskVariant = {
        src, at: Date.now(), prompt: task.prompt, model: tier, tier,
        naturalW: w, naturalH: h,
      };
      patchTask(taskId, {
        status: 'success',
        variants: [...task.variants, variant],
        selectedVariant: task.variants.length,
      });
    } catch (e: any) {
      patchTask(taskId, { status: 'failed', error: e.message || '生成失败' });
    }
  };

  /** 加入素材库（真实 Asset） */
  const addToAsset = (task: DesignTask) => {
    const v = task.variants[task.selectedVariant];
    if (!v) return;
    addAsset({
      id: uid('asset'),
      name: task.name,
      src: v.src,
      kind: 'generated',
      category: toAssetCategory(task.type),
      naturalW: v.naturalW,
      naturalH: v.naturalH,
      favorite: false,
      projectId: project.id,
      sourcePrompt: v.prompt,
      createdAt: Date.now(),
    });
    setToast(`「${task.name}」已加入素材库`);
  };

  /** 批量把所有已完成且未入库的素材加入素材库（跳过已入库的，避免重复） */
  const addAllToLibrary = () => {
    const done = tasks.filter((t) => t.status === 'success' && !t.assetId);
    if (!done.length) { setToast('没有需要新增的素材（已完成的都已入库）'); return; }
    const nextTasks = tasks.map((t) => {
      if (t.status !== 'success' || t.assetId) return t;
      const v = t.variants[t.selectedVariant];
      if (!v) return t;
      const assetId = uid('asset');
      addAsset({
        id: assetId,
        name: t.name,
        src: v.src,
        kind: 'generated',
        category: toAssetCategory(t.type),
        naturalW: v.naturalW,
        naturalH: v.naturalH,
        favorite: false,
        projectId: project.id,
        sourcePrompt: v.prompt,
        createdAt: Date.now(),
      });
      return { ...t, assetId };
    });
    patchWorkflow(project.id, { tasks: nextTasks });
    setToast(`已把 ${done.length} 个素材加入素材库`);
  };

  /** 自动组装：把成功任务 + 真实文字图层组装成 DesignDoc，按真实背景修正文字颜色，写入项目并进入组装阶段 */
  const handleAssemble = async () => {
    const done = tasks.filter((t) => t.status === 'success');
    if (!done.length) { setToast('请先生成至少一个素材，再进行自动组装'); return; }
    setAssembling(true);
    try {
      const doc = assembleDesign(wf);
      // 采样真实满版背景图，修正文字颜色，避免深底配深字看不清
      await refineTextColors(doc);
      updateProject(project.id, {
        design: doc,
        brief: buildBrief(wf),
        structure: inferStructure(wf),
        scheme: 'minimal',
        status: 'designing',
      });
      patchWorkflow(project.id, { stage: 'assembled' });
      setToast('已自动组装成包装工程，可进入编辑器继续调整');
    } catch (e: any) {
      setToast(e.message || '自动组装失败');
    } finally {
      setAssembling(false);
    }
  };

  // —— 空态：AI 拆分任务 ——
  if (tasks.length === 0) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px' }}>
        <h2 style={{ fontSize: 20, margin: '0 0 8px', color: '#222' }}>任务规划</h2>
        <p style={{ color: '#888', fontSize: 13, lineHeight: 1.8, margin: '0 0 24px' }}>
          {concept ? <>已选定设计方向「<b>{concept.name}</b>」。</> : null}
          下一步让 AI 把这个包装拆成若干可独立生成的视觉素材任务，你可以逐个运行、调整提示词、多版本对比。
        </p>
        <button
          onClick={handlePlan}
          disabled={planning}
          className="v4-btn-dark"
          style={{ padding: '12px 24px', fontSize: 14, minWidth: 200 }}
        >
          {planning ? 'AI 拆分中…' : 'AI 拆分设计任务'}
        </button>
        <p style={{ fontSize: 11, color: '#aaa', marginTop: 10 }}>文本分析免费，不扣积分</p>
        {planError && (
          <div style={{ marginTop: 16, color: '#c0392b', fontSize: 13 }}>
            <Icon name="alert" size={14} /> {planError}
          </div>
        )}
      </div>
    );
  }

  const doneCount = tasks.filter((t) => t.status === 'success').length;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ fontSize: 20, margin: 0, color: '#222' }}>节点工作流</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#888' }}>{doneCount}/{tasks.length} 已完成</span>
          <div style={{ display: 'flex', gap: 4, background: '#f0f0f0', borderRadius: 8, padding: 2 }}>
            {(['list', 'canvas'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  fontSize: 11, padding: '4px 12px', border: 'none', borderRadius: 6, cursor: 'pointer',
                  background: viewMode === m ? '#fff' : 'transparent', color: viewMode === m ? '#222' : '#888',
                  boxShadow: viewMode === m ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                }}
              >
                {m === 'list' ? '列表' : '画布'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 16px' }}>
        文本分析免费 · 生图 Flash {PRICING.costs.imageFlash} 积分/张 · Pro {PRICING.costs.imagePro} 积分/张 · 当前余额 {sub.usedLeft ?? 0}
      </p>

      {viewMode === 'canvas' ? (
        <CanvasView tasks={tasks} onRun={runTask} onPreview={(v) => setPreview(v)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tasks.map((task, idx) => (
            <TaskCard
              key={task.id}
              index={idx}
              task={task}
              onRun={() => runTask(task.id)}
              onPatch={(patch) => patchTask(task.id, patch)}
              onPreview={(v) => setPreview(v)}
              onAddToAsset={() => addToAsset(task)}
            />
          ))}
        </div>
      )}

      {/* 底部操作：批量入库 + 自动组装 */}
      <div style={{
        marginTop: 24, padding: 20, borderRadius: 12, background: '#fafafa',
        border: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>素材入库与自动组装</div>
        <p style={{ fontSize: 12, color: '#888', margin: 0, lineHeight: 1.7 }}>
          已完成 {doneCount}/{tasks.length} 个素材。可一键全部加入素材库（跨项目复用），点「查看素材库」会进入编辑器并直接打开素材库面板；
          也可自动组装成完整包装工程：AI 图片作为独立图层，品牌/产品名/净含量为可编辑文字，不伪造条码与 Logo。
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={addAllToLibrary}
            className="v4-btn-line"
            style={{ padding: '10px 18px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="layers" size={15} /> 全部加入素材库
          </button>
          <button
            onClick={() => onEnterEditor('assets')}
            className="v4-btn-line"
            style={{ padding: '10px 18px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="folder" size={15} /> 查看素材库
          </button>
          <button
            onClick={handleAssemble}
            disabled={assembling || doneCount === 0}
            className="v4-btn-dark"
            style={{ padding: '10px 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="spark" size={15} />
            {assembling ? '组装中…' : '自动组装包装工程'}
          </button>
        </div>
      </div>

      {/* 大图预览 */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
          }}
        >
          <img src={preview.src} alt="预览" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8 }} />
          <div style={{ position: 'absolute', top: 20, right: 24, color: '#fff', cursor: 'pointer' }}>
            <Icon name="close" size={24} />
          </div>
        </div>
      )}
    </div>
  );
}

// —— 单个任务卡片 ——
function TaskCard({
  task, index, onRun, onPatch, onPreview, onAddToAsset,
}: {
  task: DesignTask;
  index: number;
  onRun: () => void;
  onPatch: (patch: Partial<DesignTask>) => void;
  onPreview: (v: TaskVariant) => void;
  onAddToAsset: () => void;
}) {
  const [promptDraft, setPromptDraft] = useState(task.prompt);
  const running = task.status === 'running';
  const selected = task.variants[task.selectedVariant];

  return (
    <div style={{
      border: '1px solid #eee', borderRadius: 12, padding: 16, background: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,.04)',
    }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#888', background: '#f4f4f4', borderRadius: 6, padding: '2px 8px' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#5b6cff', background: '#eef0ff', borderRadius: 6, padding: '2px 8px' }}>
          {TYPE_LABEL[task.type]}
        </span>
        <span style={{ fontSize: 11, color: '#999' }}>{FACE_LABEL[task.face] || task.face}</span>
        <strong style={{ fontSize: 14, color: '#222', flex: 1 }}>{task.name}</strong>
        <StatusBadge status={task.status} error={task.error} />
      </div>

      {task.description && (
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 10px' }}>{task.description}</p>
      )}

      {/* 提示词（可编辑） */}
      <textarea
        value={promptDraft}
        onChange={(e) => setPromptDraft(e.target.value)}
        onBlur={() => { if (promptDraft !== task.prompt) onPatch({ prompt: promptDraft }); }}
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box', fontSize: 12, fontFamily: 'inherit',
          border: '1px solid #eee', borderRadius: 8, padding: 10, resize: 'vertical',
          background: '#fafafa', color: '#444', lineHeight: 1.6,
        }}
        placeholder="生图提示词，可自行调整后再运行"
      />

      {/* 模型档位选择 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        {(['flash', 'pro'] as ImageTier[]).map((t) => (
          <button
            key={t}
            onClick={() => onPatch({ imageTier: t })}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              border: task.imageTier === t ? '1px solid #222' : '1px solid #eee',
              background: task.imageTier === t ? '#222' : '#fff',
              color: task.imageTier === t ? '#fff' : '#888',
            }}
          >
            {t === 'flash' ? `Flash ${PRICING.costs.imageFlash}积分` : `Pro ${PRICING.costs.imagePro}积分`}
          </button>
        ))}
      </div>

      {/* 操作行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <button
          onClick={onRun}
          disabled={running}
          className="v4-btn-dark"
          style={{ padding: '7px 16px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="spark" size={14} />
          {running ? '生成中…' : task.variants.length ? `再生成一版（${tierCost(task.imageTier)}积分）` : `运行生成（${tierCost(task.imageTier)}积分）`}
        </button>
        {task.status === 'success' && (
          <button
            onClick={onAddToAsset}
            className="v4-btn-line"
            style={{ padding: '7px 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="layers" size={14} /> 加入素材库
          </button>
        )}
        {task.error && (
          <span style={{ fontSize: 11, color: '#c0392b', flex: 1 }}>{task.error}</span>
        )}
      </div>

      {/* 多版本缩略图 */}
      {task.variants.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {task.variants.map((v, i) => (
            <div
              key={i}
              onClick={() => onPatch({ selectedVariant: i })}
              style={{
                position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden',
                border: i === task.selectedVariant ? '2px solid #5b6cff' : '2px solid #eee',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <img src={v.src} alt={`v${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
          {selected && (
            <img
              src={selected.src}
              alt="当前选中"
              onClick={() => onPreview(selected)}
              style={{
                width: 140, height: 140, objectFit: 'cover', borderRadius: 8,
                border: '1px solid #ddd', cursor: 'zoom-in', marginLeft: 8,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, error }: { status: DesignTask['status']; error?: string }) {
  const map: Record<string, { c: string; bg: string }> = {
    pending: { c: '#888', bg: '#f4f4f4' },
    waiting: { c: '#888', bg: '#f4f4f4' },
    running: { c: '#5b6cff', bg: '#eef0ff' },
    success: { c: '#27ae60', bg: '#e8f8ef' },
    failed: { c: '#c0392b', bg: '#fdecea' },
    cancelled: { c: '#999', bg: '#f4f4f4' },
  };
  const m = map[status];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: m.c, background: m.bg,
      borderRadius: 6, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4,
    }} title={error}>
      {status === 'success' && <Icon name="check" size={12} />}
      {status === 'failed' && <Icon name="alert" size={12} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

/** 任务类型 → 素材库分类 */
function toAssetCategory(type: DesignTask['type']): import('../types').AssetCategory {
  switch (type) {
    case 'background': return 'background';
    case 'illustration': return 'illustration';
    case 'pattern': return 'pattern';
    case 'texture': return 'texture';
    case 'decoration': return 'sticker';
    case 'product-image': return 'product';
    default: return 'other';
  }
}
