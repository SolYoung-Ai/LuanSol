# LunaSol 项目交接书（接手方：豆包）

> 写于 2026-11-06 21:00（GMT+8）。本文档描述的是**实测状态**，不是计划。
> 项目目录名是 `LuanSol`（仓库名，注意拼写），产品品牌名是 **LunaSol**（别改，代码里品牌文案全是 LunaSol）。

---

## 给接手方的开场指令（先读这一段，别急着改代码）

你现在接手的是一个**已经上线、有真实域名、有真实 AI 调用、有订阅计费雏形**的 React 单页应用。它不是 demo，也不是半成品脚手架。

请按这个顺序做，**第一个小时只读不写**：

1. 读本文档全文（约 15 分钟）。
2. 把第 3 节「资产清单」里的 6 个地址逐个打开，确认你能访问（约 10 分钟）。
3. 本地跑通三条命令：`npm ci` → `npx tsc --noEmit` → `npm test`，应看到 `34/34 项通过`（约 10 分钟）。
4. 跑 `npm run dev`，用浏览器走一遍九步向导，确认首页工牌动效能动、能走到 STEP 09（约 15 分钟）。
5. **向我输出一份自检报告**：哪几条通过、哪几条不通过、你对第 9 节「已知问题」的判断。
6. 得到我确认后，再动第一行代码。

**第一条铁律：不要为了"优化"而重构。** 这个项目里每一个看起来奇怪的写法，下面第 10 节都写了为什么——那些是踩坑之后改出来的，删掉就会复发。

---

## 1. 一句话认识这个项目

LunaSol 是**给完全不懂设计的人用的包装设计工具**。用户不需要懂刀模、出血、CMYK、字体转曲，只需要回答「做什么包装、多大、叫什么、喜欢什么风格」，系统产出可印刷的刀模与文件。

主流程（全部在浏览器里完成，无自己的应用服务器）：

```
首页（掉落工牌动效）
  → 九步向导（尺寸/Logo/人群/品类/主色/风格/配色/图案/文案+条码）
  → 需求汇总（可回跳任一步修改）
  → 设计引擎生成三套方向
  → 3D 预览 → 印前检查 → 导出（PDF/SVG/DXF/PNG/ZIP）
```

技术栈：React 18 + TypeScript + Vite 5 + Three.js + jsPDF + JSZip，手写 CSS。
**没有 Next.js、没有后端 API 服务、没有 Tailwind**。数据库和登录用腾讯云 CloudBase（国内站）。

---

## 2. 硬性产品约束（改之前必读，共 5 条，不可违背）

这 5 条是产品负责人明确要求过的，不是我的个人偏好。任何改动如果违反，就是做错了。

| # | 约束 | 落地方式 | 违反的典型错误 |
| --- | --- | --- | --- |
| 1 | **大模型由平台统一接入**，用户看不到可编辑的 API Key / Base URL / 模型名，也**不能自行接入模型** | 密钥只在云函数环境变量 `DEEPSEEK_API_KEY`；前端只持有网关地址 + 代理令牌（`src/cloud/config.ts`）；`/models` 页只读展示状态与一个总开关 | 在设置页加"填你的 API Key"输入框 |
| 2 | **必须订阅才能用 AI**：包月 ¥399，会员每月 600 次统一调用，新注册免费 2 次 | `src/cloud/plans.ts` 是唯一权威来源；闸门在 `src/cloud/subscription.tsx` | 把价格/次数写死在某个页面里 |
| 3 | **支付未上线，先用激活码占位**，后续替换为支付成功回调，已开通用户不受影响 | `activatePlan()` 写 `activated_by='activation-code'`，将来改 `'payment'` | 直接把订阅表结构改掉导致老用户失效 |
| 4 | **订阅口径唯一来源**是 `src/cloud/plans.ts`，界面各处都从那里读 | `PRICING` / `buildPlanCalc()` / `planSummaryText()` | 在订阅页另写一套 `399`、`600` 常量 |
| 5 | **AI 来源必须如实区分**：`ai`（真模型）/ `local`（内置引擎）/ `fallback`（调用失败回退）/ `paywall`（被额度或登录拦住） | `src/ai/provider.ts` 写入运行日志；`AI 模型配置中心 → 最近调用记录` 按这四态展示 | 把 `paywall` 说成"本地引擎生成"，或把本地模板说成 AI 生成 |

第 5 条是这个产品最容易翻车的地方。用户被额度拦住时，界面必须说"额度不足 / 请登录"，**不能**展示一个看起来像 AI 的结果然后标注"本地引擎"。

---

## 3. 资产清单（所有东西在哪）

### 3.1 代码仓库

| 项 | 值 |
| --- | --- |
| 仓库 | `https://github.com/SolYoung-Ai/LuanSol` |
| 默认分支 | `main`（源码，最新提交 `41944e1`，2026-11-06 13:0x UTC，即本文档所在提交） |
| 发布分支 | `gh-pages`（**构建产物**，最新提交 `1052d64`） |
| 历史遗留分支 | 本地有一个 `ghpages-deploy`，内容等于旧 gh-pages，**可以删** |
| 构建产物是否入库 | 否。`dist/` 在 `.gitignore`，只存在于 `gh-pages` 分支 |
| 文件数 | 82 个受版本控制文件 |

⚠️ 交接时的 `main` 是 `41944e1`（交接书提交）。历史上曾有一次通过 GitHub REST API 推送（`12261bb`），导致本地与远端 sha 不一致；已在本次交接时对齐（`git fetch` + `reset --soft` 重建提交），**现在本地与远端一致**。若你看到 `git push` 被拒并提示 "remote contains work that you do not have"，先 `git fetch origin` 再对齐，不要强推覆盖。

### 3.2 三个线上入口（都在线，刚实测）

