/* ============================================================
   Studio 2.0 阶段二 — 右侧对象属性面板
   ------------------------------------------------------------
   规则：只显示当前选中对象真正用得上的属性，不把所有属性堆在一起。
     选中文字 → 内容 / 字体 / 字号 / 字重 / 字距 / 行高 / 对齐 / 颜色 / 透明度
     选中图片 → 换图 / 适配 / 裁切 / 尺寸 / 透明度
     选中形状 → 形态 / 填充 / 描边 / 圆角 / 透明度
     多选     → 对齐分布 / 组合 / 层级 / 透明度
     未选中   → 当前面板信息（尺寸、出血、安全边、元素数量）
   所有写操作都通过 patchEls 进入历史栈，mergeKey 让连续拖动只留一条。
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';
import { FONTS } from '../engine/design';
import { STUDIO_BLEED, STUDIO_SAFE, elLocalRect, elTextMetrics } from './frames';
import { textOverflow } from './vec';
import { patchEls } from './design';
import { findLayerPair } from './layerImport';
import type { DesignEl, StudioDesign } from './types';
import { bgForFace } from './types';

type Panel = { id: string; w: number; h: number; labelZh?: string; labelEn?: string };

interface Props {
  design: StudioDesign;
  faceKey: string;
  panel: Panel;
  els: DesignEl[];
  sel: string[];
  onCommit: (next: StudioDesign, mergeKey?: string) => void;
  onPickFile: (replaceId: string) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onOrder: (action: 'front' | 'back' | 'up' | 'down') => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const SWATCHES = ['#191919', '#FFFFFF', '#F47735', '#8C2F2F', '#2F5D4A', '#23364D', '#C8A96A', '#8A8A84'];

/** 字体是否可用：只看栈里第一个字族，缺字体时明确提示，不静默替换 */
function fontAvailable(family: string): boolean {
  try {
    const first = family.split(',')[0].replace(/["']/g, '').trim();
    if (!first || !document.fonts) return true;
    return document.fonts.check(`12px "${first}"`) || /serif|sans-serif|monospace/.test(first);
  } catch {
    return true;
  }
}

export default function Inspector({
  design, faceKey, panel, els, sel, onCommit, onPickFile, onGroup, onUngroup, onOrder, onDuplicate, onDelete,
}: Props) {
  const { t } = useLang();
  const [cropOpen, setCropOpen] = useState(false);
  const picked = useMemo(() => els.filter((e) => sel.includes(e.id)), [els, sel]);
  const one = picked.length === 1 ? picked[0] : null;
  const face = { w: panel.w, h: panel.h };

  const patch = (ids: string[], p: Partial<DesignEl>, key: string) =>
    onCommit(patchEls(design, ids, p, faceKey), `${key}:${ids.join(',')}`);

  /* ---------------- 未选中：面板信息 ---------------- */
  if (!picked.length) {
    return <div className="st-insp">
      <div className="st-insp-head"><b>{t('面板信息', 'Panel')}</b><em>{t(panel.labelZh || '正面', panel.labelEn || 'Front')}</em></div>
      <div className="st-insp-rows">
        <div><span>{t('成品尺寸', 'Size')}</span><b>{Math.round(panel.w)} × {Math.round(panel.h)} mm</b></div>
        <div><span>{t('出血 / 安全边', 'Bleed / safe')}</span><b>{STUDIO_BLEED} / {STUDIO_SAFE} mm</b></div>
        <div><span>{t('对象数量', 'Objects')}</span><b>{els.length}</b></div>
        <div><span>{t('画布底色', 'Canvas')}</span><b className="st-insp-swatch" style={{ background: bgForFace(design, faceKey) }}>{bgForFace(design, faceKey)}</b></div>
      </div>
      <p className="st-insp-note">{t('在画布上点一个对象，这里会切到它的属性。', 'Select an object on the canvas to see its properties.')}</p>
      <div className="st-insp-tips">
        <b>{t('快捷键', 'Shortcuts')}</b>
        <div><kbd>V</kbd>{t('选择', 'Select')}<kbd>H</kbd>{t('平移', 'Pan')}</div>
        <div><kbd>⌘Z</kbd>{t('撤销', 'Undo')}<kbd>⇧⌘Z</kbd>{t('重做', 'Redo')}</div>
        <div><kbd>⌘C</kbd>/<kbd>⌘V</kbd>{t('复制粘贴', 'Copy & paste')}<kbd>Del</kbd>{t('删除', 'Delete')}</div>
        <div><kbd>↑</kbd>{t('微调 1%', 'Nudge 1%')}<kbd>⇧↑</kbd>{t('快速 10%', '10%')}</div>
      </div>
    </div>;
  }

  /* ---------------- 多选 ---------------- */
  if (picked.length > 1) {
    const groupIds = new Set(picked.map((e) => e.groupId).filter(Boolean));
    return <div className="st-insp">
      <div className="st-insp-head"><b>{t('多选', 'Multi-select')}</b><em>{picked.length} {t('个对象', 'objects')}</em></div>
      <InspectorCommon picked={picked} patch={patch} design={design} faceKey={faceKey} />
      <div className="st-insp-sec">
        <span>{t('组合', 'Group')}</span>
        <div className="st-insp-row">
          <button onClick={onGroup} disabled={picked.length < 2}>{t('组合', 'Group')}</button>
          <button onClick={onUngroup} disabled={!groupIds.size}>{t('取消组合', 'Ungroup')}</button>
        </div>
      </div>
      <InspectorOrder onOrder={onOrder} onDuplicate={onDuplicate} onDelete={onDelete} />
    </div>;
  }

  const el = one!;
  const box = elLocalRect(el, face);
  const isText = el.kind === 'text';
  const isImage = el.kind === 'sticker';
  const isShape = el.kind === 'rect';
  const fontMissing = isText && el.fontFamily ? !fontAvailable(el.fontFamily) : false;
  const overflow = isText ? textOverflow(el, face) : false;
  const m = isText ? elTextMetrics(el, face) : null;
  const pair = isImage || isText ? findLayerPair(els, el.id) : {};

  const showOriginal = () => {
    if (!pair.image) return;
    const hiddenText = pair.text
      ? patchEls(design, [pair.text.id], { visible: false }, faceKey)
      : design;
    onCommit(patchEls(hiddenText, [pair.image.id], { visible: true }, faceKey), 'ocr-original');
  };
  const showOcrText = () => {
    if (!pair.text) return;
    const hiddenImage = pair.image
      ? patchEls(design, [pair.image.id], { visible: false }, faceKey)
      : design;
    onCommit(patchEls(hiddenImage, [pair.text.id], { visible: true }, faceKey), 'ocr-text');
  };

  return <div className="st-insp">
    <div className="st-insp-head">
      <b>{isText ? t('文字', 'Text') : isImage ? t('图片', 'Image') : t('形状', 'Shape')}</b>
      <em>{Math.round(box.w * 10) / 10} × {Math.round(box.h * 10) / 10} mm</em>
    </div>

    <div className="st-insp-sec">
      <span>{t('图层名', 'Layer name')}</span>
      <input
        className="st-insp-input"
        value={el.name ?? ''}
        placeholder={isText ? (el.text || '').slice(0, 14) : isImage ? t('插图', 'Graphic') : t('形状', 'Shape')}
        onChange={(ev) => patch([el.id], { name: ev.target.value.slice(0, 40) }, 'name')}
      />
    </div>

    {(isImage || isText) && <div className="st-insp-sec">
      <span>{t('素材类型', 'Layer type')}<em>{t('可手动改', 'editable')}</em></span>
      <select
        className="st-insp-input"
        value={el.layerType || (isText ? 'text' : 'unknown')}
        onChange={(ev) => patch([el.id], { layerType: ev.target.value as DesignEl['layerType'] }, 'layerType')}
      >
        {([
          ['background', t('背景', 'Background')],
          ['illustration', t('插画', 'Illustration')],
          ['decorative', t('装饰', 'Decorative')],
          ['product', t('产品', 'Product')],
          ['logo', t('Logo', 'Logo')],
          ['text', t('文字', 'Text')],
          ['unknown', t('未识别', 'Unknown')],
        ] as [NonNullable<DesignEl['layerType']>, string][]).map(([v, label]) =>
          <option key={v} value={v}>{label}</option>)}
      </select>
    </div>}

    {isText && pair.image && <div className="st-insp-sec">
      <span>{t('OCR 原图', 'OCR source')}</span>
      <button className="st-insp-link" onClick={showOriginal}>
        {t('换回原 PNG（保留这段文字）', 'Show original PNG, keep this text')}
      </button>
    </div>}

    {isText && <>
      <div className="st-insp-sec">
        <span>{t('内容', 'Text')}</span>
        <textarea
          rows={3}
          className="st-insp-input"
          value={el.text || ''}
          onChange={(ev) => patch([el.id], { text: ev.target.value.slice(0, 200) }, 'text')}
        />
        {overflow && <p className="st-insp-warn"><Icon name="alert" size={12} />{t('文字超出文本框，导出会按当前宽高裁切', 'Overflows the text box')}</p>}
      </div>
      <div className="st-insp-sec">
        <span>{t('字体', 'Font')}</span>
        <select
          className="st-insp-input"
          value={el.fontFamily || FONTS[0].id}
          onChange={(ev) => patch([el.id], { fontFamily: ev.target.value }, 'font')}
        >
          {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        {fontMissing && <p className="st-insp-warn"><Icon name="alert" size={12} />
          {t('本机没有这套字体，导出会回落到默认黑体，可能位移', 'Font missing locally — export falls back to the default sans')}
        </p>}
      </div>
      <div className="st-insp-sec">
        <span>{t('字号', 'Size')}<em>{m ? m.sizeMm.toFixed(1) : 0} mm</em></span>
        <input type="range" min={1} max={20} step={0.5} value={el.size || 3}
          onChange={(ev) => patch([el.id], { size: Number(ev.target.value) }, 'size')} />
      </div>
      <div className="st-insp-sec">
        <span>{t('字重', 'Weight')}<em>{el.weight || 400}</em></span>
        <div className="st-insp-row">
          {[300, 400, 500, 600, 700].map((w) => <button key={w}
            className={(el.weight || 400) === w ? 'on' : ''}
            style={{ fontWeight: w }}
            onClick={() => patch([el.id], { weight: w }, 'weight')}>{w}</button>)}
        </div>
      </div>
      <div className="st-insp-grid2">
        <label><span>{t('字间距', 'Tracking')}<em>{el.letterSpacing ?? 0} em</em></span>
          <input type="range" min={-0.1} max={0.4} step={0.01} value={el.letterSpacing ?? 0}
            onChange={(ev) => patch([el.id], { letterSpacing: Number(ev.target.value) }, 'tracking')} />
        </label>
        <label><span>{t('行高', 'Leading')}<em>{el.lineHeight ?? 1.4} em</em></span>
          <input type="range" min={0.8} max={2.4} step={0.05} value={el.lineHeight ?? 1.4}
            onChange={(ev) => patch([el.id], { lineHeight: Number(ev.target.value) }, 'leading')} />
        </label>
      </div>
      <div className="st-insp-sec">
        <span>{t('对齐', 'Align')}</span>
        <div className="st-insp-row">
          {(['left', 'center', 'right'] as const).map((a) => <button key={a}
            className={(el.align || 'left') === a ? 'on' : ''}
            onClick={() => patch([el.id], { align: a }, 'align')}>
            {a === 'left' ? <Icon name="alignLeft" size={13} /> : a === 'center' ? <Icon name="alignHCenter" size={13} /> : <Icon name="alignRight" size={13} />}
          </button>)}
        </div>
      </div>
    </>}

    {isImage && <>
      <div className="st-insp-sec">
        <span>{t('图片', 'Image')}</span>
        <div className="st-insp-row">
          <button onClick={() => onPickFile(el.id)}><Icon name="upload" size={13} />{t('换一张', 'Replace')}</button>
          {el.src && <button onClick={() => patch([el.id], { src: undefined }, 'clear')}><Icon name="trash" size={13} />{t('清除', 'Clear')}</button>}
        </div>
        {el.naturalW && el.naturalH && <p className="st-insp-note">{t('原图', 'Source')} {el.naturalW} × {el.naturalH} px</p>}
        {pair.text && <p className="st-insp-note">{t('这张图有对应的 OCR 文字层；切过去可改字，字体是替代字体。',
          'An editable OCR text layer exists for this image. Switch to edit wording; the font is a substitute.')}</p>}
        {pair.text && <div className="st-insp-row">
          <button onClick={showOcrText}><Icon name="text" size={13} />{t('显示可编辑文字', 'Show OCR text')}</button>
        </div>}
      </div>
      <div className="st-insp-sec">
        <span>{t('适配', 'Fit')}</span>
        <div className="st-insp-row">
          <button className={(el.fit || 'contain') === 'contain' ? 'on' : ''}
            onClick={() => patch([el.id], { fit: 'contain' }, 'fit')}>{t('完整显示', 'Contain')}</button>
          <button className={el.fit === 'cover' ? 'on' : ''}
            onClick={() => patch([el.id], { fit: 'cover' }, 'fit')}>{t('裁满画框', 'Cover')}</button>
        </div>
      </div>
      <div className="st-insp-sec">
        <span>{t('裁切', 'Crop')}</span>
        <div className="st-insp-row">
          <button onClick={() => setCropOpen((v) => !v)}>{cropOpen ? t('收起', 'Hide') : t('调整裁切', 'Adjust')}</button>
          {el.crop && <button onClick={() => patch([el.id], { crop: undefined }, 'crop')}>{t('复位', 'Reset')}</button>}
        </div>
        {cropOpen && <div className="st-insp-grid2">
          <label><span>{t('横向裁切', 'Crop X')}<em>{Math.round((el.crop?.w ?? 1) * 100)}%</em></span>
            <input type="range" min={10} max={100} step={1} value={(el.crop?.w ?? 1) * 100}
              onChange={(ev) => patch([el.id], {
                crop: { x: el.crop?.x || 0, y: el.crop?.y || 0, w: Number(ev.target.value) / 100, h: el.crop?.h ?? 1 },
              }, 'crop')} />
          </label>
          <label><span>{t('纵向裁切', 'Crop Y')}<em>{Math.round((el.crop?.h ?? 1) * 100)}%</em></span>
            <input type="range" min={10} max={100} step={1} value={(el.crop?.h ?? 1) * 100}
              onChange={(ev) => patch([el.id], {
                crop: { x: el.crop?.x || 0, y: el.crop?.y || 0, w: el.crop?.w ?? 1, h: Number(ev.target.value) / 100 },
              }, 'crop')} />
          </label>
        </div>}
      </div>
    </>}

    {isShape && <>
      <div className="st-insp-sec">
        <span>{t('形态', 'Shape')}</span>
        <div className="st-insp-row">
          {([['rect', t('矩形', 'Rect')], ['ellipse', t('圆形', 'Ellipse')], ['line', t('直线', 'Line')]] as const).map(([v, label]) => <button
            key={v}
            className={(el.shape || 'rect') === v ? 'on' : ''}
            onClick={() => patch([el.id], { shape: v }, 'shape')}>{label}</button>)}
        </div>
      </div>
      <div className="st-insp-sec">
        <span>{t('填充', 'Fill')}</span>
        <div className="st-insp-swatches">
          {SWATCHES.map((c) => <button key={c} className={el.color === c ? 'on' : ''}
            style={{ background: c }} aria-label={c}
            onClick={() => patch([el.id], { color: c }, 'fill')} />)}
          <input type="color" value={el.color || design.accent}
            onChange={(ev) => patch([el.id], { color: ev.target.value }, 'fill')} />
        </div>
      </div>
      {(el.shape || 'rect') === 'rect' && <div className="st-insp-sec">
        <span>{t('圆角', 'Radius')}<em>{el.radius ?? 0} mm</em></span>
        <input type="range" min={0} max={30} step={0.5} value={el.radius ?? 0}
          onChange={(ev) => patch([el.id], { radius: Number(ev.target.value) }, 'radius')} />
      </div>}
      <div className="st-insp-sec">
        <span>{t('描边', 'Stroke')}</span>
        <div className="st-insp-row">
          <input type="color" value={el.stroke || '#191919'}
            onChange={(ev) => patch([el.id], { stroke: ev.target.value }, 'stroke')} />
          <button className={!el.stroke ? 'on' : ''} onClick={() => patch([el.id], { stroke: undefined }, 'stroke')}>{t('无', 'None')}</button>
        </div>
        <input type="range" min={0} max={6} step={0.1} value={el.strokeWidth ?? 0}
          onChange={(ev) => patch([el.id], { strokeWidth: Number(ev.target.value) }, 'strokeW')} />
      </div>
    </>}

    {isText && <div className="st-insp-sec">
      <span>{t('文字颜色', 'Colour')}</span>
      <div className="st-insp-swatches">
        {SWATCHES.map((c) => <button key={c} className={el.color === c ? 'on' : ''}
          style={{ background: c }} aria-label={c}
          onClick={() => patch([el.id], { color: c }, 'color')} />)}
        <input type="color" value={el.color || design.ink}
          onChange={(ev) => patch([el.id], { color: ev.target.value }, 'color')} />
      </div>
    </div>}

    <InspectorCommon picked={picked} patch={patch} design={design} faceKey={faceKey} />
    <InspectorOrder onOrder={onOrder} onDuplicate={onDuplicate} onDelete={onDelete} />

    <div className="st-insp-sec">
      <span>{t('尺寸（占面板百分比）', 'Size (% of panel)')}</span>
      <div className="st-insp-grid2">
        <label><span>W</span><input className="st-insp-input" type="number" min={1} max={100} step={0.5}
          value={Math.round(el.w * 10) / 10}
          onChange={(ev) => patch([el.id], { w: Number(ev.target.value) }, 'w')} /></label>
        <label><span>H</span><input className="st-insp-input" type="number" min={0.3} max={100} step={0.5}
          value={Math.round(((el.h ?? (el.kind === 'text' ? (m?.h ?? 2) / panel.h * 100 : 10)) * 10)) / 10}
          onChange={(ev) => patch([el.id], { h: Number(ev.target.value) }, 'h')} /></label>
      </div>
      {el.kind === 'sticker' && <button className="st-insp-link" onClick={() => {
        if (!el.naturalW || !el.naturalH) return;
        const h = (el.w * (el.naturalH / el.naturalW) * panel.w) / panel.h;
        patch([el.id], { h }, 'aspect');
      }}>{t('按原图比例恢复高度', 'Restore aspect ratio')}</button>}
    </div>
  </div>;
}

/** 共用：透明度 / 旋转 / 可见 / 锁定 */
function InspectorCommon({
  picked, patch, design, faceKey,
}: { picked: DesignEl[]; patch: (ids: string[], p: Partial<DesignEl>, key: string) => void; design: StudioDesign; faceKey: string }) {
  const { t } = useLang();
  const ids = picked.map((e) => e.id);
  const first = picked[0];
  return <>
    <div className="st-insp-sec">
      <span>{t('透明度', 'Opacity')}<em>{Math.round((first.opacity ?? 1) * 100)}%</em></span>
      <input type="range" min={5} max={100} step={1} value={Math.round((first.opacity ?? 1) * 100)}
        onChange={(ev) => patch(ids, { opacity: Number(ev.target.value) / 100 }, 'opacity')} />
    </div>
    <div className="st-insp-sec">
      <span>{t('旋转', 'Rotation')}<em>{first.rotation ?? 0}°</em></span>
      <input type="range" min={-180} max={180} step={1} value={first.rotation ?? 0}
        onChange={(ev) => patch(ids, { rotation: Number(ev.target.value) }, 'rotation')} />
      <button className="st-insp-link" onClick={() => patch(ids, { rotation: 0 }, 'rotation-reset')}>{t('归零', 'Reset')}</button>
    </div>
    <div className="st-insp-sec">
      <span>{t('显示与锁定', 'Visible & lock')}</span>
      <div className="st-insp-row">
        <button className={first.visible !== false ? 'on' : ''}
          onClick={() => patch(ids, { visible: first.visible === false }, 'visible')}>
          <Icon name={first.visible === false ? 'eyeOff' : 'eye'} size={13} />{first.visible === false ? t('隐藏', 'Hidden') : t('可见', 'Visible')}
        </button>
        <button className={first.locked ? 'on' : ''}
          onClick={() => patch(ids, { locked: !first.locked }, 'locked')}>
          <Icon name={first.locked ? 'lock' : 'unlock'} size={13} />{first.locked ? t('已锁', 'Locked') : t('未锁', 'Unlocked')}
        </button>
      </div>
    </div>
    <p className="st-insp-note">{t('底色', 'Canvas')} {bgForFace(design, faceKey)}</p>
  </>;
}

function InspectorOrder({
  onOrder, onDuplicate, onDelete,
}: { onOrder: (a: 'front' | 'back' | 'up' | 'down') => void; onDuplicate: () => void; onDelete: () => void }) {
  const { t } = useLang();
  return <div className="st-insp-sec">
    <span>{t('层级与操作', 'Order & actions')}</span>
    <div className="st-insp-row">
      <button onClick={() => onOrder('front')} title={t('置顶', 'Front')}><Icon name="chevronUp" size={13} />{t('顶', 'Top')}</button>
      <button onClick={() => onOrder('up')} title={t('上移', 'Up')}><Icon name="chevronUp" size={13} /></button>
      <button onClick={() => onOrder('down')} title={t('下移', 'Down')}><Icon name="chevronDown" size={13} /></button>
      <button onClick={() => onOrder('back')} title={t('置底', 'Back')}><Icon name="chevronDown" size={13} />{t('底', 'Bottom')}</button>
    </div>
    <div className="st-insp-row">
      <button onClick={onDuplicate}><Icon name="copy" size={13} />{t('复制', 'Duplicate')}</button>
      <button className="is-danger" onClick={onDelete}><Icon name="trash" size={13} />{t('删除', 'Delete')}</button>
    </div>
  </div>;
}
