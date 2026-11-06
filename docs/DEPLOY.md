# 部署说明（GitHub Pages）

线上地址：<https://solyoung-ai.github.io/LuanSol/>

## 架构

- 前端：React 18 + TypeScript + Vite 5 + Three.js + jsPDF + JSZip，手写 CSS（无 Tailwind 运行时依赖）。
- 路由：**hash 路由**（`#/create`、`#/editor` …），因此 GitHub Pages 不需要任何服务端 rewrite，`404.html` 也不需要。
- Vite `base: './'`：构建产物放在任意子路径都能正确加载资源。
- 数据：IndexedDB（localStorage 兜底），**零服务器、零数据库成本**。
- 部署目标：GitHub 仓库 `SolYoung-Ai/LuanSol` 的 `gh-pages` 分支根目录。

## 自动部署（推荐）

工作流文件位于仓库 `docs/deploy-workflow.yml`，本地源码也保留了一份 `.github/workflows/deploy.yml`。
**当前创建仓库所用的令牌只有 `repo` 权限、没有 `workflow` 权限，因此无法由脚本把 `.github/workflows/*.yml` 推上 GitHub**（GitHub 会拒绝）。启用自动部署只需在 GitHub 网页端打开仓库 → Add file → Create new file → 路径填 `.github/workflows/deploy.yml` → 粘贴 `docs/deploy-workflow.yml` 的内容并提交；之后每次 push 到 main 都会自动构建部署。

本次上线已采用下方的「手动部署」方式把 `dist/` 推到 `gh-pages` 分支并开启 Pages，网站现在即可访问。

工作流内容：

1. 推送到 `main` 触发工作流；
2. `npm ci` → `npm run build`（含 `tsc --noEmit`）→ `npm test`；
3. `touch dist/.nojekyll`；
4. `peaceiris/actions-gh-pages@v4` 把 `dist/` 推到 `gh-pages` 分支。

仓库设置：**Settings → Pages → Build and deployment → Source = Deploy from a branch → Branch = `gh-pages` / `(root)`**。

工作流权限需要 `contents: write`（已在 workflow 中声明；若组织限制，请在 Settings → Actions → General → Workflow permissions 中开启 Read and write permissions）。

也支持在 Actions 页面手动 `Run workflow`。

## 手动部署（无 Actions 时）

```bash
npm ci
npm run build
touch dist/.nojekyll

cd dist
git init -b gh-pages
git add -A
git commit -m "deploy: LunaSol build"
git remote add origin https://github.com/SolYoung-Ai/LuanSol.git
git push -f origin gh-pages
```

然后在仓库 Settings → Pages 中选择 `gh-pages` / root，等待约 1 分钟即可访问。

## 本地预览生产构建

```bash
npm run build
python3 -m http.server 8765 --bind 127.0.0.1
# 打开 http://127.0.0.1:8765/dist/
```

## 常见问题

- **页面空白**：确认 Pages 选择的是 `gh-pages` 分支而非 `main`；确认 `dist/index.html` 存在。
- **资源 404**：`vite.config.ts` 使用 `base: './'`，不要改成绝对路径 `/`，否则项目站子路径会失败。
- **刷新子页面 404**：本站使用 hash 路由，不会出现该问题。
- **API Key 报错**：密钥只存在本机浏览器，换设备需重新配置；详见 [AI_SETUP.md](AI_SETUP.md)。

## V3 版本说明（恢复现代简洁视觉 + 十步向导）

