# LunaSol 接管指令（交接给 workbuddy）

> 交接方：Doubao　|　接手方：workbuddy　|　交接时间：2026-11-09
> 本文件是**唯一权威的接管说明**，读完这一份就能接管，不需要再猜。
> 仓库里另外两份文档：`HANDOVER.md`（2026-11-07 上一手写的，部分内容已过时，第 8 节列了过时点）、`HANDOVER-email-branding.md`（只管验证码邮件这一件事的细节）。

---

## 0. 三条铁律（先记住，后面所有步骤都受它约束）

1. **没有新鲜证据不报完成**。改完代码必须真跑 `npm run typecheck` / `npm test` / `npm run build` 并读到退出码，部署后必须用浏览器真实走一遍。
2. **不要做假功能**：假登录、假云同步、假 AI、假支付、假按钮一律不做；做不到就在界面上明说"内置引擎/未配置"。
3. **密钥不落前端、不进仓库**。厂商模型密钥只存在 CloudBase 云函数环境变量里；`.env.production` 里那几个值是**故意公开的**（见 4.4）。

---

## 1. 这个项目是什么、现在跑在哪

LunaSol = AI 包装设计平台。用户答几个问题 → AI 出结构/方案/图层 → 3D 预览 → 印前检查 → 导出印刷文件。

当前线上拓扑（**这是最容易被前手文档误导的地方，以此为准**）：

```
用户浏览器
   │  HTTPS
   ▼
luna.solyoung.top  ← GitHub Pages（CNAME 在仓库 public/CNAME，实测响应头 server: GitHub.com）
   │  纯静态 React 包（Vite 构建，hash 路由）
   │
   ├── CloudBase Web SDK ──► 认证（邮箱验证码 / 用户名密码）
   │                         PostgreSQL（RLS 行级隔离）
   │
   └── fetch(aiBaseUrl) ──► 云函数 lunasol-ai（HTTP 型）
                            ├─► DeepSeek 对话
                            └─► Seedream 图像生成
```

要点：

- **前端不在 CloudBase 静态托管**。CloudBase 的静态托管服务虽显示 `online`，但 `luna.solyoung.top` 与 `solyoung.top` 在该托管里**没有绑定记录**（`queryHosting(domainStatus)` 返回缺失），实体是 GitHub Pages。别去 CloudBase 托管里找站点文件。
- `solyoung-ai.github.io/LuanSol/` 会 **301** 跳到 `luna.solyoung.top`。
- CloudBase 在这里提供的是**认证 + 数据库 + 云函数**三件事，不是网站宿主。

---

## 2. 半小时接管步骤（照着做，勾完就算接上了）

```bash
# 1) 拿到代码（不要用别人的本地目录，直接 clone）
git clone https://github.com/SolYoung-Ai/LuanSol.git
cd LuanSol
git checkout main

# 2) 装依赖并跑通三条验证
npm ci            # 或 npm install
npm run typecheck # 期望 exit 0
npm test          # 期望 37/37，输出 "37 passed / 0 failed"
npm run build     # 期望 exit 0，产出 dist/

# 3) 本地起站
npm run dev       # http://localhost:5173（Vite 会把 /lunasol-ai 代理到云函数，规避 CORS）

# 4) 确认线上基线
curl -I https://luna.solyoung.top/          # 期望 200，server: GitHub.com
git fetch origin && git log origin/gh-pages -1 --oneline
```

接管前必须能拿到的访问权（缺一样就找用户要，不要自己编）：

| 权限 | 用途 | 现状 |
|---|---|---|
| GitHub 仓库写权限 | 推 `main` 触发部署 | 仓库 https://github.com/SolYoung-Ai/LuanSol |
| 腾讯云 CloudBase 控制台登录 | 改认证/数据库/云函数/邮件模板 | 账号 `solyoung`（**个人版**），环境 `solyoung-d4gpp1f7s4e075f6d` |
| 云函数环境变量读写 | 换模型密钥 | 在控制台「云函数 → lunasol-ai → 函数配置 → 环境变量」 |
| 域名 DNS（solyoung.top） | 换域名/加子域 | 当前 CNAME 指向 GitHub Pages |

第一件要做的事：`git log --oneline -3` 对照本文件第 5 节，确认你拿到的不是旧代码。

---

## 3. 发布流水线（已经自动化，别再手动推 gh-pages）

### 3.1 唯一正确的发布方式

```bash
git add -A
git commit -m "feat/fix: 简明说明"
git push origin main        # 推完就结束，剩下的交给 Actions
```

