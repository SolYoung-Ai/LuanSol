# LunaSol 2.0 阶段五：包装结构验证、3D 同步与印前交付

日期：2026-11-22
分支：`feature/lunasol-2-design-foundation`
基线：`06c9033 feat(studio): 阶段四 DeepSeek 画布操作智能体`

范围：验证现有七种结构，修真实几何问题，让二维面板、3D 贴图和导出共用同一份设计数据，升级印前检查与导出分层。没有新增盒型，没有更换结构引擎。

## 1. 结论

- 七种结构的尺寸、面板、裁切、压痕、出血、安全区全部可计算，基础审计无 error。
- `tuck` 完成小 / 中 / 大 / 细长 / 最小 / 零值 / 负值 / NaN 八组尺寸矩阵；非法输入不再静默夹取，而是留下 `clamped`、`input` 和可读 warning。
- 3D 只对 `tuck`、`topBottom`、`labelRect`、`labelRound` 标记为可靠；`drawer`、`mailer`、`pouch` 明确标记暂不支持可靠预览，不再显示“看起来对”的错误模型。
- 印前新增几何完整性、有效 PPI、缺图、透明底、文字跨面板 / 压痕 / 过小、胶舌、工艺图层等检查；存在 error 时导出前弹窗阻断，取消即中止。
- PDF 每张展开图输出 PRINT / CUT / CREASE 三页，特殊工艺再各出一页；页面为真实毫米，透明 PNG 通过 `/SMask` 保留 alpha。
- 真实项目“是谁谁谁”导出复核：68×68mm 页面、3 页、CUT / CREASE 各一页、无工艺页，DXF 单位为毫米、范围 0..68mm。
- 尚未做实体打样，因此不能宣称已经满足量产。纸厚、折叠补偿、插舌间隙、刀模厂回执和实际印刷色均未验证。

## 2. 审计范围

读取并检查：

| 文件 | 关注点 |
|---|---|
| `src/engine/structure.ts` | 七结构参数、面板、裁切 / 压痕 / 胶舌、出血、安全区、异常尺寸 |
| `src/engine/design.ts` | SVG 图层输出、空图占位、可编辑文字 |
| `src/engine/utils.ts` | 几何与数值工具 |
| `src/studio/frames.ts` | Studio 数据到刀模 / `DesignDoc` 的桥接 |
| `src/engine/prepress.ts` | 印前检查项与阻断规则 |
| `src/engine/export.ts` | SVG / PDF / DXF / ZIP |
| `src/components/Viewer3D.tsx` | Three.js 模型、贴图、面板尺寸来源 |
| `src/studio/DesignStage.tsx` | 三视图、导出入口、印前阻断、3D 支持分支 |

新增审计文件 `src/engine/structureAudit.ts`，把“结构是否成立”从“画得出来”里拆出来，作为印前和测试的共用判据。

## 3. 结构引擎发现的问题与最小修复

先复现，再改。没有为了让测试通过而删除真实结构。

