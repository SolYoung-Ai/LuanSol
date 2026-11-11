/* ============================================================
 * 设计方案（第三步）：三张完整包装效果图
 * ------------------------------------------------------------
 * - 首次进入自动按 Flash（6 积分）档生成 3 张，整批只扣 6 积分；
 *   生成成功后才扣费，失败不扣（诚实计费）。
 * - 可点选一张作为主方案；每张都能「重新生成」，可选
 *   Flash(6) / Pro(10) 档，并可在图片下方补充本张的额外要求。
 * - 底部「继续设计」把选中整包图组装成可编辑工程，进入编辑器
 *   （编辑器内含 2D 平面 / 3D 预览切换）。
 * ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import type { ConceptImage, ImageTier, ProductInfo } from '../types';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useSubscription, recordUsage } from '../cloud/subscription';
import { PRICING } from '../cloud/plans';
import { callImage } from '../engine/seedream';
import { OPEN_IMAGE_MODELS, imageCost, imageModelNote, resolveTier } from '../cloud/models';
import { assembleFromConceptImage, buildBrief, inferStructure, refineTextColors } from './assembler';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';

const BATCH_COST = PRICING.costs.imageFlash; // 整批 3 张按 6 积分档计
const tierCost = (t: ImageTier) => imageCost(t);

/** 三个方向的差异化提示。
 *  name 是界面上显示的方向名（双语）；hint 直接进生图提示词，保持中文——
 *  提示词决定包装上的排版语言，不随界面语言变。 */
const HINTS: { label: string; name: { zh: string; en: string }; hint: string }[] = [
  { label: 'A', name: { zh: '忠实落地', en: 'Faithful' }, hint: '忠实还原参考图与需求，稳重大气，信息层级清晰' },
  { label: 'B', name: { zh: '品牌优化', en: 'Refined' }, hint: '在符合需求的基础上更高级、更克制，留白讲究，质感取胜' },
  { label: 'C', name: { zh: '创意探索', en: 'Exploratory' }, hint: '大胆一点的构图与配色，适合货架差异化，但仍然是可量产的包装' },
];

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1024, h: img.naturalHeight || 1024 });
    img.onerror = () => resolve({ w: 1024, h: 1024 });
    img.src = src;
  });
}

/** 由产品信息拼出生图提示词 */
function buildPrompt(info: ProductInfo, hint: string, extra = ''): string {
  const colors = Array.isArray(info.themeColors) ? info.themeColors : [];
  const parts = [
    info.productName && `产品：${info.productName}`,
    info.brandName && `品牌：${info.brandName}`,
    colors.length > 0 && `包装主色：${colors.join(' ')}`,
    info.illustrationElements && `插画元素：${info.illustrationElements}`,
    info.sellingPointPrimary && `一级卖点：${info.sellingPointPrimary}`,
    info.sellingPointSecondary && `二级卖点：${info.sellingPointSecondary}`,
    info.netContent && `净含量：${info.netContent}`,
    info.description,
    hint,
    extra,
    '完整的包装盒/袋正面商业摄影效果图，纯色或极简背景，高分辨率，中文排版清晰可读，留白讲究，无任何水印',
  ].filter(Boolean);
  return parts.join('，');
}

