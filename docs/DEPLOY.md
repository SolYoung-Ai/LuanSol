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
