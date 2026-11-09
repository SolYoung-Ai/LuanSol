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
import { callSeedream } from '../engine/seedream';
import { assembleFromConceptImage, buildBrief, inferStructure, refineTextColors } from './assembler';
import { Icon } from '../components/icons';

const BATCH_COST = PRICING.costs.imageFlash; // 整批 3 张按 6 积分档计
const tierCost = (t: ImageTier) => (t === 'flash' ? PRICING.costs.imageFlash : PRICING.costs.imagePro);

/** 三个方向的差异化提示 */
const HINTS: { label: string; name: string; hint: string }[] = [
  { label: 'A', name: '忠实落地', hint: '忠实还原参考图与需求，稳重大气，信息层级清晰' },
  { label: 'B', name: '品牌优化', hint: '在符合需求的基础上更高级、更克制，留白讲究，质感取胜' },
  { label: 'C', name: '创意探索', hint: '大胆一点的构图与配色，适合货架差异化，但仍然是可量产的包装' },
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
      setToast(`积分不足：生成 3 张需 ${BATCH_COST} 积分，当前余额 ${balance}。`);
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
          const src = await callSeedream(buildPrompt(info, h.hint), { tier: 'flash', referenceImage, uid });
          const size = await naturalSize(src);
          return { src, naturalW: size.w, naturalH: size.h, hint: h.hint, label: h.label };
        }),
      );
      const ok = results
        .map((r, i) => (r.status === 'fulfilled' ? { ...r.value, idx: i } : null))
        .filter((x): x is NonNullable<typeof x> => !!x);

      if (ok.length === 0) {
        const reason = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        throw new Error(reason?.reason?.message || '生成失败，请检查网络或稍后重试');
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
      if (ok.length < 3) setToast(`已生成 ${ok.length}/3 张，可对失败的方案单独重新生成`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
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
    const cost = tierCost(draftTier);
    const balance = sub.usedLeft ?? 0;
    if (auth.user && balance < cost) {
      setToast(`积分不足：重新生成需 ${cost} 积分，当前余额 ${balance}。`);
      window.location.hash = '#/subscribe';
      return;
    }
    setRegenBusy(img.id);
    try {
      const uid = auth.user?.id;
      const src = await callSeedream(draftPrompt, { tier: draftTier, referenceImage: wf.referenceImages[0]?.src, uid });
      const { w, h } = await naturalSize(src);
      const next = images.map((it) => it.id === img.id
        ? { ...it, src, prompt: draftPrompt, model: draftTier, tier: draftTier, at: Date.now(), naturalW: w, naturalH: h }
        : it);
      patchWorkflow(project.id, { conceptImages: next, selectedConceptImageId: img.id });
      if (auth.user) {
        await recordUsage(auth.user.id, cost, 'image');
        sub.refresh();
      }
      setEditing(null);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '重新生成失败，请重试');
    } finally {
      setRegenBusy(null);
    }
  };

  /** 继续设计：把选中整包图组装成工程并进入编辑器 */
  const continueDesign = async () => {
    const selected = images.find((i) => i.id === selectedId) || images[0];
    if (!selected) { setToast('请先生成并选择一张方案'); return; }
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
      setToast(e instanceof Error ? e.message : '组装失败，请重试');
    } finally {
      setAssembling(false);
    }
  };

  const allEmpty = images.length === 0;

  return (
    <div className="wf-page wf-page-wide">
      <div className="wf-head">
        <div className="wf-kicker">STEP 03 · 设计方案</div>
        <h1 className="wf-title">{loading ? 'AI 正在为你生成包装…' : '挑一个你喜欢的方向'}</h1>
        <p className="wf-sub">
          基于你填的参考图与产品信息生成三张完整效果图。选中一张后可「继续设计」，或对某一张单独重新生成。
        </p>
      </div>

      {allEmpty && !loading && !error && (
        <div className="wf-card wf-empty-card">
          <div className="wf-error-ico"><Icon name="spark" size={24} /></div>
          <h3>还没有方案图</h3>
          <p>回到「确认需求」补充信息后点「开始 AI 设计」，或直接在这里生成一批三张。</p>
          <button className="wf-btn-primary" onClick={() => { startedRef.current = true; void generateBatch(); }}>
            <Icon name="spark" size={16} /> 生成三张方案（{BATCH_COST} 积分）
          </button>
        </div>
      )}

      {allEmpty && !loading && error && (
        <div className="wf-card wf-error-card">
          <div className="wf-error-ico"><Icon name="alert" size={24} /></div>
          <h3>这次没有生成成功</h3>
          <p>{error}</p>
          <button className="wf-btn-primary" onClick={() => { startedRef.current = true; void generateBatch(); }}>
            <Icon name="spark" size={16} /> 重试生成（{BATCH_COST} 积分）
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
                  <img src={img.src} alt={`方案 ${img.label}`} />
                  <span className="wf-concept-badge">{selected ? '已选' : `方案 ${img.label}`}</span>
                </button>
                <div className="wf-concept-meta">
                  <span className="wf-concept-name">{HINTS.find((h) => h.label === img.label)?.name || `方案 ${img.label}`}</span>
                  <span className="wf-concept-tier">{img.tier === 'pro' ? 'Pro' : 'Flash'}</span>
                </div>

                {!isEditing ? (
                  <div className="wf-concept-actions">
                    <button className="wf-mini-btn" onClick={() => openRegen(img)}>
                      <Icon name="redo" size={14} /> 重新生成
                    </button>
                  </div>
                ) : (
                  <div className="wf-regen-panel">
                    <div className="wf-seg wf-seg-sm">
                      {(['flash', 'pro'] as ImageTier[]).map((t) => (
                        <button key={t} className={`wf-seg-btn ${draftTier === t ? 'on' : ''}`} onClick={() => setDraftTier(t)}>
                          {t === 'flash' ? `Flash ${tierCost('flash')}积分` : `Pro ${tierCost('pro')}积分`}
                        </button>
                      ))}
                    </div>
                    <textarea className="wf-textarea" rows={3} value={draftPrompt}
                      onChange={(e) => setDraftPrompt(e.target.value)} placeholder="对这一张的额外要求…" />
                    <div className="wf-regen-actions">
                      <button className="wf-btn-ghost sm" onClick={() => setEditing(null)}>取消</button>
                      <button className="wf-btn-primary sm" disabled={regenBusy === img.id}
                        onClick={() => void regenerate(img)}>
                        <Icon name="spark" size={14} /> {regenBusy === img.id ? '生成中…' : `重新生成（${tierCost(draftTier)}积分）`}
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
          <button className="wf-btn-ghost" onClick={() => patchWorkflow(project.id, { stage: 'requirements' })}>返回修改需求</button>
          <button className="wf-btn-primary" onClick={() => void continueDesign()} disabled={assembling || !selectedId}>
            <Icon name="spark" size={16} /> {assembling ? '正在进入编辑器…' : '继续设计'}
          </button>
        </div>
      )}

      <p className="wf-foot-note">
        生成 3 张共 {BATCH_COST} 积分（Flash 档）；单张重新生成按所选档位计费。积分余额 {sub.usedLeft ?? '—'}。
      </p>
    </div>
  );
}
