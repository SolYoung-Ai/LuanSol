# LunaSol · AI 智能包装设计平台

> 让每个人都能轻松完成专业包装设计。
> **LunaSol AI Packaging Studio** — 为没有设计经验的人打造的 AI 包装设计工作流。

线上地址：<https://solyoung-ai.github.io/LuanSol/>

仓库名按指令使用 `LuanSol`；产品品牌名为 `LunaSol`。

---

## 它不是一个在线设计软件

传统工具（Photoshop / Illustrator / 专业包装编辑器）要求用户自己懂盒型、刀模、排版、出血、CMYK、字体转曲。
LunaSol 把这些全部放进后台：

```
输入尺寸 → 描述需求 → AI 理解 → 自动设计 → 选择方案 → 对话修改
        → 3D 预览 → 印前检查 → 下载印刷文件
```

用户只需要回答「我想做什么包装、多大、叫什么、喜欢什么风格」。

## 已实现的核心能力

| 模块 | 实现 |
| --- | --- |
| 需求理解 Agent | 中文自然语言解析（mm / cm / inch、品牌、品类、风格、配色、图案、规格），逐步对话、每次只问一个问题；配置模型后由真实 LLM 增强 |
| 包装结构 Agent | 6 种结构的**真实几何展开**：插舌盒、天地盖、抽屉盒、自立袋、矩形标签、圆形标签。裁切线 = 面片并集外露边，压痕线 = 相邻面片公共边；含 3mm 出血、5mm 安全区、粘合位 |
| 创意设计 Agent | 三套明显不同的方向（高级极简 / 创意插画 / 品牌商业），配色、字体、构图与理念说明 |
| 文字排版 Agent | 文字分类、视觉层级、字号自适应、自动换行、溢出检测、不同包装面不同排版策略；不擅自删减用户文字 |
| 设计执行 Agent | 双层引擎：程序化原创矢量插画 + 可编辑文字/图形图层。**不把整张图片当设计稿** |
| 对话修改 Agent | 输出局部修改补丁（改色、字号、字体、局部文案、插画方向、隐藏文字），锁定图层不被改动，保留历史版本 |
| 3D 预览 Agent | Three.js 多部件结构模型，每个面独立贴图；插舌盒可开盖、天地盖可开合、抽屉可抽拉、标签贴瓶身曲面；材质 / 背景 / 光照 / 自动旋转 / 效果图导出 |
| 印前检查 Agent | 尺寸、展开尺寸、出血、安全区、文字裁切、占位文字、图片有效 DPI、颜色 CMYK 近似值、字体可用性、刀模完整性；报告用普通人能懂的话 |
| 文件输出 Agent | 毫米级 PDF（逐图层绘制 + 独立刀模页）、可编辑 SVG、DXF 刀模、300DPI PNG、JPG 效果图、ZIP 文件包；**PDF 导出做真实字节级预检** |

另有：首页、灵感库（12 个原创虚构品牌方向）、结构库、我的作品、项目详情、个人设置、AI 模型配置中心，共 14 个页面；项目用 IndexedDB（localStorage 兜底）本地保存，支持导入导出、复制、删除、历史版本恢复。

## 快速开始

```bash
npm install
npm run dev        # 本地开发
npm run build      # 类型检查 + 生产构建，输出 dist/
npm test           # 13 项引擎测试（同时生成浏览器测试包）
```

浏览器测试（需本机 Chrome）：

```bash
npm test                                      # 生成 tests/suite.browser.js
python3 -m http.server 8765 --bind 127.0.0.1
# 打开 http://127.0.0.1:8765/tests/browser.html 与 /tests/e2e.html
# 或用无头 Chrome：--headless=new --dump-dom <url>
```

## 没有 API Key 也能用

未配置模型时，需求解析与视觉素材由**内置确定性引擎**完成，界面明确标注「内置解析 / 内置基础引擎」，不会把模拟结果伪装成 AI 生成。可手动创建项目、生成方案、编辑文字、上传图片、保存恢复、导出基础印刷文件。

配置自己的 OpenAI 兼容接口后启用真实 AI：需求深度理解、对话修改补丁、真实图像模型生成原创插画素材。详见 [docs/AI_SETUP.md](docs/AI_SETUP.md)。

## 目录

```
src/
  engine/      brief / structure / design / modify / prepress / export / llm / utils
  components/  DesignView / DielineView / ProductMockup / Viewer3D
  pages/       home / flow / library / output / settings
  store.tsx    全局项目仓库（IndexedDB）
  App.tsx      hash 路由（无需服务端 rewrite）
tests/         suite.ts（Node + 浏览器共用断言）/ browser.html / e2e.html
docs/          AI_SETUP.md / DEPLOY.md / TEST_REPORT.md
.github/       GitHub Pages 自动构建部署工作流
```

## 明确的边界（重要）

- **不提供 PDF/X-4**：没有经过真实标准符合性验证的工具链，绝不把普通 PDF 标注成 PDF/X-4。
- **CMYK 为近似换算，未内嵌 ICC**：屏幕色与印刷色存在差异，必须打样确认。
- **PDF 中的中文文字按图层以设定 DPI 栅格化嵌入**（等效转曲，避免印厂缺字）；SVG 保留完全可编辑的矢量文字。PDF 的图形与刀模为矢量，不是整张截图。
- **食品 / 化妆品等标签的法规信息需用户自行核实**：系统只检查信息完整性与排版，占位文字会被明确标红提示，不宣称合规。
- **结构校验由几何计算完成**，不由模型判断能否生产；极端比例会给出警告。
- **无自有后端**：项目数据保存在用户浏览器，跨设备用 JSON 导入导出；不依赖虚构服务。

更多交付说明见 [docs/TEST_REPORT.md](docs/TEST_REPORT.md)，部署见 [docs/DEPLOY.md](docs/DEPLOY.md)。
