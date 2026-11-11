/* ============================================================
 * Luna 对话状态与云端同步
 * ------------------------------------------------------------
 * - 对话模型：默认 DeepSeek-V4.1-Flash（人人可用）；其余 6 款为会员专属，
 *   并共用「每人每天 ¥1」的语言模型额度（目录与价格见 cloud/chatModels.ts）；
 * - 生图档位随对话保存（Seedream Flash/Pro、GPT Image 2 文字/输入图），由用户在输入区切换；
 * - 对话本地持久化 + 登录后云端合并，变更防抖上传，换设备/浏览器可见；
 * - 人设统一引用 engine/persona.ts，全站同一份。
 * ============================================================ */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Conversation, ImageTier, LunaMessage } from '../types';
import { uid } from '../engine/utils';
import { useApp } from '../store';
import { useAuth } from './auth';
import { loadAI, llmChatWithReasoning } from '../engine/llm';
import { isCancelled } from '../engine/cancel';
import { callImage } from '../engine/seedream';
import { imageCost, imageShort, isProOnlyTier, resolveTier } from './models';
import {
  CHAT_DAILY_BUDGET_RMB, CHAT_MODELS, FREE_CHAT_MODEL, chatModel as findChatModel,
} from './chatModels';
import { addChatSpend, loadChatSpend } from './chatSpend';
import { LUNA_PERSONA_PROMPT } from '../engine/persona';
import { recordUsage, useSubscription } from './subscription';
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
  /** 今日语言模型已花费（元）；null = 还在统计 / 非计量来源 */
  chatSpendRmb: number | null;
  /** 每人每天的额度上限（元） */
  chatBudgetRmb: number;
  /** 今日额度是否已用完：用完时会员专属模型不可选，自动退回默认模型 */
  chatQuotaUsedUp: boolean;
  /** 重新拉取今日额度（登录后 / 每轮对话后 / 打开模型菜单时） */
  refreshChatSpend: () => Promise<void>;
  newConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => void;
  setTier: (tier: ImageTier) => void;
  setChatModel: (m: string) => void;
  /** 取消正在进行的对话 / 生图：断开请求、不扣积分 */
  cancel: () => void;
  /** 生图预备期的剩余秒数（3 → 2 → 1）；0 表示不在预备期。
   *  只有这 3 秒内能取消：过了就真的开始调厂商接口了。 */
  preflight: number;
  sendText: (text: string, image?: string) => Promise<void>;
  /** 生图。传了 prompt 就用它（图像生成模式）；不传则沿用对话上下文拼提示词。 */
  generateImage: (prompt?: string, opts?: { size?: string; style?: string; reference?: string }) => Promise<void>;
}

/** 对话模型目录从 cloud/chatModels.ts 透出，保持既有 import 路径可用 */
export { CHAT_MODELS, FREE_CHAT_MODEL, CHAT_DAILY_BUDGET_RMB };

const CHAT_MODEL_KEY = 'lunasol.chatModel';

/** 读本地选择：老版本存的是 'deepseek-chat' 之类，chatModel() 会映射到新档位；
 *  映射后仍然落不到目录里的（比如已下线的档位）一律回到默认模型。 */