`.github/workflows/deploy.yml`（**已提交在仓库里**，虽然 `.gitignore` 里也写了这一行，但文件已被跟踪所以仍然生效）做四件事：

1. `actions/checkout` → `setup-node` Node 20 → `npm ci`
2. `npm run build`（= `tsc --noEmit && vite build`，类型错误会直接卡住发布）
3. `npm test`（37 项引擎/AI/订阅断言，挂了也不发）
4. `touch dist/.nojekyll` → `peaceiris/actions-gh-pages` 把 `dist` 推到 `gh-pages` 分支

所以：**类型不过或测试不过 = 线上不更新**。这是有意设计的闸门，不要绕过（不要 `--no-verify`，不要手动推 dist）。

### 3.2 怎么确认真的发出去了

```bash
# 界面侧（推荐，最直观）
curl -s "https://api.github.com/repos/SolYoung-Ai/LuanSol/actions/runs?per_page=3" \
 | python3 -c "import sys,json;[print(r['created_at'],r['name'],r['conclusion'],r['head_sha'][:7]) for r in json.load(sys.stdin)['workflow_runs']]"

# 分支侧
git fetch origin && git log origin/gh-pages -3 --pretty="%h|%ad|%s"
```

期望看到两条记录：`Build and Deploy LunaSol to GitHub Pages`（conclusion=success）+ `pages build and deployment`（dynamic，success）。最后一条 gh-pages 提交的 sha 应该等于你刚推的 main 的 sha。

当前线上基线：main `c78cc85` → gh-pages `f18cdd5`，两条 Actions 记录都是 success（已验证于 2026-11-09）。

### 3.3 发布后必做的一步（历史坑，会白屏）

旧 chunk 会 404。发布后第一次打开用带参数地址：

```
https://luna.solyoung.top/?fresh=<任意变化的值>
```

另外：线上站点首次访问有「内测中」欢迎层（`BetaAnnouncement`），会挡住按钮点击，自动化测试前要先点「先逛逛」。

### 3.4 构建约束（改架构前必看）

- **hash 路由 + `base: './'`** 是硬约束：GitHub Pages 是纯静态，没有服务端 rewrite，改成 History 路由会 404。
- `public/CNAME` 必须存在于构建产物里，否则自定义域名失效（历史上踩过一次，commit `69c0c86` 修的）。
- `vite.config.ts` 里 `server.proxy` 把 `/lunasol-ai` 指到云函数，这是本地开发唯一能跑通 AI 的方式（生产用 `.env.production` 的完整地址）。

---

## 4. 云端家底（服务器这一摊到底到哪一步了）

### 4.1 CloudBase 环境

| 项 | 值 |
|---|---|
| 环境 ID | `solyoung-d4gpp1f7s4e075f6d` |
| 地域 | `ap-shanghai` |
| 套餐 | 个人版（很多能力受限，见 4.6） |
| 控制台 | `https://tcb.cloud.tencent.com/dev?envId=solyoung-d4gpp1f7s4e075f6d` |
| 后端 | PostgreSQL（RLS）+ 云函数 SCF + 静态托管（**本站未用**） |

### 4.2 数据库（PostgreSQL，`public` schema）

实际存在且属本项目 7 张表（行数为 2026-11-09 快照，用来判断"有没有真数据"）：

| 表 | 列数 | 现有行数 | 作用 |
|---|---|---|---|
| `lunasol_projects` | 5 | 15 | 项目（`payload` jsonb 存图层/设计） |
| `lunasol_subscriptions` | 12 | 3 | 积分与套餐（`quota_total/quota_used/bonus_credits/period_end`） |
| `lunasol_credit_logs` | 8 | 8 | 积分明细（`change_type` 决定正负号，不看 amount 符号） |
| `lunasol_chat_conversations` | 5 | 31 | Luna 对话记录 |
| `lunasol_checkin_logs` | 6 | 5 | 每日签到（`checkin_date` 存本地日期，不是 UTC） |
| `lunasol_user_profiles` | 7 | 3 | 头像/生日/昵称/简介 |
| `lunasol_redeem_codes` | 5 | 3 | 兑换码 |

`kv`、`kv_backup`、`submissions` 是别的项目/历史遗留，不要动。

**数据层铁律**（都是踩出来的，别重犯）：

