# LunaSol 2.0 · 阶段二：二维矢量工作台

分支 `feature/lunasol-2-design-foundation`，基线为阶段一提交 `c79ccaa`。
本阶段没有新建编辑器，也没有替换 `/studio`：在现有 DesignStage 三栏工作台上，把画布升级为真正的 SVG 矢量编辑区。

## 一、实现结构

新增文件：

| 文件 | 职责 |
| --- | --- |
| `src/studio/EditCanvas.tsx` | SVG 画布：毫米 viewBox、渲染、命中选择、拖动、八向缩放、旋转、框选、平移、文字就地编辑 |
| `src/studio/Inspector.tsx` | 右侧属性面板：按文字 / 图片 / 形状 / 多选 / 空选动态切换 |
| `src/studio/LayerList.tsx` | 图层列表：类型图标、名称、可见、锁定、选中、排序、组合、复制、删除 |
| `src/studio/vec.ts` | 几何内核：旋转角点、并集框、把手、命中、缩放、屏幕→毫米、溢出检测、组合展开 |
| `src/studio/history.ts` | 历史内核：整稿快照、40 条上限、900ms 同键合并、undo / redo / sync |

修改文件：

- `types.ts`：`DesignEl` 增加 shape / radius / stroke / strokeWidth / letterSpacing / lineHeight / fit / crop / naturalW / naturalH / groupId；新增 `MAX_ELS_PER_FACE = 60`。
- `frames.ts`：`elTextMetrics` 改用元素自身字距与行高；`elLocalRect` 支持文字显式文本框高度；`elToLayer` / `layerToEl` 回填形状、描边、圆角、原始尺寸、适配方式。
- `design.ts`：新增 `patchEls`、`setElsBox`、`orderEls`、`duplicateEls`、`removeEls`、`groupEls`、`ungroupEls`、`addShape`、`addImage`、`imageHeightPct`。
- `DesignStage.tsx`：`sel` 改为 `selIds`，接入工具状态、历史、快捷键、上传替换、图层页、属性/顾问双页、底部工具栏。
- `editor.css`：追加画布、图层、属性面板、工具条样式。
- `tests/suite.ts`：新增 13 条几何 / 历史 / 批量操作测试。

## 二、坐标与交互

- 画布 `viewBox="0 0 面板宽mm 面板高mm"`，设计坐标直接使用毫米；百分比只在读写设计数据时通过 `pctToMm` / `mmRectToPct` 转换。
- 屏幕→毫米已吸收 CSS 尺寸、画布平移、页面滚动、设备像素比：`clientToMm` 使用 `getBoundingClientRect` 反算比例，不把屏幕坐标写入设计文档。
- 选择：点击 / Shift 多选 / 空白拖拽框选 / 图层行选中；组合按组合框整体选中，展开后可选成员。
- 移动：仅在超过阈值后进入拖动，拖动期间只更新本地预览，松手提交一次历史。
- 缩放：八向把手按毫米计算；单图拖动角点时保持等比。旋转：橙点把手按对象中心计算，角度归一化到 -180°..180°。
- 平移：手型工具 / 空格 / 中键只改视图偏移；选择工具下不会误移设计对象。已实测平移后对象 `transform` 不变、仅屏幕位置随视图移动。
- 快捷键：Delete / Backspace、Cmd/Ctrl+C/V、Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z、Cmd/Ctrl+A、方向键 1%、Shift+方向键 10%、Esc、V/H。
- 文字：双击进入 `textarea` 就地编辑，编辑态与拖动分离；文字换行复用 `elTextMetrics().lines`，与导出同一套断行；字体缺失用 `document.fonts.check` 检测并提示，不静默替换。
- 图片：上传走 `compressImageForUpload`（最长边 1400px、最大 700KB），校验格式与大小；保存为 data URL 持久化引用，不是临时 Blob；支持替换、删除、contain / cover、裁切窗口、等比恢复高度。
- 图层：列表倒序显示顶层在上；可见 / 锁定即时生效；上移、下移、置顶、置底调用 `orderEls` 归一 zIndex，SVG、刀板、3D、导出共用同一顺序。

## 三、撤销 / 重做

