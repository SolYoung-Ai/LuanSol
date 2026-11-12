/* ============================================================
 * 复制（Replicate）
 * ------------------------------------------------------------
 * 上传一张参考图 → 用同一张参考图生成三种不同风格的包装方案。
 * 每张都能单独改提示词、换模型、重新生成，满意的那张可以直接带走继续设计。
 *
 * 三条口径：
 * 1. 参考图真实作为 `referenceImage` 传给生图模型，不是只做展示；
 * 2. 扣分按实际张数（3 张 = 3 × 该档单张价），先查余额再发请求；
 * 3. 「用它开始」会真的建一个项目、把这张图和参考图写进 concepts 阶段，
 *    不是跳个空页。
 * ============================================================ */
import React, { useRef, useState } from 'react';
import { go } from '../ui';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useSubscription, recordUsage } from '../cloud/subscription';
import { callImage } from '../engine/seedream';
import { OPEN_IMAGE_MODELS, imageCost, imageLabel, resolveTier } from '../cloud/models';
import { LoginDialog } from '../cloud/LoginDialog';
import { Icon } from '../components/icons';
import { useLang } from '../i18n';
import { emptyProductInfo } from '../types';
import type { ConceptImage, ImageTier, ReferenceImage } from '../types';
import '../replicate.css';

type L = { zh: string; en: string };

/** 三种风格：都基于同一张参考图，只改「改动幅度」 */
const STYLES: { id: string; label: L; hint: string; dark: boolean }[] = [
  {
    id: 'faithful',
    label: { zh: '忠实复刻', en: 'Faithful' },
    hint: '严格沿用参考图的配色、字体气质与构图骨架，只把产品信息替换成新的内容，不做风格改写',
    dark: false,
  },
  {
    id: 'minimal',
    label: { zh: '现代极简', en: 'Minimal' },
    hint: '保留参考图的色彩关系，改为大面积留白、无衬线字体、极简几何，去掉装饰性纹理，信息层级更克制',
    dark: false,
  },
  {
    id: 'bold',
    label: { zh: '大胆实验', en: 'Bold' },
    hint: '放大参考图里最强烈的视觉元素，改用高对比撞色、超大字号与强图形感，让货架上第一眼被看到',
    dark: true,
  },
];

const TAIL = '包装正面商业效果图，单个产品居中，纯色或极简背景，高分辨率，中文排版清晰可读，无任何水印与拼接痕迹';

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1024, h: 1024 });
    img.src = src;
  });
}

/** 上传的图压到 1280 长边再发给模型：原图动辄 5MB，直传会拖慢请求 */
function readImage(file: File): Promise<{ src: string; w: number; h: number; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const raw = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        if (scale === 1) { resolve({ src: raw, w, h, name: file.name }); return; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) { resolve({ src: raw, w, h, name: file.name }); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ src: c.toDataURL('image/jpeg', 0.86), w, h, name: file.name });
      };
      img.onerror = () => reject(new Error('decode'));
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}

/** 生图档位选择：直接读 OPEN_IMAGE_MODELS，价格与扣分同源 */
function ImageModelPicker({ value, onChange, disabled }: {
  value: ImageTier;
  onChange: (v: ImageTier) => void;
  disabled?: boolean;
}) {
  const { t } = useLang();
  const { isPro } = useSubscription();
  return <select className="rep-select" value={value} disabled={disabled}
    onChange={(e) => onChange(e.target.value as ImageTier)}>
    {OPEN_IMAGE_MODELS.map((m) => {
      const locked = !!m.pro && !isPro;
      return <option key={m.id} value={m.id} disabled={locked}>
        {imageLabel(m.id as ImageTier)} · {imageCost(m.id as ImageTier)} {t('积分', 'credits')}{locked ? t('（会员）', ' (member)') : ''}
      </option>;
    })}
  </select>;
}

function buildPrompt(style: (typeof STYLES)[number], extra: string): string {
  return [style.hint, extra.trim(), TAIL].filter(Boolean).join('，');
}

let seq = 0;

