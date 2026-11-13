# LunaSol 项目交接文档

## 一、项目基本信息

### 1.1 线上地址
- 生产环境：https://luna.solyoung.top/
- 部署方式：GitHub Pages 静态托管
- 部署后必须带 `?fresh=` 参数刷新（旧 chunk 404 白屏是已知现象）

### 1.2 仓库信息
- GitHub 仓库：https://github.com/SolYoung-Ai/LuanSol
- 本地路径：`/Users/songyang/WorkBuddy/2026-11-05-12-49-30/LuanSol`
- 分支：main
- 技术栈：Vite + React + TypeScript + Tailwind CSS

### 1.3 域名与 DNS
- 域名：solyoung.top
- 子域名：luna.solyoung.top
- DNS 解析：指向 GitHub Pages
- 域名白名单：CloudBase 已配置 `luna.solyoung.top`

---

## 二、后端服务（腾讯云 CloudBase）

### 2.1 环境信息
- CloudBase 环境 ID：见 `src/cloud/config.ts`
- 数据库：PostgreSQL（CloudBase 内置）
- 云函数：CloudBase SCF（Serverless Cloud Function）
- 域名：cloud.tencent.com/product/tcb

### 2.2 数据库表结构

#### `lunasol_subscriptions`（订阅与积分表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键，用户 uid |
| owner_id | text | 用户 uid |
| plan | text | 套餐类型（free/pro） |
| status | text | 状态（active/expired） |
| quota_total | int | 总积分 |
| quota_used | int | 已用积分 |
| bonus_credits | int | 赠送积分 |
| period_end | timestamptz | 套餐到期时间 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

#### `lunasol_user_profiles`（用户资料表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键，用户 uid |
| owner_id | text | 用户 uid |
| avatar_url | text | 头像 URL |
| birthday | text | 生日 |
| bio | text | 个人简介 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

#### `lunasol_credit_logs`（积分变动记录表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 |
| owner_id | text | 用户 uid |
| change_type | text | 变动类型（earn/spend/refund） |
| amount | int | 变动数量 |
| balance_after | int | 变动后余额 |
| reason | text | 变动原因 |
| task_type | text | 任务类型 |
| created_at | timestamptz | 创建时间 |

#### `lunasol_projects`（项目表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 |
| owner_id | text | 用户 uid |
| title | text | 项目标题 |
| payload | jsonb | 项目数据（图层、设计等） |
| updated_at | timestamptz | 更新时间 |

#### `lunasol_checkin_logs`（签到表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键 |
| user_id | text | 用户 uid |
| checkin_date | text | 签到日期 |
| streak | int | 连续签到天数 |
| bonus | int | 奖励积分 |
| created_at | timestamptz | 创建时间 |

### 2.3 安全策略
- 所有表都启用了 RLS（Row Level Security）
- 普通用户只能读写自己的数据（owner_id = auth.uid()）
- 积分等敏感字段不允许用户直接 UPDATE，必须通过云函数操作
- AI 密钥只存云函数环境变量，前端不暴露

### 2.4 云函数
- 用途：AI 图像生成代理、积分扣减、签到等
- 部署方式：通过 CloudBase MCP 工具或 CLI
- 注意：云函数里不能随便引入 @cloudbase/node-sdk，否则可能因依赖未预装导致启动失败

---

## 三、前端架构

### 3.1 目录结构
```
src/
├── cloud/              # 云端相关代码
│   ├── auth.tsx        # 认证（登录、注册、用户资料）
│   ├── config.ts       # CloudBase 配置
│   ├── sdk.ts          # 数据库 SDK 封装
│   ├── subscription.tsx # 订阅与积分
│   ├── projects.ts      # 项目云同步
│   └── profile.tsx      # 用户资料云端同步
├── pages/              # 页面
│   ├── account.tsx     # 个人资料页
│   ├── subscribe.tsx   # 订阅与积分页
│   ├── studio.tsx      # 设计工作台（V7）
│   └── ...
├── App.tsx             # 主应用
├── ui.tsx              # 导航栏、通用 UI
└── main.tsx            # 入口
```

