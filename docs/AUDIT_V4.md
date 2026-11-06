# LunaSol V4 功能审计（动手前的真实体检）

审计时间：2026-11-06
审计方式：读当前代码 + 跑现有测试 + 对线上环境发真实请求。
**不使用交接文档的结论作为证据**——交接文档里至少有两处已经过时，下面会标出来。

---

## 0. 线上环境实测记录（证据）

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 站点可访问 | `curl -I https://luna.solyoung.top/` | 200，0.83s；响应头 `x-github-request-id` → **实际由 GitHub Pages 提供服务**，Cloudflare 在前 |
| 线上版本 | 抓首页 asset 名 | `assets/index-Bx3wM2x1.js`，与本地 `vite build` 产物同名 → 线上=本地 |
| AI 代理健康 | `GET {proxy}/health` | `{"ok":true,"provider":"deepseek","model":"deepseek-chat","keyConfigured":true}` |
| DeepSeek 真实调用 | `POST {proxy}/chat/completions` + 令牌 | **200**，模型回 `deepseek-flash`，1.47s，10 tokens → **AI 是真能用的** |
| 图像生成 | `POST /images/generations` | 501（明确拒绝），符合"DeepSeek 无图像能力"的设计 |
| CORS 白名单 | `OPTIONS` + Origin 头 | `luna.solyoung.top` 放行 **且** `solyoung-ai.github.io` 也放行 → **交接文档 6.5 说"只有 luna 放行"已过时** |
| 单元测试 | `npm test` | 34/34 通过 |
| 类型检查 | `tsc --noEmit` | 无错误 |
| 构建 | `vite build` | 成功，首屏 `index` 103KB / gzip 44KB |
| 构建副作用 | 构建后查 `dist/CNAME` | **被清空**——vite 清空 dist，CNAME 丢失，直接推 gh-pages 会掉域名 |
| Pages 配置 | GitHub API | branch `gh-pages` path `/`，cname 正确，`https_enforced=false`，status `built` |

---

## 1. 功能状态表

状态口径：**可用** = 真实逻辑且实测可用；**可用·有缺陷** = 逻辑真实但有明确问题；**仅界面** = 点了没有真实效果；**依赖未配置** = 代码在但环境不具备；**废弃入口** = 功能已被取代但入口还在。

### 1.1 账号与权限

| 功能 | 页面/文件 | 状态 | 实际问题 | 原因 | 修改方案 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| 密码登录 | `cloud/auth.tsx` `signInWithPassword` | 可用（未端到端验证） | 代码完整、错误如实透出；但**没有测试账号，线上未走通真实登录** | 只有代码证据 | 交给你用真实账号点一次，即成验收 | P0（阻塞收费） |
| 手机/邮箱验证码登录 | `startCodeLogin` / `verifyCode` | 可用·依赖环境 | 依赖 CloudBase 短信通道与邮件通道配置 | 环境侧配置 | 短信默认可用；邮件需环境配置 | P2 |
| 注册 | `startSignup` | 可用·依赖环境 | 同上，用户名不能注册（只支持 phone/email） | 设计如此 | 保持 | P2 |
| 微信登录 | `signInWithWechat` | 依赖未配置 | 需控制台启用微信网页授权；未启用时如实报错 | 未开通 | 上线前确认，否则明确标"暂未开放" | P2 |
| 退出登录 | `signOut` | 可用 | — | — | — | — |
| **激活码开通会员** | `cloud/subscription.tsx:249` | **坏（P0）** | `activate(code)` **没有使用 code**，任何登录用户输入任意字符串都拿到 600 次/月 | 占位实现遗留 | ①移除对外入口 ②服务端校验后才发放 | **P0** |
| 额度闸门 | `decideGate` + `SubscriptionProvider` | 可用 | 逻辑正确（未登录/额度尽/过期三种拦截） | — | — | — |
| 服务端额度校验 | `cloudfunctions/lunasol-ai` | **缺失** | 云函数只校验静态令牌，不解析登录态、不查额度 | 未实现 | 见 1.6 | **P0** |

