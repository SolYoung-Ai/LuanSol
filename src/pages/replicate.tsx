/* ============================================================
 * 复制（Replicate）· 双图复刻
 * ------------------------------------------------------------
 * 用户分别上传两张图：
 *   A 风格参考图 —— 提供配色、字体气质、材质、构图骨架；
 *   B 自己的产品图 —— 提供必须保留的容器形状、标签排版、品牌文字。
 * 底层两张图都要真正参与生成，不是摆两个上传框只发一张：
 *   1. callImage 同时发 `images: [A, B]`（真·多图）与 `image: 拼接参考板`
 *      （旧云函数 / 上游不支持多图时的降级输入）；
 *   2. 云函数把多图透传给方舟 Seedream / B.AI edits，4xx 时自动降级到拼接板重试；
 *   3. 提示词明确 A 只给风格、B 给产品主体，并禁止画面出现分栏拼接；
 *   4. 「用它开始」把两张图都写进项目草稿的 referenceImages，不是只留一张。
 *
 * 其他口径不变：三张按一张档位的价扣、先查余额再发请求、可单张重新生成。
 * ============================================================ */
import React, { useRef, useState } from 'react';
import { go } from '../ui';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useSubscription, recordUsage } from '../cloud/subscription';
import { callImage } from '../engine/seedream';
import { OPEN_IMAGE_MODELS, imageCost, imageLabel, resolveTier } from '../cloud/models';
import { compressImageForUpload } from '../workflow/imageUtils';
import { LoginDialog } from '../cloud/LoginDialog';
import { Icon } from '../components/icons';
import { useLang } from '../i18n';
import { emptyProductInfo } from '../types';
import type { ConceptImage, ImageTier, ReferenceImage, ReferenceRole } from '../types';
import '../replicate.css';

type L = { zh: string; en: string };
type Uploaded = { src: string; w: number; h: number; name: string };
type DropKind = 'ref' | 'product';

/** 三种风格：都基于同一组参考图，只改「改动幅度」 */
const STYLES: { id: string; label: L; hint: string; dark: boolean }[] = [
  {
    id: 'faithful',
    label: { zh: '忠实复刻', en: 'Faithful' },
    hint: '严格沿用风格参考图的配色、字体气质与构图骨架，不做风格改写',
    dark: false,
  },
  {
    id: 'minimal',
    label: { zh: '现代极简', en: 'Minimal' },
    hint: '保留风格参考图的色彩关系，改为大面积留白、无衬线字体、极简几何，去掉装饰性纹理，信息层级更克制',
    dark: false,
  },
  {
    id: 'bold',
    label: { zh: '大胆实验', en: 'Bold' },
    hint: '放大风格参考图里最强烈的视觉元素，改用高对比撞色、超大字号与强图形感，让货架上第一眼被看到',
    dark: true,
  },
];

const TAIL = '包装正面商业效果图，单个产品居中，纯色或极简背景，高分辨率，中文排版清晰可读，无任何水印与拼接痕迹';
/** 双图分工规则。生图提示词保持中文（内容不译），英文界面也用这一份。
 *  同时兼容两种下发形态：新版云函数用 images[0]=A / images[1]=B 真·多图，
 *  降级时用 A/B 拼接参考板，所以两条描述都写清楚。 */
const DUAL_RULE = '输入图 A（第一张，拼接参考板时为左半）只提供配色、字体气质、材质与构图骨架；输入图 B（第二张，拼接参考板时为右半）是必须套用的真实产品，要保留 B 的容器形状、标签排版、品牌文字与净含量信息，只把视觉风格换成 A 的气质。最终只输出一张完整包装商业效果图，画面里不要出现 A/B 分栏、拼接线、说明文字、水印或多个产品';

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1024, h: 1024 });
    img.src = src;
  });
}

/** 上传的图在本机压到 1280 长边：两张原图 + 拼接板都要塞进云函数 6MB 的请求体 */
async function readImage(file: File): Promise<Uploaded> {
  const c = await compressImageForUpload(file, { maxEdge: 1280, maxBytes: 700 * 1024 });
  return { src: c.dataUrl, w: c.width, h: c.height, name: file.name };
}

