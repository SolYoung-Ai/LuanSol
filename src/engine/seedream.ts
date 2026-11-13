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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-LunaSol-Token': CLOUD.aiToken,
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