| 入口 | 地址 | 实测 | 用途与限制 |
| --- | --- | --- | --- |
| **正式域名** | `https://luna.solyoung.top/` | **200**，返回 `index-Bx3wM2x1.js` | **这是主入口**。登录、云同步、订阅计量都可用（原因见 6.5） |
| GitHub Pages 项目页 | `https://solyoung-ai.github.io/LuanSol/` | **301** → luna.solyoung.top | 只做跳转，不再直接访问 |
| CloudBase 静态托管 | `https://solyoung-d4gpp1f7s4e075f6d-1499756427.tcloudbaseapp.com/` | **200**，同一份资源 | 备用/国内直连；首页会先弹「风险提醒」页（未绑备案自定义域名的官方行为） |

三处**不是同一份物理文件**：正式域名由 GitHub Pages 提供，CloudBase 是另存的一份。每次发版必须手动同步两处，否则会漂移（见 9.4）。

### 3.3 CloudBase 云端资源（国内站 ap-shanghai）

| 项 | 值 |
| --- | --- |
| 环境 ID | `solyoung-d4gpp1f7s4e075f6d` |
| 地域 | `ap-shanghai` |
| 静态托管默认域名 | `solyoung-d4gpp1f7s4e075f6d-1499756427.tcloudbaseapp.com` |
| AI 代理网关 | `https://solyoung-d4gpp1f7s4e075f6d-1499756427.ap-shanghai.app.tcloudbase.com/lunasol-ai` |
| 云函数 | `lunasol-ai`（HTTP 云函数，Node 18，代码在 `cloudfunctions/lunasol-ai/`） |
| 数据库 | PostgreSQL，表 `lunasol_projects`、`lunasol_subscriptions`，函数 `lunasol_consume_quota` |
| 身份 | CloudBase Auth（用户名密码 / 手机号验证码 / 邮箱验证码） |

AI 代理**健康检查刚做过，是正常的**：

```bash
curl https://solyoung-d4gpp1f7s4e075f6d-1499756427.ap-shanghai.app.tcloudbase.com/lunasol-ai/health
# {"ok":true,"service":"lunasol-ai","provider":"deepseek","model":"deepseek-chat",
#  "keyConfigured":true,"tokenRequired":true,"imageGeneration":false}
```

`keyConfigured:true` 说明厂商密钥在云函数环境变量里、能用。`imageGeneration:false` 说明**没有图像生成能力**，插画步骤用的是内置矢量模板，界面已如实标注「非 AI 图像生成」。

> 别把 `model:deepseek-chat` 当成"实际在跑的模型"。这是**配置值**；上游真实服务名要看 `/chat/completions` 响应体里的 `model`（曾实测返回 `deepseek-flash`）。这是厂商内部路由，正常现象。

### 3.4 域名与 DNS

| 项 | 值 |
| --- | --- |
| 主域 | `solyoung.top`（DNS 托管在 **Cloudflare**） |
| 子域 | `luna.solyoung.top` |
| 记录 | `CNAME luna` → `solyoung-ai.github.io`，**仅 DNS（灰云）**，未开 Cloudflare 代理 |
| GitHub Pages 配置 | `cname = luna.solyoung.top`，`status = built`，`https_enforced = false` |
| 证书绑定方式 | `gh-pages` 分支根目录的 **`CNAME` 文件**（不是 API 设置，原因见 10.4） |

⚠️ **`dist/CNAME` 是命门**：`npm run build` 会清空 `dist/`，每次构建后必须重新写入 `echo "luna.solyoung.top" > dist/CNAME`，否则推上 gh-pages 后自定义域名会掉。这不是可选项。

⚠️ 这个子域**曾经绑在 CloudBase 上**做验证，现在指向 GitHub Pages。同一子域只能二选一，目前 GitHub 赢。若要切回 CloudBase，必须同步改 DNS + 在 CloudBase 重新绑域名 + 等证书。

### 3.5 密钥边界（重要）

| 类型 | 有哪几个 | 存在哪 | 能否进 Git |
| --- | --- | --- | --- |
| **公开值**（可随前端发布） | `VITE_CLOUDBASE_ENV_ID`、`VITE_CLOUDBASE_REGION`、`VITE_CLOUDBASE_PUBLISHABLE_KEY`、`VITE_LUNASOL_AI_BASE_URL`、`VITE_LUNASOL_AI_TOKEN` | `.env.production`（**刻意入库**） | 可以。它们是浏览器里能直接读到的值 |
| **真密钥**（绝不能泄露） | `DEEPSEEK_API_KEY` | **只在 CloudBase 云函数环境变量** | 绝对不行 |
| 云函数其它变量 | `DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com/v1`）、`DEEPSEEK_MODEL`（默认 `deepseek-chat`）、`LUNASOL_PROXY_TOKEN`、`LUNASOL_ALLOWED_ORIGINS`（CORS 白名单，逗号分隔） | 云函数环境变量 | 不行 |

⚠️ `.env.production` 里的 `VITE_*` 会在 `npm run build` 时**编译进 JS**。所以改代理令牌 = 必须重新构建 + 重新上传，光改云函数变量不生效。

⚠️ 交接时**不要轮换任何密钥**。轮换 `DEEPSEEK_API_KEY` 会让线上 AI 立刻 503；轮换 `VITE_LUNASOL_AI_TOKEN` 会让所有已发布的旧 JS 全部 401，必须同时重新发版。

---

## 4. 代码地图

### 4.1 目录职责

