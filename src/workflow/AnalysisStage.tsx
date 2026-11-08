/* AI 分析阶段：执行结构化分析 → 可编辑报告 → 确认锁定 → 生成设计方向。 */
import React, { useEffect, useState } from 'react';
import type { AnalysisReport } from '../types';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { runAnalysis, generateConcepts } from './analyzer';
import { Icon } from '../components/icons';

type Phase = 'running' | 'ready' | 'error' | 'conceptsLoading';

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #ececec', borderRadius: 14,
  padding: 20, marginBottom: 16,
};
const label: React.CSSProperties = { fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 6 };
const textInput: React.CSSProperties = {
  fontSize: 13, padding: '8px 10px', border: '1px solid #e0e0e0',
  borderRadius: 8, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
};

/** 字符串数组编辑器：逐行编辑、删除、新增 */
function StringList({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }) {
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            style={textInput}
          />
          <button
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            style={{
              width: 34, flexShrink: 0, border: '1px solid #eee', borderRadius: 8,
              background: '#fff', color: '#999', cursor: 'pointer',
            }}
            title="删除"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, ''])}
        className="v4-btn-line"
        style={{ fontSize: 12, padding: '6px 12px' }}
      >
        + 添加一项
      </button>
    </div>
  );
}

function FieldBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={label}>{title}</div>
      {children}
    </div>
  );
}

