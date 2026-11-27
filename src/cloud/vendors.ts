/* ============================================================
 * 厂商预设（BYOK · 用户自带 Key）
 * ------------------------------------------------------------
 * LunaSol 不再托管 AI 密钥，改成用户自己填哪家就用哪家。
 * 这里把主流厂商的端点、模型名、图片能力整理成一张表，
 * 用户只需要选厂商 + 粘一个 Key，其余自动填好。
 *
 * 全部走 OpenAI 兼容协议（`/chat/completions`、`/images/generations`），
 * 所以一套代码能吃下几乎所有厂商；不通用的地方用字段单独标注。
 *
 * 新增厂商只需在 VENDORS 里加一项，不用改任何业务代码。
 * ============================================================ */

export interface Vendor {
  id: string;
  /** 显示名 */
  name: string;
  /** 一句话说明，帮用户认出这是哪家 */
  note: string;
  /** OpenAI 兼容 base URL（不含 /chat/completions） */
  baseUrl: string;
  /** 默认文本模型 */
  textModel: string;
  /** 默认生图模型；空字符串 = 该厂商本预设不提供生图 */
  imageModel: string;
  /** 申请 Key 的页面（打开新标签） */
  keyUrl: string;
  /** 该厂商的特殊约束 */
  hints?: {
    /** 生图只接受这几个尺寸 */
    imageSizes?: string[];
    /** Key 前缀，用于前端粗校验，避免粘错东西 */
    keyPrefix?: string;
    /** 额外说明 */
    note?: string;
  };
}

export const VENDORS: Vendor[] = [
  {
    id: 'ark',
    name: '火山方舟（豆包）',
    note: 'Seedream 生图 + DeepSeek 对话，国内直连速度快',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    textModel: 'deepseek-v4-1-flash-261017',
    imageModel: 'doubao-seedream-5-0-flash',
    keyUrl: 'https://console.volcengine.com/ark',
    hints: { note: '模型名需与你控制台里「开通的推理接入点 ID」一致；生图需要在方舟里开通 Seedream。' },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    note: '对话性价比高，不支持生图',
    baseUrl: 'https://api.deepseek.com/v1',
    textModel: 'deepseek-chat',
    imageModel: '',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    hints: { keyPrefix: 'sk-', note: 'DeepSeek 只提供文本，生图请另外选一家（可在下方「生图厂商」单独配置）。' },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    note: 'GPT 对话 + GPT Image 生图',
    baseUrl: 'https://api.openai.com/v1',
    textModel: 'gpt-4o-mini',
    imageModel: 'gpt-image-1',
    keyUrl: 'https://platform.openai.com/api-keys',
    hints: {
      keyPrefix: 'sk-',
      imageSizes: ['1024x1024', '1536x1024', '1024x1536'],
      note: '国内需自备网络代理，图片只接受三种尺寸。',
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic（Claude）',
    note: '对话能力强，不支持生图',
    baseUrl: 'https://api.anthropic.com/v1',
    textModel: 'claude-sonnet-4-20250514',
    imageModel: '',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    hints: { keyPrefix: 'sk-ant-', note: 'Anthropic 协议与 OpenAI 略有差异，已在本项目适配层兼容。' },
  },
  {
    id: 'google',
    name: 'Google Gemini',
    note: '对话 + Imagen 生图',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    textModel: 'gemini-2.0-flash',
    imageModel: 'imagen-3.0-generate-002',
    keyUrl: 'https://aistudio.google.com/apikey',
    hints: { note: '用的是 Gemini 的 OpenAI 兼容端点；生图需在 AI Studio 里开通。' },
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    note: '长文本见长，国内可用',
    baseUrl: 'https://api.moonshot.cn/v1',
    textModel: 'moonshot-v1-8k',
    imageModel: '',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    hints: { keyPrefix: 'sk-' },
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    note: 'GLM 对话 + CogView 生图',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    textModel: 'glm-4-flash',
    imageModel: 'cogview-3-flash',
    keyUrl: 'https://bigmodel.cn/usercenter/apikeys',
    hints: {},
  },
  {
    id: 'dashscope',
    name: '阿里通义（DashScope）',
    note: 'Qwen 对话 + 万相生图',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    textModel: 'qwen-plus',
    imageModel: 'wanx-v1',
    keyUrl: 'https://bailian.console.aliyun.com/',
    hints: { keyPrefix: 'sk-' },
  },
  {
    id: 'custom',
    name: '自定义（其他兼容 OpenAI 的接口）',
    note: '任何支持 /chat/completions 的服务都能填',
    baseUrl: '',
    textModel: '',
    imageModel: '',
    keyUrl: '',
    hints: { note: '把 base URL 填到以 /v1 结尾（或厂商要求的版本段），系统会自动拼 /chat/completions。' },
  },
];

export function findVendor(id: string): Vendor | undefined {
  return VENDORS.find((v) => v.id === id);
}

/** 用户选厂商后，自动填好端点与默认模型。
 *  已经填过的自定义值不覆盖，避免用户手改后被重置。 */
export function applyVendor(v: Vendor, prev?: { baseUrl: string; textModel: string; imageModel: string }) {
  return {
    baseUrl: prev?.baseUrl?.trim() ? prev.baseUrl : v.baseUrl,
    textModel: prev?.textModel?.trim() ? prev.textModel : v.textModel,
    imageModel: prev?.imageModel?.trim() ? prev.imageModel : v.imageModel,
  };
}
