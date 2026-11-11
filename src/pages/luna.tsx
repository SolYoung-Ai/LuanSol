/* ============================================================
 * Luna —— 设计师 AI 分身对话
 * ------------------------------------------------------------
 * 布局：左侧液态玻璃对话栏（桌面常驻 / 手机抽屉）+ 右侧纯白对话区。
 * 输入框是一个玻璃 composer，里面可以切换两种模式：
 *   · 对话      —— 默认 DeepSeek-V4.1-Flash（不限额度）；会员可切其余 6 款，共用每日 ¥1 额度
 *   · 图像生成  —— 自己写画面描述，可选模型 / 比例 / 风格 / 模板
 * 全页不使用渐变：白底 + 极淡描边 + 一层柔和投影，靠留白分层。
 * 人设统一来自 engine/persona.ts，全站同一份。
 * ============================================================ */
import React, { Fragment, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons';
import type { IconName } from '../components/icons';
import type { ImageTier, LunaMessage } from '../types';
import { useAuth } from '../cloud/auth';
import { useChatStore } from '../cloud/useChatStore';
import { CHAT_MODELS, chatModel as findChatModel, turnsForBudget } from '../cloud/chatModels';
import { useSubscription } from '../cloud/subscription';
import { useApp } from '../store';
import { go } from '../ui';
import { LoginDialog } from '../cloud/LoginDialog';
import { OPEN_IMAGE_MODELS, imageCost, imageLabel, imageShort, imageListCost, imageModel, imagePromoLabel, isPromoTier, resolveTier } from '../cloud/models';
import { SideNavLinks, SideAccount, SideBrand, SideFold } from '../components/SideNav';

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

/* 模板 = 一段「成品形态」前缀，拼在用户描述前面。
 * 这里覆盖平台真正能做的三类设计：包装、平面印刷、周边物料，
 * 每一项都写清「什么成品 + 什么视角」，出图才不会跑成随便一张插画。
 * group 只用于分组标题，选中值仍是 id，不影响已保存的旧项目。 */
const TEMPLATES = [
  { id: 'none', label: '不限', prompt: '' },
  // 包装
  { id: 'box', group: '包装', label: '包装盒', prompt: '产品包装盒效果图，正面视角，' },
  { id: 'gift', group: '包装', label: '礼盒', prompt: '天地盖礼盒效果图，正面视角，' },
  { id: 'bag', group: '包装', label: '手提袋', prompt: '纸质手提袋效果图，' },
  { id: 'pouch', group: '包装', label: '自立袋', prompt: '自立袋包装效果图，正面视角，' },
  { id: 'label', group: '包装', label: '瓶贴', prompt: '瓶身标签效果图，' },
  { id: 'seal', group: '包装', label: '封口贴', prompt: '圆形封口贴效果图，' },
  { id: 'carton', group: '包装', label: '快递箱', prompt: '电商快递纸箱效果图，正面视角，' },
  { id: 'cup', group: '包装', label: '纸杯', prompt: '一次性纸杯效果图，' },
  // 平面印刷
  { id: 'poster', group: '平面印刷', label: '海报', prompt: '海报版面效果图，' },
  { id: 'leaflet', group: '平面印刷', label: '三折页', prompt: '三折页宣传单效果图，平铺展开，' },
  { id: 'card', group: '平面印刷', label: '名片', prompt: '名片正反面效果图，' },
  { id: 'hangtag', group: '平面印刷', label: '吊牌', prompt: '产品吊牌效果图，' },
  { id: 'insert', group: '平面印刷', label: '说明卡', prompt: '产品说明卡效果图，' },
  // 周边物料
  { id: 'tote', group: '周边物料', label: '帆布袋', prompt: '帆布袋效果图，' },
  { id: 'tee', group: '周边物料', label: 'T恤', prompt: 'T恤印花效果图，' },
  { id: 'banner', group: '周边物料', label: '展架', prompt: '易拉宝展架效果图，' },
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
interface Option { id: string; label: string; hint?: string; locked?: boolean; group?: string }

function Pick({
  icon, caption, value, options, onPick, onLocked, tall,
}: {
  icon?: IconName;
  caption?: string;
  value: string;
  options: Option[];
  onPick: (id: string) => void;
  /** 点了会员专属档位时调用：不选中，改成弹订阅引导 */
  onLocked?: (id: string) => void;
  /** 选项多的时候给更高的弹层，避免一进来就要滚（模板有 16 项） */
  tall?: boolean;
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
          <div className={`lc-pop ${tall ? 'tall' : ''}`}>
            {options.map((o, i) => (
              <Fragment key={o.id}>
                {/* 分组标题：只在 group 变化时出现一次，列表长了才好找 */}
                {o.group && o.group !== options[i - 1]?.group && (
                  <div className="lc-pop-group">{o.group}</div>
                )}
                <button
                  className={`lc-pop-opt ${o.label === value ? 'sel' : ''} ${o.locked ? 'locked' : ''}`}
                  onClick={() => {
                    if (o.locked && onLocked) { setOpen(false); onLocked(o.id); return; }
                    onPick(o.id); setOpen(false);
                  }}
                >
                  <span>{o.label}</span>
                  <span className="lc-pop-hint">{o.locked ? '会员' : (o.hint || '')}</span>
                  {o.label === value && !o.locked && <Icon name="check" size={13} className="lc-pop-check" />}
                </button>
              </Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 「对话」这颗胶囊同时是对话模型的入口：
 *  免费版只有 DeepSeek-V4.1-Flash 可用，其余点了走订阅引导；
 *  会员可选全部，但六款会员模型共用「每人每天 ¥1」的额度，
 *  弹层里直接给一条今日额度进度条 + 每个档位「≈还能聊几轮」。
 *  真正的裁决在 useChatStore（额度用完 / 档位未开通都会退回默认模型），
 *  这里只负责把规则讲清楚，不做静默降级。 */
function ChatModelTag({ pro, value, spent, budget, onPick, onNeedPro, onQuotaEmpty, onUnavailable, onRefresh }: {
  pro: boolean;
  value: string;
  /** 今日已花费（元）；null = 统计中 / 非计量来源 */
  spent: number | null;
  budget: number;
  onPick: (id: string) => void;
  onNeedPro: () => void;
  onQuotaEmpty: () => void;
  /** 平台账号还没开通这一档：点了要说清原因，不能什么都不发生 */
  onUnavailable: (label: string) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const cur = findChatModel(value);
  const used = spent ?? 0;
  const left = Math.max(0, budget - used);
  // 只显示「用掉百分之几」：金额是内部成本口径，摊给用户看反而要解释汇率与分时价
  const pct = Math.min(100, Math.round((used / budget) * 100));
  const empty = spent !== null && used >= budget;
  const maxTurns = turnsForBudget(cur, left);

  const toggle = () => {
    if (!open) onRefresh();
    setOpen((o) => !o);
  };

  return (
    <div className="lc-pick">
      <button
        className={`lc-tag on ${open ? 'open' : ''}`}
        onClick={toggle}
        title={`对话模型：${cur.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="message" size={14} />对话
        <span className="lc-tag-sub">{cur.short}</span>
        <Icon name="chevronDown" size={12} className="lc-tag-chev" />
      </button>
      {open && (
        <>
          <div className="lc-backdrop" onClick={() => setOpen(false)} />
          <div className="lc-pop wide" role="menu">
            <div className="lc-pop-title">选择语言模型</div>

            {/* 今日额度：所有人共用一口 ¥1 的桶，会员模型按真实 token 花费计入 */}
            <div className={`lc-quota ${empty ? 'full' : ''}`}>
              <div className="lc-quota-head">
                <span>今日额度 · 会员模型</span>
                <span className="lc-quota-num">{spent === null ? '统计中…' : `${pct}%`}</span>
              </div>
              <div className="lc-quota-bar">
                {/* 0% 时不画那 1px 橙点：看起来像「已经花了 1%」，容易让人以为额度被偷跑 */}
                <i className="lc-quota-fill" style={{ width: pct > 0 ? `${Math.max(pct, 2)}%` : 0 }} />
              </div>
              <div className="lc-quota-note">
                {spent === null
                  ? '连接云端后显示今日用量'
                  : empty
                    ? '今日额度已用完，会员模型明天 0 点恢复；DeepSeek-V4.1-Flash 不限'
                    : cur.tier === 'free'
                      // 默认档不占额度，必须写清楚，否则用户以为聊几句就把额度花光了
                      ? '当前是免费默认档，不占额度；切到 PRO 模型才计算今日额度'
                      : `按当前 ${cur.short} 估算约还能聊 ${maxTurns} 轮`}
              </div>
            </div>

            {CHAT_MODELS.map((m) => {
              const planLocked = !pro && m.tier === 'pro';
              const quotaLocked = m.tier === 'pro' && empty;
              const locked = planLocked || quotaLocked || !!m.soon;
              const right = m.soon
                ? '待开通'
                : quotaLocked
                  ? '额度用完'
                  : planLocked
                    ? '会员'
                    : m.tier === 'free'
                      ? '不限'
                      : `约 ${turnsForBudget(m, left)} 轮`;
              return (
                <button
                  key={m.id}
                  role="menuitem"
                  className={`lc-pop-opt model ${m.id === value ? 'sel' : ''} ${locked ? 'locked' : ''}`}
                  title={m.soon ? '这个模型在方舟账号里尚未开通，开通后这里会自动可选' : undefined}
                  onClick={() => {
                    if (m.soon) { onUnavailable(m.label); return; }
                    if (planLocked) { onNeedPro(); return; }
                    if (quotaLocked) { onQuotaEmpty(); return; }
                    onPick(m.id); setOpen(false);
                  }}
                >
                  <span className="lc-pop-main">
                    <span className="lc-pop-name">{m.label}</span>
                    <span className="lc-pop-sub">{m.note}</span>
                  </span>
                  <span className="lc-pop-hint">{right}</span>
                  {m.id === value && !locked && <Icon name="check" size={13} className="lc-pop-check" />}
                </button>
              );
            })}

            {!pro && <div className="lc-pop-note">免费版可用 DeepSeek-V4.1-Flash；其余 6 款开通会员后解锁</div>}
            {pro && <div className="lc-pop-note">会员模型共用今日额度，按实际 token 花费计算，每天 0 点重置；默认档不占额度</div>}
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
        {/* 用户中途取消：不写错误文案，只说明「没扣积分」，让用户放心 */}
        {m.cancelled && (
          <div className="lc-msg-cancelled">
            <span className="lc-msg-cancelled-bar" aria-hidden />
            已取消，本次未扣积分
          </div>
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
  // 会员到期后老会话里可能还留着 GPT Image 2：这里先归一到当前身份可用的档位，
  // 否则界面会显示一个买不到的档、并按会员档的价格下单
  const tier: ImageTier = resolveTier(active?.imageTier || chat.draftTier, sub.isPro);

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
      // GPT Image 2 的「文字输入」档不收参考图，带图必须走「输入图」档。
      // 这里明说一句，避免用户以为还是文字档的价却按改图档扣。
      if (imageModel(tier).id === 'gpt2-text') {
        chat.setTier('gpt2-ref');
        setToast(`已切到「${imageLabel('gpt2-ref')}」（${imageCost('gpt2-ref')} 积分/张），因为这次带了参考图`);
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
        setToast(`「${imageLabel('gpt2-ref')}」需要先上传参考图；只用文字的话请切到「${imageLabel('gpt2-text')}」档（${imageCost('gpt2-text')} 积分）`);
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
          {/* 桌面端品牌头与全站左栏完全一致（同一组件、同一字号、同一套 EN/深色按钮）：
              以前这里是「Luna / 你的专属设计师」，和别的页面对不上，看起来像两个产品 */}
          {!isMobile && <SideBrand />}
          {/* 桌面端把全站三个主入口接进这条侧栏，和左栏其他页面保持同一套信息架构；
              手机端仍是「抽屉里只有对话」，不动已被验收过的移动端布局 */}
          {!isMobile && <><SideNavLinks /><div className="sd-divider" /></>}
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
            {/* 桌面端用全站统一的账号卡（余额 + 用量 + 查看计划 + 账户菜单），
                手机端保持原来的「头像 + 昵称 + 同步状态」一栏 */}
            {!isMobile ? <SideAccount syncLabel={syncLabel} /> : <div className="lc-user">
              <div className="lc-user-avatar">
                {auth.user.avatarUrl
                  ? <img src={auth.user.avatarUrl} alt="头像" />
                  : initial}
              </div>
              <div className="lc-user-meta">
                <div className="lc-user-name">{auth.user.label || auth.user.email}</div>
                <div className={`lc-user-sync ${chat.syncState}`}>{syncLabel}</div>
              </div>
            </div>}
          </div>
        </div>

        {/* 收起后只留一列图标快捷入口，点「搜索」会直接把侧栏展开 */}
        {!isMobile && !sideOpen && <div className="lc-rail">
          <button className="lc-rail-logo" title="展开侧栏" aria-label="展开侧栏" onClick={() => setSideOpen(true)}>
            <img src="./logo.png" alt="" />
          </button>
          <button className="lc-rail-btn" title="新建对话" aria-label="新建对话" onClick={makeNew}>
            <Icon name="plus" size={18} />
          </button>
          <button className="lc-rail-btn" title="展开侧栏并搜索" aria-label="展开侧栏并搜索" onClick={() => setSideOpen(true)}>
            <Icon name="search" size={18} />
          </button>
          {/* 收起后仍要能跳去别的页，否则「左栏」一收就把导航弄丢了 */}
          <div className="lc-rail-sep" />
          <button className="lc-rail-btn" title="工作台" aria-label="工作台" onClick={() => go('/workspace')}>
            <Icon name="folder" size={18} />
          </button>
          <button className="lc-rail-btn" title="审美市场" aria-label="审美市场" onClick={() => go('/market')}>
            <Icon name="grid" size={18} />
          </button>
        </div>}

        {/* 桌面端：贴边小胶囊收起/展开（和工作台等页面的左栏同一颗按钮）；
            移动端保留顶部圆形关闭按钮 */}
        {!isMobile
          ? <SideFold folded={!sideOpen} onClick={() => setSideOpen((o) => !o)} />
          : <button
            className="lc-side-toggle"
            onClick={toggleSide}
            title="关闭菜单"
            aria-label="关闭菜单"
          >
            <Icon name="close" size={16} />
            <span className="lc-side-toggle-text">关闭菜单</span>
          </button>}
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
              {/* 预备期：这 3 秒里请求还没发出去，取消是真的不花钱 */}
              {chat.preflight > 0 && (
                <div className="lc-msg assistant">
                  <div className="lc-msg-avatar"><img src="./logo.png" alt="Luna" /></div>
                  <div className="lc-preflight">
                    <span className="lc-preflight-count">{chat.preflight}</span>
                    <span className="lc-preflight-text">秒后开始生成</span>
                    <button className="lc-preflight-cancel" onClick={chat.cancel}>取消</button>
                  </div>
                </div>
              )}
              {/* 已经开跑：这里不再给取消——请求已经发出去了，取消也拦不住计费 */}
              {chat.busy && chat.preflight === 0 && (
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
                // 参考图去掉后回到「文字输入」档，不然会按更贵的图生图档下单
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
                    <ChatModelTag
                      pro={sub.isPro}
                      value={chat.chatModel}
                      spent={chat.chatSpendRmb}
                      budget={chat.chatBudgetRmb}
                      onPick={chat.setChatModel}
                      onNeedPro={() => sub.setPaywall(true, '会员专属模型（Kimi-K3.1-Pro、DeepSeek-V4-pro、Doubao-Seed、GLM、经济版）开通会员后解锁，每天共用一份额度')}
                      onQuotaEmpty={() => setToast('今日语言模型额度已用完，明天 0 点恢复；DeepSeek-V4.1-Flash 不限额度，可以继续聊')}
                      onUnavailable={(label) => setToast(`${label} 还没有在当前火山方舟账号开通，开通后这里会自动可选`)}
                      onRefresh={() => void chat.refreshChatSpend()}
                    />
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
                        hint: m.cost < m.listCost
                          ? `${m.cost} 积分 · 原价 ${m.listCost}`
                          : `${m.cost} 积分`,
                        locked: !!m.pro && !sub.isPro,
                      }))}
                      onPick={(id) => chat.setTier(id as ImageTier)}
                      onLocked={() => sub.setPaywall(true, 'GPT Image 2 是会员专属生图模型：出图质量最高，支持文字出图与参考图改图。免费版可用 Seedream 5.0 Flash / Pro，开通会员后这两档自动解锁。')}
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
                      options={TEMPLATES.map((t) => ({ id: t.id, label: t.label, group: t.group }))}
                      onPick={setTemplateId}
                      tall
                    />
                  </>
                )}
              </div>

              {/* 预备期：这颗按钮是「取消」，同一位置，不用去别处找；
                  过了 3 秒请求已经发出，按钮回到禁用的发送态，避免给出停不掉的承诺 */}
              {chat.preflight > 0 ? (
                <button className="lc-send is-stop" title="取消这次生成（还没开始，不扣积分）" aria-label="取消生成" onClick={chat.cancel}>
                  <span className="lc-stop-square" />
                </button>
              ) : chat.busy ? (
                <button className="lc-send" title="正在生成…" aria-label="正在生成" disabled>
                  <Icon name={mode === 'image' ? 'image' : 'send'} size={17} />
                </button>
              ) : (
                <button
                  className="lc-send"
                  title={mode === 'image' ? '生成图片' : '发送'}
                  onClick={doSend}
                  disabled={!canSend}
                >
                  <Icon name={mode === 'image' ? 'image' : 'send'} size={17} />
                </button>
              )}
            </div>
          </div>

          {/* 底部只留图像模式的计费说明；对话模型入口已经并到「对话」胶囊里 */}
          {mode === 'image' && (
            <div className="lc-dock-hint">
              <span className="lc-hint-text">
                {tierName(tier)} · {tierCost(tier)} 积分/张
                {isPromoTier(tier) ? `（${imagePromoLabel(tier)}，原价 ${imageListCost(tier)}）` : ''}
                {typeof balance === 'number' ? ` · 当前余额 ${balance}` : ''}
              </span>
            </div>
          )}
          </div>
        </div>
      </section>
    </div>
  );
}
