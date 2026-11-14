/* ============================================================
 * 帮助与反馈
 * ------------------------------------------------------------
 * 原则：只写现在真实成立的事，数字一律从权威模块读，不在这里抄一份。
 *  - 流程是「创作入口 → 确认需求 → 设计方案 → 编辑器」四步
 *  - 结构清单来自 engine/structure.ts（STRUCTURES）
 *  - 复刻度三档来自 replicate/prompt.ts（FIDELITIES），一次出几张来自 kinds.ts（BATCH）
 *  - 积分口径以 cloud/plans.ts 为准；生图实付读 imageCost()
 *  - 短信验证码已停用（按条计费），登录只走邮箱
 *
 * 页面组织：顶部搜索 + 分区索引（这一页内容多，先给一条捷径），
 * 然后 最近更新 / 六组问答 / 快捷入口 / 反馈 / 站点信息（页脚已并入这里）。
 * 分组沿用 iOS 设置页的做法：玻璃卡 + 可展开行，默认只露问题。
 *
 * 双语做法：所有文案收在 buildGroups(t, lang) / buildUpdates(t) / buildLinks(t) 里，
 * 由组件渲染时调用。不能在模块顶层直接调 t()——那会在加载时定型，切语言不跟着变。
 * ============================================================ */
import React, { useMemo, useState } from 'react';
import { Icon } from '../components/icons';
import { go } from '../ui';
import { useLang } from '../i18n';
import { PRICING } from '../cloud/plans';
import { imageCost, imagePromoLabel } from '../cloud/models';
import { STRUCTURES, structName } from '../engine/structure';
import { BATCH } from '../replicate/kinds';
import { FIDELITIES } from '../replicate/prompt';
import SiteFooter from '../components/SiteFooter';

type TFn = (zh: string, en: string) => string;
/** kw 只用于本地搜索：把「用户可能打的词」补在问题文本之外 */
type Faq = { q: string; a: React.ReactNode; kw?: string };
type Group = { id: string; title: string; en: string; items: Faq[] };

const WX_ID = 'soyo-ang';

