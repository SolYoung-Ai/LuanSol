/* ============================================================
 * 素材面板（左栏「素材」）
 * ------------------------------------------------------------
 * 内置原生矢量素材：形状 / 图标 / 纹样，全部本地绘制，不依赖外链；
 * 「我的素材」汇总上传与 AI 生成的素材，可重复使用。
 * 点一下即栅格化入画布（透明 PNG），导出与 3D 都不会丢。
 * ============================================================ */
import React, { useMemo, useState } from 'react';
import { useEditor } from '../../EditorContext';
import { useApp } from '../../../store';
import { Icon } from '../../../components/icons';
import { MATERIALS, MATERIAL_GROUPS, type MaterialGroup } from '../../materials';

type TabId = MaterialGroup | 'mine';

const TABS: { id: TabId; label: string }[] = [
  ...MATERIAL_GROUPS.map((g) => ({ id: g.id as TabId, label: g.label })),
  { id: 'mine', label: '我的' },
];

const COLORS = ['#111111', '#ffffff', '#C0392B', '#D9602C', '#E8B04B', '#2F6B4F', '#1F3A5F', '#7A5AA8', '#C9BFA8'];

export default function MaterialPanel() {
  const ed = useEditor();
  const { setToast } = useApp();
  const [tab, setTab] = useState<TabId>('shape');
  const [color, setColor] = useState('#C0392B');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return MATERIALS.filter((m) => m.group === tab && (!kw || m.name.toLowerCase().includes(kw) || m.id.includes(kw)));
  }, [tab, q]);

  const mine = ed.s.assets.filter((a) => !q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase()));

  const insert = async (id: string, name: string, svg: string) => {
    if (busy) return;
    setBusy(id);
    try {
      await ed.addSvgMaterial(svg, name);
      setToast(`已加入「${name}」，可拖动、缩放`);
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    const text = prompt.trim();
    if (!text || ed.assetBusy) return;
    await ed.generateToLibrary(text, 'illustration');
    setPrompt('');
  };

  return (
    <div className="ed-panel">
      <div className="ed-panel-head">
        <div className="ed-panel-title"><Icon name="shape" size={17} /><span>素材库</span></div>
        <p>形状、图标、纹样都是矢量绘制，可直接商用</p>
      </div>

      <div className="ed-search">
        <Icon name="search" size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索素材名称" />
      </div>

      <div className="ed-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="ed-panel-body">
        {tab !== 'mine' && (
          <>
            <div className="ed-color-bar">
              <span>颜色</span>
              <div className="ed-swatch-row">
                {COLORS.map((c) => (
                  <button key={c} className={`ed-swatch sm ${color === c ? 'on' : ''}`}
                    style={{ background: c }} onClick={() => setColor(c)} title={c} />
                ))}
                <label className="ed-color-pick">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                  <Icon name="palette" size={14} />
                </label>
              </div>
            </div>

            <div className="ed-material-grid">
              {list.map((m) => (
                <button
                  key={m.id}
                  className={`ed-material ${busy === m.id ? 'busy' : ''}`}
                  title={`添加${m.name}`}
                  onClick={() => void insert(m.id, m.name, m.svg(color))}
                >
                  <span className="ed-material-art" dangerouslySetInnerHTML={{ __html: m.svg(color) }} />
                  <span className="ed-material-name">{m.name}</span>
                </button>
              ))}
              {list.length === 0 && <div className="ed-empty">没有匹配的素材</div>}
            </div>
            <p className="ed-foot-note">点击素材加入当前面；插入后可在右侧调整位置、大小与透明度。</p>
          </>
        )}

        {tab === 'mine' && (
          <>
            <div className="ed-upload-line">
              <button className="ed-btn" onClick={() => ed.assetFileRef.current?.click()}>
                <Icon name="upload" size={14} /> 上传素材
              </button>
              <input ref={ed.assetFileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={ed.onPickAssetFiles} />
              <span>支持 PNG / JPG / SVG</span>
            </div>

            {mine.length === 0 ? (
              <div className="ed-hint-card">
                <Icon name="folder" size={16} />
                <p>还没有自己的素材。上传图片，或在下方让 AI 生成一张插画。</p>
              </div>
            ) : (
              <div className="ed-asset-grid">
                {mine.map((a) => (
                  <div className="ed-asset" key={a.id}>
                    <button className="ed-asset-img" onClick={() => ed.addAssetToCanvas(a.id)} title="加入画布">
                      <img src={a.src} alt={a.name} />
                    </button>
                    <div className="ed-asset-meta">
                      <span title={a.name}>{a.name}</span>
                      <button onClick={() => ed.removeAsset(a.id)} title="删除素材"><Icon name="trash" size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="ed-section-label">AI 生成素材</div>
            <div className="ed-inline-gen">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void generate(); }}
                placeholder="如：桂花线描插画，单色"
              />
              <button onClick={() => void generate()} disabled={ed.assetBusy || !prompt.trim()}>
                {ed.assetBusy ? '生成中…' : '生成'}
              </button>
            </div>
            <p className="ed-foot-note">生成会消耗积分，结果保存在「我的」素材里，可反复使用。</p>
          </>
        )}
      </div>
    </div>
  );
}
