# LunaSol 交接文档 · 验证码邮件品牌化 & 账号安全改造

> 交接日期：2026-11-09
> 当前状态：**验证码邮件已品牌化并已在真实收信中生效**（服务端模板 + 邮件主题已上线；发件人显示名仍为「云开发CloudBase」）
> 本文档面向接手的 AI/开发者，只写事实、可复现命令和已验证的边界，不写推测。

---

## 0. 一句话现状

- 用户注册/登录/改密/绑定时收到的验证码邮件，正文已渲染为 LunaSol 黑金品牌模板，主题为「LunaSol 验证码」。
- 发件人仍显示 `云开发CloudBase <cloudbase_noreply@tencent.com>`，这是平台代发的固定发件地址，未改动（原因与可选方案见第 5 节）。
- 账号安全三项改造（改密 / 绑定与换绑 / 注册确认密码）已在此前提交并上线，本轮未改代码。

---

## 1. 项目基线（动手前先对齐）

| 项 | 值 |
|---|---|
| 仓库路径 | `/Users/songyang/WorkBuddy/2026-11-05-12-49-30/LuanSol`（`main` 分支） |
| 线上站点 | https://luna.solyoung.top/ （hash 路由） |
| GitHub | https://github.com/SolYoung-Ai/LuanSol |
| 当前线上代码 commit | `c78cc85`（gh-pages 部署提交 `f18cdd5`） |
| 上一轮基线 | `6ef448b` / gh-pages `b843136` |
| CloudBase 环境 ID | `solyoung-d4gpp1f7s4e075f6d`（ap-shanghai） |
| CloudBase 控制台 | `https://tcb.cloud.tencent.com/dev?envId=solyoung-d4gpp1f7s4e075f6d#/identity/login-manage`（账号 solyoung，个人版） |
| 云函数基址 | `https://solyoung-d4gpp1f7s4e075f6d-1499756427.ap-shanghai.app.tcloudbase.com/lunasol-ai` |
| 技术栈 | React + Vite + `@cloudbase/js-sdk@3.11.0` + PostgreSQL |
| 验证命令 | `npm run typecheck`、`npm test`（`node tests/run-node.mjs`，37 项）、`npm run build` |
| 部署监控 | `git fetch origin && git log origin/gh-pages -1 --oneline`（本机未装 gh CLI） |

品牌色（`src/styles.css`）：`--gold: #c8a86b`、ink `#1d1d1b`、页面浅底 `#fafaf9`、边框 `#e8e6e0`、验证码框底 `#faf7f0`、副文字 `#8a8a84`、页脚字 `#9a9a94`、卡外提示 `#b5b5ae`。

---

## 2. 已完成并上线：账号安全三项改造（commit `c78cc85`）

根因：`@cloudbase/js-sdk@3.11.0` 是 Supabase 风格新 API，旧代码假设的 `auth.updatePassword(newPassword, oldPassword)` 不存在于 `Auth` 上 → `if (!auth?.updatePassword)` 恒真 → 弹「登录服务未就绪」。

真实链路（已按此重写）：

| 能力 | 调用链 |
|---|---|
| 修改密码 | `auth.reauthenticate()` 发 REAUTHENTICATION 验证码 → `auth.updateUser({ nonce, password })`（内部 verify→sudo→setPassword） |
| 绑定邮箱/手机 | `auth.updateUser({ email \| phone })` 发码 → `auth.verifyOtp({ token, email \| phone, messageId })` |
| 注册 | 前端强制「确认密码」一致性校验 |

改动文件（均已提交）：

| 文件 | 改动 |
|---|---|
| `src/cloud/sdk.ts` | `CloudAuthApi` 按真实方法重写；新增导出 `Err`/`RawUser`/`RawSession`/`AuthEnvelope`/`VerifyResult`/`OtpCallback`/`ReauthUpdate`/`LinkVerifyCallback`；`updateUserBasicInfo` 返回 `Promise<{ error?: Err } \| null>` |
| `src/cloud/auth.tsx` | 新增 `startPasswordChange()`、`confirmPasswordChange(nonce,newPassword)`、`cancelPasswordChange()`、`cancelLink()`、`reauthPending`；`verifyLink` 按 `linkKind` 补传 email/phone 后刷新 session |
| `src/pages/security.tsx` | 三卡片重写（当前绑定 / 登录密码 / 绑定·换绑） |
| `src/cloud/LoginDialog.tsx` | 注册 tab 加「确认密码」，不一致则 `setMsg({ ok:false, text:'两次输入的密码不一致，请重新确认' })` 并 return |

已知遗留：改密/绑定流程最后一步「填验证码→确认」未由我实测闭环（浏览器接管连续超时），用户自行验证过；若后续要补验收，按第 6 节方法走。

