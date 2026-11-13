/* ============================================================
 * 帮助与反馈
 * ------------------------------------------------------------
 * 原则：只写现在真实成立的事。
 *  - 流程已从「九步向导」改为「创作入口 → 确认需求 → 设计方案 → 编辑器」
 *  - 积分口径以 src/cloud/plans.ts 为准，不在这里另写一份数字
 *  - 短信验证码已停用（成本约 0.05 元/条），登录只走邮箱
 *  - 支付通道已上线（Creem），中国内地走兑换码 / 微信
 * 分组用 iOS 设置页的组织方式：玻璃卡 + 可展开的行，默认只露问题。
 *
 * 双语做法：所有文案收在 buildGroups(t) / buildUpdates(t) / buildLinks(t) 里，
 * 由组件渲染时调用。不能在模块顶层直接调 t()——那会在加载时定型，切语言不跟着变。
 * ============================================================ */
import React, { useState } from 'react';
import { Icon } from '../components/icons';
import { go } from '../ui';
import { useLang } from '../i18n';
import { PRICING } from '../cloud/plans';
import { imageCost, imagePromoLabel } from '../cloud/models';

type TFn = (zh: string, en: string) => string;
type Faq = { q: string; a: React.ReactNode };
type Group = { id: string; title: string; en: string; items: Faq[] };

const WX_ID = 'soyo-ang';