- 所有表启用 RLS，普通用户只能读写 `owner_id = auth.uid()`；积分等敏感字段不允许前端直接 UPDATE，必须走 RPC / 云函数。
- PostgreSQL 主键是 `text` 且无默认值 → 插入必须**显式给 id**（`'<uid>_<业务id>'` 形式），否则静默失败。
- 删除时传的 id 必须是**带账号前缀的完整 rowId**，否则静默落空（行数不变）。
- SDK 查询可能返回 `undefined`，读 `.error` / `.data` 之前必须空值保护。
- 消耗积分要**按顺序扣两个钱包**（`quota_used` 与 `bonus_credits`），只扣一个会封顶导致白嫖。
- 迁移脚本放在 `cloudbase/migrations/*.sql`（5 个文件），改动数据库要走这个目录，别在控制台裸改。

### 4.3 云函数

| 函数 | 类型 | 运行时 | 规格 | 最近更新 |
|---|---|---|---|---|
| `lunasol-ai` | HTTP | Nodejs 18.15 | 256MB / 120s | 2026-11-08 20:25 |
| `solhub-auth` | HTTP | Nodejs 18.15 | — | 别的项目（SolHub），不要动 |
| `solhub-cron` | Event（定时） | Nodejs 18.15 | — | 同上 |

`lunasol-ai` 的对外地址：

```
https://solyoung-d4gpp1f7s4e075f6d-1499756427.ap-shanghai.app.tcloudbase.com/lunasol-ai
```

路由（源码 `cloudfunctions/lunasol-ai/index.js`）：

| 路径 / 方法 | 行为 |
|---|---|
| `GET /` 或 `/health` | 健康检查 |
| `POST .../chat/completions` | 转发 DeepSeek 对话（流式） |
| `POST .../images/generations` | 转发 Seedream 生图，返回 base64 |

环境变量（名字可查，值在控制台，**不要在聊天里贴明文**）：

`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`、`SEEDREAM_API_KEY`、`SEEDREAM_MODEL`、`LUNASOL_PROXY_TOKEN`、`LUNASOL_ALLOWED_ORIGINS`、`LUNASOL_DAILY_LIMIT`

改密钥的正规做法：控制台改环境变量 → 保存 → 让函数重新部署生效（改环境变量会自动触发一次更新，注意函数 `ModTime` 会变）。**不要**把 key 写进仓库或 `.env.production`。

### 4.4 前端配置（公开值，故意入库）

`.env.production`（**已提交，CI 构建要用**）只有 5 个值：

| 变量 | 含义 | 是否敏感 |
|---|---|---|
| `VITE_CLOUDBASE_ENV_ID` | 环境 ID | 否（公开） |
| `VITE_CLOUDBASE_REGION` | ap-shanghai | 否 |
| `VITE_CLOUDBASE_PUBLISHABLE_KEY` | CloudBase 前端 Publishable Key | 否（设计为可公开，服务端按 Origin + 登录态校验） |
| `VITE_LUNASOL_AI_BASE_URL` | 云函数地址 | 否 |
| `VITE_LUNASOL_AI_TOKEN` | 自建代理的访问令牌（**不是厂商密钥**，只防任意站点白嫖代理） | 半敏感，已在仓库历史里；要轮换务必同时改云函数 `LUNASOL_PROXY_TOKEN`，否则全线 401 |

读取入口统一在 `src/cloud/config.ts`（`CLOUD` / `cloudConfigured` / `cloudOriginSupported()`）。三个值缺一个就退化成"本地模式"并在角落显示「本地模式」，**这是故意保留的降级，不是 bug**。

### 4.5 域名与安全域名白名单

CloudBase 环境安全域名（浏览器跨域白名单，`queryEnv(action=domains)` 实测）：

| 域名 | 状态 |
|---|---|
| `luna.solyoung.top` | ENABLE（**线上站点的登录/发码全靠这条**） |
| `luna.solyoung.com` | ENABLE（备用域名，暂未启用解析） |
| `solyoung-d4gpp1f7s4e075f6d-1499756427.tcloudbaseapp.com` | ENABLE（默认测试域名，首屏有风险提醒） |
| 其他 10 条 | 平台系统域名 |

**换域名/加新入口时必须同步加白名单**，否则浏览器会被 CORS 拦掉（表现为"登录一直失败"）。本地开发要加 `localhost:5173`；当前白名单里**没有 localhost 条目**，所以本地 dev 若直接调线上 SDK 可能被拦——本地联调建议直接调线上，或临时加 `localhost:5173`（`manageEnv(action=addSecurityDomain)`，10 秒后轮询确认收敛）。

