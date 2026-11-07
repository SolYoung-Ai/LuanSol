/* 独立素材库面板：生成 / 上传 / 收藏 / 管理素材，并可把素材作为独立图层加入画布。
 * 当左侧工具栏选中「素材库」时，在画布区域显示。 */
import React, { useState } from 'react';
import { Icon } from '../../components/icons';
import { useEditor } from '../EditorContext';
import { inputStyle } from '../constants';
import type { Asset, AssetCategory } from '../../types';

const CATEGORIES: { id: AssetCategory | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'background', label: '背景' },
  { id: 'illustration', label: '插画' },
  { id: 'texture', label: '纹理' },
  { id: 'pattern', label: '图案' },
  { id: 'sticker', label: '贴纸' },
  { id: 'product', label: '产品' },
];

const GEN_CATEGORIES: AssetCategory[] = ['background', 'illustration', 'texture', 'pattern', 'sticker', 'product'];

const wrap: React.CSSProperties = {
  width: '100%', height: '100%', overflow: 'auto', background: '#faf8f3',
  display: 'flex', flexDirection: 'column',
};

export default function AssetLibrary() {
  const ed = useEditor();
  const assets = ed.s.assets;
  const [filter, setFilter] = useState<AssetCategory | 'all'>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [genCat, setGenCat] = useState<AssetCategory>('illustration');

  const visible = assets.filter((a) =>
    (filter === 'all' || a.category === filter) && (!favOnly || a.favorite));

  const onGenerate = async () => {
    if (!prompt.trim() || ed.assetBusy) return;
    await ed.generateToLibrary(prompt.trim(), genCat);
    setPrompt('');
  };

  return (
    <div style={wrap}>
      {/* 生成区 */}
      <div style={{ padding: 16, borderBottom: '1px solid #e6e1d6' }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 600 }}>AI 生成素材</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select
            value={genCat}
            onChange={(e) => setGenCat(e.target.value as AssetCategory)}
            style={{ ...inputStyle, width: 96 }}
          >
            {GEN_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORIES.find((x) => x.id === c)?.label}</option>)}
          </select>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
            placeholder="描述要生成的素材，如：极简植物线描插画"
            style={inputStyle}
          />
          <button
            onClick={onGenerate}
            disabled={ed.assetBusy || !prompt.trim()}
            style={{
              padding: '0 14px', background: '#e8783a', color: '#fff', border: 'none',
              borderRadius: 6, fontSize: 12, cursor: ed.assetBusy ? 'default' : 'pointer',
              opacity: ed.assetBusy ? 0.6 : 1, whiteSpace: 'nowrap',
            }}
          >
            {ed.assetBusy ? '生成中' : '生成'}
          </button>
        </div>
        <button
          onClick={() => ed.assetFileRef.current?.click()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#fff', border: '1px solid #ddd', borderRadius: 6,
            padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#555',
          }}
        >
          <Icon name="upload" size={14} /> 上传本地素材
        </button>
        <input ref={ed.assetFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={ed.onPickAssetFiles} />
      </div>

      {/* 筛选条 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '10px 16px',
        borderBottom: '1px solid #e6e1d6', flexWrap: 'wrap',
      }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            style={{
              background: filter === c.id ? '#333' : 'transparent',
              color: filter === c.id ? '#fff' : '#666',
              border: '1px solid #ddd', borderRadius: 4,
              padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            }}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={() => setFavOnly((v) => !v)}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: favOnly ? '#e8783a' : '#888', fontSize: 11,
          }}
        >
          <Icon name={favOnly ? 'check' : 'spark'} size={13} /> 只看收藏
        </button>
      </div>

      {/* 素材网格 */}
      <div style={{ padding: 16, flex: 1 }}>
        {visible.length === 0 ? (
          <div style={{
            textAlign: 'center', color: '#999', fontSize: 13, padding: '48px 0',
          }}>
            <Icon name="folder" size={28} />
            <div style={{ marginTop: 10 }}>暂无素材，生成或上传一个开始</div>
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 14,
          }}>
            {visible.map((a: Asset) => (
              <div key={a.id} style={{
                border: '1px solid #e6e1d6', borderRadius: 6, overflow: 'hidden', background: '#fff',
              }}>
                <div style={{
                  height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#f5f2ea',
                }}>
                  <img src={a.src} alt={a.name} style={{
                    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                  }} />
                </div>
                <div style={{ padding: '7px 8px' }}>
                  <div style={{
                    fontSize: 11, color: '#444', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6,
                  }} title={a.name}>
                    {a.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button
                      onClick={() => ed.addAssetToCanvas(a.id)}
                      title="加入当前画布"
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        background: '#333', color: '#fff', border: 'none', borderRadius: 4,
                        padding: '4px 0', fontSize: 10, cursor: 'pointer',
                      }}
                    >
                      <Icon name="plus" size={12} /> 上画布
                    </button>
                    <button
                      onClick={() => ed.toggleFavoriteAsset(a.id)}
                      title="收藏"
                      style={{
                        background: 'none', border: '1px solid #ddd', borderRadius: 4,
                        width: 26, height: 24, cursor: 'pointer',
                        color: a.favorite ? '#e8783a' : '#999',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Icon name="spark" size={13} />
                    </button>
                    <button
                      onClick={() => ed.removeAsset(a.id)}
                      title="删除"
                      style={{
                        background: 'none', border: '1px solid #ddd', borderRadius: 4,
                        width: 26, height: 24, cursor: 'pointer', color: '#999',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
