/* ============================================================
 * Luna —— 设计师 AI 分身对话
 * ------------------------------------------------------------
 * 布局：左侧液态玻璃对话栏（桌面常驻 / 手机抽屉）+ 右侧纯白对话区。
 * 输入框是一个玻璃 composer，里面可以切换两种模式：
 *   · 对话      —— 由 DeepSeek-V4 驱动（免费用户固定此模型，不自选）
 *   · 图像生成  —— 自己写画面描述，可选模型 / 比例 / 风格 / 模板
 * 全页不使用渐变：白底 + 极淡描边 + 一层柔和投影，靠留白分层。
 * 人设统一来自 engine/persona.ts，全站同一份。
 * ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons';
import type { IconName } from '../components/icons';
import type { ImageTier, LunaMessage } from '../types';
import { useAuth } from '../cloud/auth';
import { useChatStore, CHAT_MODELS } from '../cloud/useChatStore';
import { useSubscription } from '../cloud/subscription';
import { useApp } from '../store';
import { LoginDialog } from '../cloud/LoginDialog';
import { OPEN_IMAGE_MODELS, imageCost, imageLabel, imageShort, imageModel } from '../cloud/models';

type LunaMode = 'chat' | 'image';

// 档位名称与价格全部来自 cloud/models.ts，界面上显示多少就扣多少
const tierName = (t: ImageTier) => imageLabel(t);
const tierShort = (t: ImageTier) => imageShort(t);
const tierCost = (t: ImageTier) => imageCost(t);

/** 比例 → Seedream 实际出图尺寸（自动则交给服务端默认 1024×1024） */
const RATIOS = [
  { id: 'auto', label: '自动', size: undefined as string | undefined },
  { id: '1:1', label: '1:1', size: '1024x1024' },
  { id: '3:4', label: '3:4', size: '864x1152' },
  { id: '4:3', label: '4:3', size: '1152x864' },
  { id: '16:9', label: '16:9', size: '1280x720' },
  { id: '9:16', label: '9:16', size: '720x1280' },
];

const STYLES = [
  { id: 'none', label: '不限', prompt: '' },
  { id: 'photo', label: '商业摄影', prompt: '商业摄影棚拍风格，柔光，干净背景，高清质感。' },
  { id: 'minimal', label: '极简平面', prompt: '极简平面设计，大面积留白，克制配色，干净排版。' },
  { id: 'ink', label: '东方水墨', prompt: '中国水墨画风格，宣纸质感，淡墨晕染，留白意境。' },
  { id: 'retro', label: '复古手绘', prompt: '复古手绘插画风格，做旧纸张质感，暖色调。' },
  { id: '3d', label: '3D 立体', prompt: '3D 渲染风格，柔和布光，圆润体积感，细腻材质。' },
];

