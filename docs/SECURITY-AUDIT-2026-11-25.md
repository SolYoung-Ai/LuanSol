# LunaSol 安全审计（2026-11-25）

审计范围：仓库 `SolYoung-Ai/LuanSol`（public）· 全量 git 历史（539 提交 / 9149 个 blob）· 构建产物 · 云函数 `lunasol-ai`（1783 行）· CloudBase PG 库 `solyoung-d4gpp1f7s4e075f6d`（16 张表 + 11 个 RPC）· GitHub 仓库配置。

一句话结论：**没有任何密钥泄漏**（这是最容易出事的一项，是干净的）；但有 **4 个能被用来白拿积分/免费生图的漏洞**，其中 1 个是「完全绕过付费墙」，必须尽快修。

---

## 一、密钥与仓库泄漏：干净

| 检查项 | 结果 |
|---|---|
| 全历史 blob 扫描（`sk-`/`ARK_API_KEY=`/`CREEM_*`/`SEEDREAM_*`/`BAI_API_KEY=`/私钥/`postgresql://user:pass@`） | 0 命中 |
| 历史中出现过的敏感路径（`.env`/dump/backup/pem/auth.json） | 只有 `.env.example`、`.env.production`（均为公开值） |
| 硬编码口令 | 0（命中的 213 处都是 `autocomplete="current-password"`） |
| 构建产物 `dist/assets/*.js` 中的厂商密钥 | 0 |
| `.env.production`（public 仓库可见）内容 | envId / region / Publishable Key / AI 代理地址 / `VITE_LUNASOL_AI_TOKEN` —— 全部是前端必带的公开值，**不是**密钥 |
| 本地运维脚本 `.cb_api.py` | 从未提交（`.gitignore` 已覆盖） |
| GitHub secret scanning / push protection | 均 **已开启**，历史告警 0 |
| GitHub Actions secrets | 未配置任何自定义 secret（只用 `GITHUB_TOKEN`） |
| 组织下其他 public 仓库 | 只发现 `.env.example`，无真实密钥 |

唯一需要知道的事实：`VITE_LUNASOL_AI_TOKEN`（`a2ffd2…`）和 CloudBase **Publishable(anon) Key** 是公开的——设计如此。它们**不能**被当作安全边界，防滥用只能靠服务端校验（见 P1）。

---

## 二、P0：能被用来白拿积分 / 免费生图（必须修）

### P0-1 `/ai/image` 服务端完全不扣积分 → 付费墙可绕过

- 位置：`cloudfunctions/lunasol-ai/index.js` `handleImage`（约 1009–1200 行）
- 事实：整个函数只做「档位校验 → 内容审核 → 调上游出图」，**没有任何 `chargeJob` 调用**；代码注释写着「前端按档位扣积分」。工作室的 `/ai/studio/image`、`/ai/studio/layer-split` 是服务端扣费的，唯独这条最常用的生图路由不是。
- 影响：
  1. 任何人拿公开的 Publishable Key 注册一个账号（免费），或直接带自己的 access token，POST 这个接口即可**无限免费出图**（6–46 分/张的成本由站长承担）；
  2. **余额为 0 也能出图**——前端那道 `decideGate` 只是 UI，绕过它没有任何服务端代价；
  3. 单 IP 30 次/分钟 + 全站 2000 次/日的兜底只能减缓，不能阻止；攻击者还能用这 2000 次把当日额度烧完，影响正常用户。
- 修法（需要改云函数 + 前端，建议单独一次迭代，见文末「补丁 A」）。

### P0-2 订阅表可被用户自己写入任意积分

- 位置：`lunasol_subscriptions` 的 RLS 策略 `lunasol_subscriptions_insert_owner`
- 事实：`WITH CHECK` 只有 `owner_id = auth.uid()`，**不校验任何金额字段**；同时 `lunasol_subscriptions_delete_owner` 允许用户删自己的行。
- 利用：
  1. `insert into lunasol_subscriptions (id, owner_id, bonus_credits) values (uid, uid, 999999)` → 直接白拿 999999 积分；
  2. 或 `delete` 再 `insert` 默认行 → 把已花掉的 100 分新手额度清零，无限循环。
- 影响：积分是本项目唯一收入来源，这条等于**把账本交给用户自己写**。
- 修法：见 `cloudbase/migrations/20261125020000_harden_credits.sql`（收紧 insert 白名单 + 删掉 delete 策略）。

