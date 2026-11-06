# LunaSol V4 发布与验证记录

日期：2026-11-06
线上：https://luna.solyoung.top/
代码：`main` @ `45529f1`（+ 本次收尾提交）
部署：`gh-pages` @ `cbe7a36`（+ 本次收尾提交）

本文件只记**已经真实生效并验证过**的内容。计划中的功能不写在这里。

---

## 1. 已上线内容（P0 / P1 / P2 / P3）

| 板块 | 具体改动 | 验证方式 |
| --- | --- | --- |
| 安全 P0 | `activate(code)` 不再丢弃 `code`：前端一律拒绝并提示「会员开通尚未开放」；`PaywallModal` 与 `/subscribe` 的激活码表单整块移除，按钮改 disabled「即将开放」 | `npm test` 34/34；线上点订阅页无输入框 |
| 视觉系统 | `src/v4.css`：中性色 token（#FFFFFF/#F7F7F5/#171717/#737373/#A0A09A/#E9E9E6）、72px 导航、1440 最大宽、矩形收敛、勾选框/滚动条统一、`prefers-reduced-motion` | 线上截图比对 |
| 导航 | 左侧只有头像按钮 + 下拉菜单；中间「开始／工作台／审美市场」；右侧留白；创建流程全部计入「开始」区域高亮 | 线上点开菜单逐项核对 |
| 首页 | 只保留字标 + `AI PACKAGING DESIGN STUDIO` + 「开始设计」；删除掉落工牌、九步清单、技术参数、GPT-4o 文案；保留「已有草稿二次确认」 | 线上首屏截图 |
| 工作台 | 四个状态筛选（带计数）、搜索、三种排序、真实设计稿封面（无稿统一占位）、续编/方案/3D/导出/复制/重命名/删除+确认、「未登录·本机保存」与「已登录·已同步 N」如实区分 | 线上空状态截图；有稿需真实项目验证 |
| 审美市场 | `/market`、`/market/site/:id`、`/market/work/:id`；16 个实测可访问的海外/国内设计站 + 34 条 BP&O 当期真实案例；分类筛选、搜索、收藏（localStorage）、「用这个方向开始设计」（映射到内置风格库） | 线上列表截图；`.v4-site-desc` 三行截断 |
| 旧灵感库 | `/inspiration` 指向审美市场，不再暴露 12 个虚构品牌 | 路由核对 |
| 文案一致性 | 全站删除「GPT-4o + DeepSeek-V3」；会员说明只说 DeepSeek | grep 核对 |

---

## 2. 发布过程中修掉的 3 个真实缺陷

| 缺陷 | 现象 | 根因 | 修法 |
| --- | --- | --- | --- |
| 头像菜单不可见 | 线上点头像只有一条约 10px 高的白条 | 菜单是 `.v4-nav` 的子元素，而导航用了 `backdrop-filter`，形成 backdrop root 后把内层绝对定位子元素裁到导航高度（元素 `getBoundingClientRect` 仍是 236×290，但只画出来一条） | 导航改纯白实底，去掉 `backdrop-filter`（视觉上也更克制），并在 CSS 里写明原因 |
| 进入工作台停在中段 | 标题被导航遮住 | 懒加载页面在 `useEffect` 之后才挂载，单次 `scrollTo` 被后续布局撑高/滚动锚定带偏 | 路由 effect 里 `scrollTo` + 32ms 后补一次 |
| 勾选框与版面冲突 | 向导第一步右侧是系统黑色实心勾选框 | 未覆盖 UA 默认样式 | v4.css 统一 16px 细线方框、选中实心 + 白勾 |

---

## 3. 验证证据

| 项 | 结果 |
| --- | --- |
| `npm test` | 34/34 通过 |
| `npx tsc --noEmit` | 无错误 |
| `npm run build` | 成功，首屏 `index` 98.07kB / gzip 42.78kB；`market` 41.49kB；`vendor-three` 468.76kB 独立分包；`jspdf`/`jszip`/`vendor-cloudbase` 延迟加载 |
| 线上 asset | `assets/index-Bm56VRTh.js` → 后续 `index-CSswRRNz.css` 等随版本更新，可 `curl https://luna.solyoung.top/` 复核 |
| 线上页面 | 首页、头像菜单、工作台空状态、审美市场列表、九步向导第一步均已在真实浏览器截图核对 |
| Pages 构建 | `cbe7a36` → `built` |

---

## 4. 发版流程（必须照做）