```
LuanSol/
├─ index.html                 入口，字体/主题变量在这
├─ vite.config.ts             构建：base './'、hash 路由、分包策略（改动前先读 6.6）
├─ .env.production            生产公开配置（入库）
├─ .env.example               配置模板（入库）
├─ src/
│  ├─ App.tsx                 路由表 + 全局布局 + Footer + toast + 登录弹窗
│  ├─ main.tsx                挂载 AuthProvider（在最外层，所以任何组件都能 useAuth）
│  ├─ store.tsx               全局状态（projects / draft / brief / toast / toastTone）
│  ├─ ui.tsx                  导航 Nav（含头像下拉）、Logo、Button、Modal、PageHead 等
│  ├─ styles.css              全局样式（含首页、导航、页脚、付费墙）
│  ├─ v3.css                  九步向导专用样式
│  ├─ types.ts                全局类型
│  ├─ data.ts                 静态数据
│  ├─ v3/                     ★ 九步向导（产品核心）
│  │   ├─ steps.ts            9 步定义 + stepDone 完成判定
│  │   ├─ stepBodies.tsx      9 步的界面与交互（最大的单文件，1800+ 行）
│  │   ├─ Wizard.tsx          向导外壳、进度条、每步守卫、暂存/版本
│  │   ├─ Review.tsx          需求汇总（可回跳、显示 n/9）
│  │   ├─ draft.ts            ProjectDraft 定义 + structureReady() + draftToBrief()
│  │   ├─ styles.ts           风格库（10 现代 + 18 传统）+ stylePrimaryColor()
│  │   ├─ colors.ts           配色推荐
│  │   ├─ controls.tsx        ColorInput / TextField / OptionCard 等受控控件
│  │   ├─ barcode.ts          条码（EAN-13 校验位、Code 128、预览占位）
│  │   ├─ logo.ts             Logo 方向生成
│  │   └─ Preview.tsx         向导内预览
│  ├─ ai/                     ★ AI 能力层
│  │   ├─ tasks.ts            12 个能力点定义（system prompt / 输出结构 / 合规约束）
│  │   ├─ provider.ts         runAITask：闸门→传输→校验→回退→记录四态
│  │   ├─ gate.ts             闸门注册表（解耦，避免 engine 反向依赖 cloud）
│  │   ├─ local.ts            每个能力点的确定性本地兜底
│  │   ├─ context.ts          buildAIContext：把九步草稿压成模型可读文本
│  │   ├─ types.ts            AI 类型
│  │   └─ AIAssist.tsx        每步底部的 AI 助手 UI
│  ├─ cloud/                  ★ 云端（登录/订阅/同步）
│  │   ├─ config.ts           公开配置 + cloudOriginSupported() + deepSeekPreset()
│  │   ├─ sdk.ts              CloudBase SDK 单例（动态 import，不在首屏）
│  │   ├─ auth.tsx            会话引导、密码/验证码登录、注册、退出
│  │   ├─ subscription.tsx    订阅数据 + decideGate() + 闸门注册 + 付费墙
│  │   ├─ projects.ts         云端项目增删改查（写后回读确认）
│  │   ├─ useCloudSync.tsx    登录合并、4 秒防抖上传、手动全量同步
│  │   ├─ LoginDialog.tsx     登录/注册/验证码三合一弹窗
│  │   ├─ keys.ts             本地存储键
│  │   └─ plans.ts            ★ 价格/额度/成本测算唯一权威来源
│  ├─ engine/                 ★ 设计引擎（纯函数，可被 Node 测试）
│  │   ├─ structure.ts        buildDieline()：6 种结构的真实刀模几何
│  │   ├─ brief.ts            Brief 组装
│  │   ├─ design.ts           三套设计方向的生成
│  │   ├─ modify.ts           对话式局部修改补丁
│  │   ├─ prepress.ts         印前检查（出血/安全区/DPI/越界）
│  │   ├─ export.ts           PDF/SVG/DXF/PNG/ZIP（重库在这里才动态 import）
│  │   ├─ llm.ts              llmImage + AI 设置读写
│  │   └─ utils.ts            工具函数
│  ├─ components/
│  │   ├─ FallingBadge.tsx    ★ 首页掉落工牌（rAF 物理模拟，无第三方库）
│  │   ├─ PaywallModal.tsx    付费墙（need='login' / 'subscribe' 两种）
│  │   ├─ Viewer3D.tsx        Three.js 3D 预览
│  │   └─ visuals.tsx         矢量视觉生成
│  └─ pages/
│      ├─ home.tsx            极简首页（工牌 + 开始设计 + 九步流程）
│      ├─ library.tsx         灵感库 / 结构库 / 我的工作台 / 项目详情
│      ├─ output.tsx          3D 预览 / 印前检查 / 导出中心
│      ├─ subscribe.tsx       订阅页
│      ├─ account.tsx         账号与云同步
│      ├─ settings.tsx        个人设置 / AI 模型（只读状态）
│      └─ flow.tsx            对话式快速开始（/create /brief /schemes /editor）
├─ cloudfunctions/lunasol-ai/ 云函数源码（index.js + package.json + scf_bootstrap）
├─ cloudbase/migrations/      PG 迁移 SQL（两张表 + 一个原子函数）
├─ tests/                     34 项 Node 测试（suite.ts）+ 浏览器测试页
├─ scripts/walk.js            端到端走查脚本（给浏览器注入辅助函数）
└─ docs/                      DEPLOY / CLOUD / AI_SETUP / AI_INTEGRATION / TEST_REPORT
```

### 4.2 必须认识的 8 个文件（按重要性）

1. `src/v3/draft.ts` —— 数据模型的地基。改任何字段都要从这里开始。
2. `src/v3/stepBodies.tsx` —— 9 步的全部交互。最大、最容易被改坏的文件。
3. `src/engine/structure.ts` —— 刀模几何。**产品护城河就在这**。
4. `src/cloud/subscription.tsx` —— 钱和额度。改这里等于改商业模式。
5. `src/ai/provider.ts` + `src/ai/gate.ts` —— AI 的四种来源判定，决定界面是否诚实。
6. `src/cloud/plans.ts` —— 价格唯一来源，动它要跟产品确认。
7. `vite.config.ts` —— 分包策略，乱改会让首屏从 90KB 变成 360KB。
8. `docs/DEPLOY.md` —— 每一版改了什么、为什么、验收多少项。**改完代码要往这里追加一节**，这是这个项目的既有习惯。

