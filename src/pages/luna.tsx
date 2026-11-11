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
import { useLang } from '../i18n';

/** 名称类常量存双语：模块加载时拿不到当前语言，只能在渲染时挑。
 *  prompt 一律保持中文——它进的是生图模型提示词，决定画面里的文字语言。 */
type L = { zh: string; en: string };

type LunaMode = 'chat' | 'image';

// 档位名称与价格全部来自 cloud/models.ts，界面上显示多少就扣多少
const tierName = (t: ImageTier) => imageLabel(t);
const tierShort = (t: ImageTier) => imageShort(t);
const tierCost = (t: ImageTier) => imageCost(t);

/** 比例 → Seedream 实际出图尺寸（自动则交给服务端默认 1024×1024） */
const RATIOS: { id: string; label: L; size: string | undefined }[] = [
  { id: 'auto', label: { zh: '自动', en: 'Auto' }, size: undefined },
  { id: '1:1', label: { zh: '1:1', en: '1:1' }, size: '1024x1024' },
  { id: '3:4', label: { zh: '3:4', en: '3:4' }, size: '864x1152' },
  { id: '4:3', label: { zh: '4:3', en: '4:3' }, size: '1152x864' },
  { id: '16:9', label: { zh: '16:9', en: '16:9' }, size: '1280x720' },
  { id: '9:16', label: { zh: '9:16', en: '9:16' }, size: '720x1280' },
];

const STYLES: { id: string; label: L; prompt: string }[] = [
  { id: 'none', label: { zh: '不限', en: 'Any' }, prompt: '' },
  { id: 'photo', label: { zh: '商业摄影', en: 'Product photo' }, prompt: '商业摄影棚拍风格，柔光，干净背景，高清质感。' },
  { id: 'minimal', label: { zh: '极简平面', en: 'Minimal graphic' }, prompt: '极简平面设计，大面积留白，克制配色，干净排版。' },
  { id: 'ink', label: { zh: '东方水墨', en: 'Ink wash' }, prompt: '中国水墨画风格，宣纸质感，淡墨晕染，留白意境。' },
  { id: 'retro', label: { zh: '复古手绘', en: 'Retro hand-drawn' }, prompt: '复古手绘插画风格，做旧纸张质感，暖色调。' },
  { id: '3d', label: { zh: '3D 立体', en: '3D render' }, prompt: '3D 渲染风格，柔和布光，圆润体积感，细腻材质。' },
];

/* 模板 = 一段「成品形态」前缀，拼在用户描述前面。
 * 这里覆盖平台真正能做的三类设计：包装、平面印刷、周边物料，
 * 每一项都写清「什么成品 + 什么视角」，出图才不会跑成随便一张插画。
 * group 只用于分组标题，选中值仍是 id，不影响已保存的旧项目。 */
const PACK: L = { zh: '包装', en: 'Packaging' };
const PRINT: L = { zh: '平面印刷', en: 'Print' };
const MERCH: L = { zh: '周边物料', en: 'Merch' };

