/* ============================================================
 * 复刻设计 · 工作区（/replicate/new、/replicate/edit?id=）
 * ------------------------------------------------------------
 * 为什么不是一个上传框加一个下拉，而是「先选类型」：
 * 主图、详情页、海报、视频封面、包装、周边，这六种东西的
 * 画面规则、默认比例、可容忍的发挥空间完全不同——同一个提示词
 * 出不来能用的详情页，也出不来能当封面的 16:9 图。
 * 所以第一步是选类型（弹窗卡片），类型决定了后面的场景规则与默认尺寸。
 *
 * 每种类型的流程完全一致：
 *   1. 参考图（可多张）+ 我的素材图（可多张）——两张都要真参与生成；
 *   2. 补充提示词、选模型、选尺寸、拖「复刻度」；
 *   3. 一次出三张，可单张重来、可改提示词换模型重来、可整组重来。
 *
 * 草稿：复刻设计与包装设计各有各的草稿箱（store 里的 replicates 一列）。
 * 这里每改一次（传图 / 改提示词 / 出图）都自动写回那条记录，
 * 地址栏同步成 /replicate/edit?id=…，刷新还能回到同一份草稿。
 * 用 replaceState 而不是改 hash：改 hash 会触发 hashchange，
 * App 会按 key 重挂编辑器，刚输入的内容就被清空了。
 * ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { go, useHash } from '../ui';
import { useApp } from '../store';
import { useAuth } from '../cloud/auth';
import { useSubscription, recordUsage } from '../cloud/subscription';
import { callImage } from '../engine/seedream';
import { OPEN_IMAGE_MODELS, imageCost, imageLabel, imageModel, resolveTier } from '../cloud/models';
import { compressImageForUpload } from '../workflow/imageUtils';
import { LoginDialog } from '../cloud/LoginDialog';
import { Icon } from '../components/icons';
import { useLang } from '../i18n';
import { emptyProductInfo } from '../types';
import type { ConceptImage, ImageTier, ReferenceImage, ReferenceRole, ReplicateImage, ReplicateProject, ReplicateResult } from '../types';
import { BATCH, KINDS, MAX_IMAGES, RATIOS, kindById, kindDesc, kindName, type KindDef } from '../replicate/kinds';
import '../replicate.css';

type Slot = 'ref' | 'mat';
/** 上传的图与存档的图是同一个结构（id / src / 宽高 / 文件名） */
type Uploaded = ReplicateImage;
type Item = ReplicateResult;

const TAIL = '高分辨率商业级出图，画面干净，无拼贴、无分栏、无水印、无多余产品，中文文字排版正确';

/** 复刻度 → 一句可执行的指令。100% 就是「一比一照着做」，越低给模型的发挥空间越大。 */
function fidelityRule(r: number): string {
  if (r >= 95) return '复刻度 100%：构图、元素位置、比例、配色、字体气质与留白层级全部按参考图一比一还原，只把画面主体替换成我的素材';
  if (r >= 75) return `复刻度 ${r}%：沿用参考图的构图骨架、配色关系与字体气质，仅在纹理、装饰细节与辅助元素上做小幅调整`;
  if (r >= 45) return `复刻度 ${r}%：保留参考图的整体气质与配色方向，版式与元素可以重新组织，让主体更突出`;
  return `复刻度 ${r}%：参考图只作为风格灵感，构图、版式与元素全部重新设计，只保留色彩与气质倾向`;
}

/** 两栏各自的职责。缺哪一栏就换一句，不能把缺失的那栏写进提示词里。 */
function roleRule(hasRef: boolean, hasMat: boolean): string {
  if (hasRef && hasMat) return '输入图中的参考图只提供配色、字体气质、材质与构图骨架；素材图是必须出现在画面里的真实主体，保留它的造型、结构、标签排版与品牌文字，不要改变它的身份';
  if (hasRef) return '输入图是参考图：按它复刻构图与视觉风格，画面主体取自参考图本身，允许替换其中的文案与产品信息';
  return '输入图是我的素材：作为画面主体，必须保留它的造型、结构、标签文字与品牌信息；画面风格按下述要求重新设计';
}

