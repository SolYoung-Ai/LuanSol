/* 创作模式三选一：参考风格 / 参考创新 / 从零开始。 */
import React from 'react';
import type { CreationMode } from '../../types';
import { Icon } from '../../components/icons';

interface Props {
  value: CreationMode;
  onChange: (mode: CreationMode) => void;
}

const MODES: { key: CreationMode; name: string; desc: string; icon: 'image' | 'spark' | 'square' }[] = [
  {
    key: 'referenceStyle',
    name: '参考风格创作',
    desc: '提取参考图的设计语言，保留你喜欢的视觉特征，不复制第三方 Logo 与作品',
    icon: 'image',
  },
  {
    key: 'referenceInnovate',
    name: '参考基础上创新',
    desc: '学习部分设计特点，结合你自己的产品和品牌重新设计',
    icon: 'spark',
  },
  {
    key: 'fromScratch',
    name: '完全从零开始',
    desc: '无需上传图片，AI 根据产品信息自行构思设计方向',
    icon: 'square',
  },
];

export default function ModeSelector({ value, onChange }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {MODES.map((mode) => {
        const selected = value === mode.key;
        return (
          <button
            key={mode.key}
            onClick={() => onChange(mode.key)}
            style={{
              textAlign: 'left',
              padding: 14,
              borderRadius: 10,
              border: `1.5px solid ${selected ? '#333' : '#e4e4e4'}`,
              background: selected ? '#fafafa' : '#fff',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ color: selected ? '#333' : '#999', marginBottom: 8 }}>
              <Icon name={mode.icon} size={20} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{mode.name}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 6, lineHeight: 1.5 }}>{mode.desc}</div>
          </button>
        );
      })}
    </div>
  );
}