function buildGroups(t: TFn): Group[] {
  const packsOnline = PRICING.creditsPacks
    .map((p) => t(`${p.points} 积分 US$${p.priceUSD}`, `${p.points} credits US$${p.priceUSD}`))
    .join(' / ');
  const packsCode = PRICING.creditsPacks.map((p) => `${p.points} = ¥${p.priceRMB}`).join(' / ');

  return [
    {
      id: 'start',
      title: t('开始设计', 'Getting started'),
      en: 'START',
      items: [
        {
          q: t('第一次用，怎么开始？', 'First time here — how do I start?'),
          a: <>
            {t('登录后从首页点「开始设计」，或在工作台点「新建设计」。整条流程只有四步：',
              'Sign in, then hit “Start” on the home page, or “New design” in the workspace. The whole flow is four steps: ')}
            <strong>{t('创作入口 → 确认需求 → 设计方案 → 编辑器', 'Start → Requirements → Concepts → Editor')}</strong>
            {t('。前两步是填信息，第三步 AI 出图，第四步在编辑器里改（含 3D 预览与刀模印前）。',
              '. The first two collect information, the third renders images, and the fourth is where you refine them (with 3D preview and dieline prepress).')}
          </>,
        },
        {
          q: t('「我有参考图」和「从零开始」有什么区别？',
            'What is the difference between “I have references” and “from scratch”?'),
          a: <>
            {t('两条路都会进入同一张「确认需求」表单，区别只在起点：选「我有参考图 / 设计方向」时，你可以在第一步上传参考图，AI 会按你的方向落地；选「我没有，从零开始」时，你只描述产品，由 AI 提方向。拿不准就选从零开始，下一步补产品信息即可。',
              'Both paths lead to the same Requirements form; only the starting point differs. “I have references” lets you upload images up front and AI follows your direction. “From scratch” asks you to describe the product and lets AI propose the direction. If unsure, pick from scratch — you can add product details on the next step.')}
          </>,
        },
        {
          q: t('确认需求里每一项都要填吗？', 'Do I have to fill in every field?'),
          a: <>
            {t('必填只有', 'Only the ')}<strong>{t('产品名称', 'product name')}</strong>
            {t('。其余（包装主题色、插画元素、一级/二级卖点、净含量、产品信息、LOGO、条形码）都是可选项——不填就不出现在设计里，绝不会替你编一个条码或备案号。LOGO 支持上传、或只填名称让 AI 生成一个临时字标。',
              ' is required. Everything else — theme colors, illustration elements, selling points, net content, production details, logo, barcode — is optional: leave it blank and it stays off the artwork. We never invent a barcode or a license number. For the logo you can upload one, or give a name and let AI set a temporary wordmark.')}
          </>,
        },
        {
          q: t('AI 出的图能改吗？', 'Can I edit what AI generates?'),
          a: <>
            {t('能。方案页点「继续设计」进入编辑器后，尺寸、结构、配色、每个文字图层、LOGO、图片位置都可以手动调，顶部可切「平面设计 / 3D 预览 / 刀模印前」。AI 是起点，不是终点。',
              'Yes. After “Continue designing” from the concepts page you can adjust dimensions, structure, colors, every text layer, the logo and image placement, and switch between 2D design, 3D preview and dieline prepress at the top. AI is the starting point, not the end.')}
          </>,
        },
      ],
    },
    {
      id: 'credits',
      title: t('积分', 'Credits'),
      en: 'CREDITS',
      items: [
        {
          q: t('积分怎么扣？', 'How are credits charged?'),
          a: <>
            <strong>{t('对话不扣积分', 'Chat costs no credits')}</strong>
            {t('。AI 生图按档位：', '. AI image generation is charged per tier: ')}
            <strong>Seedream {t('快速', 'Fast')} {PRICING.costs.imageFlash} {t('积分/张', 'credits/image')}</strong>
            {' · '}
            <strong>Seedream {t('精细', 'Fine')} {PRICING.costs.imagePro} {t('积分/张', 'credits/image')}</strong>
            {t('；', '. ')}
            <strong>GPT Image 2 {t('文字输入', 'text')} {imageCost('gpt2-text')} {t('积分/张', 'credits/image')}</strong>
            {t(`（原价 ${PRICING.costs.imageGpt2Text}，上线特惠 ${imagePromoLabel('gpt2-text')}），带参考图的`,
              ` (list ${PRICING.costs.imageGpt2Text}, launch promo ${imagePromoLabel('gpt2-text')}); with a reference image, `)}
            <strong>{t('输入图档', 'the image tier')} {imageCost('gpt2-ref')} {t('积分/张', 'credits/image')}</strong>
            {t(`（原价 ${PRICING.costs.imageGpt2Ref}，上传参考图会自动切换并提示）。`,
              ` (list ${PRICING.costs.imageGpt2Ref}) — uploading one switches tiers automatically and tells you.`)}
            {t(`方案页第一次是一批出 3 张，按 Seedream 快速档计 ${PRICING.costs.imageFlash} 积分（不是每张都扣）；单张重新生成才按你选的档位逐张计。`,
              `The concepts page renders a batch of 3 for ${PRICING.costs.imageFlash} credits at the Seedream Fast tier (not per image); regenerating one image is charged per image at the tier you pick. `)}
            <strong>{t('扣费以实际成功返回的图为准，失败不扣。',
              'You are charged only for images that actually come back — failures are free.')}</strong>
          </>,
        },
        {
          q: t('积分从哪来？', 'Where do credits come from?'),
          a: <>
            {t('新注册送 ', 'New accounts get ')}
            <strong>{t(`${PRICING.freeTrialUses} 积分`, `${PRICING.freeTrialUses} credits`)}</strong>
            {t(`；每日签到 +10，没有上限，积分永久有效；另外可以用兑换码兑换，或加微信 ${WX_ID} 人工购买。签到入口在「积分」页顶部。`,
              `; daily check-in gives +10 with no cap, and credits never expire. You can also redeem a code or buy manually on WeChat ${WX_ID}. Check-in sits at the top of the Credits page.`)}
          </>,
        },
        {
          q: t('生成失败会扣积分吗？', 'Am I charged if generation fails?'),
          a: <>
            {t('不会。', 'No. ')}
            <strong>{t('成功拿到图之后才扣', 'You are charged only after an image comes back')}</strong>
            {t('，调用失败或中途出错都不扣。余额不足时会直接提示，不会先扣再报错。',
              '; failed calls or mid-way errors cost nothing. If the balance is short you get a warning up front, never a charge followed by an error.')}
          </>,
        },
        {
          q: t('怎么买积分？支付能付吗？', 'How do I buy credits? Can I pay online?'),
          a: <>
            {t('没有月费，也不需要订阅。积分永久有效，用多少买多少。在线支付支持 ',
              'There is no monthly fee or subscription. Credits never expire — buy only what you need. Online payments accept ')}
            <strong>Visa / Mastercard / Apple Pay / Google Pay</strong>
            {t('，付款后自动到账。中国内地用户可用兑换码或加微信购买。',
              ' and credits arrive automatically. Mainland China users can use a redeem code or WeChat. ')}
            {t(`积分包在线三档：${packsOnline}；兑换码三档：${packsCode}，自定义积分按 ¥1 = ${PRICING.customPointsPerRMB} 积分折算。`,
              `Credit packs online: ${packsOnline}. Redeem-code packs: ${packsCode}, and custom amounts are ¥1 = ${PRICING.customPointsPerRMB} credits.`)}
          </>,
        },
      ],
    },
    {
      id: 'data',
      title: t('数据与导出', 'Data & export'),
      en: 'DATA',
      items: [
        {
          q: t('我的设计存在哪里？换设备还在吗？', 'Where are my designs stored? Do they follow me across devices?'),
          a: <>
            {t('本机浏览器会自动保存（IndexedDB），不登录也不会丢。登录后云端同步自动开启：作品自动上传并合并，换设备在工作台点「取回云端项目」即可继续编辑。云端同步不额外收费，也不扣积分。清空浏览器数据会连同本地草稿一起清掉，重要项目建议先备份。',
              'Everything is saved in your browser (IndexedDB), so nothing is lost even without signing in. Once you sign in, cloud sync turns on automatically: work uploads and merges, and on another device you click “Restore cloud projects” in the workspace. Cloud sync costs nothing and spends no credits. Clearing browser data wipes local drafts too, so back up anything important.')}
          </>,
        },
        {
          q: t('能导出什么格式？', 'What formats can I export?'),
          a: <>
            {t('登录后即可导出 PDF（含出血与 CMYK，可直接送印）、SVG 矢量、DXF 刀模、ZIP 打包，以及 PNG / JPG 预览图与印前检查报告，全部不额外收费、不扣积分。所有格式都在「文件导出中心」生成。AI 生成的效果图本身是位图 PNG，文字若要印刷级清晰，建议在编辑器里用文字图层重新排一遍再导出。',
              'After signing in you can export PDF (with bleed and CMYK, ready for print), SVG vector, DXF dielines, ZIP bundles, PNG / JPG previews and prepress reports — all included, with no extra charge and no credits spent. Everything is produced in the export centre. The AI mockups themselves are raster PNGs — for print-sharp type, re-set the text with text layers in the editor before exporting.')}
          </>,
        },
        {
          q: t('AI 用的是哪些模型？我的 Key 安全吗？', 'Which AI models are used? Are my keys safe?'),
          a: <>
            {t('文本侧接入 DeepSeek-V4.1-Flash（默认 / 经济版）、DeepSeek-V4-pro、Kimi-K3.1-Pro、Doubao-Seed-2.1-lite/turbo、GLM-5.3-Flash；生图用 Seedream 5.0 Flash / Pro 与 GPT Image 2（文字输入 / 输入图两档）；3D 建模用 Hyper3D-Gen2（',
              'Text runs on DeepSeek-V4.1-Flash (default / eco), DeepSeek-V4-pro, Kimi-K3.1-Pro, Doubao-Seed-2.1-lite/turbo and GLM-5.3-Flash; images use Seedream 5.0 Flash / Pro and GPT Image 2 (text and image tiers); 3D uses Hyper3D-Gen2 (')}
            {PRICING.costs.hyper3d} {t('积分/次，暂未开放入口）。全部由平台在服务端代调，',
              ' credits per run, no entry point yet). All calls are proxied server-side, so ')}
            <strong>{t('前端看不到、也填不了 API Key 或模型地址', 'the front end cannot see or enter an API key or model endpoint')}</strong>
            {t('，账户里也没有这类入口。', ', and the account page has no such field.')}
          </>,
        },
      ],
    },
    {
      id: 'account',
      title: t('账号与其他', 'Account & misc'),
      en: 'ACCOUNT',
      items: [
        {
          q: t('为什么必须登录？能不能用手机号？', 'Why do I need an account? Can I use a phone number?'),
          a: <>
            {t('项目归属、积分余额、云端同步都要挂在账号上，所以设计必须先登录。目前只支持',
              'Projects, credit balance and cloud sync all hang off an account, so designing requires signing in. Today only ')}
            <strong>{t('邮箱验证码', 'email codes')}</strong>{t('与', ' and ')}
            <strong>{t('邮箱 + 密码', 'email + password')}</strong>
            {t('两种方式；短信验证码已停用（按条计费，成本不划算），因此也没有手机号绑定入口。改密与换绑邮箱都需要先收一次邮箱验证码。',
              ' are supported. SMS codes are switched off (billed per message, not worth it), so there is no phone binding either. Changing a password or swapping an email always starts with a code sent to your inbox.')}
          </>,
        },
        {
          q: t('页面白屏 / 一直转圈怎么办？', 'Blank page or endless spinner?'),
          a: <>
            {t('绝大多数是浏览器缓存了旧版本，而旧版本的脚本已经被新版本替换。现在出现这种情况会自动提示并重新加载一次；如果仍然空白，手动刷新（Mac 用 ⌘⇧R）即可。你的草稿在 IndexedDB 里，刷新不会丢。',
              'Almost always a cached old build whose scripts the new release replaced. We now detect that, show a notice and reload once; if it is still blank, hard-refresh (⌘⇧R on Mac). Your drafts live in IndexedDB and survive a refresh.')}
          </>,
        },
      ],
    },
  ];
}

