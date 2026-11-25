# LunaSol 2.0 阶段四：DeepSeek AI 画布操作智能体

日期：2026-11-22
分支：`feature/lunasol-2-design-foundation`
范围：把 Studio 的「包装顾问」升级成能读当前设计、生成结构化计划、经 Schema / 权限 / 预览确认后真实修改画布的 AI 设计师。

## 1. 旧系统审计与复用结论

旧版 `src/editor/ai` 是面向旧 `DesignDoc` 的完整工具链路：

- `tools.ts`：22 个旧工具声明 + `validateParams`。
- `planner.ts`：`llmJson` 生成 `thought + actions`。
- `executor.ts`：通过 `ToolHost` 调旧编辑器统一状态接口。
- `EditorContext.tsx`：有选中图层就走局部改，没有选中走整体计划。

不能直接套到 Studio：旧对象是毫米 `Layer`，Studio 是百分比 `DesignEl`，坐标、尺寸和面结构语义不同。阶段四没有另建第二套 AI 对话：

- 复用旧的参数校验器 `validateParams`。
- 复用「规划器 / 执行器分离」的架构。
- 在 `src/studio/ai/` 重建 Studio 专用纯函数工具层。
- 旧 22 个工具定义保留，旧编辑器 AI 不改语义。

为支持更严格的 Studio 校验，`src/editor/ai/types.ts` 的 `ParamSchema` 增加：

`integer`、`pattern`、`itemType`、`minItems`、`maxItems`。

## 2. 工具清单（19 个）

| 工具 | 作用 | 单位 / 关键参数 |
|---|---|---|
| `inspect_design` | 读取当前面、尺寸、元素、选中状态 | 只读 |
| `create_text_layer` | 创建文字图层 | mm：`x_mm/y_mm/w_mm/size_mm` |
| `update_text_layer` | 改文字内容 / 字号 / 字重 / 对齐 / 字体 | `text/size_mm/weight/align` |
| `update_layer_position` | 绝对移动或相对移动 | `x_mm/y_mm` 或 `dx_mm/dy_mm` |
| `resize_design_object` | 缩放对象，中心锚点 | `scale`、`w_mm/h_mm`、`keepAspectRatio` |
| `rotate_design_object` | 旋转 | `rotation` 或 `delta_deg` |
| `change_object_color` | 改文字 / 形状颜色 | 6 位 HEX |
| `replace_image_layer` | 替换图片，只能用项目已有素材 | `src` 或 `sourceLayerId` |
| `create_shape_layer` | 创建矩形 / 椭圆 / 直线 | mm + 圆角 / 描边 |
| `delete_layer` | 删除单个对象 | `layerId` |
| `duplicate_layer` | 复制对象 | `offset_mm` |
| `set_layer_visibility` | 显示 / 隐藏 | `visible` |
| `update_layer_order` | 置顶 / 置底 / 上移 / 下移 | `action` |
| `align_objects` | 对齐到选区或面板安全区 | `align/ref` |
| `distribute_objects` | 等间距分布 | `axis` |
| `change_background` | 修改指定面背景 | `face/color` |
| `run_prepress_check` | 印前检查 | 只读 |
| `update_dimensions` | 改成品尺寸，重跑几何 | `l/w/h`，danger |
| `update_structure` | 结构变更 | 当前阶段明确拒绝 |

### 包装结构边界

- AI 不写刀模结果，不直接改几何引擎输出。
- `update_structure` 固定抛错：
  `结构变更不开放给 AI 直接执行：请回到需求步骤确认结构，并重新检查版面安全区`
- `update_dimensions` 走明确参数接口：
  更新 `answers.size` → `facesOf / dielineOf` 重算 → 统计越出 5mm 安全边的对象 → 进入 danger 二次确认。
- 换结构的需求只能回需求步骤，不在 AI 内偷偷改刀模。

## 3. 执行流程

```
用户输入
→ buildAIContext（真实项目 / 面 / 面板 / 元素 / 选中）
→ DeepSeek 生成 { mode, summary, clarification?, actions[] }
→ JSON 结构与参数 Schema 校验
→ 指代解析（「它」只在唯一选中时成立）
→ 业务权限校验（当前面 / 锁定 / 素材 / 删除数量 / 结构）
→ previewPlan 在不可变副本上试跑
→ 生成操作预览
→ 用户确认（danger 再勾一次）
→ 确认时校验画布指纹 + 当前面
→ executePlan 同一套试跑，全部成功才返回候选状态
→ DesignStage.commitAI 只 push 一次历史
→ 保存项目（本机 + 云端）
```