### 4.3 路由表（18 条，全部 hash 路由）

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `#/` | 首页 | 工牌动效 + 开始设计 + 九步流程 |
| `#/wizard` | 九步向导 | 核心产品 |
| `#/review` | 需求汇总 | 可回跳任一步 |
| `#/create` `#/brief` `#/schemes` `#/editor` | 对话式流程 | 早期路径，仍可用 |
| `#/preview` | 3D 预览 | Three.js |
| `#/prepress` | 印前检查 | |
| `#/export` | 导出中心 | PDF/SVG/DXF/PNG/ZIP |
| `#/inspiration` | 灵感库 | 12 个原创虚构品牌 |
| `#/structures` | 结构库 | 6 种结构 |
| `#/projects` | 我的工作台 | 本机项目库（注意：标题是"工作台"，不是"作品"） |
| `#/project/:id` | 项目详情 | |
| `#/account` | 账号与云同步 | |
| `#/subscribe` | 订阅方案 | |
| `#/settings` | 个人设置 | |
| `#/models` | AI 模型 | **只读**状态 + 一个总开关，别加输入框 |

> 用 hash 路由是刻意的：GitHub Pages 静态托管没有服务端 rewrite，`/wizard` 这种真实路径刷新会 404。`#/wizard` 永远不 404。

---

## 5. 用户主流程与九步向导

九步（`src/v3/steps.ts`，改顺序必须同步改 `stepBodies.tsx` 的 `STEP_BODIES`、`Wizard.tsx` 的守卫索引、`ai/tasks.ts` 的 `STEP_TASK`、`Review.tsx` 的行映射 —— **五处联动，漏一处就会出现"填完了还被拦"**）：

| 步 | 名称 | 必填 | 守卫条件（`Wizard.tsx`） |
| --- | --- | --- | --- |
| 01 | 制作尺寸 + 结构 | ✅ | `structureReady(d)`（`structureId` 已选 + 该结构要求的补充参数全部有值） |
| 02 | 品牌 Logo | 可选 | — |
| 03 | 目标人群 | 可选 | — |
| 04 | 产品类型 | ✅ | `product_category.type \|\| custom` |
| 05 | **主颜色** | ✅ | `primary_color` |
| 06 | **设计风格** | ✅ | `style_id` |
| 07 | AI 配色 | 可选 | — |
| 08 | 图案选择 | 可选 | — |
| 09 | **包装文案 + 条形码** | ✅ | `copy_content.brandName \|\| productName` |

**为什么主色在风格前面**（这是 V3.4 调整的）：主色是配色锚点。先主色后风格，用户选风格时系统只做风格匹配、不覆盖已选颜色；反过来做，用户先看到的颜色会被风格默认色冲掉，看起来像"选了不算"。

**为什么条形码并进第 9 步**：条码本质是版面上的一个图形元素，跟文案同一个决策上下文。单独一步只是多一次点击。

---

## 6. 六个关键机制（含"为什么这样写"）

### 6.1 AI 四态与闸门

调用链：

```
界面按钮
  → runAITask(taskId, ctx, settings)            src/ai/provider.ts
  → getAIGate()?.()                               src/ai/gate.ts（由 SubscriptionProvider 注入）
      ├─ ok=false → 记录 source='paywall'，弹付费墙，不调模型
      └─ ok=true  → 传输层（proxy → CloudBase 云函数 → DeepSeek）
  → 合规校验（编造成分/功效/认证/零售条码 → 拦截）
  → 失败/未配置 → 用 LOCAL[taskId] 兜底，source='local'
  → 成功后 reportAIUsage() 自增额度
  → 写运行日志（最近 8 条在 /models 页可看）
```

`source` 必须有四种值：`ai` / `local` / `fallback` / `paywall`。
**为什么**：这是产品的诚信底线。用户被额度拦住时，界面显示"AI 建议"会是欺骗；用户离线时，把内置模板标成 AI 也是欺骗。任何一种都会在用户发现后崩掉信任。

`gate.ts` 单独成文件是**为了避免循环依赖**：`engine/llm.ts` 也要过闸，但 engine 不能反向依赖 cloud。所以这里只放"注册/读取/上报"的钩子。

### 6.2 订阅与额度

口径（`src/cloud/plans.ts`）：**¥399/月 · 600 次/月 · 新用户免费 2 次 · 计费单元 = 单次 AI 建议调用**。

数据表 `public.lunasol_subscriptions`（主键 = 用户 uid）：

| 列 | 说明 |
| --- | --- |
| `id` / `owner_id` | 都是用户 uid；RLS 策略 `owner_id = auth.uid()` |
| `plan` | `free` / `pro_monthly` |
| `status` | `none` / `active` |
| `quota_total` / `quota_used` | 本周期上限与已用量 |
| `period_start` / `period_end` | 会员有效期 |
| `activated_by` | `activation-code`（当前）/ `payment`（将来） |

计费写库优先走数据库原子函数 `lunasol_consume_quota(p_uid, p_n)`。**为什么**：前端"读-改-写"在并发下会互相覆盖计数，用户连点两次就少记一次。函数返回 `-1` 表示"没有可更新的行"（新用户还没记录），此时必须回落读改写并建行——**否则新用户第一次调用会白丢一次额度**（这是修过的 bug，见 10.7）。

闸门判定抽成纯函数 `decideGate()`，因为要能被 Node 测试覆盖：

- 未登录 → `need='login'`（弹付费墙，**不直接弹登录框**，那会打断正在填的表单）
- 已登录、剩余 > 0 → 放行
- 已登录、剩余 = 0 → `need='subscribe'`
- `remaining === null`（订阅还在加载）→ 先 await 加载 Promise，避免"计量空窗"

⚠️ **当前最大缺口**：`activate(code)` **不校验激活码内容**，任何字符串都能开通 600 次。上线前必须修（见 9.1）。

### 6.3 结构补充参数全链路（历史最容易坏的地方）

用户的补充参数（盖高、套合间隙、粘合位、插舌、侧翼、封口、圆角）必须一路传到几何：

```
stepBodies.tsx 写入 draft.package_dimensions.extra
  → draftToBrief() 带出 structureExtra
  → Brief.structureExtra
  → buildDieline(structure, size, bleed, safe, extra?)
  → 真实参与裁切线/压痕线计算
```

