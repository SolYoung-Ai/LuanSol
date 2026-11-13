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
import { useLang } from '../i18n';
import ReferenceUploader from './components/ReferenceUploader';
import { Icon } from '../components/icons';
import { imageCost } from '../cloud/models';
import { compressImageForUpload } from './imageUtils';

/** 主题色预设：覆盖常见包装调性，用户也可自定义取色 */
const PRESET_COLORS = [
  '#D9602C', '#C0392B', '#E8B04B', '#2F6B4F', '#20463A',
  '#1F3A5F', '#4B6CB7', '#7A5AA8', '#A8577A', '#111111',
  '#6B6B6B', '#C9BFA8', '#F3EEE4', '#FFFFFF',
];

export default function RequirementsStage() {
  const { s, patchWorkflow, setToast } = useApp();
  const { t } = useLang();
  const project = s.projects.find((p) => p.id === s.activeId);
  const wf = project?.workflow;

  const [info, setInfo] = useState<ProductInfo | null>(wf?.productInfo || null);
  const [refs, setRefs] = useState(wf?.referenceImages || []);
  const [customColor, setCustomColor] = useState('#D9602C');
  const [submitting, setSubmitting] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  if (!project || !wf || !info) return null;

  /* 旧草稿里的 productInfo 是加 themeColors 之前存的，这个键根本不存在。
   * store 载入时已统一迁移，这里再兜一层：渲染阶段绝不假设数组一定存在。 */
  const colors = Array.isArray(info.themeColors) ? info.themeColors : [];

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
    const has = colors.includes(hex);
    set({ themeColors: has ? colors.filter((c) => c !== hex) : [...colors, hex] });
  };

  const onLogoFile = async (file?: File) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setToast(t('请上传图片格式的 LOGO', 'Please upload an image file for the logo.')); return; }
    // 与 Luna 输入框同一套上限：本机压缩代替 4MB 硬拒，原图再大也能传
    try {
      const compressed = await compressImageForUpload(file, { maxEdge: 1600 });
      set({ logoImage: compressed.dataUrl, logoMode: 'upload' });
    } catch (err) {
      const tooLarge = err instanceof Error && err.message === 'TOO_LARGE';
      setToast(tooLarge
        ? t('LOGO 图片超过 30MB，请先压缩或换一张', 'The logo is over 30 MB — compress it or pick another one')
        : t('LOGO 读取失败，请重试', 'Could not read the logo file. Please try again.'));
    }
  };

  const canSubmit = (info.productName.trim() || info.brandName.trim() || info.description.trim()).length > 0;

  const submit = () => {
    if (!canSubmit) {
      setToast(t('至少填写产品名称或一句产品描述，AI 才知道要设计什么',
        'Fill in at least a product name or a one-line description so AI knows what to design.'));
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
        <div className="wf-kicker">{t('STEP 02 · 确认需求', 'STEP 02 · Requirements')}</div>
        <h1 className="wf-title">{wf.mode === 'fromScratch'
          ? t('告诉我你的产品', 'Tell me about your product')
          : t('确认你的设计需求', 'Confirm your design brief')}</h1>
        <p className="wf-sub">
          {wf.mode === 'fromScratch'
            ? t('填得越具体，AI 的第一次方向就越准；不确定的项可以先留空。',
              'The more specific you are, the closer AI gets on the first try. Leave anything you are unsure about blank.')
            : t('上传参考图，并把配色、插画元素与卖点说清楚。',
              'Upload references, and spell out the colors, illustration elements and selling points.')}
        </p>
      </div>

      {/* A 参考图 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">A</span><h2>{t('参考图', 'References')}</h2>
          <span className="wf-hint">{t('可选，多张；图片会真实保存到项目', 'Optional, multiple. Images are saved with the project.')}</span></div>
        <ReferenceUploader images={refs} onChange={setRefsPersist} onError={setToast} />
      </section>

      {/* B 主题色 + C 插画元素 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">B</span><h2>{t('包装主题色', 'Theme colors')}</h2>
          <span className="wf-hint">{t('点选主色，可多选', 'Tap the primary colors, multiple allowed')}</span></div>
        <div className="wf-swatches">
          {PRESET_COLORS.map((hex) => {
            const on = colors.includes(hex);
            return (
              <button key={hex} className={`wf-swatch ${on ? 'on' : ''}`} onClick={() => toggleColor(hex)}
                title={hex} style={{ background: hex }}>
                {on && <Icon name="check" size={14} />}
              </button>
            );
          })}
          <label className="wf-swatch wf-swatch-add" title={t('自定义颜色', 'Custom color')}>
            <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} />
            <Icon name="plus" size={15} />
            <span>{t('自定义', 'Custom')}</span>
          </label>
          <button className="wf-mini-btn" onClick={() => { if (!colors.includes(customColor)) toggleColor(customColor); }}>
            {t(`加入 ${customColor}`, `Add ${customColor}`)}
          </button>
        </div>
        {colors.length > 0 &&
          <div className="wf-chosen-colors">
            {colors.map((c) => <span key={c} className="wf-chosen-color" style={{ background: c }} title={c} />)}
            <button className="wf-clear" onClick={() => set({ themeColors: [] })}>{t('清空', 'Clear')}</button>
          </div>}

        <div className="wf-field" style={{ marginTop: 16 }}>
          <span className="wf-label">{t('插画元素', 'Illustration elements')}</span>
          <input className="wf-input" value={info.illustrationElements}
            onChange={(e) => set({ illustrationElements: e.target.value })}
            placeholder={t('如：桂花、茶叶、山峦线描；或「不要插画，纯文字排版」',
              'e.g. osmanthus, tea leaves, line-drawn mountains — or “no illustration, type only”')} />
        </div>
      </section>

      {/* D 产品与品牌 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">C</span><h2>{t('产品与品牌', 'Product & brand')}</h2></div>
        <div className="wf-grid2">
          <label className="wf-field"><span className="wf-label">{t('产品名称', 'Product name')}</span>
            <input className="wf-input" value={info.productName} onChange={(e) => set({ productName: e.target.value })}
              placeholder={t('如：九蒸九晒黄精', 'e.g. Nine-steamed polygonatum')} /></label>
          <label className="wf-field"><span className="wf-label">{t('品牌名称', 'Brand name')}</span>
            <input className="wf-input" value={info.brandName} onChange={(e) => set({ brandName: e.target.value })}
              placeholder={t('如：山野集', 'e.g. Shanye')} /></label>
        </div>
      </section>

      {/* E 卖点与净含量 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">D</span><h2>{t('卖点与净含量', 'Selling points & net content')}</h2>
          <span className="wf-hint">{t('会作为包装上的真实文字', 'Printed as real text on the packaging')}</span></div>
        <label className="wf-field"><span className="wf-label">{t('一级卖点', 'Primary selling point')}</span>
          <input className="wf-input" value={info.sellingPointPrimary} onChange={(e) => set({ sellingPointPrimary: e.target.value })}
            placeholder={t('如：古法九蒸九晒，0 添加', 'e.g. Traditional nine-steam process, zero additives')} /></label>
        <label className="wf-field"><span className="wf-label">{t('二级卖点', 'Secondary selling point')}</span>
          <input className="wf-input" value={info.sellingPointSecondary} onChange={(e) => set({ sellingPointSecondary: e.target.value })}
            placeholder={t('如：独立小包装，随身滋补', 'e.g. Individually wrapped, easy to carry')} /></label>
        <label className="wf-field"><span className="wf-label">{t('净含量', 'Net content')}</span>
          <input className="wf-input" value={info.netContent} onChange={(e) => set({ netContent: e.target.value })}
            placeholder={t('如：10g×9 袋 / 250g', 'e.g. 10 g × 9 sachets / 250 g')} /></label>
      </section>

      {/* E 产品描述：给 AI 看的创意信息 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">E</span><h2>{t('产品描述', 'Product description')}</h2>
          <span className="wf-hint">{t('给 AI 看的设计依据，一句话也行', 'Context for AI — one sentence is enough')}</span></div>
        <textarea className="wf-textarea" rows={4} value={info.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={t('例如：黄精礼盒，主色是砖红色，产品名称是九蒸九晒黄精，10×10×10cm，想走高端东方养生风。',
            'e.g. A gift box for polygonatum, brick red, named “Nine-steamed Polygonatum”, 10×10×10 cm, premium oriental wellness style.')} />
      </section>

      {/* F 生产信息：包装背面法定文字，和设计描述分开 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">F</span><h2>{t('生产信息', 'Production details')}</h2>
          <span className="wf-hint">{t('印在包装背面的法定信息，可留空后补', 'Legal copy for the back panel. Can be added later.')}</span></div>
        <p className="wf-card-note">
          {t('这部分是委托商、生产商、地址、许可证等真实生产信息，AI 不会替你编造；留空就不生成，避免印出错误的法定文字。',
            'These are real company details — commissioner, manufacturer, address, license. AI never makes them up: leave a field empty and it stays off the artwork, so nothing wrong gets printed.')}
        </p>
        <div className="wf-grid2">
          <label className="wf-field"><span className="wf-label">{t('委托商 / 品牌方', 'Commissioner / brand')}</span>
            <input className="wf-input" value={info.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })}
              placeholder={t('如：山野集健康食品有限公司', 'e.g. Shanye Health Foods Co., Ltd.')} /></label>
          <label className="wf-field"><span className="wf-label">{t('生产商', 'Manufacturer')}</span>
            <input className="wf-input" value={info.producer} onChange={(e) => set({ producer: e.target.value })}
              placeholder={t('如：×××食品厂', 'e.g. XXX Food Factory')} /></label>
        </div>
        <label className="wf-field"><span className="wf-label">{t('生产地址', 'Production address')}</span>
          <input className="wf-input" value={info.productionAddress} onChange={(e) => set({ productionAddress: e.target.value })}
            placeholder={t('如：安徽省亳州市××区××路 88 号', 'e.g. 88 XX Road, XX District, Bozhou, Anhui')} /></label>
        <div className="wf-grid2">
          <label className="wf-field"><span className="wf-label">{t('生产许可证编号', 'Production license no.')}</span>
            <input className="wf-input" value={info.productionLicense} onChange={(e) => set({ productionLicense: e.target.value })}
              placeholder="SC10123456789012" /></label>
          <label className="wf-field"><span className="wf-label">{t('执行标准', 'Standard code')}</span>
            <input className="wf-input" value={info.standardCode} onChange={(e) => set({ standardCode: e.target.value })}
              placeholder="GB/T 20977" /></label>
          <label className="wf-field"><span className="wf-label">{t('保质期 / 贮存', 'Shelf life / storage')}</span>
            <input className="wf-input" value={info.shelfLife} onChange={(e) => set({ shelfLife: e.target.value })}
              placeholder={t('如：18 个月，阴凉干燥处', 'e.g. 18 months, keep cool and dry')} /></label>
          <label className="wf-field"><span className="wf-label">{t('服务电话', 'Service phone')}</span>
            <input className="wf-input" value={info.servicePhone} onChange={(e) => set({ servicePhone: e.target.value })}
              placeholder="400-000-0000" /></label>
        </div>
      </section>

      {/* G LOGO */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">G</span><h2>LOGO</h2></div>
        <div className="wf-seg">
          {([
            ['upload', t('已有 LOGO，上传', 'I have a logo — upload')],
            ['generate', t('没有 LOGO，按名称生成', 'No logo — generate from name')],
            ['none', t('暂时不放', 'Skip for now')],
          ] as const).map(([mode, label]) => (
            <button key={mode} className={`wf-seg-btn ${info.logoMode === mode ? 'on' : ''}`}
              onClick={() => set({ logoMode: mode })}>{label}</button>
          ))}
        </div>

        {info.logoMode === 'upload' && <div className="wf-logo-upload">
          <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { void onLogoFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="wf-logo-box" onClick={() => logoRef.current?.click()}>
            {info.logoImage
              ? <img src={info.logoImage} alt="LOGO" />
              : <><Icon name="upload" size={20} /><span>{t('上传 LOGO', 'Upload logo')}</span></>}
          </button>
          {info.logoImage && <button className="wf-clear" onClick={() => set({ logoImage: '' })}>{t('移除', 'Remove')}</button>}
        </div>}

        {info.logoMode === 'generate' && <label className="wf-field">
          <span className="wf-label">{t('LOGO 名称（AI 据此生成字形标识）', 'Logo name (AI builds the wordmark from it)')}</span>
          <input className="wf-input" value={info.logoName} onChange={(e) => set({ logoName: e.target.value })}
            placeholder={t('如：山野集 SHANYE', 'e.g. SHANYE')} />
        </label>}
      </section>

      {/* H 条形码 */}
      <section className="wf-card">
        <div className="wf-card-head"><span className="wf-idx">H</span><h2>{t('条形码', 'Barcode')}</h2>
          <span className="wf-hint">{t('有就填，没有留空；不伪造条码', 'Fill in if you have one — barcodes are never invented')}</span></div>
        <input className="wf-input" value={info.barcode} onChange={(e) => set({ barcode: e.target.value.replace(/[^\d]/g, '').slice(0, 14) })}
          inputMode="numeric" placeholder="6901234567892" />
      </section>

      <div className="wf-actions">
        <button className="wf-btn-ghost" onClick={() => {
          if (window.history.length > 1) window.history.back(); else window.location.hash = '#/workspace';
        }}>{t('取消', 'Cancel')}</button>
        <button className="wf-btn-primary" onClick={submit} disabled={submitting || !canSubmit}
          style={{ opacity: canSubmit ? 1 : 0.5 }}>
          <Icon name="spark" size={16} /> {submitting ? t('正在进入…', 'Starting…') : t('开始 AI 设计', 'Start AI design')}
        </button>
      </div>
      <p className="wf-foot-note">
        {t(`下一步会按 ${imageCost('flash')} 积分的档位生成 3 张完整包装效果图，可单张重新生成。`,
          `Next step renders 3 complete packaging concepts at ${imageCost('flash')} credits each — any of them can be regenerated.`)}
      </p>
    </div>
  );
}
