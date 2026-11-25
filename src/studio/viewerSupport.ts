/* 3D 预览可靠性登记：不是所有纸盒都能用一个 BoxGeometry 假装。
 * 只有「三维几何按真实面板尺寸生成、每个贴图都能落到对应面」的结构才允许显示 3D。
 * 其余结构必须明确告诉用户暂不支持可靠预览，而不是给一个看起来像、实际折叠关系错误的模型。 */
import type { StructureId } from '../types';

export type ViewerLevel = 'reliable' | 'unsupported';

export interface ViewerSupport {
  level: ViewerLevel;
  title: string;
  titleEn: string;
  detail: string;
  detailEn: string;
}

const SUPPORT: Record<StructureId, ViewerSupport> = {
  tuck: {
    level: 'reliable',
    title: '插舌盒 3D 预览', titleEn: 'Tuck-end 3D preview',
    detail: '盒身六面与顶部翻盖按真实展开面板尺寸映射；顶面、正面、背面、左右侧面各自读取对应的平面稿。', detailEn: 'Six body panels and the top flap use real flat-panel dimensions; top, front, back and both sides each map their own artwork.',
  },
  topBottom: {
    level: 'reliable',
    title: '天地盖 3D 预览', titleEn: 'Lid-and-base 3D preview',
    detail: '底盒与盖盒的墙高直接取刀模里的底墙/盖墙，不按比例猜；盖盒顶面与底盒四侧分别贴对应面。', detailEn: 'Base and lid wall heights come from the dieline, not a guessed ratio; the lid top and base sides map their own faces.',
  },
  labelRect: {
    level: 'reliable',
    title: '矩形标签 3D 预览', titleEn: 'Rectangular label 3D preview',
    detail: '标签弧长等于面宽、高度等于面高；瓶身半径按标签宽度反算，保证包裹角度不超过 360°。', detailEn: 'Label arc length equals the face width and height equals the face height; the bottle radius is derived so the wrap stays within 360 degrees.',
  },
  labelRound: {
    level: 'reliable',
    title: '圆形标签 3D 预览', titleEn: 'Round label 3D preview',
    detail: '圆形标签按真实直径贴在盖面，不再把圆稿拉成一圈环绕瓶身的条带。', detailEn: 'The round label is applied at its real diameter on the cap, no longer stretched into a band around the bottle.',
  },
  drawer: {
    level: 'unsupported',
    title: '抽屉盒暂不支持可靠 3D 预览', titleEn: 'Drawer box: no reliable 3D preview',
    detail: '现有 3D 模型把外套当成立式盒、内盒尺寸按固定比例估算，与刀模里的内盒/外套真实尺寸不一致。请以「平面 / 刀模」视图为准。', detailEn: 'The current model treats the sleeve as a standing box and estimates the tray by fixed ratios, so it does not match the real tray and sleeve in the dieline. Use the flat and dieline views.',
  },
  mailer: {
    level: 'unsupported',
    title: '飞机盒暂不支持可靠 3D 预览', titleEn: 'Mailer box: no reliable 3D preview',
    detail: '飞机盒的侧翼、前后墙与顶盖折叠关系无法用当前盒体模型准确表达，继续显示会让人误以为结构已经验证。请以「平面 / 刀模」视图为准。', detailEn: 'The side wings, front/back walls and lid folds cannot be represented by the current box model; showing one would imply the structure is verified. Use the flat and dieline views.',
  },
  pouch: {
    level: 'unsupported',
    title: '自立袋暂不支持可靠 3D 预览', titleEn: 'Stand-up pouch: no reliable 3D preview',
    detail: '自立袋的底部折角、侧封与站立形态不是盒体；当前模型只是示意。请以「平面 / 刀模」视图为准。', detailEn: 'The bottom gusset, side seals and standing form are not a box; the current model is only indicative. Use the flat and dieline views.',
  },
};

export function viewerSupport(structure: StructureId): ViewerSupport {
  return SUPPORT[structure] || SUPPORT.tuck;
}