---

## 3. 本轮主线：验证码邮件品牌化（已生效）

### 3.1 生效证据（真实收信，非预览）

2026-11-09 15:33 用线上登录入口向 `solyoungwork@gmail.com` 发了一次验证码登录码，Gmail 实收：

| 观察项 | 实际结果 |
|---|---|
| 主题 | `LunaSol 验证码` |
| 发件人 | `云开发CloudBase <cloudbase_noreply@tencent.com>`（未变） |
| 正文 | 黑金头部（`LunaSol` + 「AI 智能包装设计平台」金色副标）、「你好，/ 你正在注册或登录 LunaSol。请使用下方验证码完成验证：」、金色边框验证码框（真实验证码 `157898`）、有效期与忽略提示、页脚 `LunaSol · AI 智能包装设计平台` + `luna.solyoung.top` 金色链接、卡外灰字「本邮件由系统自动发送，请勿直接回复。」 |
| 命中的模板 | `RegisterSignIn`（注册/登录场景），文案与配置一致 |

### 3.2 服务端最终配置（`getProviders` 回读）

`providerId = email`，`ProviderType = EMAIL`：

```
EmailConfig.On            = "TRUE"            # 平台代发（我们写入的 FALSE 被服务端回置）
EmailConfig.SmtpConfig.SenderAddress = cloudbase_noreply@tencent.com   # 未改
EmailConfig.TemplateConfig.DefaultTpl   = { ZhCN, EnUS, SubjectZhCN, SubjectEnUS, SenderNameZhCN, SenderNameEnUS }
EmailConfig.TemplateConfig.RegisterSignIn = { ZhCN, EnUS, SubjectZhCN, SubjectEnUS, SenderNameZhCN, SenderNameEnUS }
provider.Homepage         = "https://luna.solyoung.top/"   # 上一轮副作用，保留
```

`DefaultTpl` 与 `RegisterSignIn` 内容基本一致，仅引导句不同（`RegisterSignIn` 为「你正在注册或登录 LunaSol…」，`DefaultTpl` 为「你正在进行「{{.Usage}}」…」）。

### 3.3 关键突破（必须知道，否则会重复之前的全部失败）

**只提交 `TemplateConfig` 时，服务端会静默丢弃整个 `EmailConfig`（返回 success + RequestId，回读仍为 `null`）。**

成功写法是**在同一次 `updateProvider` 里同时把 `EmailConfig.On` 传为 `"FALSE"`**：

- 提交 `{ EmailConfig: { On: "FALSE", TemplateConfig: {...} } }` → 模板落库成功；
- 服务端随后把 `EmailConfig.On` 回置为 `"TRUE"`，实际仍走平台代发（对线上发信无副作用，已验证）；
- 换句话说：`On:"FALSE"` 只是「允许写入模板」的开关信号，不是真的切换到自有 SMTP。

这正是此前 4 条写入路径（MCP `updateProvider`、MCP `callCloudApi(ModifyProvider)`、CLI 临时凭证直连 `ModifyProvider`、换字段名）全部失败的原因：它们都没带 `On:"FALSE"`。

### 3.4 精确调用方式（MCP）

环境：`mcp__tencent_cloudbase__manageappauth`（`action=updateProvider`）。

```
execute_defer_tool(
  toolName="mcp__tencent_cloudbase__manageappauth",
  params={
    "action": "updateProvider",
    "providerId": "email",
    "config": {
      "Homepage": "https://luna.solyoung.top/",
      "EmailConfig": {
        "On": "FALSE",
        "TemplateConfig": {
          "DefaultTpl":   { "ZhCN": "...", "EnUS": "...", "SubjectZhCN": "LunaSol 验证码", "SubjectEnUS": "Your LunaSol verification code", "SenderNameZhCN": "LunaSol", "SenderNameEnUS": "LunaSol" },
          "RegisterSignIn": { ...同上... }
        }
      }
    }
  })
```

调用要点（踩过的坑）：

1. `execute_defer_tool` 的 `toolName` 必须是**顶层参数**，写进 `params` 里会报 `Tool "" was not found`。
2. `action=updateProvider` 必须带 `providerId="email"`，否则报 `必须提供 providerId`。
3. 调用后用 `queryAppAuth(action=getProvider, providerId=email)` 回读 `EmailConfig.TemplateConfig` 确认非 null，**不要相信 success**。
4. MCP 工具定义会中途变化，报 `tool changed in the current environment` 时先 `tool_search` 取最新 schema。

可直接复用的调用体在仓库根：**`.email-config-payload.json`**（与线上现状一致，含中英双版 + 主题 + 发件人名）。

