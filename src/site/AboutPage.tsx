/* ============================================================
   关于 / 帮助中心（/about）
   ------------------------------------------------------------
   这一页承担「全站信息入口」：我们是谁、流程怎么走、积分怎么算、
   导出能拿到什么、账户与数据在哪、隐私 / 条款 / 使用规范三份摘要、
   常见问题、更新日志、联系方式。
   顶部一个搜索框：输入关键词直接在各区块里找答案，命中项带高亮，
   点一下清空搜索并跳到那一条（锚点滚动）。
   版式：左目录（sticky）+ 右正文；窄屏目录变成一排可横向滚的胶囊。
   所有文案都走 t()，中英双语同步。
   ============================================================ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { go } from '../ui';
import { useLang } from '../i18n';
import { PRICING } from '../cloud/plans';
import { imageCost, imageListCost } from '../cloud/models';

type Dict = (zh: string, en: string) => string;

interface Item {
  /** 章节内唯一，用作锚点 */
  id: string;
  /** 条目标题（FAQ 里就是问句） */
  q?: string;
  /** 纯文本：搜索与摘要都基于它 */
  text: string;
  /** 额外关键词（同义词 / 英文 / 俗称），只参与搜索 */
  kw?: string;
  /** 富内容：有 node 时正文渲染 node，text 仍用于搜索 */
  node?: React.ReactNode;
}

interface Sec {
  id: string;
  /** 目录里的短名 */
  nav: string;
  title: string;
  lead?: string;
  items: Item[];
  /** 区块级的自定义内容（三列主张等） */
  node?: React.ReactNode;
  /** faq = 折叠问答 */
  kind?: 'faq';
}

/* ---------------------------- 搜索工具 ---------------------------- */

const tokens = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matches(it: Item, q: string) {
  const hay = `${it.q || ''} ${it.text} ${it.kw || ''}`.toLowerCase();
  return tokens(q).every((tk) => hay.includes(tk));
}

/** 命中强度：标题里出现 6 分、正文每出现一次 1 分。
 *  这样搜「导出」时「能导出哪些文件」排在正文顺带提到导出的条目之前。 */
function score(it: Item, q: string) {
  const title = `${it.q || ''} ${it.kw || ''}`.toLowerCase();
  const body = it.text.toLowerCase();
  return tokens(q).reduce((n, tk) => {
    const hits = body.split(tk).length - 1;
    return n + (title.includes(tk) ? 6 : 0) + hits;
  }, 0);
}