**任何一环丢字段，界面承诺就变成谎话**（"这些参数决定粘合位、插舌、盖高"，实际完全没影响）。这条链路被专门写过回归测试。

另一个同类坑：`structureReady(d)` 是**按真实数据判定**的，不是靠一个隐藏的"已确认"开关。早期版本有个 `structureConfirmed` 标志藏在角落小按钮后面，AI 推荐结构时还会把它重置为 false，于是出现"我全都选好了，还提示请确认结构参数"。**不要重新引入任何隐藏确认标记。**

### 6.4 草稿持久化

- 主存储：**IndexedDB**，库名 `lunasol-studio`。不是 localStorage。
- 兜底：localStorage 键 `lunasol.state.v1`（小数据量场景）。
- 其它键：`lunasol.ai.v1`（AI 设置）、`lunasol.ai.runs.v1`（运行日志）、`lunasol.cloud.owners.v1`（哪个本机项目属于哪个账号）。

**为什么用 IndexedDB**：完整草稿 + 设计 JSON 轻松超过 localStorage 的 5MB 上限。

重置草稿要两件事一起做（`/settings → 清空本地数据` 已经这么做）：

```js
localStorage.removeItem('lunasol.state.v1');
indexedDB.deleteDatabase('lunasol-studio');
```

### 6.5 域名 / CORS / 登录的三方关系（**这条最反直觉，务必看懂**）

事实清单（今天实测）：

| Origin | CloudBase 认证网关预检 | 结果 |
| --- | --- | --- |
| `https://luna.solyoung.top` | `204` + `access-control-allow-origin: https://luna.solyoung.top` | ✅ 登录可用 |
| `https://solyoung-ai.github.io` | `403` | ❌ 登录被拒 |
| `*.tcloudbaseapp.com` | `204` | ✅ 可用（但有风险提醒页） |

看起来矛盾：`luna.solyoung.top` 的**静态文件来自 GitHub Pages**，登录却能用。原因是——**CloudBase 的 Web 安全域名白名单里仍然有 `luna.solyoung.top`**（这个子域早先曾在 CloudBase 绑定过）。前端是纯静态的，API 请求带的是页面 Origin，所以只要 Origin 在白名单里，无论文件从哪台服务器发出来都能登录。

**这个组合是当前生产可用的原因，也是最脆弱的一环**：如果 CloudBase 侧那条白名单/域名绑定被清掉，正式域名的登录会立刻变成 403。

`src/cloud/config.ts` 的 `cloudOriginSupported()` 就是这张白名单的前端镜像。加新域名时，**两处都要改**（CloudBase 控制台 + 这个函数），否则界面会给出错误的原因提示。

镜像域名（github.io）被拒后的行为是**诚实降级**：明确说"当前域名不在安全域名白名单内，请到正式站点登录"，绝不假装登录成功。这个行为要保留。

### 6.6 构建分包（改 vite.config.ts 前必读）

`vite.config.ts` 有三处"看起来可以简化、实际不能动"的配置：

1. `base: './'` —— 相对路径，产物能放任意子目录（项目页 `/LuanSol/`）。改成 `'/'` 会让子路径部署全部 404。
2. `modulePreload: false` —— Vite 默认会把多个动态页面共享的依赖提升成 entry 的静态预加载。开启后首屏会被强制 fetch 并执行 jsPDF/three，首屏 JS 从 ~90KB 涨到 ~360KB。
3. **jsPDF / JSZip 故意不放进 `manualChunks`** —— 一旦成为"被多个动态页面共享的命名 chunk"，Vite 会把它提升进 entry 预加载。它们在 `engine/export.ts` 里是"用时才 `import()`"。

首屏现状：只下载 `index` + `vendor-react`。three / jsPDF / JSZip / CloudBase SDK 全部延迟到真正用到时。

---

## 7. 部署手册

### 7.1 现状总表

| 目标 | 谁在提供 | 怎么发版 | 状态 |
| --- | --- | --- | --- |
| `https://luna.solyoung.top/` | GitHub Pages（gh-pages 分支） | 手动推 `gh-pages` | ✅ 200，最新资源 |
| CloudBase 默认域名 | CloudBase 静态托管 | 手动上传 | ✅ 200，同一版 |
| GitHub Pages 项目页 | GitHub Pages | 自动 301 跳转 | ✅ 正常 |
| CI 自动部署 | GitHub Actions | **未启用** | ⚠️ 见 7.6 |

### 7.2 发布到 GitHub Pages（当前唯一"线上生效"路径）

```bash
cd LuanSol
npm ci
npm run build                      # 内含 tsc --noEmit
npm test                           # 必须 34/34
echo "luna.solyoung.top" > dist/CNAME    # ★ 不做这步域名会掉
touch dist/.nojekyll                     # ★ 不做这步 _ 开头文件会被忽略

# 推到 gh-pages（保留历史，推荐）
git clone --branch gh-pages --single-branch https://github.com/SolYoung-Ai/LuanSol.git /tmp/lp
rsync -a --delete --exclude='.git' dist/ /tmp/lp/
cd /tmp/lp
git add -A && git commit -m "deploy: $(date +%F) xxx"
git push origin gh-pages
```

约 1 分钟后 GitHub 自动触发 `pages-build-deployment`（这是唯一在跑的工作流，由 gh-pages 推送触发，不需要 Actions 权限）。

验证：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://luna.solyoung.top/
curl -s https://luna.solyoung.top/ | grep -oE 'assets/index-[A-Za-z0-9._-]+\.js'
# 对比三处返回的 hash 是否一致（luna / CloudBase / 本地 dist/assets）
```

### 7.3 发布到 CloudBase 静态托管

两条路，选一条：

**A. 控制台**（最稳）：CloudBase 控制台 → 静态网站托管 → 上传 `dist/` 整目录覆盖。

**B. MCP 工具**（自动，但有坑）：

```
mcp__cloudbase__manageHosting  action=upload  files=[{localPath, cloudPath}, ...]
```

⚠️ `action=upload, localPath=<目录>` **只会传 1 个文件**，不是递归。必须显式列出每个文件（当前 25 个）。生成列表：

```bash
cd dist && find . -type f | sed 's|^\./||' | sort
```

⚠️ 上传前先把 `dist` 复制到 `/tmp/lunasol-deploy`（不含 `.git`），否则报"路径无读写权限"。

验证：`curl https://solyoung-d4gpp1f7s4e075f6d-1499756427.tcloudbaseapp.com/ | grep assets/`，hash 应与 luna 一致。

