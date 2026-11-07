/* ============================================================
 * 用户对话云同步（CloudBase PostgreSQL + RLS）
 * ------------------------------------------------------------
 * 表结构见 cloudbase/migrations/*_lunasol_chat_conversations.sql：
 *   id / owner_id / title / payload(jsonb) / updated_at
 * 对话（含消息、思考过程、生图档位）整体存 payload，换设备/浏览器
 * 登录后完整可见。RLS 用 auth.uid() 比对 owner_id，越权读写会被拒绝。
 * ============================================================ */
import type { Conversation } from '../types';
import { db, sdkUsable } from './sdk';
import { rowId } from './keys';

export interface ChatCloudMeta {
  id: string;
  title: string;
  updated_at: string;
}

interface ChatCloudRow extends ChatCloudMeta {
  owner_id: string;
  payload: Conversation;
}

export type ChatCloudResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const TABLE = 'lunasol_chat_conversations';
const fail = (message: string): ChatCloudResult<never> => ({ ok: false, message });

function errText(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message;
  if (m) return String(m);
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

/** 登录态是否具备云同步能力（配置齐全且已登录） */
export function canSyncChats(uid?: string | null): boolean {
  return Boolean(uid && sdkUsable());
}

/* ------------------------------- 写入 ------------------------------- */
export async function pushConversation(uid: string, conv: Conversation): Promise<ChatCloudResult> {
  const d = await db();
  if (!d) return fail('云服务未配置，无法同步');
  if (!uid) return fail('尚未登录，无法同步到云端');
  const row = {
    id: rowId(uid, conv.id),
    owner_id: uid,
    title: conv.title || '新对话',
    payload: conv as unknown as Record<string, unknown>,
    updated_at: new Date(conv.updatedAt || Date.now()).toISOString(),
  };
  try {
    const w = await d.from(TABLE).upsert(row, { onConflict: 'id' });
    if (w.error) return fail(`写入失败：${errText(w.error)}`);
    // 回读确认真的落库
    const back = await d.from(TABLE).select('id,title,updated_at').eq('id', rowId(uid, conv.id)).limit(1);
    if (back.error) return fail(`回读失败：${errText(back.error)}`);
    const rows = (back.data || []) as ChatCloudMeta[];
    if (!rows.length) return fail('写入未生效：云端没有读回这条对话');
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(errText(e) || '同步请求异常');
  }
}

/* ------------------------------- 读取 ------------------------------- */
export async function pullAllConversations(): Promise<ChatCloudResult<Conversation[]>> {
  const d = await db();
  if (!d) return fail('云服务未配置');
  try {
    const r = await d.from(TABLE).select('*').order('updated_at', { ascending: false }).limit(200);
    if (!r) return { ok: true, data: [] };
    if (r.error) return fail(`读取失败：${errText(r.error)}`);
    const rows = (r.data || []) as ChatCloudRow[];
    const out: Conversation[] = [];
    for (const row of rows) {
      if (row.payload && typeof row.payload === 'object' && row.payload.id && Array.isArray(row.payload.messages)) {
        out.push(row.payload);
      }
    }
    return { ok: true, data: out };
  } catch (e) {
    return fail(errText(e) || '读取请求异常');
  }
}

/* ------------------------------- 删除 ------------------------------- */
export async function removeConversation(uid: string, convId: string): Promise<ChatCloudResult> {
  const d = await db();
  if (!d) return fail('云服务未配置');
  try {
    // 云端行主键是「uid:本地id」，必须用 rowId 拼全，否则匹配不到、删除静默落空
    const r = await d.from(TABLE).delete().eq('id', rowId(uid, convId));
    if (r.error) return fail(`删除失败：${errText(r.error)}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(errText(e) || '删除请求异常');
  }
}