### 3.2 关键技术决策
- Hash 路由 + base: './'（适配 GitHub Pages 子路径）
- 状态管理：React Context + useReducer
- 样式：Tailwind CSS
- 图标：lucide-react

---

## 四、部署流程

### 4.1 本地开发
```bash
cd /Users/songyang/WorkBuddy/2026-11-05-12-49-30/LuanSol
npm install
npm run dev
```

### 4.2 构建与部署
```bash
npm run build
git add .
git commit -m "更新说明"
git push origin main
```

GitHub Pages 会自动部署，约 1-2 分钟生效。

### 4.3 部署后验证
- 访问 `https://luna.solyoung.top/?fresh=1`
- 如果白屏，等 1 分钟再试（GitHub Pages 部署延迟）
- 如果 JS chunk 404，用 `?fresh=1` 强制刷新

---

## 五、已完成的功能

### 5.1 认证系统
- 邮箱注册/登录
- 邮箱验证
- 忘记密码
- 修改密码
- 绑定邮箱/手机

### 5.2 用户资料
- 头像上传（存 localStorage，**未完成云端同步**）
- 昵称修改
- 生日设置
- 个人简介

### 5.3 积分系统
- 注册赠送积分
- 每日签到送积分
- AI 生图扣积分
- 积分明细记录
- 积分充值（模拟）

### 5.4 设计工作台（V7）
- 三栏布局：图层列表 + 画布 + 属性面板
- 多面包装设计（正面/背面/侧面等）
- AI 对话式需求提取
- 图像生成与素材组装
- 导出 PDF / PNG
- 3D 预览

### 5.5 其他页面
- 首页
- Luna AI 对话
- 复刻（主图 / 详情页 / 海报 / 视频封面 / 包装 / 周边）
- 帮助与反馈
- 账号安全
- 管理员后台

---

## 六、未解决的问题（重点！）

### 6.1 严重问题：跨浏览器数据不同步

**现象：**
- 同一个账号在谷歌浏览器登录显示 304 积分，豆包浏览器登录显示 104 积分
- 头像在一个浏览器改了，另一个浏览器看不到
- 换个浏览器/设备，数据就"没了"

**已做的修复：**
1. 新建 `lunasol_user_profiles` 表，存头像和生日到云端
2. 修复了插入数据时缺少 id 字段的问题
3. 修复了 `updateUserBasicInfo` 返回 undefined 导致的 `.error` 读取错误
4. 给所有数据库查询都加了空值保护

**根本原因：**
- 谷歌浏览器缓存了旧的 localStorage 数据（304 积分是旧的本地数据，数据库里只有 104）
- 头像之前存在 localStorage，按浏览器隔离，不同步
- 新的云端同步代码刚部署，可能还没完全生效

**待解决：**
- [ ] 需要用户清除谷歌浏览器的站点数据，验证是否同步
- [ ] 需要确认手机端修改头像后，桌面端能否同步看到
- [ ] 需要验证积分在所有浏览器都显示一致（应该是数据库里的真实值）

### 6.2 设计工作台（V7）未完成

**现象：**
- 用户反馈"编辑台乱七八糟你都没有给我做好"
- 很多功能只是搭了框架，没有真正实现

**待完成的功能：**
- [ ] 图层系统：真正的图层拖拽、排序、隐藏/显示、锁定
- [ ] 局部 AI 修改：在画布上框选区域，只改那个区域
- [ ] 双向同步：画布上的修改实时同步到图层列表
- [ ] 撤销/重做：完整的历史记录栈
- [ ] 多项目管理：项目列表、重命名、删除、复制
- [ ] 云同步：项目自动保存到云端，换设备能打开
- [ ] 素材库：用户自己上传的图片、logo 等素材管理
- [ ] 模板系统：预设的包装模板（咖啡袋、纸盒、标签等）
- [ ] 导出：真正的高清 PDF 导出，带出血位
- [ ] 3D 预览：真正的 3D 包装效果预览，不是静态图

### 6.3 积分系统问题