### 3.5 模板变量与限制

| 项 | 说明 |
|---|---|
| 必填变量 | `{{.VerificationCode}}` |
| 可选变量 | `{{.Usage}}`、`{{.ExpireMinutes}}`、`{{.Email}}`（Magic Link 另有 `{{.ConfirmationURL}}`） |
| 禁止 | `script`、`javascript`、`onclick`、`onload`、`iframe`、`link` 标签；CSS `expression`、CSS `url()` |
| 结构 | `EmailConfig.TemplateConfig.{RegisterSignIn\|DefaultTpl}` 为 `LocalizedTemplate{ZhCN, EnUS}`（HTML 字符串） |
| 文档 | https://docs.cloudbase.net/api-reference/manager/node/login-config |

注意：模板里的链接必须用 `<a href>`（`link` 标签被禁）。

---

## 4. 未完成事项（建议下一手按顺序处理）

| # | 事项 | 说明 / 建议 |
|---|---|---|
| 1 | 发件人显示名 | 已写入 `SenderNameZhCN/EnUS = "LunaSol"`，但 Gmail 实收仍显示「云开发CloudBase」。推测平台代发固定发件身份，`SenderName` 只在自有 SMTP 下生效。若必须改，只能配置自定义 SMTP（需自有域名邮箱授权码，控制台「自定义 SMTP」radio 当前 `disabled`），**属产品/账号权限边界，不是代码问题** |
| 2 | `DefaultTpl` 的真实命中场景 | 已验证 `RegisterSignIn`（登录）命中。改密 `REAUTHENTICATION`、绑定邮箱、找回密码走哪套模板未实测；建议用第 6 节方法各发一次对照 |
| 3 | 英文版渲染 | `EnUS` 模板已写入，Gmail 语言为中文，未触发英文版；如需验证可把浏览器语言切英文再发一次 |
| 4 | `SenderName`/`Subject` 字段是否真的被服务端使用 | `Subject` 已确认生效；`SenderName` 未生效，结论见 #1 |
| 5 | 改密/绑定「填验证码→确认」闭环 | 代码已上线且有前端拦截实测，但真实闭环未由 AI 跑完，建议补一次完整走查 |
| 6 | 仓库脏文件处理 | 见第 8 节，`.cb_api.py` / `.cb_set_email_tpl.py` 含临时凭证读取逻辑，**不要提交** |

---

## 5. 回滚方案（任一步都可单独执行）

| 目标 | 操作 |
|---|---|
| 恢复平台默认邮件 | `updateProvider` 传 `{ EmailConfig: { On: "FALSE", TemplateConfig: null } }`，回读确认 `TemplateConfig = null` |
| 只换回某语言模板 | 同上，`TemplateConfig` 里去掉该语言字段或替换 HTML |
| 撤销 `Homepage` 改动 | `updateProvider` 传 `{ Homepage: "" }`（该字段单独写入可生效，已验证） |
| SMTP 发件地址 | 当前仍是 `cloudbase_noreply@tencent.com`，无需回滚（未改动成功过） |

回滚后仍要发一次真实验证码确认邮件恢复默认样式。

---

## 6. 验证方法（复现我的验证，约 3 分钟）

1. 打开发件端：线上 https://luna.solyoung.top/#/security →「登录 / 注册」→「验证码登录」。
2. 输入接收邮箱（如 `solyoungwork@gmail.com`）→「发送验证码」。
3. 打开收件箱（浏览器已登录 Gmail：`mail.google.com/mail/u/0/`），刷新后打开最新一封。
4. 核对四项：主题是否为「LunaSol 验证码」、正文黑金头部是否存在、验证码框是否为金边 `#faf7f0` 底、页脚链接是否为 `luna.solyoung.top`。
5. 如需确认服务端配置而非邮件：`queryAppAuth(action=getProvider, providerId=email)` 看 `EmailConfig.TemplateConfig`。

本地预览（改文案时用）：`email-template-preview.html`，浏览器直接打开即可看到中英双版排版；改完同步更新 `.email-templates.json`，再用第 3.4 节调用重写线上。

---

## 7. 已确认的死路（不要重复尝试）

| 尝试 | 结果 |
|---|---|
| 只传 `EmailConfig.TemplateConfig`（不带 `On:"FALSE"`） | success + RequestId，但 `TemplateConfig` 恒为 `null`（模板被静默丢弃） |
| 只传 `SmtpConfig.SenderAddress` 等 EmailConfig 子字段 | 同样被丢弃（整个 `EmailConfig` 块失效） |
| `callCloudApi(service=tcb, action=ModifyProvider)` | CAM 权限不足：`tcb:ModifyProvider` |
| 本地 CLI 临时凭证直连 `ModifyProvider`（自写 tc3 签名） | RequestId 成功，但同样丢弃 `EmailConfig`；对照实验：同接口写 `Homepage` 可生效 → 证明是字段级拦截，不是签名问题 |
| 换字段名 `EmailTemplateConfig` / 顶层 `TemplateConfig` | 均无效 |
| 控制台「配置发件邮箱」弹窗里找模板编辑器 | 只有「实时预览」标签页，无 textarea/CodeMirror/Monaco；SMTP 两个 radio 均 `disabled`（个人版 + 平台代发） |