- 快照粒度是整份 `StudioDesign`（所有面），不是单对象属性。
- 一次完整提交一条历史；拖动、缩放、旋转只在松手时提交；同一字段连续输入 900ms 内合并。
- 上限 40 条，旧快照出栈；图片 Base64 在同一份设计对象内共享引用，不在每条历史里复制。
- 切换正面 / 背面只清空选中与编辑态，不清历史；撤销恢复所有受影响属性并保留 redo。
- 保存项目不触碰历史栈；重载页面后历史从当前稿重新开始（见遗留问题）。

## 四、真实验收记录

测试环境：本地 `vite preview` 4173，应用内浏览器 669×842，临时项目「阶段二画布测试」（茶叶 / 纸盒 / 120×60×180）。

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 新建文字并移动 | 通过 | 新增文字后拖动 +50/+36px；设计坐标同步更新 |
| 双击修改文字 + 重新加载 | 通过 | 双击进入 textarea，改为「可编辑文字」；刷新项目后仍在原位 |
| 上传透明 PNG 并拖动 | 通过 | 600×300 透明 PNG 上传为 48×36mm；拖动 +40/+34px；刷新后 data URL 仍在 |
| 图片等比例缩放 | 通过 | 右下角拖动后 48×36 → 60×45mm，宽高比保持 1.333 |
| 图片旋转 | 通过 | 旋转把手拖到 `rotate(62.58 …)`，画布与刀板均按旋转渲染 |
| 图层隐藏 / 显示 | 通过 | 隐藏后画布 image 节点 0，再点恢复 1 |
| 图层锁定 / 解锁 | 通过 | 锁定后拖动不位移，解锁后恢复可拖 |
| 图层顺序改变 | 通过 | 文字图层置顶后 SVG 文档顺序由中间移到最末（最上层） |
| 撤销 / 重做 | 通过 | 拖动后 Cmd+Z 回原位，Cmd+Shift+Z 回拖动位置，按钮状态同步 |
| 正反面不串面 | 通过 | 背面 2 个文字、0 个图片；正面 5 个文字、1 个图片、7 个图层 |
| 刀板视图位置 | 通过 | 刀板展开图左侧面板可见旋转后的橙图与「可编辑文字」，镜像面位置对应 |
| 导出 SVG 独立矢量 | 通过 | 导出文件 14 个 `<text>`、1 个 `<image>`（60.5×45.4mm），文字仍可编辑，无整面截图 |
| 平移不误移对象 | 通过 | 平移后 `.st-svg-pan` 位移，对象设计 transform 不变 |
| 复制粘贴 / 删除 | 通过 | Cmd+C/V 后图片数 1→2；Delete 后 0；Cmd+Z 恢复 1 |

## 五、构建与测试

- `npm run typecheck`：通过。
- `npm test`：92/92 通过（阶段一 79 条 + 阶段二 13 条）。
- `npm run build`：成功，`✓ built in 2.81s`。

## 六、本轮修掉的两个真实缺陷

1. 文字双击不进入编辑：`pointerdown` 上 `PointerEvent.detail` 不可靠，改为在元素组上监听 `dblclick` 并显式进入编辑。
2. 图片无法在画布点选：`<image>` 设了 `pointer-events: none`，点击穿透到底层背景矩形。改为 `auto` 后命中正常，拖动 / 缩放 / 旋转均可从画布发起。

## 七、遗留问题

- 历史栈只在内存中，刷新页面后从当前稿重新计数；云端保存不会破坏会话内 undo/redo，但跨会话不保留。
- 字体目前提供四套系统字体栈，未开放自定义字体文件上传；缺失字体只提示，不做替换。
- 图片裁切是比例窗口 + 滑块，尚未做画布上的自由裁切框。
- 组合支持整体移动、缩放、旋转、层级与取消组合；组合内部逐对象旋转后的并集框按轴对齐处理。
- 直线对象命中区较窄（0.5mm），移动端精确点选依赖放大。
- 移动端（<700px）属性面板位于「Luna AI → 属性」子页；桌面宽度下右侧常驻。
- 未进入 AI 图层拆分开发（按要求在本阶段停止）。
