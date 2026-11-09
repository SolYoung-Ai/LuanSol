/* ============================================================
 * 确认需求（第二步）：把「让 AI 画什么」一次说清楚。
 * ------------------------------------------------------------
 * 分区（iOS 玻璃分组卡，靠圆角与间距分层，不画分割线）：
 *   A 参考图 · B 主题色 · C 插画元素 · D 产品与品牌
 *   E 卖点与净含量 · F 产品信息 · G LOGO · H 条形码
 * 所有字段写入 workflow.productInfo，随输入即时落库（刷新不丢）。
 * 底部「开始 AI 设计」→ 进入设计方案阶段（生图另一步扣积分）。
 * ============================================================ */
import React, { useRef, useState } from 'react';
import type { ProductInfo } from '../types';
import { useApp } from '../store';
import ReferenceUploader from './components/ReferenceUploader';
import { Icon } from '../components/icons';

/** 主题色预设：覆盖常见包装调性，用户也可自定义取色 */
const PRESET_COLORS = [
  '#D9602C', '#C0392B', '#E8B04B', '#2F6B4F', '#20463A',
  '#1F3A5F', '#4B6CB7', '#7A5AA8', '#A8577A', '#111111',
  '#6B6B6B', '#C9BFA8', '#F3EEE4', '#FFFFFF',
];

