# LunaSol 2.0 · 阶段一：技术审计与设计数据层加固

- 仓库：`SolYoung-Ai/LuanSol`（本地 `/Users/songyang/WorkBuddy/2026-11-05-12-49-30/LuanSol`）
- 分支：`feature/lunasol-2-design-foundation`（基于 `main` 的 `5e18a88`）
- 范围：只做数据层与坐标换算的审计 + 增量加固 + 自动化测试；不动 UI 布局、不动编辑器栈、不动账户/积分/模型代理/项目存储
- 结论：**无架构冲突**，现有“Studio 百分比 → 引擎毫米”的设计可以继续沿用；本阶段把散落的换算收敛到唯一模块，补齐旧模型缺失的 11 个可选字段，并把 10 条真实转换用例纳入测试。

---

## 一、执行记录

| 步骤 | 动作 | 结果 |
|---|---|---|
| 1 | `git status` / `git log` | 起点 `main @ 5e18a88`，工作区仅一个未跟踪 `.trae/`（与本任务无关，未动） |
| 2 | 建分支 | `git checkout -b feature/lunasol-2-design-foundation` |
| 3 | 配置勘察 | `package.json`：`build = tsc --noEmit && vite build`、`test = node tests/run-node.mjs`、`typecheck = tsc --noEmit`；`tsconfig`：`strict`、`noEmit`、`moduleResolution: Bundler`、`include: ["src","vite.config.ts"]`（`tests/` 不在 typecheck 内）；测试框架为自研 esbuild 打包 + 自写断言（`A` / `near` / `t`） |
| 4 | 基线（改动前） | `npm test` → **69/69 通过**；`npm run build` → 成功（`✓ built in 2.55s`） |
| 5 | 读码 | 任务书列出的 10 个文件全部存在，无路径冲突 |

**历史错误与新增错误的区分口径**：基线为 0 失败 + 构建成功，因此本分支上任何失败都只能来自本次改动。改动后复跑：**79/79 通过、构建成功**（详见第七节）。

---

## 二、现状审计：新旧两套设计模型

### 2.1 两套模型的分工

| | 旧版 `DesignDoc`（`src/types.ts`） | 新版 `StudioDesign`（`src/studio/types.ts`） |
|---|---|---|
| 用途 | 印刷引擎的输入：SVG / PDF / DXF 导出、3D 贴图、刀板渲染 | 工作台画布的持久化内容：用户在界面上编辑的东西 |
| 坐标 | **毫米**（面左上角为原点） | **百分比**（相对该面宽/高，0–100） |
| 面板 | `faces: Partial<Record<FaceId, Face>>`，`Face = {id,w,h,bg,layers}` | `els: DesignEl[]` + `faces?: Record<faceId, DesignEl[]>` |
| 对象 | `Layer = TextLayer \| ShapeLayer \| ImageLayer`（字段强类型、必填） | `DesignEl = {id, kind:'text'\|'sticker'\|'rect', …}`（字段少、几乎全可选） |
| 归属面 | `Face` 的 key | `faces` 字典的 key（**元素自身原先没有 faceId**） |

两套模型不是重复建设：`src/studio/frames.ts` 是唯一的桥，`designDocFor(project, facesMap)` 把各面元素转成一份 `DesignDoc`，同一份 `doc` 同时喂给 `DielineView`（刀板）、`Viewer3D`（3D）、`spreadSvg` / `buildPdf` / `mockupSvg`（导出）。这条“单一产物”链路是本阶段能保持三视图一致的根本原因，**因此没有推翻它**。

### 2.2 元素字段对照

| 能力 | 旧 `Layer`（mm） | 新 `DesignEl`（%） | 阶段一处理 |
|---|---|---|---|
| 文字 | `text`、`fontSize`(pt)、`fontFamily`、`fontWeight`、`color`、`align`、`letterSpacing`、`lineHeight` | `text`、`size`(%宽度)、`weight`、`color`、`align` | 补 `fontFamily?`；pt ⇄ % 换算进 `frames.ts` |
| 图片 | `src`、`naturalW`、`naturalH`、`fit` | `src`(data URL)、`w`，无 `h` 时按正方形 | 补 `source?`、`assetId?`；`h` 仍可缺省 |
| 图形 | `shape:'rect'`、`fill`、`stroke`、`strokeWidth`、`rx`、`seed` | `color`、`h`(%) | 不扩展引擎图形能力，只补通用字段 |
| 几何 | `x,y,w,h,rotation` | `x,y,w,h?` | 补 `rotation?` |
| 显示 | `opacity`、`hidden?` | `opacity` | 补 `visible?`（与 `hidden` 互补） |
| 编辑态 | `locked`、`name` | 无 | 补 `locked?`、`name?` |
| 层级 | 数组顺序（末尾最上） | 数组顺序 | 补 `zIndex?`（不填 = 旧顺序） |
| 归属面 | `Face` key | `faces` key | 补 `faceId?`（**冗余快照，容器为权威**） |
| 时间 | 无 | 无 | 补 `createdAt?`、`updatedAt?` |
| 素材追溯 | 无 | 无 | 补 `source?`、`assetId?`（供素材库回链） |

