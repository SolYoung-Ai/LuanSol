/* ============================================================
 * 设计简报确认页
 * ------------------------------------------------------------
 * 对话和设计流程之间的桥梁。用户检查和修改 AI 提取的需求，
 * 确认后进入创意提案阶段。
 * ============================================================ */
import React, { useState } from 'react';
import { useApp } from '../store';
import { go } from '../ui';

export default function BriefPage() {
  const { s, patchDraft } = useApp();
  const d = s.draft;
  const [editing, setEditing] = useState<string | null>(null);

  const setField = (key: string, value: string) => {
    // 简化：直接更新 copy_content 或其他字段
    if (['brandName', 'productName', 'subtitle', 'tagline', 'description'].includes(key)) {
      patchDraft({ copy_content: { ...d.copy_content, [key]: value } });
    }
    setEditing(null);
  };

  const sections = [
    {
      title: '包装信息',
      items: [
        { label: '包装类型', value: d.package_type === 'box' ? '包装盒' : d.package_type === 'gift' ? '礼品盒' : d.package_type, source: 'user' },
        { label: '尺寸', value: `${d.package_dimensions.values.l || 200} × ${d.package_dimensions.values.w || 150} × ${d.package_dimensions.values.h || 80} mm`, source: 'user' },
        { label: '结构', value: d.package_dimensions.structureId || 'AI 推荐', source: d.package_dimensions.structureId ? 'user' : 'ai_recommended' },
      ],
    },
    {
      title: '品牌信息',
      items: [
        { label: '品牌名称', value: d.copy_content.brandName || '待补充', source: d.copy_content.brandName ? 'user' : 'missing' },
        { label: 'Logo', value: d.brand_logo ? '已上传' : d.logo_svg ? 'AI 生成' : '待补充', source: d.brand_logo || d.logo_svg ? 'user' : 'missing' },
      ],
    },
    {
      title: '产品信息',
      items: [
        { label: '产品名称', value: d.copy_content.productName || d.product_category.custom || '待补充', source: d.copy_content.productName || d.product_category.custom ? 'user' : 'missing' },
        { label: '产品类型', value: d.product_category.type || '待补充', source: d.product_category.type ? 'ai_extracted' : 'missing' },
        { label: '目标人群', value: d.target_audience.groups.join('、') || 'AI 推荐', source: d.target_audience.groups.length ? 'ai_extracted' : 'ai_recommended' },
      ],
    },
    {
      title: '设计方向',
      items: [
        { label: '设计风格', value: d.style_id || 'AI 推荐', source: d.style_id ? 'user' : 'ai_recommended' },
        { label: '主色', value: d.color_palette?.primary || d.primary_color || 'AI 推荐', source: d.color_palette?.primary || d.primary_color ? 'user' : 'ai_recommended' },
        { label: '插画方向', value: d.illustration_description || d.illustration_type || 'AI 推荐', source: d.illustration_description ? 'user' : 'ai_recommended' },
      ],
    },
  ];

  const sourceLabel = (s: string) => {
    switch (s) {
      case 'user': return '用户提供';
      case 'ai_extracted': return 'AI 提取';
      case 'ai_recommended': return 'AI 推荐';
      case 'missing': return '待补充';
      default: return s;
    }
  };

  const sourceColor = (s: string) => {
    switch (s) {
      case 'user': return '#2e7d32';
      case 'ai_extracted': return '#1565c0';
      case 'ai_recommended': return '#f57c00';
      case 'missing': return '#999';
      default: return '#999';
    }
  };

  const handleConfirm = () => {
    patchDraft({ stage: 'concept_pending' });
    go('/schemes');
  };

  return (
    <div className="brief-page">
      <div className="brief-header">
        <button className="brief-back" onClick={() => go('/luna')}>← 返回对话</button>
        <h1>这是我理解的设计需求</h1>
        <p>检查一下，看看有没有需要补充或修改的地方。</p>
      </div>

      <div className="brief-content">
        {sections.map((section) => (
          <div key={section.title} className="brief-section">
            <h2>{section.title}</h2>
            <div className="brief-items">
              {section.items.map((item) => (
                <div key={item.label} className="brief-item">
                  <div className="brief-item-label">{item.label}</div>
                  <div className="brief-item-value">
                    {editing === item.label ? (
                      <input
                        autoFocus
                        defaultValue={item.value}
                        onBlur={(e) => setField(item.label, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && setField(item.label, (e.target as HTMLInputElement).value)}
                      />
                    ) : (
                      <span onClick={() => setEditing(item.label)}>{item.value}</span>
                    )}
                  </div>
                  <span className="brief-item-source" style={{ color: sourceColor(item.source) }}>
                    {sourceLabel(item.source)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="brief-actions">
        <button className="brief-btn secondary" onClick={() => go('/luna')}>继续和 AI 沟通</button>
        <button className="brief-btn primary" onClick={handleConfirm}>确认需求，开始创意设计</button>
      </div>
    </div>
  );
}
