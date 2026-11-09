/* ============================================================
 * 上传面板（左栏「上传」）
 * ------------------------------------------------------------
 * 拖拽或点选本地图片（PNG / JPG / WEBP / SVG），自动转 PNG、
 * 入素材库并直接放到当前包装面，随后可拖动缩放。
 * ============================================================ */
import React, { useRef, useState } from 'react';
import { useEditor } from '../../EditorContext';
import { useApp } from '../../../store';
import { Icon } from '../../../components/icons';

export default function UploadPanel() {
  const ed = useEditor();
  const { setToast } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const mine = ed.s.assets.filter((a) => a.kind === 'uploaded');

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || busy) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;
    if (arr.some((f) => f.size > 12 * 1024 * 1024)) { setToast('单张图片请小于 12MB'); return; }
    setBusy(true);
    try {
      const n = await ed.uploadImages(arr);
      if (n === 0) setToast('没有可用的图片，请换 PNG / JPG / SVG');
      else setToast(`已上传 ${n} 张，并加入当前画布`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '上传失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ed-panel">
      <div className="ed-panel-head">
        <div className="ed-panel-title"><Icon name="upload" size={17} /><span>上传</span></div>
        <p>把自己的 Logo、产品图、图案放进设计里</p>
      </div>

      <div className="ed-panel-body">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
        />

        <div
          className={`ed-dropzone ${over ? 'over' : ''} ${busy ? 'busy' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void handleFiles(e.dataTransfer.files); }}
        >
          <span className="ed-dropzone-ico"><Icon name="upload" size={24} /></span>
          <strong>{busy ? '正在处理图片…' : '点击上传，或把图片拖到这里'}</strong>
          <em>支持 PNG / JPG / WEBP / SVG，单张 ≤ 12MB</em>
        </div>

        <div className="ed-tips">
          <div><Icon name="image" size={14} /><span>产品图建议去背透明 PNG，放到包装上更干净。</span></div>
          <div><Icon name="layers" size={14} /><span>上传后自动成为独立图层，可拖动、缩放、调透明度。</span></div>
          <div><Icon name="download" size={14} /><span>导出的 PNG / PDF 会使用原图分辨率，不会模糊。</span></div>
        </div>

        <div className="ed-section-label">我的上传</div>
        {mine.length === 0 ? (
          <div className="ed-hint-card">
            <Icon name="folder" size={16} />
            <p>还没有上传记录。上传过的图片会留在这里，方便在其他包装面重复使用。</p>
          </div>
        ) : (
          <div className="ed-asset-grid">
            {mine.map((a) => (
              <div className="ed-asset" key={a.id}>
                <button className="ed-asset-img" onClick={() => ed.addAssetToCanvas(a.id)} title="加入当前画布">
                  <img src={a.src} alt={a.name} />
                  <span className="ed-asset-add"><Icon name="plus" size={13} /></span>
                </button>
                <div className="ed-asset-meta">
                  <span title={a.name}>{a.name}</span>
                  <button onClick={() => ed.removeAsset(a.id)} title="删除素材"><Icon name="trash" size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
