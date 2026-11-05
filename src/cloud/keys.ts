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

/** 注册与验证码只接受手机号或邮箱（CloudBase 的硬性要求） */
export function otpTarget(account: string): { key: Record<string, string>; label: string } | null {
  const a = account.trim();
  if (a.includes('@')) return { key: { email: a }, label: '邮箱' };
  const digits = a.replace(/[\s-]/g, '');
  if (/^\+?\d{7,}$/.test(digits)) {
    return { key: { phone: digits.startsWith('+') ? digits : `+86${digits}` }, label: '手机号' };
  }
  return null;
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
