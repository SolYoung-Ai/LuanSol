/* ============================================================
 * 帮助与反馈
 * ------------------------------------------------------------
 * 原则：只写现在真实成立的事。
 *  - 流程已从「九步向导」改为「创作入口 → 确认需求 → 设计方案 → 编辑器」
 *  - 积分口径以 src/cloud/plans.ts 为准，不在这里另写一份数字
 *  - 短信验证码已停用（成本约 0.05 元/条），登录只走邮箱
 *  - 支付通道未上线，挡在这里的入口一律如实写「未上线 + 兑换码」
 * 分组用 iOS 设置页的组织方式：玻璃卡 + 可展开的行，默认只露问题。
 * ============================================================ */
import React, { useState } from 'react';
import { Icon } from '../components/icons';
import { go } from '../ui';
import { PRICING } from '../cloud/plans';
import { imageCost, imagePromoLabel } from '../cloud/models';

type Faq = { q: string; a: React.ReactNode };
type Group = { id: string; title: string; en: string; items: Faq[] };

const RECHARGE = PRICING.recharge.map((p) => `¥${p.price}=${p.points}`).join(' / ');

const GROUPS: Group[] = [
  {
    id: 'start',
    title: '开始设计',
    en: 'START',
    items: [
      {
        q: '第一次用，怎么开始？',
        a: <>登录后从首页点「开始设计」，或在工作台点「新建设计」。整条流程只有四步：
          <strong>创作入口 → 确认需求 → 设计方案 → 编辑器</strong>。前两步是填信息，第三步 AI 出图，
          第四步在编辑器里改（含 3D 预览与刀模印前）。</>,
      },
      {
        q: '「我有参考图」和「从零开始」有什么区别？',
        a: <>两条路都会进入同一张「确认需求」表单，区别只在起点：选「我有参考图 / 设计方向」时，
          你可以在第一步上传参考图，AI 会按你的方向落地；选「我没有，从零开始」时，
          你只描述产品，由 AI 提方向。拿不准就选从零开始，下一步补产品信息即可。</>,
      },
      {
        q: '确认需求里每一项都要填吗？',
        a: <>必填只有<strong>产品名称</strong>。其余（包装主题色、插画元素、一级/二级卖点、净含量、产品信息、
          LOGO、条形码）都是可选项——不填就不出现在设计里，绝不会替你编一个条码或备案号。
          LOGO 支持上传、或只填名称让 AI 生成一个临时字标。</>,
      },
      {
        q: 'AI 出的图能改吗？',
        a: <>能。方案页点「继续设计」进入编辑器后，尺寸、结构、配色、每个文字图层、LOGO、图片位置都可以手动调，
          顶部可切「平面设计 / 3D 预览 / 刀模印前」。AI 是起点，不是终点。</>,
      },
    ],
  },
  {
    id: 'credits',
    title: '积分与订阅',
    en: 'CREDITS',
    items: [
      {
        q: '积分怎么扣？',
        a: <><strong>对话不扣积分</strong>（免费版用 DeepSeek-V4.1-Flash；会员可切其余 6 款，共用每天一份额度）。
          生图按档位：<strong>Seedream 快速 {PRICING.costs.imageFlash} 积分/张</strong>、
          <strong>Seedream 精细 {PRICING.costs.imagePro} 积分/张</strong>；
          <strong>GPT Image 2 文字输入 {imageCost('gpt2-text')} 积分/张</strong>
          （原价 {PRICING.costs.imageGpt2Text}，上线特惠 {imagePromoLabel('gpt2-text')}），
          带参考图的<strong>输入图档 {imageCost('gpt2-ref')} 积分/张</strong>
          （原价 {PRICING.costs.imageGpt2Ref}，上传参考图会自动切换并提示）。
          方案页第一次是一批出 3 张，按 Seedream 快速档计 <strong>{PRICING.costs.imageFlash} 积分</strong>（不是每张都扣）；
          单张重新生成才按你选的档位逐张计。<strong>扣费以实际成功返回的图为准，失败不扣。</strong></>,
      },
      {
        q: '积分从哪来？',
        a: <>新注册送 <strong>{PRICING.freeTrialUses} 积分</strong>；每日签到 +10（会员翻倍 +20，
          每月签到最多 600）；另外可以用兑换码兑换，或加微信 soyo-ang 人工购买。
          签到入口在「积分与充值」页顶部。</>,
      },
      {
        q: '生成失败会扣积分吗？',
        a: <>不会。<strong>成功拿到图之后才扣</strong>，调用失败或中途出错都不扣。
          余额不足时会直接提示，不会先扣再报错。</>,
      },
      {
        q: '会员包含什么？支付能付吗？',
        a: <>会员 US${PRICING.proMonthlyPriceUSD}/月（约 ¥{Math.round(PRICING.proMonthlyPriceRMB)}）：签到双倍、全部对话模型、云端跨设备同步与全部历史版本、
          PDF / SVG / DXF / ZIP 印刷级导出。订阅页可直接用 <strong>Visa / Mastercard / Apple Pay / Google Pay</strong> 付款，
          到期自动续费；          没有海外卡可以继续用兑换码或加微信 soyo-ang 开通。
          积分包：{PRICING.creditsPack.points} 积分 US${PRICING.creditsPack.priceUSD}（在线支付，自动到账），
          {RECHARGE}（人工通道）。</>,
      },
    ],
  },
  {
    id: 'data',
    title: '数据与导出',
    en: 'DATA',
    items: [
      {
        q: '我的设计存在哪里？换设备还在吗？',
        a: <>本机浏览器会自动保存（IndexedDB），不登录也不会丢。云端同步是会员权益：
          会员登录后自动上传并合并，换设备在工作台点「取回云端项目」即可继续编辑；
          免费版只保存在本机（已有云端作品仍可取回，不会丢）。
          清空浏览器数据会连同本地草稿一起清掉，重要项目建议先备份。</>,
      },
      {
        q: '能导出什么格式？',
        a: <>PDF（含出血与 CMYK，可直接送印）、SVG 矢量、DXF 刀模、ZIP 打包属于会员权益；
          免费版可导出 PNG / JPG 预览图与做印前检查。所有格式都在「文件导出中心」生成。
          AI 生成的效果图本身是位图 PNG，文字若要印刷级清晰，建议在编辑器里用文字图层重新排一遍再导出。</>,
      },
      {
        q: 'AI 用的是哪些模型？我的 Key 安全吗？',
        a: <>文本侧接入 DeepSeek-V4.1-Flash（默认 / 经济版）、DeepSeek-V4-pro、Kimi-K3.1-Pro、Doubao-Seed-2.1-lite/turbo、GLM-5.3-Flash；
          生图用 Seedream 5.0 Flash / Pro 与 GPT Image 2（文字输入 / 输入图两档）；
          3D 建模用 Hyper3D-Gen2（{PRICING.costs.hyper3d} 积分/次，暂未开放入口）。
          全部由平台在服务端代调，<strong>前端看不到、也填不了 API Key 或模型地址</strong>，账户里也没有这类入口。</>,
      },
    ],
  },
  {
    id: 'account',
    title: '账号与其他',
    en: 'ACCOUNT',
    items: [
      {
        q: '为什么必须登录？能不能用手机号？',
        a: <>项目归属、积分余额、云端同步都要挂在账号上，所以设计必须先登录。
          目前只支持<strong>邮箱验证码</strong>与<strong>邮箱 + 密码</strong>两种方式；
          短信验证码已停用（按条计费，成本不划算），因此也没有手机号绑定入口。
          改密与换绑邮箱都需要先收一次邮箱验证码。</>,
      },
      {
        q: '审美市场里的站点打不开？',
        a: <>访问条件是按日期逐站实测的连通结果，不是永久承诺：标「国内外可访问」的当时能直连；
          标「需海外网络」的在国内需自备合规的国际网络；域名失效或改版的会在详情页单独写明。
          打不开属于网络可达性问题，不等于站点下线。</>,
      },
      {
        q: '页面白屏 / 一直转圈怎么办？',
        a: <>绝大多数是浏览器缓存了旧版本，而旧版本的脚本已经被新版本替换。
          现在出现这种情况会自动提示并重新加载一次；如果仍然空白，手动刷新（Mac 用 ⌘⇧R）即可。
          你的草稿在 IndexedDB 里，刷新不会丢。</>,
      },
    ],
  },
];

