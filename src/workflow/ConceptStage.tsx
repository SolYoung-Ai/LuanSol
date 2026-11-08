/* 设计方案阶段：展示三个 AI 生成的设计方向，用户选择一个并确认。 */
import React, { useState } from 'react';
import type { DesignConcept } from '../types';
import { useApp } from '../store';
import { Icon } from '../components/icons';

const KEY_LABELS: Record<DesignConcept['key'], string> = {
  faithful: '方案 A · 忠实参考',
  brandOptimized: '方案 B · 品牌优化',
  creative: '方案 C · 创意探索',
};

function Row({ title, value }: { title: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.6, marginBottom: 6 }}>
      <span style={{ color: '#999', flexShrink: 0, width: 64 }}>{title}</span>
      <span style={{ color: '#555' }}>{value}</span>
    </div>
  );
}

export default function ConceptStage() {
  const { s, patchWorkflow } = useApp();
  const project = s.projects.find((p) => p.id === s.activeId);
  const wf = project?.workflow;

  const [selectedId, setSelectedId] = useState<string>(
    wf?.selectedConceptId || wf?.concepts[0]?.id || '',
  );

  if (!project || !wf) return null;
  const concepts = wf.concepts;

  const handleConfirm = () => {
    if (!selectedId) return;
    patchWorkflow(project.id, {
      selectedConceptId: selectedId,
      stage: 'planning',
    });
  };

  return (
    <div className="page" style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 60px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#e8783a', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          DESIGN DIRECTIONS
        </div>
        <h1 style={{ fontSize: 24, margin: '0 0 8px', color: '#1a1a1a' }}>选择一个设计方向</h1>
        <p style={{ margin: 0, color: '#888', fontSize: 13 }}>
          AI 基于已确认的分析报告给出三个方向，选择最贴近你预期的一个。
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {concepts.map((c) => {
          const selected = selectedId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              style={{
                textAlign: 'left',
                padding: 16,
                borderRadius: 12,
                border: `1.5px solid ${selected ? '#333' : '#e8e8e8'}`,
                background: selected ? '#fafafa' : '#fff',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e8783a' }}>{KEY_LABELS[c.key]}</span>
                {selected && <Icon name="check" size={16} />}
              </div>

              <div style={{ fontSize: 15, fontWeight: 700, color: '#222', marginBottom: 8 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6, marginBottom: 12 }}>{c.concept}</div>

              {c.colors.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                  {c.colors.map((hex) => (
                    <span key={hex} style={{ width: 18, height: 18, borderRadius: 4, background: hex, border: '1px solid #eee' }} title={hex} />
                  ))}
                </div>
              )}

              {c.visualKeywords.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                  {c.visualKeywords.map((kw) => (
                    <span key={kw} style={{ fontSize: 11, color: '#777', background: '#f4f4f4', borderRadius: 4, padding: '3px 7px' }}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              <Row title="材质" value={c.materialDirection} />
              <Row title="结构" value={c.structure} />
              <Row title="字体" value={c.typographyDirection} />
              <Row title="插画" value={c.illustrationDirection} />
              <Row title="构图" value={c.composition} />
              <Row title="预期" value={c.expectedEffect} />
              <Row title="参考关联" value={c.referenceRelation} />
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 24 }}>
        <button
          onClick={() => patchWorkflow(project.id, { stage: 'analysis' })}
          className="v4-btn-line"
          style={{ padding: '11px 20px' }}
        >
          返回修改分析
        </button>
        <button
          onClick={handleConfirm}
          disabled={!selectedId}
          className="v4-btn-dark"
          style={{ padding: '11px 28px', opacity: selectedId ? 1 : 0.5 }}
        >
          确认这个方向
        </button>
      </div>
    </div>
  );
}