function buildUpdates(t: TFn) {
  return [
    {
      date: '11-09',
      title: t('创作流程重排为四步', 'The flow is now four steps'),
      body: t('创作入口（有参考图 / 从零开始）→ 确认需求 → 设计方案 → 编辑器。方案页一次出 3 张整包图，可单张重新生成。',
        'Start (with references / from scratch) → Requirements → Concepts → Editor. The concepts page renders 3 complete mockups at once, and each can be regenerated on its own.'),
    },
    {
      date: '11-09',
      title: t('界面统一为 iOS 液态玻璃', 'One iOS-style glass surface everywhere'),
      body: t('账户信息、积分、帮助与 Luna 侧栏换成同一套玻璃材质；账户信息合并了原来的「个人资料」与「账号安全」。',
        'Account, credits, help and the Luna sidebar now share one glass material; Account also absorbed the old Profile and Security pages.'),
    },
    {
      date: '11-09',
      title: t('登录改为品牌 Logo，短信停用', 'Brand logo on sign-in, SMS retired'),
      body: t('登录弹窗换成品牌螺旋标；登录只支持邮箱验证码与密码，不再提供短信验证与手机号绑定。',
        'The sign-in dialog carries the brand mark; only email codes and passwords work now — no SMS verification or phone binding.'),
    },
    {
      date: '11-06',
      title: t('复刻功能上线', 'Recreate is live'),
      body: t('上传参考图与自己的素材图，选定类型（主图 / 详情页 / 海报 / 视频封面 / 包装 / 周边），调好复刻度，一次出三张方案。',
        'Upload references and your own assets, pick a format (main image, detail page, poster, video cover, packaging, merch), set how closely to follow it, and get three takes at once.'),
    },
  ];
}

