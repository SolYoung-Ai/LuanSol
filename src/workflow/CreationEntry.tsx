/* AI 创作入口（任务书第三部分）：整合参考图上传、产品信息、创作模式，提交创建真实项目。 */
import React, { useMemo, useState } from 'react';
import type { CreationMode, ProductInfo, ReferenceImage } from '../types';
import { emptyProductInfo } from '../types';
import { useApp } from '../store';
import ReferenceUploader from './components/ReferenceUploader';
import ProductBriefForm from './components/ProductBriefForm';
import ModeSelector from './components/ModeSelector';

const sectionHead: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10,
};
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#222' };
const sectionIndex: React.CSSProperties = {
  fontSize: 11, color: '#e8783a', fontWeight: 700, letterSpacing: 1,
};
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #ececec', borderRadius: 14,
  padding: 20, marginBottom: 16,
};

export default function CreationEntry() {
  const { s, createWorkflowProject, setToast } = useApp();

  // 若当前 active 项目已有 entry 阶段草稿则恢复，否则用空值
  const activeWorkflow = s.activeId
    ? s.projects.find((p) => p.id === s.activeId)?.workflow
    : undefined;

  const [productInfo, setProductInfo] = useState<ProductInfo>(
    activeWorkflow?.productInfo || emptyProductInfo(),
  );
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>(
    activeWorkflow?.referenceImages || [],
  );
  const [mode, setMode] = useState<CreationMode>(activeWorkflow?.mode || 'referenceStyle');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    const hasText = productInfo.description.trim().length > 0;
    const hasImages = referenceImages.length > 0;
    if (mode === 'fromScratch') return hasText;
    return hasText || hasImages;
  }, [submitting, productInfo.description, referenceImages.length, mode]);

  const handleSubmit = () => {
    if (!canSubmit) {
      if (mode === 'fromScratch') setToast('请先用一句话描述你的产品和设计需求');
      else setToast('请填写需求描述或至少上传一张参考图');
      return;
    }
    setSubmitting(true);
    try {
      createWorkflowProject({ mode, productInfo, referenceImages });
      // 项目创建后 stage=analysis，CreationFlow 自动切换到分析阶段
    } catch (e) {
      setToast(e instanceof Error ? e.message : '项目创建失败，请重试');
      setSubmitting(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 60px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, margin: '0 0 8px', color: '#1a1a1a' }}>开始创造你的包装</h1>
        <p style={{ margin: 0, color: '#888', fontSize: 14 }}>从一个想法、一张参考图，开始你的包装设计。</p>
      </div>

      <section style={card}>
        <div style={sectionHead}>
          <span style={sectionIndex}>A</span>
          <span style={sectionTitle}>灵感与参考图</span>
          <span style={{ fontSize: 12, color: '#aaa' }}>可多选，图片会真实保存到项目</span>
        </div>
        <ReferenceUploader
          images={referenceImages}
          onChange={setReferenceImages}
          onError={setToast}
        />
      </section>

      <section style={card}>
        <div style={sectionHead}>
          <span style={sectionIndex}>B</span>
          <span style={sectionTitle}>产品与设计需求</span>
          <span style={{ fontSize: 12, color: '#aaa' }}>一句话即可，信息可后续补充</span>
        </div>
        <ProductBriefForm value={productInfo} onChange={setProductInfo} />
      </section>

      <section style={card}>
        <div style={sectionHead}>
          <span style={sectionIndex}>C</span>
          <span style={sectionTitle}>选择创作模式</span>
        </div>
        <ModeSelector value={mode} onChange={setMode} />
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button
          onClick={() => { window.location.hash = '#/workspace'; }}
          className="v4-btn-line"
          style={{ padding: '11px 22px' }}
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="v4-btn-dark"
          style={{ padding: '11px 28px', opacity: canSubmit ? 1 : 0.5 }}
        >
          {submitting ? '正在创建…' : '开始 AI 设计'}
        </button>
      </div>
    </div>
  );
}