### P0-3 退款接口对用户开放 → 生成成功后可自己退款

- 位置：`public.lunasol_ai_job_refund(p_job, p_reason)`，`EXECUTE` 授予了 `anon` 与 `authenticated`
- 事实：函数内部只判断「任务状态是不是 charged」，是就退积分并把任务置为 refunded；**无法区分是模型失败还是用户成功拿到图**。
- 利用：调 `/ai/studio/image` 出图（扣 6–46 分）→ 拿到图 → 直接 RPC `lunasol_ai_job_refund` → 积分全额退回，图留着。可重复，直到日限。
- 修法：见「补丁 B」（退款必须带只有云函数知道的 secret）。

### P0-4 计费幂等键可被预占 → 高价图低价买

- 位置：`lunasol_ai_job_charge` 的 replay 分支 + `body.jobId` 由客户端传入
- 利用：先直接 RPC `lunasol_ai_job_charge(p_job='X', p_cost=1)` 占号（只扣 1 分），再拿 `jobId='X'` 请求 `/ai/studio/image`；服务端 charge 命中 replay 分支直接放行 → 24 分的图花 1 分。
- 修法：已写进 `20261125020000_harden_credits.sql`——replay 时必须校验 `v_stored = v_cost`，不一致返回 `job_cost_mismatch`。

---

## 三、P1：滥用面（不直接刷积分，但能烧成本）

1. **免费对话的「每人每天 200 轮」可绕过**：`guard()` 用请求头 `x-cloudbase-uid` 计数，这个头客户端可随便改（改一次就换一个桶）。真实兜底只剩单 IP 30 次/分钟 + 全站 2000 次/日。建议改成从 `x-cloudbase-token`（JWT）解析 sub，或干脆去掉这个头、只用 token。
2. **限流计数在云函数进程内存里**：多实例 / 冷启动会重置，只能算近似值。真要控成本，得落到 DB（`lunasol_chat_spend` 已经在按天记账，可以直接拿它做闸门）。
3. **素材接口无限量写入**：`lunasol_asset_put` 是 security definer 且对 `authenticated` 开放，**没有字节上限、没有 MIME 白名单以外的校验**。用户可以直接把任意大的 base64 塞进 `lunasol_assets`（项目表已经 30MB 了）。建议加 `p_bytes <= 8MB` 与 `data_url like 'data:image/%'` 的硬校验。
4. **`lunasol_credit_logs` 允许用户自己 insert**：不影响余额，但账本可被写入假记录（而且现在 RPC 与前端各写一条，本身就有重复）。建议只保留 RPC 写入；前端那两处 `insert` 改为失败即忽略（已经是 try/catch）。

---

## 四、P2：配置与卫生（不紧急）

1. **main 无分支保护**（仓库只有一个协作者 `SolYoung-Ai`，风险低）。建议开：禁止 force push、要求 CI 通过。
2. **Actions 允许全部来源**（`allowed_actions: all`），`peaceiris/actions-gh-pages@v4` 未锁 SHA。建议把第三方 action 锁到 commit SHA（防供应链投毒）。
3. **dependabot security updates 关闭**；当前 `npm audit --omit=dev` 为 **0 漏洞**，但仍建议打开自动升级。
4. **没有 CSP / X-Frame-Options / Referrer-Policy**：GitHub Pages 不能设响应头，至少可以在 `index.html` 加一条 meta CSP（注意要放行 CloudBase 网关域名、`blob:` worker、`data:` 图片，否则 3D 预览与导出会挂）。
5. **`submissions` / `kv` / `kv_backup` 三张表不属于这个项目**，却留在同一个库里；`submissions` 的策略允许 **匿名 insert 且要求 `status='approved'`**（等于匿名可以往「已通过」列表里写内容）。如果确认不再使用，删表最省事。
6. **SVG 注入面（自伤型）**：`src/engine/design.ts` 的 `textMarkup` 里文字与字体名都过了 `escapeXml`，但 `fill="${l.color}"`、`<image href="${l.src}">`、以及 `MaterialPanel` 的 `m.svg(color)` 是直接拼字符串。别人的项目 json 导入进来时理论上能注入属性。建议统一走 `isHexColor()` / `data:image/` 白名单。
7. **管理员邮箱硬编码两处**：`src/cloud/plans.ts` 的 `adminEmail` 与两条 RLS 策略里的 `auth.jwt()->>'email'`。换邮箱要改两边，容易漏。
8. **旧缓存未清理**：`lunasol.chats.v1`（不分账号那一版）已经不读了，但还留在用户浏览器里，里面有上一个账号的聊天图片。建议 `localStorage.removeItem('lunasol.chats.v1')` 一次性清掉。