**面板归属的事实**：元素原本没有 `faceId`，归属完全由 `faces` 的 key 决定；`facesOf(project)` 从刀模 `sheet.rects` 里筛 `face && artwork` 去重后按 `FACE_ORDER = ['front','back','left','right','top']` 排序。阶段一保留这一事实，只增加一个**派生快照字段**并在写入时强制与容器对齐——这样导出/调试时单看元素也知道它属于哪一面，同时不可能出现“元素说自己是背面、却被存在正面容器里”的分裂状态。

### 2.3 序列化现状

- 项目整体：`localStorage` + CloudBase 双写；`normalizeStudioProject` 校验 `st_` 前缀、补 `emptyAnswers()`、`chat` 截 60 条、`step` 夹 1..10、`design` 交给 `normalizeDesign`。
- 设计稿：`normalizeDesign` 逐元素白名单清洗 —— 坐标/字号夹区间、颜色只认 `#rgb/#rrggbb`、`opacity` 夹 0.05..1、`src` 只认 `data:image/` 且 >6MB 丢弃、每面最多 24 个元素。
- 结论：**属性丢失的真实风险点不在序列化层，而在类型层**——旧 `cleanEls` 只认识旧字段，新字段即使写进 JSON 也会在重载时被白名单丢弃。阶段一已把 11 个新字段纳入清洗，并区分“给了合法值才写 / 没给保持 undefined”，所以旧稿重载后不会凭空多出默认值。

---

## 三、坐标规范（唯一入口：`src/studio/frames.ts`）

三套坐标各管一段，禁止混用：

| 坐标 | 单位/基准 | 允许出现在 |
|---|---|---|
| 面板局部百分比 | %，相对该面宽/高，0–100 | `DesignEl.x/y/w/h/size`，持久化数据 |
| 面局部毫米 | mm，面左上角为原点 | `Layer.x/y/w/h`，交印刷引擎 |
| 刀模全局毫米 | mm，展开图坐标 = 面局部 + 面板偏移 | 刀板视图、PDF/SVG 展开、DXF |
| 屏幕像素 | px | 仅画布显示，**永不写入项目数据** |

固定链路：

```
DesignEl(百分比) --elLocalRect--> 面局部 mm --localToSheet(+panel.x/y)--> 刀模全局 mm
                            \--elToLayer--> Layer(mm) --designDocFor--> DesignDoc
```

规则与实现（全部在 `frames.ts`）：

1. **换算必须给真实面板宽高**：`pctToMm(pct, faceW)` / `mmToPct(mm, faceW)`；面板宽高非有限或 ≤0 时 `validBox` 判无效，换算返回 0，避免 NaN 传染。
2. **刀模全局必须带偏移**：`localToSheet(rect, origin)`，`origin` 只能来自 `faceOrigins(dieline, faceId)`（即 `sheet.rects` 里该面 `artwork` 面板的 `x/y`）。同一局部坐标在不同面板上是不同全局位置。
3. **文字高度统一算**：`elTextMetrics(el, face)` 给出 `sizeMm`、按 `wrapText` 折出的行数、`h = 行数 × 字号 × 1.4`（下限 0.3mm）。`elToLayer` 与 `elSheetRect` 都取这一份，避免“画布估一次、导出再估一次”。
4. **组件里不再乘除**：`DesignStage.tsx` 的三处手工换算（安全边百分比、字号 mm 读数）改为调用 `mmToPct` / `pctToMm`；`elToLayer` 内部原先直接 `/100 * face.w` 的写法已删除。
5. **缩放只影响 `scale`**：画布 `boardW/boardH` 由 `fit × zoom` 计算，只参与 px 渲染；元素数据保持百分比，所以浏览器缩放不会改变实际尺寸。