| # | 复现 | 原因 | 修复 |
|---|---|---|---|
| S1 | `buildDieline('tuck', {l:0,w:0,h:0})` 返回 85×55，调用方无法知道输入非法 | 尺寸被 `Math.max` 静默夹取 | `fit()` 对 NaN / Infinity / ≤0 / 低于下限分别夹取并写 warning；返回 `clamped` 与 `input` |
| S2 | Studio 用户确认的 `glue` / `tuckLen` 不进入刀模 | `frames.ts` 只传 `structure/size/bleed/safe` | `StudioAnswers.structureExtra` 透传到 `buildDieline` |
| S3 | `labelRect` 的 `faceSizes` 返回 `back`，3D 会凭空贴背面 | 面尺寸表按盒型模板写死 | `labelRect` / `labelRound` 只返回 `front`；`pouch` 只返回 `front/back` |
| S4 | 20×15mm 标签、5mm 安全区产生 0 宽 / 0 高安全区与零长度线 | `w - safe*2` 未过滤非正结果 | 安全矩形过滤 `w/h <= EPS`；安全线段过滤零长度 |
| S5 | 天地盖 `h=18mm` 时默认盖墙 12mm 超过上限 8mm，底墙只剩 6mm | 默认值直接进入 `extraNum`，未先夹取 | 默认值也走 `clamp`；`lidWall <= max(8,h-10)`，`baseWall=max(10,h-lidWall)`，高度不一致写 warning |
| S6 | 自立袋 `w=15mm` 时 gusset 仍按 20mm 生成，折角比袋宽还大 | gusset 只按 `w*0.5` 下限 20 计算 | `gusset=min(w, min(60,max(20,w*0.5)))`；`w<20` 收窄并 warning |
| S7 | 圆标签半径小于安全区时 `safeR` 为负 | 未 clamp | `safeR=Math.max(0,r-safe)`；为 0 时安全区为空并 warning |
| S8 | 出血线按每个面板四边外扩，折叠盒内部接缝也出现“出血” | 逐面板 `strokeRect` | 新增 `rectUnionOutline()`：外扩矩形栅格化，取有料格与空格交界，合并共线段，得到真正外轮廓 |
| S9 | `faceSizes` 用全局夹取下限，和 `buildDieline` 的结构下限不一致 | 两处各自夹取 | 统一改用 `STRUCTURE_MIN` |
| S10 | 天地盖 3D 把 40mm 的正面图案压到 28mm 的墙上 | 3D 按 `H*0.72 / H*0.3` 猜墙高，二维画布按整面 `h` | `faceSizes('topBottom')` 改为真实 `baseWall` / 盖顶 `l+2gap`；`Viewer3D` 直接读 `tb-base` / `tb-lid` 面板 |
| S11 | `drawer` 正面能编辑但不贴图；`mailer` / `pouch` 被当成插舌盒；`labelRound` 被当成整圈环带 | 3D 用一个通用盒模型套所有结构，部分尺寸硬编码 | 新增 `viewerSupport()` 可靠性矩阵；不可靠结构不渲染示意模型；圆标签改为平贴圆面 |
| S12 | 3D 标签素材显示碎图标，随后整块变黑 | SVG 图片不允许拉外部资源；多 MB data URL 经 `encodeURIComponent` 超过浏览器 URL 限制 | `inlineImage()` 用 CORS fetch 转 data URL；最终改用 `Blob` URL 交给 SVG，`onload` 后 revoke |
| S13 | 真实项目 `labelRect` 四条边框被误报“出血线不在外沿” | 审计用 `bleed=0` 做弱校验 | `auditSheet(sheet, structure, bleed)` 使用真实 `d.bleed` |
| S14 | 补充参数 `glue=-50`、`tuckLen=Infinity` 静默回退默认值 | `extraNum` 无警告通道 | `xnum()` 对非法 / 越界补充参数写可读 warning，几何不变 |
| S15 | 导出 PDF 整页铺正面底色，刀模与印刷混在一页，严重印前错误仍可下载 | 导出没有分层，也没有读取印前状态 | PDF 按面铺底色；每张展开图拆 PRINT / CUT / CREASE；工艺独立页；error 弹窗阻断 |
| S16 | DXF 没有版面范围声明 | 只写 `$INSUNITS` / `$LUNITS` | 新增 `$EXTMIN` / `$EXTMAX`，保留毫米单位与 Y 翻转 |

### 结构下限

| 结构 | 长 / 宽 / 高下限（mm） | 说明 |
|---|---|---|
| `tuck` | 20 / 15 / 8 | 低于此值安全区和插舌都不成立 |
| `topBottom` | 30 / 25 / 18 | 盖墙 8 + 底墙 10 的最小总高 |
| `drawer` | 35 / 30 / 20 | 内盒与外套需要的最小尺寸 |
| `mailer` | 25 / 20 / 15 | 侧翼折叠需要的最小尺寸 |
| `pouch` | 35 / 25 / 20 | 常规自立袋比例下限 |
| `labelRect` | 20 / 15 / 0 | 标签无高度 |
| `labelRound` | 20 / 15 / 0 | 标签无高度 |

