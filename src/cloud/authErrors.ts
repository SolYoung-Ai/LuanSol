/* ============================================================
 * 鉴权错误的「翻译层」：区分「用户该看到的」和「不该看到的」
 * ------------------------------------------------------------
 * 为什么需要这一层：
 *   CloudBase 的 Web SDK 在页面加载时会用本地 refresh token 自动恢复会话。
 *   如果这个 token 已经被别的标签页/设备轮换过，恢复就会失败并返回英文
 *   内部错误，例如：
 *     invalid refresh token. for it may be has been refreshed by other process
 *   这类消息：
 *     1) 与用户当前的操作（输入账号密码）毫无关系；
 *     2) 用户也做不了任何事（SDK 自己会重新登录）；
 *     3) 原样显示只会让人以为「登录坏了」。
 *   所以判定为「会话噪音」时直接吞掉，不进 UI。
 *
 *   其余真正需要用户处理的错误（密码错、邮箱已注册、太频繁、网络失败）
 *   统一翻译成中文，避免用户在登录框里读英文。
 *
 * 本文件不 import React，可直接被 Node 单测引用。
 * ============================================================ */

/** 会话自动恢复过程中的内部噪音：不代表用户操作失败，不该展示 */
const SESSION_NOISE = new RegExp([
  'invalid refresh token',
  'refresh token.*(invalid|expired|not found|revoked|rotated)',
  'has been refreshed by other process',
  'refresh_token_not_found',
  'jwt expired',
  'token has expired',
  'auth session missing',
  'session.*(not found|missing)',
  'not logged in',
  'no session',
].join('|'), 'i');

/** 判断是否是「本地会话恢复失败」这类可安全忽略的消息 */
export function isSessionNoise(message?: string | null): boolean {
  if (!message) return false;
  return SESSION_NOISE.test(message);
}

/** 常见 SDK 英文错误 → 用户能看懂的中文。未命中的保持原文，不做臆测。 */
const DICTIONARY: { test: RegExp; text: string }[] = [
  { test: /invalid login credentials|invalid password|wrong password|password.*incorrect|incorrect.*password/i, text: '账号或密码不正确，请检查后重试' },
  { test: /user already registered|already registered|email.*(already )?exists|duplicate/i, text: '这个邮箱已经注册过了，可以直接用密码或验证码登录' },
  { test: /email not confirmed|not verified|unverified/i, text: '邮箱还没有完成验证，请先完成邮箱验证' },
  { test: /rate limit|too many requests|too many attempts|too frequent/i, text: '操作太频繁了，请稍等一分钟再试' },
  { test: /invalid email|email.*(format|invalid)/i, text: '邮箱格式不正确，请检查后重填' },
  { test: /user not found|no user|not exist/i, text: '这个账号还没有注册，请先设置密码完成注册' },
  { test: /network|fetch failed|failed to fetch|timeout|timed out/i, text: '网络连接失败，请检查网络后重试' },
];

/**
 * 把原始错误消息转换成界面文案。
 * 返回空串表示「应当静默忽略」，调用方据此决定不展示。
 */
export function humanizeAuthError(message?: string | null, fallback = '操作失败，请稍后重试'): string {
  const m = (message || '').trim();
  if (!m) return fallback;
  if (isSessionNoise(m)) return '';
  for (const d of DICTIONARY) if (d.test.test(m)) return d.text;
  // 未识别的消息保持原样：如实反馈比编造原因更可靠
  return m;
}