const UPDATES: { date: string; title: string; body: string }[] = [
  {
    date: '11-09',
    title: '创作流程重排为四步',
    body: '创作入口（有参考图 / 从零开始）→ 确认需求 → 设计方案 → 编辑器。方案页一次出 3 张整包图，可单张重新生成。',
  },
  {
    date: '11-09',
    title: '界面统一为 iOS 液态玻璃',
    body: '账户信息、积分、帮助、审美市场与 Luna 侧栏换成同一套玻璃材质；账户信息合并了原来的「个人资料」与「账号安全」。',
  },
  {
    date: '11-09',
    title: '登录改为品牌 Logo，短信停用',
    body: '登录弹窗换成品牌螺旋标；登录只支持邮箱验证码与密码，不再提供短信验证与手机号绑定。',
  },
  {
    date: '11-06',
    title: '审美市场上线',
    body: '107 个站点索引、14 个国家、26 种风格，逐站实测访问条件；可收藏，也能把某个方向直接带进创作。',
  },
];

const LINKS: { label: string; desc: string; path: string; icon: 'spark' | 'grid' | 'folder' | 'user' }[] = [
  { label: '开始一个设计', desc: '四步出图', path: '/new', icon: 'spark' },
  { label: '积分与充值', desc: '余额与签到', path: '/subscribe', icon: 'folder' },
  { label: '审美市场', desc: '找参考方向', path: '/market', icon: 'grid' },
  { label: '账户信息', desc: '密码与邮箱', path: '/account', icon: 'user' },
];

