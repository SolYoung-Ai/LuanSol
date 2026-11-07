/* 图层面板：图层列表、类型图标、显示/隐藏、锁定、复制、删除、重命名、层级调整。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { Icon, IconName } from '../../components/icons';
import { miniBtn, smallBtn } from '../constants';
import type { Layer } from '../../types';

function LayerTypeIcon({ layer }: { layer: Layer }) {
  const name: IconName = layer.type === 'text' ? 'text' : layer.type === 'image' ? 'image' : 'shape';
  return <Icon name={name} size={14} style={{ color: '#888', flexShrink: 0 }} />;
}

function IconAction({ icon, title, onClick }: { icon: IconName; title: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(e); }} style={miniBtn} title={title}>
      <Icon name={icon} size={15} />
    </button>
  );
}

export default function LayersPanel() {
  const ed = useEditor();
  const face = ed.face;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>图层列表</div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#999' }}>{face?.layers.length || 0} 个图层</span>
      </div>

      {/* 倒序显示：顶部图层在列表上方 */}
      {face?.layers.slice().reverse().map((layer) => {
        const selected = ed.selectedLayer === layer.id;
        return (
          <div
            key={layer.id}
            onClick={() => { ed.setSelectedLayer(layer.id); ed.setSelectedIds([layer.id]); }}
            style={{
              padding: '8px 10px', marginBottom: 4, borderRadius: 6, cursor: 'pointer',
              background: selected ? '#f5f5f5' : 'transparent',
              border: '1px solid ' + (selected ? '#e5e5e5' : 'transparent'),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <LayerTypeIcon layer={layer} />
              <span style={{
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', fontSize: 12, color: layer.hidden ? '#aaa' : '#333',
              }}>
                {layer.name}
              </span>
              <IconAction icon={layer.hidden ? 'eyeOff' : 'eye'} title="显示/隐藏" onClick={() => ed.toggleVisible(layer.id)} />
              <IconAction icon={layer.locked ? 'lock' : 'unlock'} title="锁定/解锁" onClick={() => ed.toggleLock(layer.id)} />
              <IconAction icon="copy" title="复制" onClick={() => ed.duplicateLayer(layer.id)} />
              <IconAction icon="trash" title="删除" onClick={() => ed.deleteLayer(layer.id)} />
            </div>

            {/* 选中时展开更多操作 */}
            {selected && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
                <button onClick={(e) => { e.stopPropagation(); ed.renameLayer(layer.id); }} style={smallBtn}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="edit" size={12} />重命名
                  </span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); ed.moveLayerUp(layer.id); }} style={smallBtn} title="上移一层">
                  <Icon name="chevronUp" size={13} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); ed.moveLayerDown(layer.id); }} style={smallBtn} title="下移一层">
                  <Icon name="chevronDown" size={13} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); ed.bringToFront(layer.id); }} style={smallBtn} title="置顶">
                  <Icon name="chevronUp" size={13} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); ed.sendToBack(layer.id); }} style={smallBtn} title="置底">
                  <Icon name="chevronDown" size={13} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {(!face || face.layers.length === 0) && (
        <div style={{ textAlign: 'center', color: '#aaa', fontSize: 12, padding: '20px 0' }}>
          暂无图层
        </div>
      )}
    </div>
  );
}