---

## 五、已核验为「做对了」的部分（不用动）

- **厂商密钥全部只在云函数环境变量**（19 项），前端 `keys.ts` 只有账号规则纯函数。
- **支付链路**：Creem webhook 先 HMAC 验签（`timingSafeEqual`）再解析；`lunasol_pay_apply` / `lunasol_credits_apply` 要求 `secret` 的 sha256 与库里 `lunasol_pay_secrets` 一致才落库；`event_id` + `order_id` 双幂等。
- **RLS 全开**：16 张表全部 `rowsecurity = true`，业务表一律 `owner_id = auth.uid()`；`lunasol_pay_secrets` 无任何策略（只有 service 层能碰）。
- **服务端计费不信任前端 uid**：`chargeJob` 用用户的 CloudBase access token 调 RPC，DB 侧用 `auth.uid()` 认人；`lunasol_consume_quota` 用 `id = p_uid AND owner_id = auth.uid()`，传别人的 uid 只会返回 -1（拿不到、也扣不了别人的分）。
- **无 XSS 执行面**：全站没有 `eval` / `new Function` / 动态 `innerHTML`；AI 输出只以纯文本渲染；`dangerouslySetInnerHTML` 的 4 处都是内部生成的 SVG。
- **无开放重定向**：登录 `next` 参数只接受 `/` 开头且非 `//`。
- **无 SSRF**：云函数所有 `fetch` 目标都是固定厂商域名，路径参数都 `encodeURIComponent`。
- **素材读取**：`/assets/<id>` 用 32 位随机 id 当能力串、`normalizeMime` 只放行 `image/*`、带 `nosniff`（ID 泄漏即图片公开，属可接受设计）。
- **依赖**：生产依赖已知漏洞 0。

---

## 六、怎么修（执行顺序）

### 第 1 步（5 分钟，收益最大）：跑一次数据库迁移

文件已经在仓库里：`cloudbase/migrations/20261125020000_harden_credits.sql`。它做三件事：收紧订阅表 insert、删掉订阅表 delete 策略、给计费 replay 加费用校验。

> 注意：本会话的 CloudBase MCP 在「执行前二次确认」这一步被客户端拦下了（`elicit unsupported`），DDL 没能替我落库。请在 **CloudBase 控制台 → 数据库 → SQL 编辑器**里粘贴该文件内容执行，或在本地用 `psql` 连一次。

验证：
```sql
select policyname, with_check from pg_policies where tablename='lunasol_subscriptions';
select prosrc like '%job_cost_mismatch%' from pg_proc where proname='lunasol_ai_job_charge';
```

### 第 2 步：退款加 secret（补丁 B）

- 迁移：`lunasol_ai_job_refund(p_job text, p_reason text, p_secret text)`，函数开头比对 `sha256(p_secret)` 与 `lunasol_pay_secrets.name='creem'`（复用已有的 webhook secret，不必新增环境变量）；随后 `revoke execute on function … from anon`。
- 云函数：`refundJob()` 里把 `process.env.CREEM_WEBHOOK_SECRET` 一起传下去。
- 两者要**同一个窗口**上线，否则失败退款会断。

### 第 3 步：`/ai/image` 服务端扣费（补丁 A，最重要）

1. 云函数里补一张服务端价格表（与 `src/cloud/plans.ts` 一致）：`flash 6 / pro 12 / sd55 ? / gpt2-text 42 / gpt2-ref 46`；
2. `handleImage` 在审核通过后、调用上游前：`chargeJob(req, jobId, 'image', cost, provider, model, {tier})`，失败就 `sendChargeError`；
3. 上游失败 / 未返回图片时 `refundJob(...)`（与 studio 路由同一套写法）；
4. 前端删掉这些路径上的 `recordUsage()`（`src/cloud/useChatStore.tsx:560`、`src/workflow/WorkflowStage.tsx:112`、`src/workflow/ConceptStage.tsx:135/192`），否则会**双扣**；
5. `jobId` 由**服务端**生成（忽略 `body.jobId`），彻底断掉 P0-4 那类预占；
6. 出图后前端调 `sub.refresh()` 刷新余额。