**与提示词的一致性说明**：提示词要求“百分比只属于面板内部局部坐标、毫米用于结构与导出、像素不持久化”，与现有代码设计完全一致；本阶段没有把全项目批量换成毫米，而是把已有的百分比模型显式规范化。

---

## 四、修改文件清单与原因

| 文件 | 为什么改 |
|---|---|
| `src/studio/types.ts` | 1) `DesignEl` 增量追加 11 个可选字段 + `ElSource` 类型（旧字段、旧必填项一律不动）；2) `cleanEls(raw, limit, faceId?)` 把新字段纳入白名单清洗（旋转 −180..180、透明度 0.05..1、zIndex 取整 −99..99、name 截 40、fontFamily 截 80、source 白名单、assetId 截 64、时间戳取有限值），`faceId` 由容器覆盖；3) `normalizeDesign` 按面清洗时传入容器名，front 也从 `els` 补齐 `faceId`；4) `withFaceEls` 写入时把每个元素的 `faceId` 校正为所在面，保证“容器唯一权威”。 |
| `src/studio/frames.ts` | 1) 新增坐标规范段：`FaceBox` / `MmRect` / `validBox` / `pctToMm` / `mmToPct` / `ElMetrics` / `elTextMetrics` / `elLocalRect` / `localToSheet` / `faceOrigins` / `elSheetRect`；2) `elToLayer` 重写为“只调 `elLocalRect` + 取整”，并支持 `visible=false`（不输出）、`rotation`、`locked`、`name`、`fontFamily`；3) 新增 `layerToEl`（旧 `DesignDoc` → 新元素的逆向换算，mm → %、pt → %宽度、带回旋转/透明度/锁定/隐藏/名称/图片）；4) 新增 `drawOrder`，`faceDoc` 按它排序（没有 `zIndex` 时原样返回，旧稿渲染零变化）。未改 `FORM_STRUCTURE`、`facesOf`、`faceRatio`、`dielineOf`、`designDocFor`、`panelsOfFace`、出血/安全边常量。 |
| `src/studio/design.ts` | 1) `moveEl` / `resizeEl` 对 `locked` 元素直接跳过（数据层先兜住，界面暂不加锁图标）；2) `addText` / `setSticker` / `duplicateEl` 写入 `createdAt` / `updatedAt`（`addText` 标 `source: 'system'`），让新字段真正有值可存。边界夹紧逻辑不变。 |
| `src/studio/DesignStage.tsx` | 1) 画布元素列表改走 `drawOrder(faceEls(...))`，让有 `zIndex` 的新数据与 3D/刀板/导出同序；2) 安全边 inset 与字号 mm 读数改调 `mmToPct` / `pctToMm`，消除组件内重复换算。DOM 结构、样式类名、交互回调未改。 |
| `tests/suite.ts` | 追加 10 条用例（见第六节），并补充 `elLocalRect` / `elSheetRect` / `pctToMm` / `mmToPct` / `layerToEl` / `drawOrder` / `faceDoc` / `faceOrigins` / `validBox` / `DesignEl` 的导入。未删除、未跳过任何原有用例。 |
| `docs/lunasol-2-stage1-audit.md` | 本报告。 |

**没有改动的关键区域**（逐项对照禁止事项）：`src/editor/`、旧 `DesignDoc` 定义、`src/engine/structure.ts`、Three.js 集成、SVG 渲染体系（`spreadSvg` / `layerMarkup`）、首页、会员/积分/账户、模型代理接口、CloudBase 存储逻辑、旧项目数据格式。

---

## 五、新增字段（`StudioDesign → DesignEl`）

| 字段 | 类型 | 缺省 | 语义 |
|---|---|---|---|
| `faceId` | `string?` | 由容器写 | 所属面板；**冗余快照**，保存/读回时以 `faces` 容器为准重写 |
| `name` | `string?` | 界面按内容兜底 | 图层显示名 |
| `rotation` | `number?` | 0 | 顺时针角度（度），夹 −180..180 |
| `opacity` | 已有 | 1 | 未改语义（0.05..1） |
| `visible` | `boolean?` | true | false 时不绘制、不参与 3D/刀板/导出，但数据保留 |
| `locked` | `boolean?` | false | 锁定后数据层忽略拖动/改宽 |
| `zIndex` | `number?` | 数组顺序 | 同面叠放次序，越小越靠后 |
| `fontFamily` | `string?` | 引擎中文黑体 | 文字字体族 |
| `source` | `ElSource?` | 无 | `'ai' \| 'upload' \| 'logo' \| 'library' \| 'system'` |
| `assetId` | `string?` | 无 | 素材库 ID，供回链 |
| `createdAt` / `updatedAt` | `number?` | 无 | 毫秒时间戳；旧数据为空 |