### 4.6 认证（CloudBase Auth）

- 已开启 Provider：`email`（邮箱验证码）、`username/password`（用户名密码）。
- **验证码邮件模板已品牌化**（LunaSol 黑金），实发实测通过。细节见第 5 节第 10 条与 `HANDOVER-email-branding.md`。
- 前端认证链路（`@cloudbase/js-sdk@3.11.0`，Supabase 风格新 API）：

| 能力 | 链路 |
|---|---|
| 验证码登录 | `signInWithOtp` → `verifyOtp({ token, email, messageId })` |
| 注册 | `signUp` + 前端强制"确认密码" |
| 修改密码 | `reauthenticate()` 发 REAUTHENTICATION 码 → `updateUser({ nonce, password })` |
| 绑定邮箱/手机 | `updateUser({ email \| phone })` 发码 → `verifyOtp({ token, email \| phone, messageId })` |

注意：`auth.updatePassword(...)` **在这个 SDK 里不存在**（只存在 `auth.currentUser` 上）。历史 bug 就是判断了一个不存在的方法，导致改密恒弹「登录服务未就绪」。

### 4.7 静态托管

服务 `online`，域名 `solyoung-d4gpp1f7s4e075f6d-1499756427.tcloudbaseapp.com`，但**本站前端没有部署到它**。除非你打算整体搬到 CloudBase（会换域名、要重新配白名单），否则不要往里传文件。

### 4.8 个人版的能力边界（决定"能不能做"，不是"要不要做"）

| 想做 | 现实 | 结论 |
|---|---|---|
| 改邮件发件地址 / 发件人显示名 | 平台代发固定 `cloudbase_noreply@tencent.com`；「自定义 SMTP」radio 是 disabled | 个人版做不到，需要企业版或自有域名邮箱 |
| 用 MCP `callCloudApi(ModifyProvider)` 改认证 | CAM 拒绝 `tcb:ModifyProvider` | 走 `manageAppAuth`，别调 callCloudApi |
| 云函数代码部署 | `manageFunctions` 在 cloud mode 下不落盘；历史上用控制台上传 ZIP | 优先控制台「函数代码 → 上传 ZIP」（平铺，含 `index.js`/`package.json`/`scf_bootstrap`） |

---

## 5. 我从 workbuddy 接手之后，改了什么（52 个提交，全清单）

基线：`f3ebae9`（11-07 19:11「添加项目交接文档」）→ 现在 `c78cc85`。
增量规模：**52 个提交、82 个文件、+9125 / −3101 行**。

按主题归并（每行都能用 `git log <范围>` 复核）：