function buildGroups(t: TFn, lang: string): Group[] {
  const packsOnline = PRICING.creditsPacks
    .map((p) => t(`${p.points} 积分 US$${p.priceUSD}`, `${p.points} credits US$${p.priceUSD}`))
    .join(' / ');
  const packsCode = PRICING.creditsPacks.map((p) => `${p.points} = ¥${p.priceRMB}`).join(' / ');
  const structList = STRUCTURES.map((s) => structName(s, lang)).join(' / ');
  const batchCost = imageCost('flash');

  return [
    {
      id: 'start',
      title: t('开始设计', 'Getting started'),
      en: 'START',
      items: [
        {
          q: t('第一次来，从哪一步开始？', 'First time here — where do I start?'),
          kw: t('新手 入口 流程 四步 第一次', 'beginner entry flow steps first'),
          a: <>
            {t('登录后，左侧栏点「开始」——那一页只有两张卡，选一张就进入包装设计流程；也可以直接从「包装设计 → 新建包装」进。整条流程四步：',
              'Sign in, then click Start in the sidebar — that page has just two cards, pick one and the packaging flow opens. You can also go Packaging → New packaging. Four steps in total: ')}
            <strong>{t('创作入口 → 确认需求 → 设计方案 → 编辑器', 'Start → Requirements → Concepts → Editor')}</strong>
            {t('。前两步填信息，第三步 AI 出图，第四步在编辑器里改（含 3D 预览与刀模印前）。',
              '. The first two collect information, the third renders images, and the fourth is where you refine them (with 3D preview and dieline prepress).')}
          </>,
        },
        {
          q: t('「我有参考图」和「从零开始」有什么区别？',
            'What is the difference between “I have references” and “from scratch”?'),
          kw: t('参考图 从零 两张卡', 'reference scratch two cards'),
          a: <>
            {t('两条路进的是同一张「确认需求」表单，区别只在起点：有参考图/设计方向时，你在第一步就把图传上去，AI 按你的方向落地；从零开始时你只描述产品，由 AI 提方向。拿不准就选从零开始，下一步再补产品信息。',
              'Both paths lead to the same Requirements form; only the starting point differs. With references you upload images up front and AI follows your direction. From scratch, you describe the product and AI proposes the direction. If unsure, pick from scratch — you can add product details on the next step.')}
          </>,
        },
        {
          q: t('确认需求里每一项都要填吗？', 'Do I have to fill in every field?'),
          kw: t('必填 产品名称 条形码 备案号 可选', 'required product name barcode optional'),
          a: <>
            {t('必填只有', 'Only the ')}<strong>{t('产品名称', 'product name')}</strong>
            {t('。其余（主题色、插画元素、一级/二级卖点、净含量、产品信息、LOGO、条形码）都可选——不填就不出现在设计里，绝不会替你编一个条码或备案号。LOGO 可以上传，也可以只填名称让 AI 生成临时字标。',
              ' is required. Everything else — theme colours, illustration elements, selling points, net content, production details, logo, barcode — is optional: leave it blank and it stays off the artwork. We never invent a barcode or a licence number. For the logo you can upload one, or give a name and let AI set a temporary wordmark.')}
          </>,
        },
        {
          q: t('AI 出的图能改吗？', 'Can I edit what AI generates?'),
          kw: t('编辑器 改图 图层 3D 刀模', 'editor edit layers 3d dieline'),
          a: <>
            {t('能。方案页点「继续设计」进编辑器后，尺寸、结构、配色、每个文字图层、LOGO、图片位置都能手动调；顶部可切「平面设计 / 3D 预览 / 刀模印前」。AI 是起点，不是终点。',
              'Yes. After “Continue designing” you can adjust dimensions, structure, colours, every text layer, the logo and image placement, and switch between 2D design, 3D preview and dieline prepress at the top. AI is the starting point, not the end.')}
          </>,
        },
      ],
    },
    {
      id: 'packaging',
      title: t('包装设计', 'Packaging'),
      en: 'PACKAGING',
      items: [
        {
          q: t('有哪些包装结构？都是真的刀模吗？', 'Which structures are available? Are they real dielines?'),
          kw: t('结构 刀模 盒子 插舌 天地盖 抽屉 飞机盒 自立袋 标签', 'structure dieline box carton pouch label'),
          a: <>
            {t(`现在有 ${STRUCTURES.length} 种结构，全部按真实刀模几何生成（不是画个盒子图片）：`, `${STRUCTURES.length} structures today, all generated from real dieline geometry — not a picture of a box: `)}
            <strong>{structList}</strong>
            {t('。左侧栏「包装设计」旁的「结构」页可以按尺寸预览每一种的展开图，选好再开始。刀模、出血、压痕线都是按毫米计算的，导出即送印。',
              '. The Structures page previews each unfolded sheet at your dimensions before you commit. Dielines, bleed and crease lines are all calculated in millimetres, so exports are print-ready.')}
          </>,
        },
        {
          q: t('工作台里的「草稿 / 设计中 / 已完成」是什么？',
            'What do “Drafts / In progress / Finished” mean?'),
          kw: t('项目 状态 收藏 复制 排序 工作台', 'project status favourites duplicate workspace'),
          a: <>
            {t('就是作品集的状态，不是文件夹层级：',
              'They are portfolio states, not folders: ')}
            <strong>{t('草稿', 'Draft')}</strong>{t(' = 还没出方案或没进编辑器；', ' = no concepts yet or never opened in the editor; ')}
            <strong>{t('设计中', 'In progress')}</strong>{t(' = 正在改；', ' = being refined; ')}
            <strong>{t('已完成', 'Finished')}</strong>
            {t(' = 过了印前检查或导出过文件。卡片右下「⋯」里可以收藏、复制、重命名、删除；空草稿不会被列成项目，所以数字不会虚高。',
              ' = passed prepress or exported. The “⋯” menu on a card offers favourite, duplicate, rename and delete; empty drafts are never listed as projects, so the count stays honest.')}
          </>,
        },
        {
          q: t('删除项目后云端还会留着吗？', 'If I delete a project, does the cloud copy stay?'),
          kw: t('删除 墓碑 同步 云端 恢复', 'delete tombstone sync cloud restore'),
          a: <>
            {t('不会。删除是「墓碑」语义：本地记一条删除标记，同步时先取标记再合并，所以云端那份也会被一起清掉，换设备也不会复活。删之前请确认——这一步没有回收站。',
              'No. Deletion is a tombstone: a local marker is written, and sync applies markers before merging, so the cloud copy goes too and will not come back on another device. There is no recycle bin, so confirm before deleting.')}
          </>,
        },
        {
          q: t('换电脑了，以前的项目怎么找回来？', 'I switched computers — how do I get my projects back?'),
          kw: t('换设备 云端 取回 同步 备份', 'another device cloud restore sync backup'),
          a: <>
            {t('用同一个邮箱登录，在「包装设计」点「取回云端项目」，作品会合并到本地列表后继续编辑。云端同步不收费也不扣积分。',
              'Sign in with the same email and click “Restore cloud projects” under Packaging — your work merges into the local list and stays editable. Cloud sync costs nothing and spends no credits.')}
          </>,
        },
      ],
    },
    {
      id: 'replicate',
      title: t('复刻设计', 'Recreate'),
      en: 'RECREATE',
      items: [
        {
          q: t('复刻设计和包装设计有什么不一样？', 'How is Recreate different from Packaging?'),
          kw: t('复刻 区别 参考图 素材图 两条产品线', 'recreate difference reference assets'),
          a: <>
            {t('包装设计是从「产品 + 需求」出发，产出可印刷的刀模与视觉稿；复刻设计是「照着别人好看的图，换成我的东西」，产出的是成品图（主图、详情页、海报、视频封面、包装、周边）。两条产品线各有各的草稿箱，互不混在一起。',
              'Packaging starts from a product and a brief and produces print-ready dielines and artwork. Recreate takes an image you like and swaps in your own product, producing finished visuals (main image, detail page, poster, video cover, packaging, merch). Each has its own draft box; they never mix.')}
          </>,
        },
        {
          q: t('左侧栏的「记录」和「模版」分别是什么？', 'What are Records and Templates in the sidebar?'),
          kw: t('记录 模版 模板 草稿 上架 分类', 'records templates drafts categories'),
          a: <>
            {t('「记录」是复刻的草稿箱，每次复刻都存一条，可以继续改、复制、删除。「模版」是把常用的版式做成半成品：参考图已经准备好，点一下直接进工作区，只上传自己的素材图就能出图。模版库正在分批上架，主图 / 详情页 / 海报 / 视频封面 / 包装 / 周边各有分类；还没上架的分类可以先「新建复刻」自己从零开始。',
              'Records is the recreation draft box — every run is saved there and can be reopened, duplicated or deleted. Templates are half-finished layouts: the reference image is already in place, so clicking one opens the workspace and you only add your own assets. The library is being published format by format (main image, detail page, poster, video cover, packaging, merch); until a category is live, use New recreation and start from scratch.')}
          </>,
        },
        {
          q: t('复刻度 30 / 70 / 100 到底差在哪？', 'What do the three fidelity levels actually change?'),
          kw: t('复刻度 一比一 借个感觉 参考版式 30 70 100', 'fidelity exact loose layout'),
          a: <>
            {t('三档给模型的指令是互斥的，选哪档就只做那件事：',
              'Each level sends a different instruction, so what you pick is what happens: ')}
            <ul className="gl-steps">
              {FIDELITIES.map((f) => <li key={f.id}>
                <strong>{t(f.name.zh, f.name.en)} · {f.value}</strong>
                <span>{t(f.hint.zh, f.hint.en)}</span>
              </li>)}
            </ul>
            {t('选「一比一」时，提示词会刻意去掉场景描述——那些「主体居中、背景纯白」的要求本质是在重新构图，和「照参考图不动」直接打架。要一模一样就选 100，只想借个气质就选 30。',
              'At one-to-one, scene instructions such as “subject centred, pure white background” are deliberately dropped: they ask the model to recompose, which fights the reference. Pick 100 for a true copy, 30 for mood only.')}
          </>,
        },
        {
          q: t('复刻一次扣多少积分？', `How many credits does one recreation cost?`),
          kw: t('扣费 6 积分 一组 三张 重复扣 回执', 'charge credits batch three receipt'),
          a: <>
            {t(`一次出 ${BATCH} 张，算一组，固定 `, `${BATCH} images make one run — a flat `)}
            <strong>{batchCost} {t('积分', 'credits')}</strong>
            {t(`，按 Seedream 快速档计。点「三张全部重来」还是 ${batchCost} 积分，不按张叠加；只有单张重新生成才按你当时选的档位逐张计（快速 ${imageCost('flash')} / 精细 ${imageCost('pro')} / GPT Image 2 ${imageCost('gpt2-text')}）。`,
              ` at the Seedream Fast tier. Regenerating all three costs the same ${batchCost}, never a multiple; only single-image regeneration is charged per image at the tier you picked (Fast ${imageCost('flash')} / Fine ${imageCost('pro')} / GPT Image 2 ${imageCost('gpt2-text')}).`)}
            {t('出图后右上角会给出回执「已扣 X 积分，余额 Y 积分」，可以在「积分」页的流水里逐笔核对；生成中按钮会锁住，连点不会重复扣。只看余额变化容易把累计读成单价——那不是越点越贵。',
              'After each run a receipt shows “charged X credits, Y left”, and every entry is listed in the credit log on the Credits page. The button locks while a run is in flight, so double clicks cannot double charge. Reading the balance alone makes the total look like a rising unit price — it is not.')}
          </>,
        },
        {
          q: t('出图之后能做什么？', 'What can I do with the results?'),
          kw: t('大图 放大 保存 改提示词 做包装 下载', 'zoom enlarge save prompt packaging download'),
          a: <>
            {t('点任意一张图就是大图查看：← → 换下一张，Esc 退出，可以直接保存到相册，也可以改一句提示词就重出这一张；「用它做包装」会把这张图作为视觉起点带进包装设计，接着出刀模、上 3D、导出印刷文件。',
              'Click any image for the full-size view: ← → to move between them, Esc to close, save to your device, or edit the prompt and re-render just that one. “Use it for packaging” carries the image into Packaging as the visual starting point, where you add a dieline, check it in 3D and export print files.')}
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
          kw: t('价格 单价 生图 档位 对话 免费', 'price per image tier chat free'),
          a: <>
            <strong>{t('对话不扣积分', 'Chat costs no credits')}</strong>
            {t('。AI 生图按档位：', '. AI image generation is charged per tier: ')}
            <strong>Seedream {t('快速', 'Fast')} {imageCost('flash')} {t('积分/张', 'credits/image')}</strong>
            {' · '}
            <strong>Seedream {t('精细', 'Fine')} {imageCost('pro')} {t('积分/张', 'credits/image')}</strong>
            {t('；', '. ')}
            <strong>GPT Image 2 {t('文字输入', 'text')} {imageCost('gpt2-text')} {t('积分/张', 'credits/image')}</strong>
            {t(`（原价 ${PRICING.costs.imageGpt2Text}，上线特惠 ${imagePromoLabel('gpt2-text')}），带参考图的`,
              ` (list ${PRICING.costs.imageGpt2Text}, launch promo ${imagePromoLabel('gpt2-text')}); with a reference image, `)}
            <strong>{t('输入图档', 'the image tier')} {imageCost('gpt2-ref')} {t('积分/张', 'credits/image')}</strong>
            {t(`（原价 ${PRICING.costs.imageGpt2Ref}，上传参考图会自动切换并提示）。`,
              ` (list ${PRICING.costs.imageGpt2Ref}) — uploading one switches tiers automatically and tells you. `)}
            {t(`包装设计的方案页一次出 ${BATCH} 张，按快速档计 ${imageCost('flash')} 积分（不是每张都扣）；复刻同样一组 ${BATCH} 张算一次。只有单张重新生成才逐张计。编辑、3D 预览、印前检查、导出、云端同步都不扣。`,
              `The packaging concepts page renders ${BATCH} at once for ${imageCost('flash')} credits (not per image), and a recreation batch works the same way. Only single-image regeneration is charged per image. Editing, 3D preview, prepress, export and cloud sync are free.`)}
            <strong>{t('扣费以实际成功返回的图为准，失败不扣。',
              'You are charged only for images that actually come back — failures are free.')}</strong>
          </>,
        },
        {
          q: t('积分从哪来？', 'Where do credits come from?'),
          kw: t('新用户 赠送 100 签到 10 兑换码 永久有效', 'signup bonus check-in redeem never expire'),
          a: <>
            {t('新注册送 ', 'New accounts get ')}
            <strong>{t(`${PRICING.freeTrialUses} 积分`, `${PRICING.freeTrialUses} credits`)}</strong>
            {t(`；每日签到 +10，没有上限，积分永久有效；另外可以用兑换码兑换，或加微信 ${WX_ID} 人工购买。签到入口在「积分」页顶部。`,
              `; daily check-in gives +10 with no cap, and credits never expire. You can also redeem a code or buy manually on WeChat ${WX_ID}. Check-in sits at the top of the Credits page.`)}
          </>,
        },
        {
          q: t('怎么买积分？有月费吗？', 'How do I buy credits? Is there a monthly fee?'),
          kw: t('购买 支付 月费 订阅 信用卡 Apple Pay Google Pay 支付宝 Alipay 兑换码 人民币', 'buy payment monthly subscription card alipay redeem rmb'),
          a: <>
            {t('没有月费，也不需要订阅。积分永久有效，用多少买多少。在线支付支持 ',
              'There is no monthly fee or subscription. Credits never expire — buy only what you need. Online payments accept ')}
            <strong>Visa / Mastercard / Apple Pay / Google Pay / 支付宝（含 AlipayHK）</strong>
            {t('，由 Creem 结算，付款后自动到账，不会自动续费。中国内地用户在「积分」页微信扫码按人民币付款，或使用兑换码。',
              ', settled by Creem, credited automatically, never auto-renewed. Mainland China users can scan the WeChat code on the Credits page to pay in CNY, or use a redeem code. ')}
            {t(`积分包在线三档：${packsOnline}；兑换码三档：${packsCode}，自定义积分按 ¥1 = ${PRICING.customPointsPerRMB} 积分折算。`,
              `Credit packs online: ${packsOnline}. Redeem-code packs: ${packsCode}, and custom amounts are ¥1 = ${PRICING.customPointsPerRMB} credits.`)}
          </>,
        },
        {
          q: t('生成失败会扣积分吗？', 'Am I charged if generation fails?'),
          kw: t('失败 不扣 余额不足 提示', 'failed free insufficient balance'),
          a: <>
            {t('不会。', 'No. ')}
            <strong>{t('成功拿到图之后才扣', 'You are charged only after an image comes back')}</strong>
            {t('，调用失败或中途出错都不扣。余额不足时会先提示「本次需要多少、当前还剩多少」，不会先扣再报错。',
              '; failed calls or mid-way errors cost nothing. If the balance is short you get “needs X, Y left” up front, never a charge followed by an error.')}
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
          kw: t('保存 本地 IndexedDB 云端 同步 清缓存 备份', 'storage local cloud sync cache backup'),
          a: <>
            {t('本机浏览器会自动保存（IndexedDB），不登录也不会丢。登录后云端同步自动开启：作品自动上传并合并，换设备在包装设计点「取回云端项目」即可继续编辑。复刻记录只存在本机浏览器，不参与云端同步。清空浏览器数据会连同本地草稿一起清掉，重要项目建议先导出备份。',
              'Everything is saved in your browser (IndexedDB), so nothing is lost even without signing in. Once you sign in, cloud sync turns on automatically: work uploads and merges, and on another device you click “Restore cloud projects”. Recreation records stay in this browser and are not synced. Clearing browser data wipes local drafts too, so export anything important first.')}
          </>,
        },
        {
          q: t('能导出什么格式？', 'What formats can I export?'),
          kw: t('导出 PDF SVG DXF ZIP PNG JPG 印前 出血 CMYK', 'export pdf svg dxf zip png prepress bleed cmyk'),
          a: <>
            {t('登录后即可导出 PDF（含出血与 CMYK，可直接送印）、SVG 矢量、DXF 刀模、ZIP 打包，以及 PNG / JPG 预览图与印前检查报告，全部不额外收费、不扣积分，都在「文件导出中心」生成。AI 生成的效果图本身是位图 PNG，文字若要印刷级清晰，建议在编辑器里用文字图层重新排一遍再导出。',
              'After signing in you can export PDF (with bleed and CMYK, ready for print), SVG vector, DXF dielines, ZIP bundles, PNG / JPG previews and prepress reports — all included, with no extra charge and no credits spent, all produced in the export centre. The AI mockups themselves are raster PNGs — for print-sharp type, re-set the text with text layers in the editor before exporting.')}
          </>,
        },
        {
          q: t('AI 用的是哪些模型？我的 Key 安全吗？', 'Which AI models are used? Are my keys safe?'),
          kw: t('模型 密钥 API Key 安全 DeepSeek Seedream GPT Image', 'models api key security deepseek seedream'),
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
          kw: t('登录 手机号 短信 验证码 邮箱 密码 Google', 'sign in phone sms code email password google'),
          a: <>
            {t('项目归属、积分余额、云端同步都要挂在账号上，所以设计必须先登录。目前支持',
              'Projects, credit balance and cloud sync all hang off an account, so designing requires signing in. We support ')}
            <strong>{t('邮箱验证码', 'email codes')}</strong>{t('、', ', ')}
            <strong>{t('邮箱 + 密码', 'email + password')}</strong>{t(' 与 ', ' and ')}
            <strong>Google</strong>
            {t(' 三种方式；短信验证码已停用（按条计费，成本不划算），因此也没有手机号绑定入口。',
              ' sign-in. SMS codes are switched off (billed per message, not worth it), so there is no phone binding either.')}
          </>,
        },
        {
          q: t('怎么改密码、换绑邮箱？', 'How do I change my password or email?'),
          kw: t('改密 换绑 邮箱 二次验证 安全', 'password email change security'),
          a: <>
            {t('都在「账户信息」一页里（头像菜单进去就是这一页，个人资料与账号安全已合并）。改密和换绑都要先收一次邮箱验证码做二次确认，验证码 10 分钟内有效。',
              'Both live on the Account page (the avatar menu leads straight there — profile and security are merged). Changing either starts with a code sent to your inbox as a second check; codes are valid for 10 minutes.')}
          </>,
        },
        {
          q: t('页面白屏 / 一直转圈怎么办？', 'Blank page or endless spinner?'),
          kw: t('白屏 转圈 缓存 刷新 卡住', 'blank spinner cache refresh stuck'),
          a: <>
            {t('绝大多数是浏览器缓存了旧版本，而旧脚本已经被新版本替换。现在遇到这种情况会自动提示并重新加载一次；仍然空白就手动刷新（Mac 用 ⌘⇧R）。你的草稿在 IndexedDB 里，刷新不会丢。切页时顶部那条橙色进度条是正常的加载提示，页面在换、内容还没到。',
              'Almost always a cached old build whose scripts the new release replaced. We now detect that, show a notice and reload once; if it is still blank, hard-refresh (⌘⇧R on Mac). Your drafts live in IndexedDB and survive a refresh. The orange bar at the top while switching pages is the normal loading hint — the page is swapping, content has not arrived yet.')}
          </>,
        },
      ],
    },
  ];
}