export default function ConceptStage() {
  const { s, patchWorkflow, updateProject, setToast } = useApp();
  const { lang, t } = useLang();
  const auth = useAuth();
  const sub = useSubscription();
  const project = s.projects.find((p) => p.id === s.activeId);
  const wf = project?.workflow;

  const startedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftTier, setDraftTier] = useState<ImageTier>('flash');
  const [regenBusy, setRegenBusy] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);

  const images = wf?.conceptImages || [];
  const selectedId = wf?.selectedConceptImageId || images[0]?.id || '';
  const info = wf?.productInfo;

  /** 生成整批 3 张 */
  const generateBatch = async () => {
    if (!wf || !project || !info) return;
    const balance = sub.usedLeft ?? 0;
    if (auth.user && balance < BATCH_COST) {
      setToast(t(`积分不足：生成 3 张需 ${BATCH_COST} 积分，当前余额 ${balance}。`,
        `Not enough credits: generating 3 concepts costs ${BATCH_COST}, you have ${balance}.`));
      window.location.hash = '#/subscribe';
      return;
    }
    setLoading(true);
    setError('');
    const uid = auth.user?.id;
    const referenceImage = wf.referenceImages[0]?.src;
    try {
      const results = await Promise.allSettled(
        HINTS.map(async (h) => {
          const src = await callImage(buildPrompt(info, h.hint), { tier: 'flash', referenceImage, uid });
          const size = await naturalSize(src);
          return { src, naturalW: size.w, naturalH: size.h, hint: h.hint, label: h.label };
        }),
      );
      const ok = results
        .map((r, i) => (r.status === 'fulfilled' ? { ...r.value, idx: i } : null))
        .filter((x): x is NonNullable<typeof x> => !!x);

      if (ok.length === 0) {
        const reason = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        throw new Error(reason?.reason?.message || t('生成失败，请检查网络或稍后重试',
          'Generation failed. Check your connection and try again.'));
      }

      const now = Date.now();
      const next: ConceptImage[] = ok.map((r) => ({
        id: `ci_${now}_${r.idx}`,
        label: r.label,
        src: r.src,
        prompt: buildPrompt(info, r.hint),
        model: 'flash',
        tier: 'flash',
        at: now,
        naturalW: r.naturalW,
        naturalH: r.naturalH,
        hint: r.hint,
      }));
      patchWorkflow(project.id, {
        conceptImages: next,
        selectedConceptImageId: next[0]?.id || null,
        autoGenPending: false,
      });
      if (auth.user) {
        await recordUsage(auth.user.id, BATCH_COST, 'image');
        sub.refresh();
      }
      if (ok.length < 3) {
        setToast(t(`已生成 ${ok.length}/3 张，可对失败的方案单独重新生成`,
          `${ok.length} of 3 generated — you can regenerate the failed ones individually.`));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('生成失败', 'Generation failed'));
    } finally {
      setLoading(false);
    }
  };

  // 只有刚点过「开始 AI 设计」才自动生成；从步骤条回看方案页不重复扣积分
  useEffect(() => {
    if (!wf || !project) return;
    if (startedRef.current) return;
    if (!wf.autoGenPending) return;
    if ((wf.conceptImages?.length || 0) > 0) return;
    startedRef.current = true;
    void generateBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!project || !wf || !info) return null;

  /** 打开某张的重新生成面板 */
  const openRegen = (img: ConceptImage) => {
    setEditing(img.id);
    setDraftPrompt(img.prompt || buildPrompt(info, img.hint));
    setDraftTier(img.tier || 'flash');
  };

  /** 单张重新生成 */
  const regenerate = async (img: ConceptImage) => {
    // 会员到期后仍停在上次选的 GPT Image 2：按当前身份归一，避免按会员档价格下单
    const tier = resolveTier(draftTier, sub.isPro);
    if (tier !== draftTier) setDraftTier(tier);
    const cost = tierCost(tier);
    const balance = sub.usedLeft ?? 0;
    if (auth.user && balance < cost) {
      setToast(t(`积分不足：重新生成需 ${cost} 积分，当前余额 ${balance}。`,
        `Not enough credits: regenerating costs ${cost}, you have ${balance}.`));
      window.location.hash = '#/subscribe';
      return;
    }
    setRegenBusy(img.id);
    try {
      const uid = auth.user?.id;
      const src = await callImage(draftPrompt, { tier, referenceImage: wf.referenceImages[0]?.src, uid });
      const { w, h } = await naturalSize(src);
      const next = images.map((it) => it.id === img.id
        ? { ...it, src, prompt: draftPrompt, model: tier, tier, at: Date.now(), naturalW: w, naturalH: h }
        : it);
      patchWorkflow(project.id, { conceptImages: next, selectedConceptImageId: img.id });
      if (auth.user) {
        await recordUsage(auth.user.id, cost, 'image');
        sub.refresh();
      }
      setEditing(null);
    } catch (e) {
      setToast(e instanceof Error ? e.message : t('重新生成失败，请重试', 'Regeneration failed. Please try again.'));
    } finally {
      setRegenBusy(null);
    }
  };

  /** 继续设计：把选中整包图组装成工程并进入编辑器 */
  const continueDesign = async () => {
    const selected = images.find((i) => i.id === selectedId) || images[0];
    if (!selected) { setToast(t('请先生成并选择一张方案', 'Generate a concept and pick one first.')); return; }
    setAssembling(true);
    try {
      const doc = assembleFromConceptImage(wf, selected);
      await refineTextColors(doc);
      updateProject(project.id, {
        design: doc,
        brief: buildBrief(wf),
        structure: inferStructure(wf),
        scheme: 'minimal',
        status: 'designing',
      });
      patchWorkflow(project.id, { stage: 'editor', selectedConceptImageId: selected.id });
    } catch (e) {
      setToast(e instanceof Error ? e.message : t('组装失败，请重试', 'Could not assemble the design. Please try again.'));
    } finally {
      setAssembling(false);
    }
  };

  const allEmpty = images.length === 0;

  return (
    <div className="wf-page wf-page-wide">
      <div className="wf-head">
        <div className="wf-kicker">{t('STEP 03 · 设计方案', 'STEP 03 · Concepts')}</div>
        <h1 className="wf-title">{loading
          ? t('AI 正在为你生成包装…', 'AI is rendering your packaging…')
          : t('挑一个你喜欢的方向', 'Pick the direction you like')}</h1>
        <p className="wf-sub">
          {t('基于你填的参考图与产品信息生成三张完整效果图。选中一张后可「继续设计」，或对某一张单独重新生成。',
            'Three complete mockups built from your references and product details. Pick one and continue, or regenerate any single one.')}
        </p>
      </div>

      {allEmpty && !loading && !error && (
        <div className="wf-card wf-empty-card">
          <div className="wf-error-ico"><Icon name="spark" size={24} /></div>
          <h3>{t('还没有方案图', 'No concepts yet')}</h3>
          <p>{t('回到「确认需求」补充信息后点「开始 AI 设计」，或直接在这里生成一批三张。',
            'Go back to Requirements and hit “Start AI design”, or generate a batch of three right here.')}</p>
          <button className="wf-btn-primary" onClick={() => { startedRef.current = true; void generateBatch(); }}>
            <Icon name="spark" size={16} /> {t(`生成三张方案（${BATCH_COST} 积分）`, `Generate 3 concepts (${BATCH_COST} credits)`)}
          </button>
        </div>
      )}

      {allEmpty && !loading && error && (
        <div className="wf-card wf-error-card">
          <div className="wf-error-ico"><Icon name="alert" size={24} /></div>
          <h3>{t('这次没有生成成功', 'Generation did not succeed')}</h3>
          <p>{error}</p>
          <button className="wf-btn-primary" onClick={() => { startedRef.current = true; void generateBatch(); }}>
            <Icon name="spark" size={16} /> {t(`重试生成（${BATCH_COST} 积分）`, `Try again (${BATCH_COST} credits)`)}
          </button>
        </div>
      )}

      {loading && allEmpty && (
        <div className="wf-loading">
          {HINTS.map((h) => (
            <div key={h.label} className="wf-concept-card skeleton">
              <div className="wf-skeleton-img" />
              <div className="wf-skeleton-line" />
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="wf-loading">
          {images.map((img) => {
            const selected = img.id === selectedId;
            const isEditing = editing === img.id;
            return (
              <div key={img.id} className={`wf-concept-card ${selected ? 'selected' : ''}`}>
                <button className="wf-concept-img" onClick={() => patchWorkflow(project.id, { selectedConceptImageId: img.id })}>
                  <img src={img.src} alt={t(`方案 ${img.label}`, `Concept ${img.label}`)} />
                  <span className="wf-concept-badge">{selected
                    ? t('已选', 'Selected')
                    : t(`方案 ${img.label}`, `Concept ${img.label}`)}</span>
                </button>
                <div className="wf-concept-meta">
                  <span className="wf-concept-name">{(() => {
                    const n = HINTS.find((h) => h.label === img.label)?.name;
                    if (!n) return t(`方案 ${img.label}`, `Concept ${img.label}`);
                    return lang === 'en' ? n.en : n.zh;
                  })()}</span>
                  <span className="wf-concept-tier">{img.tier === 'pro' ? 'Pro' : 'Flash'}</span>
                </div>

                {!isEditing ? (
                  <div className="wf-concept-actions">
                    <button className="wf-mini-btn" onClick={() => openRegen(img)}>
                      <Icon name="redo" size={14} /> {t('重新生成', 'Regenerate')}
                    </button>
                  </div>
                ) : (
                  <div className="wf-regen-panel">
                    <div className="wf-seg wf-seg-sm">
                      {OPEN_IMAGE_MODELS.map((m) => {
                        // GPT Image 2 两档为会员专属：免费版灰显，点了走订阅引导
                        const locked = !!m.pro && !sub.isPro;
                        return (
                          <button
                            key={m.id}
                            className={`wf-seg-btn ${draftTier === m.id && !locked ? 'on' : ''}`}
                            style={locked ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                            title={locked ? t('会员专属模型', 'Members-only model') : imageModelNote(m, lang)}
                            onClick={() => {
                              if (locked) {
                                sub.setPaywall(true, t(
                                  'GPT Image 2 是会员专属生图模型：出图质量最高，支持文字出图与参考图改图。免费版可用 Seedream 5.0 Flash / Pro。',
                                  'GPT Image 2 is a members-only model: the best output quality, with text rendering and reference-based editing. The free plan includes Seedream 5.0 Flash / Pro.'));
                                return;
                              }
                              setDraftTier(m.id);
                            }}
                          >
                            {m.short} {t(`${m.cost} 积分`, `${m.cost} cr.`)}{locked ? t(' · 会员', ' · Pro') : ''}
                          </button>
                        );
                      })}
                    </div>
                    <textarea className="wf-textarea" rows={3} value={draftPrompt}
                      onChange={(e) => setDraftPrompt(e.target.value)}
                      placeholder={t('对这一张的额外要求…', 'Extra instructions for this one…')} />
                    <div className="wf-regen-actions">
                      <button className="wf-btn-ghost sm" onClick={() => setEditing(null)}>{t('取消', 'Cancel')}</button>
                      <button className="wf-btn-primary sm" disabled={regenBusy === img.id}
                        onClick={() => void regenerate(img)}>
                        <Icon name="spark" size={14} /> {regenBusy === img.id
                          ? t('生成中…', 'Generating…')
                          : t(`重新生成（${tierCost(draftTier)} 积分）`, `Regenerate (${tierCost(draftTier)} credits)`)}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {images.length > 0 && (
        <div className="wf-actions">
          <button className="wf-btn-ghost" onClick={() => patchWorkflow(project.id, { stage: 'requirements' })}>
            {t('返回修改需求', 'Back to requirements')}
          </button>
          <button className="wf-btn-primary" onClick={() => void continueDesign()} disabled={assembling || !selectedId}>
            <Icon name="spark" size={16} /> {assembling ? t('正在进入编辑器…', 'Opening the editor…') : t('继续设计', 'Continue designing')}
          </button>
        </div>
      )}

      <p className="wf-foot-note">
        {t(`生成 3 张共 ${BATCH_COST} 积分（Flash 档）；单张重新生成按所选档位计费。积分余额 ${sub.usedLeft ?? '—'}。`,
          `3 concepts cost ${BATCH_COST} credits total (Flash). Regenerating one is charged at the tier you pick. Balance: ${sub.usedLeft ?? '—'}.`)}
      </p>
    </div>
  );
}