export default function Replicate() {
  const { t, lang } = useLang();
  const auth = useAuth();
  const sub = useSubscription();
  const { setToast, createWorkflowProject, patchWorkflow } = useApp();

  const [ref, setRef] = useState<{ src: string; w: number; h: number; name: string } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [tier, setTier] = useState<ImageTier>('flash');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const [items, setItems] = useState<{ id: string; styleId: string; src: string; prompt: string; tier: ImageTier; w: number; h: number }[]>([]);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftTier, setDraftTier] = useState<ImageTier>('flash');

  const fileRef = useRef<HTMLInputElement>(null);
  const safeTier = resolveTier(tier, sub.isPro);
  /* 与「设计方案」整批同口径：三张按一张档位的价扣，不分三倍 */
  const batchCost = imageCost(safeTier);
  const label = (s: L) => (lang === 'en' ? s.en : s.zh);

  const pick = async (file?: File | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setToast(t('请选择图片文件（PNG / JPG / WebP）', 'Choose an image (PNG / JPG / WebP)'));
      return;
    }
    try {
      setRef(await readImage(file));
      setItems([]);
    } catch {
      setToast(t('这张图读不出来，换一张试试', 'That image could not be read'));
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

  const generate = async () => {
    if (!ref) {
      setToast(t('先上传一张参考图', 'Upload a reference first'));
      return;
    }
    if (!ensureQuota(batchCost)) return;
    setBusy(true);
    setItems([]);
    try {
      const uid = auth.user?.id;
      const settled = await Promise.allSettled(STYLES.map(async (st) => {
        const p = buildPrompt(st, prompt);
        const src = await callImage(p, { tier: safeTier, referenceImage: ref.src, uid });
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
    if (!item || !ref) return;
    const style = STYLES.find((s) => s.id === item.styleId) || STYLES[0];
    const cost = imageCost(resolveTier(nextTier, sub.isPro));
    if (!ensureQuota(cost)) return;
    setRegenId(id);
    try {
      const uid = auth.user?.id;
      const p = nextPrompt.trim() || buildPrompt(style, prompt);
      const src = await callImage(p, { tier: resolveTier(nextTier, sub.isPro), referenceImage: ref.src, uid });
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

  /** 把这张图带走：建项目 → 写进 concepts 阶段 → 进流程 */
  const useResult = (item: (typeof items)[number]) => {
    if (!ref) return;
    if (!auth.user) { setLoginOpen(true); return; }
    const refImage: ReferenceImage = {
      id: `ref_${Date.now().toString(36)}`,
      src: ref.src,
      name: ref.name,
      naturalW: ref.w,
      naturalH: ref.h,
      ratio: ref.w / Math.max(1, ref.h),
      role: 'packaging',
      note: '',
      dominantColors: [],
      createdAt: Date.now(),
    };
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
      referenceImages: [refImage],
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

  return <div className="page rep-page">
    <div className="rep-head">
      <div className="rep-kicker">REPLICATE</div>
      <h1>{t('复制一张参考图', 'Replicate a reference')}</h1>
      <p>{t('上传一张你觉得好看的包装，我们用同一张参考生成三种改动幅度的方案——忠实复刻、现代极简、大胆实验。挑一张带走，剩下的留在这里对比。',
        'Upload a package you like. We generate three takes from the same reference — faithful, minimal, bold. Take one with you, keep the rest for comparison.')}</p>
    </div>

    <div className="rep-grid">
      {/* 左：设置 */}
      <aside className="rep-setup">
        <div
          className={`rep-drop ${dragOver ? 'over' : ''} ${ref ? 'has' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void pick(e.dataTransfer.files?.[0]); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
        >
          {ref
            ? <img src={ref.src} alt={ref.name} />
            : <>
              <span className="rep-drop-ic"><Icon name="image" size={20} /></span>
              <b>{t('拖一张参考图进来', 'Drop a reference here')}</b>
              <span className="rep-drop-hint">{t('或点击选择。PNG / JPG / WebP，只在本机压缩，不上传第三方。',
                'Or click to choose. PNG / JPG / WebP — resized locally, not sent to a third party.')}</span>
            </>}
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => { void pick(e.target.files?.[0]); e.currentTarget.value = ''; }} />
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

        <button className="rep-run" onClick={() => void generate()} disabled={busy || !ref}>
          {busy ? t('正在生成…', 'Generating…') : t('开始复制', 'Replicate')}
        </button>
        {!auth.user && <p className="rep-note">{t('未登录会先弹登录，登录后积分才开始计。', 'You will be asked to sign in first.')}</p>}
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
                {!isEditing && <p className="rep-card-prompt">{it.prompt.replace(TAIL, '').trim()}</p>}

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
                  <button onClick={() => void regenerate(it.id, it.prompt, it.tier)} disabled={regenId === it.id}>
                    <Icon name="refresh" size={13} />{t('重新生成', 'Regenerate')}
                  </button>
                  <button onClick={() => { setEditingId(it.id); setDraftPrompt(it.prompt.replace(TAIL, '').trim()); setDraftTier(it.tier); }}>
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
