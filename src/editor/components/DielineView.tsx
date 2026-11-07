/* 刀模与印前视图：展开图、裁切线/压痕线、出血区、安全区、尺寸标注、显示开关、单位切换。 */
import React, { useState } from 'react';
import { useApp } from '../../store';
import { useEditor } from '../EditorContext';
import { Icon } from '../../components/icons';
import { MM_TO_PX } from '../constants';
import type { Segment } from '../../types';

type Unit = 'mm' | 'cm' | 'inch';
const UNIT_LABEL: Record<Unit, string> = { mm: '毫米', cm: '厘米', inch: '英寸' };

function convert(v: number, unit: Unit): number {
  if (unit === 'cm') return v / 10;
  if (unit === 'inch') return v / 25.4;
  return v;
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
        background: active ? '#333' : '#fff', color: active ? '#fff' : '#555',
        border: '1px solid ' + (active ? '#333' : '#ddd'),
      }}
    >
      {label}
    </button>
  );
}

export default function DielineView() {
  const { dieline } = useApp();
  const ed = useEditor();
  const [showCut, setShowCut] = useState(true);
  const [showBleed, setShowBleed] = useState(true);
  const [showSafe, setShowSafe] = useState(true);
  const [showDim, setShowDim] = useState(true);
  const [unit, setUnit] = useState<Unit>('mm');

  const sheet = dieline.sheets[0];
  const pad = 30;
  const w = sheet.width + pad * 2;
  const h = sheet.height + pad * 2;
  const fmt = (v: number) => +convert(v, unit).toFixed(unit === 'inch' ? 2 : 1);

  const segmentColor = (s: Segment) => {
    if (s.kind === 'cut') return '#151515';
    if (s.kind === 'crease') return '#e05252';
    if (s.kind === 'bleed') return '#2b7fc3';
    return '#888';
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* 控制条 */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap',
        borderBottom: '1px solid #eee', alignItems: 'center',
      }}>
        <ToggleChip label="刀模线" active={showCut} onClick={() => setShowCut((v) => !v)} />
        <ToggleChip label="出血区" active={showBleed} onClick={() => setShowBleed((v) => !v)} />
        <ToggleChip label="安全区" active={showSafe} onClick={() => setShowSafe((v) => !v)} />
        <ToggleChip label="尺寸标注" active={showDim} onClick={() => setShowDim((v) => !v)} />

        <div style={{ flex: 1 }} />

        {/* 单位切换 */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
            <ToggleChip key={u} label={UNIT_LABEL[u]} active={unit === u} onClick={() => setUnit(u)} />
          ))}
        </div>

        {/* 印前检查按钮 */}
        <button
          onClick={ed.openPrepress}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', background: '#f5c451', color: '#333',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          <Icon name="prepress" size={14} />
          运行印前检查
        </button>
      </div>

      {/* 展开图 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20, background: '#f7f6f2' }}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
        >
          <g transform={`translate(${pad},${pad})`}>
            {/* 面片底色 */}
            {sheet.rects.map((r, i) => (
              <rect
                key={i}
                x={r.x} y={r.y} width={r.w} height={r.h}
                fill={r.artwork ? '#fdfbf6' : '#f0ede6'}
                stroke="#ccc" strokeWidth={0.3}
              />
            ))}

            {/* 出血区 */}
            {showBleed && sheet.rects.map((r, i) => (
              <rect
                key={'b' + i}
                x={r.x - dieline.bleed} y={r.y - dieline.bleed}
                width={r.w + dieline.bleed * 2} height={r.h + dieline.bleed * 2}
                fill="none" stroke="#2b7fc3" strokeWidth={0.4} strokeDasharray="2 1.5"
              />
            ))}

            {/* 安全区 */}
            {showSafe && sheet.safeRects.map((r, i) => (
              <rect
                key={'s' + i}
                x={r.x} y={r.y} width={r.w} height={r.h}
                fill="none" stroke="#e8a23a" strokeWidth={0.4} strokeDasharray="3 1"
              />
            ))}

            {/* 刀模线（裁切/压痕） */}
            {showCut && sheet.segments.map((s, i) => (
              <line
                key={i}
                x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                stroke={segmentColor(s)}
                strokeWidth={s.kind === 'cut' ? 0.6 : 0.4}
                strokeDasharray={s.kind === 'crease' ? '2 1.5' : undefined}
              />
            ))}
            {showCut && sheet.circles.map((c, i) => (
              <circle
                key={'c' + i}
                cx={c.cx} cy={c.cy} r={c.r}
                fill="none" stroke={c.kind === 'cut' ? '#151515' : '#2b7fc3'} strokeWidth={0.5}
              />
            ))}

            {/* 尺寸标注 */}
            {showDim && (
              <>
                {/* 总宽 */}
                <line x1={0} y1={-12} x2={sheet.width} y2={-12} stroke="#888" strokeWidth={0.3} />
                <line x1={0} y1={-15} x2={0} y2={-9} stroke="#888" strokeWidth={0.3} />
                <line x1={sheet.width} y1={-15} x2={sheet.width} y2={-9} stroke="#888" strokeWidth={0.3} />
                <text x={sheet.width / 2} y={-16} textAnchor="middle" fontSize={4} fill="#666">
                  {fmt(sheet.width)} {unit}
                </text>
                {/* 总高 */}
                <line x1={-12} y1={0} x2={-12} y2={sheet.height} stroke="#888" strokeWidth={0.3} />
                <line x1={-15} y1={0} x2={-9} y2={0} stroke="#888" strokeWidth={0.3} />
                <line x1={-15} y1={sheet.height} x2={-9} y2={sheet.height} stroke="#888" strokeWidth={0.3} />
                <text
                  x={-16} y={sheet.height / 2} textAnchor="middle" fontSize={4} fill="#666"
                  transform={`rotate(-90 -16 ${sheet.height / 2})`}
                >
                  {fmt(sheet.height)} {unit}
                </text>
              </>
            )}
          </g>
        </svg>

        {/* 图例与信息 */}
        <div style={{
          maxWidth: 700, margin: '16px auto 0', display: 'flex', gap: 16,
          flexWrap: 'wrap', fontSize: 12, color: '#555', background: '#fff',
          padding: '12px 16px', borderRadius: 8, border: '1px solid #eee',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 20, height: 2, background: '#151515' }} />裁切线（实线）
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 20, height: 2, background: '#e05252' }} />压痕线（虚线）
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 20, height: 2, background: '#2b7fc3' }} />出血区
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 20, height: 2, background: '#e8a23a' }} />安全区
          </span>
          <span style={{ color: '#888' }}>
            出血 {dieline.bleed}mm · 安全区 {dieline.safe}mm
          </span>
        </div>
      </div>
    </div>
  );
}