设计原则：**全部可选**，不填即旧行为；`cleanEls` 只在拿到合法值时才写字段，因此旧稿重载后 `rotation` 等仍是 `undefined`，不会凭空补 0 而改变数据。

---

## 六、新增测试列表（10 条，全部覆盖真实转换函数）

| # | 用例 | 覆盖点 |
|---|---|---|
| 1 | 坐标 · 百分比只在面内：62×62 面板 50% 横向 = 31mm | 真实瓶标项目（`bottle` 62×62）→ `facesOf` → `elLocalRect`；`pctToMm` / `mmToPct` 往返 |
| 2 | 坐标 · 同一百分比在不同宽高的面板得到不同的毫米位置 | 62×62 与 120×80 同坐标不同结果 |
| 3 | 坐标 · 面局部 → 刀模全局必须带面板在展开图里的偏移 | `faceOrigins` 等于刀模面板 `x/y`；局部 0,0 落在偏移处；正面/背面原点不同 |
| 4 | 数据 · 旋转/透明度/隐藏/锁定/层级/来源 存得下、读得回 | `normalizeDesign` 清洗 → 新字段保留；错误 `faceId` 被容器纠正；`visible:false` 不进图层；NaN/Infinity 夹回默认 |
| 5 | 往返 · 新版元素 → 印刷图层 → 新版元素，关键属性不丢 | `elToLayer` → `layerToEl`，文字/色块/贴纸三类，坐标、字号、字色、字重、对齐、旋转、透明度、锁定、名称、图片 |
| 6 | 多面 · 正面元素不会出现在背面，空面也保留 | `designDocFor` 多面隔离、`back_` 前缀、空面仍建 |
| 7 | 层级 · 有 zIndex 才重排，没写 zIndex 的老稿渲染不变 | `drawOrder` 无 zIndex 返回同一数组；`faceDoc` 升序 + 隐藏跳过 |
| 8 | 脏输入 · NaN / Infinity / 零尺寸 / 缺面板都安全处理 | `pctToMm` / `mmToPct` / `validBox` / `elLocalRect` / `elToLayer` / `facesOf` / `dielineOf` / `designDocFor` / `faceRatio` |
| 9 | 兼容 · 旧 Studio 项目与旧 DesignDoc 都能继续读进来 | `normalizeStudioProject` 恢复旧稿（els→faces.front、step 不丢、新字段保持 undefined）；旧 `DesignDoc` 经 `layerToEl` 反向导入 |
| 10 | 一致性 · 画布毫米 / 刀板全局 / 导出图层用同一份换算 | `elLocalRect` ↔ `Layer` 数值相等；全局 = 局部 + 偏移；偏移与 `spreadSvg` 用的 `p.x/p.y` 同源 |

---

## 七、构建与测试结果

| 项 | 改动前（基线） | 改动后 | 判定 |
|---|---|---|---|
| `npm test` | 69/69 通过 | **79/79 通过**（+10 新增，原有 69 条全部保持通过） | 无新增失败 |
| `npm run typecheck` | — | 通过（0 错误） | — |
| `npm run build` | 成功 | **成功**（`tsc --noEmit && vite build`，`✓ built in 2.79s`） | 通过 |
| 页面加载 | — | 本地 `vite preview` → `#/studio` 正常渲染，无新增运行时报错（仅有一条既有的 CloudBase `auth.then` warning，与本次改动无关） | 通过 |

`any` 使用情况：本次新增代码 **0 处 `any`**；测试里对“用户可能塞进来的脏 JSON”用 `as never` 绕过类型检查，而不是放宽被测函数的签名。

---

## 八、一致性检查结论（2D / 刀模 / 3D / SVG / PDF）

| 视图 | 吃什么 | 是否一致 |
|---|---|---|
| 2D 画布 | `DesignEl` 百分比 + `boardW/boardH`（px 仅显示） | 是（px 不落库） |
| 刀板 `DielineView` | `DesignDoc`（mm） + 面板 `x/y` 偏移 | 是 |
| 3D `Viewer3D` | 同一份 `DesignDoc` 贴到各面 | 是（与刀板同源） |
| SVG `spreadSvg` | 同一份 `DesignDoc`，嵌套 `<svg x=p.x y=p.y>` 完成偏移 | 是 |
| PDF `buildPdf` | 同一份 `DesignDoc`，每张展开图 2 页（设计页 + 刀模页） | 几何一致；**旋转不一致**（见下） |
| DXF | 只画刀模线，不含设计内容 | 不涉及 |