const TEMPLATES = [
  { id: 'none', label: '不限', prompt: '' },
  { id: 'box', label: '包装盒', prompt: '产品包装盒效果图，正面视角，' },
  { id: 'bag', label: '手提袋', prompt: '纸质手提袋效果图，' },
  { id: 'label', label: '瓶贴', prompt: '瓶身标签效果图，' },
  { id: 'poster', label: '海报', prompt: '海报版面效果图，' },
];

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
function ReasoningBlock({ reasoning }: { reasoning: string }) {
  // 默认折叠，避免一大串思考内容刷屏；用户点击标题可自行展开
  const [open, setOpen] = useState(false);
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

/* --------------------------- 通用下拉（composer 内） --------------------------- */
interface Option { id: string; label: string; hint?: string }

function Pick({
  icon, caption, value, options, onPick,
}: {
  icon?: IconName;
  caption?: string;
  value: string;
  options: Option[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lc-pick">
      <button className={`lc-tag ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>
        {icon && <Icon name={icon} size={14} />}
        {caption && <span className="lc-tag-cap">{caption}</span>}
        <span className="lc-tag-val">{value}</span>
        <Icon name="chevronDown" size={12} className="lc-tag-chev" />
      </button>
      {open && (
        <>
          <div className="lc-backdrop" onClick={() => setOpen(false)} />
          <div className="lc-pop">
            {options.map((o) => (
              <button
                key={o.id}
                className={`lc-pop-opt ${o.label === value ? 'sel' : ''}`}
                onClick={() => { onPick(o.id); setOpen(false); }}
              >
                <span>{o.label}</span>
                {o.hint && <span className="lc-pop-hint">{o.hint}</span>}
                {o.label === value && <Icon name="check" size={13} className="lc-pop-check" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------- 单条消息 --------------------------- */
function Bubble({ m, onMedia }: { m: LunaMessage; onMedia?: () => void }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const isUser = m.role === 'user';
  return (
    <div className={`lc-msg ${isUser ? 'user' : 'assistant'}`}>
      <div className="lc-msg-avatar">{isUser ? '我' : <img src="./logo.png" alt="Luna" />}</div>
      <div className="lc-msg-body">
        {m.reasoning && <ReasoningBlock reasoning={m.reasoning} />}
        {m.content && m.content !== '（参考图）' && (
          <div className={`lc-msg-text ${m.error ? 'error' : ''}`}>{toPlainText(m.content)}</div>
        )}
        {m.image && (
          <div className="lc-msg-imgwrap">
            <img
              src={m.image}
              alt="设计图"
              className="lc-msg-img"
              onLoad={onMedia}
              onClick={() => setLightbox(m.image!)}
            />
            {m.imageTier && !isUser && (
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
  const sub = useSubscription();
  const { setToast } = useApp();
  const [loginOpen, setLoginOpen] = useState(false);
  const [mode, setMode] = useState<LunaMode>('chat');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ratioId, setRatioId] = useState('auto');
  const [styleId, setStyleId] = useState('none');
  const [templateId, setTemplateId] = useState('none');
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  /* 跟踪是否移动视口，用于切换「常驻侧栏 / 抽屉侧栏」两套交互 */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const onChg = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChg);
    return () => mq.removeEventListener('change', onChg);
  }, []);

  /* 移动端在 Luna 页隐藏整站 footer，避免与输入框挤在一起；离开页面恢复 */
  useEffect(() => {
    document.body.classList.add('on-luna');
    return () => document.body.classList.remove('on-luna');
  }, []);

  /* 抽屉打开时锁定背景滚动，并支持 Esc 关闭 */
  useEffect(() => {
    if (!isMobile || !drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [isMobile, drawerOpen]);

  const active = chat.active;
  const messages = active?.messages || [];
  const hasThread = messages.length > 0;
  const tier: ImageTier = active?.imageTier || chat.draftTier;

  /* 自动滚动到底部：图片是异步解码的，刚插进 DOM 时高度还没算出来，
     只滚一次会停在半路。这里补一次延迟滚动兜住「图片撑高」的情况。 */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    const t = window.setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 140);
    return () => window.clearTimeout(t);
  }, [messages.length, chat.busy, active?.id]);

  /* textarea 自适应高度 */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input, mode]);

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { setToast('图片请小于 4MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(String(reader.result));
      // GPT Image 2 的「文字输入」档不收参考图，带图必须走「输入图」档（93 积分）。
      // 这里明说一句，避免用户以为还是 86 积分却按 93 扣。
      if (imageModel(tier).id === 'gpt2-text') {
        chat.setTier('gpt2-ref');
        setToast('已切到「GPT Image 2 · 输入图」（93 积分/张），因为这次带了参考图');
      }
    };
    reader.readAsDataURL(f);
  };

  const ratio = RATIOS.find((r) => r.id === ratioId) || RATIOS[0];
  const style = STYLES.find((s) => s.id === styleId) || STYLES[0];
  const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];

  const doSend = () => {
    if (chat.busy) return;
    const text = input.trim();
    const img = pendingImage || undefined;

    if (mode === 'image') {
      if (!text && !img) {
        setToast('先描述一下画面，比如「国风茶叶礼盒，米白底，烫金纹样，正面视角」');
        return;
      }
      // 该档位必须有参考图，否则云函数会直接拒绝（不扣分，但白等一场）
      if (imageModel(tier).needsRef && !img) {
        setToast('「GPT Image 2 · 输入图」需要先上传参考图；只用文字的话请切到「文字输入」档（86 积分）');
        return;
      }
      // 余额不足时先拦住：绝不能先把输入框清空再被拒——用户刚写好的提示词会凭空消失
      if (typeof balance === 'number' && balance < tierCost(tier)) {
        setToast(`积分不足：${tierCost(tier)} 积分/张，当前余额 ${balance}。去「积分与充值」签到或兑换后再试。`);
        return;
      }
      setPendingImage(null);
      setInput('');
      void chat.generateImage(text || '按参考图生成一张包装效果图', {
        size: ratio.size,
        style: style.prompt + template.prompt,
        reference: img,
      });
      return;
    }

    if ((!text && !img) || chat.busy) return;
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

  /* 桌面端：收起/展开常驻侧栏；移动端：关闭抽屉 */
  const toggleSide = () => {
    if (isMobile) setDrawerOpen(false);
    else setSideOpen((o) => !o);
  };

  /* 移动端选中某个对话后自动收起抽屉 */
  const pickConversation = (id: string) => {
    chat.selectConversation(id);
    if (isMobile) setDrawerOpen(false);
  };

  /* 新建对话：移动端同时收起抽屉，进入空白欢迎页 */
  const makeNew = () => {
    chat.newConversation();
    if (isMobile) setDrawerOpen(false);
  };

  const filtered = chat.conversations.filter((c) =>
    query.trim() ? c.title.toLowerCase().includes(query.trim().toLowerCase()) : true);

  /* 图片解码完成会把内容撑高：只在「本来就在底部附近」时跟随，
     用户往上翻看历史时不被强行拽回去。 */
  const followMedia = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 260) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  };

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
  // 只有真的同步成功才说「已同步」：免费用户与尚未同步时都如实显示「本机保存」
  const syncLabel = !sub.isPro
    ? '本机保存'
    : chat.syncState === 'syncing'
      ? '同步中…'
      : chat.syncState === 'error'
        ? '同步失败'
        : chat.syncState === 'ok' ? '已同步到云端' : '本机保存';
  const canSend = !!input.trim() || !!pendingImage;
  const balance = sub.usedLeft;

  return (
    <div className="lc-shell">
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickImage} />

      {/* ------------------------------ 左侧栏（桌面常驻 / 移动抽屉） ------------------------------ */}
      <aside className={`lc-side ${sideOpen ? '' : 'collapsed'} ${drawerOpen ? 'drawer-open' : ''}`}>
        <div className="lc-side-inner">
          {/* 桌面端品牌头：与右上角的收起按钮组成一组，手机抽屉不渲染 */}
          {!isMobile && <div className="lc-side-head">
            <img src="./logo.png" alt="Luna" />
            <span className="lc-side-head-text"><strong>Luna</strong><small>你的专属设计师</small></span>
          </div>}
          <button className="lc-new" onClick={makeNew}>
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
                onClick={() => pickConversation(c.id)}
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
        </div>

        {/* 收起后只留一列图标快捷入口，点「搜索」会直接把侧栏展开 */}
        {!isMobile && !sideOpen && <div className="lc-rail">
          <button className="lc-rail-btn" title="新建对话" aria-label="新建对话" onClick={makeNew}>
            <Icon name="plus" size={18} />
          </button>
          <button className="lc-rail-btn" title="展开侧栏并搜索" aria-label="展开侧栏并搜索" onClick={() => setSideOpen(true)}>
            <Icon name="search" size={18} />
          </button>
        </div>}

        {/* 桌面端收起/展开常驻侧栏；移动端作为关闭抽屉按钮 */}
        <button
          className="lc-side-toggle"
          onClick={toggleSide}
          title={isMobile ? '关闭菜单' : sideOpen ? '收起侧栏' : '展开侧栏'}
          aria-label={isMobile ? '关闭菜单' : sideOpen ? '收起侧栏' : '展开侧栏'}
        >
          <Icon name={isMobile ? 'close' : sideOpen ? 'chevronLeft' : 'chevronRight'} size={16} />
          <span className="lc-side-toggle-text">
            {isMobile ? '关闭菜单' : sideOpen ? '收起侧栏' : '展开'}
          </span>
        </button>
      </aside>

      {/* 移动端抽屉遮罩：点击空白处关闭 */}
      <div
        className={`lc-drawer-mask ${drawerOpen ? 'show' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* ------------------------------ 中间主区 ------------------------------ */}
      <section className="lc-main">
        {/* 移动端顶栏：打开对话抽屉；桌面端隐藏 */}
        <div className="lc-mobile-top">
          <button className="lc-drawer-btn" onClick={() => setDrawerOpen(true)} title="打开对话列表" aria-label="打开对话列表">
            <Icon name="menu" size={20} />
          </button>
          <span className="lc-mobile-top-title">Luna</span>
        </div>

        {hasThread ? (
          <div className="lc-scroll" ref={scrollRef}>
            <div className="lc-thread">
              {messages.map((m) => <Bubble key={m.id} m={m} onMedia={followMedia} />)}
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
            <h1>{mode === 'image' ? '想画点什么，直接说。' : '我是 Luna，你的专属设计师。'}</h1>
            <p>
              {mode === 'image'
                ? '描述画面、风格和用途，我直接出图；需要先聊清楚需求也行。'
                : '产品、品牌、包装、海报，任何设计想法都可以丢给我。'}
            </p>
            <div className="lc-seg" role="tablist" aria-label="对话模式">
              <button
                className={`lc-seg-btn ${mode === 'chat' ? 'on' : ''}`}
                role="tab" aria-selected={mode === 'chat'}
                onClick={() => setMode('chat')}
              >对话</button>
              <button
                className={`lc-seg-btn ${mode === 'image' ? 'on' : ''}`}
                role="tab" aria-selected={mode === 'image'}
                onClick={() => setMode('image')}
              >图像生成</button>
            </div>
          </div>
        )}

        {/* ------------------------------ 输入区 ------------------------------ */}
        <div className="lc-dock">
          <div className="lc-dock-inner">
          {pendingImage && (
            <div className="lc-pending">
              <img src={pendingImage} alt="待发送" />
              <span>{mode === 'image' ? '参考图已就绪，会按它出图' : '参考图已就绪'}</span>
              <button onClick={() => {
                setPendingImage(null);
                // 参考图去掉后回到「文字输入」档，不然会按 93 积分的图生图档下单
                if (imageModel(tier).id === 'gpt2-ref') chat.setTier('gpt2-text');
              }} aria-label="移除参考图">
                <Icon name="close" size={13} />
              </button>
            </div>
          )}

          <div className="lc-composer">
            <textarea
              ref={taRef}
              className="lc-textarea"
              value={input}
              rows={1}
              placeholder={mode === 'image' ? '描述你想要的图片' : '告诉 Luna 你的想法…'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  doSend();
                }
              }}
            />

            <div className="lc-bar">
              <div className="lc-bar-left">
                <button className="lc-round" title={mode === 'image' ? '上传参考图' : '上传参考图'} onClick={() => fileRef.current?.click()}>
                  <Icon name="plus" size={18} />
                </button>
                <span className="lc-bar-sep" />

                {mode === 'chat' ? (
                  <>
                    <span className="lc-tag on"><Icon name="message" size={14} />对话</span>
                    <button className="lc-tag" onClick={() => setMode('image')} title="切换到图像生成">
                      <Icon name="image" size={14} />图像生成
                      <Icon name="chevronRight" size={12} className="lc-tag-chev" />
                    </button>
                  </>
                ) : (
                  <>
                    <button className="lc-tag on removable" onClick={() => setMode('chat')} title="退出图像生成">
                      <Icon name="image" size={14} />图像生成
                      <Icon name="close" size={12} className="lc-tag-chev" />
                    </button>
                    <Pick
                      icon="spark"
                      caption="模型"
                      value={tierName(tier)}
                      options={OPEN_IMAGE_MODELS.map((m) => ({
                        id: m.id,
                        label: m.label,
                        hint: `${m.cost} 积分`,
                      }))}
                      onPick={(id) => chat.setTier(id as ImageTier)}
                    />
                    <Pick
                      caption="比例"
                      value={ratio.label}
                      options={RATIOS.map((r) => ({ id: r.id, label: r.label }))}
                      onPick={setRatioId}
                    />
                    <Pick
                      caption="风格"
                      value={style.label}
                      options={STYLES.map((s) => ({ id: s.id, label: s.label }))}
                      onPick={setStyleId}
                    />
                    <Pick
                      caption="模板"
                      value={template.label}
                      options={TEMPLATES.map((t) => ({ id: t.id, label: t.label }))}
                      onPick={setTemplateId}
                    />
                  </>
                )}
              </div>

              <button
                className="lc-send"
                title={mode === 'image' ? '生成图片' : '发送'}
                onClick={doSend}
                disabled={chat.busy || !canSend}
              >
                <Icon name={mode === 'image' ? 'image' : 'send'} size={17} />
              </button>
            </div>
          </div>

          {/* 底部一行状态：对话模型（免费用户固定，不可自选） / 生图积分说明 */}
          <div className="lc-dock-hint">
            {mode === 'image' ? (
              <span className="lc-hint-text">
                {tierShort(tier)} 生图 {tierCost(tier)} 积分/张
                {typeof balance === 'number' ? ` · 当前余额 ${balance}` : ''}
              </span>
            ) : sub.isPro ? (
              <>
                <Pick
                  icon="spark"
                  caption="对话模型"
                  value={CHAT_MODELS.find((m) => m.id === chat.chatModel)?.label || 'DeepSeek-V4'}
                  options={CHAT_MODELS.map((m) => ({ id: m.id, label: m.label }))}
                  onPick={chat.setChatModel}
                />
                <span className="lc-hint-text">· 生图按档位消耗积分</span>
              </>
            ) : (
              <span className="lc-hint-text">
                <Icon name="spark" size={12} /> 对话由 DeepSeek-V4 驱动 · 生图按档位消耗积分
              </span>
            )}
          </div>
          </div>
        </div>
      </section>
    </div>
  );
}
