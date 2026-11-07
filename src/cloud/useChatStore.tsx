/* ============================================================
 * Luna 对话状态与云端同步
 * ------------------------------------------------------------
 * - 对话模型固定 DeepSeek（deepseek-reasoner，带思考过程），不提供选择；
 * - 生图三档（flash/lite/pro）随对话保存，由用户在输入区切换；
 * - 对话本地持久化 + 登录后云端合并，变更防抖上传，换设备/浏览器可见；
 * - 人设统一引用 engine/persona.ts，全站同一份。
 * ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Conversation, ImageTier, LunaMessage } from '../types';
import { uid } from '../engine/utils';
import { go } from '../ui';
import { useApp } from '../store';
import { useAuth } from './auth';
import { loadAI, llmChatWithReasoning } from '../engine/llm';
import { callSeedream } from '../engine/seedream';
import { LUNA_PERSONA_PROMPT } from '../engine/persona';
import { recordUsage, useSubscription } from './subscription';
import { PRICING } from './plans';
import { canSyncChats, pullAllConversations, pushConversation, removeConversation } from './chats';

const LS_KEY = 'lunasol.chats.v1';

export type ChatSyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'error';

interface ChatStore {
  conversations: Conversation[];
  activeId: string | null;
  active: Conversation | null;
  busy: boolean;
  syncState: ChatSyncState;
  syncMessage: string;
  booted: boolean;
  newConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => void;
  setTier: (tier: ImageTier) => void;
  sendText: (text: string, image?: string) => Promise<void>;
  generateImage: () => Promise<void>;
}

/** 按 id 合并两组对话：同 id 取 updatedAt 更新的一方，最后按更新时间倒序。 */
function mergeConversations(local: Conversation[], cloud: Conversation[]): Conversation[] {
  const map = new Map<string, Conversation>();
  for (const c of local) map.set(c.id, c);
  for (const cc of cloud) {
    const ex = map.get(cc.id);
    if (!ex || cc.updatedAt > ex.updatedAt) map.set(cc.id, cc);
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

const tierCost = (tier: ImageTier) =>
  tier === 'flash' ? PRICING.costs.imageFlash : tier === 'lite' ? PRICING.costs.imageLite : PRICING.costs.imagePro;

const tierLabel = (tier: ImageTier) =>
  tier === 'flash' ? 'Flash' : tier === 'lite' ? 'Lite' : 'Pro';

/** 基于对话上下文构造生图提示词。 */
function buildImagePrompt(c: Conversation): string {
  const userTexts = c.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .filter((t) => t && !t.includes('（参考图）'))
    .slice(-4);
  return [
    '高品质包装设计效果图，商业摄影风格，柔光，干净背景，',
    userTexts.join('，'),
    '，真实感，高清，专业包装样机，正面视角，影棚灯光。',
  ].join('');
}

function useChatStoreState(): ChatStore {
  const { user } = useAuth();
  const sub = useSubscription();
  const { setToast } = useApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncState, setSyncState] = useState<ChatSyncState>('off');
  const [syncMessage, setSyncMessage] = useState('');
  const [booted, setBooted] = useState(false);

  const conversationsRef = useRef<Conversation[]>(conversations);
  conversationsRef.current = conversations;
  const busyRef = useRef(false);
  busyRef.current = busy;
  const mergedFor = useRef<string | null>(null);
  const lastPushed = useRef<Record<string, number>>({});

  /* --------------------------- 初始化：读本地 --------------------------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { conversations?: Conversation[]; activeId?: string };
        if (Array.isArray(p.conversations)) setConversations(p.conversations);
        if (p.activeId) setActiveId(p.activeId);
      }
    } catch { /* 本地数据损坏时忽略，从空开始 */ }
    setBooted(true);
  }, []);

  /* --------------------------- 本地持久化 --------------------------- */
  useEffect(() => {
    if (!booted) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ conversations, activeId }));
    } catch { /* 配额不足（大图 base64）时忽略，云端仍有完整数据 */ }
  }, [conversations, activeId, booted]);

  const updateConv = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  /* --------------------------- 登录后云端合并 --------------------------- */
  useEffect(() => {
    if (!user) { mergedFor.current = null; return; }
    if (mergedFor.current === user.id) return;
    mergedFor.current = user.id;
    void (async () => {
      setSyncState('syncing');
      setSyncMessage('正在从云端取回对话…');
      const r = await pullAllConversations();
      if (r.ok) {
        setConversations((prev) => mergeConversations(prev, r.data));
        r.data.forEach((c) => { lastPushed.current[c.id] = c.updatedAt; });
        setSyncState('ok');
        setSyncMessage(`已从云端取回 ${r.data.length} 个对话`);
      } else {
        setSyncState('error');
        setSyncMessage(r.message);
      }
    })();
  }, [user]);

  /* --------------------------- 变更防抖上传 --------------------------- */
  useEffect(() => {
    if (!user || !canSyncChats(user.id)) return;
    const dirty = conversations.filter((c) => c.updatedAt > (lastPushed.current[c.id] ?? 0));
    if (!dirty.length) return;
    const t = window.setTimeout(async () => {
      setSyncState('syncing');
      let failed = false;
      for (const c of dirty) {
        const r = await pushConversation(user.id, c);
        if (r.ok) lastPushed.current[c.id] = c.updatedAt;
        else { failed = true; setSyncMessage(r.message); }
      }
      if (failed) setSyncState('error');
      else { setSyncState('ok'); setSyncMessage('对话已同步到云端'); }
    }, 1500);
    return () => window.clearTimeout(t);
  }, [conversations, user]);

  /* ------------------------------- 新建 ------------------------------- */
  const newConversation = useCallback((): string => {
    const now = Date.now();
    const c: Conversation = {
      id: uid('conv'),
      title: '新对话',
      messages: [],
      imageTier: 'flash',
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    return c.id;
  }, []);

  const selectConversation = useCallback((id: string) => setActiveId(id), []);

  /* ------------------------------- 删除 ------------------------------- */
  const deleteConversation = useCallback(async (id: string) => {
    if (user) {
      const r = await removeConversation(user.id, id);
      if (!r.ok) setToast(r.message);
    }
    delete lastPushed.current[id];
    setConversations((prev) => {
      const rest = prev.filter((c) => c.id !== id);
      setActiveId((cur) => (cur === id ? (rest[0]?.id || null) : cur));
      return rest;
    });
  }, [user, setToast]);

  /* ------------------------------- 重命名 ------------------------------- */
  const renameConversation = useCallback((id: string, title: string) => {
    updateConv(id, (c) => ({ ...c, title, updatedAt: Date.now() }));
  }, [updateConv]);

  /* ----------------------------- 切换生图档 ----------------------------- */
  const setTier = useCallback((tier: ImageTier) => {
    if (!activeId) return;
    updateConv(activeId, (c) => ({ ...c, imageTier: tier, updatedAt: Date.now() }));
  }, [activeId, updateConv]);

  /* ----------------------------- 发送文本 ----------------------------- */
  const sendText = useCallback(async (textRaw: string, image?: string) => {
    const text = textRaw.trim();
    if ((!text && !image) || busyRef.current) return;

    let convId = activeId;
    let target = convId ? conversationsRef.current.find((c) => c.id === convId) : null;
    if (!target || !convId) {
      convId = uid('conv');
      const now0 = Date.now();
      target = {
        id: convId,
        title: text ? text.slice(0, 24) : '新对话',
        messages: [],
        imageTier: 'flash',
        createdAt: now0,
        updatedAt: now0,
      };
      setConversations((prev) => [target as Conversation, ...prev]);
      setActiveId(convId);
    }
    const conv = target;
    const isFirst = conv.messages.length === 0;
    const userMsg: LunaMessage = {
      id: uid('msg'),
      role: 'user',
      content: text || (image ? '（参考图）' : ''),
      ...(image ? { image } : {}),
      at: Date.now(),
    };
    const withUser = [...conv.messages, userMsg];
    updateConv(convId, (c) => ({
      ...c,
      messages: [...c.messages, userMsg],
      title: isFirst && text ? text.slice(0, 24) : c.title,
      updatedAt: Date.now(),
    }));

    setBusy(true);
    try {
      const ai = { ...loadAI(), textModel: 'deepseek-reasoner', cloudbaseUid: user?.id || '' };
      const llmMessages = [
        {
          role: 'system' as const,
          content: LUNA_PERSONA_PROMPT +
            (image ? '\n（用户刚上传了一张参考图，请在回复中提及你已收到，并询问这是产品图还是对标参考。）' : ''),
        },
        ...withUser.map((m) => ({
          role: m.role,
          content: m.image && m.content === '（参考图）' ? '[用户附带了一张图片]' : m.content,
        })),
      ];
      const r = await llmChatWithReasoning(llmMessages, ai);
      const aiMsg: LunaMessage = {
        id: uid('msg'),
        role: 'assistant',
        content: r.content,
        ...(r.reasoning ? { reasoning: r.reasoning } : {}),
        at: Date.now(),
      };
      updateConv(convId, (c) => ({ ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() }));
    } catch (e) {
      const em = (e as Error).message || 'AI 暂时连不上';
      const errMsg: LunaMessage = {
        id: uid('msg'), role: 'assistant',
        content: `抱歉，${em}。请稍后再试，或者换个说法。`,
        at: Date.now(), error: true,
      };
      updateConv(convId, (c) => ({ ...c, messages: [...c.messages, errMsg], updatedAt: Date.now() }));
    } finally {
      setBusy(false);
    }
  }, [activeId, updateConv, user]);

  /* ----------------------------- 生成图片 ----------------------------- */
  const generateImage = useCallback(async () => {
    if (busyRef.current) return;
    const convId = activeId;
    const target = convId ? conversationsRef.current.find((c) => c.id === convId) : null;
    if (!target || !target.messages.length || !convId) {
      setToast('先和 Luna 聊一聊你的产品和想法，我才好照着画出来。');
      return;
    }
    const id: string = convId;
    const tier = target.imageTier;
    const cost = tierCost(tier);
    const balance = sub.usedLeft ?? 0;
    if (balance < cost) {
      setToast(`积分不足：${tierLabel(tier)} 生图需要 ${cost} 积分，当前余额 ${balance}。`);
      go('/subscribe');
      return;
    }

    setBusy(true);
    try {
      const prompt = buildImagePrompt(target);
      const lastUserImage = [...target.messages].reverse().find((m) => m.role === 'user' && m.image)?.image;
      const url = await callSeedream(prompt, { tier, referenceImage: lastUserImage, uid: user?.id });
      if (user) {
        await recordUsage(user.id, cost, 'image');
        await sub.refresh();
      }
      const imgMsg: LunaMessage = {
        id: uid('msg'), role: 'assistant',
        content: `画好啦，这一版用的是 ${tierLabel(tier)}，看看感觉对不对，不对我再调：`,
        image: url, imageTier: tier, at: Date.now(),
      };
      updateConv(id, (c) => ({ ...c, messages: [...c.messages, imgMsg], updatedAt: Date.now() }));
    } catch (e) {
      const em = (e as Error).message || '图像生成失败';
      const errMsg: LunaMessage = {
        id: uid('msg'), role: 'assistant',
        content: `生图失败：${em}`, at: Date.now(), error: true,
      };
      updateConv(id, (c) => ({ ...c, messages: [...c.messages, errMsg], updatedAt: Date.now() }));
    } finally {
      setBusy(false);
    }
  }, [activeId, user, sub, setToast, updateConv]);

  const active = conversations.find((c) => c.id === activeId) || null;

  return {
    conversations, activeId, active, busy, syncState, syncMessage, booted,
    newConversation, selectConversation, deleteConversation, renameConversation,
    setTier, sendText, generateImage,
  };
}

const ChatCtx = createContext<ChatStore | null>(null);

export function ChatStoreProvider({ children }: { children: React.ReactNode }) {
  const v = useChatStoreState();
  return <ChatCtx.Provider value={v}>{children}</ChatCtx.Provider>;
}

export function useChatStore(): ChatStore {
  const c = useContext(ChatCtx);
  if (!c) throw new Error('ChatStoreProvider missing');
  return c;
}