function buildPrompt(kind: KindDef, r: number, extra: string, hasRef: boolean, hasMat: boolean): string {
  return [fidelityRule(r), kind.scene, roleRule(hasRef, hasMat), extra.trim(), TAIL]
    .filter(Boolean).join('，');
}

/** 报错文案：浏览器的 TypeError 只会说 "Failed to fetch"，
 *  对用户等于没说。网络类错误统一换成一句人能看懂的话。 */
function readableError(e: unknown, fallback: string, offline: string): string {
  const m = e instanceof Error ? e.message : '';
  if (!m) return fallback;
  if (/failed to fetch|network|load failed|fetch failed/i.test(m)) return offline;
  return m;
}

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1024, h: 1024 });
    img.src = src;
  });
}

/** 每张压到 1280 长边 / 520KB：最多 4 张 + 拼贴板要塞进云函数 6MB 的请求体 */
async function readImage(file: File): Promise<Uploaded> {
  const c = await compressImageForUpload(file, { maxEdge: 1280, maxBytes: 520 * 1024 });
  return {
    id: `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    src: c.dataUrl, w: c.width, h: c.height, name: file.name,
  };
}

/**
 * 拼贴参考板：按 [参考…, 素材…] 的同一顺序排成一张图。
 * 只在「上游不认多图」时作为降级输入，编号与真·多图顺序严格一致，
 * 否则降级后会变成「把参考图当产品用」这种整张图都错的输出。
 */
async function buildBoard(items: { src: string; label: string }[]): Promise<string> {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = src;
  });
  const imgs = await Promise.all(items.map((it) => load(it.src)));
  const n = items.length;
  const cols = n <= 2 ? n : 2;
  const rows = Math.ceil(n / cols);
  const W = 1280;
  const cellW = Math.floor((W - 24 * 2) / cols);
  const cellH = Math.round(cellW * 0.78);
  const HEAD = 30;
  const H = 24 * 2 + rows * cellH + (rows - 1) * 14 + HEAD;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return items[0].src;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1b1b1a';
  ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('INPUT IMAGES · 1 → ' + n, 24, 20);
  ctx.textBaseline = 'alphabetic';
  imgs.forEach((img, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 24 + col * (cellW + 14);
    const y = 24 + HEAD + row * (cellH + 14);
    ctx.strokeStyle = '#e6e6e2';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cellW, cellH);
    const s = Math.min((cellW - 12) / Math.max(1, img.naturalWidth), (cellH - 34) / Math.max(1, img.naturalHeight));
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, x + (cellW - w) / 2, y + 8 + ((cellH - 34) - h) / 2, w, h);
    ctx.fillStyle = '#1b1b1a';
    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`${i + 1}  ${items[i].label}`, x + 6, y + cellH - 8);
  });
  return c.toDataURL('image/jpeg', 0.85);
}

/** 「文字输入」档不能出现在这里：带参考图会被云函数判 400（按文字档扣费却走改图档） */
const RECREATE_MODELS = OPEN_IMAGE_MODELS.filter((m) => !(m.provider === 'bai' && !m.needsRef));

/**
 * B.AI（GPT Image 2）只认 1024×1024 / 1536×1024 / 1024×1536 三种尺寸，
 * 传 16:9 的 1280×720 会被上游直接拒。这里按方向就近吸附，
 * 方舟 Seedream 则用它自己那套更宽的尺寸，不做吸附。
 * 不吸附的后果是：用户付了 GPT Image 2 的钱，却拿到一句「图像生成失败」。
 */
function sizeForTier(tier: ImageTier, ratio: { id: string; size: string }): string {
  if (imageModel(tier).provider !== 'bai') return ratio.size;
  if (ratio.id === '1:1') return '1024x1024';
  if (ratio.id === '4:3' || ratio.id === '16:9') return '1536x1024';
  return '1024x1536';
}

function ModelPicker({ value, onChange, disabled }: {
  value: ImageTier; onChange: (v: ImageTier) => void; disabled?: boolean;
}) {
  const { t } = useLang();
  return <select className="rep-select" value={value} disabled={disabled}
    onChange={(e) => onChange(e.target.value as ImageTier)}>
    {RECREATE_MODELS.map((m) => <option key={m.id} value={m.id}>
      {imageLabel(m.id as ImageTier)} · {imageCost(m.id as ImageTier)} {t('积分', 'credits')}
    </option>)}
  </select>;
}

let seq = 0;

/** 一份草稿的状态快照：自动保存和「立即保存」都按它写库，
 *  signature 用来判断「有没有真的变过」，避免打开一下就刷新 updatedAt。 */
interface Snapshot {
  kind: KindDef;
  refs: Uploaded[];
  mats: Uploaded[];
  items: Item[];
  extra: string;
  fidelity: number;
  tier: ImageTier;
  ratioId: string;
}

const sigOf = (x: Snapshot): string => JSON.stringify([
  x.kind.id, x.refs.map((r) => r.id), x.mats.map((m) => m.id), x.items.map((i) => i.id),
  x.extra, x.fidelity, x.tier, x.ratioId,
]);

export default function Replicate() {
  const { t, lang } = useLang();
  const auth = useAuth();
  const sub = useSubscription();
  const { s, setToast, createWorkflowProject, patchWorkflow, saveReplicate } = useApp();
  const hash = useHash();

  /* 从地址栏取要编辑的草稿；没有 id 就是新建 */
  const editId = new URLSearchParams(hash.split('?')[1] || '').get('id');
  const [opened] = useState(() => (editId ? s.replicates.find((r) => r.id === editId) ?? null : null));

  const [kind, setKind] = useState<KindDef | null>(() => kindById(opened?.kind));
  const [pickerOpen, setPickerOpen] = useState(!opened);

  const [refs, setRefs] = useState<Uploaded[]>(opened?.refs ?? []);
  const [mats, setMats] = useState<Uploaded[]>(opened?.mats ?? []);
  const [dragSlot, setDragSlot] = useState<Slot | null>(null);
  const [extra, setExtra] = useState(opened?.extra ?? '');
  const [tier, setTier] = useState<ImageTier>(opened?.tier ?? 'flash');
  const [ratioId, setRatioId] = useState(opened?.ratio ?? '1:1');
  const [fidelity, setFidelity] = useState(opened?.fidelity ?? 80);
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const [items, setItems] = useState<Item[]>(opened?.items ?? []);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftExtra, setDraftExtra] = useState('');
  const [draftTier, setDraftTier] = useState<ImageTier>('flash');

  const refInput = useRef<HTMLInputElement>(null);
  const matInput = useRef<HTMLInputElement>(null);

  /** 已经落库的草稿 id：放 ref 里，保存函数里读到的永远是最新值 */
  const draftIdRef = useRef<string | null>(opened?.id ?? null);
  const createdRef = useRef<number>(opened?.createdAt ?? 0);
  /** 首帧的签名算「已保存」，否则打开旧草稿会立刻把它顶到列表最上面 */
  const savedSigRef = useRef<string | null>(null);

  const safeTier = resolveTier(tier, sub.isPro);
  /** 与「设计方案」同口径：三张按一张档位的价扣，不收三倍 */
  const batchCost = imageCost(safeTier);
  const ratio = RATIOS.find((r) => r.id === ratioId) || RATIOS[0];
  /** 结果卡与占位卡按所选比例出框，16:9 的封面不会被裁成方图 */
  const cssRatio = ratio.id.replace(':', ' / ');
  const total = refs.length + mats.length;
  const ready = refs.length > 0 && mats.length > 0;
  const nm = (k: KindDef) => kindName(k, lang);
  const kd = (k: KindDef) => kindDesc(k, lang);

  const snapshot = (patch?: Partial<Snapshot>): Snapshot | null => {
    if (!kind) return null;
    return { kind, refs, mats, items, extra, fidelity, tier, ratioId, ...patch };
  };

  /** 整条覆盖写入草稿箱。有 id 就更新，没有就新建并把 id 写进地址栏。 */
  const saveDraft = (snap: Snapshot | null) => {
    if (!snap) return;
    const now = Date.now();
    const id = draftIdRef.current
      || `rep_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const existingName = s.replicates.find((r) => r.id === id)?.name;
    const rec: ReplicateProject = {
      id,
      name: existingName || t(`${kindName(snap.kind, 'zh')}复刻`, `${kindName(snap.kind, 'en')} recreation`),
      kind: snap.kind.id,
      ratio: snap.ratioId,
      fidelity: snap.fidelity,
      extra: snap.extra,
      tier: snap.tier,
      refs: snap.refs,
      mats: snap.mats,
      items: snap.items,
      createdAt: createdRef.current || now,
      updatedAt: now,
    };
    saveReplicate(rec);
    createdRef.current = rec.createdAt;
    savedSigRef.current = sigOf(snap);
    if (!draftIdRef.current) {
      draftIdRef.current = id;
      // 用 replaceState：改成 location.hash 会触发 hashchange，App 按 key 重挂，
      // 编辑器状态全被清掉（刚传的图会没）
      window.history.replaceState(null, '', `#/replicate/edit?id=${id}`);
    }
  };

  /* 首帧记下签名：打开旧草稿时一次都不写，只有真的改过才保存 */
  const cur = snapshot();
  if (savedSigRef.current === null && cur) savedSigRef.current = sigOf(cur);

  /* 自动保存：传图 / 改提示词 / 换模型 / 换尺寸 / 复刻度变化，700ms 后落库。
     完全空白（没图没结果没提示词）不落库，否则列表里全是空记录。 */
  useEffect(() => {
    const snap = snapshot();
    if (!snap) return;
    if (!snap.refs.length && !snap.mats.length && !snap.items.length && !snap.extra.trim()) return;
    if (savedSigRef.current === sigOf(snap)) return;
    const timer = window.setTimeout(() => saveDraft(snap), 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, refs, mats, items, extra, fidelity, tier, ratioId]);

  const reset = () => { setItems([]); setEditingId(null); };

  const pickKind = (k: KindDef) => {
    setKind(k);
    setRatioId(k.ratio);
    setPickerOpen(false);
    reset();
  };

  const addFiles = async (slot: Slot, files: FileList | null | undefined) => {
    if (!files || !files.length) return;
    const room = MAX_IMAGES - refs.length - mats.length;
    if (room <= 0) {
      setToast(t(`最多 ${MAX_IMAGES} 张（模型单次能读的上限）`, `Up to ${MAX_IMAGES} images in total`));
      return;
    }
    const list = Array.from(files).slice(0, room);
    const added: Uploaded[] = [];
    for (const f of list) {
      try {
        added.push(await readImage(f));
      } catch (e) {
        const tooLarge = e instanceof Error && e.message === 'TOO_LARGE';
        setToast(tooLarge
          ? t('图片超过 30MB，请先压缩或换一张', 'This image is over 30 MB — compress it or pick another one')
          : t('这张图读不出来，换一张试试', 'That image could not be read'));
      }
    }
    if (!added.length) return;
    if (slot === 'ref') setRefs((p) => [...p, ...added]); else setMats((p) => [...p, ...added]);
    reset();
    if (files.length > list.length) {
      setToast(t(`只加了前 ${list.length} 张，合计上限 ${MAX_IMAGES} 张`, `Added ${list.length} — ${MAX_IMAGES} images max`));
    }
  };

  const removeAt = (slot: Slot, id: string) => {
    if (slot === 'ref') setRefs((p) => p.filter((x) => x.id !== id));
    else setMats((p) => p.filter((x) => x.id !== id));
    reset();
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

  /** 真·多图 + 拼贴板兜底，顺序都是「参考… → 素材…」 */
  const imageInputs = async () => {
    const all = [
      ...refs.map((r, i) => ({ src: r.src, label: `${t('参考', 'REF')} ${i + 1}` })),
      ...mats.map((m, i) => ({ src: m.src, label: `${t('素材', 'ASSET')} ${i + 1}` })),
    ];
    const board = all.length > 1 ? await buildBoard(all) : all[0].src;
    return { referenceImage: board, referenceImages: all.map((a) => a.src) };
  };

  const generateAll = async () => {
    if (!kind) { setPickerOpen(true); return; }
    if (!ready) {
      setToast(t('参考图和素材图各至少要 1 张', 'Add at least one reference and one asset image'));
      return;
    }
    if (!ensureQuota(batchCost)) return;
    setBusy(true);
    setItems([]);
    // 生成期间先落一次库：中途关掉页面，回来还能看到已上传的图与设置
    saveDraft(snapshot({ items: [] }));
    try {
      const uid = auth.user?.id;
      const inputs = await imageInputs();
      const prompt = buildPrompt(kind, fidelity, extra, refs.length > 0, mats.length > 0);
      const settled = await Promise.allSettled(Array.from({ length: BATCH }, async () => {
        const src = await callImage(prompt, { tier: safeTier, size: sizeForTier(safeTier, ratio), ...inputs, uid });
        const size = await naturalSize(src);
        return { id: `rec_${Date.now()}_${seq++}`, src, extra, prompt, tier: safeTier, fid: fidelity, w: size.w, h: size.h };
      }));
      const ok = settled.filter((r): r is PromiseFulfilledResult<Item> => r.status === 'fulfilled').map((r) => r.value);
      if (!ok.length) {
        const fail = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        throw new Error(fail?.reason?.message || t('生成失败，请稍后重试', 'Generation failed, try again'));
      }
      setItems(ok);
      // 三张出完立刻写库：用户接着点「用它开始」会跳到包装设计，这一步不能等防抖
      saveDraft(snapshot({ items: ok }));
      await charge(batchCost);
    } catch (e) {
      setToast(readableError(e, t('生成失败', 'Generation failed'), t('网络不通，检查网络后再试一次', 'Network request failed — check your connection and try again')));
    } finally {
      setBusy(false);
    }
  };

  const regenerateOne = async (id: string, nextExtra: string, nextTier: ImageTier) => {
    const item = items.find((x) => x.id === id);
    if (!item || !kind || !ready) return;
    const cost = imageCost(resolveTier(nextTier, sub.isPro));
    if (!ensureQuota(cost)) return;
    setRegenId(id);
    try {
      const uid = auth.user?.id;
      const inputs = await imageInputs();
      // 系统规则（复刻度 / 场景 / 两栏职责）在每次重生成时都重新拼回，
      // 否则「改提示词」会退化成普通的单图生图，素材图的文字就保不住了。
      const p = buildPrompt(kind, fidelity, nextExtra, refs.length > 0, mats.length > 0);
      const nextSafe = resolveTier(nextTier, sub.isPro);
      const src = await callImage(p, { tier: nextSafe, size: sizeForTier(nextSafe, ratio), ...inputs, uid });
      const size = await naturalSize(src);
      const nextItems = items.map((x) => (x.id === id
        ? { ...x, src, extra: nextExtra, prompt: p, tier: nextSafe, fid: fidelity, w: size.w, h: size.h }
        : x));
      setItems(nextItems);
      saveDraft(snapshot({ items: nextItems }));
      setEditingId(null);
      await charge(cost);
    } catch (e) {
      setToast(readableError(e, t('重新生成失败', 'Regeneration failed'), t('网络不通，检查网络后再试一次', 'Network request failed — check your connection and try again')));
    } finally {
      setRegenId(null);
    }
  };

  /** 把这张图带走：建包装设计项目 → 所有参考图与选中方案都写进草稿，进流程 */
  const useResult = (item: Item) => {
    if (!kind) return;
    if (!auth.user) { setLoginOpen(true); return; }
    // 先保存复刻草稿，再跳走：跳转后本组件卸载，没落库的改动会丢
    saveDraft(snapshot());
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
      hint: kind.scene,
    };
    const project = createWorkflowProject({
      mode: 'referenceStyle',
      productInfo: emptyProductInfo(),
      referenceImages: [
        ...refs.map((r, i) => toRef(r, kind.role === 'packaging' ? 'packaging' : 'competitor', t('风格参考', 'Style reference') + ` ${i + 1}`)),
        ...mats.map((m, i) => toRef(m, kind.role, t('我的素材', 'My asset') + ` ${i + 1}`)),
      ],
      name: t(`${nm(kind)}复刻`, `${nm(kind)} recreation`),
    });
    patchWorkflow(project.id, {
      stage: 'concepts',
      conceptImages: [concept],
      selectedConceptImageId: concept.id,
      autoGenPending: false,
    });
    go('/new');
  };

  const renderSlot = (slot: Slot) => {
    const list = slot === 'ref' ? refs : mats;
    const input = slot === 'ref' ? refInput : matInput;
    const title = slot === 'ref' ? t('参考图', 'Reference images') : t('我的素材图', 'My assets');
    const hint = slot === 'ref'
      ? t('想要的那种感觉 · 配色 / 版式 / 气质', 'The look you want — colour, layout, mood')
      : t('必须出现的主体 · 产品 / 包装 / 人物', 'What must appear — product, package, person');
    const empty = slot === 'ref' ? t('拖入参考图', 'Drop references') : t('拖入素材图', 'Drop your assets');
    return <div className="rep-slot" key={slot}>
      <div className="rep-slot-head">
        <span className="rep-slot-title">{title}</span>
        <span className="rep-slot-n">{list.length}</span>
      </div>
      <p className="rep-slot-hint">{hint}</p>
      <div className={`rep-thumbs ${list.length ? 'has' : ''}`}>
        {list.map((img) => <div className="rep-thumb" key={img.id}>
          <img src={img.src} alt={img.name} />
          <button className="rep-thumb-x" onClick={() => removeAt(slot, img.id)} title={t('移除', 'Remove')} aria-label={t('移除', 'Remove')}>
            <Icon name="close" size={11} />
          </button>
        </div>)}
        {total < MAX_IMAGES && <button
          className={`rep-add ${dragSlot === slot ? 'over' : ''}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragSlot(slot); }}
          onDragLeave={() => setDragSlot(null)}
          onDrop={(e) => { e.preventDefault(); setDragSlot(null); void addFiles(slot, e.dataTransfer.files); }}
        >
          <Icon name="plus" size={16} />
          <b>{empty}</b>
          <span>{t('可多张 · 本机压缩', 'Multiple · resized locally')}</span>
        </button>}
        <input ref={input} type="file" accept="image/*" multiple hidden
          onChange={(e) => { void addFiles(slot, e.target.files); e.currentTarget.value = ''; }} />
      </div>
    </div>;
  };

  return <div className="page rep-page">
    <div className="rep-crumb">
      <button onClick={() => go('/replicate')}>
        <Icon name="chevronLeft" size={12} />{t('复刻记录', 'My recreations')}
      </button>
      <span className="rep-kicker">RECREATE</span>
    </div>

    <div className="rep-head">
      <h1>{kind ? t(`复刻 · ${nm(kind)}`, `Recreate · ${nm(kind)}`) : t('把喜欢的风格复刻成自己的作品', 'Recreate a look as your own work')}</h1>
      <p>{kind
        ? t('上传参考图与自己的素材图，定好复刻度、尺寸和模型，一次给你三张。挑一张进编辑器，或者改完提示词再来一组。',
          'Add references and your own assets, set how closely to follow them plus size and model, and get three takes. Keep one in the editor, or adjust the prompt and run again.')
        : t('先选要做什么：主图、详情页、海报、视频封面、包装、周边。每种类型的画面规则和默认尺寸不同，选好以后还能改。',
          'Pick a format first — main image, detail page, poster, video cover, packaging or merch. Each has its own layout rules and default size, and you can change them later.')}</p>
      {kind && <div className="rep-head-actions">
        <button className="rep-switch" onClick={() => setPickerOpen(true)}>
          <Icon name="grid" size={13} />{t('换个类型', 'Change format')}
        </button>
        {/* 如实说明存到哪儿了：复刻草稿存在本机浏览器，不进云端项目表 */}
        <span className="rep-savehint">
          <Icon name="check" size={12} />
          {draftIdRef.current ? t('已自动存到复刻记录', 'Saved to your recreations') : t('改动会自动存成复刻记录', 'Changes are saved as a recreation')}
        </span>
      </div>}
    </div>

    {kind && <div className="rep-grid">
      {/* 左：设置 */}
      <aside className="rep-setup">
        <div className="rep-slots">
          {renderSlot('ref')}
          {renderSlot('mat')}
        </div>
        <p className="rep-cap">{t(`已选 ${total} / ${MAX_IMAGES} 张 · 模型单次最多读 ${MAX_IMAGES} 张`, `${total} / ${MAX_IMAGES} images · models read up to ${MAX_IMAGES}`)}</p>

        <label className="rep-label" htmlFor="rep-extra">{t('补充提示词（可选）', 'Extra instructions (optional)')}</label>
        <textarea id="rep-extra" className="rep-textarea" rows={3} value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder={t('例如：主色改成深绿、文案换成「冷萃 250ml」、背景加一块亚麻布',
            'e.g. deep green as the base colour, copy reads “Cold Brew 250ml”, add linen in the background')} />

        <label className="rep-label" htmlFor="rep-fid">
          {t('复刻度', 'How closely to follow')} <b className="rep-fid-val">{fidelity}%</b>
        </label>
        <input id="rep-fid" className="rep-range" type="range" min={20} max={100} step={5}
          value={fidelity} onChange={(e) => setFidelity(Number(e.target.value))} />
        <div className="rep-range-ends">
          <span>{t('只借个感觉', 'Loose inspiration')}</span>
          <span>{t('一比一照做', 'One to one')}</span>
        </div>

        <label className="rep-label">{t('生图模型', 'Image model')}</label>
        <ModelPicker value={tier} onChange={setTier} disabled={busy} />

        <label className="rep-label">{t('尺寸', 'Size')}</label>
        <div className="rep-ratios">
          {RATIOS.map((r) => <button key={r.id} className={`rep-ratio ${r.id === ratioId ? 'on' : ''}`}
            onClick={() => setRatioId(r.id)} disabled={busy}>{r.label}</button>)}
        </div>

        <div className="rep-cost">
          <span>{t(`本次 ${BATCH} 张 · ${ratio.label}`, `${BATCH} images · ${ratio.label}`)}</span>
          <b>{batchCost} {t('积分', 'credits')}</b>
        </div>

        <button className="rep-run" onClick={() => void generateAll()} disabled={busy || !ready}>
          {busy ? t('正在生成…', 'Generating…') : t('开始复刻', 'Recreate')}
        </button>
        {!ready && <p className="rep-note">{t('参考图和素材图各上传至少 1 张后才能开始。', 'Add at least one reference and one asset to start.')}</p>}
        {ready && !auth.user && <p className="rep-note">{t('未登录会先弹登录，登录后积分才开始计。', 'You will be asked to sign in first.')}</p>}
      </aside>

      {/* 右：结果 */}
      <section className="rep-results">
        {items.length === 0 && <div className="rep-placeholder">
          {Array.from({ length: BATCH }, (_, i) => <div className="rep-ph" key={i} style={{ '--rep-ar': cssRatio } as React.CSSProperties}>
            <span>{t('方案', 'Take')} {String.fromCharCode(65 + i)}</span>
            <em>{busy ? t('生成中…', 'Generating…') : t('等待生成', 'Waiting')}</em>
          </div>)}
        </div>}

        {items.length > 0 && <div className="rep-cards">
          {items.map((it, i) => {
            const isEditing = editingId === it.id;
            return <article className="rep-card" key={it.id}>
              <div className="rep-card-img" style={{ '--rep-ar': cssRatio } as React.CSSProperties}>
                <img src={it.src} alt={`${kind ? nm(kind) : ''} ${i + 1}`} />
                <span className="rep-tag">{t('方案', 'Take')} {String.fromCharCode(65 + i)}</span>
                {regenId === it.id && <div className="rep-loading"><i />{t('重新生成中…', 'Regenerating…')}</div>}
              </div>
              <div className="rep-card-body">
                <div className="rep-card-meta">
                  <span>{imageLabel(it.tier)}</span>
                  <span>{it.w}×{it.h}</span>
                  <span>{it.fid}%</span>
                </div>
                <p className="rep-card-prompt">{it.extra || t('按参考图与素材图复刻', 'Recreated from your images')}</p>

                {isEditing && <div className="rep-edit">
                  <textarea className="rep-textarea" rows={3} value={draftExtra} onChange={(e) => setDraftExtra(e.target.value)}
                    placeholder={t('补充提示词', 'Extra instructions')} />
                  <ModelPicker value={draftTier} onChange={setDraftTier} />
                  <div className="rep-edit-actions">
                    <button onClick={() => setEditingId(null)}>{t('取消', 'Cancel')}</button>
                    <button className="on" onClick={() => void regenerateOne(it.id, draftExtra, draftTier)}
                      disabled={regenId === it.id}>{t('用这个重新生成', 'Regenerate')}</button>
                  </div>
                </div>}

                {!isEditing && <div className="rep-card-actions">
                  <button onClick={() => void regenerateOne(it.id, it.extra, it.tier)} disabled={regenId === it.id}>
                    <Icon name="refresh" size={13} />{t('重新生成', 'Regenerate')}
                  </button>
                  <button onClick={() => { setEditingId(it.id); setDraftExtra(it.extra); setDraftTier(it.tier); }}>
                    <Icon name="edit" size={13} />{t('改提示词', 'Edit prompt')}
                  </button>
                  <button className="primary" onClick={() => useResult(it)}>
                    {t('用它做包装', 'Use in packaging')} <Icon name="chevronRight" size={13} />
                  </button>
                </div>}
              </div>
            </article>;
          })}
        </div>}

        {items.length > 0 && <div className="rep-foot">
          <button onClick={() => void generateAll()} disabled={busy}>
            <Icon name="refresh" size={13} />{t(`三张全部重来（${batchCost} 积分）`, `Regenerate all three (${batchCost} credits)`)}
          </button>
        </div>}
      </section>
    </div>}

    {/* 类型弹窗：第一次进来必选；已有类型时可以从「换个类型」再打开 */}
    {pickerOpen && <div className="rep-modal" role="dialog" aria-modal="true" aria-label={t('选择复刻类型', 'Choose a format')}>
      <div className="rep-modal-box">
        <div className="rep-modal-head">
          <div>
            <h2>{t('要复刻成什么？', 'What are we making?')}</h2>
            <p>{t('不同类型对应不同的画面规则与默认尺寸，选好之后都可以再调整。',
              'Each format has its own layout rules and default size — everything stays adjustable.')}</p>
          </div>
          {kind && <button className="rep-modal-x" onClick={() => setPickerOpen(false)} aria-label={t('关闭', 'Close')}>
            <Icon name="close" size={15} />
          </button>}
        </div>
        <div className="rep-kinds">
          {KINDS.map((k) => <button key={k.id} className={`rep-kind ${kind?.id === k.id ? 'on' : ''}`} onClick={() => pickKind(k)}>
            <span className="rep-kind-ic"><Icon name={k.icon} size={17} /></span>
            <b>{nm(k)}</b>
            <em>{kd(k)}</em>
            <span className="rep-kind-ratio">{RATIOS.find((r) => r.id === k.ratio)?.label}</span>
          </button>)}
        </div>
      </div>
    </div>}

    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={(m) => setToast(m)} />
  </div>;
}