### 1.2 AI 能力

| 功能 | 位置 | 状态 | 实际问题 | 原因 | 修改方案 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| DeepSeek 文本调用 | `engine/llm.ts` → 云函数 | **可用（已实测 200）** | 无 | — | 保持 | — |
| 结构化 JSON + 校验 + 回退 | `ai/provider.ts` `runAITask` | 可用 | 失败/违规一律回退本地并如实标注，不冒充 AI | — | 保持 | — |
| 图像生成 | `llmImage` | 依赖未配置 | 云函数返回 501，前端如实报错并禁用按钮 | DeepSeek 无图像能力 | 保持"诚实不可用"，不接假图 | — |
| 代理令牌保护 | `.env.production` → 打包 JS | **可被提取（P1）** | 令牌与网关地址在公开 JS 里，任何人可直连白嫖；CORS 不是认证 | 架构选择 | 前端不再直连；云函数校验登录态 + 服务端额度 | **P1** |
| 前端额度可绕过 | `ai/gate.ts` | 可用·有缺陷 | 只在前端拦，绕过前端即无限用 | 同上 | 同上 | P1 |
| 模型切换（GPT 预留） | `ai/provider.ts` `registerAITransport` | 可用（接口层） | 有统一 task 协议与 transport 钩子；但 UI 里没有任何"选 GPT"的假按钮（这是对的） | — | 保持；补 Provider 抽象文档 | P2 |
| 文案错误 | `pages/home.tsx` / `flow.tsx` / `PaywallModal` | 坏（信息错误） | 多处写「GPT-4o 与 DeepSeek-V3 平台模型」，与实际（仅 DeepSeek）不符 | 旧文案 | 全站改为只说 DeepSeek | **P1** |

### 1.3 创作流程

| 功能 | 位置 | 状态 | 实际问题 | 原因 | 修改方案 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| 九步向导 | `v3/Wizard.tsx` + `stepBodies.tsx` | 可用 | 单步聚焦、守卫、跳过、返回不丢数据、快照 | — | 保留 | — |
| 数据持久化 | `store.tsx` + `v3/draft.ts` | 可用 | IndexedDB 单键存整包，350ms 防抖；`normalizeDraft` 兜底旧数据 | — | 保留 | — |
| 需求汇总 | `v3/Review.tsx` | 可用 | 可回跳到任一原始步骤；生成前校验尺寸/结构/风格 | — | 保留 | — |
| 三套方案生成 | `engine/design.ts` `buildSchemes` | 可用 | 真矢量、逐图层、可编辑；三个方向确有差异 | — | 保留 | — |
| **旧四步流程并存** | `/create` `/brief` `/schemes` `/editor` | **可用但与九步重复** | 两套流程数据模型不同（brief vs draft），入口交叉，用户会迷路 | 历史叠加 | 保留代码不删，导航只指向九步；旧入口不再暴露 | **P1** |
| 实时预览 | `v3/Preview.tsx` | 可用·是示意图 | 明确标注"占位预览"，不是设计稿渲染 | 设计如此（诚实） | 改为直接渲染真实 DesignDoc 缩略 | P2 |

### 1.4 编辑器 / 3D / 印前 / 导出

| 功能 | 位置 | 状态 | 验证点 | 优先级 |
| --- | --- | --- | --- | --- |
| 图层编辑（文字/形状/图片） | `pages/flow.tsx` Editor | 可用 | 字体字号字重对齐颜色、xywh、旋转、透明度、锁定、隐藏、层级、删除 | — |
| 撤销 / 重做 | 同上 `hist` | 可用 | 栈 40 步，切换 design 时重置 | — |
| 历史版本 | `store.tsx` `addVersion/restoreVersion` | 可用 | 每项目上限 20~30 条，可恢复 | — |
| 对话式修改 | `engine/modify.ts` AI 补丁 / `localIntent` | 可用 | 锁定元素不被改动；无 AI 时如实说"内置规则" | — |
| 上传图片 | Editor `uploadImage` | 可用 | 计算 naturalW/H 供 DPI 检查 | — |
| 3D 预览 | `components/Viewer3D.tsx` | 可用 | three.js 真实结构 + 分面贴图 + 开合 + 材质 + 背景 + 截图；无 three 时降级 2D 并标注 | — |
| 印前检查 | `engine/prepress.ts` | 可用 | 尺寸/出血/安全区/DPI/字体/占位文字/CMYK 参考；自动修复 | — |
| PDF 导出 | `engine/export.ts` `buildPdf` + `verifyPdf` | 可用 | 毫米页面、3mm 出血、逐图层、字节级预检；**不提供 PDF/X-4**（诚实） | — |
| SVG / DXF / PNG / JPG / ZIP | 同上 | 可用 | DXF 直写 CUT/CREASE；ZIP 内含 PDF/SVG/DXF/效果图 | — |