function buildUpdates(t: TFn) {
  return [
    {
      date: '11-14',
      title: t('在线支付支持支付宝，内地新增微信扫码购买', 'Alipay joins checkout; WeChat QR payment for mainland China'),
      body: t('收银台除卡、Apple Pay、Google Pay 外已支持支付宝（含 AlipayHK）。中国内地用户可在「积分」页用微信扫收款码按人民币付款，付款后备注账号邮箱，1 小时内处理，最迟不超过 12 小时到账。',
        'Checkout now takes Alipay (incl. AlipayHK) alongside cards, Apple Pay and Google Pay. Mainland China users can pay in CNY by scanning the WeChat code on the Credits page — leave your account email in the note; credits arrive within 1 hour, never later than 12 hours.'),
    },
    {
      date: '11-14',
      title: t('复刻度改成三档，一比一真的照参考图', 'Three fidelity levels — one-to-one now really copies'),
      body: t('「只借个感觉 30 / 参考版式 70 / 一比一 100」三档给模型的指令完全不同。选一比一时不再拼场景描述，位置、留白、字体照做，只换主体。',
        '“Loose 30 / Follow layout 70 / One to one 100” now send three different instructions. One-to-one drops scene wording entirely: same placement, spacing and type, only the subject changes.'),
    },
    {
      date: '11-14',
      title: t('结果图可以点开看大图', 'Results open full size'),
      body: t('点任意一张进大图：← → 翻页、Esc 退出、直接保存，也能改提示词只重出这一张，或「用它做包装」带进包装设计。',
        'Click any result for the full-size view: ← → to page through, Esc to close, save directly, re-render just that one with an edited prompt, or carry it into Packaging.'),
    },
    {
      date: '11-14',
      title: t('扣费写清楚：一组三张只扣一次', 'Charging is explicit: three images, one charge'),
      body: t('每次出图后给回执「已扣 X 积分，余额 Y 积分」，生成中按钮锁住不重复扣；积分页可逐笔核对流水。',
        'Every run now ends with “charged X credits, Y left”, the button locks while running, and every entry is listed in the credit log.'),
    },
    {
      date: '11-14',
      title: t('复刻设计新增「模版」', 'Recreate gains Templates'),
      body: t('模版 = 参考图已备好的半成品，点一下直接进工作区，只上传自己的素材图就能出图。按主图 / 详情页 / 海报 / 视频封面 / 包装 / 周边分类分批上架。',
        'A template is a half-finished layout with the reference image already in place — click it, add your own assets, get images. Published format by format: main image, detail page, poster, video cover, packaging, merch.'),
    },
    {
      date: '11-14',
      title: t('界面回到白底，站内链接收进帮助页', 'Back to a white canvas; site links move into Help'),
      body: t('正文页改白底 + 极淡点阵，左侧栏为实心白；每页底部那条页脚去掉，站内导航、价格、条款与联系统一放在这一页的最后。',
        'Content pages are white with a faint dot grid and the sidebar is solid white. The footer bar under every page is gone — site links, pricing, terms and contact all live at the end of this page.'),
    },
    {
      date: '11-13',
      title: t('复刻设计独立成一条产品线', 'Recreate is its own product line'),
      body: t('「包装设计」与「复刻设计」平级并列，各有各的草稿箱：包装设计存项目，复刻设计存「记录」。',
        'Packaging and Recreate now sit side by side, each with its own draft box: projects for packaging, records for recreations.'),
    },
    {
      date: '11-09',
      title: t('流程重排为四步，账户合并为一页', 'Four-step flow, one account page'),
      body: t('创作入口 → 确认需求 → 设计方案 → 编辑器；「个人资料」与「账号安全」合并为「账户信息」；登录换成品牌标，短信验证停用。',
        'Start → Requirements → Concepts → Editor; Profile and Security merged into Account; brand mark on sign-in and SMS retired.'),
    },
  ];
}