**现象：**
- 谷歌浏览器显示 304 积分，数据库里只有 104
- 之前有"前端只扣 UI 不写数据库"的 bug（已修复）

**待解决：**
- [ ] 验证所有浏览器的积分都从数据库加载，不读 localStorage
- [ ] 积分变动记录是否正确写入 `lunasol_credit_logs`
- [ ] 签到是否正确写入数据库，不是只存本地

### 6.4 头像上传问题

**现象：**
- 头像上传后存在 localStorage，不同步
- 新建了 `lunasol_user_profiles` 表，但可能还没完全生效

**待解决：**
- [ ] 头像上传到云端存储（CloudBase Storage），不是 base64 存数据库
- [ ] 所有地方都从云端读取头像，不读 localStorage
- [ ] 验证手机端改头像，桌面端能同步看到

---

## 七、已知坑与注意事项

### 7.1 部署相关
- GitHub Pages 部署有延迟，刚 push 完要等 1-2 分钟
- 部署后旧的 JS chunk 会 404，用 `?fresh=1` 强制刷新
- hash 路由 + base: './' 是硬约束，不能改

### 7.2 CloudBase 相关
- 数据库查询可能返回 undefined，读取 `.error` 或 `.data` 前必须做空值保护
- text 类型主键且无默认值时，插入必须显式提供 id，否则会静默失败
- RLS 策略：普通用户只能读写自己的数据，敏感字段不能直接 UPDATE
- 云函数不能随便引入 @cloudbase/node-sdk，否则启动失败

### 7.3 前端相关
- localStorage 是按浏览器隔离的，不能用来存需要跨设备同步的数据
- 每日签到类逻辑用 `toISOString()` 会因 UTC 时区导致凌晨跨天重复触发，要用本地日期
- 轮播里非当前页的图片用 `loading="lazy"` 会永不加载，要改 `eager`

---

## 八、用户偏好与硬约束

### 8.1 用户偏好
- 不要假数据/假按钮/假云同步/假登录/假 AI/假支付
- 会员页不展示调用成本
- 账号页精简
- 不为好看牺牲功能
- 严肃对待云端同步问题

### 8.2 硬约束
- Hash 路由 + base: './'
- AI 密钥只存云函数环境变量，前端不暴露
- CloudBase 域名白名单包含 `luna.solyoung.top`

---

## 九、关键文件路径

| 文件 | 用途 |
|------|------|
| `src/cloud/config.ts` | CloudBase 环境配置 |
| `src/cloud/auth.tsx` | 认证逻辑 |
| `src/cloud/subscription.tsx` | 订阅与积分 |
| `src/cloud/projects.ts` | 项目云同步 |
| `src/cloud/profile.tsx` | 用户资料云端同步 |
| `src/pages/account.tsx` | 个人资料页 |
| `src/pages/subscribe.tsx` | 订阅与积分页 |
| `src/pages/studio.tsx` | 设计工作台（V7） |
| `src/App.tsx` | 主应用 |
| `src/ui.tsx` | 导航栏、通用 UI |

---

## 十、交接检查清单

### 10.1 接手前必须验证
- [ ] 能登录 GitHub 仓库
- [ ] 能访问腾讯云 CloudBase 控制台
- [ ] 能本地 `npm run dev` 跑起来
- [ ] 能 `npm run build` 构建成功
- [ ] push 后 GitHub Pages 能自动部署

### 10.2 接手后必须先做
- [ ] 用两个不同浏览器登录同一账号，验证积分和头像是否一致
- [ ] 手机端改头像，桌面端刷新看是否同步
- [ ] 点保存资料，看是否还报 `Cannot read properties of undefined` 错误
- [ ] 设计工作台打开后，确认图层系统是否真正可用

### 10.3 优先级最高的问题
1. **跨浏览器数据同步**（用户最不满，必须彻底解决）
2. **设计工作台功能完善**（用户说"乱七八糟没做好"）
3. **头像真正云端同步**（现在可能还存在 localStorage 残留）

---

**交接人：** Doubao
**交接日期：** 2026-11-07
**最后更新：** 部署了空值保护修复，等待用户验证

---

