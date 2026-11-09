/* ============================================================
 * 云账号与云同步的纯函数键规则（不依赖浏览器，便于单元测试）
 * ============================================================ */

/** 账号输入归一化：邮箱、手机号、用户名分别用不同字段提交给 CloudBase */
export function accountKey(account: string): Record<string, string> {
  const a = account.trim();
  if (a.includes('@')) return { email: a };
  if (/^\+?\d[\d-]{6,}$/.test(a)) return { phone: a.startsWith('+') ? a : `+86${a}` };
  return { username: a };
}

/** 注册与验证码只接受手机号或邮箱（CloudBase 的硬性要求）。
 *  ⚠️ 登录链路自 2026-11-09 起已停用此函数：控制台关闭了短信验证码，
 *  任何 phone 参数都可能触发短信计费或服务端报错。新代码一律用 emailTarget()。
 *  保留此函数仅为兼容旧测试与「读取历史账号格式」的纯数据用途。 */
export function otpTarget(account: string): { key: Record<string, string>; label: string } | null {
  const a = account.trim();
  if (a.includes('@')) return { key: { email: a }, label: '邮箱' };
  const digits = a.replace(/[\s-]/g, '');
  if (/^\+?\d{7,}$/.test(digits)) {
    return { key: { phone: digits.startsWith('+') ? digits : `+86${digits}` }, label: '手机号' };
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 纯邮箱校验（可用于 UI 即时提示，不依赖浏览器）。 */
export function isEmail(account: string): boolean {
  return EMAIL_RE.test(account.trim());
}

/** 当前登录链路唯一允许的验证码目标：邮箱。
 *  手机号、用户名、国际号码一律返回 null —— 从数据层杜绝短信发送，
 *  即使将来有别的 UI 误调用 startCodeLogin 也不会产生短信费用。 */
export function emailTarget(account: string): { key: { email: string }; label: '邮箱' } | null {
  const a = account.trim();
  return EMAIL_RE.test(a) ? { key: { email: a }, label: '邮箱' } : null;
}

/** 云端行主键：带上账号，换账号登录时不会撞上别人的行 */
export const rowId = (uid: string, projectId: string) => `${uid}:${projectId}`;

/** 从行主键里取回本地项目 ID */
export const projectIdOf = (id: string) => {
  const i = id.indexOf(':');
  return i > 0 ? id.slice(i + 1) : id;
};

/** 本机项目是否属于当前账号（未认领的草稿可以带入第一个登录的账号） */
export const ownsProject = (owner: string | undefined | null, uid: string | null) =>
  Boolean(uid) && (!owner || owner === uid);