### 第 4 步（低成本）：
- `guard()` 的 uid 改为从 JWT 解析；
- `lunasol_asset_put` 加 `p_bytes <= 8388608` 与 `data_url like 'data:image/%'`；
- 打开 main 分支保护、依赖自动更新、第三方 action 锁 SHA；
- 清理 `lunasol.chats.v1` 旧缓存；
- 确认删除 `submissions` / `kv` / `kv_backup` 三张无关表。

---

## 七、补丁 A / B 已实施并上线（2026-11-25 11:12）

### 补丁 B — 退款要口令（P0-3）

- 新迁移 `cloudbase/migrations/20261125030000_refund_secret.sql`：
  `lunasol_ai_job_refund(p_job, p_reason, p_secret)`，开头比对 `sha256(p_secret)`
  与 `lunasol_pay_secrets.name='creem'`（= 环境变量 `PAY_APPLY_SECRET` 的哈希，
  与支付落库同一把钥匙，不新增配置）；先 `drop` 掉旧的两参数签名，否则重载还在；
  执行权从 `PUBLIC` / `anon` 收回，`authenticated` 保留（云函数带用户 token 调用）。
- 云函数 `refundJob()` 每次带 `p_secret`，studio / 拆图 / 生图三条退款路径自动生效。

### 补丁 A — `/ai/image` 服务端扣费（P0-1 + P0-4）

- 云函数新增 `IMAGE_TIER_COST`（flash 6 / pro 12 / sd55 20 / gpt2-text 42 / gpt2-ref 46），
  与 `src/cloud/plans.ts` 严格对齐；`npm test` 新增一条解析比对的断言，改价漏一处就红。
- `handleImage` 在「审核 → 档位校验 → 参考图校验」全部通过之后才预扣：
  预扣失败返回 402/401/409；上游 4xx/5xx、未返回图片、抛异常、客户端断开都原路退款。
- `jobId` 改由服务端生成，`body.jobId` 直接忽略 → 客户端再也拿不到可预占的幂等键。
- 成功响应多返回 `jobId / cost / balance`，前端只刷新余额。
- 前端 `callImage()` 补 `X-CloudBase-Token`（扣费认 token，不认可伪造的 uid 头）；
  `llmImage()` 同样补 token，并**关掉重试**（每次请求都预扣，重试＝重复扣分）。
- 删掉 6 处前端 `recordUsage()`（Luna 对话、方案批生成、单张重生、编辑器 3 处），
  只保留 `sub.refresh()`。`recordUsage()` 本身标记为「不要再用」。

### 部署顺序（必须同一窗口）

1. 控制台 SQL 编辑器跑 `20261125020000_harden_credits.sql`（若还没跑）；
2. 紧接着跑 `20261125030000_refund_secret.sql`；
3. 立刻部署云函数 `lunasol-ai`；
4. 最后发前端（GitHub Pages 走 CI）。

顺序反了会有一段「退款全失败、任务停在 charged」的窗口——不会丢钱，只是要人工核对，
所以第 3 步越快越好。

### 已知口径变化

- 方案页「一键生成 3 张」旧前端只扣 6 分（等于 3 张打包价），服务端按张计费后是 3 × 6 = 18 分。
  界面文案与余额校验已同步改成按张算；若要保留打包价，需要在服务端加批量定价（未做）。

### 上线记录与验证（2026-11-25）

- 两个迁移已通过 CloudBase MCP 实际执行（`20261125020000_harden_credits` / `20261125030000_refund_secret`），
  执行通道不允许无回收站的 `DROP`，所以最终版本改用等价写法：`ALTER POLICY` + 收回旧签名执行权。
- 库侧核验：
  - `lunasol_subscriptions_insert_owner` 的 `with_check` 已含「默认免费行」全部条件；
  - `lunasol_subscriptions_delete_owner` 的 `qual` 变成 `false`（删不掉）；
  - `lunasol_ai_job_charge` 的 `prosrc` 含 `job_cost_mismatch` 与 `AI 生图` 分类；
  - `lunasol_ai_job_refund` 现有两个签名：旧二参数对 `anon`/`authenticated` 均 `false`（已废），
    新三参数 `anon=false / authenticated=true` 且含口令校验。
- 云函数已部署，接口核验：带伪造 `X-CloudBase-Uid`、不带 `X-CloudBase-Token` 请求
  `/images/generations` → `401 {"code":"unauthenticated"}`，**没有触达上游、没有扣分**。
- 前端已由 CI 发布（`assets/index-CtYP5SX5.js`），包内 `callImage` 已带 access token。