阶段一新增的 `elLocalRect` / `elSheetRect` 与 `designDocFor` 输出已在测试 10 中做了数值对齐，因此“画布看到的尺寸”与“导出拿到的尺寸”是同一份计算结果，而不是两套公式碰巧相同。

---

## 九、已知问题（如实记录，未在本阶段修）

1. **PDF 忽略旋转**：`src/engine/design.ts` 的 `layerMarkup`（SVG）用 `translate + rotate(中心)` 支持 `rotation`，但 `src/engine/export.ts` 的 `drawLayerPdf` 对文字/图形/图片一律轴对齐绘制。Studio 此前从不写 `rotation`，所以线上无感；一旦界面开放旋转，PDF 与 SVG 会不一致。修复需要在 PDF 侧加 `pdf.setCurrentTransformationMatrix` 等价变换（下阶段）。
2. **文字行高是估算**：`elTextMetrics` 用 `wrapText` 折行 + 1.4 倍字号，不是字体真实度量；SVG/PDF 渲染的字宽可能与估算略有出入（会导致文字块包围盒略偏），但不影响锚点位置与字号。
3. **图片固有尺寸固定 1000×1000**：`elToLayer` 里 `naturalW/naturalH` 写死，`fit:'contain'` 下不改变视觉，但严格说损失了原图宽高比信息。
4. **`opacity` 下限 0.05**：沿用旧清洗规则，无法做完全透明；若将来要“淡出到 0”，需要改清洗区间并同步 PDF alpha。
5. **`zIndex` 只在同面内生效**：跨面没有全局层级概念（也不需要）；同一面里若出现重复 `zIndex`，按数组顺序稳定排序。
6. **`faceId` 是冗余字段**：为兼容与调试而加，权威仍是 `faces` 容器；外部直接改 JSON 时以容器为准覆盖。
7. **测试不进 `tsc`**：`tsconfig.include` 只含 `src`，`tests/` 由 esbuild 转译，类型错误不会在 `typecheck` 阶段暴露（这是既有工程配置，本阶段未改，避免扩大改动面）。
8. **两套编辑器并存**：`src/editor/`（旧 `/new`）与 `src/studio/`（`/studio`）仍是两套渲染实现，`layerToEl` 只解决了“旧 Doc → 新元素”的数据互通，UI 层未合并（符合渐进式策略）。
9. **手提袋仍无刀模**：`FORM_STRUCTURE.tote = null`，界面明示无刀板，本阶段保持这一诚实策略。

---

## 十、下一阶段建议

1. **PDF 旋转对齐**（P0）：让 `drawLayerPdf` 与 `layerMarkup` 使用同一套旋转语义，补一条“旋转 30° 的元素在 SVG 与 PDF 包围盒一致”的用例。
2. **把新字段接进界面**：图层列表显示 `name` / 锁图标 / 眼睛图标，属性面板开放旋转与透明度；`moveEl/resizeEl` 的 `locked` 保护已经在数据层就位。
3. **素材来源回链**：`source` + `assetId` 已能存，下一步在素材库侧建立反查，避免重复生成同一张图。
4. **字体真实度量**：用 canvas `measureText` 或引擎字体表替换 1.4 倍估算，让文字包围盒与 PDF 输出严格一致。
5. **全项目坐标审计收尾**：`grep` 全仓 `/100`、`* face` 等模式，确认除 `frames.ts` 与纯显示代码外无第三处换算。
6. **快照式回归**：对同一 `DesignDoc` 固定输入生成 SVG 字符串快照，防止后续改动悄悄改变导出几何。

---

## 十一、验收对照

| 验收项 | 结果 |
|---|---|
| 原有项目可以正常构建 | 通过（`npm run build` 成功） |
| 原有测试没有新增失败 | 通过（原 69 条全部通过） |
| 新增坐标转换测试全部通过 | 通过（10 条新增，79/79） |
| 新旧数据转换可以往返验证 | 通过（用例 5、9） |
| 旧项目可以继续打开 | 通过（用例 9；`normalizeStudioProject` 路径未改） |
| 工作台视觉与交互未被意外改变 | DOM/样式/回调未改；渲染顺序仅在有 `zIndex` 时生效；本地加载 `#/studio` 正常，无新增报错 |
| 输出完整技术审计报告 | 本文件 |

本阶段到此停止，未进入第二阶段。