### 7.4 环境变量改动的影响面

| 改什么 | 要做什么 |
| --- | --- |
| `.env.production` 任一 `VITE_*` | 必须 `npm run build` 重新构建 + 重传两个托管 |
| 云函数变量 `DEEPSEEK_API_KEY` | 控制台改完立即生效，无需重新构建 |
| 云函数 `LUNASOL_ALLOWED_ORIGINS` | 改完立即生效；新域名要同时加进 `cloudOriginSupported()` |
| `plans.ts` 价格/额度 | 改完需重新构建；数据库 `quota_total` 不会自动变，存量用户要写迁移 |

### 7.5 回滚

- GitHub Pages：`git revert <bad-commit>` 到 gh-pages 再推；或 `git reset --hard <good-sha> && git push -f origin gh-pages`（Pages 会重新构建）。
- CloudBase：没有版本历史，**发版前把 `dist` 留一份归档**（`tar czf lunasol-dist-$(date +%F-%H%M).tgz dist/`）最省事。
- 数据库：迁移都是 `CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION`，天然幂等，重跑安全。

### 7.6 想启用 CI 自动部署（可选，需你决策）

现在没启用，是**历史原因**：创建仓库的令牌只有 `repo` 权限、没有 `workflow` 权限，GitHub 会拒绝推送 workflow 文件，于是 `.gitignore` 里专门写了一行把它忽略：

```
.github/workflows/deploy.yml
```

要启用，做三件事：

1. 删掉 `.gitignore` 里那一行。
2. 用**有 workflow 权限**的令牌推送 `main`。
3. **给 workflow 补一步生成 CNAME**，否则每次自动部署都会把域名弄丢：

```yaml
- name: Add CNAME + .nojekyll
  run: |
    echo "luna.solyoung.top" > dist/CNAME
    touch dist/.nojekyll
```

工作流文件已经写好了，在 `docs/deploy-workflow.yml`（内容是 `npm ci` → `npm run build` → `npm test` → `peaceiris/actions-gh-pages@v4`）。

---

## 8. 本地开发与验收

```bash
cd LuanSol
npm ci                  # Node 20 推荐
npm run dev             # http://localhost:5173
npx tsc --noEmit        # 必须 0 errors
npm test                # 必须 34/34 项通过
npm run build           # 必须通过，且无 chunk 体积告警
```

验收习惯（**这个项目一直这么做，请延续**）：

1. 改动前先跑一遍 `npm test` 拿到基线。
2. 改完 `tsc` + `test` + `build` 三连。
3. 起 `npx vite preview --port 4174 --strictPort --host 127.0.0.1`，用浏览器走查真实页面，**不要只看编译通过**。
4. 走查至少覆盖：首页工牌动效 / 头像下拉 / 九步 01→09 / 需求汇总 / 我的工作台 / 订阅页 / 控制台 0 报错。
5. 把结果追加进 `docs/DEPLOY.md`（这个项目的文档习惯，别丢）。

浏览器自动化：`scripts/walk.js` 可以注入 `window.__t`（按可见文本点击、按 placeholder 填值、读当前步骤与 toast）。注意 **React 受控组件**必须用原生 setter 派发 input 事件，直接改 `.value` 不触发 onChange。

走查要点（曾经踩过）：
- 坐标点击会被 sticky 导航拦截 → 用 `element.click()` 或按文本查元素。
- `prefers-reduced-motion` 下工牌动效会静态降级，这是预期行为，不是 bug。

---

## 9. 已知问题与未完成事项（按优先级，附判断依据）

### 9.1 P0 · 上线收费前必须修：激活码实际不校验

`src/cloud/subscription.tsx` 的 `activate(code)` **把 `code` 参数丢掉了**，直接调用 `activatePlan(uid, 'pro_monthly', 1, 'activation-code')`。也就是说：任何登录用户输入任意字符串都能拿到 600 次/月会员。

证据：`const activate = useCallback(async (code: string) => { ... await activatePlan(u.id, 'pro_monthly', 1, 'activation-code') ... })` —— code 未被使用。

修法建议：建一张 `lunasol_activation_codes(code, plan, months, max_uses, used, expires_at)`，服务端校验并原子占用；或直接把这个入口降级为"仅内部使用"并从界面隐藏。**在修好之前不要把站点大规模推广。**

### 9.2 P1 · 额度只在前端拦，绕过后端就能白用

`VITE_LUNASOL_AI_TOKEN` 和网关地址都在打包后的 JS 里，任何人都能提取并直接 POST 到 `/chat/completions`，完全绕过前端闸门和额度。云函数目前只校验一个静态令牌 + CORS 白名单。

影响：会被人白嫖 API 成本。目前 DeepSeek 单价极低（单次约 ¥0.006），短期风险可控，但**不能长期这样**。

正解：云函数改成"带 CloudBase 登录态 → 服务端查额度 → 原子扣减 → 才转发"。需要把 `auth.uid` 传到云函数（当前云函数没有解析登录态）。

### 9.3 P2 · 强制 HTTPS 未开启

`https_enforced = false`。https 本身可访问（证书已签发生效），但没有强制跳转。开启方式：

```bash
TOKEN=$(printf 'protocol=https\nhost=github.com\n' | git credential fill | awk -F= '/^password=/{print $2}')
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d '{"cname":"luna.solyoung.top","https_enforced":true}' \
  https://api.github.com/repos/SolYoung-Ai/LuanSol/pages
```