export default function AnalysisStage() {
  const { s, patchWorkflow, setToast } = useApp();
  const auth = useAuth();
  // 与现有编辑器调用点一致：注入当前登录用户 id，云函数 guard 据此校验
  const aiWithUid = { ...s.ai, cloudbaseUid: auth.user?.id || '' };
  const project = s.projects.find((p) => p.id === s.activeId);
  const wf = project?.workflow;

  const [phase, setPhase] = useState<Phase>(wf?.analysis ? 'ready' : 'running');
  const [report, setReport] = useState<AnalysisReport | null>(wf?.analysis || null);
  const [errorMsg, setErrorMsg] = useState('');

  const doRun = async () => {
    if (!wf || !project) return;
    setPhase('running');
    setErrorMsg('');
    try {
      const result = await runAnalysis(wf.productInfo, wf.referenceImages, wf.mode, aiWithUid);
      setReport(result);
      patchWorkflow(project.id, { analysis: result });
      setPhase('ready');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  // 首次进入自动运行分析
  useEffect(() => {
    if (wf && !wf.analysis && phase === 'running') void doRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<AnalysisReport>) => {
    if (!report) return;
    setReport({ ...report, ...p });
  };

  const confirmAndGenerate = async () => {
    if (!report || !project || !wf) return;
    const confirmed = { ...report, confirmed: true };
    setReport(confirmed);
    patchWorkflow(project.id, { analysis: confirmed, stage: 'concepts' });
    setPhase('conceptsLoading');
    try {
      const concepts = await generateConcepts(confirmed, wf.mode, aiWithUid);
      if (!concepts.length) {
        setToast('方案生成失败，请重试');
        setPhase('ready');
        return;
      }
      patchWorkflow(project.id, { concepts, stage: 'concepts' });
    } catch (e) {
      setToast(e instanceof Error ? e.message : '方案生成失败');
      setPhase('ready');
    }
  };

  /* ---------- 运行中 ---------- */
  if (phase === 'running') {
    return (
      <div className="page" style={{ maxWidth: 760, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
        <div style={{ color: '#888', marginBottom: 16 }}><Icon name="brain" size={34} /></div>
        <h2 style={{ fontSize: 18, color: '#333' }}>AI 正在分析你的需求与参考图…</h2>
        <p style={{ color: '#999', fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
          正在梳理产品理解、包装结构、色彩规范、字体排版与合规信息，请稍候。
        </p>
      </div>
    );
  }

  /* ---------- 失败 ---------- */
  if (phase === 'error') {
    return (
      <div className="page" style={{ maxWidth: 620, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
        <div style={{ color: '#c0504d', marginBottom: 16 }}><Icon name="alert" size={34} /></div>
        <h2 style={{ fontSize: 18, color: '#333' }}>分析未能完成</h2>
        <p style={{ color: '#999', fontSize: 13, marginTop: 10 }}>{errorMsg}</p>
        <button onClick={() => void doRun()} className="v4-btn-dark" style={{ marginTop: 20, padding: '10px 24px' }}>
          重新分析
        </button>
      </div>
    );
  }

  if (!report || !project || !wf) return null;

  return (
    <div className="page" style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 60px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#e8783a', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          ANALYSIS REPORT
        </div>
        <h1 style={{ fontSize: 24, margin: '0 0 8px', color: '#1a1a1a' }}>设计分析报告</h1>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: '#8a6a3a', background: '#faf5ea',
          border: '1px solid #ece0c8', borderRadius: 6, padding: '5px 10px',
        }}>
          <Icon name="alert" size={13} />
          当前为文本分析：AI 基于你的文字描述与图片客观信号（尺寸/主色）分析，未做图像语义识别；结构与工艺判断为推测。
        </div>
      </div>

      <section style={card}>
        <FieldBlock title="产品理解">
          <textarea
            rows={2}
            value={report.productUnderstanding}
            onChange={(e) => patch({ productUnderstanding: e.target.value })}
            style={{ ...textInput, resize: 'vertical', lineHeight: 1.6 }}
          />
        </FieldBlock>

        <FieldBlock title="包装结构（推测，需你确认）">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input style={textInput} value={report.structure.suggestedType}
              placeholder="推测的包装类型"
              onChange={(e) => patch({ structure: { ...report.structure, suggestedType: e.target.value } })} />
            <select style={textInput} value={report.structure.confidence}
              onChange={(e) => patch({ structure: { ...report.structure, confidence: e.target.value as AnalysisReport['structure']['confidence'] } })}>
              <option value="low">可信度：低</option>
              <option value="medium">可信度：中</option>
              <option value="high">可信度：高</option>
            </select>
            <input style={textInput} value={report.structure.shape} placeholder="外形特征"
              onChange={(e) => patch({ structure: { ...report.structure, shape: e.target.value } })} />
            <input style={textInput} value={report.structure.features} placeholder="结构/开合特征"
              onChange={(e) => patch({ structure: { ...report.structure, features: e.target.value } })} />
          </div>
          <input style={{ ...textInput, marginTop: 10 }} value={report.structure.needsConfirmation}
            placeholder="需要你确认的结构信息"
            onChange={(e) => patch({ structure: { ...report.structure, needsConfirmation: e.target.value } })} />
        </FieldBlock>

        <FieldBlock title="色彩规范（HEX 优先采用程序采样主色）">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {report.palette.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                border: '1px solid #e8e8e8', borderRadius: 8, padding: '6px 8px',
              }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: c.hex, display: 'inline-block', border: '1px solid #eee' }} />
                <span style={{ fontSize: 12, color: '#555' }}>{c.hex}</span>
                <span style={{ fontSize: 11, color: '#aaa' }}>{c.role}</span>
              </div>
            ))}
          </div>
        </FieldBlock>

        <FieldBlock title="字体与排版">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input style={textInput} value={report.typography.titleStyle} placeholder="标题字体气质"
              onChange={(e) => patch({ typography: { ...report.typography, titleStyle: e.target.value } })} />
            <input style={textInput} value={report.typography.bodyStyle} placeholder="正文字体气质"
              onChange={(e) => patch({ typography: { ...report.typography, bodyStyle: e.target.value } })} />
            <input style={textInput} value={report.typography.hierarchy} placeholder="字号/字重层级"
              onChange={(e) => patch({ typography: { ...report.typography, hierarchy: e.target.value } })} />
            <input style={textInput} value={report.typography.suggestions} placeholder="可执行字体建议"
              onChange={(e) => patch({ typography: { ...report.typography, suggestions: e.target.value } })} />
          </div>
        </FieldBlock>

        <FieldBlock title="需要你补充的信息（合规/产品，AI 不编造）">
          <StringList
            items={report.requiredInformation}
            onChange={(next) => patch({ requiredInformation: next })}
          />
        </FieldBlock>

        <FieldBlock title="不确定 / 需确认项">
          <StringList
            items={report.uncertainties}
            onChange={(next) => patch({ uncertainties: next })}
          />
        </FieldBlock>

        <FieldBlock title="设计约束">
          <StringList
            items={report.designConstraints}
            onChange={(next) => patch({ designConstraints: next })}
          />
        </FieldBlock>

        {/* 推测类信息只读展示 */}
        <FieldBlock title="材质推测（仅凭图片无法确定实际材质）">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.materials.map((m, i) => (
              <div key={i} style={{ fontSize: 12, color: '#666', lineHeight: 1.6, background: '#fafafa', borderRadius: 8, padding: '8px 10px' }}>
                <strong>{m.name}</strong> · {m.visualFeature}
                {m.recommendedAlternative ? ` · 替代：${m.recommendedAlternative}` : ''}
              </div>
            ))}
          </div>
        </FieldBlock>

        <FieldBlock title="印刷工艺推测（光影不等于真实工艺）">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.finishing.map((f, i) => (
              <div key={i} style={{ fontSize: 12, color: '#666', lineHeight: 1.6, background: '#fafafa', borderRadius: 8, padding: '8px 10px' }}>
                <strong>{f.name}</strong> · {f.visualEvidence}
              </div>
            ))}
          </div>
        </FieldBlock>
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
        <button onClick={() => void doRun()} className="v4-btn-line" style={{ padding: '11px 20px' }}>
          重新分析
        </button>
        <button
          onClick={() => void confirmAndGenerate()}
          disabled={phase === 'conceptsLoading'}
          className="v4-btn-dark"
          style={{ padding: '11px 28px', opacity: phase === 'conceptsLoading' ? 0.6 : 1 }}
        >
          {phase === 'conceptsLoading' ? '正在生成方案…' : '确认并生成设计方向'}
        </button>
      </div>
    </div>
  );
}
