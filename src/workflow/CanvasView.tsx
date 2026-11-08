/* ============================================================
 * P1 节点画布视图（任务书第六部分）
 * ------------------------------------------------------------
 * 把已拆分的设计任务渲染为可平移、可缩放的节点流程图：
 * 节点 = 任务卡片（状态 + 缩略图 + 运行按钮），连线表达顺序。
 * 节点位置自动布局，不做自由拖拽连线（避免做成花架子）；
 * 运行、提示词、多版本、素材库全部复用真实任务逻辑。
 * ============================================================ */
import React, { useRef, useState, useCallback } from 'react';
import type { DesignTask, TaskVariant } from '../types';
import { Icon } from '../components/icons';

const TYPE_LABEL: Record<DesignTask['type'], string> = {
  background: '背景', illustration: '插画', pattern: '图案',
  texture: '材质', decoration: '装饰', 'product-image': '产品图',
  typography: '文字', brand: '品牌', barcode: '条码',
  structural: '结构', assembly: '组装',
};

const NODE_W = 176;
const NODE_H = 108;
const GAP_X = 90;

interface Props {
  tasks: DesignTask[];
  onRun: (taskId: string) => void;
  onPreview: (v: TaskVariant) => void;
}

export default function CanvasView({ tasks, onRun, onPreview }: Props) {
  const [view, setView] = useState({ x: 60, y: 80, zoom: 1 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const svgRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.pan) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: view.x, baseY: view.y };
  }, [view]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) }));
  }, []);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const nz = Math.min(2, Math.max(0.4, v.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
      const ratio = nz / v.zoom;
      return { zoom: nz, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
    });
  }, []);

  // 节点位置：横向排列，奇偶行上下错落
  const positions = tasks.map((_, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return { x: col * (NODE_W + GAP_X), y: row * (NODE_H + 90) };
  });

  return (
    <div
      ref={svgRef}
      data-pan="1"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      style={{
        position: 'relative', height: 520, overflow: 'hidden',
        background: 'repeating-linear-gradient(0deg, #fafafa, #fafafa 1px, #fff 1px, #fff 22px), repeating-linear-gradient(90deg, #fafafa, #fafafa 1px, #fff 1px, #fff 22px)',
        borderRadius: 12, border: '1px solid #eee', cursor: 'grab',
      }}
    >
      {/* 变换层 */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        transformOrigin: '0 0', width: 0, height: 0,
      }}>
        {/* 连线 */}
        <svg width="1200" height="600" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
          {positions.slice(0, -1).map((p, i) => {
            const next = positions[i + 1];
            const x1 = p.x + NODE_W, y1 = p.y + NODE_H / 2;
            const x2 = next.x, y2 = next.y + NODE_H / 2;
            const done = tasks[i].status === 'success';
            return (
              <g key={i}>
                <path d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`}
                  stroke={done ? '#27ae60' : '#ccc'} strokeWidth={2} fill="none" strokeDasharray="0" />
                <polygon points={`${x2 - 6},${y2 - 5} ${x2},${y2} ${x2 - 6},${y2 + 5}`} fill={done ? '#27ae60' : '#ccc'} />
              </g>
            );
          })}
        </svg>

        {/* 节点 */}
        {tasks.map((task, i) => {
          const p = positions[i];
          const v = task.variants[task.selectedVariant];
          const running = task.status === 'running';
          return (
            <div
              key={task.id}
              style={{
                position: 'absolute', left: p.x, top: p.y, width: NODE_W, minHeight: NODE_H,
                background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 10,
                boxShadow: '0 2px 8px rgba(0,0,0,.06)', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#5b6cff', background: '#eef0ff', borderRadius: 4, padding: '1px 6px' }}>
                  {TYPE_LABEL[task.type]}
                </span>
                <span style={{ fontSize: 10, color: '#999' }}>{task.face}</span>
                <span style={{ flex: 1 }} />
                {task.status === 'success' && <Icon name="check" size={13} />}
                {task.status === 'failed' && <Icon name="alert" size={13} />}
                {running && <span style={{ fontSize: 10, color: '#5b6cff' }}>…</span>}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#222', marginBottom: 6 }}>{task.name}</div>
              {v ? (
                <img src={v.src} alt="" onClick={() => onPreview(v)}
                  style={{ width: '100%', height: 56, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in' }} />
              ) : (
                <div style={{ height: 56, borderRadius: 6, background: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, color: '#aaa' }}>未生成</span>
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onRun(task.id); }}
                disabled={running}
                style={{
                  marginTop: 6, width: '100%', fontSize: 10, padding: '4px 0',
                  border: 'none', borderRadius: 6, background: running ? '#ddd' : '#222',
                  color: '#fff', cursor: running ? 'default' : 'pointer',
                }}
              >
                {running ? '生成中…' : v ? '再生成' : '运行'}
              </button>
            </div>
          );
        })}
      </div>

      {/* 缩放提示 */}
      <div style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 11, color: '#999' }}>
        拖拽平移 · 滚轮缩放 · {Math.round(view.zoom * 100)}%
      </div>
    </div>
  );
}
