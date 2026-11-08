/* 产品信息：自然语言描述为核心（允许只填一句），结构化字段默认折叠、按需补充。 */
import React, { useState } from 'react';
import type { ProductInfo } from '../../types';
import { Icon } from '../../components/icons';

interface Props {
  value: ProductInfo;
  onChange: (next: ProductInfo) => void;
}

const OPTIONAL_FIELDS: { key: keyof ProductInfo; label: string; placeholder: string }[] = [
  { key: 'productName', label: '产品名称', placeholder: '如：桂花乌龙养生茶' },
  { key: 'brandName', label: '品牌名称', placeholder: '如：LunaSol' },
  { key: 'productType', label: '产品类型', placeholder: '如：代用茶 / 零食 / 护肤品' },
  { key: 'audience', label: '目标消费者', placeholder: '如：25-35 岁都市年轻女性' },
  { key: 'pricePositioning', label: '价格定位', placeholder: '如：中高端礼盒' },
  { key: 'salesScene', label: '销售场景', placeholder: '如：电商旗舰店 / 线下精品店' },
  { key: 'packagingType', label: '包装类型', placeholder: '如：天地盖礼盒 / 自立袋' },
  { key: 'expectedSize', label: '预计尺寸', placeholder: '如：200×150×80mm' },
  { key: 'brandMainColor', label: '品牌主色', placeholder: '如：米白 #F5F1E8' },
  { key: 'specialRequirements', label: '特殊要求', placeholder: '其他需要 AI 注意的点' },
];

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: '8px 10px',
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

export default function ProductBriefForm({ value, onChange }: Props) {
  const [showOptional, setShowOptional] = useState(false);

  const setField = (key: keyof ProductInfo, fieldValue: string) => {
    onChange({ ...value, [key]: fieldValue });
  };

  return (
    <div>
      <textarea
        value={value.description}
        onChange={(e) => setField('description', e.target.value)}
        rows={4}
        placeholder="例如：我想为一款年轻人喜欢的养生茶设计一款高级礼盒包装，整体简洁、现代、有东方气质，主要采用米白色和深茶绿色。"
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
      />

      <button
        onClick={() => setShowOptional((v) => !v)}
        style={{
          marginTop: 10, background: 'none', border: 'none', padding: 0,
          color: '#666', fontSize: 12, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}
      >
        <Icon name={showOptional ? 'chevronUp' : 'chevronDown'} size={14} />
        {showOptional ? '收起可选信息' : '补充可选信息（可不填）'}
      </button>

      {showOptional && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {OPTIONAL_FIELDS.map((field) => (
            <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#888' }}>{field.label}</span>
              <input
                value={value[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                style={inputStyle}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