- 视觉层已回滚到手绘改版前：`index.html` / `src/styles.css` 恢复 Modern Minimalism；删除 `src/components/doodle.tsx`、`hand.ts`、`scenes.tsx`；首页不再有手绘角色、涂鸦、统计条与手写字体 CDN。
- 新增十步向导（`#/wizard`）与需求汇总（`#/review`），统一项目模型 `ProjectDraft` 由 `src/v3/draft.ts` 定义，自动保存沿用 IndexedDB + localStorage 兜底。
- 风格库：10 个现代商业风格 + 18 个传统选项（归入 14 组中国传统艺术风格），每个风格都有完整配置并由自身纹样规则生成独立矢量图层，不是只把风格名拼进提示词。
- 构建分包：`vite.config.ts` 用 `manualChunks` 拆出 `vendor-three` / `vendor-pdf` / `vendor-canvas` / `vendor-react` / `vendor-zip` 等可长期缓存的 chunk，主包由约 1.3 MB 降到约 255 KB，构建无 chunk 体积警告。`three` / `jsPDF` / `JSZip` 仍为静态依赖，首屏会以 `modulepreload` 并行下载；真正按需加载的是 `html2canvas` / `dompurify`（`vendor-canvas`）。
- 无 WebGL 的环境（部分无头浏览器 / 关闭硬件加速）会自动切换为 2D 立体图预览，并在页面上明确说明，不影响平面稿与印刷文件导出。

### 本次验收结果

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npm test`（Node） | 19/19 通过 |
| 浏览器测试套件（PDF 字节级预检、300DPI 渲染、SVG/DXF） | 21/21 通过 |
| 十步向导端到端浏览器验收（含生成三方案、可编辑文字、条码图层、印前与导出） | 28/28 通过 |
| 补充验收（Logo 真实上传、EAN-13 校验位、版本恢复、移动端步骤） | 8/8 通过 |
| 14 个路由桌面渲染 / 无横向溢出 / 无 console error | 通过 |

未配置 AI 模型时，界面明确标注「未调用 AI」，不会把内置模板冒充真实生成；零售 GTIN/EAN/UPC 条码必须由用户合法取得，系统只提供校验位验证、预览占位码与内部 SKU（Code 128）。

## V3.1 版本说明（AI 融入流程 + 后台接入位置）

- 新增 `src/ai/` 统一 AI 能力层：12 个能力点（10 个向导步骤 + 需求汇总 + 在线编辑器），每个点都声明 system prompt、输出结构、合规约束、确定性本地回退与采纳动作。十步向导底部统一渲染 `AIAssist`；原先分散在各步骤、实际写死的「AI 帮我推荐」按钮全部改走同一任务层，后台接入后整体切换。
- `AIAssist` 支持补充一句自然语言想法、逐条采纳建议；只有用户主动点「采用」才写回 draft，已确认的品牌名、产品名与核心文案不会被改写。未接入时明确显示「本地建议 · 未调用 AI」。
- `AISettings.mode` 支持 `off` / `browser` / `proxy`。**正式上线推荐 `proxy`**：模型厂商密钥留在后台，前端不需要也不保存 Key，模型名可留空由后台决定；设置页切模式并填 Base URL，全站 AI 能力立即生效。
- 合规校验写在任务层而非 UI：编造成分 / 功效 / 认证、生成零售条码数字、发明不存在的风格、在「不需要插画」时添加图案，都会被拦截并如实回退本地建议；调用记录可在「AI 模型配置中心 → 最近调用记录」查看。
- 后台接入契约见 [AI_INTEGRATION.md](AI_INTEGRATION.md)（接口形状、任务清单、输出 schema、替换 `registerAITransport` 的方法、接入检查清单）。
- 首页能力网格由 4 列改为 3 列 × 2 行，6 项正好铺满，消除第二行缺两格留下的空白块。

### V3.1 验收结果

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npm test`（Node，新增 5 组 AI 层测试） | 24/24 通过 |
| 浏览器测试套件（含 PDF 字节级预检、300DPI 渲染） | 26/26 通过 |
| 十步向导端到端回归 | 28/28 通过 |
| 补充验收（Logo 上传、EAN-13、版本恢复、移动端） | 8/8 通过 |
| 后台代理端到端（模拟 GPT 代理：接入 / 采纳 / 调用记录 / 故障回退 / 违规拦截） | 10/10 通过 |
| 15 个路由桌面渲染 + 移动端 AI 助手 | 无 console error、无横向溢出 |

## V3.2 版本说明（DeepSeek 真实接入 + 云开发账号与云同步）

### 1. AI：从「预留位置」变成真实调用