## 4. 七种结构基础测试

固定输入 `80×50×40mm`，`bleed=3`，`safe=5`。审计结果均为 0 error。

| 结构 | 展开图（mm） | 可印刷面 | 3D 级别 |
|---|---|---|---|
| `tuck` | 1 张 275×162 | front 80×40 / back 80×40 / left 50×40 / right 50×40 / top 80×50 | reliable |
| `topBottom` | 2 张 164.4×112、126.4×82.4 | front 80×28 / back 80×28 / left 28×50 / right 28×50 / top 82.4×52.4 | reliable |
| `drawer` | 2 张 175×121、256×56 | front 80×40 / back 80×40 / left 50×40 / right 50×40 / top 80×50 | unsupported |
| `mailer` | 1 张 166×201 | front 80×40 / back 80×40 / left 50×40 / right 50×40 / top 80×50 | unsupported |
| `pouch` | 1 张 166×83 | front 80×40 / back 80×40 | unsupported |
| `labelRect` | 1 张 86×56 | front 80×50 | reliable |
| `labelRound` | 1 张 86×56（圆形裁切） | front 80×50 | reliable |

补充：

- `labelRound` 的裁切与出血是 `circles`，不是直线段，所以 `cut / crease / bleed` 线段计数为 0 是预期。
- 天地盖是两张展开图，`top` 是盖盒顶面真实尺寸 `(l+2gap)×(w+2gap)`，不是底盒顶面。
- `drawer` / `mailer` / `pouch` 的几何仍可导出刀模，只是 3D 不做示意模型。这是显示能力限制，不是几何失败。

## 5. `tuck` 多尺寸矩阵

| 用例 | 输入（mm） | 展开图（mm） | 结果 |
|---|---|---|---|
| 小型 | 30×20×12 | 115×69 | 通过 |
| 中型 | 80×50×40 | 275×162 | 通过 |
| 大型 | 300×200×150 | 1022×576 | 通过 |
| 细长 | 200×20×40 | 455×97 | 通过；长宽比极端 warning |
| 最小 | 20×15×8 | 85×55 | 通过；4 个面安全区不足 warning |
| 零值 | 0×0×0 | 85×55 | `clamped` + `input-clamped` + 三条下限 warning |
| 负值 | -50×-20×-10 | 85×55 | `clamped` + `input-clamped` + 三条下限 warning |
| NaN | NaN×30×20 | 115×97 | `clamped` + `input-clamped` + NaN warning |

非法输入的处理原则：

- 不抛异常，不产生 NaN / Infinity / 零长度边 / 负面积面板。
- 不假装合法：`d.clamped=true`，`d.input` 保留原始值，`d.warnings` 说明每个被替换的尺寸。
- 印前把 `input-clamped` 当作 error；这样的刀模可以看，但不能用于生产。

补充参数非法时同样会警告，例如 `glue=-50` 回退默认值，`tuckLen=Infinity` 回退默认值。几何仍通过审计，但用户能看到“采用了哪个值”。

## 6. 切割线、压痕线与胶舌关系

`tuck 80×50×40` 实测：

- 24 条裁切线，19 条压痕线。
- 无重复同 kind 线段。
- 每条压痕中点落在至少 2 块面板边界上，不穿过面板内部。
- 裁切线不穿过任何面板内部。
- 面板两两重叠面积不超过 0.5mm²。
- 胶舌存在；`tuck` / `topBottom` / `drawer` 缺胶舌会在印前报 error。
- `pouch` 不套用胶舌规则，按热封边说明；`mailer` 按折叠 / 模切说明。

## 7. 出血与安全区

- 出血线改为所有面板外扩矩形的并集外轮廓。折叠盒内部接缝不再生成假出血。
- `tuck` 多面板情况下，并集外轮廓段数明显少于“面板数×4”，测试断言 `bleed < panels*4`。
- 安全区矩形过滤非正宽高；圆标签 `safeR<=0` 时安全区为空，并警告“半径不足安全区”。
- 真实项目 `labelRect` 的四条出血线误报已消除。

