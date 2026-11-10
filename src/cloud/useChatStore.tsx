/* ============================================================
 * Luna 对话状态与云端同步
 * ------------------------------------------------------------
 * - 对话模型：免费用户固定 DeepSeek-V4（不能自选），会员可在页面上切换；
 * - 生图两档（flash/pro）随对话保存，由用户在输入区切换；可带比例/风格；
 * - 对话本地持久化 + 登录后云端合并，变更防抖上传，换设备/浏览器可见；
 * - 人设统一引用 engine/persona.ts，全站同一份。
 * ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Conversation, ImageTier, LunaMessage } from '../types';
import { uid } from '../engine/utils';
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
  chatModel: string;
  /** 空白草稿状态下选择的生图档位（会话还没创建时使用） */
  draftTier: ImageTier;
  newConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => void;
  setTier: (tier: ImageTier) => void;
  setChatModel: (m: string) => void;
  sendText: (text: string, image?: string) => Promise<void>;
  /** 生图。传了 prompt 就用它（图像生成模式）；不传则沿用对话上下文拼提示词。 */
  generateImage: (prompt?: string, opts?: { size?: string; style?: string; reference?: string }) => Promise<void>;
}

/** 对话大模型列表（前端模型名，云函数 ALLOWED_MODELS 白名单对应） */
export const CHAT_MODELS = [
  { id: 'deepseek-chat', label: 'DeepSeek-V4' },
  { id: 'deepseek-reasoner', label: 'DeepSeek-R1 思考' },
  { id: 'kimi-k3.1', label: 'Kimi-K3.1-Pro' },
  { id: 'doubao-seed-lite', label: 'Doubao-Seed-2.1-lite' },
  { id: 'doubao-seed-turbo', label: 'Doubao-Seed-2.1-turbo' },
  { id: 'glm-5.3', label: 'GLM-5.3-Flash' },
] as const;
const CHAT_MODEL_KEY = 'lunasol.chatModel';
/** 免费用户唯一可用的对话模型：DeepSeek-V4（不自选） */
const FREE_CHAT_MODEL = 'deepseek-chat';
function loadChatModel(): string {
  try { return localStorage.getItem(CHAT_MODEL_KEY) || FREE_CHAT_MODEL; } catch { return FREE_CHAT_MODEL; }
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

/** 「聊过才算对话」：一条消息都没有的空壳不进入列表、不落盘、不上传云端。
 *  历史版本（点一下新建就插入一条空记录）留下的空壳靠这里一次性清掉。 */
const isRealConversation = (c: Conversation) => Array.isArray(c.messages) && c.messages.length > 0;

const tierCost = (tier: ImageTier) =>
  tier === 'flash' ? PRICING.costs.imageFlash : PRICING.costs.imagePro;

const tierLabel = (tier: ImageTier) =>
  tier === 'flash' ? 'Flash' : 'Pro';

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
  const [draftTier, setDraftTier] = useState<ImageTier>('flash');
  const [chatModel, setChatModelState] = useState<string>(loadChatModel);
  const setChatModel = useCallback((m: string) => {
    setChatModelState(m);
    try { localStorage.setItem(CHAT_MODEL_KEY, m); } catch { /* ignore */ }
  }, []);

  /** 实际生效的对话模型：免费用户固定 DeepSeek-V4，只有会员才能自选。
   *  这里做最终裁决，避免本地存储里残留会员时期选过的模型又被免费用户用上。 */
  const activeChatModel = sub.isPro ? chatModel : FREE_CHAT_MODEL;

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
        // 旧数据里可能有「点过新建但一句话没说」的空壳，读入时直接丢掉
        const list = Array.isArray(p.conversations) ? p.conversations.filter(isRealConversation) : [];
        if (list.length) setConversations(list);
        if (p.activeId && list.some((c) => c.id === p.activeId)) setActiveId(p.activeId);
      }
    } catch { /* 本地数据损坏时忽略，从空开始 */ }
    setBooted(true);
  }, []);

  /* --------------------------- 本地持久化 --------------------------- */
  useEffect(() => {
    if (!booted) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ conversations: conversations.filter(isRealConversation), activeId }));
    } catch { /* 配额不足（大图 base64）时忽略，云端仍有完整数据 */ }
  }, [conversations, activeId, booted]);

  const updateConv = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  /* --------------------------- 登录后云端合并 --------------------------- */
  useEffect(() => {
    if (!user) { mergedFor.current = null; return; }
    // 对话云端同步同样是会员权益：免费用户只在本机 localStorage 保存
    if (!sub.isPro) {
      mergedFor.current = null;
      setSyncState('off');
      setSyncMessage('对话保存在本机；跨设备同步为会员权益');
      return;
    }
    if (mergedFor.current === user.id) return;
    mergedFor.current = user.id;
    void (async () => {
      setSyncState('syncing');
      setSyncMessage('正在从云端取回对话…');
      const r = await pullAllConversations();
      if (r.ok) {
        // 云端可能还留着旧版本产生的空壳：只合并真正聊过的，其余顺手删掉
        const real = r.data.filter(isRealConversation);
        const junk = r.data.filter((c) => !isRealConversation(c));
        setConversations((prev) => mergeConversations(prev, real));
        real.forEach((c) => { lastPushed.current[c.id] = c.updatedAt; });
        junk.forEach((c) => { void removeConversation(user.id, c.id); });
        setSyncState('ok');
        setSyncMessage(`已从云端取回 ${real.length} 个对话`);
      } else {
        setSyncState('error');
        setSyncMessage(r.message);
      }
    })();
  }, [user, sub.isPro]);

  /* --------------------------- 变更防抖上传 --------------------------- */
  useEffect(() => {
    if (!user || !sub.isPro || !canSyncChats(user.id)) return;
    const dirty = conversations.filter((c) => isRealConversation(c) && c.updatedAt > (lastPushed.current[c.id] ?? 0));
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
  }, [conversations, user, sub.isPro]);

  /* ------------------------------- 新建 ------------------------------- */
  /** 「新建对话」只是回到一张空白草稿：不立刻建记录。
   *  以前这里会插一条 messages 为空的会话，导致每点一次（以及每次进入页面）
   *  就多出一条「新对话」空壳。现在只有发出第一条消息时才真正创建。 */
  const newConversation = useCallback((): string => {
    setActiveId(null);
    setDraftTier('flash');
    return '';
  }, []);

  const selectConversation = useCallback((id: string) => setActiveId(id), []);

  /* ------------------------------- 删除 ------------------------------- */
  const deleteConversation = useCallback(async (id: string) => {
    if (user) {
      const r = await removeConversation(user.id, id);
      if (!r.ok) setToast(r.message);
    }
    delete lastPushed.current[id];
    // 不要在 setConversations 的 updater 里再调 setState：updater 会在渲染阶段执行，
    // 期间更新另一个 state 会触发 React 的 "Cannot update a component while rendering" 警告。
    const rest = conversationsRef.current.filter((c) => c.id !== id);
    setConversations(rest);
    setActiveId((cur) => (cur === id ? (rest[0]?.id || null) : cur));
  }, [user, setToast]);

  /* ------------------------------- 重命名 ------------------------------- */
  const renameConversation = useCallback((id: string, title: string) => {
    updateConv(id, (c) => ({ ...c, title, updatedAt: Date.now() }));
  }, [updateConv]);

  /* ----------------------------- 切换生图档 ----------------------------- */
  const setTier = useCallback((tier: ImageTier) => {
    // 还没开始对话时只记在草稿上，等发出第一条消息时带进新会话
    if (!activeId) { setDraftTier(tier); return; }
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
        title: text ? text.slice(0, 24) : '图片对话',
        messages: [],
        imageTier: draftTier,
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
      const ai = { ...loadAI(), textModel: activeChatModel, cloudbaseUid: user?.id || '' };
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
  }, [activeId, updateConv, user, activeChatModel, draftTier]);

  /* ----------------------------- 生成图片 ----------------------------- */
  /** 两条入口：
   *  1) 图像生成模式：用户自己写了画面描述 → 直接按描述出图（不进大模型）；
   *  2) 对话模式里点生图：没有输入，用最近几轮对话内容拼提示词。
   *  两者都写进同一个会话，图片与对话同一份历史。 */
  const generateImage = useCallback(async (
    promptRaw?: string,
    opts?: { size?: string; style?: string; reference?: string },
  ) => {
    if (busyRef.current) return;
    const typed = (promptRaw || '').trim();
    let convId = activeId;
    let target = convId ? conversationsRef.current.find((c) => c.id === convId) : null;

    // 先算积分再落消息：余额不够时不应该在历史里留下一条「说了但没画」的孤立气泡
    const tierForCheck: ImageTier = target?.imageTier || draftTier;
    const cost = tierCost(tierForCheck);
    const balance = sub.usedLeft ?? 0;
    if (balance < cost) {
      // 不在这里强行跳订阅页：跳转会卸载页面，用户写好的描述会一起丢掉。
      // 只提示原因，让用户自己决定去签到 / 兑换 / 继续聊。
      setToast(`积分不足：${tierLabel(tierForCheck)} 生图需要 ${cost} 积分，当前余额 ${balance}。可在「积分与充值」签到或兑换后再试。`);
      return;
    }

    if (!typed && (!target || !target.messages.length || !convId)) {
      setToast('先描述一下你想要的画面，或者和 Luna 聊两句再让它画。');
      return;
    }

    if (typed) {
      // 用户这句就是「画面描述」：先落一条用户消息，再出图
      if (!target || !convId) {
        convId = uid('conv');
        const now0 = Date.now();
        target = {
          id: convId,
          title: typed.slice(0, 24),
          messages: [],
          imageTier: draftTier,
          createdAt: now0,
          updatedAt: now0,
        };
        setConversations((prev) => [target as Conversation, ...prev]);
        setActiveId(convId);
      }
      const userMsg: LunaMessage = {
        id: uid('msg'), role: 'user', content: typed,
        ...(opts?.reference ? { image: opts.reference } : {}),
        at: Date.now(),
      };
      const isFirst = target.messages.length === 0;
      updateConv(convId, (c) => ({
        ...c,
        messages: [...c.messages, userMsg],
        title: isFirst ? typed.slice(0, 24) : c.title,
        updatedAt: Date.now(),
      }));
      target = { ...target, messages: [...target.messages, userMsg] };
    }

    // 走到这里 target / convId 一定有了（上面两个分支已经兜过空会话）
    if (!target || !convId) return;
    const conv = target;
    const id: string = convId;
    // 旧会话可能没有 imageTier（早期数据），缺省时必须和界面显示保持同一档，
    // 否则会出现「界面写 6 积分、实际按 10 积分扣」的错账。
    const tier: ImageTier = conv.imageTier || draftTier;

    setBusy(true);
    try {
      const prompt = typed
        ? `${opts?.style || ''}${typed}`
        : buildImagePrompt(conv);
      const lastUserImage = opts?.reference
        || [...conv.messages].reverse().find((m) => m.role === 'user' && m.image)?.image;
      const url = await callSeedream(prompt, {
        tier,
        referenceImage: lastUserImage,
        uid: user?.id,
        size: opts?.size,
      });
      if (user) {
        await recordUsage(user.id, cost, 'image');
        await sub.refresh();
      }
      const imgMsg: LunaMessage = {
        id: uid('msg'), role: 'assistant',
        content: typed ? '' : `画好啦，这一版用的是 ${tierLabel(tier)}，看看感觉对不对，不对我再调：`,
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
  }, [activeId, user, sub, setToast, updateConv, draftTier]);

  const active = conversations.find((c) => c.id === activeId) || null;

  return {
    conversations, activeId, active, busy, syncState, syncMessage, booted,
    chatModel: activeChatModel, draftTier,
    newConversation, selectConversation, deleteConversation, renameConversation,
    setTier, setChatModel, sendText, generateImage,
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