- CloudBase 国内站已部署 HTTP 云函数 `lunasol-ai`（`cloudfunctions/lunasol-ai`），作为 OpenAI 兼容代理转发到 DeepSeek：
  - `POST /chat/completions` 转发厂商接口，密钥只存在云函数环境变量 `DEEPSEEK_API_KEY`；
  - `GET /health` 返回 `{ok, provider, model, keyConfigured, tokenRequired}`，不泄露密钥；
  - 可选 `X-LunaSol-Token` 鉴权；CORS 按 `LUNASOL_ALLOWED_ORIGINS` 白名单回源，非白名单来源不发 allow-origin。
- 前端不再需要任何厂商 Key：`.env.production` 只写公开的网关地址与代理令牌，`src/engine/llm.ts` 默认 `mode: 'proxy'` 指向该网关。
- 十步向导的 AI 助手在正式站点上已实测走真实模型：状态显示「AI 已接入 · DeepSeek 后台代理」，建议来自模型且仍由用户逐条采纳。

### 2. 账号：CloudBase Auth（国内站）

- 登录：`auth.signInWithPassword({ username | email | phone, password })`，只有真正拿到 `session` 才算成功。
- 注册：`auth.signUp({ phone | email, password })` → `data.verifyOtp({ token })`，走 CloudBase 默认短信通道；用户名不支持直接注册（服务端会拒绝）。
- 验证码免密登录：`auth.signInWithOtp` → `verifyOtp`。找回密码：`resetPasswordForEmail`（需环境侧配置邮件通道）。
- 退出：`auth.signOut()`，`onAuthStateChange` 的 `SIGNED_OUT` 会清空用户态。
- 失败一律如实展示服务端 message，没有本地假登录、没有静默降级。

### 3. 云同步：CloudBase PostgreSQL + RLS

- 表 `public.lunasol_projects(id, owner_id, title, payload jsonb, updated_at)`，迁移脚本在 `cloudbase/migrations/`。
- 行主键为 `<uid>:<projectId>`：同一台设备换账号登录时不会撞上别人的行。
- RLS 策略用 `auth.uid()` 比对 `owner_id`，服务端强制隔离；跨账号读写在数据库层被拒绝（已实测第二账号看不到第一个账号的行）。
- 前端 `src/cloud/`：`auth.tsx`（会话与登录动作）、`projects.ts`（增删改查 + 写入后回读确认）、`useCloudSync.tsx`（登录合并 / 4 秒防抖自动上传 / 手动全量同步）、`LoginDialog.tsx`、`pages/account.tsx`。
- 未登录时只写本机 IndexedDB，界面明确写「未登录：项目只保存在本机浏览器」。
- 「哪个本机项目属于哪个账号」记在 localStorage `lunasol.cloud.owners.v1`，属于其他账号的项目不会被上传，卡片上标注「其他账号」。

### 4. 部署与域名限制（重要）

| 站点 | 地址 | 能力 |
| --- | --- | --- |
| GitHub Pages（公开站） | https://solyoung-ai.github.io/LuanSol/ | 全部设计能力 + DeepSeek AI + 本机保存；**登录被 CloudBase 安全域名拦截** |
| CloudBase 静态托管 | https://solyoung-d4gpp1f7s4e075f6d-1499756427.tcloudbaseapp.com/ | 全部能力 + 登录 + 云同步；默认测试域名在真实浏览器会先显示「风险提醒」页 |

原因（已实测，非推测）：

- `POST https://solyoung-d4gpp1f7s4e075f6d.api.tcloudbasegateway.com/auth/v1/signin` 的预检：
  - `Origin: https://solyoung-d4gpp1f7s4e075f6d-1499756427.tcloudbaseapp.com` → `204 + access-control-allow-origin`
  - `Origin: https://solyoung-ai.github.io` → `403`
- `tcb:CreateAuthDomain` 返回「当前套餐无法执行此操作」，体验版无法通过 API 追加 Web 安全域名。
- CloudBase 默认测试域名带「风险提醒」拦截页（标题即 `风险提醒`），官方建议绑定已备案自定义域名后使用。