## 8. 二维 / 三维同步

同一份数据链路：

```
StudioProject
→ dielineOf() / facesOf()
→ faceSizes() 与真实 sheet.rects
→ designDocFor() / faceDoc() → Layer[]
→ 二维画布、Viewer3D、SVG / PDF / DXF 导出
```

已验证：

- reliable 结构的 `faceSizes` 与刀模 `rect.face && rect.artwork` 面板尺寸逐项相等（误差 < 1e-6）。
- `labelRect` / `labelRound` 不声明 `back`，3D 不会贴不存在的背面。
- `tuck` 五面、`topBottom` 五面、`pouch` 两面都从真实面板取，不从模板猜。
- 天地盖 3D 墙高和盖顶尺寸直接读 `tb-base` / `tb-lid` 面板。
- 折叠 / 展开切换不重建 `DesignDoc`，设计对象不丢失。
- 真实项目“是谁谁谁”标签 3D：花纹、品牌字、说明字正常显示，无碎图标、无黑块。
- `drawer` / `mailer` / `pouch` 显示不支持说明卡，禁用“盖上 / 自动旋转”，保留“展开成刀板”。

限制：

- 3D 只做视觉预览。盒壁是零厚度面，没有纸厚、折叠补偿、插舌间隙、刀口缩进。
- 目前没有完整包装展开动画；只有盖盒开合。
- 3D 与二维的验证是尺寸同源加真实截图；没有逐像素比对每种结构的贴图。

## 9. 印前检查清单

| 类别 | 检查项 | 状态 | 级别 |
|---|---|---|---|
| 尺寸 | 成品尺寸与 brief 一致 | 已有 | error |
| 尺寸 | 每张展开图尺寸 > 0，并列出名称与 mm | 新增 | error |
| 尺寸 | 出血 3mm、安全区 5mm 与结构下限 | 已有 | warning / error |
| 图像 | 按实际印刷毫米反算有效 PPI，不用文件 DPI 元数据 | 新增 | <150 error，其余 warning |
| 图像 | 图片缺失（无 src 占位） | 新增 | error |
| 图像 | 图片超出面板 0.5mm | 新增 | warning |
| 图像 | PNG alpha 叠在无底色面 | 新增 | error |
| 文字 | 文本框溢出 | 已有 | error |
| 文字 | 文字跨面板 | 新增 | error |
| 文字 | 文字进入边缘 1.2mm 压痕带 | 新增 | warning |
| 文字 | 字号换算后 <1.5mm | 新增 | warning |
| 文字 | 距安全边不足 | 已有 | warning |
| 文字 | 字体缺失 / 环境无法验证 | 升级 | warning |
| 刀模 | 面板 NaN、非正、负面积、越界 | 新增 | error |
| 刀模 | 线段 NaN、零长度、非正交 | 新增 | error |
| 刀模 | 重复裁切 / 压痕 | 新增 | error |
| 刀模 | 裁切与压痕共线重叠 >0.5mm | 新增 | error |
| 刀模 | 压痕不在 ≥2 块面板交界 | 新增 | error |
| 刀模 | 裁切穿过面板内部 | 新增 | error |
| 刀模 | 面板明显重叠 >0.5mm² | 新增 | error |
| 刀模 | 胶舌缺失（tuck / topBottom / drawer） | 新增 | error |
| 刀模 | 出血线不在并集外轮廓 | 修复 | error |
| 工艺 | 普通印刷 / 烫金 / UV / 专色独立图层 | 新增 | pass |
| 颜色 | ICC 未内嵌，需与印厂确认 | 已有 | warning |
| 导出 | error 时弹窗列出前 5 条，取消即中止 | 新增 | 阻断 |

真实项目印前结果：状态“需确认”，3 条建议。