```bash
# 1) 构建（注意：vite build 会清空 dist，CNAME 一定会丢）
npm run build

# 2) 部署工作树
git worktree add -B deploy-v4 /tmp/lunasol-ghp origin/gh-pages   # 已存在则 git fetch origin gh-pages 后 reset
cd /tmp/lunasol-ghp && git rm -rf . -q
cp -R <repo>/dist/. .
printf 'luna.solyoung.top\n' > CNAME
touch .nojekyll
git add -A && git commit -m "deploy: ..." && git push origin HEAD:gh-pages
```

**坑 1：Pages 构建会偶发 `errored`（`Page build failed.`）**
本次连续两次失败（一次卡 `building` 6 分钟、一次直接 errored），第三次重试后 `built`。遇到时先看
`GET /repos/SolYoung-Ai/LuanSol/pages/builds/latest`，确认 `commit` 是不是你自己推的那条；是的话直接
`POST /pages/builds` 重试，不要急着回滚内容——内容本身（28 个文件 / 2.8MB / 无符号链接 / 无异常文件名）是合法的。

**坑 2：git 直连通道要 `http.version=HTTP/1.1`**（仓库 config 已固化）。

---

## 5. 尚未完成（P4–P7，按规格书顺序）

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P4 | 九步向导逐项复核：每步必填校验、返回不丢数据、完成态、AI 建议不覆盖已确认内容、预览与草稿一致性 | **未开始**（页面可打开、第一步可交互，其余步需真实走查） |
| P5 | 编辑器 / 3D / 印前 / PDF·SVG·DXF·PNG·ZIP 复核 | **未开始** |
| P6 | AI 服务端鉴权与额度：云函数校验登录态、原子扣减、频率/日预算/输入长度/输出 token、全局紧急开关 | **未开始**（当前仍是静态令牌，可被从公开 JS 提取） |
| P7 | 真实功能测试报告与部署说明（本文件是其中一部分） | 部分 |

已知遗留问题（与 `docs/AUDIT_V4.md` 一致）：
- 云函数只认静态令牌，不认登录态与额度 → 任何人拿到令牌即可直连白嫖；前端额度只在前端拦。
- 旧四步流程（`/create` `/brief` `/schemes` `/editor`）代码仍在，仅收口导航。
- `src/data.ts` 的 12 条虚构 `INSPIRATIONS` 数据文件未删（路由已不再暴露）。
- 工作台「我的收藏」目前只是标签，没有真实过滤逻辑。

---

## 6. 第二轮：品牌体验重塑（导航位置 / 语言 / 深浅色 / 品牌加载 / 会员价值 / 移动端）

本轮不改产品结构，只做「体验层」的四件事，全部落在现有代码上，没有新增假能力。

### 6.1 导航：登录/个人入口移到右上角，旁边加语言与深浅色

- 顶栏三段：左 `LunaSol` 字标（点回首页）、中三个主入口、右上三件套（语言 / 深浅色 / 头像）。
- 语言按钮显示「点了会变成什么」：中文态显示 `EN`，英文态显示 `中`；深浅色按钮月牙/太阳内联 SVG。
- 头像仍在最右，菜单改为 `right: 0` 向右对齐展开——原来 `left: 0` 在右上角会被视口右侧裁掉。
- 语言与主题各自持久化：`localStorage['lunasol.lang']`、`localStorage['lunasol.theme']`；
  `main.tsx` 在 React 挂载之前先 `applyTheme(readTheme())`，避免「先闪白再变深色」。
- 语言只切平台自己的界面文案（`t('中文','English')` 就地写），**审美市场的站点名/作品名/说明保持原文**，
  理由是不破坏可溯源性与作者原意。

### 6.2 品牌加载态：字标即进度条

- `src/components/LunaLoader.tsx`：`LunaSol` 逐字用 `background-clip: text` + 每字独立 `--f` 填充比例，
  橙色从左到右推进（`easeOutCubic` 1150ms），填到 `S/o/l`（索引 4 起）时逐字 `luna-jump` 轻跳，`animationDelay` 90ms 递增。
- 颜色只用 `--v4-orange`（浅 `#d9602c` / 深 `#e0763f`），**不进 UI 主色**，避免整站发橙。
- 尊重 `prefers-reduced-motion`（直接置 1、不跳）。
- 注释里写明：这是「等待节奏」，不对外宣称真实加载百分比；AI 调用 / 导出的真实进度仍用各自真实状态。
- `App.tsx` 的 `PageFallback` 由 `spinner + 页面加载中…` 换成 `<LunaLoader />`。