因此当前构建在 GitHub Pages 上对登录做了诚实降级：`cloudOriginSupported()` 判定来源不在白名单时，登录弹窗与账户页显示原因并给出正式站点入口，绝不假装登录成功。

去掉这个限制的两条路（都需要账号侧决策）：

1. 升级 CloudBase 套餐，使其支持「Web 安全域名」，把 `solyoung-ai.github.io` 加进白名单；
2. 绑定一个已备案的自定义域名到 CloudBase 静态托管，用它作为正式站点（默认测试域名的风险提示页同时消失）。

### V3.2 验收结果

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npm test`（新增 3 组云账号 / 云同步键 / 云配置测试） | 27/27 通过 |
| 生产构建 | 无告警；主包 304 kB，CloudBase SDK 拆成按需加载的 862 kB chunk（不在首屏 preload） |
| 真实登录（localhost） | 通过，`getSession` 返回 uid 2118374985143525377 |
| 真实登录（CloudBase 正式域名） | 静态托管可访问；登录需先过测试域名提示页 |
| 项目写入 PG | 通过，写入后回读确认，`payload` 为完整项目 JSON |
| 跨账号隔离 | 通过：第二账号查询云端项目为 0，尝试写入他人行被 RLS 拒绝 |
| 跨设备恢复 | 通过：清空浏览器存储后登录同一账号，云端 1 个项目取回本机 |
| DeepSeek 真实调用 | 通过：向导 STEP 01 建议由模型生成，界面显示「AI 已接入 · DeepSeek 后台代理」 |
| 注册校验 | 通过：用户名注册被拒、密码 <8 位被拒、非法手机号返回服务端「不支持的手机号码」 |

### V3.2.3 修正与复测（2026-11-06）

| 项 | 内容 | 结果 |
| --- | --- | --- |
| 登录不可用提示 | 原来「未配置环境」与「域名不在白名单」共用一句文案，镜像域名上属错误信息 | 已拆分三种真实原因，GH Pages 实测返回「当前域名不在 CloudBase 安全域名白名单内…请到正式站点登录」 |
| 错误密码 | 隔离浏览器上下文（不影响已有会话）在正式域名尝试错误密码 | 界面原样显示服务端「用户名或密码不正确。」，未登录态保持不变，无静默成功 |
| 未登录用 AI | 同一隔离上下文进入向导点「让 AI 帮我推荐」 | HTTP 200，模型返回 3 条结构建议并自动选中「插舌式折叠纸盒」，说明 AI 不依赖登录 |
| 模型名差异 | `/health` 报配置值 `deepseek-chat`，响应体 `model` 为 `deepseek-flash` | 前者是环境变量配置，后者是上游实际服务版本，已在 docs/CLOUD.md 写明判读方式 |
| 托管同步 | CloudBase 静态托管补传 `index.html` + 新主包 | 线上 HTML 指向当前构建，chunk 200 |

---

## V3.3 订阅系统与向导拦截修复（2026-11-06）

### 本轮修复的真实缺陷

| # | 缺陷 | 现象 | 根因 | 修复 |
| --- | --- | --- | --- | --- |
| 1 | 结构参数「都选好了还是被拦」 | STEP 01 参数全填，点「下一步」仍提示「请先确认结构补充参数」 | `structureConfirmed` 是藏在角落小按钮后的手动开关，AI 推荐结构时还会把它重置为 false | 改为按真实数据判定（`structureReady()`），改结构/参数即自动确认；AI 采纳路径同步修正 |
| 2 | 结构补充参数从未进入几何 | 界面承诺「决定粘合位、插舌、盖高」，实际刀模只按三个外形尺寸算 | `buildDieline` 只接收三个尺寸，`extra` 参数在 draft→brief→engine 链路上被丢弃 | 全链路打通：`buildDieline(structure, size, bleed, safe, extra?)`，并对越界参数给出可读告警 |
| 3 | 主色「看着选了却被拦」 | STEP 06 取色器显示 `#20463a`、HEX 框有值，点「下一步」提示「请先选择主颜色」 | `ColorInput` 的 value 传的是占位默认值，草稿里 `primary_color` 仍为空 | 选风格即自动带出该风格主色（`stylePrimaryColor()`）写进草稿；未选色时取色器显示中性灰并给出提示 |
| 4 | 登录框打断向导 | STEP 07 点「生成配色方案」，登录弹窗突然盖住正在填的表单 | 闸门在未登录时直接 `requestLogin()` 弹模态框 | 改为弹付费墙（`need='login'`），由用户主动点「立即登录」；弹窗含 2 次免费体验说明 |
| 5 | 拦截提示显示成功对勾 | 「请先选择主颜色」「请至少填写品牌名称」都带 ✓ 图标 | toast 组件写死 ✓ | 新增 `toastTone()`，拦截类提示改用 ! 图标 + 暖色底 |
| 6 | 内部 ID 泄漏到界面 | 需求汇总页显示「包装盒 · 200 × 150 × 80 mm · topBottom」 | 直接输出了 `structureId` | 改用 `structureById(id).name` |
| 7 | 模型页提到不存在的开关 | 文案写「开启「AI 图像生成」会如实报错」，但页面没有这个开关 | 文案与实现脱节 | 改为如实描述：当前只有文本模型，插画步骤使用内置矢量模板并标注「非 AI 图像生成」 |
| 8 | 付费墙样式缺失 | `.sub-summary` / `.activation-box` / `.login-msg` 完全没有 CSS，三段文字挤成一行 | 样式只写在订阅页作用域内 | 提到全局样式，付费墙与订阅页共用 |
| 9 | 新注册用户第一次调用丢额度 | RPC `lunasol_consume_quota` 对无订阅行返回 -1，被当成有效计数直接返回 | -1 语义未区分 | -1 时回落到「读-改-写」兜底，自动建行并计数 |
| 10 | 新注册用户被误判为超额 | 无订阅行时 remaining 取 0 → 判定「免费体验已用完」 | 与「尚无记录」混淆 | 无行时按满额免费体验放行（`decideGate` 纯函数化并加回归测试） |