export default function RequirementsStage() {
  const { s, patchWorkflow, setToast } = useApp();
  const project = s.projects.find((p) => p.id === s.activeId);
  const wf = project?.workflow;

  const [info, setInfo] = useState<ProductInfo | null>(wf?.productInfo || null);
  const [refs, setRefs] = useState(wf?.referenceImages || []);
  const [customColor, setCustomColor] = useState('#D9602C');
  const [submitting, setSubmitting] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  if (!project || !wf || !info) return null;

  /** 写入草稿（输入即存，刷新不丢） */
  const set = (patch: Partial<ProductInfo>) => {
    if (!info) return;
    const next = { ...info, ...patch };
    setInfo(next);
    patchWorkflow(project.id, { productInfo: next });
  };

  const setRefsPersist = (next: typeof refs) => {
    setRefs(next);
    patchWorkflow(project.id, { referenceImages: next });
  };

  const toggleColor = (hex: string) => {
    const has = info.themeColors.includes(hex);
    set({ themeColors: has ? info.themeColors.filter((c) => c !== hex) : [...info.themeColors, hex] });
  };

  const onLogoFile = (file?: File) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setToast('请上传图片格式的 LOGO'); return; }
    if (file.size > 4 * 1024 * 1024) { setToast('LOGO 图片请小于 4MB'); return; }
    const reader = new FileReader();
    reader.onload = () => set({ logoImage: String(reader.result || ''), logoMode: 'upload' });
    reader.onerror = () => setToast('LOGO 读取失败，请重试');
    reader.readAsDataURL(file);
  };

  const canSubmit = (info.productName.trim() || info.brandName.trim() || info.description.trim()).length > 0;

  const submit = () => {
    if (!canSubmit) {
      setToast('至少填写产品名称或一句产品描述，AI 才知道要设计什么');
      return;
    }
    setSubmitting(true);
    patchWorkflow(project.id, {
      productInfo: info,
      referenceImages: refs,
      stage: 'concepts',
      // 只有还没有方案图时才自动生成；回看/修改需求不重复扣积分
      autoGenPending: (wf.conceptImages?.length || 0) === 0,
    });
    // 生成在 ConceptStage 首次挂载时触发，这里只负责推进阶段
  };

  return (
    <div className="wf-page">
      <div className="wf-head">
        <div className="wf-kicker">STEP 02 · 确认需求</div>
        <h1 className="wf-title">{wf.mode === 'fromScratch' ? '告诉我你的产品' : '确认你的设计需求'}</h1>
        <p className="wf-sub">
          {wf.mode === 'fromScratch'
            ? '填得越具体，AI 的第一次方向就越准；不确定的项可以先留空。'
            : '上传参考图，并把配色、插画元素与卖点说清楚。'}
        </p>
      </div>

      {/* A 参考图 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">A</span><h2>参考图</h2>
          <span className="wf-hint">可选，多张；图片会真实保存到项目</span></div>
        <ReferenceUploader images={refs} onChange={setRefsPersist} onError={setToast} />
      </section>

      {/* B 主题色 + C 插画元素 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">B</span><h2>包装主题色</h2>
          <span className="wf-hint">点选主色，可多选</span></div>
        <div className="wf-swatches">
          {PRESET_COLORS.map((hex) => {
            const on = info.themeColors.includes(hex);
            return (
              <button key={hex} className={`wf-swatch ${on ? 'on' : ''}`} onClick={() => toggleColor(hex)}
                title={hex} style={{ background: hex }}>
                {on && <Icon name="check" size={14} />}
              </button>
            );
          })}
          <label className="wf-swatch wf-swatch-add" title="自定义颜色">
            <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} />
            <Icon name="plus" size={15} />
            <span>自定义</span>
          </label>
          <button className="wf-mini-btn" onClick={() => { if (!info.themeColors.includes(customColor)) toggleColor(customColor); }}>
            加入 {customColor}
          </button>
        </div>
        {info.themeColors.length > 0 &&
          <div className="wf-chosen-colors">
            {info.themeColors.map((c) => <span key={c} className="wf-chosen-color" style={{ background: c }} title={c} />)}
            <button className="wf-clear" onClick={() => set({ themeColors: [] })}>清空</button>
          </div>}

        <div className="wf-field" style={{ marginTop: 16 }}>
          <span className="wf-label">插画元素</span>
          <input className="wf-input" value={info.illustrationElements}
            onChange={(e) => set({ illustrationElements: e.target.value })}
            placeholder="如：桂花、茶叶、山峦线描；或「不要插画，纯文字排版」" />
        </div>
      </section>

      {/* D 产品与品牌 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">C</span><h2>产品与品牌</h2></div>
        <div className="wf-grid2">
          <label className="wf-field"><span className="wf-label">产品名称</span>
            <input className="wf-input" value={info.productName} onChange={(e) => set({ productName: e.target.value })}
              placeholder="如：九蒸九晒黄精" /></label>
          <label className="wf-field"><span className="wf-label">品牌名称</span>
            <input className="wf-input" value={info.brandName} onChange={(e) => set({ brandName: e.target.value })}
              placeholder="如：山野集" /></label>
        </div>
      </section>

      {/* E 卖点与净含量 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">D</span><h2>卖点与净含量</h2>
          <span className="wf-hint">会作为包装上的真实文字</span></div>
        <label className="wf-field"><span className="wf-label">一级卖点</span>
          <input className="wf-input" value={info.sellingPointPrimary} onChange={(e) => set({ sellingPointPrimary: e.target.value })}
            placeholder="如：古法九蒸九晒，0 添加" /></label>
        <label className="wf-field"><span className="wf-label">二级卖点</span>
          <input className="wf-input" value={info.sellingPointSecondary} onChange={(e) => set({ sellingPointSecondary: e.target.value })}
            placeholder="如：独立小包装，随身滋补" /></label>
        <label className="wf-field"><span className="wf-label">净含量</span>
          <input className="wf-input" value={info.netContent} onChange={(e) => set({ netContent: e.target.value })}
            placeholder="如：10g×9 袋 / 250g" /></label>
      </section>

      {/* E 产品描述：给 AI 看的创意信息 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">E</span><h2>产品描述</h2>
          <span className="wf-hint">给 AI 看的设计依据，一句话也行</span></div>
        <textarea className="wf-textarea" rows={4} value={info.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="例如：黄精礼盒，主色是砖红色，产品名称是九蒸九晒黄精，10×10×10cm，想走高端东方养生风。" />
      </section>

      {/* F 生产信息：包装背面法定文字，和设计描述分开 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">F</span><h2>生产信息</h2>
          <span className="wf-hint">印在包装背面的法定信息，可留空后补</span></div>
        <p className="wf-card-note">
          这部分是委托商、生产商、地址、许可证等真实生产信息，AI 不会替你编造；留空就不生成，避免印出错误的法定文字。
        </p>
        <div className="wf-grid2">
          <label className="wf-field"><span className="wf-label">委托商 / 品牌方</span>
            <input className="wf-input" value={info.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })}
              placeholder="如：山野集健康食品有限公司" /></label>
          <label className="wf-field"><span className="wf-label">生产商</span>
            <input className="wf-input" value={info.producer} onChange={(e) => set({ producer: e.target.value })}
              placeholder="如：×××食品厂" /></label>
        </div>
        <label className="wf-field"><span className="wf-label">生产地址</span>
          <input className="wf-input" value={info.productionAddress} onChange={(e) => set({ productionAddress: e.target.value })}
            placeholder="如：安徽省亳州市××区××路 88 号" /></label>
        <div className="wf-grid2">
          <label className="wf-field"><span className="wf-label">生产许可证编号</span>
            <input className="wf-input" value={info.productionLicense} onChange={(e) => set({ productionLicense: e.target.value })}
              placeholder="如：SC10123456789012" /></label>
          <label className="wf-field"><span className="wf-label">执行标准</span>
            <input className="wf-input" value={info.standardCode} onChange={(e) => set({ standardCode: e.target.value })}
              placeholder="如：GB/T 20977" /></label>
          <label className="wf-field"><span className="wf-label">保质期 / 贮存</span>
            <input className="wf-input" value={info.shelfLife} onChange={(e) => set({ shelfLife: e.target.value })}
              placeholder="如：18 个月，阴凉干燥处" /></label>
          <label className="wf-field"><span className="wf-label">服务电话</span>
            <input className="wf-input" value={info.servicePhone} onChange={(e) => set({ servicePhone: e.target.value })}
              placeholder="如：400-000-0000" /></label>
        </div>
      </section>

      {/* G LOGO */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">G</span><h2>LOGO</h2></div>
        <div className="wf-seg">
          {([['upload', '已有 LOGO，上传'], ['generate', '没有 LOGO，按名称生成'], ['none', '暂时不放']] as const).map(([mode, label]) => (
            <button key={mode} className={`wf-seg-btn ${info.logoMode === mode ? 'on' : ''}`}
              onClick={() => set({ logoMode: mode })}>{label}</button>
          ))}
        </div>

        {info.logoMode === 'upload' && <div className="wf-logo-upload">
          <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { onLogoFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="wf-logo-box" onClick={() => logoRef.current?.click()}>
            {info.logoImage ? <img src={info.logoImage} alt="LOGO" /> : <><Icon name="upload" size={20} /><span>上传 LOGO</span></>}
          </button>
          {info.logoImage && <button className="wf-clear" onClick={() => set({ logoImage: '' })}>移除</button>}
        </div>}

        {info.logoMode === 'generate' && <label className="wf-field">
          <span className="wf-label">LOGO 名称（AI 据此生成字形标识）</span>
          <input className="wf-input" value={info.logoName} onChange={(e) => set({ logoName: e.target.value })}
            placeholder="如：山野集 SHANYE" />
        </label>}
      </section>

      {/* H 条形码 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">H</span><h2>条形码</h2>
          <span className="wf-hint">有就填，没有留空；不伪造条码</span></div>
        <input className="wf-input" value={info.barcode} onChange={(e) => set({ barcode: e.target.value.replace(/[^\d]/g, '').slice(0, 14) })}
          inputMode="numeric" placeholder="如：6901234567892" />
      </section>

      <div className="wf-actions">
        <button className="wf-btn-ghost" onClick={() => {
          if (window.history.length > 1) window.history.back(); else window.location.hash = '#/workspace';
        }}>取消</button>
        <button className="wf-btn-primary" onClick={submit} disabled={submitting || !canSubmit}
          style={{ opacity: canSubmit ? 1 : 0.5 }}>
          <Icon name="spark" size={16} /> {submitting ? '正在进入…' : '开始 AI 设计'}
        </button>
      </div>
      <p className="wf-foot-note">下一步会按 6 积分的档位生成 3 张完整包装效果图，可单张重新生成。</p>
    </div>
  );
}
