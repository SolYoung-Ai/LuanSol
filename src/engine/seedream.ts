/* ============================================================
 * 图像生成调用（经云函数代理，前端不持有任何厂商密钥）
 * ------------------------------------------------------------
 * 前端只传「档位名」（flash / pro / gpt2-text / gpt2-ref），
 * 真实模型 ID 与厂商路由全部在云函数里决定：
 *   flash / pro        → 火山方舟 Seedream
 *   gpt2-text          → B.AI GPT Image 2 · /images/generations（文字输入）
 *   gpt2-ref           → B.AI GPT Image 2 · /images/edits（带参考图，multipart）
 * 这样即使前端被改，也不可能拿便宜的档位去调贵的模型。
 * ============================================================ */
import { CLOUD } from '../cloud/config';
import { imageModel } from '../cloud/models';
import { cloudAccessToken } from '../cloud/sdk';
import { CancelledError } from './cancel';
import type { ImageTier } from '../types';

export async function callImage(prompt: string, opts: {
  tier: ImageTier;
  /** 单张兼容字段。多图场景请传「拼接参考板」：旧版云函数只认这个字段，
   *  这样即使服务端还没更新，两张图的信息也不会丢。 */
  referenceImage?: string;
  /** 真·多图输入（新版云函数）：按 [风格参考, 产品图] 顺序传给模型。 */
  referenceImages?: string[];
  uid?: string;
  /** 出图尺寸（对应界面的「比例」），不传时用 1024x1024 */
  size?: string;
  /** 用户点「取消」时中止请求：断开连接后云函数会跟着掐掉上游调用 */
  signal?: AbortSignal;
}): Promise<string> {
  if (!CLOUD.aiBaseUrl || !CLOUD.aiToken) throw new Error('图像服务未配置');
  const m = imageModel(opts.tier);
  const refs = (opts.referenceImages || [])
    .filter((s) => typeof s === 'string' && s.startsWith('data:image/'))
    .slice(0, 4);
  const single = opts.referenceImage || refs[0];
  // 需要参考图的档位没图时，宁可直接报错也不要偷偷换成别的模型（会扣错积分）
  if (m.needsRef && !single) throw new Error('该模型需要先上传参考图');
  // 服务端按 access token 认人扣分（uid 头只是日志辅助，可伪造，不能作为计费依据）
  const accessToken = await cloudAccessToken();
  if (!accessToken) throw new Error('登录状态已失效，请重新登录后再生成');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-LunaSol-Token': CLOUD.aiToken,
    'X-CloudBase-Token': accessToken,
  };
  if (opts.uid) headers['X-CloudBase-Uid'] = opts.uid;
  let r: Response;
  try {
    r = await fetch(`${CLOUD.aiBaseUrl}/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        size: opts.size || '1024x1024',
        model: m.id,
        ...(single ? { image: single } : {}),
        ...(refs.length > 1 ? { images: refs } : {}),
      }),
      signal: opts.signal,
    });
  } catch (e) {
    // fetch 被 abort 时抛的是 AbortError，统一换成 CancelledError，
    // 上层才能分清「用户取消」和「真的失败了」
    if (opts.signal?.aborted) throw new CancelledError();
    throw e;
  }
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `图像生成失败 ${r.status}`);
  const item = j.data && j.data[0];
  const url = item && (item.url || item.b64_json);
  if (!url) throw new Error('图像未返回');
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http')) return url;
  return `data:image/png;base64,${url}`;
}

/** 旧名字保留一个别名，避免遗漏的引用直接炸掉；新代码一律用 callImage。 */
export const callSeedream = callImage;

/* ============================================================
   阶段三 — Seedream 5.5 工作台接口
   ------------------------------------------------------------
   · /studio/ai     完整概念图 / 独立透明 PNG（服务端扣分）
   · /images/layer-split  官方图层拆分（服务端预扣 + 失败退款）
   两者都必须带用户 access token；uid 头只是日志辅助，不作为扣费依据。
   ============================================================ */

async function postAI<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal, uid = ''): Promise<T> {
  if (!CLOUD.aiBaseUrl || !CLOUD.aiToken) throw new Error('图像服务未配置');
  const token = await cloudAccessToken();
  if (!token) throw new Error('登录状态已失效，请重新登录后再生成');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-LunaSol-Token': CLOUD.aiToken,
    'X-CloudBase-Token': token,
  };
  if (uid) headers['X-CloudBase-Uid'] = uid;
  let r: Response;
  try {
    r = await fetch(`${CLOUD.aiBaseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw new CancelledError();
    throw e;
  }
  let j: any = null;
  try { j = await r.json(); } catch { /* 非 JSON 交由状态码兜底 */ }
  if (!r.ok) {
    const msg = j?.error?.message || `AI 服务失败 ${r.status}`;
    throw new Error(msg);
  }
  return j as T;
}

export interface StudioAIOpts {
  /** concept = 完整设计图；asset = 原生透明 PNG 素材 */
  mode: 'concept' | 'asset';
  prompt: string;
  size?: string;
  signal?: AbortSignal;
  jobId?: string;
  /** 仅用于服务端登录态门槛；扣费身份始终是 access token */
  uid?: string;
  /** 所属项目 ID，只用于素材库归档 */
  projectId?: string;
}

export interface StudioAIResult {
  jobId: string;
  dataUrl: string;
  cost: number;
  balance: number;
  model: string;
  /** 独立素材已持久化到素材库时的能力地址；失败时为空，回退 dataUrl */
  assetUrl?: string;
  assetId?: string;
}

/** 5.5 完整概念图 / 独立透明素材。扣分由服务端完成，前端只读结果里的 cost/balance。 */
export async function callStudioAI(opt: StudioAIOpts): Promise<StudioAIResult> {
  const body: Record<string, unknown> = {
    mode: opt.mode,
    prompt: opt.prompt,
    size: opt.size || (opt.mode === 'asset' ? '1024x1024' : '1024x1024'),
    jobId: opt.jobId || `${opt.mode}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    projectId: opt.projectId || '',
  };
  const j = await postAI<{
    jobId?: string; b64_json?: string; cost?: number; balance?: number; model?: string;
    assetUrl?: string; assetId?: string; error?: { message?: string };
  }>('/studio/ai', body, opt.signal, opt.uid);
  if (!j?.b64_json) throw new Error('模型没有返回图片');
  return {
    jobId: String(j.jobId || body.jobId),
    dataUrl: j.b64_json.startsWith('data:') ? j.b64_json : `data:image/png;base64,${j.b64_json}`,
    cost: Number(j.cost) || 0,
    balance: Number(j.balance) || 0,
    model: String(j.model || ''),
    assetUrl: String(j.assetUrl || ''),
    assetId: String(j.assetId || ''),
  };
}

export interface LayerSplitOpts {
  /** 要拆的完整设计图（data URL），官方限制单张 */
  image: string;
  /** 可选的拆分要求；不传由云函数用中性指令 */
  prompt?: string;
  /** 拆分层数上限，含底图；默认 16，官方 2..100 */
  maxImages?: number;
  textRecognition?: boolean;
  /** 1K / 1.5K / 2K / auto；拆分不支持具体宽高 */
  size?: string;
  signal?: AbortSignal;
  /** 幂等键：重复点击用同一个 job 不会重复扣分 */
  jobId?: string;
  /** 仅用于服务端登录态门槛；扣费身份始终是 access token */
  uid?: string;
}

/** 调官方图层拆分；原始响应交给 seedreamLayers.parseSplitResponse 校验。 */
export async function callLayerSplit(opt: LayerSplitOpts): Promise<unknown> {
  if (!opt.image || !opt.image.startsWith('data:image/')) throw new Error('请先选择一张完整设计图');
  return postAI<unknown>('/images/layer-split', {
    image: opt.image,
    prompt: opt.prompt || '',
    max_images: Math.max(2, Math.min(100, Math.round(opt.maxImages ?? 16))),
    text_recognition: opt.textRecognition !== false,
    size: opt.size || 'auto',
    jobId: opt.jobId || `ls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  }, opt.signal, opt.uid);
}