---

## 8. 控制台 / 浏览器自动化要点（省你一半时间）

1. 控制台页面固定宽约 1440px，自动化视口 653px 时右侧列（邮箱验证码卡片）在屏幕外，点击会落到左侧卡片上，导致「点编辑却弹出密码更新策略」。**判断依据**：`getBoundingClientRect().x > innerWidth`。
2. 卡片「更多」按钮的 DOM：`svg[aria-label=more]` 的父级为 `div[class*=dropdown]`；`element.click()` 不触发 React 菜单，需用真实点击（按 rect 计算坐标或 ref）。
3. 三个登录方式卡片（短信 / 邮箱 / 用户名密码）的 `more` 在快照中相邻排列，仅凭 ref 顺序易错配；可靠做法是先定位标题文本为「邮箱验证码」的 `div.list`，再取该容器内 `svg[aria-label=more]`。
4. 登录阻断时下一步必须调 `interaction.request_action(type="browserControl")`，不要只在文字里让用户登录。
5. `bu.hotkey("Command a")` 不支持；`bu.scroll(direction="down", amount=6)` 是正确签名；`bu.js()` 传多行箭头函数会因括号解析报 `Unexpected token ')'`，改用单行 `function(){}` 形式；覆盖输入框内容用连续三次 `bu.click(ref)` 再 `bu.type(ref, text)`。

---

## 9. 文件清单与 git 状态

工作区当前有 5 个未跟踪文件（`git status --porcelain`）：

| 文件 | 用途 | 建议 |
|---|---|---|
| `.email-config-payload.json` | **正式配置快照**：与线上一致的完整 `updateProvider` 调用体（中英双版 + 主题 + 发件人名） | 可入库（无密钥），建议提交，便于复现与回滚 |
| `.email-templates.json` | 纯模板 `{ZhCN, EnUS}`，改文案的源文件 | 可入库 |
| `email-template-preview.html` | 本地预览页（中英双版并排） | 可入库或删除 |
| `.cb_api.py` | tc3 签名直连 tcb API 的临时脚本，会读 `~/.config/.cloudbase/auth.json` 的临时凭证 | **不要提交**（`ModifyProvider` 路径已验证走不通，可删） |
| `.cb_set_email_tpl.py` | 基于上面脚本的写模板脚本 | **不要提交**（同上，可删） |

如需清理：删除 `.cb_api.py`、`.cb_set_email_tpl.py`，其余三个提交。

线上副作用（非本轮新增但需知情）：provider `Homepage` 已被改为 `https://luna.solyoung.top/`。

---

## 10. 项目约束与偏好（改动前必读）

- 不删除旧编辑器 `/studio`；不做假按钮与假数据；功能优先于好看。
- **禁止 Emoji**；图标统一使用线性 SVG（`src/components/icons.tsx`，`IconName` 含 lock/unlock/edit/alert/layers/spark/plus/minus/close/refresh/send/message/brain/chevronDown/check/search，**无 mail/phone/shield**）。
- Luna 对话页、审美市场、头像相关区域不动。
- 密码规则：新密码 ≥ 8 位；验证码校验正则 `^\d{4,8}$`（实收邮件验证码为 6 位）。
- 测试账号：邮箱注册 `solyoungwork@gmail.com`（用户名 solyoungwork）；手机 `+86 15539572717`（未绑定）。
- 邮件相关客服地址（页面文案）：`soyoung@outlook.com`。

---

## 11. 交接检查清单（下一手开工前逐项确认）

- [ ] `queryAppAuth(getProvider email)` 回读 `TemplateConfig` 仍非 null（确认线上没有被别人改回）
- [ ] 发一封真实验证码，确认主题与正文仍是 LunaSol 样式
- [ ] 决定 `SenderName` / 自定义 SMTP 是否推进（涉及账号权限，需用户拍板）
- [ ] 决定 5 个未跟踪文件的去留并提交（`.cb_api.py`、`.cb_set_email_tpl.py` 不入库）
- [ ] 补齐改密 / 绑定的真实闭环走查（`npm run typecheck` + `npm test` 37 项 + `npm run build` 需重新跑一遍并有退出码证据）