## 十一、前端实现约定（原 README 移入，2026-11-12）

README 改成对外介绍后，这些「接手才需要知道」的内容挪到这里。

### 11.1 登录配置：控制台 ↔ 前端镜像

网站登录是**自建 React 弹窗**（`src/cloud/LoginDialog.tsx`），不是 CloudBase 托管默认登录页。
控制台「身份认证 → 登录页」里的品牌化与注册模式配置**不会自动显示到网站**，
CloudBase 也没给前端提供只读该配置的 API，所以把开关手工镜像在 `src/cloud/loginConfig.ts`。

| 控制台项 | 当前值 | 前端落点 |
| --- | --- | --- |
| 账户密码登录 | 开 | 弹窗「密码登录」tab |
| 短信验证码 | 关 | 全链路禁用：`emailTarget()` 只认邮箱、`auth.startLink(phone)` 直接拒绝、账户页无「绑定手机」入口 |
| 邮箱登录（验证码） | 开 | 弹窗「邮箱验证码」tab |
| 注册模式 | 自动注册并登录 | 不展示独立注册 tab；收为「设置密码 / 注册账号」次级入口，云端返回「账号不存在」时自动展开 |
| 企业名称 | LunaSol | 弹窗品牌头（Logo + 名称 + 标语），样式 `.login-brand` |

> ⚠️ 改控制台开关后必须同步改 `loginConfig.ts`，否则会出现「界面有入口、服务端已关闭」的死按钮。
> 短信验证码单次约 0.05 元、邮箱约 0.0001 元，因此主动关闭；任何路径都不得再构造 `phone` 参数。
> 回归保护见 `tests/suite.ts` 的「登录配置 · 短信已关闭」用例。

### 11.2 账户信息是唯一入口

`/account` 合并了原先的「个人资料」与「账号安全」，头像菜单里只保留**账户信息**一项；
`/security` 是兼容旧链接的别名，直接渲染同一页（`src/pages/security.tsx` 只做重导出）。

页面按 iOS 分组设置组织：身份卡 → 个人资料（头像 / 称呼 / 生日）→ 登录与安全
（登录账号只读、改密、换绑邮箱）→ 云端项目 → 退出登录。点击行才展开编辑区，不铺一屏输入框。
改密仍是「注册邮箱验证码 + 新密码」的强制二次验证。

视觉统一走 `src/v4.css` 的液态玻璃变量（`--v4-glass-*`）：半透明底 + 背景模糊 + 顶部内高光 + 远距柔影。
Luna 对话页的桌面侧栏是浮起的圆角玻璃卡，收起后留一列图标入口；
**所有 Luna 新样式限定在 `min-width: 861px`，手机端抽屉保持原样**。

### 11.3 目录

```
src/
  engine/      brief / structure / design / prepress / export / llm / utils
  components/  DesignView / DielineView / ProductMockup / Viewer3D / SideNav
  editor/      在线编辑器（画布、图层面板、属性面板、素材库、左栏工具）
  workflow/    /new 四步流程（入口 → 需求 → 方案 → 编辑器）
  pages/       start / luna / workspace（包装设计）/ replicate（复刻记录）/ replicate-list / account / subscribe / help / settings
  replicate/   复刻类型目录（KINDS / RATIOS / MAX_IMAGES），列表页与工作区共用
  cloud/       鉴权 / 订阅与额度 / 云同步 / 支付 / 模型目录 / 登录配置
  store.tsx    全局项目仓库（IndexedDB）
  App.tsx      hash 路由（无需服务端 rewrite）
tests/         suite.ts（Node + 浏览器共用断言）/ browser.html / e2e.html
cloudfunctions/lunasol-ai/   CloudBase HTTP 云函数（AI 代理 + 支付 + webhook）
```

### 11.4 浏览器测试

```bash
npm test                                      # 生成 tests/suite.browser.js
python3 -m http.server 8765 --bind 127.0.0.1
# 打开 http://127.0.0.1:8765/tests/browser.html 与 /tests/e2e.html
# 或用无头 Chrome：--headless=new --dump-dom <url>
```