function buildLinks(t: TFn): { label: string; desc: string; path: string; icon: 'spark' | 'grid' | 'folder' | 'user' }[] {
  return [
    { label: t('开始一个设计', 'Start a design'), desc: t('四步出图', 'Four steps to images'), path: '/start', icon: 'spark' },
    { label: t('包装设计', 'Packaging'), desc: t('项目与草稿', 'Projects and drafts'), path: '/workspace', icon: 'folder' },
    { label: t('复刻 · 记录', 'Recreate · records'), desc: t('复刻过的都在这', 'Every recreation you made'), path: '/replicate', icon: 'grid' },
    { label: t('复刻 · 模版', 'Recreate · templates'), desc: t('参考图已备好，传素材就能出图', 'Reference ready — just add your assets'), path: '/replicate/templates', icon: 'grid' },
    { label: t('积分', 'Credits'), desc: t('余额、签到与流水', 'Balance, check-in and log'), path: '/credits', icon: 'folder' },
    { label: t('账户信息', 'Account'), desc: t('密码与邮箱', 'Password and email'), path: '/account', icon: 'user' },
  ];
}

export default function Help() {
  const { lang, t } = useLang();
  const [open, setOpen] = useState<string | null>('start-0');
  /* 搜索时默认全部展开（用户是来找答案的，不该再点一次）；
     仍允许把某一条收起来，但那是另一套状态——不能借用 open，
     否则清空搜索后「哪一条是打开的」会错位。 */
  const [folded, setFolded] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const GROUPS = useMemo(() => buildGroups(t, lang), [t, lang]);
  const UPDATES = useMemo(() => buildUpdates(t), [t]);
  const LINKS = useMemo(() => buildLinks(t), [t]);

  /* 本地搜索：只比问题文本与关键词。
     答案里有 <strong> 和模块常量，拼成纯文本再匹配既麻烦又容易命中噪音，
     而用户找东西时打的词基本都在标题或我们补的关键词里。 */
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return GROUPS;
    return GROUPS
      .map((g) => ({
        ...g,
        items: g.items.filter((f) => `${f.q} ${f.kw || ''}`.toLowerCase().includes(needle)),
      }))
      .filter((g) => g.items.length > 0);
  }, [GROUPS, needle]);

  const jump = (id: string) => {
    const el = document.getElementById(`sec-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <div className="gl-page">
    <header className="gl-head">
      <span className="gl-kicker">HELP</span>
      <h1 className="gl-title">{t('帮助与反馈', 'Help & feedback')}</h1>
      <p className="gl-sub">
        {t('先搜一下，或者按下面的分区找；还没解决就发邮件，工作日内回复。',
          'Search first or browse the sections below; if that does not solve it, email us — we reply on business days.')}
      </p>
      <div className="gl-meta">UPDATED 2026-11-14</div>
    </header>

    {/* ---------- 搜索 + 分区索引 ---------- */}
    <section className="gl-card gl-find">
      <div className="gl-find-row">
        <span className="gl-find-ico" aria-hidden><Icon name="search" size={15} /></span>
        <input
          className="gl-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('搜一个词，比如「一比一」「刀模」「签到」', 'Search a word — “one to one”, “dieline”, “check-in”')}
          aria-label={t('搜索帮助内容', 'Search help')}
        />
        {!!q && <button className="gl-find-clear" onClick={() => setQ('')} aria-label={t('清空', 'Clear')}>
          <Icon name="close" size={13} />
        </button>}
      </div>
      {!needle && <div className="gl-index">
        <button className="gl-pill" onClick={() => jump('updates')}>{t('最近更新', 'What’s new')}</button>
        {GROUPS.map((g) => <button className="gl-pill" key={g.id} onClick={() => jump(g.id)}>{g.title}</button>)}
        <button className="gl-pill" onClick={() => jump('feedback')}>{t('反馈', 'Feedback')}</button>
      </div>}
      {needle && <div className="gl-find-hint">
        {filtered.reduce((n, g) => n + g.items.length, 0) > 0
          ? t(`找到 ${filtered.reduce((n, g) => n + g.items.length, 0)} 条结果`, `${filtered.reduce((n, g) => n + g.items.length, 0)} results`)
          : t('没找到。换个词，或直接发邮件问我们。', 'Nothing found. Try another word, or just email us.')}
      </div>}
    </section>

    {/* 搜索时把更新列表收起来，结果一次看全；清空搜索恢复 */}
    {!needle && <>
      {/* ---------- 最近更新 ---------- */}
      <section className="gl-card" id="sec-updates">
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
    </>}

    {/* ---------- 常见问题 ---------- */}
    {filtered.map((g) => <section className="gl-card" key={g.id} id={`sec-${g.id}`}>
      <div className="gl-label">{g.title}{lang !== 'en' && <em>{g.en}</em>}</div>
      <div className="gl-faq">
        {g.items.map((f, i) => {
          const key = `${g.id}-${i}`;
          const isOpen = needle ? !folded.includes(key) : open === key;
          const toggle = () => {
            if (!needle) { setOpen(isOpen ? null : key); return; }
            setFolded((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
          };
          return <div className={`gl-faq-item ${isOpen ? 'open' : ''}`} key={key}>
            <button className="gl-faq-q" onClick={toggle} aria-expanded={isOpen}>
              <span>{f.q}</span>
              <Icon name="chevronDown" size={16} />
            </button>
            {isOpen && <div className="gl-faq-a">{f.a}</div>}
          </div>;
        })}
      </div>
    </section>)}

    {/* ---------- 快捷入口 ---------- */}
    {!needle && <section className="gl-card">
      <div className="gl-label">{t('直接去', 'Jump to')}{lang !== 'en' && <em>JUMP TO</em>}</div>
      <div className="gl-links">
        {LINKS.map((l) => <button className="gl-link" key={l.path + l.label} onClick={() => go(l.path)}>
          <span className="gl-ico"><Icon name={l.icon} size={16} /></span>
          <span className="gl-link-text"><strong>{l.label}</strong><small>{l.desc}</small></span>
        </button>)}
      </div>
    </section>}

    {/* ---------- 反馈 ---------- */}
    <section className="gl-card" id="sec-feedback">
      <div className="gl-label">{t('反馈与建议', 'Feedback')}{lang !== 'en' && <em>CONTACT</em>}</div>
      <p className="gl-sub" style={{ fontSize: 13 }}>
        {t('发现 bug、想要新功能、或者对某个包装方向有想法，直接发邮件给我们。邮件里附上：设备（Mac / Windows / 手机）、浏览器、你点了什么、期望看到什么——这四样能让我们少问三轮。',
          'Found a bug, want a feature, or have an idea about a packaging direction? Email us. Include your device (Mac / Windows / phone), browser, what you clicked and what you expected — those four save us three rounds of questions.')}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <a className="gl-btn" href={`mailto:${PRICING.supportEmail}?subject=LunaSol%20feedback`}>
          <Icon name="mail" size={15} /> {PRICING.supportEmail}
        </a>
        <button className="gl-btn gl-btn-soft" onClick={() => go('/workspace')}>
          {t('回包装设计', 'Back to Packaging')}
        </button>
      </div>
      <p className="gl-note">
        {t('没有电话客服，所有问题都走邮箱；工作室时区 UTC+8。',
          'No phone support — everything goes through email. Studio timezone: UTC+8.')}
      </p>
    </section>

    {/* ---------- 站点信息（原全站页脚） ---------- */}
    <SiteFooter />
  </div>;
}