### V3.3 验收结果

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npm test` | **34/34 通过**（新增 4 组：风格→主色、toast 语气、结构中文名、AI 闸门判定） |
| 生产构建 | 通过；订阅页独立 chunk，CloudBase SDK 仍为按需加载 |
| 浏览器全路由巡检 | 18 条路由全部正常渲染，**0 页面错误**（Node 环境下 `pageerror` / `console.error` 均无） |
| 十步向导端到端走查 | STEP 01→10 全通，需求汇总页 10/10，主色 `#f7f6f2` 在取色器 / HEX / 汇总三处一致 |
| STEP 01 拦截回归 | 天地盖盒 + 盒盖高度 25 + 套合间隙 1.5 → 点「下一步」直接进入 STEP 02，无任何 toast |
| 未登录 AI 调用 | 弹「登录后即可使用 AI 建议」付费墙，登录对话框未被自动打开（`loginDialogOpen = 0`） |
| 结构补充参数几何 | 天地盖 lid 275.6→279→336 mm；插舌盒 722→720→730 mm；自立袋高 158→171 mm；飞机盒 506→536 mm；抽屉盒 264.6→317 mm；圆角标签裁切线 12→56 段 |

### 订阅系统口径（唯一权威来源：`src/cloud/plans.ts`）

- 包月 ¥399；新注册用户免费体验 2 次；会员每月 600 次统一 AI 调用配额
- 计费单元 = 单次 AI 建议调用（九步向导里某一步点一次「获取建议」= 1 次）
- 成本测算（2026-11 官方价，汇率 7.1）：GPT-4o 单次约 ¥0.096 → ¥399 理论上限 ≈ 4,162 次；DeepSeek-V3 单次约 ¥0.006 → ≈ 63,715 次
- 会员 600 次配额的模型成本：全用 GPT-4o 约 ¥58（占 14%），全用 DeepSeek-V3 约 ¥4（占 1%）
- 计量写入优先走数据库原子函数 `lunasol_consume_quota(p_uid, p_n)`（迁移 `20261106162000_lunasol_subscriptions.sql`），不可用时回落「读-改-写」
- 支付系统上线前的开通方式：激活码占位（`activatePlan`），后续替换为支付成功回调，已开通用户不受影响