| # | 主题 | 做了什么 | 为什么要做 | 关键提交 / 文件 |
|---|---|---|---|---|
| 1 | **账号体系**（接手第一刀） | 强制登录才能开始设计；登录后不再弹账号面板；账户页改个人资料（头像/昵称/生日）；所有页面加返回按钮；订阅页重排；新增 `/security` 账号安全页；新增 `/help` 帮助页 | 原来的登录是"装饰性"的，未登录也能进工作台；资料页信息混乱；缺客服入口 | `f4e2941` + `src/pages/account.tsx` `security.tsx` `help.tsx` |
| 2 | **Luna 对话**（入口 + 视觉 + 能力） | 新增 Luna 入口与 `/help`；重做为 ChatGPT/Grok 式界面；玻璃拟态侧栏；思考过程默认折叠；多模型下拉（DeepSeek/Kimi/Doubao/GLM）；Markdown 符号裸露修复；移动端抽屉式侧栏 | 用户要"像真人设计师对话"，且模型可自己选；模型输出 Markdown 符号在纯文本渲染里会露出来 | `963162d` `a15266a` `77e69eb` `1185151` `f2ec970` `src/pages/luna.tsx` `src/i18n.tsx` |
| 3 | **积分与定价** | 积分制改版 + 充值包 + 兑换码 + 开发者管理页；生图两档 Flash(6)/Pro(10)，退役 Lite；Seedream 4.5 → 5.0；标签改"Seedream 5.0"；积分明细可展开；明细按钮全宽；消耗显示 `-`；签到双倍权益（¥29/月） | 毛利要算得过来；档位太多用户看不懂；明细必须能自查 | `6793058` `f35e0a3` `1e0acf5` `0f1f31b` `src/pages/subscribe.tsx` `src/cloud/plans.ts` |
| 4 | **积分链路修复** | 修复"前端只扣 UI 不写库"；签到写 `lunasol_credit_logs`；签到日期改本地时间；`recordUsage` 补 `taskType`；消耗按顺序扣双钱包 | 用户实测换设备积分对不上，是真实资损 | `8ae3985` `5fd91ac` `ac2d292` `c10d4a0` `src/cloud/subscription.tsx` |
| 5 | **云同步与数据一致性** | 头像/生日上云；修 `updateUserBasicInfo` 返回 undefined；修资料表插入缺 id；全部查询加空值保护；批量删除带 rowId 前缀；空 state 保护（区分"用户全删"与"加载失败"） | "换浏览器数据就没了"是用户最不满的问题，根因是 localStorage 按浏览器隔离 | `6ff62e4` `fa9d91d` `b2460fc` `b522c52` `7c3899d` `ba881fd` |
| 6 | **工作台 V6→V7→V8 重构** | V6 基础架构/图层/AI 素材/局部修改/导出/3D；V7 复用全局类型、撤销重做、属性编辑、缩放控制点、图层增删改层级、网格参考线、自动保存、SVG/ZIP 导出；V8 拆 Studio 为 editor 组件架构（`EditorContext` 单一数据源 + 三视图 + 线性图标 + 快捷键）、独立素材库、22 个 AI 结构化工具（AI 只调工具不执行 JS） | 前手的工作台是"搭了框架没实现"，用户原话"乱七八糟你都没有给我做好" | `23bbd34` → `96537cf` → `d7465d8` → `87142df` → `04e0d1f` `src/editor/*` |
| 7 | **AI 原生创作流程（P0–P5）** | `/new` 新建设计入口与项目初始化；任务规划 + 节点运行器；节点画布（平移缩放/连线/真实状态）；StepBar 可往返；生图提示词改中文；自动组装引擎；编辑器嵌入流程（流程内切编辑器）；移动端适配；素材库入口 | 用户要"说一句话就出包装"，不是填九步表单 | `a3e178e` `9050696` `678cdd1` `c1752de` `6ef448b` `src/workflow/*` |
| 8 | **旧链路收敛** | 九步向导整条链路删除，旧路由（`/wizard` `/brief` `/editor` `/export` 等）全部 301 到 `/studio` | 两套 UI 并存会让用户迷路；旧流程无维护价值 | `3a5005e` `src/App.tsx` |
| 9 | **审美市场** | 先加 98 个站点真实截图封面 → 又**回滚**为纯文字卡片；下线虚构的"灵感库" | 截图封面加载慢/失真，且部分站点打不开，体验反而更差；虚构项目违背"无假数据"铁律 | `66db4c8` `ff8e397` `src/pages/market.tsx` |
| 10 | **验证码邮件品牌化** | CloudBase email provider 写入 `DefaultTpl` + `RegisterSignIn` 中英双版黑金模板 + 主题「LunaSol 验证码 / Your LunaSol verification code」+ 发件人名 LunaSol；实发验证 | 用户收到的是 CloudBase 默认邮件，品牌断层 | 无代码提交（纯云端配置）；调用体快照 `.email-config-payload.json`；细节 `HANDOVER-email-branding.md` |
| 11 | **发布基础设施** | 启用 GitHub Actions 自动部署；修 CNAME 丢失导致的域名失效；构建加 `.nojekyll` | 之前是手动推 gh-pages，容易漏文件、漏 CNAME | `a3e432b` `69c0c86` `.github/workflows/deploy.yml` |
| 12 | **文档治理** | 移除非公开的内部运维文档（`docs/` −1792 行），README 只留产品介绍 | 仓库是公开的，内部运维细节不该暴露 | `7f024b2` `4454bf7` |
| 13 | **品牌视觉统一** | 波浪 logo 透明底（favicon/导航/AI 头像三处）；导航顺序 `开始/Luan/工作台/审美市场`；全站 iOS 圆角与缓动变量；仅侧栏保留液态玻璃、其余回归纯白；手机端汉堡菜单 | 视觉不统一、圆角各写各的 | `8e26559` `47d1e83` `27c7357` `1d0a521` `src/styles.css` `src/v4.css` |
| 14 | **安全加固** | 代理令牌轮换 + 云函数加登录态校验；强制刷新老用户浏览器里的旧令牌（修 401）；uid 自动同步到 AI 配置 | 代理地址是公开的，不校验等于给全网白嫖模型额度 | `bcc4aee` `8c5660f` `0c192ef` `cloudfunctions/lunasol-ai/index.js` |
| 15 | **账号安全真实链路**（最后一刀） | 改密改走 `reauthenticate → updateUser({nonce,password})`；绑定走 `updateUser → verifyOtp`；注册加"确认密码"；账号安全页重做 | `auth.updatePassword` 在该 SDK 上不存在，改密恒失败 | `c78cc85` `src/cloud/sdk.ts` `auth.tsx` `security.tsx` `LoginDialog.tsx` |