之前多次尝试返回 `404 The certificate does not exist yet`。现在证书已生效，**值得再试一次**；若仍拒，等 GitHub 后台补登记。

### 9.4 P2 · 三份部署会漂移

luna（GitHub Pages）和 CloudBase 是两份独立文件。发版只更新一处 → 用户在不同入口看到不同版本。

建议：在发版脚本里把"两处 hash 必须一致"作为验收项（第 7.2 已验证命令）。长期方案是只保留一个生产入口，另一个做成重定向。

### 9.5 P2 · 会员到期/月度重置没有自动任务

`remainingOf()` 在 `period_end` 过期后返回 0（行为正确），但**没有定时任务**去：① 每月重置 `quota_used`；② 把过期用户 `status` 置为 `expired`；③ 续费提醒。

现状需要人工或支付回调触发 `activatePlan`。接支付时一并解决。

### 9.6 P3 · CloudBase 桶里堆着历史 hashed 资源

历次部署的 `index-*.js` 都还在。**桶里同时托管着 CamSim / TypeAll 等其它站点**，删之前必须逐个确认，别整目录清空。

### 9.7 P3 · 文档有历史遗留的"十步"字样

`docs/AI_INTEGRATION.md` 和 `docs/DEPLOY.md` 的**历史章节**仍写"十步/10 步"（那是当时的真实记录）。`docs/DEPLOY.md` 末尾的 V3.4 章节已说明收敛为九步。**不要为了"整洁"去改历史章节**，它们记录了当时的决策。

### 9.8 P3 · `luna.solyoung.top` 的 CloudBase 绑定是"隐形依赖"

见 6.5。CloudBase 侧那条域名白名单/绑定现在没人维护，但它是生产登录能用的前提。**交接时务必确认你有 CloudBase 控制台权限**，并知道一旦误删会怎样。

### 9.9 P3 · 历史上有过"本地与远端 sha 不一致"

上一次执行环境里 `git push` 会被 SIGTERM，所以改走 GitHub REST API 推送，导致远端 commit 与本地内容相同但 sha 不同。**本次交接时已对齐**（`git fetch` 后 `reset --soft` 重建提交，`main = 41944e1`）。

留这条是提醒：如果你以后又用 API 推，记得回头 `git fetch`，否则下次 `git push` 会因为 "remote contains work that you do not have" 被拒。

---

## 10. 决策记录：为什么当初这么做（踩过的坑）

这一节是本文档最有价值的部分。**每一条都是真实事故后的修正**，不是理论。

### 10.1 为什么用 hash 路由
GitHub Pages 是纯静态托管，没有服务端 rewrite。真实路径 `/wizard` 刷新会 404，`#/wizard` 永远不 404。CloudBase 静态托管同理。改路由方案 = 两个托管都要配 rewrite，不划算。

### 10.2 为什么构建产物单独放 gh-pages 分支
GitHub Pages 用 legacy 模式「从分支部署」。把 `dist` 放进 main 会污染源码库、每次构建产生巨大 diff。分开放，main 只放源码，gh-pages 只放产物。

### 10.3 为什么没有 CI 自动部署
创建仓库的令牌缺 `workflow` 权限，GitHub 拒绝推送 workflow 文件。于是文档保留了模板、`.gitignore` 忽略实际文件、发版走手动。见 7.6。

### 10.4 为什么域名用 CNAME 文件而不是 API
GitHub 的 `PUT /pages` 在设置自定义域名时会先要求证书已存在，DNS 还没生效时返回 `404 The certificate does not exist yet`。改用「gh-pages 根目录放 `CNAME` 文件」后，Pages 构建时读取并绑定域名，证书由 GitHub 异步签发——这条路不依赖 API 时序。

**代价**：每次构建都会清空 `dist/`，所以每次都必须重新写 CNAME（7.2 已强调）。

### 10.5 为什么 `luna` 指向 GitHub 而不是 CloudBase
产品负责人明确要求"把 GitHub 仓库的 Pages 自定义域名改成 luna.solyoung.top"。代价是 CloudBase 那条自定义域名不再生效，登录却因为白名单残留仍然可用（6.5）——这是个**幸运的组合**，不是设计出来的。要改的话请当成一个正式决策来处理，别顺手改。

### 10.6 为什么结构参数改成"按真实数据判定"
曾经有个 `structureConfirmed` 隐藏标志：用户把天地盖盒、盖高 25mm、间隙 1.5mm 全填完了，点下一步还是被拦，因为标志还是 false；AI 推荐结构时还会把它重置。用户的原话是"都选好了，还是会显示请确认结构补充参数"。

修法：`structureReady(d)` 直接看草稿里有没有结构 ID、三围、必备补充参数。**数据齐了就是齐了，不需要额外确认动作。**

### 10.7 为什么额度函数要处理 `-1`
`lunasol_consume_quota` 在没有订阅行时返回 `-1`。早期版本把 `-1` 当有效返回值直接用，新用户第一次 AI 调用就没扣次数（白送）。现在 `-1` 触发回落：读-改-写并自动建行。

同时，无订阅行时的 `remaining` 不能取 0 —— 那会被判成"免费体验已用完"，新用户第一次就被拦住。现在按满额（2 次）放行。

### 10.8 为什么选风格要自动写主色
界面上的取色器会展示一个默认色，但草稿里 `primary_color` 还是空。用户看着颜色在那儿，点下一步被"请先选择主颜色"拦住——这是典型的"看起来选了但草稿里是空的"。

修法两层：① 选风格时立刻把该风格主色写进草稿（`stylePrimaryColor()`）；② 取色器不再用占位色伪装已选值，未选时显示中性灰。

**通用教训（请记住）**：任何控件的"展示值"必须与"草稿值"同源。不要再让界面显示一个没写回数据的默认值。

### 10.9 为什么上次推送走 GitHub REST API
上一次执行环境里 `git push` / `git ls-remote` 会被系统 SIGTERM（exit 137），但 `curl` 到 api.github.com 正常。所以用 REST API（blobs → tree → commit → PATCH ref）完成推送。副作用是本地 `origin/main` 引用停在旧 sha（9.9）。