/** 命中位置前后的短摘要：不从头截，直接把关键词带进视野 */
function snippet(text: string, q: string, len = 104) {
  const lower = text.toLowerCase();
  const hits = tokens(q).map((tk) => lower.indexOf(tk)).filter((i) => i >= 0);
  const first = hits.length ? Math.min(...hits) : 0;
  const start = Math.max(0, first - 26);
  const end = Math.min(text.length, start + len);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/** 关键词高亮：按 token 切分，奇数位就是命中的片段 */
function Mark({ text, q }: { text: string; q: string }) {
  const tk = tokens(q);
  if (!tk.length) return <>{text}</>;
  const re = new RegExp(`(${tk.map(escapeRe).join('|')})`, 'gi');
  const parts = text.split(re);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

/* ---------------------------- 内容 ---------------------------- */

function buildSections(t: Dict): Sec[] {
  const pack = PRICING.creditsPacks
    .map((p) => `${p.points} / US$${p.priceUSD}（¥${p.priceRMB}）`)
    .join(' · ');

  return [
    {
      id: 'intro',
      nav: t('我们在做什么', 'What we do'),
      title: t('我们在做什么', 'What we do'),
      lead: t('LunaSol 是一个面向真实生产的 AI 包装设计工作室：给它一个产品和一个想法，它给出一份能进厂印刷的包装。',
        'LunaSol is an AI packaging design studio aimed at real production: give it a product and an idea, and it returns packaging you can send to a printer.'),
      items: [
        {
          id: 'intro-why',
          q: t('为什么做这件事', 'Why we build it'),
          text: t('包装本该是产品的一部分，而不是最后才想起来的一道工序。我们用 AI 把调研、方向、结构、版面这些原本需要一整个团队的步骤，压缩到一个人可以完成的范围里。',
            'Packaging should be part of the product, not the chore you remember at the end. AI compresses the research, directions, structure and layout that used to take a whole team into something one person can finish.'),
          kw: 'why mission 使命',
        },
        {
          id: 'intro-who',
          q: t('为谁做', 'Who it is for'),
          text: t('为没有设计经验的人做：你只需要知道自己的产品是什么、卖给谁，剩下的判断由 AI 给方向、你来选。也为独立品牌与小团队做——不要求你先会画刀模。',
            'For people without design training: you only need to know what you sell and who buys it, then pick from the directions AI offers. Also built for independent brands and small teams — no die-line skills required.'),
          kw: '用户 人群 小品牌 卖家 user audience',
        },
        {
          id: 'intro-not',
          q: t('我们不做什么', 'What we refuse to do'),
          text: t('不做会员等级、不做复杂套餐、不把功能藏起来；不替你编造配方、功效、认证或规格。拿不到的信息就留空并标注「未确认」，绝不为了好看而假装知道。',
            'No membership tiers, no maze of plans, no hidden features. We never invent formulas, claims, certifications or specs: anything we do not know stays blank and marked “unconfirmed”.'),
          kw: '不做 边界 编造 假 limit fake',
        },
      ],
    },
    {
      id: 'flow',
      nav: t('怎么开始', 'How it works'),
      title: t('从想法到可印刷', 'From idea to print'),
      lead: t('整条链路是四步：创建项目 → 收集需求 → 生成方向 → 编辑与导出。第一次使用建议从首页那颗「开始吧！设计师」进。',
        'Four steps: create a project → collect requirements → generate directions → edit and export. First time here, start from the button on the home page.'),
      items: [
        {
          id: 'flow-steps',
          q: t('一共几步？', 'How many steps?'),
          text: t('四步：① 创建项目（会自动生成项目编号、记录名称与时间）；② 九步需求收集；③ 进入待生成态；④ 在编辑器里调尺寸、结构与版面，最后做印前检查并导出。每一步都会自动保存。',
            'Four: ① create a project (id, name and time are recorded for you); ② a nine-step requirements wizard; ③ the generation stage; ④ refine size, structure and layout in the editor, then run the prepress check and export. Everything autosaves.'),
          kw: '步骤 流程 四步 step flow',
        },
        {
          id: 'flow-wizard',
          q: t('九步需求收集都问什么', 'What does the requirements wizard ask?'),
          text: t('产品类别、产品信息、包装形式（随类别变化）、尺寸（AI 会给建议，但必须你确认）、风格（1 个主 + 2 个辅）、颜色（可上传参考图）、图案（多选）、Logo、补充要求。',
            'Category, product details, pack format (depends on the category), size (AI suggests, you confirm), style (one primary + two secondary), colour (reference images welcome), patterns (multi-select), logo, and any extra notes.'),
          kw: '问卷 九步 需求 类别 尺寸 风格 颜色 图案 logo wizard',
        },
        {
          id: 'flow-json',
          q: t('需求会被整理成什么', 'What happens to my answers'),
          text: t('整理成一份结构化需求：每一条都标着来源——你填写的、你选择的、AI 推荐的、还没确认的。可以随时返回修改，刷新页面也不会丢；真正开始生成前，会先给你一张需求总结卡请你确认。',
            'It becomes a structured brief where every line is labelled: written by you, chosen by you, recommended by AI, or still unconfirmed. Edit it any time, refresh without losing anything, and confirm a summary card before generation starts.'),
          kw: '结构化 需求卡 保存 刷新 恢复 json',
        },
        {
          id: 'flow-ai',
          q: t('AI 的角色是什么', 'What is AI’s role here'),
          text: t('AI 给方向和候选，不代替你做决定。风格、尺寸这类会直接影响成本与生产的参数，一定需要你点一下确认；它不会把推荐值悄悄当成你的选择。',
            'AI proposes directions; it does not decide for you. Anything that affects cost or production — size, style — needs your explicit confirmation. A suggestion is never silently treated as your choice.'),
          kw: 'AI 推荐 确认 角色',
        },
      ],
    },
    {
      id: 'export',
      nav: t('导出与印刷', 'Export & print'),
      title: t('导出与印刷', 'Export & print'),
      lead: t('不是好看的示意图：展开面、折线、出血与尺寸都按印刷要求给出，能直接进厂。',
        'Not a pretty mock-up: panels, folds, bleed and dimensions follow print requirements, ready for production.'),
      items: [
        {
          id: 'export-formats',
          q: t('能导出哪些文件', 'Which files can I export'),
          text: t('PDF（毫米页面 + 3mm 出血 + 独立刀模页，逐图层绘制而非整图截图）、SVG 矢量、DXF 刀模、ZIP 完整文件包，以及 PNG / JPG 预览图与印前检查报告。',
            'PDF (millimetre page, 3 mm bleed, a separate dieline page, drawn layer by layer rather than a flat screenshot), SVG vectors, DXF dielines, a full ZIP bundle, plus PNG / JPG previews and the prepress report.'),
          kw: 'pdf svg dxf zip png jpg 导出 格式 印刷 出血 export bleed',
        },
        {
          id: 'export-free',
          q: t('导出要另外付费吗', 'Does export cost extra'),
          text: t('不要。登录后即可导出，不额外收费也不扣积分。设计引擎、编辑、3D 预览、印前检查、云端同步同样都不计费——只有 AI 生图按档位扣积分。',
            'No. Export is included once you sign in — no extra charge, no credits. The design engine, editor, 3D preview, prepress check and cloud sync are free too; only AI image generation spends credits.'),
          kw: '收费 免费 积分 导出 价格 free charge',
        },
        {
          id: 'export-text',
          q: t('AI 效果图里的文字能直接印吗', 'Can AI-rendered text go straight to print'),
          text: t('AI 生成的是位图，文字边缘放大后会发虚。要印刷级清晰，请在编辑器里用文字图层重新排一遍再导出 PDF；刀模与结构始终是矢量的。',
            'AI output is a bitmap, so type gets soft when enlarged. For print-sharp text, re-set it with text layers in the editor before exporting the PDF. Dielines and structures are always vector.'),
          kw: '文字 清晰 位图 矢量 印刷', 
        },
      ],
    },
    {
      id: 'credits',
      nav: t('积分与计费', 'Credits'),
      title: t('积分与计费', 'Credits & pricing'),
      lead: t('全站只有一个计量单位：积分。没有会员、没有订阅、没有续费、没有有效期。',
        'One unit only: credits. No membership, no subscription, no renewals, no expiry.'),
      items: [
        {
          id: 'credits-what',
          q: t('什么扣积分，什么不扣', 'What costs credits'),
          text: t('只有 AI 生图扣积分，按档位计；对话（Luna AI）免费。设计、编辑、3D 预览、印前检查、导出、云端同步都不扣积分。',
            'Only AI image generation costs credits, charged per tier. Chatting with Luna is free; design, editing, 3D preview, prepress checks, export and sync never spend credits.'),
          kw: '扣分 免费 对话 生图 计费 billing',
        },
        {
          id: 'credits-price',
          q: t('每张图多少积分', 'Credits per image'),
          text: t(`Seedream 5.0 Flash ${imageCost('flash')} 积分/张；Seedream 5.0 Pro ${imageCost('pro')} 积分/张；GPT Image 2 文字输入 ${imageCost('gpt2-text')} 积分/张（原价 ${imageListCost('gpt2-text')}）；GPT Image 2 改图 ${imageCost('gpt2-ref')} 积分/张（原价 ${imageListCost('gpt2-ref')}）。界面显示的价就是实扣的价。`,
            `Seedream 5.0 Flash ${imageCost('flash')} credits each; Seedream 5.0 Pro ${imageCost('pro')}; GPT Image 2 text ${imageCost('gpt2-text')} (was ${imageListCost('gpt2-text')}); GPT Image 2 with a reference image ${imageCost('gpt2-ref')} (was ${imageListCost('gpt2-ref')}). What the interface shows is exactly what gets charged.`),
          kw: '价格 单价 多少 flash pro gpt 42 46 6 12 price per image',
        },
        {
          id: 'credits-get',
          q: t('积分从哪来', 'Where credits come from'),
          text: t(`注册送 ${PRICING.freeTrialUses} 积分；每天签到 +10；积分包 ${pack}；中国内地可用兑换码，按 ¥1 = ${PRICING.customPointsPerRMB} 积分折算。`,
            `${PRICING.freeTrialUses} credits when you sign up, +10 per daily check-in, credit packs ${pack}, or a redeem code in mainland China at ¥1 = ${PRICING.customPointsPerRMB} credits.`),
          kw: '充值 签到 注册 兑换码 积分包 价格 topup checkin pack',
        },
        {
          id: 'credits-refund',
          q: t('生成失败会扣分吗', 'Am I charged for a failed generation'),
          text: t('不会。请求失败或被拦截时不扣积分；生成前的倒计时里点取消也不扣。扣分后界面会给一条回执（已扣多少、余额多少），可以在「积分与充值」页的流水里逐笔核对。',
            'No. Failed or blocked requests are not charged, and cancelling during the countdown costs nothing. Every charge leaves a receipt (amount and balance) that you can audit line by line on the Credits page.'),
          kw: '失败 扣分 退款 回执 取消 refund failed cancel receipt',
        },
        {
          id: 'credits-expire',
          q: t('积分会过期吗', 'Do credits expire'),
          text: t('不会。积分永久有效，也没有最低消费。需要退款的按服务条款处理：未消耗部分可申请，已生成的图片对应的积分不退。',
            'They never expire and there is no minimum spend. Refunds follow the terms: unused credits can be requested, credits already spent on rendered images cannot.'),
          kw: '过期 有效期 退款 条款 expire refund',
        },
      ],
    },
    {
      id: 'account',
      nav: t('账户与数据', 'Account & data'),
      title: t('账户与数据', 'Account & data'),
      lead: t('项目按账号存档：同一邮箱登录，换设备也能接着改。',
        'Projects belong to your account: sign in with the same email on another device and keep editing.'),
      items: [
        {
          id: 'account-login',
          q: t('怎么登录', 'How do I sign in'),
          text: t('用邮箱收验证码登录，不需要密码。未登录也能看首页、产品与这一页；但要保存项目、生成图片，必须登录——否则作品没有归属。',
            'Sign in with an email code — no password. You can browse the site signed out, but saving projects and generating images requires signing in, so your work always has an owner.'),
          kw: '登录 注册 验证码 邮箱 password code',
        },
        {
          id: 'account-sync',
          q: t('换电脑能看到以前的项目吗', 'Will my projects follow me'),
          text: t('能。用同一个邮箱登录后，在「包装设计」里取回云端项目，作品会合并到本地列表继续编辑。云端同步不收费也不扣积分。',
            'Yes. After signing in with the same email, restore cloud projects from the Packaging page and keep editing. Sync is free and spends no credits.'),
          kw: '同步 换设备 云端 备份 sync device cloud',
        },
        {
          id: 'account-delete',
          q: t('删除项目会留副本吗', 'Is a deleted project kept anywhere'),
          text: t('不会。删除会同时清掉云端那份，换设备也不会复活。这一步没有回收站，删之前请确认。需要清空账号数据可以邮件联系我们。',
            'No. Deleting removes the cloud copy as well, and it will not come back on another device. There is no trash bin, so confirm before deleting. To wipe your account data, email us.'),
          kw: '删除 回收站 账号删除 delete wipe',
        },
        {
          id: 'account-isolate',
          q: t('别人能看到我的项目吗', 'Can other people see my projects'),
          text: t('不能。数据库逐行按账号隔离，登录态只能读到自己的记录；图片与需求都跟着账号走，不会出现在别人的列表里。',
            'No. Rows are isolated per account, so a session can only read its own records. Images and briefs stay with the account that created them.'),
          kw: '隐私 隔离 权限 rls isolation permission',
        },
      ],
    },
    {
      id: 'privacy',
      nav: t('隐私说明', 'Privacy'),
      title: t('隐私说明（摘要）', 'Privacy (summary)'),
      lead: t('这一节是摘要，完整条款以法务页为准。', 'A summary — the full policy on the legal page prevails.'),
      items: [
        {
          id: 'privacy-collect',
          q: t('我们收集什么', 'What we collect'),
          text: t('邮箱账号与昵称、你上传的图片、你填写的产品信息、生成记录与积分流水。不收集与本服务无关的信息，也不读取你设备上的其他文件。',
            'Your email and display name, images you upload, product details you type, generation history and credit ledger. Nothing unrelated, and never other files on your device.'),
          kw: '收集 数据 信息 日志 collect data',
        },
        {
          id: 'privacy-where',
          q: t('数据存在哪里', 'Where data is stored'),
          text: t('存在腾讯云 CloudBase 的数据库与函数里，按账号隔离。支付由 Creem 处理，我们不接触也不保存你的银行卡信息。',
            'In Tencent CloudBase databases and functions, isolated per account. Payments run through Creem — we never see or store your card details.'),
          kw: '存储 服务器 腾讯云 支付 银行卡 storage server payment',
        },
        {
          id: 'privacy-third',
          q: t('会分享给谁', 'Who else sees it'),
          text: t('只有两类第三方会接触到必要数据：支付服务商（Creem）与模型服务商（火山方舟、B.AI）。我们不卖数据，也不会拿你的图去训练自己的模型。',
            'Only two kinds of third parties touch the minimum needed: the payment provider (Creem) and model providers (Volcano Ark, B.AI). We do not sell data and do not train our own models on your images.'),
          kw: '第三方 分享 卖出 训练 third party share',
        },
        {
          id: 'privacy-rights',
          q: t('我有什么权利', 'What can I ask for'),
          text: t('可以随时导出自己的作品、删除项目，或邮件要求删除账号与全部数据。未成年人请在监护人同意下使用。',
            'Export your work, delete projects, or email us to erase your account and all data. Minors should use the service with a guardian’s consent.'),
          kw: '权利 导出 删除 未成年 rights export delete minor',
        },
      ],
    },
    {
      id: 'terms',
      nav: t('服务条款', 'Terms'),
      title: t('服务条款（摘要）', 'Terms (summary)'),
      lead: t('使用 LunaSol 即表示你同意完整版服务条款。', 'Using LunaSol means you accept the full terms.'),
      items: [
        {
          id: 'terms-account',
          q: t('账号与积分', 'Accounts and credits'),
          text: t('账号仅限本人使用，请自行保管登录邮箱。积分是预付余额，不可提现、不可转让；价格可能调整，但不追溯已完成的购买。',
            'Accounts are personal — keep your email secure. Credits are prepaid balance: not withdrawable, not transferable. Prices may change but never retroactively for completed purchases.'),
          kw: '账号 积分 提现 转让 价格 account credits withdraw',
        },
        {
          id: 'terms-content',
          q: t('我上传的内容归谁', 'Who owns what I upload'),
          text: t('归你。你只需保证自己有权使用这些素材（图片、Logo、字体）；因侵权产生的责任由上传者承担。',
            'You do. You just need the rights to the assets you upload (images, logos, fonts); responsibility for infringement rests with the uploader.'),
          kw: '版权 素材 归属 侵权 copyright ownership',
        },
        {
          id: 'terms-ai',
          q: t('AI 生成的结果能商用吗', 'Can I use AI results commercially'),
          text: t('可以商用，结果归你使用。但 AI 生成物在部分地区可能不构成独创性作品，也不保证能注册为商标——涉及商标与专利的场合请先做检索。',
            'Yes, commercially, and the output is yours to use. AI output may not qualify as an original work everywhere, and we cannot guarantee it is registrable as a trademark — search first if that matters.'),
          kw: '商用 版权 商标 独创 commercial copyright trademark',
        },
        {
          id: 'terms-liability',
          q: t('服务中断与责任', 'Outages and liability'),
          text: t('服务可能因维护或上游模型故障中断，我们会尽力恢复但不承诺零中断。在适用法律允许的范围内，赔偿上限为你过去 12 个月实际支付的金额。',
            'The service can be interrupted by maintenance or upstream model failures; we work to restore it but cannot promise zero downtime. To the extent the law allows, liability is capped at what you paid in the last 12 months.'),
          kw: '中断 责任 赔偿 outage liability',
        },
      ],
    },
    {
      id: 'aup',
      nav: t('使用规范', 'Acceptable use'),
      title: t('使用规范（摘要）', 'Acceptable use (summary)'),
      lead: t('这是能做什么、不能做什么的边界。',
        'The line between what is fine and what is not.'),
      items: [
        {
          id: 'aup-ok',
          q: t('可以做什么', 'What is fine'),
          text: t('为自己的产品做包装、海报、周边；商用、修改、二次设计都可以。参考别人的版式找灵感也没问题——但别把别人的商标与品牌元素直接照搬。',
            'Packaging, posters and merch for your own products — commercially, edited, redesigned. Using a layout as inspiration is fine; copying someone else’s trademark or brand assets is not.'),
          kw: '可以 允许 商用 ok allowed',
        },
        {
          id: 'aup-ban',
          q: t('禁止什么', 'What is banned'),
          text: t('色情与成人内容；未经同意使用真人肖像或冒充他人身份；暴力、仇恨与违法内容；假冒品牌、伪造认证标识；以及任何违法商品（毒品、武器、受保护动物制品等）的包装设计。',
            'Sexual or adult content; real people’s likeness without consent or identity impersonation; violence, hate and illegal content; counterfeit brands and forged certification marks; and packaging for illegal goods (drugs, weapons, protected wildlife products).'),
          kw: '禁止 色情 肖像 暴力 假冒 违法 ban porn violence counterfeit illegal',
        },
        {
          id: 'aup-enforce',
          q: t('违反会怎样', 'What happens if I break it'),
          text: t('视情节删除内容、限制功能或封停账号；已消耗的积分不退还。认为处理有误可以邮件申诉，我们会人工复核。',
            'Depending on severity: content removal, feature limits or account suspension. Credits already spent are not refunded. If you think we got it wrong, appeal by email and a human will review it.'),
          kw: '处罚 封号 申诉 举报 enforce appeal report',
        },
      ],
    },
    {
      id: 'faq',
      nav: t('常见问题', 'FAQ'),
      title: t('常见问题', 'FAQ'),
      kind: 'faq',
      lead: t('点开看答案；找不到就直接搜上面的关键词。',
        'Open a question, or search the keywords above.'),
      items: [
        {
          id: 'faq-start',
          q: t('第一次来，从哪一步开始？', 'First time here — where do I start?'),
          text: t('从首页那颗「开始吧！设计师」进，或者直接在导航点「包装工作台」。新建项目后按九页填写需求，确认后自动进入编辑器。',
            'Start from the button on the home page, or click Workbench in the nav. Create a project, fill the nine pages, and confirming takes you straight into the editor.'),
          kw: '新手 入口 开始 第一步 beginner start',
        },
        {
          id: 'faq-login',
          q: t('必须登录才能用吗？', 'Do I have to sign in?'),
          text: t('浏览不用登录；保存项目、生成图片要登录。项目按账号存档，登录后才换设备也能找回。',
            'Browsing is open; saving projects and generating images need an account so your work has an owner and can follow you across devices.'),
          kw: '登录 必须 匿名 sign in required',
        },
        {
          id: 'faq-unsatisfied',
          q: t('生成的不满意怎么办？', 'What if I do not like the result?'),
          text: t('回到需求里改风格、配色或图案重新生成；也可以直接在 Luna AI 里描述想要的画面。只有真正出图才扣积分，改需求本身不花钱。',
            'Go back to the brief, change style, palette or pattern and regenerate; or describe the desired image in Luna AI. Only actual renders cost credits — editing the brief is free.'),
          kw: '不满意 重生成 修改 regenerate unhappy',
        },
        {
          id: 'faq-notenough',
          q: t('积分不够了怎么办？', 'What if I run out of credits?'),
          text: t('签到 +10 是最快的补充；也可以在「积分与充值」里买积分包或用兑换码。余额和流水都在那一页，随时可查。',
            'Daily check-in gives +10, or buy a pack / redeem a code on the Credits page where balance and history live.'),
          kw: '积分不足 充值 签到 兑换码 topup',
        },
        {
          id: 'faq-studio',
          q: t('刷新页面需求会丢吗？', 'Will I lose my brief on refresh?'),
          text: t('不会。每一步都写在本机并同步一次，刷新后会自动恢复到上次那一步；换设备用同一邮箱取回即可继续。',
            'No. Each step is written locally and synced, so a refresh restores the step you were on; on another device, sign in with the same email and continue.'),
          kw: '保存 刷新 恢复 丢失 save refresh restore',
        },
        {
          id: 'faq-contact',
          q: t('找不到答案怎么办？', 'Still stuck?'),
          text: t('直接写信给我们，一封邮件说清问题与截图，一般一个工作日内回复。',
            'Email us with the issue and a screenshot — usually answered within one business day.'),
          kw: '联系 客服 邮件 support contact email',
        },
      ],
    },
    {
      id: 'changelog',
      nav: t('更新日志', 'Changelog'),
      title: t('更新日志', 'Changelog'),
      items: [
        {
          id: 'log-1117',
          q: t('2026-11-17 · 站点改版与帮助中心', '2026-11-17 · Site refresh & help centre'),
          text: t('全站统一纯白底 + 液态玻璃按钮；导航按「首页 / 包装工作台 / Luna AI / 关于」重排；Luna AI 左栏可收起；本页新增搜索、更新日志与三份法务摘要。',
            'White surfaces and liquid-glass buttons across the site; nav reordered; collapsible Luna sidebar; this page gains search, a changelog and legal summaries.'),
          kw: '改版 更新 搜索 changelog update',
        },
        {
          id: 'log-1116',
          q: t('2026-11-16 · LunaSol 2.0 站点上线', '2026-11-16 · LunaSol 2.0 site'),
          text: t('新首页、产品页、关于页上线；Luna AI 支持「对话 / 图像生成」两种模式，图像模式可选档位并直接显示积分。',
            'New home, product and about pages; Luna AI gained chat / image modes with per-tier credit pricing.'),
          kw: '2.0 上线 首页 launch',
        },
        {
          id: 'log-1115',
          q: t('2026-11-15 · 全新 Studio 工作台', '2026-11-15 · New Studio workspace'),
          text: t('上线项目化工作台与九步需求收集：每条需求标注来源，支持自动保存、刷新恢复与返回修改。',
            'Project-based workspace with the nine-step wizard: every answer is labelled by source, autosaved and editable.'),
          kw: 'studio 工作台 九步 workspace',
        },
        {
          id: 'log-1114',
          q: t('2026-11-14 · 改为纯积分制', '2026-11-14 · Pure credits'),
          text: t('取消会员与订阅，只保留积分：注册送 100、签到 +10、积分包与兑换码。对话免费，只有生图扣分。',
            'Memberships and subscriptions removed in favour of credits: 100 on signup, +10 per check-in, packs and codes. Chat is free; only image generation spends credits.'),
          kw: '积分制 会员 取消 credits membership',
        },
        {
          id: 'log-1111',
          q: t('2026-11-11 · 法务页上线', '2026-11-11 · Legal pages'),
          text: t('服务条款、隐私说明、使用规范与联系方式上线，作为支付通道审核与用户查阅的公开页面。',
            'Terms, privacy, acceptable use and contact pages went live as public references for payments review and users.'),
          kw: '条款 隐私 规范 法务 legal',
        },
      ],
    },
    {
      id: 'contact',
      nav: t('联系我们', 'Contact'),
      title: t('联系我们', 'Contact us'),
      lead: t('一个邮箱收所有事情：问题、反馈、退款、版权投诉、数据删除。',
        'One inbox for everything: questions, feedback, refunds, copyright complaints, data deletion.'),
      items: [
        {
          id: 'contact-mail',
          q: t('邮箱', 'Email'),
          text: t(`写信到 ${PRICING.supportEmail}，附上账号邮箱与截图会更快。一般一个工作日内回复。`,
            `Write to ${PRICING.supportEmail} with your account email and a screenshot. Usually answered within one business day.`),
          node: <p className="hub-item-text">
            <a className="hub-mail" href={`mailto:${PRICING.supportEmail}`}>{PRICING.supportEmail}</a>
            {t('　一般一个工作日内回复。', '  Usually answered within one business day.')}
          </p>,
          kw: '邮箱 联系 客服 反馈 email contact feedback',
        },
        {
          id: 'contact-wechat',
          q: t('微信', 'WeChat'),
          text: t(`人工充值与售后可以加微信 ${PRICING.wechatId}，添加时请说明来意。`,
            `For manual top-ups and after-sales, add ${PRICING.wechatId} on WeChat and say what you need.`),
          node: <p className="hub-item-text">
            {t('人工充值与售后：', 'Manual top-ups and after-sales: ')}
            <code className="hub-code">{PRICING.wechatId}</code>
          </p>,
          kw: '微信 人工 充值 wechat',
        },
        {
          id: 'contact-legal',
          q: t('法务与完整条款', 'Legal pages'),
          text: t('本页的隐私、条款与使用规范都是摘要，完整版在静态法务页，支付审核与争议都以完整版为准。',
            'The privacy, terms and acceptable-use parts here are summaries; the static legal pages are authoritative for review and disputes.'),
          node: <div className="hub-links">
            <a href="./terms/">{t('服务条款全文', 'Full terms')}</a>
            <a href="./privacy/">{t('隐私说明全文', 'Full privacy policy')}</a>
            <a href="./aup/">{t('使用规范全文', 'Full acceptable use')}</a>
            <a href="./contact/">{t('联系与退款说明', 'Contact & refunds')}</a>
          </div>,
          kw: '条款 隐私 规范 全文 legal terms privacy',
        },
      ],
    },
  ];
}

/* ---------------------------- 页面 ---------------------------- */

export default function AboutPage() {
  const { lang, t } = useLang();
  const sections = useMemo(() => buildSections(t), [lang]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState('intro');
  /* 点搜索结果后要跳到那一条，但正文要等 query 清空后的下一帧才渲染出来。
     直接在这里 scrollIntoView 会找不到元素（或按旧布局滚一半），
     所以只记下目标 id，交给下面的 effect 在提交之后再滚。 */
  const [pending, setPending] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = q.trim();

  /* ⌘K / Ctrl+K 聚焦搜索：这一页的信息量足够大，值得一个快捷键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQ('');
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* 目录高亮：以区块顶部进入导航下方 96px 为判定线 */
  useEffect(() => {
    if (query) return;
    const els = sections
      .map((s) => document.getElementById(`hub-${s.id}`))
      .filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver((entries) => {
      const hit = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id.replace(/^hub-/, ''));
    }, { rootMargin: '-96px 0px -68% 0px', threshold: 0 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections, query]);

  const results = query
    ? sections
      .flatMap((s) => s.items.filter((it) => matches(it, query)).map((it) => ({ s, it, sc: score(it, query) })))
      .sort((a, b) => b.sc - a.sc)
    : [];

  /* 点结果 → 清空搜索 → 等正文渲染完成后再滚到那一条 */
  const jump = (id: string) => { setPending(id); setQ(''); };
  useEffect(() => {
    if (!pending || query) return;
    const el = document.getElementById(`hub-${pending}`);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setPending(null);
  }, [pending, query]);

  const hot = [
    t('积分', 'credits'),
    t('导出', 'export'),
    t('隐私', 'privacy'),
    t('退款', 'refund'),
    t('商用', 'commercial'),
    t('更新', 'changelog'),
  ];

  return <div className={`site-page hub ${query ? 'is-searching' : ''}`}>
    {/* ---------------- 页头：主张 + 搜索 ---------------- */}
    <section className="hub-hero">
      <div className="site-wrap">
        <div className="hub-hero-in">
          <span className="site-eyebrow">{t('关于 · 帮助中心', 'About · Help centre')}</span>
          <h1 className="hub-h1">{t('关于 LunaSol', 'About LunaSol')}</h1>
          <p className="hub-lead">
            {t('包装设计，不该是专业设计师的专属能力。这一页把网站的全部说明放在一起：怎么用、怎么计费、数据存在哪、能做什么不能做什么。找不到答案就搜一下。',
              'Packaging design should not be a designers-only skill. Everything about this product lives on this page: how it works, how billing works, where data sits, what we will and will not do. Search it if you cannot find an answer.')}
          </p>

          <div className="hub-search">
            <svg className="hub-search-ic" viewBox="0 0 20 20" aria-hidden>
              <circle cx="8.6" cy="8.6" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12.8 12.8 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('搜索：积分 / 导出 / 隐私 / 退款…', 'Search: credits / export / privacy / refunds…')}
              aria-label={t('搜索本站说明', 'Search this page')}
              spellCheck={false}
            />
            {q
              ? <button className="hub-search-clear" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label={t('清空搜索', 'Clear search')}>
                <svg viewBox="0 0 16 16" aria-hidden><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
              : <kbd className="hub-kbd">⌘K</kbd>}
          </div>

          <div className="hub-hot">
            <span className="hub-hot-label">{t('热门', 'Popular')}</span>
            {hot.map((k) => <button key={k} onClick={() => { setQ(k); inputRef.current?.focus(); }}>{k}</button>)}
          </div>
        </div>
      </div>
    </section>

    {/* ---------------- 目录 + 正文 ---------------- */}
    <div className="site-wrap hub-body">
      <nav className="hub-toc" aria-label={t('本页目录', 'On this page')}>
        {sections.map((s) => <button
          key={s.id}
          className={`hub-toc-item ${!query && active === s.id ? 'is-on' : ''}`}
          onClick={() => { setQ(''); document.getElementById(`hub-${s.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}
        >{s.nav}</button>)}
      </nav>

      <div className="hub-main">
        {query ? (
          <div className="hub-results">
            <div className="hub-results-head">
              <b>{t(`找到 ${results.length} 条关于「${query}」`, `${results.length} result${results.length === 1 ? '' : 's'} for “${query}”`)}</b>
              <button onClick={() => setQ('')}>{t('返回全部内容', 'Show everything')}</button>
            </div>

            {results.length === 0 && <div className="hub-empty">
              <p>{t('没搜到。换个说法试试，比如「积分」「导出」「隐私」；也可以直接写信给我们。',
                'Nothing found. Try another word — “credits”, “export”, “privacy” — or just email us.')}</p>
              <a className="site-btn-ghost" href={`mailto:${PRICING.supportEmail}`}>
                {PRICING.supportEmail}
              </a>
            </div>}

            {results.map(({ s, it }) => <button
              key={`${s.id}-${it.id}`}
              className="hub-result"
              onClick={() => jump(it.id)}
            >
              <span className="hub-result-sec">{s.nav}</span>
              <b className="hub-result-q"><Mark text={it.q || s.title} q={query} /></b>
              <span className="hub-result-text"><Mark text={snippet(it.text, query)} q={query} /></span>
            </button>)}
          </div>
        ) : (
          <>
            {sections.map((s) => <section className="hub-sec" id={`hub-${s.id}`} key={s.id}>
              <h2 className="hub-sec-title">{s.title}</h2>
              {s.lead && <p className="hub-sec-lead">{s.lead}</p>}

              {/* 第一段：三列主张（旧 About 页的三条判断，保留语气的出处） */}
              {s.id === 'intro' && <div className="hub-trio">
                <div>
                  <h3>{t('面向真实生产', 'Aimed at real production')}</h3>
                  <p>{t('不是好看的示意图。展开面、折线、出血与尺寸都按印刷要求给出，能直接进厂。',
                    'Not a pretty mock-up. Panels, folds, bleed and dimensions follow print requirements, ready for production.')}</p>
                </div>
                <div>
                  <h3>{t('一个人就能完成', 'One person, end to end')}</h3>
                  <p>{t('调研、方向、结构、版面原本要一整个团队，现在压缩到你一个人可以完成的范围。',
                    'Research, direction, structure and layout used to take a team; now it fits one person.')}</p>
                </div>
                <div>
                  <h3>{t('保持简单', 'Keep it simple')}</h3>
                  <p>{t('不做会员等级、不做复杂套餐，也不把功能藏起来。只按实际出图计费。',
                    'No membership tiers, no maze of plans, no hidden features. You pay for what you generate.')}</p>
                </div>
              </div>}

              {s.kind === 'faq'
                ? s.items.map((it) => <details className="hub-faq" id={`hub-${it.id}`} key={it.id}>
                  <summary>{it.q}</summary>
                  <div className="hub-faq-body">{it.node || <p>{it.text}</p>}</div>
                </details>)
                : s.items.map((it) => <div className="hub-item" id={`hub-${it.id}`} key={it.id}>
                  {it.q && <h3 className="hub-item-title">{it.q}</h3>}
                  {it.node || <p className="hub-item-text">{it.text}</p>}
                </div>)}
            </section>)}

            {/* 收尾：一句主张 + 两个真实入口 */}
            <section className="hub-end">
              <p className="hub-end-quote">{t('让每一个有产品想法的人，都能够创造属于自己的包装。',
                'So that anyone with a product idea can create packaging of their own.')}</p>
              <div className="hub-end-cta">
                <button className="site-btn" onClick={() => go('/studio')}>
                  {t('开始吧！设计师', 'Start designing')}
                  <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden>
                    <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  className="site-btn-ghost"
                  onClick={() => document.getElementById('hub-contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  {t('帮助与反馈', 'Help & feedback')}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  </div>;
}