const TEMPLATES: { id: string; label: L; group?: L; prompt: string }[] = [
  { id: 'none', label: { zh: '不限', en: 'Any' }, prompt: '' },
  // 包装
  { id: 'box', group: PACK, label: { zh: '包装盒', en: 'Box' }, prompt: '产品包装盒效果图，正面视角，' },
  { id: 'gift', group: PACK, label: { zh: '礼盒', en: 'Gift box' }, prompt: '天地盖礼盒效果图，正面视角，' },
  { id: 'bag', group: PACK, label: { zh: '手提袋', en: 'Paper bag' }, prompt: '纸质手提袋效果图，' },
  { id: 'pouch', group: PACK, label: { zh: '自立袋', en: 'Stand-up pouch' }, prompt: '自立袋包装效果图，正面视角，' },
  { id: 'label', group: PACK, label: { zh: '瓶贴', en: 'Bottle label' }, prompt: '瓶身标签效果图，' },
  { id: 'seal', group: PACK, label: { zh: '封口贴', en: 'Seal sticker' }, prompt: '圆形封口贴效果图，' },
  { id: 'carton', group: PACK, label: { zh: '快递箱', en: 'Shipping carton' }, prompt: '电商快递纸箱效果图，正面视角，' },
  { id: 'cup', group: PACK, label: { zh: '纸杯', en: 'Paper cup' }, prompt: '一次性纸杯效果图，' },
  // 平面印刷
  { id: 'poster', group: PRINT, label: { zh: '海报', en: 'Poster' }, prompt: '海报版面效果图，' },
  { id: 'leaflet', group: PRINT, label: { zh: '三折页', en: 'Tri-fold leaflet' }, prompt: '三折页宣传单效果图，平铺展开，' },
  { id: 'card', group: PRINT, label: { zh: '名片', en: 'Business card' }, prompt: '名片正反面效果图，' },
  { id: 'hangtag', group: PRINT, label: { zh: '吊牌', en: 'Hang tag' }, prompt: '产品吊牌效果图，' },
  { id: 'insert', group: PRINT, label: { zh: '说明卡', en: 'Insert card' }, prompt: '产品说明卡效果图，' },
  // 周边物料
  { id: 'tote', group: MERCH, label: { zh: '帆布袋', en: 'Tote bag' }, prompt: '帆布袋效果图，' },
  { id: 'tee', group: MERCH, label: { zh: 'T恤', en: 'T-shirt' }, prompt: 'T恤印花效果图，' },
  { id: 'banner', group: MERCH, label: { zh: '展架', en: 'Roll-up banner' }, prompt: '易拉宝展架效果图，' },
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
  const { t } = useLang();
  // 默认折叠，避免一大串思考内容刷屏；用户点击标题可自行展开
  const [open, setOpen] = useState(false);
  return (
    <div className="lc-reason">
      <button className="lc-reason-head" onClick={() => setOpen((o) => !o)}>
        <Icon name="brain" size={14} />
        <span>{t('思考过程', 'Reasoning')}</span>
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
  const { t } = useLang();
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
                  <span className="lc-pop-hint">{o.locked ? t('会员', 'Pro') : (o.hint || '')}</span>
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
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const cur = findChatModel(value);
  const shortOf = (m: { short: string; shortEn?: string }) => (lang === 'en' ? (m.shortEn || m.short) : m.short);
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
        title={t(`对话模型：${cur.label}`, `Chat model: ${cur.label}`)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="message" size={14} />{t('对话', 'Chat')}
        <span className="lc-tag-sub">{shortOf(cur)}</span>
        <Icon name="chevronDown" size={12} className="lc-tag-chev" />
      </button>
      {open && (
        <>
          <div className="lc-backdrop" onClick={() => setOpen(false)} />
          <div className="lc-pop wide" role="menu">
            <div className="lc-pop-title">{t('选择语言模型', 'Choose a language model')}</div>

            {/* 今日额度：所有人共用一口 ¥1 的桶，会员模型按真实 token 花费计入 */}
            <div className={`lc-quota ${empty ? 'full' : ''}`}>
              <div className="lc-quota-head">
                <span>{t('今日额度 · 会员模型', 'Today’s quota · Pro models')}</span>
                <span className="lc-quota-num">{spent === null ? t('统计中…', 'Calculating…') : `${pct}%`}</span>
              </div>
              <div className="lc-quota-bar">
                {/* 0% 时不画那 1px 橙点：看起来像「已经花了 1%」，容易让人以为额度被偷跑 */}
                <i className="lc-quota-fill" style={{ width: pct > 0 ? `${Math.max(pct, 2)}%` : 0 }} />
              </div>
              <div className="lc-quota-note">
                {spent === null
                  ? t('连接云端后显示今日用量', 'Connect to the cloud to see today’s usage')
                  : empty
                    ? t('今日额度已用完，会员模型明天 0 点恢复；DeepSeek-V4.1-Flash 不限',
                      'Quota used up — Pro models reset at midnight; DeepSeek-V4.1-Flash has no limit')
                    : cur.tier === 'free'
                      // 默认档不占额度，必须写清楚，否则用户以为聊几句就把额度花光了
                      ? t('当前是免费默认档，不占额度；切到 PRO 模型才计算今日额度',
                        'You are on the free default model, which uses no quota — only Pro models count')
                      : t(`按当前 ${shortOf(cur)} 估算约还能聊 ${maxTurns} 轮`,
                        `About ${maxTurns} more turns at the current rate`)}
              </div>
            </div>

            {CHAT_MODELS.map((m) => {
              const planLocked = !pro && m.tier === 'pro';
              const quotaLocked = m.tier === 'pro' && empty;
              const locked = planLocked || quotaLocked || !!m.soon;
              const right = m.soon
                ? t('待开通', 'Soon')
                : quotaLocked
                  ? t('额度用完', 'Quota used up')
                  : planLocked
                    ? t('会员', 'Pro')
                    : m.tier === 'free'
                      ? t('不限', 'Unlimited')
                      : t(`约 ${turnsForBudget(m, left)} 轮`, `~${turnsForBudget(m, left)} turns`);
              return (
                <button
                  key={m.id}
                  role="menuitem"
                  className={`lc-pop-opt model ${m.id === value ? 'sel' : ''} ${locked ? 'locked' : ''}`}
                  title={m.soon
                    ? t('这个模型在方舟账号里尚未开通，开通后这里会自动可选',
                      'Not enabled on the platform account yet — it becomes selectable automatically once it is')
                    : undefined}
                  onClick={() => {
                    if (m.soon) { onUnavailable(m.label); return; }
                    if (planLocked) { onNeedPro(); return; }
                    if (quotaLocked) { onQuotaEmpty(); return; }
                    onPick(m.id); setOpen(false);
                  }}
                >
                  <span className="lc-pop-main">
                    <span className="lc-pop-name">{m.label}</span>
                    <span className="lc-pop-sub">{lang === 'en' ? m.noteEn : m.note}</span>
                  </span>
                  <span className="lc-pop-hint">{right}</span>
                  {m.id === value && !locked && <Icon name="check" size={13} className="lc-pop-check" />}
                </button>
              );
            })}

            {!pro && <div className="lc-pop-note">
              {t('免费版可用 DeepSeek-V4.1-Flash；其余 6 款开通会员后解锁',
                'The free plan includes DeepSeek-V4.1-Flash; the other six unlock with membership')}
            </div>}
            {pro && <div className="lc-pop-note">
              {t('会员模型共用今日额度，按实际 token 花费计算，每天 0 点重置；默认档不占额度',
                'Pro models share today’s quota, charged by actual token usage and reset at midnight; the default model is free')}
            </div>}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------- 单条消息 --------------------------- */
function Bubble({ m, onMedia }: { m: LunaMessage; onMedia?: () => void }) {
  const { t } = useLang();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const isUser = m.role === 'user';
  return (
    <div className={`lc-msg ${isUser ? 'user' : 'assistant'}`}>
      <div className="lc-msg-avatar">{isUser ? t('我', 'Me') : <img src="./logo.png" alt="Luna" />}</div>
      <div className="lc-msg-body">
        {m.reasoning && <ReasoningBlock reasoning={m.reasoning} />}
        {m.content && m.content !== '（参考图）' && (
          <div className={`lc-msg-text ${m.error ? 'error' : ''}`}>{toPlainText(m.content)}</div>
        )}
        {/* 用户中途取消：不写错误文案，只说明「没扣积分」，让用户放心 */}
        {m.cancelled && (
          <div className="lc-msg-cancelled">
            <span className="lc-msg-cancelled-bar" aria-hidden />
            {t('已取消，本次未扣积分', 'Cancelled — no credits were charged')}
          </div>
        )}
        {m.image && (
          <div className="lc-msg-imgwrap">
            <img
              src={m.image}
              alt={t('设计图', 'Design')}
              className="lc-msg-img"
              onLoad={onMedia}
              onClick={() => setLightbox(m.image!)}
            />
            {m.imageTier && !isUser && (
              <span className="lc-img-tag">
                <Icon name="image" size={12} /> {tierShort(m.imageTier)} · {t(`${tierCost(m.imageTier)} 积分`, `${tierCost(m.imageTier)} credits`)}
              </span>
            )}
          </div>
        )}
      </div>
      {lightbox && (
        <div className="lc-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt={t('放大预览', 'Enlarged preview')} />
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
  const { lang, t } = useLang();
  /** 双语常量取当前语言 */
  const L = (v: L) => (lang === 'en' ? v.en : v.zh);
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
    if (f.size > 4 * 1024 * 1024) { setToast(t('图片请小于 4MB', 'The image must be smaller than 4 MB.')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(String(reader.result));
      // GPT Image 2 的「文字输入」档不收参考图，带图必须走「输入图」档。
      // 这里明说一句，避免用户以为还是文字档的价却按改图档扣。
      if (imageModel(tier).id === 'gpt2-text') {
        chat.setTier('gpt2-ref');
        setToast(t(`已切到「${imageLabel('gpt2-ref')}」（${imageCost('gpt2-ref')} 积分/张），因为这次带了参考图`,
          `Switched to “${imageLabel('gpt2-ref')}” (${imageCost('gpt2-ref')} credits each) because a reference image is attached.`));
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
        setToast(t('先描述一下画面，比如「国风茶叶礼盒，米白底，烫金纹样，正面视角」',
          'Describe the scene first, e.g. “oriental tea gift box, cream background, gold foil pattern, front view”.'));
        return;
      }
      // 该档位必须有参考图，否则云函数会直接拒绝（不扣分，但白等一场）
      if (imageModel(tier).needsRef && !img) {
        setToast(t(`「${imageLabel('gpt2-ref')}」需要先上传参考图；只用文字的话请切到「${imageLabel('gpt2-text')}」档（${imageCost('gpt2-text')} 积分）`,
          `“${imageLabel('gpt2-ref')}” needs a reference image. To work from text only, switch to “${imageLabel('gpt2-text')}” (${imageCost('gpt2-text')} credits).`));
        return;
      }
      // 余额不足时先拦住：绝不能先把输入框清空再被拒——用户刚写好的提示词会凭空消失
      if (typeof balance === 'number' && balance < tierCost(tier)) {
        setToast(t(`积分不足：${tierCost(tier)} 积分/张，当前余额 ${balance}。去「积分与充值」签到或兑换后再试。`,
          `Not enough credits: ${tierCost(tier)} per image, balance ${balance}. Top up on the Credits page and try again.`));
        return;
      }
      setPendingImage(null);
      setInput('');
      void chat.generateImage(text || t('按参考图生成一张包装效果图', 'Generate a packaging mockup from the reference image'), {
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
          <h1 style={{ fontSize: 32, marginBottom: 12 }}>
            {t('先登录，再和 Luna 聊设计', 'Sign in to talk design with Luna')}
          </h1>
          <p style={{ color: '#737373', marginBottom: 24 }}>
            {t('对话会按账号保存到云端，换设备也能看到。',
              'Conversations are saved to your account, so they follow you across devices.')}
          </p>
          <button className="v4-btn-dark" onClick={() => setLoginOpen(true)}>{t('登录 / 注册', 'Sign in')}</button>
        </div>
        <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={() => {}} />
      </div>
    );
  }

  const initial = (auth.user.label || auth.user.email || 'U').slice(0, 1).toUpperCase();
  // 只有真的同步成功才说「已同步」：免费用户与尚未同步时都如实显示「本机保存」
  const syncLabel = !sub.isPro
    ? t('本机保存', 'Saved locally')
    : chat.syncState === 'syncing'
      ? t('同步中…', 'Syncing…')
      : chat.syncState === 'error'
        ? t('同步失败', 'Sync failed')
        : chat.syncState === 'ok' ? t('已同步到云端', 'Synced to the cloud') : t('本机保存', 'Saved locally');
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
            <span>{t('新建对话', 'New chat')}</span>
          </button>

          <div className="lc-search">
            <Icon name="search" size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('搜索对话', 'Search chats')}
            />
          </div>

          <div className="lc-group-label">{t('聊天', 'Chats')}</div>
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
                  <button title={t('重命名', 'Rename')} onClick={() => startEdit(c.id, c.title)}>
                    <Icon name="edit" size={14} />
                  </button>
                  <button title={t('删除', 'Delete')} onClick={() => void chat.deleteConversation(c.id)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="lc-list-empty">{t('没有对话', 'No chats yet')}</div>}
          </div>

          <div className="lc-side-foot">
            {/* 桌面端用全站统一的账号卡（余额 + 用量 + 查看计划 + 账户菜单），
                手机端保持原来的「头像 + 昵称 + 同步状态」一栏 */}
            {!isMobile ? <SideAccount syncLabel={syncLabel} /> : <div className="lc-user">
              <div className="lc-user-avatar">
                {auth.user.avatarUrl
                  ? <img src={auth.user.avatarUrl} alt={t('头像', 'Avatar')} />
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
          <button className="lc-rail-logo" title={t('展开侧栏', 'Expand sidebar')} aria-label={t('展开侧栏', 'Expand sidebar')} onClick={() => setSideOpen(true)}>
            <img src="./logo.png" alt="" />
          </button>
          <button className="lc-rail-btn" title={t('新建对话', 'New chat')} aria-label={t('新建对话', 'New chat')} onClick={makeNew}>
            <Icon name="plus" size={18} />
          </button>
          <button className="lc-rail-btn" title={t('展开侧栏并搜索', 'Expand and search')} aria-label={t('展开侧栏并搜索', 'Expand and search')} onClick={() => setSideOpen(true)}>
            <Icon name="search" size={18} />
          </button>
          {/* 收起后仍要能跳去别的页，否则「左栏」一收就把导航弄丢了 */}
          <div className="lc-rail-sep" />
          <button className="lc-rail-btn" title={t('工作台', 'Workspace')} aria-label={t('工作台', 'Workspace')} onClick={() => go('/workspace')}>
            <Icon name="folder" size={18} />
          </button>
          <button className="lc-rail-btn" title={t('审美市场', 'Aesthetic Index')} aria-label={t('审美市场', 'Aesthetic Index')} onClick={() => go('/market')}>
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
            title={t('关闭菜单', 'Close menu')}
            aria-label={t('关闭菜单', 'Close menu')}
          >
            <Icon name="close" size={16} />
            <span className="lc-side-toggle-text">{t('关闭菜单', 'Close menu')}</span>
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
          <button className="lc-drawer-btn" onClick={() => setDrawerOpen(true)}
            title={t('打开对话列表', 'Open chat list')} aria-label={t('打开对话列表', 'Open chat list')}>
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
                    <span className="lc-preflight-text">
                      {t('秒后开始生成', 's until generation starts')}
                    </span>
                    <button className="lc-preflight-cancel" onClick={chat.cancel}>{t('取消', 'Cancel')}</button>
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
            <h1>{mode === 'image'
              ? t('想画点什么，直接说。', 'Tell me what to draw.')
              : t('我是 Luna，你的专属设计师。', 'I’m Luna, your personal designer.')}</h1>
            <p>
              {mode === 'image'
                ? t('描述画面、风格和用途，我直接出图；需要先聊清楚需求也行。',
                  'Describe the scene, style and use — I render it directly. We can also talk the brief through first.')
                : t('产品、品牌、包装、海报，任何设计想法都可以丢给我。',
                  'Product, brand, packaging, poster — any design idea is welcome.')}
            </p>
            <div className="lc-seg" role="tablist" aria-label={t('对话模式', 'Mode')}>
              <button
                className={`lc-seg-btn ${mode === 'chat' ? 'on' : ''}`}
                role="tab" aria-selected={mode === 'chat'}
                onClick={() => setMode('chat')}
              >{t('对话', 'Chat')}</button>
              <button
                className={`lc-seg-btn ${mode === 'image' ? 'on' : ''}`}
                role="tab" aria-selected={mode === 'image'}
                onClick={() => setMode('image')}
              >{t('图像生成', 'Image')}</button>
            </div>
          </div>
        )}

        {/* ------------------------------ 输入区 ------------------------------ */}
        <div className="lc-dock">
          <div className="lc-dock-inner">
          {pendingImage && (
            <div className="lc-pending">
              <img src={pendingImage} alt={t('待发送', 'Pending')} />
              <span>{mode === 'image'
                ? t('参考图已就绪，会按它出图', 'Reference ready — the image will follow it')
                : t('参考图已就绪', 'Reference ready')}</span>
              <button onClick={() => {
                setPendingImage(null);
                // 参考图去掉后回到「文字输入」档，不然会按更贵的图生图档下单
                if (imageModel(tier).id === 'gpt2-ref') chat.setTier('gpt2-text');
              }} aria-label={t('移除参考图', 'Remove reference')}>
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
              placeholder={mode === 'image'
                ? t('描述你想要的图片', 'Describe the image you want')
                : t('告诉 Luna 你的想法…', 'Tell Luna what you have in mind…')}
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
                <button className="lc-round" title={t('上传参考图', 'Upload reference')} onClick={() => fileRef.current?.click()}>
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
                      onNeedPro={() => sub.setPaywall(true, t(
                        '会员专属模型（Kimi-K3.1-Pro、DeepSeek-V4-pro、Doubao-Seed、GLM、经济版）开通会员后解锁，每天共用一份额度',
                        'Members-only models (Kimi-K3.1-Pro, DeepSeek-V4-pro, Doubao-Seed, GLM, Eco) unlock with membership and share one daily quota.'))}
                      onQuotaEmpty={() => setToast(t(
                        '今日语言模型额度已用完，明天 0 点恢复；DeepSeek-V4.1-Flash 不限额度，可以继续聊',
                        'Today’s chat quota is used up — it resets at midnight. DeepSeek-V4.1-Flash has no limit, so you can keep chatting.'))}
                      onUnavailable={(label) => setToast(t(
                        `${label} 还没有在当前火山方舟账号开通，开通后这里会自动可选`,
                        `${label} is not enabled on the platform account yet — it becomes selectable once it is.`))}
                      onRefresh={() => void chat.refreshChatSpend()}
                    />
                    <button className="lc-tag" onClick={() => setMode('image')} title={t('切换到图像生成', 'Switch to image generation')}>
                      <Icon name="image" size={14} />{t('图像生成', 'Image')}
                      <Icon name="chevronRight" size={12} className="lc-tag-chev" />
                    </button>
                  </>
                ) : (
                  <>
                    <button className="lc-tag on removable" onClick={() => setMode('chat')} title={t('退出图像生成', 'Leave image generation')}>
                      <Icon name="image" size={14} />{t('图像生成', 'Image')}
                      <Icon name="close" size={12} className="lc-tag-chev" />
                    </button>
                    <Pick
                      icon="spark"
                      caption={t('模型', 'Model')}
                      value={tierName(tier)}
                      options={OPEN_IMAGE_MODELS.map((m) => ({
                        id: m.id,
                        label: m.label,
                        hint: m.cost < m.listCost
                          ? t(`${m.cost} 积分 · 原价 ${m.listCost}`, `${m.cost} credits · was ${m.listCost}`)
                          : t(`${m.cost} 积分`, `${m.cost} credits`),
                        locked: !!m.pro && !sub.isPro,
                      }))}
                      onPick={(id) => chat.setTier(id as ImageTier)}
                      onLocked={() => sub.setPaywall(true, t(
                        'GPT Image 2 是会员专属生图模型：出图质量最高，支持文字出图与参考图改图。免费版可用 Seedream 5.0 Flash / Pro，开通会员后这两档自动解锁。',
                        'GPT Image 2 is a members-only model: the best output quality, with text rendering and reference-based editing. The free plan includes Seedream 5.0 Flash / Pro, and both unlock with membership.'))}
                    />
                    <Pick
                      caption={t('比例', 'Ratio')}
                      value={L(ratio.label)}
                      options={RATIOS.map((r) => ({ id: r.id, label: L(r.label) }))}
                      onPick={setRatioId}
                    />
                    <Pick
                      caption={t('风格', 'Style')}
                      value={L(style.label)}
                      options={STYLES.map((st) => ({ id: st.id, label: L(st.label) }))}
                      onPick={setStyleId}
                    />
                    <Pick
                      caption={t('模板', 'Template')}
                      value={L(template.label)}
                      options={TEMPLATES.map((tp) => ({
                        id: tp.id, label: L(tp.label), group: tp.group ? L(tp.group) : undefined,
                      }))}
                      onPick={setTemplateId}
                      tall
                    />
                  </>
                )}
              </div>

              {/* 预备期：这颗按钮是「取消」，同一位置，不用去别处找；
                  过了 3 秒请求已经发出，按钮回到禁用的发送态，避免给出停不掉的承诺 */}
              {chat.preflight > 0 ? (
                <button className="lc-send is-stop"
                  title={t('取消这次生成（还没开始，不扣积分）', 'Cancel this generation — it has not started, so nothing is charged')}
                  aria-label={t('取消生成', 'Cancel generation')} onClick={chat.cancel}>
                  <span className="lc-stop-square" />
                </button>
              ) : chat.busy ? (
                <button className="lc-send" title={t('正在生成…', 'Generating…')} aria-label={t('正在生成', 'Generating')} disabled>
                  <Icon name={mode === 'image' ? 'image' : 'send'} size={17} />
                </button>
              ) : (
                <button
                  className="lc-send"
                  title={mode === 'image' ? t('生成图片', 'Generate image') : t('发送', 'Send')}
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
                {tierName(tier)} · {t(`${tierCost(tier)} 积分/张`, `${tierCost(tier)} credits / image`)}
                {isPromoTier(tier)
                  ? t(`（${imagePromoLabel(tier)}，原价 ${imageListCost(tier)}）`,
                    ` (${imagePromoLabel(tier)}, was ${imageListCost(tier)})`)
                  : ''}
                {typeof balance === 'number' ? t(` · 当前余额 ${balance}`, ` · balance ${balance}`) : ''}
              </span>
            </div>
          )}
          </div>
        </div>
      </section>
    </div>
  );
}