关键约束：

- AI 不直接改 React state，不操作 DOM。
- 执行器只接收经过 Schema 与业务校验的动作。
- 模型不生成整段 SVG 替换画布。
- 普通属性修改完全本地执行，不调图像模型。
- 只有图片生成类需求才允许走 Seedream / 图像模型。
- 规划复用平台代理 `lunasol-ai`，前端不新增或暴露厂商 Key。

## 4. 当前设计上下文

`src/studio/ai/context.ts` 每次规划前生成：

- 项目 ID / 项目名。
- 包装形式、结构、成品尺寸。
- 当前面与面板毫米宽高。
- 当前面全部元素：ID、名称、类型、文字、颜色、百分比与毫米坐标、层级、锁定、可见、旋转、`assetId`。
- 其它面 ID、名称、对象数量。
- 当前选中对象。
- 可用图片来源（`layerId / srcKind`）。

Base64 图片不进上下文，避免 token 浪费；模型拿到的对象 ID 必须逐字来自上下文，不能猜。

## 5. 权限模型

| 操作 | 预览级别 |
|---|---|
| 改文字、移动、缩放图片、改色、换已有插画、普通排版 | normal |
| 一次删除多个对象 | danger |
| 替换整个面板（删除 + 改背景） | danger |
| 修改成品尺寸 | danger + structural |
| 跨面板批量修改 | danger + crossPanel |
| 修改包装结构 | 拒绝 |
| 批量动作 ≥ 10 | danger |

预览会明确展示：

- 改了哪些对象。
- 每个对象哪个字段 before → after。
- 未改动对象数量。
- 是否涉及其它面板。
- 是否影响结构 / 尺寸 / 刀模。
- danger 原因和 warnings。

## 6. 原子性与撤销

- `previewPlan` 与 `executePlan` 使用同一套 `dryRun`。
- 所有动作在不可变副本上顺序试跑。
- 任一动作失败直接返回 `ok:false`、`design:null`，界面不会提交半成品。
- 成功时 `executePlan` 返回完整候选 `design/project`。
- `DesignStage.commitAI(design, answers|null, mergeKey)` 只 push 一次历史，`mergeKey = ai:<planId>`，不会被 900ms 合并窗口吞掉。
- 画布指纹 `designDigest` 基于 `bg/ink/accent/faces/els` 的 FNV-1a；确认时若画布已变，计划标记 `stale`。
- 撤销只在当前指纹等于执行后指纹时可用，避免误撤销后续手动修改。

## 7. AI 对话体验

`src/studio/StudioChat.tsx` 现在有两种模式：

- 设计步骤（画布已就绪）：DeepSeek 规划 + 计划卡 + 确认 / 拒绝 / 执行结果 / 撤销。
- 需求步骤（`BriefFlow`）：只读顾问，不暴露任何工具，不扣积分。

已支持：

- 普通咨询。
- 生成设计方案建议。
- 修改当前设计。
- 操作失败解释，明确「画布保持原样」。
- 确认修改。
- 拒绝执行。
- 撤销上次 AI 操作。
- 当前选中对象上下文条。

顶部会显示当前面、面板尺寸、对象数量、选中对象；未选中时 AI 不会擅自选一个对象。

## 8. 数据层配套

- `StudioDesign` 新增 `faceBg?: Partial<Record<string,string>>`。
- `bgForFace` / `withFaceBg` 支持按面底色。
- `normalizeDesign` 校验 `faceBg`，旧项目无需迁移。
- `frames.faceDoc`、`EditCanvas`、`Inspector`、`DesignStage` 的底色读写都改成当前面。
- 这解决了旧数据只有一个全局 `bg`、无法满足「修改指定面板背景」的问题。

## 9. 测试结果

### 9.1 自动测试

命令：

```bash
npx tsc --noEmit
npm test
npm run build
```

结果：

- `tsc --noEmit`：通过。
- `npm test`：**115/115 通过**。
- `npm run build`：通过。

阶段四新增 16 项测试，覆盖：

