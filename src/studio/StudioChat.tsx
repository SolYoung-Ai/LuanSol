/* ============================================================
   Studio 2.0 — 右侧顾问对话（真正的 AI，不是占位）
   ------------------------------------------------------------
   · 复用 Luna 那条链路（云函数代理 + 平台默认对话模型），对话免费、不扣积分；
   · 消息跟着项目走（StudioProject.chat），刷新 / 换设备都还在；
   · 每次发送都会把「当前结构化需求 + 正在填的这一步」一起交给模型，
     所以它答的是这份包装的事，而不是通用闲聊。
   ============================================================ */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons';
import { useLang } from '../i18n';
import { loadAI, llmChatWithReasoning } from '../engine/llm';
import { isCancelled } from '../engine/cancel';
import { FREE_CHAT_MODEL } from '../cloud/chatModels';
import { LUNA_PERSONA_PROMPT } from '../engine/persona';
import type { StudioChatMsg } from './types';

/** 对话只留最近 60 条：project payload 要跟着云端走，不能无限长 */
const MAX_MSGS = 60;
const HISTORY_FOR_MODEL = 12;

const msgId = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface Props {
  messages: StudioChatMsg[];
  onChange: (next: StudioChatMsg[]) => void;
  /** 结构化需求 + 当前步骤，拼进 system prompt */
  context: string;
  cloudbaseUid: string;
  /** 没有打开项目时给一句说明，不假装读到了需求 */
  idle?: boolean;
  onOpenProject?: () => void;
}

export default function StudioChat({ messages, onChange, context, cloudbaseUid, idle, onOpenProject }: Props) {
  const { t } = useLang();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const live = useRef(messages);
  live.current = messages;

  /** 新消息贴底：只在对话区内部滚，不动整页 */
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const push = useCallback((m: StudioChatMsg) => {
    onChange([...live.current, m].slice(-MAX_MSGS));
  }, [onChange]);

  const send = useCallback(async (raw?: string) => {
    const content = (raw ?? text).trim();
    if (!content || busy) return;
    if (idle) { onOpenProject?.(); return; }
    setText('');
    setErr('');
    push({ id: msgId(), role: 'user', content, at: Date.now() });
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const history = live.current.slice(-HISTORY_FOR_MODEL).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const ai = { ...loadAI(), textModel: FREE_CHAT_MODEL, cloudbaseUid };
      const r = await llmChatWithReasoning([
        {
          role: 'system',
          content: `${LUNA_PERSONA_PROMPT}

【你现在的位置】
用户正在 LunaSol 包装工作台里填写一份包装设计需求，右侧这个面板就是你和他的对话窗口。

${context}

【回答要求】
- 先说结论再给理由，整段不超过 120 字；
- 只谈这一份包装：结构、尺寸、材质、配色、版式、文案、印刷工艺；
- 需求里没写的（配方、功效、认证、具体规格、价格）不要编造，直接说需求里没写；
- 不要输出表格、不要用 emoji、不要复述整份需求。`,
        },
        ...history,
      ], ai, { signal: ctrl.signal });
      push({ id: msgId(), role: 'assistant', content: r.content, at: Date.now() });
    } catch (e) {
      if (!isCancelled(e)) {
        push({
          id: msgId(), role: 'assistant', error: true, at: Date.now(),
          content: t(
            `抱歉，${(e as Error).message || 'AI 暂时连不上'}。需求已经存好了，稍后再问我一次就行。`,
            `Sorry — ${(e as Error).message || 'the AI is unreachable'}. Your brief is saved; ask again in a moment.`,
          ),
        });
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy(false);
    }
  }, [busy, text, idle, context, cloudbaseUid, push, onOpenProject, t]);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  const clear = () => onChange([]);

  const ideas = [
    t('这个尺寸做礼盒会不会太空？', 'Will a gift box at this size feel empty?'),
    t('帮我想三个配色方向', 'Give me three colour directions'),
    t('正面版式怎么排更稳？', 'How should the front panel be laid out?'),
  ];

  return <div className="st-ed-ai">
    <header className="st-ed-ai-head">
      <div className="st-ed-ai-title">
        <span className="st-ed-ai-dot" aria-hidden />
        Luna AI
        <em>{t('包装顾问', 'Packaging advisor')}</em>
      </div>
      <button
        className="st-ed-icon-btn"
        onClick={clear}
        disabled={!messages.length}
        title={t('清空这段对话', 'Clear this conversation')}
        aria-label={t('清空这段对话', 'Clear this conversation')}
      ><Icon name="edit" size={15} /></button>
    </header>

    <div className="st-ed-ai-body" ref={bodyRef}>
      {idle && <div className="st-ed-ai-idle">
        <b>{t('先打开一个项目', 'Open a project first')}</b>
        <p>{t('打开或新建一个包装项目后，我会读到你填的需求，再回答你的问题。',
          'Once a project is open I read the brief you filled in, and answer from that.')}</p>
        <button className="st-ed-mini-btn" onClick={onOpenProject}>{t('开始一个新设计', 'Start a new design')}</button>
      </div>}

      {!idle && !messages.length && <div className="st-ed-ai-hello">
        <b>{t('我是 Luna，会跟着这份需求答。', 'I am Luna — I answer from this brief.')}</b>
        <p>{t('尺寸、配色、版式、工艺，卡住了就问我一句。',
          'Sizes, colours, layout, finishing — ask whenever you are stuck.')}</p>
        <div className="st-ed-ai-ideas">
          {ideas.map((x) => <button key={x} onClick={() => void send(x)}>{x}</button>)}
        </div>
      </div>}

      {messages.map((m) => <div key={m.id} className={`st-ed-msg ${m.role} ${m.error ? 'is-error' : ''}`}>
        {m.content}
      </div>)}

      {busy && <div className="st-ed-msg assistant is-typing" aria-label={t('正在回答', 'Answering')}>
        <i /><i /><i />
      </div>}

      {err && <p className="st-ed-ai-err">{err}</p>}
    </div>

    <form
      className="st-ed-ai-form"
      onSubmit={(e) => { e.preventDefault(); void send(); }}
    >
      <textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={idle
          ? t('先打开一个项目…', 'Open a project first…')
          : t('问点什么：尺寸 / 配色 / 版式 / 工艺…', 'Ask about size, colour, layout, finishing…')}
      />
      <div className="st-ed-ai-row">
        <span className="st-ed-ai-note">{t('对话免费 · 不扣积分', 'Free · no credits')}</span>
        {busy
          ? <button type="button" className="st-ed-send is-stop" onClick={stop} aria-label={t('停止', 'Stop')}>
            <Icon name="close" size={15} />
          </button>
          : <button type="submit" className="st-ed-send" disabled={!text.trim() || !!idle} aria-label={t('发送', 'Send')}>
            <Icon name="send" size={15} />
          </button>}
      </div>
    </form>
  </div>;
}