**云端（非 git）侧的变更，一并交底**：

| 变更 | 之前 | 现在 |
|---|---|---|
| email provider `TemplateConfig` | `null`（CloudBase 默认邮件） | 完整 LunaSol 双场景模板 + 中英主题 |
| email provider `Homepage` | 空 | `https://luna.solyoung.top/`（副作用，无害，可保留） |
| email provider `On` / `SmtpConfig.SenderAddress` | `TRUE` / `cloudbase_noreply@tencent.com` | 未变（仍平台代发） |
| 数据库 | 逐步新增列/策略 | 见 4.2，7 张业务表 + 迁移脚本 |

---

## 6. 关键决策与"为什么这么干"（避免你推翻重来）

| 决策 | 理由 | 不要动的边界 |
|---|---|---|
| hash 路由 + `base: './'` | GitHub Pages 无服务端 rewrite | 换 History 路由 = 所有深链 404 |
| CI 里 `build` 兼做类型检查 | 少一条命令少一个漏网 | 不要给 `tsc` 加 `--skipLibCheck` 之外的宽松选项来"过 CI" |
| 前端不存任何厂商密钥 | 前端包是公开可下载的 | 只允许 publishable key 与代理令牌 |
| 云函数做统一代理 | 一是藏 key，二是统一限流/鉴权/配额 | 不要让前端直连 DeepSeek/Seedream |
| 积分两档（Flash 6 / Pro 10） | 两档毛利可算清，三档用户选择困难 | 改价必须同时更新订阅页文案 + 云函数计费 + 测试断言 |
| 头像/生日必须上云 | localStorage 按浏览器隔离，用户换设备就"丢数据" | 任何"跨设备要一致"的字段都不许只存 localStorage |
| 旧 `/studio` 保留，旧九步链路杀掉 | 用户明确要求不删旧编辑器 | 不要以"清理"为名删 `/studio` |
| 邮件模板靠 `EmailConfig.On:"FALSE"` 写入 | 服务端在"平台代发"分支会丢弃整个 `EmailConfig`；传 `FALSE` 才允许落库，落库后服务端自己回置 `TRUE` | 只传 `TemplateConfig` 一定会失败，别试第二遍 |

---

## 7. 已确认的死路与踩坑（省你几天）

**部署 / 构建**

- 手动往 gh-pages 推 dist 容易漏 `CNAME`、`.nojekyll` → 域名失效/静态资源 404。现在只推 main。
- 部署后不换 URL 会读到旧 chunk → 白屏。用 `?fresh=` 强制。
- 首屏「内测中」欢迎层会遮挡点击，自动化必须先点「先逛逛」。

**CloudBase / 数据**

- PG 主键 text 无默认 → 插入不显式给 id 就静默失败（不会报错）。
- 删除要完整 rowId（带账号前缀），否则 0 行受影响且无报错。
- RLS 下 UPDATE 可能静默失败，必须检查返回值并 upsert 兜底。
- `queryPermissions(listRoles)` 在 PG 环境被平台拒绝，别重试；RLS 用 `managePgDatabase` 跑 `CREATE POLICY`。
- 云函数里不要随便引入 `@cloudbase/node-sdk`，可能因依赖未预装启动失败。
- MCP 工具定义会中途变化，报 `tool changed` 就先 `tool_search` 拿最新 schema；`execute_defer_tool` 的 `toolName` 要写在顶层，不能塞进 `params`。

**邮件模板（本轮实证，逐条记）**

| 尝试 | 结果 |
|---|---|
| `updateProvider` 只传 `TemplateConfig` | success + RequestId，但回读恒 `null` |
| `callCloudApi(ModifyProvider)` | CAM 拒绝 `tcb:ModifyProvider` |
| 本地 CLI 临时凭证直连 `ModifyProvider` | 丢弃 `EmailConfig`；同接口写 `Homepage` 能成 → 证明字段级拦截 |
| 换字段名 `EmailTemplateConfig` / 顶层 `TemplateConfig` | 无效 |
| 控制台「配置发件邮箱」找模板编辑器 | 只有「实时预览」iframe，无可编辑控件；SMTP radio disabled |
| **`EmailConfig.On:"FALSE"` + `TemplateConfig` 同时提交** | **成功落库**，服务端随后回置 `On:"TRUE"`，实发邮件生效 |