**你的环境大概率不需要这样**，正常 `git push` 即可。

### 10.10 为什么错误提示不能带对勾
toast 组件曾写死 `✓`，于是"请先选择主颜色"这种拦截提示也带对勾，看起来像成功。现在有 `toastTone()`：`warn` 用 `!` + 暖色，成功用 `✓`。

### 10.11 为什么不再显示内部 ID
需求汇总页曾显示"包装盒 · 200×150×80mm · topBottom"。`topBottom` 是内部结构 ID，用户看不懂。现在一律 `structureById(id).name` 转中文名。**任何内部 ID 都不许直接渲染。**

### 10.12 为什么首页"开始设计"要弹确认框
草稿有进度时，点"开始设计"会静默清空整个九步草稿。用户手滑就丢半小时工作。现在弹确认框，显示"已完成 n/9"，给"继续编辑草稿 / 重新开始"两个选择。

### 10.13 为什么选 AI 模式就自动生成文案
原来"帮我整理包装文案"只是切换模式，还要再点一次"生成文案建议"才出结果。用户反馈"点了没反应"。现在选中即生成；并且不再强制先填产品名（缺时按品类兜底）。写入用函数式更新，避免与"切模式"的 setState 互相覆盖。

### 10.14 为什么 `AIAssist` 只在用户点"采用"时写回
AI 建议不能自动改用户已确认的品牌名、产品名、核心文案。所以建议先进 `aiSuggestion` 字段，用户逐条采纳才落到正式字段。

---

## 11. 十条禁止事项

1. **不要**在界面加任何 API Key / Base URL / 模型名的**可编辑**入口（只读展示可以）。
2. **不要**把价格、额度常量写死在页面里——只能从 `plans.ts` 读。
3. **不要**把 `paywall` / `local` / `fallback` 说成 AI 生成。
4. **不要**删除或绕过 `structureReady()`，不要重新引入隐藏确认标志。
5. **不要**直接渲染内部 ID（`topBottom`、`pro_monthly` 这类），必须转中文。
6. **不要**构建后忘记 `dist/CNAME` 和 `.nojekyll`。
7. **不要**改 `vite.config.ts` 的 `base`、`modulePreload`，或把 jsPDF / JSZip 加进 `manualChunks`。
8. **不要**轮换任何密钥（`DEEPSEEK_API_KEY`、`VITE_LUNASOL_AI_TOKEN`）而不重新构建发版。
9. **不要**在 CloudBase 桶里整目录清空（同桶还有 CamSite / TypeAll 等站点）。
10. **不要**动 DNS 或 CloudBase 域名绑定，除非你清楚 6.5 的连锁反应。

---

## 12. 建议的接手路线（三周）

| 阶段 | 做什么 | 产出 |
| --- | --- | --- |
| 第 1 天 | 只读：本文档 + 6 个地址 + 三条命令 + 浏览器走查 | 自检报告（哪条不通过） |
| 第 1 周 | 修 9.1 激活码校验（P0）；补 9.3 强制 HTTPS | 一次发版 + 两处 hash 一致 |
| 第 2 周 | 把额度判定搬到云函数（9.2），彻底解决绕过 | 云函数 v2 + 回归测试 |
| 第 3 周 | 接支付（替换 `activatePlan` 的调用方，保留 `activated_by` 字段语义）；补会员月度重置任务（9.5） | 支付回调 + 定时任务 |

商业模式上线前的验收清单：激活码不可空过 / 额度不可绕过 / 支付回调幂等 / 会员到期行为正确 / 四态提示诚实。

---

## 附录 A · 速查

**地址**

```
生产    https://luna.solyoung.top/
备用    https://solyoung-d4gpp1f7s4e075f6d-1499756427.tcloudbaseapp.com/
代理    https://solyoung-d4gpp1f7s4e075f6d-1499756427.ap-shanghai.app.tcloudbase.com/lunasol-ai
仓库    https://github.com/SolYoung-Ai/LuanSol
```

**命令**

```bash
npm ci && npx tsc --noEmit && npm test && npm run build   # 三连验收
npx vite preview --port 4174 --strictPort --host 127.0.0.1  # 本地看生产包
curl .../lunasol-ai/health                                  # AI 代理自检
```

**ID / 键**

```
CloudBase env    solyoung-d4gpp1f7s4e075f6d   (ap-shanghai)
IndexedDB        lunasol-studio
localStorage     lunasol.state.v1 / lunasol.ai.v1 / lunasol.ai.runs.v1 / lunasol.cloud.owners.v1
PG 表            lunasol_projects / lunasol_subscriptions
PG 函数          lunasol_consume_quota(p_uid text, p_n integer)
```

**交接时必须向原负责人索要**：GitHub 仓库管理权限 · CloudBase 控制台权限（环境 `solyoung-d4gpp1f7s4e075f6d`）· Cloudflare `solyoung.top` DNS 权限 · DeepSeek 账号（仅确认余额，**不要**要密钥明文）· 是否继续用 `luna.solyoung.top` 作生产入口的决策 · `solyoung.top` 的 ICP 备案状态（大陆节点绑定自定义域名需要）。

---

## 附录 B · 术语

| 词 | 含义 |
| --- | --- |
| 九步向导 | `#/wizard` 的核心流程，代码在 `src/v3/` |
| 草稿（draft） | `ProjectDraft`，九步的完整用户输入，存在 IndexedDB |
| Brief | 由草稿压缩出的设计输入，交给引擎 |
| 刀模（dieline） | 包装展开图，含裁切线/压痕线 |
| 出血 / 安全区 | 印刷预留边（默认 3mm / 5mm） |
| 四态 | AI 建议的四种来源：ai / local / fallback / paywall |
| 计量来源（metered） | 走订阅扣次数的域名。当前 = luna + tcloudbaseapp；github.io 不计费 |
| 付费墙 | `PaywallModal`，`need='login'` 或 `'subscribe'` |