1. 19 个工具声明与去重。
2. 上下文含项目、面板、元素 ID、选中对象，且不含 Base64。
3. 改文字颜色：预览 after 正确，原设计不变，确认后才落盘。
4. 移动图片：mm → 百分比换算，其他对象不动。
5. 缩小插画 15%：中心锚点、保持比例。
6. 批量两个对象：一次确认，两处同时生效。
7. 目标不存在 / 在其它面：明确拒绝，不猜 ID。
8. 锁定对象：改色 / 移动 / 删除全部拒绝。
9. 原子事务：第二动作失败时第一动作也不落盘。
10. 批量删除 / 改尺寸：danger + structural。
11. `update_structure`：拒绝直接改刀模结构。
12. 指代：唯一选中解析「它」，多选 / 无选中拒绝。
13. 面板背景：只改指定面，不波及其它面。
14. 画布指纹变化后计划 stale。
15. 纯咨询不进入执行器。
16. 历史一次 push，撤销恢复 AI 前状态。

### 9.2 真实浏览器验收

环境：

- `http://localhost:4173/#/studio?id=st_mwnrmip8nebhl&view=design`
- 真实项目：正面 62×62mm，11 个对象。
- 真实 DeepSeek 规划：`ds-v41-flash` 经现有云函数代理。
- 未调用 Seedream / GPT Image。

验收步骤与结果：

1. 在图层列表选中标题「是谁谁谁」，上下文条显示 `选中 文字「是谁谁谁」`。
2. 输入：
   `把当前选中的标题改成深绿色 #234B38，往上移动 5 毫米；再把正面插画缩小 15%，其他元素不要动。`
3. DeepSeek 返回 3 个动作：
   - 标题颜色 `#191919 → #234B38`
   - 标题 Y `7.43mm → 2.43mm`
   - 插画 `36.69×22.52mm → 31.19×19.14mm`
   - 未改动 9 个当前面对象；不涉及其它面板；不影响结构。
4. 计划卡显示「待确认」，确认前画布未变。
5. 点击「确认修改」：
   - 显示 `已执行 3 个动作，并记成一条可撤销历史。`
   - 画布标题变深绿并上移，插画缩小。
6. 点击「撤销这次 AI 操作」：
   - 显示 `已撤销上一步 AI 修改。`
   - 画布恢复到 AI 前的标题颜色、位置和插画尺寸。
7. 再次确认执行并刷新页面：
   - 修改仍在，说明设计稿与结构参数一起保存。
8. 生成一个改红色的计划后点「不执行」：
   - 卡片标记「已取消」，提示 `好，这次没有改动画布`。
   - 颜色仍为上一轮已执行的 `#234B38`。

### 9.3 操作截图

- `docs/lunasol-2-stage4-preview.png`：DeepSeek 生成的三动作预览，含 before/after、未改动数量、结构影响。
- `docs/lunasol-2-stage4-applied.png`：确认执行后的结果与「撤销这次 AI 操作」。
- `docs/lunasol-2-stage4-canvas.png`：执行后的画布（标题深绿上移、插画缩小）。
- `docs/lunasol-2-stage4-undone.png`：撤销后的状态。
- `docs/lunasol-2-stage4-reload.png`：刷新页面后修改仍存在。
- `docs/lunasol-2-stage4-rejected.png`：点「不执行」后卡片「已取消」，画布未改。

## 10. 禁止事项核对

| 禁止项 | 实现 |
|---|---|
| 直接执行任意 JS | 不执行；规划只产出 JSON |
| `eval` | 未使用 |
| 直接操作 DOM 改画布 | 执行器只返回候选 `StudioDesign` |
| 任意 SQL | 规划器无 SQL 工具 |
| 自行扣积分 | AI 规划与执行不触碰积分 |
| 暴露模型密钥 | 复用云函数代理，前端无 DeepSeek Key |
| 自动危险批量删除 | danger + 二次勾选确认 |
| 破坏旧版 AI 工具 | 旧 22 工具保留，`validateParams` 仅增强 |
| 普通属性修改调图像 API | 全部本地执行，未调用图像模型 |
| 生成整段 SVG 替换 | 不支持，只做对象级动作 |

## 11. 已知边界

- `update_structure` 当前不开放，结构变更必须回需求步骤。
- `update_dimensions` 已接入 AI，但真实几何重算与安全区警告只做了单测，未在浏览器里实际改 62×62mm 项目尺寸。
- 计划消息会随项目对话保存，项目 payload 会随计划数量增长；后续可考虑只持久化摘要。
- 预览 stale 主要按画布指纹判断；切面时 UI 不会立即把计划标 stale，确认阶段会再用 `baseFace` 拒绝。
- 浏览器验收使用视口 669×842；窄屏底部 AI 抽屉为全屏。
