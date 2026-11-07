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
  // 本地 dev 走 Vite 代理（相对路径，规避 CORS）；生产构建用完整云函数地址。
  aiBaseUrl: env.DEV
    ? '/lunasol-ai'
    : (env.VITE_LUNASOL_AI_BASE_URL || '').trim().replace(/\/+$/, ''),
  aiToken: (env.VITE_LUNASOL_AI_TOKEN || '').trim(),
} as const;

/** 只有三个值齐全才初始化 SDK；缺配置时保持本地优先，不假装已连上云。 */
export const cloudConfigured = Boolean(CLOUD.envId && CLOUD.publishableKey && CLOUD.region);

/** 正式站点（CloudBase 国内站静态托管，已绑定自定义域名 luna.solyoung.top）。该域名已在
 *  CloudBase Web 安全域名白名单内，所以在这里登录与云同步都可用，且没有默认测试域名的
 *  「风险提醒」页。 */
export const CLOUD_SITE_URL = 'https://luna.solyoung.top/';

/** 哪些来源可以走 CloudBase 登录 / 云同步：
 *    - localhost / 127.0.0.1        ：本地开发
 *    - luna.solyoung.top            ：正式站点（已绑定自定义域名 + 加入安全域名白名单）
 *    - *.tcloudbaseapp.com 等        ：CloudBase 默认测试域名（可用，但首屏有「风险提醒」）
 *  GitHub Pages 镜像（solyoung-ai.github.io）不在此列：体验版无法追加安全域名，
 *  登录请求会被浏览器跨域拦截；但它仍可作「设计 + AI + 本机保存」的镜像入口。
 *  绝不把被拦截的来源静默降级成本地假登录。 */
export function cloudOriginSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return true;
  if (h === 'luna.solyoung.top') return true;
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