/**
 * 生成「A 风格 / B 产品」拼接参考板。
 * 这不是给最终画面用的拼贴图，只是发给模型的输入参考：新版云函数走 `images` 真·多图，
 * 万一上游不认多图 / 云函数还是旧版，就用这张板兜底，两张信息都不会丢。
 */
async function buildBoard(styleSrc: string, productSrc: string, lang: string): Promise<string> {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = src;
  });
  const [a, b] = await Promise.all([load(styleSrc), load(productSrc)]);
  const W = 1024;
  const H = 576;
  const PAD = 18;
  const GAP = 18;
  const HEAD = 36;
  const cellW = (W - PAD * 2 - GAP) / 2;
  const cellH = H - PAD * 2 - HEAD;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return styleSrc;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#e6e6e2';
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD, PAD + HEAD, cellW, cellH);
  ctx.strokeRect(PAD + cellW + GAP, PAD + HEAD, cellW, cellH);
  ctx.fillStyle = '#1b1b1a';
  ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(lang === 'en' ? 'A  STYLE REFERENCE' : 'A  风格参考', PAD, PAD + 4);
  ctx.fillText(lang === 'en' ? 'B  YOUR PRODUCT' : 'B  我的产品', PAD + cellW + GAP, PAD + 4);
  const fit = (img: HTMLImageElement, x: number) => {
    const s = Math.min(cellW / Math.max(1, img.naturalWidth), cellH / Math.max(1, img.naturalHeight));
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, x + (cellW - w) / 2, PAD + HEAD + (cellH - h) / 2, w, h);
  };
  fit(a, PAD);
  fit(b, PAD + cellW + GAP);
  return c.toDataURL('image/jpeg', 0.86);
}

/** 复制页必然带两张参考图，「文字输入」档不能出现：
 *  云函数对带图的 gpt2-text 直接返回 400（否则会按文字档扣费却走改图档）。
 *  判断条件用 provider + needsRef，不硬编码 id，日后加档位不会漏。 */
const REPLICATE_MODELS = OPEN_IMAGE_MODELS.filter((m) => !(m.provider === 'bai' && !m.needsRef));

/** 生图档位选择：价格与扣分同源 */
function ImageModelPicker({ value, onChange, disabled }: {
  value: ImageTier;
  onChange: (v: ImageTier) => void;
  disabled?: boolean;
}) {
  const { t } = useLang();
  return <select className="rep-select" value={value} disabled={disabled}
    onChange={(e) => onChange(e.target.value as ImageTier)}>
    {REPLICATE_MODELS.map((m) => {
      return <option key={m.id} value={m.id}>
        {imageLabel(m.id as ImageTier)} · {imageCost(m.id as ImageTier)} {t('积分', 'credits')}
      </option>;
    })}
  </select>;
}

/** 系统提示词统一由这里拼回：用户改完提示词重新生成时，双图分工规则不能丢。
 *  否则「改提示词」会退化成普通的单图生图，B 的容器形状和文字就保不住了。 */
function withSystemRules(userText: string): string {
  return [userText.trim(), DUAL_RULE, TAIL].filter(Boolean).join('，');
}

function buildPrompt(style: (typeof STYLES)[number], extra: string): string {
  return withSystemRules([style.hint, extra.trim()].filter(Boolean).join('，'));
}

/** 卡片与编辑框只展示「风格描述 + 用户补充」，
 *  双图规则和画质后缀属于系统提示词，编辑时自动拼回，不让用户在文本框里看到一长串。 */
function userPartOf(p: string): string {
  return p.replace(TAIL, '').replace(DUAL_RULE, '')
    .replace(/，{2,}/g, '，').replace(/^，+|，+$/g, '').trim();
}

let seq = 0;

