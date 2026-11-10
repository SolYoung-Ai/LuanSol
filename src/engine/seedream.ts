/* ============================================================
 * Seedream 生图调用（经云函数代理，前端不持有厂商密钥）
 * ------------------------------------------------------------
 * 两档 tier（flash/pro）由云函数映射到方舟真实模型，
 * 云函数统一把结果转成 base64 返回，规避前端跨域。
 * ============================================================ */
import { CLOUD } from '../cloud/config';
import type { ImageTier } from '../types';

export async function callSeedream(prompt: string, opts: {
  tier: ImageTier;
  referenceImage?: string;
  uid?: string;
  /** 出图尺寸（对应界面的「比例」），不传时用 1024x1024 */
  size?: string;
}): Promise<string> {
  if (!CLOUD.aiBaseUrl || !CLOUD.aiToken) throw new Error('图像服务未配置');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-LunaSol-Token': CLOUD.aiToken,
  };
  if (opts.uid) headers['X-CloudBase-Uid'] = opts.uid;
  const r = await fetch(`${CLOUD.aiBaseUrl}/images/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      size: opts.size || '1024x1024',
      model: opts.tier,
      ...(opts.referenceImage ? { image: opts.referenceImage } : {}),
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `图像生成失败 ${r.status}`);
  const item = j.data && j.data[0];
  const url = item && (item.url || item.b64_json);
  if (!url) throw new Error('图像未返回');
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http')) return url;
  return `data:image/png;base64,${url}`;
}
