/* ============================================================
 * 复刻提示词：复刻度 → 可执行指令（唯一来源）
 * ------------------------------------------------------------
 * 为什么单独成文件：
 * 1) 「复刻度」以前是一根 20–100 的滑杆，但提示词里只有一句模板化的话，
 *    模型根本分不出 30% 和 100% 的差别，用户拖到「一比一」也照旧重新构图。
 *    现在改成三个明确的档位，每档的指令完全不同（见 FIDELITIES）。
 * 2) 一比一必须真的是一比一：这一档**不拼场景创意句**。类型场景（比如主图的
 *    「单个主体居中占 70%–85%，背景纯白」）本质是在要求模型重新构图，
 *    与「照参考图不动」直接打架，只会把参考图的版式冲掉。
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
    hint: { zh: '沿用构图与配色，细节可调', en: 'Keep the composition, adjust details' },
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

/** 档位 → 一句模型能执行的指令。三档之间必须是互斥的（重做 / 沿用 / 照抄）。 */
function fidelityRule(level: FidelityLevel): string {
  if (level === 'exact') {
    return '一比一复刻（100%）：把第一张参考图当作必须逐像素对齐的版式模板，'
      + '画幅比例、构图、每个元素的位置与大小、留白间距、背景与字体气质全部保持不变，'
      + '只把画面中的主体替换成素材图中的产品；不新增元素、不删除元素、不改变色调、不重新排版';
  }
  if (level === 'layout') {
    return '复刻度 70%：沿用参考图的构图骨架、元素的相对位置、配色关系与字体气质，'
      + '仅在纹理、装饰细节与辅助元素上做小幅调整';
  }
  return '复刻度 30%：参考图只作灵感来源——只提取它的配色倾向与整体气质，'
    + '构图、版式、元素位置必须全部重新设计，不得照抄参考图的排版与分区';
}

/** 两栏各自的职责。缺哪一栏就换一句，不能把缺失的那栏写进提示词里。 */
function roleRule(hasRef: boolean, hasMat: boolean, level: FidelityLevel): string {
  if (hasRef && hasMat) {
    return level === 'exact'
      ? '第二张之后是我的素材图：它是必须出现的主体，保留它的造型、结构、标签排版与品牌文字，不要改变它的身份'
      : '输入图中的参考图只提供配色、字体气质、材质与构图骨架；素材图是必须出现在画面里的真实主体，保留它的造型、结构、标签排版与品牌文字，不要改变它的身份';
  }
  if (hasRef) return '输入图是参考图：按它复刻构图与视觉风格，画面主体取自参考图本身，允许替换其中的文案与产品信息';
  return '输入图是我的素材：作为画面主体，必须保留它的造型、结构、标签文字与品牌信息；画面风格按下述要求重新设计';
}

const TAIL = '高分辨率商业级出图，画面干净，无拼贴、无分栏、无水印、无多余产品，中文文字排版正确';

/**
 * 拼最终提示词。
 * 一比一档刻意**不拼** kind.scene：场景句都是在要求模型重新组织画面，
 * 拼进去就等于把「照参考图」这句话抵消掉。
 */
export function buildReplicatePrompt(
  kind: KindDef,
  fidelity: number,
  extra: string,
  hasRef: boolean,
  hasMat: boolean,
): string {
  const level = fidelityLevel(fidelity);
  const scene = level === 'exact'
    ? `输出一张${kind.name.zh}成品图，画面内不出现拼贴、分栏或占位框`
    : kind.scene;
  return [fidelityRule(level), scene, roleRule(hasRef, hasMat, level), extra.trim(), TAIL]
    .filter(Boolean)
    .join('，');
}