### 数据表

`public.lunasol_subscriptions`（已应用迁移 `20261106162000_lunasol_subscriptions.sql`）

| 列 | 说明 |
| --- | --- |
| `id` | 主键，值为用户 uid |
| `owner_id` | 归属用户，RLS 策略 `owner_id = auth.uid()` |
| `plan` | `free` / `pro_monthly` |
| `status` | `none` / `active` / `expired` |
| `quota_total` / `quota_used` | 配额上限与已用量 |
| `period_start` / `period_end` | 会员有效期 |
| `activated_by` | 开通来源（当前为 `activation-code`） |

### 部署目标

| 目标 | 状态 |
| --- | --- |
| GitHub Pages（`solyoung-ai.github.io`） | 每次发布同步，镜像不计量 |
| CloudBase 静态托管（默认测试域名） | 每次发布同步，正式站点走计量与订阅 |
| `luna.solyoung.top` | 已通过 **GitHub Pages CNAME** 承载（`gh-pages` 分支根目录 `CNAME` 文件 = `luna.solyoung.top`，Cloudflare `luna` → `solyoung-ai.github.io`，灰云）。`https_enforced` 待 GitHub 签发证书后才可打开；如需改回 CloudBase 承载，必须二选一 |

## V3.4 变更与验收（2026-11-06）

### 向导从十步收敛为九步

| 变更 | 原因 |
| --- | --- |
| 主颜色（STEP 05）提到设计风格（STEP 06）之前 | 主色是配色锚点；先定主色，选风格时只做风格匹配，不会覆盖用户已选颜色 |
| 删除独立「条形码」步骤，并入「包装文案」（STEP 09 内） | 条码属于版面上的文字/图形元素，与文案同一决策上下文；少一步跳转 |
| 文案「十步」统一改为「九步」，`/ 10` 进度口径改为 `/ 9` | 避免文案与实际步骤数不一致 |
| `aiCapabilitySummary().steps` 改为按唯一向导步骤计数 | 条码建议任务仍保留（step 8），但不再虚增一步 |

### 同批修复

1. **「帮我整理包装文案」点了没反应**：原来选 AI 模式只是切模式，还要再点一次「生成文案建议」。现在选中 AI 模式即自动生成；且不再强制先填产品名（缺时用品类兜底）。写入改用函数式更新，避免与「切模式」的 set 互相覆盖。
2. **选风格覆盖用户已选主色**：`StepStyle.use` 改为 `p.d.primary_color || stylePrimaryColor(id)`，并在提示里说明「保留你已选的主色」。
3. **首页「开始设计」静默清空草稿**：草稿有进度时弹确认框（显示已完成 n/9），提供「继续编辑草稿 / 重新开始」，不再一键丢数据。
4. **「我的作品」→「我的工作台」**：导航菜单、工作台页标题（kicker `MY WORKSPACE / 09`）、账户页与导出页文案统一。
5. **AI 主色建议措辞**：主色步在风格之前，按钮改为「AI 推荐主色」，本地兜底提示在未选风格时如实说明「选定风格后还会按风格重新建议」。

### 验收结果

- `npx tsc --noEmit`：0 errors
- `npm test`：34/34 通过（能力点断言更新为 `total=12 / steps=9`）
- `npm run build`：通过
- 浏览器走查（`vite preview`）：进度条 01–09 顺序正确；STEP 04→05→06 标题与守卫正确；未选主色点下一步被拦截且提示为警示语气；选风格保留主色 `#20463a`；STEP 09 内同时出现「AI 文案建议」与「需要条形码吗」；点一次「帮我整理包装文案」即出现建议（未登录时如实提示付费墙，不冒充 AI）；首页确认框显示「已完成 7 / 9」；`/review` 显示 `STEP 01–09 … 7 / 9` 且无独立条码行；`/projects` 标题为「我的工作台」；控制台无报错。