1. 2 处文字进入 5mm 安全区。
2. 4 处文字小于 1.5mm。
3. 未内嵌 ICC，需与印厂确认。

这说明阻断规则没有把真实但可接受的风险直接当成 pass，也没有用假的 pass 掩盖。

## 10. 导出验证

### SVG

- 根节点 `width="…mm"` / `height="…mm"`，`viewBox` 为毫米坐标。
- 包含 `data-sheet` / `data-width-mm` / `data-height-mm` / `data-bleed-mm` / `data-safe-mm`。
- 分层：`layer-print`、`layer-cut`、`layer-crease`、`layer-bleed`、`layer-safe`。
- 圆标签裁切单独 `layer-cut-circles`。
- 保留 `<text>`，文字可编辑。
- 空 src 图片不输出空 `<image href="">`。
- 测试用例：722×406mm / 18,037 bytes / 5 层。

### PDF

- 真实毫米页面，`MediaBox` 由展开图尺寸换算。
- 每张展开图：PRINT 页 + CUT 页 + CREASE 页。
- 烫金 / UV / 专色各单独一页，页面标记 `SPOT FOIL / SPOT UV / SPOT COLOUR`，100% 黑表示工艺区域。
- 白底；每个可印刷面只铺自己面板 + 出血的底色。
- 透明 PNG 通过 `/SMask` 保留 alpha。
- 不做整页截图；印刷内容由矢量图形和嵌入位图组成。
- 元数据包含展开图名称、尺寸、印前状态。

实测：

| 项目 | 结果 |
|---|---|
| 浏览器测试 PDF | 3 页 / CUT 1 / CREASE 1 / 4518 KB |
| 工艺测试 PDF | 印刷 / CUT / CREASE / FOIL 四页；工艺页 100% 黑 |
| 透明图测试 | 243.78×243.78pt（86×86mm，含 3mm 出血）/ `/SMask` 存在 / ≥3 页 |
| 真实项目 PDF | 7,850,247 字节 / 3 页 / 68×68mm / `LunaSol CUT` 1 次 / `LunaSol CREASE` 1 次 |

真实项目 PDF 的 `MediaBox` 为 `192.7559055118110507 × 192.7559055118110507 pt`，换算为 68×68mm。封面预览见 `docs/lunasol-2-stage5-pdf.png`。

### DXF

- `$INSUNITS=4`（毫米）、`$MEASUREMENT=1`（公制）、`$LUNITS=2`（小数）。
- `$EXTMIN` / `$EXTMAX` 写出实际版面毫米范围。
- 图层 `CUT` / `CREASE`。
- 测试用例：43 条 LINE 均在 0..722 / 0..406mm 内。
- 真实项目：`是谁谁谁_刀模_矩形标签.dxf`，368 字节，范围 0..68mm，裁切矩形在 3..65mm，4 条 LINE。

### 文件包

- ZIP 内包含 SVG / DXF / PDF / 导出说明。
- PDF 文件名随印前状态：通过时 `_印刷稿.pdf`，未通过时保留待确认标记。
- 项目名与文件名一致；真实项目导出为 `是谁谁谁_印刷稿.pdf`、`是谁谁谁_刀模_矩形标签.dxf`。

## 11. 实际尺寸样品打样流程

已定义流程，未执行。对象：真实项目“是谁谁谁”62×62mm 瓶身标签，瓶身 62×62×180mm。

1. 下载 `是谁谁谁_印刷稿.pdf`，用 Acrobat 或印厂 RIP 查看第 1 页尺寸，必须为 68×68mm（含 3mm 出血）。
2. 100% 纸样打印，用直尺量页面和裁切矩形；页面 68mm、裁切框 3..65mm。任何缩放都会导致标签贴不上。
3. 用 DXF 给刀模厂，确认 `$INSUNITS=4`、`$EXTMIN/MAX=0..68`、裁切矩形 3..65mm，没有多余压痕。
4. 材料与工艺确认：面材、胶水、是否透明、是否需要白墨、表面处理、印刷方式。
5. 上机打样：先打白样确认尺寸和贴合，再打色样确认颜色。
6. 验收：文字不被裁切、无脏点、套印准确、标签圆周贴合不翘边、颜色与屏幕稿在可接受范围内。
7. 记录：刀模厂回执、纸张克重、印刷色差、贴合照片。