### 1.5 内容与信息架构

| 功能 | 位置 | 状态 | 实际问题 | 修改方案 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| **灵感库** | `/inspiration` + `data.ts` | **假内容（P1）** | 12 个品牌（山隐茶集/屿光咖啡…）全是代码编出来的虚构项目，无出处、无外链，却以"灵感库"呈现 | 由真实可溯源的「审美市场」替代；旧路由保留但不进导航 | **P1** |
| 结构库 | `/structures` | 可用 | 真实几何展开（插舌/天地盖/抽屉/自立袋/矩形圆标） | 保留，移出顶层导航 | — |
| 工作台 | `/projects` | 可用·有缺陷 | 有网格/状态/复制/删除确认/云同步；**无搜索、无筛选、无排序**；无设计稿时封面只是一个 "LunaSol" 文字块 | 重建为作品集式工作台 | **P1** |
| 账号页 / 设置页 / 订阅页 | `/account` `/settings` `/subscribe` | 可用 | 订阅页暴露激活码入口（同 P0） | 收进头像菜单；订阅页改"即将开放" | P1 |

### 1.6 部署与工程

| 项 | 状态 | 问题 | 方案 |
| --- | --- | --- | --- |
| GitHub Pages | 可用 | 推 `gh-pages` 生效 | — |
| **CNAME** | **易丢失** | `vite build` 清空 dist，CNAME 消失（本次实测） | 构建后必须重写；根治办法是把 CNAME 放进 `public/` |
| `.nojekyll` | gh-pages 根已有 | 不要动 | — |
| CI 自动部署 | **未启用** | 远端无 workflow，`.gitignore` 曾忽略 | 维持手动发版 |
| HTTPS 强制 | 未开启 | `https_enforced=false`，之前 API 拒过一次 | 证书已在，可再试 |
| git 通道 | **半可用** | 直连 github.com 的 git 端点在 25s 无响应（0 字节）；HTTP/1.1 正常 | 仓库已固化 `http.version=HTTP/1.1` |
| 首屏性能 | 良好 | 路由级分包，three/jsPDF/JSZip/CloudBase 全部延迟加载 | 保持，不要为了方便合并 chunk |

---

## 2. 执行顺序（本次采用）

1. **P0 安全**：先关掉激活码后门（它对外的伤害最大，且改动最小）。
2. **P1 视觉与导航**：设计 token + 顶部导航（头像在左、三个主入口居中）+ 首页（只留 Logo 与「开始设计」）。
3. **P1 工作台**：筛选/搜索/排序/真实封面/操作齐全。
4. **P1 审美市场**：真实可溯源数据 + 分类 + 站点详情 + 作品详情 + 收藏 + 带入创作。
5. **P1 文案与一致性**：清掉"GPT-4o/DeepSeek-V3"等错误表述，旧入口收口。
6. 构建、测试、发版、线上核对。

## 3. 本次不做（避免破坏已正常工作的模块）

- 不重写结构引擎、刀模几何、PDF/DXF 生成。
- 不重写云同步与 IndexedDB 存储层。
- 不改 hash 路由与 `base: './'`。
- 不接支付、不造假支付状态。
- 不为"看起来完整"而给未实现能力加假按钮。
