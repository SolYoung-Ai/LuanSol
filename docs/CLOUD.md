# CloudBase 国内站接入说明（LunaSol V3.2）

## 环境

| 项 | 值 |
| --- | --- |
| 站点 | 腾讯云 CloudBase 国内站（`ap-shanghai`） |
| 环境 ID | `solyoung-d4gpp1f7s4e075f6d` |
| 静态托管域名 | `solyoung-d4gpp1f7s4e075f6d-1499756427.tcloudbaseapp.com` |
| AI 代理网关 | `https://solyoung-d4gpp1f7s4e075f6d-1499756427.ap-shanghai.app.tcloudbase.com/lunasol-ai` |
| 数据库 | PostgreSQL（`lunasol_projects`） |
| 身份服务 | CloudBase Auth（用户名密码 / 手机号验证码 / 邮箱验证码） |

前端用到的都是公开配置，写在 `.env.production`（刻意入库）：

```
VITE_CLOUDBASE_ENV_ID / VITE_CLOUDBASE_REGION / VITE_CLOUDBASE_PUBLISHABLE_KEY
VITE_LUNASOL_AI_BASE_URL / VITE_LUNASOL_AI_TOKEN
```

厂商模型密钥（`DEEPSEEK_API_KEY`）只在云函数环境变量里，任何前端产物、Git 历史、浏览器存储里都没有它。

## 云函数 `lunasol-ai`

代码：`cloudfunctions/lunasol-ai/`（`index.js` + `package.json` + `scf_bootstrap`）。

| 变量 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 厂商密钥，**只存云函数环境变量** |
| `DEEPSEEK_BASE_URL` | 默认 `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | 默认 `deepseek-chat` |
| `LUNASOL_PROXY_TOKEN` | 可选，前端用 `X-LunaSol-Token` 带上 |
| `LUNASOL_ALLOWED_ORIGINS` | CORS 白名单，逗号分隔 |

接口：

- `GET /health` → `{ok, provider, model, keyConfigured, tokenRequired, imageGeneration}`
  - 这里的 `model` 是**配置值**（`DEEPSEEK_MODEL`），不是本次实际被服务的模型。
- `POST /chat/completions` → 透传 OpenAI 兼容请求，返回厂商原始响应
  - 响应里的 `model` 才是**上游实际服务版本**（例：配置 `deepseek-chat`，实测返回 `deepseek-flash`）。
  - 两者不一致属正常：厂商按内部路由分配后端并回报真实服务名。排查时以响应体为准。

行为约定：

- 未配置 `DEEPSEEK_API_KEY` 时 `/chat/completions` 返回 503 并说明原因，不返回伪造结果；
- 非白名单 `Origin` 不返回 `access-control-allow-origin`；
- 令牌错配返回 401；
- 网关路由关闭了「安全域名」开关（改为函数内白名单），否则网关会拒绝带 `Origin` 的跨域请求。

## 数据库

迁移：`cloudbase/migrations/20261105161501_lunasol_projects.sql`

```sql
CREATE TABLE public.lunasol_projects (
  id text PRIMARY KEY,           -- "<uid>:<projectId>"
  owner_id varchar(64) NOT NULL,
  title text NOT NULL DEFAULT '',
  payload jsonb NOT NULL,        -- 完整项目 JSON（brief / design / versions）
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

四条 RLS 策略（select / insert / update / delete）都用 `owner_id = auth.uid()`，
`authenticated` 角色才可读写。前端用 `app.rdb()` 访问，跨账号读写会被数据库直接拒绝。

## 前端模块

| 文件 | 职责 |
| --- | --- |
| `src/cloud/config.ts` | 公开配置、可用来源判定、DeepSeek preset |
| `src/cloud/sdk.ts` | SDK 单例，`import()` 按需加载（不在首屏） |
| `src/cloud/auth.tsx` | 会话引导、密码登录、注册、验证码登录、退出 |
| `src/cloud/projects.ts` | PG 增删改查，写入后回读确认 |
| `src/cloud/useCloudSync.tsx` | 登录合并、防抖自动上传、手动同步、项目归属 |
| `src/cloud/LoginDialog.tsx` | 登录 / 注册 / 验证码三种入口 |
| `src/pages/account.tsx` | 账号信息、同步状态、云端项目列表 |

## 幂等与降级约定（V3.2.3）

- **登录失败不降级**：拿不到 `session` 就返回失败并展示服务端原文，绝不标记为已登录。
- **失败原因分类**：登录不可用有三种完全不同的原因，提示语必须区分，不能都报「未配置环境」——
  ① 没配环境变量（`!cloudConfigured`）；② 域名不在安全域名白名单（`!cloudOriginSupported()`）；
  ③ SDK 未就绪（刷新重试）。②在 GitHub Pages 镜像域名上必然发生，属平台限制而非配置缺失。

## 已知限制

1. **安全域名**：`CreateAuthDomain` 在体验版返回「当前套餐无法执行此操作」，认证接口只对 CloudBase 域名放行，GitHub Pages 来源会被 403。前端对这类来源做诚实降级并给出正式站点入口。
2. **默认测试域名**：真实浏览器访问 `*.tcloudbaseapp.com` 会先出现「风险提醒」页，官方建议绑定已备案自定义域名。
3. **注册通道**：`signUp` 要求手机号或邮箱，用户名不能直接注册；短信走 CloudBase 默认通道，邮件通道需在环境侧配置后才能收到信。
4. **代理令牌是公开值**：`VITE_*` 会打包进前端，`LUNASOL_PROXY_TOKEN` 只是防滥用的一层薄壳。真正的配额控制应改为「按登录会话鉴权 + 每用户额度」，需要把 AI 代理与账号系统打通（后续）。