export default function Help() {
  const [open, setOpen] = useState<string | null>('start-0');

  return <div className="gl-page">
    <header className="gl-head">
      <span className="gl-kicker">HELP</span>
      <h1 className="gl-title">帮助与反馈</h1>
      <p className="gl-sub">遇到问题先看这里；还没解决就直接发邮件，工作日内回复。</p>
      <div className="gl-meta">UPDATED 2026-11-09</div>
    </header>

    {/* ---------- 最近更新 ---------- */}
    <section className="gl-card">
      <div className="gl-label">最近更新 <em>WHAT'S NEW</em></div>
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
      <div className="gl-label">{g.title} <em>{g.en}</em></div>
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
      <div className="gl-label">直接去 <em>JUMP TO</em></div>
      <div className="gl-links">
        {LINKS.map((l) => <button className="gl-link" key={l.path} onClick={() => go(l.path)}>
          <span className="gl-ico"><Icon name={l.icon} size={16} /></span>
          <span className="gl-link-text"><strong>{l.label}</strong><small>{l.desc}</small></span>
        </button>)}
      </div>
    </section>

    {/* ---------- 反馈 ---------- */}
    <section className="gl-card">
      <div className="gl-label">反馈与建议 <em>CONTACT</em></div>
      <p className="gl-sub" style={{ fontSize: 13 }}>
        发现 bug、想要新功能、或者对某个包装方向有想法，直接发邮件给我们。
        邮件里附上：设备（Mac / Windows / 手机）、浏览器、你点了什么、期望看到什么——这四样能让我们少问三轮。
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <a className="gl-btn" href="mailto:soyoung@outlook.com?subject=LunaSol%20%E5%8F%8D%E9%A6%88">
          <Icon name="mail" size={15} /> soyoung@outlook.com
        </a>
        <button className="gl-btn gl-btn-soft" onClick={() => go('/workspace')}>回工作台</button>
      </div>
      <p className="gl-note">没有电话客服，所有问题都走邮箱；工作室时区 UTC+8。</p>
    </section>
  </div>;
}