### 6.3 会员页：删掉「调用成本测算表」，换成 600 次的价值解释

- 删除 `buildPlanCalc()` / `planSummaryText()` 在订阅页的引用（成本、理论上限、毛利口径不再面向用户）。
- 新增价值区：`¥0.67`（= 399 ÷ 600 = 0.665，按分四舍五入）、`600 次/月`、`20 次/天`（600 ÷ 30），
  30 格刻度每格 = 一天，并写明推导：`¥399 ÷ 600 次 = 0.665 → ¥0.67`（不四舍五入夸低价格）。
- 四条计次规则（均可对照 `subscription.tsx` 实现）：
  1. 一次 = 一次真实模型调用，成功返回才计次（`reportAIUsage` 只在 `provider.ts` 校验通过后调用）；
  2. 不按秒、不看输入长短；
  3. 设计引擎 / 编辑 / 3D / 印前 / 导出不计次（本地确定性计算）；
  4. 每个计费周期开始时额度重置为 600，不结转（`activatePlan` 写 `quota_used: 0`）。
- 价格只从 `plans.ts` 的 `PRICING` 读；页内不出现推理成本、毛利、token 单价。

### 6.4 移动端

- 断点 900 / 720 / 560 / 384：导航 72px→64px、字标 15→14→13px、工具按钮 36→32px；
  ≤560px 英文长标签换短标签（`Start / Work / Index`），≤384px 让出字标位并同步改成两列网格（否则三入口与工具区会重叠）。
- `html,body { overflow-x: hidden }`、`img,svg,video,canvas { max-width: 100% }`；
  会员三数字、工作台与市场网格在窄屏变单列。

### 6.5 深色模式修到的真实缺陷（第一版是坏的）

| 现象 | 根因 | 修法 |
| --- | --- | --- |
| 深色下顶栏仍是白条、导航字几乎看不见 | `.v4-nav` 背景写死 `#fff` | 改 `var(--v4-paper)` |
| 主按钮「浅底白字」看不见 | 用 `var(--v4-ink)` 当底色、`#fff` 当字色，深色下 ink 反转成浅色 | 新增 `--v4-solid-bg/--v4-solid-fg`（深色下整体反转） |
| 会员页提示条、市场按钮、工作台按钮同色不可读 | `.notice-*`、`.v4-btn-line`、`.v4-btn-dark` 同样是硬编码浅底 | 全部改语义 token，另给 notice 单独一档深色 |
| 勾选框选中态看不清 | 勾线 1.5px 太细 | 改 2px、5×9px |
| `.design-view` / `.editor-canvas` 变黑 | 深色覆盖误伤印品画布 | 强制 `#fff`（那是设计稿的纸，不是界面） |

### 6.6 本轮验证证据（不是「打开看看能显示」）

- `npx tsc --noEmit` 通过；`npm test` 34/34 通过；`npm run build` 成功（2.3s）。
- 视觉：`vite preview` + browser_use 截图（浅色首页 / 深色首页 / 深色英文菜单 / 深色向导 / 深色市场 / 会员页桌面与手机）。
- 加载态：真实导航时截到 fallback 帧（`L` 起手填橙、其余灰），另用同 class 注入冻结帧确认填充方向与 S 字跳动。
- 手机端：headless Chrome 经 CDP 设 **CDP 真实 390×844 / 360×844** 视口（桌面窗口最小 500px，只能用 CDP 覆盖），
  逐页 `scrollWidth === innerWidth`（home 390/390、wizard 390/390、subscribe 390/390、market 390/390、workspace 390/390；360 同）——
  即无横向溢出、无裁切；会员页 30 格刻度实测 30 个，窄屏为单列。
- 会员页数字：`UNIT_PRICE = 399/600 = 0.665 → ¥0.67`、`PER_DAY = 20`、刻度 30，均与 `plans.ts` 一致。

## 7. 第三轮：登录接入勘察 + 微信入口下线 + 深色实底控件

### 7.1 结论先说：登录不需要证书，也不需要迁托管

