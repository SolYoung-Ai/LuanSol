/* ============================================================
 * 本机档案（Local Identity）
 * ------------------------------------------------------------
 * 为什么有这个文件：LunaSol 正在从「靠 CloudBase 账号体系」退出成
 * 「纯前端工具 + 自带 AI Key」。工作台的存档本来按 ownerId 分槽，
 * 而 ownerId 原来来自登录用户的 uid。
 *
 * 这里提供一个稳定的本机身份，替代 auth.user.id：
 *   - 第一次打开生成，存在 localStorage，之后固定不变
 *   - 所有 `xxx*` 字段的语义与原来的 uid 完全一致，调用点不用改
 *   - 不联网、不上传、不涉及任何第三方
 *
 * 与登录的关系：登录仍然可用（账号页、云同步开关都还在），
 * 但工作台不再要求登录。CLOUD_SYNC=false 时两者互不干扰。
 * ============================================================ */

const LOCAL_ID_KEY = 'lunasol.local.id';

/** 本机身份标识。格式固定 `local-` 前缀 + 随机串，便于和旧的数字 uid 区分。 */
export function localIdentity(): string {
  try {
    const cur = localStorage.getItem(LOCAL_ID_KEY);
    if (cur && cur.startsWith('local-')) return cur;
    const id = 'local-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(LOCAL_ID_KEY, id);
    return id;
  } catch {
    // 隐私模式 / 存储被禁用：给一个进程内临时 id，至少本次会话可用
    return 'local-ephemeral';
  }
}

/** 显示用名称。用户可在工作台里改，仅本机保存。 */
const LOCAL_NAME_KEY = 'lunasol.local.name';

export function localName(): string {
  try { return localStorage.getItem(LOCAL_NAME_KEY) || ''; } catch { return ''; }
}

export function setLocalName(v: string) {
  try { v.trim() ? localStorage.setItem(LOCAL_NAME_KEY, v.trim()) : localStorage.removeItem(LOCAL_NAME_KEY); } catch { /* 隐私模式 */ }
}
