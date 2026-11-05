/* ============================================================
 * LunaSol × CloudBase 国内站：公开配置
 * ------------------------------------------------------------
 * 这里的值全部是可以随前端代码一起发布的公开参数：
 *   - envId / region / publishableKey：CloudBase Web SDK 初始化所需；
 *   - aiBaseUrl / aiToken：自建后台代理的网关地址与访问令牌。
 * 厂商模型密钥（DEEPSEEK_API_KEY）只在云函数环境变量里，绝不出现在这里。
 * ============================================================ */
/** Node 测试环境没有 import.meta.env，这里做一次兜底，避免测试挂掉 */
const env: Record<string, string> =
  ((import.meta as unknown as { env?: Record<string, string> }).env) || {};

export const CLOUD = {
  envId: (env.VITE_CLOUDBASE_ENV_ID || '').trim(),
  region: (env.VITE_CLOUDBASE_REGION || 'ap-shanghai').trim(),
  publishableKey: (env.VITE_CLOUDBASE_PUBLISHABLE_KEY || '').trim(),
  aiBaseUrl: (env.VITE_LUNASOL_AI_BASE_URL || '').trim().replace(/\/+$/, ''),
  aiToken: (env.VITE_LUNASOL_AI_TOKEN || '').trim(),
} as const;

/** 只有三个值齐全才初始化 SDK；缺配置时保持本地优先，不假装已连上云。 */
export const cloudConfigured = Boolean(CLOUD.envId && CLOUD.publishableKey && CLOUD.region);

/** 正式站点（CloudBase 国内站静态托管），其来源已在 CloudBase 安全域名白名单内。 */
export const CLOUD_SITE_URL = 'https://solyoung-d4gpp1f7s4e075f6d-1499756427.tcloudbaseapp.com/';

/** 当前套餐无法通过 API 追加安全域名（CreateAuthDomain 返回「当前套餐无法执行此操作」），
 *  CloudBase 认证接口只对白名单来源放行。实测：
 *    https://<env>-xxx.tcloudbaseapp.com → 204 + allow-origin（可用）
 *    https://solyoung-ai.github.io       → 403（被拒）
 *  因此 GitHub Pages 镜像页只提供本地保存 + 后台 AI，登录/云同步引导到正式站点，
 *  绝不静默降级成本地假登录。 */
export function cloudOriginSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return true;
  if (h.endsWith('.tcloudbaseapp.com') || h.endsWith('.webapps.tcloudbase.com') || h.endsWith('.preview.cloudbase.net')) return true;
  return false;
}

/** DeepSeek 后台代理 preset：切到 proxy 模式，模型名留空由后台决定。 */
export function deepSeekPreset() {
  return {
    mode: 'proxy' as const,
    baseUrl: CLOUD.aiBaseUrl,
    proxyToken: CLOUD.aiToken,
    apiKey: '',
    textModel: '',
    imageModel: '',
    imageEnabled: false,
  };
}

export const deepSeekReady = Boolean(CLOUD.aiBaseUrl && CLOUD.aiToken);