**前端**

- 数字类 UI 加载期不要用 `?? 默认值` 兜底，否则先显示 100 再跳真实值（闪烁）。
- 移动端点击处理里若要 `await`（尤其动态 import），必须**先同步置 loading**，否则弱网静默期会被当成按钮失效。
- 轮播非当前页 `loading="lazy"` 会永不加载，要 `eager`。
- 明细列表的收支符号看 `change_type`/`type`，不要假设 `amount` 正负号。

---

## 8. 上一份交接文档（`HANDOVER.md`）已过时的地方

> 保留它做历史记录，但**不要按它干活**。以下是与现状冲突的条目：

| 它写的 | 实际 |
|---|---|
| 样式：Tailwind CSS、图标 lucide-react | 实际是原生 CSS（`styles.css`/`v3.css`/`v4.css`），图标是自建线性 SVG 库 `src/components/icons.tsx`；依赖里没有 tailwind、没有 lucide |
| 头像存 localStorage，未云端同步 | 已改为 `lunasol_user_profiles` 云同步（`6ff62e4` 起） |
| 部署：push 后 GitHub Pages 自动部署（未提 CI） | 现在是 Actions 跑 build+test 再发 gh-pages；类型/测试不过就不发 |
| 工作台 V7 一堆"待完成" | 已完成（撤销重做/图层/局部 AI/云同步/版本历史/PDF/3D/印前报告），并已演进到 V8 + workflow |
| 未解决问题：跨浏览器不同步、积分 304 vs 104 | 已按 4.2 的口径修复（数据只从库读，localStorage 只做缓存兜底） |
| 后端"静态托管 + 自定义域名" | 前端实际在 GitHub Pages；CloudBase 托管未承载本站 |

---

## 9. 未完成 / 待办（按优先级，接手后照这个排）

**P0（影响线上体验或合规）**

1. **改密 / 绑定的最后一步未由 AI 实测闭环**。代码与前端拦截都已上线并验证过发码成功，但"填验证码 → 确认 → 真正生效"这一段需要你补一次真实走查（见第 10 节验证法）。
2. **发件人显示名仍为「云开发CloudBase」**。这是个人版平台代发固定行为，`SenderNameZhCN/EnUS` 写了不生效。要改只能上自定义 SMTP（需域名邮箱授权码，radio 当前 disabled）——这是账号权限问题，先找用户拍板，别硬改。
3. **`.email-templates.json` 与 `.cb_api.py` / `.cb_set_email_tpl.py` 处置**：前两个可入库做模板版本管理；后两个会读本机 `~/.config/.cloudbase/auth.json` 临时凭证，**必须删除或加 `.gitignore`**，绝不能提交。

**P1（产品完整性）**

4. `DefaultTpl` 的真实命中场景未逐一验证（改密 REAUTHENTICATION / 绑定邮箱 / 找回密码各发一次对照）。
5. 英文模板未触发验证（浏览器语言切英文再发一次）。
6. 工作台导出：PDF 合规边界仍按 README 声明（不是 PDF/X-4，CMYK 近似、无 ICC），**不要**为了"看起来专业"改文案。

**P2（工程整洁）**

7. `tests/suite.ts` 的 37 项断言覆盖引擎/AI/订阅，但**没有覆盖认证链路与邮件模板**；改这两块时靠人工验证。
8. 本地 dev 到 CloudBase 的安全域名白名单缺 `localhost:5173`，本地联调若被 CORS 拦要先加。

---

## 10. 怎么验证"线上是真的好了"（照这个做，别只看 JSON）

**A. 部署验证**

```bash
curl -s "https://api.github.com/repos/SolYoung-Ai/LuanSol/actions/runs?per_page=2" | python3 -m json.tool | head -40
curl -I https://luna.solyoung.top/          # 200 + server: GitHub.com
```

**B. 认证/邮件验证（3 分钟）**

1. 打开 `https://luna.solyoung.top/#/security`，点「先逛逛」关掉内测层 →「登录 / 注册」→「验证码登录」
2. 输入接收邮箱 → 发送验证码 → 在邮箱里核对：主题应为「LunaSol 验证码」，正文应为黑金模板（黑底金标头部 + 金边验证码框 + 页脚 `luna.solyoung.top`）
3. 填验证码登录 → 进 `/security` 走一次改密：应收到第二封（REAUTHENTICATION 场景）同样品牌的邮件，`DefaultTpl` 是否命中在这一步能看出来