function buildLinks(t: TFn): { label: string; desc: string; path: string; icon: 'spark' | 'grid' | 'folder' | 'user' }[] {
  return [
    { label: t('开始一个设计', 'Start a design'), desc: t('四步出图', 'Four steps to images'), path: '/new', icon: 'spark' },
    { label: t('积分', 'Credits'), desc: t('余额与签到', 'Balance & check-in'), path: '/credits', icon: 'folder' },
    { label: t('复刻', 'Recreate'), desc: t('按参考图出新图', 'Recreate from a reference'), path: '/replicate', icon: 'grid' },
    { label: t('账户信息', 'Account'), desc: t('密码与邮箱', 'Password & email'), path: '/account', icon: 'user' },
  ];
}

export default function Help() {
  const { lang, t } = useLang();
  const [open, setOpen] = useState<string | null>('start-0');
  const GROUPS = buildGroups(t);
  const UPDATES = buildUpdates(t);
  const LINKS = buildLinks(t);

  return <div className="gl-page">
    <header className="gl-head">
      <span className="gl-kicker">HELP</span>
      <h1 className="gl-title">{t('帮助与反馈', 'Help & feedback')}</h1>
      <p className="gl-sub">
        {t('遇到问题先看这里；还没解决就直接发邮件，工作日内回复。',
          'Start here; if that does not solve it, email us — we reply on business days.')}
      </p>
      <div className="gl-meta">UPDATED 2026-11-09</div>
    </header>

    {/* ---------- 最近更新 ---------- */}
    <section className="gl-card">
      <div className="gl-label">{t('最近更新', 'What’s new')}{lang !== 'en' && <em>WHAT&apos;S NEW</em>}</div>
      <div className="gl-updates">
        {UPDATES.map((u) => <div className="gl-update" key={u.title + u.date}>
          <div className="gl-update-date">{u.date}</div>
          <div className="gl-update-body">
            <strong>{u.title}</strong>
            <p>{u.body}</p>
          </div>
        </div>)}
      </div>
    </section>

    {/* ---------- 常见问题 ---------- */}
    {GROUPS.map((g) => <section className="gl-card" key={g.id}>
      <div className="gl-label">{g.title}{lang !== 'en' && <em>{g.en}</em>}</div>
      <div className="gl-faq">
        {g.items.map((f, i) => {
          const key = `${g.id}-${i}`;
          const isOpen = open === key;
          return <div className={`gl-faq-item ${isOpen ? 'open' : ''}`} key={key}>
            <button className="gl-faq-q" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
              <span>{f.q}</span>
              <Icon name="chevronDown" size={16} />
            </button>
            {isOpen && <div className="gl-faq-a">{f.a}</div>}
          </div>;
        })}
      </div>
    </section>)}

    {/* ---------- 快捷入口 ---------- */}
    <section className="gl-card">
      <div className="gl-label">{t('直接去', 'Jump to')}{lang !== 'en' && <em>JUMP TO</em>}</div>
      <div className="gl-links">
        {LINKS.map((l) => <button className="gl-link" key={l.path} onClick={() => go(l.path)}>
          <span className="gl-ico"><Icon name={l.icon} size={16} /></span>
          <span className="gl-link-text"><strong>{l.label}</strong><small>{l.desc}</small></span>
        </button>)}
      </div>
    </section>

    {/* ---------- 反馈 ---------- */}
    <section className="gl-card">
      <div className="gl-label">{t('反馈与建议', 'Feedback')}{lang !== 'en' && <em>CONTACT</em>}</div>
      <p className="gl-sub" style={{ fontSize: 13 }}>
        {t('发现 bug、想要新功能、或者对某个包装方向有想法，直接发邮件给我们。邮件里附上：设备（Mac / Windows / 手机）、浏览器、你点了什么、期望看到什么——这四样能让我们少问三轮。',
          'Found a bug, want a feature, or have an idea about a packaging direction? Email us. Include your device (Mac / Windows / phone), browser, what you clicked and what you expected — those four save us three rounds of questions.')}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <a className="gl-btn" href="mailto:soyoung@outlook.com?subject=LunaSol%20feedback">
          <Icon name="mail" size={15} /> soyoung@outlook.com
        </a>
        <button className="gl-btn gl-btn-soft" onClick={() => go('/workspace')}>
          {t('回工作台', 'Back to workspace')}
        </button>
      </div>
      <p className="gl-note">
        {t('没有电话客服，所有问题都走邮箱；工作室时区 UTC+8。',
          'No phone support — everything goes through email. Studio timezone: UTC+8.')}
      </p>
    </section>
  </div>;
}