export default function Replicate() {
  const { t, lang } = useLang();
  const auth = useAuth();
  const sub = useSubscription();
  const { setToast, createWorkflowProject, patchWorkflow } = useApp();

  const [ref, setRef] = useState<Uploaded | null>(null);
  const [product, setProduct] = useState<Uploaded | null>(null);
  const [dragKey, setDragKey] = useState<DropKind | null>(null);
  const [prompt, setPrompt] = useState('');
  const [tier, setTier] = useState<ImageTier>('flash');
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const [items, setItems] = useState<{ id: string; styleId: string; src: string; prompt: string; tier: ImageTier; w: number; h: number }[]>([]);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftTier, setDraftTier] = useState<ImageTier>('flash');

  const refInput = useRef<HTMLInputElement>(null);
  const productInput = useRef<HTMLInputElement>(null);
  const safeTier = resolveTier(tier, sub.isPro);
  /* 与「设计方案」整批同口径：三张按一张档位的价扣，不分三倍 */
  const batchCost = imageCost(safeTier);
  const label = (s: L) => (lang === 'en' ? s.en : s.zh);
  const ready = !!ref && !!product;

  const pick = async (kind: DropKind, file?: File | null) => {
    if (!file) return;
    try {
      const img = await readImage(file);
      if (kind === 'ref') setRef(img); else setProduct(img);
      setItems([]);
    } catch (e) {
      const tooLarge = e instanceof Error && e.message === 'TOO_LARGE';
      setToast(tooLarge
        ? t('图片超过 30MB，请先压缩或换一张', 'This image is over 30 MB — compress it or pick another one')
        : t('这张图读不出来，换一张试试', 'That image could not be read'));
    }
  };

  const ensureQuota = (need: number) => {
    if (!auth.user) { setLoginOpen(true); return false; }
    const left = sub.usedLeft ?? 0;
    if (left < need) {
      setToast(t(`积分不足：本次需要 ${need} 积分，当前余额 ${left}。`, `Not enough credits: ${need} needed, ${left} left.`));
      return false;
    }
    return true;
  };

  const charge = async (n: number) => {
    if (auth.user) {
      await recordUsage(auth.user.id, n, 'image');
      sub.refresh();
    }
  };

  /** 两张图一起送进模型：真·多图 + 拼接板兜底 */
  const imageInputs = async () => {
    if (!ref || !product) throw new Error(t('请先上传参考图和产品图', 'Upload both images first'));
    const board = await buildBoard(ref.src, product.src, lang);
    return { referenceImage: board, referenceImages: [ref.src, product.src] };
  };

  const generate = async () => {
    if (!ready) {
      setToast(t('先上传风格参考图和自己的产品图', 'Upload a style reference and your product photo first'));
      return;
    }
    if (!ensureQuota(batchCost)) return;
    setBusy(true);
    setItems([]);
    try {
      const uid = auth.user?.id;
      const inputs = await imageInputs();
      const settled = await Promise.allSettled(STYLES.map(async (st) => {
        const p = buildPrompt(st, prompt);
        const src = await callImage(p, { tier: safeTier, ...inputs, uid });
        const size = await naturalSize(src);
        return { id: `rep_${Date.now()}_${seq++}`, styleId: st.id, src, prompt: p, tier: safeTier, w: size.w, h: size.h };
      }));
      const ok = settled.filter((r): r is PromiseFulfilledResult<NonNullable<(typeof items)[number]>> => r.status === 'fulfilled').map((r) => r.value);
      if (!ok.length) {
        const fail = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        throw new Error(fail?.reason?.message || t('生成失败，请稍后重试', 'Generation failed, try again'));
      }
      setItems(ok);
      await charge(batchCost);
    } catch (e) {
      setToast(e instanceof Error ? e.message : t('生成失败', 'Generation failed'));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (id: string, nextPrompt: string, nextTier: ImageTier) => {
    const item = items.find((x) => x.id === id);
    if (!item || !ref || !product) return;
    const style = STYLES.find((s) => s.id === item.styleId) || STYLES[0];
    const cost = imageCost(resolveTier(nextTier, sub.isPro));
    if (!ensureQuota(cost)) return;
    setRegenId(id);
    try {
      const uid = auth.user?.id;
      const inputs = await imageInputs();
      // nextPrompt 是「用户可见部分」（风格描述 + 补充要求），系统规则在这里补回，
      // 编辑过提示词也依然按 A 给风格 / B 给产品的双图口径出图。
      const p = withSystemRules(nextPrompt.trim() || userPartOf(item.prompt) || style.hint);
      const src = await callImage(p, { tier: resolveTier(nextTier, sub.isPro), ...inputs, uid });
      const size = await naturalSize(src);
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, src, prompt: p, tier: resolveTier(nextTier, sub.isPro), w: size.w, h: size.h } : x)));
      setEditingId(null);
      await charge(cost);
    } catch (e) {
      setToast(e instanceof Error ? e.message : t('重新生成失败', 'Regeneration failed'));
    } finally {
      setRegenId(null);
    }
  };

  /** 把这张图带走：建项目 → 两张参考图与选中方案都写进 concepts 阶段 → 进流程 */
  const useResult = (item: (typeof items)[number]) => {
    if (!ref || !product) return;
    if (!auth.user) { setLoginOpen(true); return; }
    const toRef = (img: Uploaded, role: ReferenceRole, note: string): ReferenceImage => ({
      id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      src: img.src,
      name: img.name,
      naturalW: img.w,
      naturalH: img.h,
      ratio: img.w / Math.max(1, img.h),
      role,
      note,
      dominantColors: [],
      createdAt: Date.now(),
    });
    const concept: ConceptImage = {
      id: item.id,
      label: 'A',
      src: item.src,
      prompt: item.prompt,
      model: item.tier,
      tier: item.tier,
      at: Date.now(),
      naturalW: item.w,
      naturalH: item.h,
      hint: STYLES.find((s) => s.id === item.styleId)?.hint || '',
    };
    const project = createWorkflowProject({
      mode: 'referenceStyle',
      productInfo: emptyProductInfo(),
      referenceImages: [
        toRef(ref, 'packaging', t('风格参考图', 'Style reference')),
        toRef(product, 'product', t('我的产品图', 'Your product')),
      ],
      name: t('参考复刻', 'Reference replication'),
    });
    patchWorkflow(project.id, {
      stage: 'concepts',
      conceptImages: [concept],
      selectedConceptImageId: concept.id,
      autoGenPending: false,
    });
    go('/new');
  };

  const renderDrop = (kind: DropKind) => {
    const isRef = kind === 'ref';
    const img = isRef ? ref : product;
    const input = isRef ? refInput : productInput;
    const title = isRef ? t('A · 风格参考图', 'A · Style reference') : t('B · 我的产品图', 'B · Your product');
    const short = isRef ? t('拖入喜欢的包装', 'Drop a package you like') : t('拖入自己的产品', 'Drop your product');
    return <div className="rep-drop-wrap" key={kind}>
      <span className="rep-drop-label">{title}</span>
      <div
        className={`rep-drop ${dragKey === kind ? 'over' : ''} ${img ? 'has' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragKey(kind); }}
        onDragLeave={() => setDragKey(null)}
        onDrop={(e) => { e.preventDefault(); setDragKey(null); void pick(kind, e.dataTransfer.files?.[0]); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
      >
        {img
          ? <img src={img.src} alt={img.name} />
          : <>
            <span className="rep-drop-ic"><Icon name="image" size={18} /></span>
            <b>{short}</b>
            <span className="rep-drop-hint">{t('或点击选择 · 本机压缩，不传第三方', 'Or click · resized locally')}</span>
          </>}
        <input ref={input} type="file" accept="image/*" hidden
          onChange={(e) => { void pick(kind, e.target.files?.[0]); e.currentTarget.value = ''; }} />
      </div>
    </div>;
  };

  return <div className="page rep-page">
    <div className="rep-head">
      <div className="rep-kicker">REPLICATE</div>
      <h1>{t('把喜欢的风格套到你的产品上', 'Restyle your product from a reference')}</h1>
      <p>{t('分别上传一张喜欢的包装（风格参考）和你自己的产品图。AI 会保留你产品的形状与文字，把参考图的配色、字体气质和构图套过来，一次给出三种改动幅度的方案。',
        'Upload a package you like as the style reference, plus a photo of your own product. We keep your product shape and copy, then apply the reference\'s colours, type and composition in three takes.')}</p>
    </div>

    <div className="rep-grid">
      {/* 左：设置 */}
      <aside className="rep-setup">
        <div className="rep-drops">
          {renderDrop('ref')}
          {renderDrop('product')}
        </div>

        <label className="rep-label" htmlFor="rep-prompt">{t('补充要求（可选）', 'Extra instructions (optional)')}</label>
        <textarea id="rep-prompt" className="rep-textarea" rows={3} value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('例如：换成中文文案、主色改成深绿、加上「净含量 250g」',
            'e.g. switch copy to English, change the base colour to deep green, add “Net 250g”')} />

        <label className="rep-label">{t('生图模型', 'Image model')}</label>
        <ImageModelPicker value={tier} onChange={(v) => setTier(v)} disabled={busy} />

        <div className="rep-cost">
          <span>{t(`本次 ${STYLES.length} 张`, `${STYLES.length} images`)}</span>
          <b>{batchCost} {t('积分', 'credits')}</b>
        </div>

        <button className="rep-run" onClick={() => void generate()} disabled={busy || !ready}>
          {busy ? t('正在生成…', 'Generating…') : t('开始复制', 'Replicate')}
        </button>
        {!ready && <p className="rep-note">{t('两张图都上传后才能开始复制。', 'Both images are required to start.')}</p>}
        {ready && !auth.user && <p className="rep-note">{t('未登录会先弹登录，登录后积分才开始计。', 'You will be asked to sign in first.')}</p>}
      </aside>

      {/* 右：结果 */}
      <section className="rep-results">
        {items.length === 0 && <div className="rep-placeholder">
          {STYLES.map((st) => <div className="rep-ph" key={st.id}>
            <span>{label(st.label)}</span>
            <em>{busy ? t('生成中…', 'Generating…') : t('等待生成', 'Waiting')}</em>
          </div>)}
        </div>}

        {items.length > 0 && <div className="rep-cards">
          {items.map((it) => {
            const st = STYLES.find((s) => s.id === it.styleId) || STYLES[0];
            const isEditing = editingId === it.id;
            return <article className="rep-card" key={it.id}>
              <div className="rep-card-img">
                <img src={it.src} alt={label(st.label)} />
                <span className="rep-tag">{label(st.label)}</span>
                {regenId === it.id && <div className="rep-loading"><i />{t('重新生成中…', 'Regenerating…')}</div>}
              </div>
              <div className="rep-card-body">
                <div className="rep-card-meta">
                  <span>{imageLabel(it.tier)}</span>
                  <span>{it.w}×{it.h}</span>
                </div>
                {!isEditing && <p className="rep-card-prompt">{userPartOf(it.prompt)}</p>}

                {isEditing && <div className="rep-edit">
                  <textarea className="rep-textarea" rows={3} value={draftPrompt} onChange={(e) => setDraftPrompt(e.target.value)} />
                  <ImageModelPicker value={draftTier} onChange={(v) => setDraftTier(v)} />
                  <div className="rep-edit-actions">
                    <button onClick={() => setEditingId(null)}>{t('取消', 'Cancel')}</button>
                    <button className="on" onClick={() => void regenerate(it.id, draftPrompt, draftTier)} disabled={regenId === it.id}>
                      {t('用这个重新生成', 'Regenerate')}
                    </button>
                  </div>
                </div>}

                {!isEditing && <div className="rep-card-actions">
                  <button onClick={() => void regenerate(it.id, userPartOf(it.prompt), it.tier)} disabled={regenId === it.id}>
                    <Icon name="refresh" size={13} />{t('重新生成', 'Regenerate')}
                  </button>
                  <button onClick={() => { setEditingId(it.id); setDraftPrompt(userPartOf(it.prompt)); setDraftTier(it.tier); }}>
                    <Icon name="edit" size={13} />{t('改提示词', 'Edit prompt')}
                  </button>
                  <button className="primary" onClick={() => useResult(it)}>
                    {t('用它开始', 'Use this')} <Icon name="chevronRight" size={13} />
                  </button>
                </div>}
              </div>
            </article>;
          })}
        </div>}

        {items.length > 0 && <div className="rep-foot">
          <button onClick={() => void generate()} disabled={busy}>
            <Icon name="refresh" size={13} />{t(`三张全部重来（${batchCost} 积分）`, `Regenerate all three (${batchCost} credits)`)}
          </button>
        </div>}
      </section>
    </div>

    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={(m) => setToast(m)} />
  </div>;
}