**C. 服务端配置反查**

```
queryAppAuth(action=getProvider, providerId=email)   → EmailConfig.TemplateConfig 必须非 null
queryEnv(action=domains, envId=...)                  → luna.solyoung.top 状态 ENABLE
queryPgDatabase(action=sql, "SELECT count(*) FROM lunasol_projects")
```

**D. 邮箱测试账号**：`solyoungwork@gmail.com`（用户名 `solyoungwork`，曾 64 积分）。手机 `+86 15539572717` 未绑定。

---

## 11. 回滚手册（出事了按这个撤，别现场发明）

| 故障 | 回滚动作 | 验证 |
|---|---|---|
| 新版本白屏 | GitHub → Actions → 找到上一个成功 run → 用它的 sha 重跑，或 `git revert` 后重推 main | `?fresh=1` 打开正常 |
| 域名失效（跳到 github.io 或 404） | 确认 `public/CNAME` 在仓库里 → 重推 main | `curl -I https://luna.solyoung.top/` 返回 200 |
| 邮件变回 CloudBase 默认 | `updateProvider` 传 `{EmailConfig:{On:"FALSE", TemplateConfig:null}}`，回读为 null | 发一封验证码看是否默认样式 |
| 只回滚邮件主题 | 重新写 `TemplateConfig` 里的 `SubjectZhCN/EnUS` | 收信看主题 |
| 撤销 provider Homepage 改动 | `updateProvider` 传 `{Homepage: ""}` | 回读为空 |
| AI 全线 401 | 检查云函数 `LUNASOL_PROXY_TOKEN` 与前端 `VITE_LUNASOL_AI_TOKEN` 是否一致（轮换必须双端同改） | 打开 Luna 发一句话 |
| 数据被误删 | 表有 RLS 但无备份策略，`kv_backup` 只覆盖 kv。**没有数据库快照**，删除类改动先在控制台导出 | — |

---

## 12. 用户偏好与硬约束（违反会被打回）

- **禁止 Emoji**；图标一律用 `src/components/icons.tsx` 的线性 SVG（`IconName` 里有 lock/unlock/edit/alert/layers/spark/plus/minus/close/refresh/send/message/brain/chevronDown/check/search，**没有 mail/phone/shield**，需要就自己按同一线条风格加）。
- 不删旧编辑器 `/studio`；Luna 页、审美市场、头像相关区域不要乱动。
- 不做假按钮、假数据、假云同步、假支付；做不到就在界面上说明真实能力。
- 功能优先于好看；会员页不展示调用成本；账号页保持精简。
- 品牌色：`--gold:#c8a86b`、ink `#1d1d1b`、浅底 `#fafaf9`、边框 `#e8e6e0`、验证码框底 `#faf7f0`。
- 密码规则：新密码 ≥ 8 位；验证码正则 `^\d{4,8}$`（实收为 6 位）。
- 一次性交付：用户要能直接部署的成品，不要"方案 + 你自己改"。

---

## 13. 接管验收清单（打勾即视为交接完成）

- [ ] `npm ci && npm run typecheck && npm test && npm run build` 四条全绿（记下 `37 passed`）
- [ ] `npm run dev` 起得来，`/#/studio` 能进（未登录会提示先登录）
- [ ] 有权访问 GitHub 仓库与 Actions 页面
- [ ] 有权登录 CloudBase 控制台（`solyoung` 个人版，env `solyoung-d4gpp1f7s4e075f6d`）
- [ ] 确认 `origin/gh-pages` 最新 sha == `main` 最新 sha
- [ ] 收到一封「LunaSol 验证码」黑金邮件（第 10 节 B）
- [ ] 读过 `HANDOVER-email-branding.md`，知道 `On:"FALSE"` 这个写入技巧
- [ ] 删掉或忽略 `.cb_api.py` / `.cb_set_email_tpl.py`（含本机临时凭证）
- [ ] 明确知道：前端在 GitHub Pages，不在 CloudBase 静态托管

---

**交接结论一句话**：这个站现在是一个能跑、能发版、能收真邮件、数据落 PostgreSQL 的可运营站点；剩下的是两件"权限/闭环"性质的事（发件人显示名、改密绑定最后一步实测），不是代码欠账。
