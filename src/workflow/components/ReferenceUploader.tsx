/* 多参考图上传：拖拽/点击 → 真实转 data URL 持久化 → 缩略图/主色/备注/用途/删除。 */
import React, { useRef, useState } from 'react';
import type { ReferenceImage, ReferenceRole } from '../../types';
import { processImageFile } from '../imageUtils';
import { Icon } from '../../components/icons';
import { uid } from '../../engine/utils';

const ROLE_OPTIONS: { value: ReferenceRole; label: string }[] = [
  { value: 'packaging', label: '包装参考图' },
  { value: 'product', label: '产品照片' },
  { value: 'competitor', label: '竞品包装' },
  { value: 'logo', label: '品牌 Logo' },
  { value: 'brandGuideline', label: '品牌视觉规范' },
  { value: 'font', label: '字体参考' },
  { value: 'material', label: '材质参考' },
  { value: 'finishing', label: '印刷工艺参考' },
  { value: 'sketch', label: '手绘草图' },
  { value: 'other', label: '其他灵感' },
];

interface Props {
  images: ReferenceImage[];
  onChange: (next: ReferenceImage[]) => void;
  onError: (message: string) => void;
}

export default function ReferenceUploader({ images, onChange, onError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<ReferenceImage | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length || processing) return;
    setProcessing(true);
    const added: ReferenceImage[] = [];
    for (const file of Array.from(fileList)) {
      try {
        const result = await processImageFile(file);
        added.push({
          id: uid('ref'),
          src: result.dataUrl,
          name: file.name,
          naturalW: result.naturalW,
          naturalH: result.naturalH,
          ratio: result.ratio,
          role: 'packaging',
          note: '',
          dominantColors: result.dominantColors,
          createdAt: Date.now(),
        });
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    }
    if (added.length) onChange([...images, ...added]);
    setProcessing(false);
  };

  const updateImage = (id: string, patch: Partial<ReferenceImage>) => {
    onChange(images.map((img) => (img.id === id ? { ...img, ...patch } : img)));
  };
  const removeImage = (id: string) => onChange(images.filter((img) => img.id !== id));

  return (
    <div>
      {/* 拖拽/点击上传区 */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        style={{
          border: `1.5px dashed ${dragging ? '#e8783a' : '#cfcfcf'}`,
          background: dragging ? '#fdf3ec' : '#fafafa',
          borderRadius: 12,
          padding: '32px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', color: '#888', marginBottom: 8 }}>
          <Icon name="upload" size={26} />
        </div>
        <div style={{ fontSize: 14, color: '#333', fontWeight: 600 }}>
          {processing ? '正在处理图片…' : '点击或拖拽上传参考图片'}
        </div>
        <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
          支持 JPG / PNG / WEBP，可一次上传多张，单张不超过 12MB
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* 已上传图片列表 */}
      {images.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {images.map((img) => (
            <div
              key={img.id}
              style={{
                border: '1px solid #e8e8e8',
                borderRadius: 10,
                padding: 12,
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setPreview(img)}
                  style={{
                    width: 72, height: 72, flexShrink: 0,
                    borderRadius: 8, overflow: 'hidden', border: '1px solid #eee',
                    background: '#f6f6f6', cursor: 'zoom-in', padding: 0,
                  }}
                  title="点击预览"
                >
                  <img src={img.src} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {img.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    {img.naturalW}×{img.naturalH}px
                    {img.dominantColors.length > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8 }}>
                        {img.dominantColors.slice(0, 5).map((c) => (
                          <span key={c} style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }} title={c} />
                        ))}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <select
                      value={img.role}
                      onChange={(e) => updateImage(img.id, { role: e.target.value as ReferenceRole })}
                      style={{ fontSize: 12, padding: '5px 8px', border: '1px solid #ddd', borderRadius: 6, background: '#fff' }}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => removeImage(img.id)}
                  style={{
                    alignSelf: 'flex-start', width: 28, height: 28,
                    border: '1px solid #eee', borderRadius: 6, background: '#fff',
                    color: '#999', cursor: 'pointer', display: 'grid', placeItems: 'center',
                  }}
                  title="删除"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>

              <input
                value={img.note}
                onChange={(e) => updateImage(img.id, { note: e.target.value })}
                placeholder="备注：说明这张图参考哪部分，如「参考配色，不要参考 Logo」"
                style={{
                  marginTop: 10, width: '100%', fontSize: 12,
                  padding: '7px 10px', border: '1px solid #e4e4e4', borderRadius: 6,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* 预览弹层 */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            zIndex: 1000, display: 'grid', placeItems: 'center', padding: 24,
          }}
        >
          <img
            src={preview.src}
            alt={preview.name}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );
}
