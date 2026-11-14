/* ============================================================
 * 复刻设计 · 模版目录（唯一来源）
 * ------------------------------------------------------------
 * 「模版」不是大模型，而是**一套调好的复刻预设**：
 *   一张参考图（版式/风格基准） + 类型 + 尺寸 + 复刻度 + 一段补充要求。
 *
 * 为什么要这东西：「新建复刻」要求用户同时上传参考图和素材图，
 * 大多数人手里只有自己的产品图，没有可参考的版式——第一屏就卡住。
 * 模版库把「参考图」这一步做完了：点一下直接进工作区，
 * 参考图已就位，用户只需上传自己的素材。
 *
 * ⚠️ 目前是空的（2026-11-14）：上一版临时从图库凑的 12 套已全部下架，
 * 等正式素材到位再逐条填进来。填的时候遵守下面的约定：
 *   · kind 必须是 KINDS 里真实存在的类型 id，否则没有画面规则；
 *   · ratio 必须是 RATIOS 里的值，按钮高亮与生图尺寸都按它取；
 *   · fidelity 只允许 FIDELITIES 的三个档位（30 / 70 / 100）；
 *   · img 用相对路径 './tpl/xxx.jpg'，图放 public/tpl/，单张控制在 150KB 内；
 *   · 画面里不能出现第三方品牌标识，否则用户复刻时会把自己的素材
 *     和别人的 logo 混在一起；
 *   · prompt 用中文写，会直接拼进生图提示词（生图提示词不随界面语言翻译）。
 *
 * 填一条的样子：
 *   {
 *     id: 'main-white',
 *     kind: 'main',
 *     name: { zh: '白底极简主图', en: 'Clean white hero' },
 *     desc: { zh: '单件居中，纯白背景', en: 'One product, pure white' },
 *     img: './tpl/main-white.jpg',
 *     ratio: '1:1',
 *     fidelity: 100,
 *     prompt: '纯白背景，主体居中，柔和侧光与自然投影',
 *     tone: '#efece6',
 *   },
 * ============================================================ */
import type { L } from './kinds';

export interface ReplicateTemplate {
  id: string;
  /** 对应 KINDS 里的类型 id：决定场景规则与默认比例 */
  kind: string;
  name: L;
  desc: L;
  /** 预览图 + 预填的参考图（同一张） */
  img: string;
  ratio: string;
  fidelity: number;
  /** 预填到「补充提示词」，用户可以改 */
  prompt: string;
  /** 卡片未加载时的底色，避免白闪 */
  tone: string;
}

/** 正式素材到位后填这里。为空时模版页显示「准备中」的空状态，不会崩。 */
export const TEMPLATES: ReplicateTemplate[] = [];

export const templateById = (id: string | undefined | null): ReplicateTemplate | null =>
  TEMPLATES.find((t) => t.id === id) || null;

export const templatesOfKind = (kind: string): ReplicateTemplate[] =>
  kind === 'all' ? TEMPLATES : TEMPLATES.filter((t) => t.kind === kind);
