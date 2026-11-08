/* ============================================================
 * Luna —— 设计师 AI 分身对话（Grok 式界面）
 * ------------------------------------------------------------
 * 左侧：新建对话 + 搜索 + 云端历史对话；中间：欢迎大标题 / 对话流
 * + 底部输入框。对话模型固定 DeepSeek（deepseek-reasoner，带思考过程），
 * 不提供模型选择；生图三档 flash/lite/pro 由用户在输入框切换。
 * 人设统一来自 engine/persona.ts，全站同一份。
 * ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons';
import type { ImageTier, LunaMessage } from '../types';
import { useAuth } from '../cloud/auth';
import { useChatStore } from '../cloud/useChatStore';
import { useApp } from '../store';
import { LoginDialog } from '../cloud/LoginDialog';
import { PRICING } from '../cloud/plans';
import { CHAT_MODELS } from '../cloud/useChatStore';

const TIERS: ImageTier[] = ['flash', 'lite', 'pro'];
const tierName = (t: ImageTier) =>
  t === 'flash' ? 'Seedream-5.0-flash' : t === 'lite' ? 'Seedream-5.0-lite' : 'Seedream-5.0-pro';
const tierShort = (t: ImageTier) => (t === 'flash' ? 'Flash' : t === 'lite' ? 'Lite' : 'Pro');
const tierCost = (t: ImageTier) =>
  t === 'flash' ? PRICING.costs.imageFlash : t === 'lite' ? PRICING.costs.imageLite : PRICING.costs.imagePro;

// 前端按纯文本渲染（不解析 Markdown），把模型偶尔带出的 Markdown 符号清掉，
// 避免页面上裸露 ** 或 #，同时保留正常换行。
const toPlainText = (s: string) =>
  s
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/(^|\n)\s{0,3}#{1,6}\s*/g, '$1')
    .replace(/`{1,3}([^`\n]+?)`{1,3}/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/* --------------------------- 思考过程折叠块 --------------------------- */
function ReasoningBlock({ reasoning, defaultOpen }: { reasoning: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="lc-reason">
      <button className="lc-reason-head" onClick={() => setOpen((o) => !o)}>
        <Icon name="brain" size={14} />
        <span>思考过程</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} className="lc-reason-chev" />
      </button>
      {open && <div className="lc-reason-body">{reasoning}</div>}
    </div>
  );
}

/* --------------------------- 生图档位下拉 --------------------------- */
function TierMenu({ tier, onTier }: { tier: ImageTier; onTier: (t: ImageTier) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lc-tier">
      <button className="lc-tier-btn" onClick={() => setOpen((o) => !o)} title="生图档位">
        <span className="lc-tier-name">{tierShort(tier)}</span>
        <span className="lc-tier-cost">{tierCost(tier)}积分</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <>
          <div className="lc-backdrop" onClick={() => setOpen(false)} />
          <div className="lc-tier-menu">
            {TIERS.map((t) => (
              <button
                key={t}
                className={`lc-tier-opt ${t === tier ? 'sel' : ''}`}
                onClick={() => { onTier(t); setOpen(false); }}
              >
                <span>{tierName(t)}</span>
                <span className="lc-tier-opt-cost">{tierCost(t)}积分</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------- 对话模型下拉 --------------------------- */
function ChatModelMenu({ model, onModel }: { model: string; onModel: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = CHAT_MODELS.find((m) => m.id === model) || CHAT_MODELS[0];
  return (
    <div className="lc-chatmodel">
      <button className="lc-chatmodel-btn" onClick={() => setOpen((o) => !o)} title="对话模型">
        <span>对话由 {current.label} 驱动</span>
        <Icon name="chevronDown" size={11} />
      </button>
      {open && (
        <>
          <div className="lc-backdrop" onClick={() => setOpen(false)} />
          <div className="lc-chatmodel-menu">
            {CHAT_MODELS.map((m) => (
              <button
                key={m.id}
                className={`lc-chatmodel-opt ${m.id === model ? 'sel' : ''}`}
                onClick={() => { onModel(m.id); setOpen(false); }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------- 单条消息 --------------------------- */
function Bubble({ m, isLast }: { m: LunaMessage; isLast: boolean }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const isUser = m.role === 'user';
  return (
    <div className={`lc-msg ${isUser ? 'user' : 'assistant'}`}>
      <div className="lc-msg-avatar">{isUser ? '我' : <img src="./logo.png" alt="Luna" />}</div>
      <div className="lc-msg-body">
        {m.reasoning && <ReasoningBlock reasoning={m.reasoning} defaultOpen={isLast} />}
        {m.content && m.content !== '（参考图）' && (
          <div className={`lc-msg-text ${m.error ? 'error' : ''}`}>{toPlainText(m.content)}</div>
        )}
        {m.image && (
          <div className="lc-msg-imgwrap">
            <img
              src={m.image}
              alt="设计图"
              className="lc-msg-img"
              onClick={() => setLightbox(m.image!)}
            />
            {m.imageTier && (
              <span className="lc-img-tag">
                <Icon name="image" size={12} /> {tierShort(m.imageTier)} · {tierCost(m.imageTier)}积分
              </span>
            )}
          </div>
        )}
      </div>
      {lightbox && (
        <div className="lc-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="放大预览" />
        </div>
      )}
    </div>
  );
}

export default function Luna() {
  const auth = useAuth();
  const chat = useChatStore();
  const { setToast } = useApp();
  const [loginOpen, setLoginOpen] = useState(false);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const active = chat.active;
  const messages = active?.messages || [];
  const hasThread = messages.length > 0;

  /* 自动滚动到底部 */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, chat.busy, active?.id]);

  /* textarea 自适应高度 */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { setToast('图片请小于 4MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setPendingImage(String(reader.result));
    reader.readAsDataURL(f);
  };

  const doSend = () => {
    const text = input.trim();
    if ((!text && !pendingImage) || chat.busy) return;
    const img = pendingImage || undefined;
    setPendingImage(null);
    setInput('');
    void chat.sendText(text, img);
  };

  const startEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditDraft(title);
  };
  const commitEdit = () => {
    if (editingId && editDraft.trim()) chat.renameConversation(editingId, editDraft.trim());
    setEditingId(null);
  };

  const filtered = chat.conversations.filter((c) =>
    query.trim() ? c.title.toLowerCase().includes(query.trim().toLowerCase()) : true);

  /* ------------------------------ 未登录 ------------------------------ */
  if (!auth.user) {
    return (
      <div className="page page-narrow">
        <div style={{ textAlign: 'center', paddingTop: 80 }}>
          <h1 style={{ fontSize: 32, marginBottom: 12 }}>先登录，再和 Luna 聊设计</h1>
          <p style={{ color: '#737373', marginBottom: 24 }}>对话会按账号保存到云端，换设备也能看到。</p>
          <button className="v4-btn-dark" onClick={() => setLoginOpen(true)}>登录 / 注册</button>
        </div>
        <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={() => {}} />
      </div>
    );
  }

  const initial = (auth.user.label || auth.user.email || 'U').slice(0, 1).toUpperCase();
  const syncLabel = chat.syncState === 'syncing'
    ? '同步中…'
    : chat.syncState === 'error'
      ? '同步失败'
      : '已同步到云端';

  return (
    <div className="lc-shell">
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickImage} />

      {/* ------------------------------ 左侧栏 ------------------------------ */}
      <aside className="lc-side">
        <button className="lc-new" onClick={chat.newConversation}>
          <Icon name="plus" size={16} />
          <span>新建对话</span>
        </button>

        <div className="lc-search">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索对话"
          />
        </div>

        <div className="lc-group-label">聊天</div>
        <div className="lc-list">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`lc-item ${c.id === chat.activeId ? 'active' : ''}`}
              onClick={() => chat.selectConversation(c.id)}
            >
              <Icon name="message" size={15} className="lc-item-ic" />
              {editingId === c.id ? (
                <input
                  className="lc-item-edit"
                  value={editDraft}
                  autoFocus
                  onChange={(e) => setEditDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={commitEdit}
                />
              ) : (
                <span className="lc-item-title">{c.title}</span>
              )}
              <div className="lc-item-ops" onClick={(e) => e.stopPropagation()}>
                <button title="重命名" onClick={() => startEdit(c.id, c.title)}>
                  <Icon name="edit" size={14} />
                </button>
                <button title="删除" onClick={() => void chat.deleteConversation(c.id)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="lc-list-empty">没有对话</div>}
        </div>

        <div className="lc-side-foot">
          <div className="lc-user">
            <div className="lc-user-avatar">
              {auth.user.avatarUrl
                ? <img src={auth.user.avatarUrl} alt="头像" />
                : initial}
            </div>
            <div className="lc-user-meta">
              <div className="lc-user-name">{auth.user.label || auth.user.email}</div>
              <div className={`lc-user-sync ${chat.syncState}`}>{syncLabel}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ------------------------------ 中间主区 ------------------------------ */}
      <section className="lc-main">
        {hasThread ? (
          <div className="lc-scroll" ref={scrollRef}>
            <div className="lc-thread">
              {messages.map((m, i) => (
                <Bubble key={m.id} m={m} isLast={i === messages.length - 1} />
              ))}
              {chat.busy && (
                <div className="lc-msg assistant">
                  <div className="lc-msg-avatar"><img src="./logo.png" alt="Luna" /></div>
                  <div className="lc-busy">
                    <span className="lc-dot" />
                    <span className="lc-dot" />
                    <span className="lc-dot" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="lc-welcome">
            <h1>我们应该探索什么？</h1>
            <p>我是 Luna，你的专属设计师。产品、品牌、包装、海报，任何设计想法都可以丢给我。</p>
          </div>
        )}

        {/* ------------------------------ 输入区 ------------------------------ */}
        <div className="lc-dock">
          {pendingImage && (
            <div className="lc-pending">
              <img src={pendingImage} alt="待发送" />
              <span>参考图已就绪</span>
              <button onClick={() => setPendingImage(null)}>
                <Icon name="close" size={13} />
              </button>
            </div>
          )}
          <div className="lc-composer">
            <button className="lc-icon-btn" title="上传参考图" onClick={() => fileRef.current?.click()}>
              <Icon name="plus" size={18} />
            </button>
            <textarea
              ref={taRef}
              className="lc-textarea"
              value={input}
              rows={1}
              placeholder="告诉 Luna 你的想法…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  doSend();
                }
              }}
            />
            <div className="lc-composer-right">
              <TierMenu tier={active?.imageTier || 'flash'} onTier={chat.setTier} />
              <button
                className="lc-icon-btn"
                title="按当前档位生成图片"
                onClick={() => void chat.generateImage()}
                disabled={chat.busy}
              >
                <Icon name="image" size={18} />
              </button>
              <button className="lc-send" title="发送" onClick={doSend} disabled={chat.busy || (!input.trim() && !pendingImage)}>
                <Icon name="send" size={17} />
              </button>
            </div>
          </div>
          <div className="lc-dock-hint">
            <ChatModelMenu model={chat.chatModel} onModel={chat.setChatModel} />
            <span>· 生图按档位消耗积分，对话免费</span>
          </div>
        </div>
      </section>
    </div>
  );
}