完整流程见 `docs/lunasol-2-stage5-sampling.md`。

## 12. 尚未满足量产条件的事项

以下项目没有验证，不能对外宣称“可直接量产”：

- 未做实体打样。没有纸样、没有刀模实物、没有上机印刷。
- 3D 未考虑纸厚、折叠补偿、插舌间隙、刀口缩进、纸张回弹。
- 天地盖 1.2mm 套合间隙是默认参数，没有用真实纸厚验证。
- `drawer`、`mailer`、`pouch` 的 3D 预览不可靠，已禁用示意模型。
- PDF 文字按 300 PPI 栅格化，不是真正转曲；印厂若要求 PDF/X 或全矢量文字，需要另出。
- 专色页是 100% 黑工艺 mask，不是实际 Pantone / 专色通道；印厂需按自己的专色流程处理。
- PDF 未内嵌 ICC，CMYK 是近似换算；没有数码打样或传统打样色差数据。
- SVG 中远程素材仍是 CloudBase URL；在线可用，离线打开可能缺图。
- DXF 的圆角用短直线逼近，不是 ARC 实体；复杂圆角刀模需要刀模厂重绘。
- 没有做拼版、裁切标记、套准标记、出血外的印刷控制条。
- 普通用户界面还没有“印刷工艺”选择器；数据模型、导出和印前已支持 `foil/uv/spot`，但入口未开放。
- 没有刀模厂回执，没有实际印刷色测量。

## 13. 文件清单

修改：

- `src/engine/structure.ts`
- `src/engine/prepress.ts`
- `src/engine/export.ts`
- `src/engine/design.ts`
- `src/studio/frames.ts`
- `src/studio/types.ts`
- `src/types.ts`
- `src/studio/DesignStage.tsx`
- `src/components/Viewer3D.tsx`
- `src/studio/editor.css`
- `tests/suite.ts`

新增：

- `src/engine/structureAudit.ts`
- `src/studio/viewerSupport.ts`
- `docs/lunasol-2-stage5-structure-prepress.md`
- `docs/lunasol-2-stage5-sampling.md`
- `docs/lunasol-2-stage5-3d.png`
- `docs/lunasol-2-stage5-export.png`
- `docs/lunasol-2-stage5-face.png`
- `docs/lunasol-2-stage5-pdf.png`

## 14. 验证命令与结果

```
npx tsc --noEmit          # 通过
npm test                  # 125 / 125
npm run build             # 通过，dist 已更新
```

浏览器端：

```
file:///…/tests/browser.html
128 项，126 通过
失败 2 项：支付回跳 · hash 路由下的参数识别 / 地址栏参数必须清干净
错误：Cannot set property window of #<Window> which has only a getter
```

这 2 项是测试环境对 `window` 只读属性的限制，与阶段五无关；阶段四基线同样存在。

## 15. 证据

- `docs/lunasol-2-stage5-export.png`：真实工作台导出面板，62×62×180mm、展开 68×68mm、出血 3 / 安全 5mm、印前 3 条建议、导出按钮“毫米页面 · 印刷 / 裁切 / 压痕分页”。
- `docs/lunasol-2-stage5-3d.png`：真实项目 3D 标签，花纹与文字正常，无碎图标。
- `docs/lunasol-2-stage5-pdf.png`：真实印刷 PDF 第 1 页预览。
- `docs/lunasol-2-stage5-face.png`：真实项目平面稿。

## 16. 停止点

阶段五代码修复、测试、真实导出复核到此为止。没有新增盒型，没有更换结构引擎，没有继续做实体打样或量产结构。下一阶段若要做量产结构，应从纸厚、刀模补偿、样品回执和印厂工艺确认开始。
