# LunaSol AI 接入契约（后台接入用）

> 目标：你后续在后台接入 GPT 后，**不需要改任何流程代码或界面**，只要配置一个地址，十步创作流程里的全部 AI 能力立即生效。

## 1. 架构分层

```
十步向导 / 汇总页 / 编辑器
        ↓  runAITask(taskId, context, settings)
AI 任务层  src/ai/tasks.ts
  · 每个节点的 system prompt、输出结构、合规约束
  · 本地回退 src/ai/local.ts（确定性推导，不是假数据）
  · 采纳动作 src/ai/local.ts（只有用户点「采用」才写回 draft）
        ↓  AITransport
传输层  src/ai/provider.ts  →  engine/llm.ts  →  fetch(Base URL)
        ↑
  后台接入点：设置页切「后台代理」或 registerAITransport(fn)
```

所有 AI 调用最终都经过 `engine/llm.ts` 的 `llmChat`，因此代理模式一处生效、全站可用（包含需求理解、AI 局部修改、AI 图像生成等旧模块）。

## 2. 三种接入模式

| 模式 | 前端需要 Key | 适用 |
| --- | --- | --- |
| `off` | 否 | 默认。内置本地引擎，界面标注「本地建议 · 未调用 AI」 |
| `browser` | 是 | 个人本机使用，浏览器直连模型厂商 |
| `proxy` | **否** | **正式上线推荐**。密钥留在你的后台 |

在「AI 模型配置中心」切换即可，配置存在浏览器 `localStorage` 的 `lunasol.ai.v1`。

## 3. 后台代理接口契约

### 文字接口（必须）

```
POST {BASE_URL}/chat/completions
Content-Type: application/json
X-LunaSol-Token: <可选，若后台需要简单鉴权>
```

请求体是标准 OpenAI 兼容格式：

```json
{
  "model": "gpt-4o-mini",          // 可省略，由后台决定
  "messages": [
    { "role": "system", "content": "角色 + 任务 + 合规约束 + 输出结构" },
    { "role": "user", "content": "十步项目状态 + 完整风格配置 + 用户补充想法" }
  ],
  "temperature": 0.7,
  "response_format": { "type": "json_object" }
}
```

响应：

```json
{ "choices": [ { "message": { "content": "{\"suggestions\":[...]}" } } ] }
```

代理模式下前端**不会**发送 `Authorization: Bearer <厂商 Key>`；厂商密钥由你的服务端注入。

### 图像接口（可选）

```
POST {BASE_URL}/images/generations
{ "model": "gpt-image-1", "prompt": "...", "n": 1, "size": "1024x1024", "response_format": "b64_json" }
→ { "data": [ { "b64_json": "..." } ] }  或  { "data": [ { "url": "..." } ] }
```

超时：文字 60s、图像 120s；重试次数可配置。

## 4. 统一输出结构

所有任务都返回同一个形状，`value` 的具体字段见 `src/ai/tasks.ts`：

```json
{
  "suggestions": [
    { "title": "建议标题", "detail": "理由与说明", "value": {} }
  ]
}
```

| 任务 id | 位置 | value 关键字段 |
| --- | --- | --- |
| `size.structure` | STEP 01 | `structureId` |
| `logo.directions` | STEP 02 | `style` |
| `audience.profile` | STEP 03 | `ages / groups / tiers / advice` |
| `product.category` | STEP 04 | `group / type` |
| `style.recommend` | STEP 05 | `style_id` |
| `color.primary` | STEP 06 | `color` |
| `palette.schemes` | STEP 07 | `primary / secondary / accent / bg` |
| `illustration.motif` | STEP 08 | `description` |
| `copy.suggestion` | STEP 09 | `tagline / subtitle / description` |
| `barcode.advice` | STEP 10 | `type` |
| `review.directions` | 需求汇总 | `title / focus`（恰好 3 条） |
| `editor.modify` | 在线编辑器 | 图层级修改补丁 |

## 5. 合规校验（模型不能绕过）

输出先过结构校验，再过节点约束，不合规**整批回退本地建议**并在调用记录里留痕：

- 文案：禁止编造配料、成分、生产日期、保质期、功效、疗效、认证、许可、法规内容；
- 条码：禁止输出 8 位以上连续数字，禁止声称占位码可用于零售；
- 风格：`style_id` 必须是风格库真实存在的 id，不得发明风格或混搭历史时期；
- 图案：用户选「不需要插画」时，任何图案建议都会被拦截；
- 尺寸：`structureId` 必须是当前包装形态允许的真实结构；
- 通用：不得改写用户已确认的品牌名、产品名、商标；关键文字始终是独立可编辑图层。

## 6. 替换传输实现（协议不是 OpenAI 兼容时）

```ts
import { registerAITransport } from './ai/provider';

registerAITransport(async (req, settings) => {
  const res = await fetch('/api/ai/design', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: req.taskId, system: req.system, user: req.user, schema: req.schema }),
  });
  return res.json();
});
```

任务定义、流程、界面、采纳动作全部不用改；`resetAITransport()` 可恢复默认实现。

## 7. 接入检查清单

1. 部署代理并确认 `{BASE_URL}/chat/completions` 返回标准 `choices[0].message.content`；
2. 设置页切「后台代理」，填 Base URL（模型名可留空），保存并「测试连接」；
3. 进入十步向导任意一步 → 点「获取建议」→ 状态应为「AI 已接入 · 建议已生成」；
4. 点「采用」→ 对应字段写入且预览同步变化，已确认内容未被改写；
5. 「AI 模型配置中心 → 最近调用记录」应出现 `AI` 来源与耗时；
6. 故意让后台返回违规文案或假条码 → 应显示「AI 未通过 · 已回退本地建议」，而不是展示违规内容；
7. 停掉后台 → 应显示「AI 调用失败，已如实回退」，创作与导出链路不受影响。

## 8. 安全说明

纯静态前端无法安全隐藏第三方 API Key。`browser` 模式的 Key 只存在用户本机浏览器，绝不写入源码或上传；生产环境请使用 `proxy` 模式，由你的服务端负责密钥、额度、限流与审计。LunaSol 自身不提供也不依赖任何虚构后端。
