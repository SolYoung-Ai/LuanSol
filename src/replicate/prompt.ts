/* ============================================================
 * 复刻提示词：复刻度 + 标题 → 可执行指令（唯一来源）
 * ------------------------------------------------------------
 * 1) 「复刻度」是一根 30–100 的滑杆（2026-11-14 从三档按钮改回来）：
 *    档位语义连续——100 一比一照抄；50–89 沿用构图骨架 / 字体风格 /
 *    排版层级，细节留创作空间；30–49 只借配色与气质。
 *    提示词按数值分带写出不同的指令（见 fidelityRule），不是一句模板话。
 * 2) 一比一必须真的是一比一：这一档**不拼场景创意句**。类型场景（比如主图的
 *    「单个主体居中占 70%–85%，背景纯白」）本质是在要求模型重新构图，
 *    与「照参考图不动」直接打架，只会把参考图的版式冲掉。
 * 3) 标题（title）：有标题类画面（视频封面 / 海报 / 详情页）用户必须填自己的
 *    标题。提示词里把「参考图文字只是版式参考、必须全部替换」写成最高优先级
 *    指令——否则模型会照抄参考图上的原字，用户填的标题等于白填。
 *
 * 生图提示词是给模型看的，固定中文，不随界面语言翻译。
 * ============================================================ */
import type { L, KindDef } from './kinds';

export type FidelityLevel = 'loose' | 'layout' | 'exact';

export interface FidelityDef {
  id: FidelityLevel;
  /** 存进草稿的数值：老草稿里的 20–100 也能反查回档位 */
  value: number;
  name: L;
  /** 选中后的一行说明：让用户一眼看出这一档模型会做什么 */
  hint: L;
}

/** 三档的锚点值：滑杆是连续的，这三个值只是命名锚点（老草稿映射也走这里） */
export const FIDELITIES: FidelityDef[] = [
  {
    id: 'loose',
    value: 30,
    name: { zh: '只借个感觉', en: 'Loose' },
    hint: { zh: '只取配色与气质，版式全部重做', en: 'Colour and mood only — layout rebuilt' },
  },
  {
    id: 'layout',
    value: 70,
    name: { zh: '参考版式', en: 'Follow layout' },
    hint: { zh: '结构、字体、排版照参考图，细节留发挥空间', en: 'Structure, type and layout follow the reference — details stay flexible' },
  },
  {
    id: 'exact',
    value: 100,
    name: { zh: '一比一', en: 'One to one' },
    hint: { zh: '位置、留白、字体全部照做，只换主体', en: 'Same layout and spacing — only the subject changes' },
  },
];

/** 数值（老草稿 / 历史记录）→ 档位。90 以上才算一比一，50–89 为参考版式。 */
export function fidelityLevel(v: number): FidelityLevel {
  if (v >= 90) return 'exact';
  if (v >= 50) return 'layout';
  return 'loose';
}

export function fidelityDef(v: number): FidelityDef {
  const id = fidelityLevel(v);
  return FIDELITIES.find((f) => f.id === id) || FIDELITIES[1];
}

/**
 * 复刻度 → 模型能执行的指令。三个语义带互斥（重做 / 沿用 / 照抄），
 * 带内用具体数值说话，让「拖到多少」和「模型做到多少」对得上。
 */
function fidelityRule(v: number, level: FidelityLevel): string {
  if (level === 'exact') {
    return `一比一复刻（${v}%）：把第一张参考图当作必须逐像素对齐的版式模板，`
      + '画幅比例、构图、每个元素的位置与大小、留白间距、背景与字体气质全部保持不变，'
      + '只把画面中的主体替换成素材图中的产品；不新增元素、不删除元素、不改变色调、不重新排版';
  }
  if (level === 'layout') {
    return `复刻度 ${v}%：整体构图骨架、分区结构、字体风格与排版层级必须严格沿用参考图，`
      + '主标题与核心元素的位置、大小关系保持不变；'
      + '装饰细节、辅助元素与局部配色可按用户需求适度发挥，在复刻结构的基础上留出创作空间';
  }
  return `复刻度 ${v}%：参考图只作灵感来源——只提取它的配色倾向与整体气质，`
    + '构图、版式、元素位置必须全部重新设计，不得照抄参考图的排版与分区';
}

/** 标题替换指令：有标题类画面且用户填了标题时拼入，优先级高于参考图上的原文字。 */
function titleRule(title: string): string {
  return `画面主标题文字必须是「${title}」：参考图上的文字只是版式与字体风格参考，`
    + '必须全部替换为上面给定的文字，严禁照抄或残留参考图上的任何字样；'
    + '标题的字号层级、位置与字体风格仍严格跟随参考图';
}

/** 两栏各自的职责。缺哪一栏就换一句，不能把缺失的那栏写进提示词里。 */
function roleRule(hasRef: boolean, hasMat: boolean, level: FidelityLevel): string {
  if (hasRef && hasMat) {
    return level === 'exact'
      ? '第二张之后是我的素材图：它是必须出现的主体，保留它的造型、结构、标签排版与品牌文字，不要改变它的身份'
      : '输入图中的参考图只提供配色、字体气质、材质与构图骨架；素材图是必须出现在画面里的真实主体，保留它的造型、结构、标签排版与品牌文字，不要改变它的身份';
  }
  if (hasRef) return '输入图是参考图：严格按它复刻构图与视觉风格，画面主体取自参考图本身，图中的文字仅作版式参考';
  return '输入图是我的素材：作为画面主体，必须保留它的造型、结构、标签文字与品牌信息；画面风格按下述要求重新设计';
}

/** 收尾的质量句。有参考图时不再禁止拼贴 / 分栏——参考图本身就是拼贴或分屏时，这两句会把版式冲掉。 */
function tailRule(hasRef: boolean): string {
  return hasRef
    ? '高分辨率商业级出图，画面干净，无水印、无多余产品，中文文字排版正确；版式与分栏以参考图为准'
    : '高分辨率商业级出图，画面干净，无拼贴、无分栏、无水印、无多余产品，中文文字排版正确';
}

/**
 * 拼最终提示词。
 * 一比一档刻意**不拼** kind.scene：场景句都是在要求模型重新组织画面，
 * 拼进去就等于把「照参考图」这句话抵消掉。
 * title 非空时紧跟在复刻度指令之后：替换文字是硬要求，优先级最高。
 */
export function buildReplicatePrompt(
  kind: KindDef,
  fidelity: number,
  extra: string,
  hasRef: boolean,
  hasMat: boolean,
  title?: string,
): string {
  const level = fidelityLevel(fidelity);
  const scene = level === 'exact'
    ? `输出一张${kind.name.zh}成品图，画面内不出现拼贴、分栏或占位框`
    : kind.scene;
  return [
    fidelityRule(fidelity, level),
    title?.trim() ? titleRule(title.trim()) : '',
    scene,
    roleRule(hasRef, hasMat, level),
    extra.trim(),
    tailRule(hasRef),
  ]
    .filter(Boolean)
    .join('，');
}