function loadChatModel(): string {
  try {
    const raw = localStorage.getItem(CHAT_MODEL_KEY) || '';
    if (!raw) return FREE_CHAT_MODEL;
    return findChatModel(raw).id;
  } catch { return FREE_CHAT_MODEL; }
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

// 价格与名称统一从 cloud/models.ts 取，避免这里另写一套导致「显示 6 扣 10」
const tierCost = (tier: ImageTier) => imageCost(tier);
const tierLabel = (tier: ImageTier) => imageShort(tier);

/* 出图提示词的安全尾巴。
 * 厂商的内容审核看的是「画出来的图」：只要画面上出现像真品牌标志的图形，
 * 就会被判成版权/商标风险直接拦掉（实测：让它做一张自媒体图文海报，
 * 它自己编了个 AMBCONN 的 logo，就被拒了）。加一句负向约束能大幅降低命中率。 */
const SAFE_TAIL = '；排版以文字与几何图形为主，不要设计图形商标、不要模仿真实品牌标志，画面中不要出现明星或影视角色。';
const RETRY_TAIL = '（重画：完全不要出现任何标志性图形或商标造型，只用抽象几何形状与文字排版。）';

/* 平台名是最常见的触发词：写「小红书 / 抖音 / 微信」时，模型会顺手把平台图标画进画面，
 * 于是被判成商标侵权。重试时先把它们换成中性说法——实测同一句提示词，
 * 「小红书」换成「社交平台」就能一次过。 */
const PLATFORM_WORDS = /小红书|抖音|快手|视频号|公众号|微信|微博|B站|哔哩哔哩|知乎|淘宝|天猫|京东|拼多多|美团|饿了么|Instagram|TikTok|YouTube|Facebook|Twitter/gi;
const neutralizePrompt = (t: string) => t.replace(PLATFORM_WORDS, '社交平台');

/** 判断是不是「被内容/版权审核拦下」——这种失败换一种画法再试一次往往就过了 */
function isModerationBlock(e: unknown): boolean {
  const m = (e as Error)?.message || '';
  return /版权|商标|审核|内容安全|copyright|trademark|sensitive|moderation|safety|policy/i.test(m);
}

/** 生图预备期：给用户 3 秒反悔窗口。
 *  为什么是「等一下再发」而不是「发了再取消」：CloudBase 网关不透传浏览器断开、
 *  也没有会话亲和，请求一旦发出去就没法可靠地掐断上游，厂商照常计费。
 *  把这个窗口提前到发请求之前，才能做到「取消 = 真的没花钱」。 */
export const PREFLIGHT_SECONDS = 3;

function runPreflight(secs: number, onTick: (n: number) => void, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let left = secs;
    onTick(left);
    const finish = (ok: boolean) => {
      clearInterval(timer);
      signal.removeEventListener('abort', onAbort);
      onTick(0);
      resolve(ok);
    };
    const onAbort = () => finish(false);
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) { finish(true); return; }
      onTick(left);
    }, 1000);
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

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
  const [preflight, setPreflight] = useState(0);
  const [chatModel, setChatModelState] = useState<string>(loadChatModel);
  const setChatModel = useCallback((m: string) => {
    const id = findChatModel(m).id;
    setChatModelState(id);
    try { localStorage.setItem(CHAT_MODEL_KEY, id); } catch { /* ignore */ }
  }, []);

  /* --------------------------- 今日语言模型额度 ---------------------------
   * 每人每天 ¥1（CHAT_DAILY_BUDGET_RMB），六款会员模型共用这一个桶。
   * 账本在云端（lunasol_chat_spend），按云函数回传的真实 cost 累加：
   *   - 只有计量来源（正式站点）才查得到，GitHub Pages 镜像显示「不限」；
   *   - 还没查到之前是 null（界面显示「统计中」），不能当 0 用，
   *     否则会员会先看到「已用 0」，聊两句之后突然变成额度耗尽。 */
  const [chatSpendRmb, setChatSpendRmb] = useState<number | null>(null);
  const refreshChatSpend = useCallback(async () => {
    if (!user || !sub.metered) { setChatSpendRmb(null); return; }
    const s = await loadChatSpend(user.id);
    setChatSpendRmb(s ? s.costRmb : null);
  }, [user, sub.metered]);
  /* 等订阅加载完再读账本：RLS 依赖登录态，登录令牌还没进 SDK 时这条查询会被拒，
     读到 null 之后又没人再触发，界面就会一直停在「统计中」。
     sub.loading 由 false 变 true 再变 false，正好是「令牌已就绪」的信号。 */
  useEffect(() => {
    if (sub.loading) return;
    void refreshChatSpend();
  }, [refreshChatSpend, sub.loading, sub.sub?.id]);

  const chatQuotaUsedUp = chatSpendRmb !== null && chatSpendRmb >= CHAT_DAILY_BUDGET_RMB;

  /** 实际生效的对话模型：这里做最终裁决，界面只负责把规则讲清楚。
   *  1) 免费用户只能默认模型（本地残留的会员选项不算数）；
   *  2) 会员选的档位若「平台未开通」或「今日额度已用完」，退回默认模型。 */
  const selected = findChatModel(chatModel);
  const canUseSelected = sub.isPro && !selected.soon
    && !(selected.tier === 'pro' && chatQuotaUsedUp);
  const activeChatModel = canUseSelected ? selected.id : FREE_CHAT_MODEL;

  const conversationsRef = useRef<Conversation[]>(conversations);
  conversationsRef.current = conversations;
  const busyRef = useRef(false);
  busyRef.current = busy;
  /* 当前这一次请求的取消句柄。对话与生图互斥（busy 保证），共用一个就够。 */
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPreflight(0);
  }, []);
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
    // 会员专属档（GPT Image 2）不让免费用户选中：界面已经灰显，这里再兜一层，
    // 免得从别的入口（快捷键 / 老状态）绕过界面把会员档设进来
    if (isProOnlyTier(tier) && !sub.isPro) {
      setToast('GPT Image 2 为会员专属生图模型，开通会员后可用');
      return;
    }
    // 还没开始对话时只记在草稿上，等发出第一条消息时带进新会话
    if (!activeId) { setDraftTier(tier); return; }
    updateConv(activeId, (c) => ({ ...c, imageTier: tier, updatedAt: Date.now() }));
  }, [activeId, updateConv, sub.isPro, setToast]);

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
    // 每一次发送都有自己的取消句柄：用户点「取消」时掐掉这次 fetch，
    // 后面的 recordUsage 就走不到，积分不会被扣。
    const ctrl = new AbortController();
    abortRef.current = ctrl;
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
      const r = await llmChatWithReasoning(llmMessages, ai, { signal: ctrl.signal });

      /* 记账：额度按「云函数算出的本次花费」累加，失败/取消走不到这里，所以不会白占额度。
         只记会员专属模型——默认档不占额度（见 chatModels 的说明），
         否则用户聊了一整天默认模型，晚上想试 Kimi 却被锁，规则说不通。
         跨过 ¥1 的那一刻明确告诉用户为什么会员模型被锁，而不是下次点开才发现选不动了。

         注意：这里刻意「不 await」。记账要走一趟数据库，一旦网络卡住，
         await 会把 busy 卡在生成中，用户看到永远转圈、回复也刷不出来。
         额度是辅助信息，晚几百毫秒更新完全可以接受。 */
      const billed = findChatModel(activeChatModel);
      if (user && billed.tier === 'pro' && typeof r.cost === 'number' && r.cost > 0) {
        const uidNow = user.id;
        const spentBefore = chatSpendRmb;
        void addChatSpend(uidNow, r.cost).then((total) => {
          if (total === null) return;
          setChatSpendRmb(total);
          if (total >= CHAT_DAILY_BUDGET_RMB
            && (spentBefore === null || spentBefore < CHAT_DAILY_BUDGET_RMB)) {
            setToast('今日语言模型额度已用完：会员模型暂时锁定，明天 0 点恢复。DeepSeek-V4.1-Flash 仍可继续用。');
          }
        }).catch(() => { /* 记账失败不影响对话本身 */ });
      }

      const aiMsg: LunaMessage = {
        id: uid('msg'),
        role: 'assistant',
        content: r.content,
        ...(r.reasoning ? { reasoning: r.reasoning } : {}),
        at: Date.now(),
      };
      updateConv(convId, (c) => ({ ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() }));
    } catch (e) {
      if (isCancelled(e)) {
        // 用户自己按的取消，不是失败：只留一条灰色标记，不写错误文案
        updateConv(convId, (c) => ({
          ...c,
          messages: [...c.messages, { id: uid('msg'), role: 'assistant' as const, content: '', cancelled: true, at: Date.now() }],
          updatedAt: Date.now(),
        }));
      } else {
        const em = (e as Error).message || 'AI 暂时连不上';
        const errMsg: LunaMessage = {
          id: uid('msg'), role: 'assistant',
          content: `抱歉，${em}。请稍后再试，或者换个说法。`,
          at: Date.now(), error: true,
        };
        updateConv(convId, (c) => ({ ...c, messages: [...c.messages, errMsg], updatedAt: Date.now() }));
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy(false);
    }
  }, [activeId, updateConv, user, activeChatModel, draftTier, chatSpendRmb, setToast]);

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

    // 先算积分再落消息：余额不够时不应该在历史里留下一条「说了但没画」的孤立气泡。
    // 档位先按当前身份归一：会员到期后残留的 GPT Image 2 会退回 Flash，避免卖出不该卖的档
    const tierForCheck: ImageTier = resolveTier(target?.imageTier || draftTier, sub.isPro);
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
    const rawTier: ImageTier = conv.imageTier || draftTier;
    const tier: ImageTier = resolveTier(rawTier, sub.isPro);
    if (tier !== rawTier) {
      setToast(`「${imageShort(rawTier)}」是会员专属档，已改用 ${imageShort(tier)} 生成`);
    }

    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // ---- 预备期：这 3 秒里什么都还没发出去，取消就是「真的没花钱」 ----
    const goAhead = await runPreflight(PREFLIGHT_SECONDS, setPreflight, ctrl.signal);
    if (!goAhead) {
      updateConv(id, (c) => ({
        ...c,
        messages: [...c.messages, { id: uid('msg'), role: 'assistant' as const, content: '', cancelled: true, at: Date.now() }],
        updatedAt: Date.now(),
      }));
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy(false);
      return;
    }

    try {
      const prompt = (typed
        ? `${opts?.style || ''}${typed}`
        : buildImagePrompt(conv)) + SAFE_TAIL;
      const lastUserImage = opts?.reference
        || [...conv.messages].reverse().find((m) => m.role === 'user' && m.image)?.image;
      const imgOpts = {
        tier,
        referenceImage: lastUserImage,
        uid: user?.id,
        size: opts?.size,
        signal: ctrl.signal,
      };
      let url: string;
      try {
        url = await callImage(prompt, imgOpts);
      } catch (e) {
        // 被内容/版权审核拦下：自动换一版画法再试一次（成功才计费，失败仍不扣）
        if (ctrl.signal.aborted || !isModerationBlock(e)) throw e;
        // 先把平台名中性化，再补一句「别画商标」：两步叠加，命中率明显下降
        const safer = `${neutralizePrompt(prompt)}${RETRY_TAIL}`;
        setToast(neutralizePrompt(prompt) === prompt
          ? '这次画面被版权审核拦下了，已自动换一种画法重试'
          : '画面被版权审核拦下了，已把平台名换成「社交平台」重试一次');
        url = await callImage(safer, imgOpts);
      }
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
      if (isCancelled(e)) {
        // 取消发生在出图之前：recordUsage 没执行，所以一分不扣
        updateConv(id, (c) => ({
          ...c,
          messages: [...c.messages, { id: uid('msg'), role: 'assistant' as const, content: '', cancelled: true, at: Date.now() }],
          updatedAt: Date.now(),
        }));
      } else {
        const em = (e as Error).message || '图像生成失败';
        const errMsg: LunaMessage = {
          id: uid('msg'), role: 'assistant',
          // 失败要说清「没扣分」：出图失败时用户最担心的就是这个
          content: `生图失败：${em}\n本次未扣积分。`, at: Date.now(), error: true,
        };
        updateConv(id, (c) => ({ ...c, messages: [...c.messages, errMsg], updatedAt: Date.now() }));
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setPreflight(0);
      setBusy(false);
    }
  }, [activeId, user, sub, setToast, updateConv, draftTier]);

  const active = conversations.find((c) => c.id === activeId) || null;

  return {
    conversations, activeId, active, busy, syncState, syncMessage, booted,
    chatModel: activeChatModel, draftTier,
    chatSpendRmb, chatBudgetRmb: CHAT_DAILY_BUDGET_RMB, chatQuotaUsedUp, refreshChatSpend,
    newConversation, selectConversation, deleteConversation, renameConversation,
    setTier, setChatModel, cancel, preflight, sendText, generateImage,
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
