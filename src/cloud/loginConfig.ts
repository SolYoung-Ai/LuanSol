/* ============================================================
 * CloudBase 控制台「身份认证 → 登录页」配置的前端镜像
 * ------------------------------------------------------------
 * 控制台地址（环境 solyoung-d4gpp1f7s4e075f6d）：
 *   https://tcb.cloud.tencent.com/dev?envId=solyoung-d4gpp1f7s4e075f6d#/identity/land-page
 *
 * ⚠️ 为什么必须有这个文件（接手前请先读懂）：
 *  1. 控制台那一页配置的是 CloudBase **托管默认登录页**。它只在调用
 *     auth.toDefaultLoginPage()、HTTP 网关开启身份认证、或 OAuth/SSO 流程时出现。
 *  2. 本站登录 UI 是自建 React 弹窗（src/cloud/LoginDialog.tsx），全项目没有
 *     任何 toDefaultLoginPage 调用，所以控制台的品牌化配置**不会**自动显示到网站上。
 *  3. CloudBase 没有提供「前端只读登录页配置」的公开 API；管理侧读取配置需要
 *     密钥，而密钥绝不能进前端。
 *  → 因此把控制台开关手工镜像成下面的常量，由 LoginDialog / auth 统一读取。
 *
 * 🔁 同步规则：以后在控制台改了登录方式、注册模式或企业名称，
 *    必须同步修改本文件，否则会出现「界面有入口、服务端已关闭」的死按钮，
 *    或「短信已关、界面还在引导发短信」的误导。
 *
 * 2026-11-09 控制台快照（PC/H5 标签页）：
 *   账户密码登录        ✅ 开启
 *   短信验证码          ❌ 关闭   ← 用户主动关闭，单次约 0.05 元，比邮箱贵约 500 倍
 *   邮箱登录（验证码）  ✅ 开启
 *   开启注册            ✅ 开启
 *   注册模式            自动注册并登录（不展示独立注册入口）
 *   采集用户头像        ✅ 开启（SDK / 托管页行为，自建弹窗无需处理）
 *   品牌化 · 企业名称   LunaSol
 * ============================================================ */

export const LOGIN_CONFIG = {
  /** 品牌化配置。Logo 用站点自己的资源，按钮沿用站点主色，不照抄控制台预览的平台蓝紫色。 */
  brand: {
    name: 'LunaSol',
    tagline: '人人都能成为设计师',
    logo: '/logo.png',
  },

  /** 登录方式选择，逐项对应控制台开关。 */
  methods: {
    password: true,
    sms: false,
    emailCode: true,
    /** 社交登录 · Google Web 端（控制台「Google Web 端」已启用） */
    google: true,
    /** 微信开放平台登录：控制台未启用，按钮不出现 */
    wechat: false,
  },

  /** 安全设置 → 注册模式。auto = 自动注册并登录，不展示独立注册入口。 */
  register: {
    enabled: true,
    mode: 'auto' as const,
  },

  /** 短信已关闭：所有验证码 / 注册场景只接受邮箱，绝不构造 phone 参数。 */
  emailOnly: true,

  /** 控制台提示「保存后预计 10 分钟内生效」只对托管页有效，这里仅作记录。 */
  consolePropagationNote: '托管页约 10 分钟；自建弹窗随前端发版即时生效',
} as const;

/** 短信关闭时给用户的统一解释，避免各处写出不同口径。 */
export const NO_SMS_HINT = '本站已关闭短信验证码，请使用邮箱接收验证码';
export const NO_SMS_HINT_EN = 'SMS codes are disabled on this site — please receive the code by email';