- SSL 证书只解决「HTTPS 能不能访问」，和「能不能登录」无关。登录能力来自 CloudBase 身份认证 + 浏览器安全域名白名单。
- 实测证据（线上 `luna.solyoung.top`，真实请求，不是推断）：
  - 打开登录弹窗，用不存在的账号提交，返回 **「用户名或密码不正确。」** —— 说明 SDK 初始化、跨域白名单、身份服务都通了，请求真到了服务端（否则应是 CORS / 网络错误）。
  - `queryAppAuth(getLoginConfig)`：`usernamePassword=true`、`email=true`、`phone=true`、`anonymous=false`。
  - `queryEnv(domains)`：`luna.solyoung.top`（2026-11-06 12:35:08）、`luna.solyoung.com`、默认 `*.tcloudbaseapp.com` 均 `ENABLE`。
  - PG 表 `lunasol_projects` / `lunasol_subscriptions` 已存在，且有 4 条 RLS 策略（`owner_id = auth.uid()` 覆盖 select/insert/update/delete）；库里已有真实项目行，owner 是已登录 uid。
- 没有 `localhost` / `127.0.0.1` 条目：本地 `:4173` 走真实登录会被拦，验证要在正式域名上做。

### 7.2 微信登录入口先下线

- 环境 provider 列表只有 `email` 与 `custom`，**没有微信** → 原先的「💬 微信安全登录」按钮点了必然失败（等于假按钮）。
- 处理：`LoginDialog` 移除该按钮与说明，只留密码登录 / 注册 / 验证码三条真实路径；`auth.signInWithWechat` 保留在代码里，等控制台开通后一行恢复。

### 7.3 深色下的「实底 + 白字」控件

- 根因同 6.5：`.seg button.active`、`.btn-dark`、`.chip.active`、`.step.current .step-num`、`.toast`、
  `.face-tabs button.active`、`.mini-msg.user`、`.chat-msg.user .chat-text`、`.chat-avatar` 都是 `background: var(--ink)` + `#fff`。
  深色下 `--ink` 变浅 → 白字压浅底，登录弹窗的分段标签首当其冲（截图为证）。
- 修法：上述选择器在 `[data-theme="dark"]` 下统一走 `--v4-solid-bg / --v4-solid-fg`；
  `styles.css` 里的 `.seg button.active`、`.switch.on`、`.tag-dark` 直接把底色换成带 fallback 的语义令牌
  （`var(--v4-solid-bg, var(--ink))`），浅色主题行为不变。

### 7.4 CloudBase 静态托管：已部署，但域名被备案卡住

- 已做：把最新 `dist` 通过 `manageApps` 云端链路上传（`getUploadUrl` → PUT zip → `deployApp`，`buildPath=dist`、`installCmd/buildCmd` 置空），
  版本 `solyoung-003`（`index-VKEL4EXs.js`）、`solyoung-004`（`index-CB1bp61G.js`），两次构建均 `SUCCESS`；
  `webapps.tcloudbase.com` 与默认 `*.tcloudbaseapp.com` 两个域名都实测返回同一份产物。
- 受阻：`manageGateway(bindCustomDomain, domain=luna.solyoung.top)` 返回
  **「[CreateHTTPServiceRoute] 域名未备案；如果域名已经完成备案，由于腾讯云与工信部数据需要同步，请在1小时后重试。」**
  → 国内站自定义域名必须 ICP 备案，这不是证书或权限问题，补证书也绕不过去。
- 另一个细节：`manageHosting(bindDomain)` 直接拒绝——该环境已开 HTTP 访问服务，自定义域名必须走网关（`manageGateway`），不是 COS 静态托管的绑定接口。
- DNS 现状：`luna.solyoung.top` 的 A 记录指向 Cloudflare（172.67.146.103 / 104.21.41.95），源站是 GitHub Pages。也就是说现在的链路是
  `Cloudflare → GitHub Pages`，不是 CloudBase。绑定成功后需要把 Cloudflare 的解析改到 CloudBase 提供的 CNAME，这一步只能在 DNS 侧做。

### 7.5 用户体系容量（顺手发现）

- `managePermissions(createUser)` 失败：**「超过配额限制。授权用户数超过套餐配额上限」**（个人版，当前 4 个用户）。
- 其中 2 个是早前 QA 留的 `lunasol_smoke_01/02`（internalUser，各存过 1 条测试项目），1 个真实手机号账号，1 个内置 administrator。
- 含义：个人版的用户数配额已经被 QA 账号占掉两个；真要给别人开账号会先撞配额。建议清掉 smoke 账号（需用户确认，涉及删用户）。

### 7.6 本轮部署记录

| 项 | 值 |
| --- | --- |
| main | `858a4f8`（微信入口下线）→ `7344c8b`（深色实底控件） |
| gh-pages | `61a43c3` → `7c4ad27`，Pages `built` |
| 线上产物 | `assets/index-CB1bp61G.js`（浏览器实测已加载） |
| CloudBase 托管 | `solyoung-004` / buildId `2611226153` / `SUCCESS` |
