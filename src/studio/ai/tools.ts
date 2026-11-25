/* ============================================================
   Studio AI 工具声明
   ------------------------------------------------------------
   这些工具是「旧编辑器 22 工具」在工作台数据模型上的迁移版本：
   复用 editor/ai/tools.ts 的参数校验器，不另写一套 schema 校验。
   重要区别：参数单位是毫米（用户能说「往上 5 毫米」），执行时再按
   当前面板真实宽高换算成 Studio 的百分比坐标。
   ============================================================ */
import type { ParamSchema } from '../../editor/ai/types';
import type { ToolSchema } from '../../editor/ai/tools';
import type { StudioToolName } from './types';

const num = (description: string, extra: Partial<ParamSchema> = {}): ParamSchema =>
  ({ type: 'number', description, ...extra });
const str = (description: string, extra: Partial<ParamSchema> = {}): ParamSchema =>
  ({ type: 'string', description, ...extra });
const bool = (description: string): ParamSchema => ({ type: 'boolean', description });

const HEX = '^#[0-9a-fA-F]{6}$';
const COLOR = str('HEX 颜色，例如 #234B38', { pattern: HEX });
const SOFT_COLOR = str('HEX 颜色，或 none', { pattern: '^(#[0-9a-fA-F]{6}|none)$' });
const FACE = str('面板 ID：front / back / left / right / top', {
  enum: ['front', 'back', 'left', 'right', 'top'],
});
const LAYER_IDS = { type: 'array' as const, itemType: 'string' as const, minItems: 1, maxItems: 20 };

export interface StudioToolDef extends ToolSchema {
  name: StudioToolName;
}

export const STUDIO_TOOL_DEFS: StudioToolDef[] = [
  {
    name: 'inspect_design',
    description: '读取当前项目的面、尺寸、元素和选中状态。只读，不修改画布。',
    params: {},
  },
  {
    name: 'create_text_layer',
    description: '在当前面创建一个独立文字图层。坐标与尺寸用毫米，字号按毫米高度给出。',
    params: {
      text: str('文字内容', { required: true }),
      x_mm: num('左上角 X，相对当前面，单位 mm', { min: 0, max: 1000 }),
      y_mm: num('左上角 Y，相对当前面，单位 mm', { min: 0, max: 1000 }),
      w_mm: num('文本框宽度，单位 mm', { min: 2, max: 1000 }),
      size_mm: num('字号高度，单位 mm', { min: 1, max: 40 }),
      weight: num('字重', { enum: [300, 400, 500, 600, 700, 800] }),
      color: COLOR,
      align: str('对齐', { enum: ['left', 'center', 'right'] }),
      name: str('图层显示名，可省略'),
    },
  },
  {
    name: 'update_text_layer',
    description: '修改已有文字图层的内容或排版属性；只改传入的字段。',
    params: {
      layerId: str('目标图层 ID，必须来自当前设计上下文', { required: true }),
      text: str('新文字内容'),
      size_mm: num('新字号高度，单位 mm', { min: 1, max: 40 }),
      weight: num('字重', { enum: [300, 400, 500, 600, 700, 800] }),
      color: COLOR,
      align: str('对齐', { enum: ['left', 'center', 'right'] }),
      fontFamily: str('字体族，需谨慎，只有上下文明确时才改'),
      letterSpacing: num('字间距（em）', { min: -0.2, max: 1 }),
      lineHeight: num('行高倍数', { min: 0.5, max: 3 }),
      name: str('图层显示名，可省略'),
    },
  },
  {
    name: 'update_layer_position',
    description: '移动图层。可给绝对左上角坐标（x_mm / y_mm），也可给相对位移（dx_mm / dy_mm）。',
    params: {
      layerId: str('目标图层 ID', { required: true }),
      x_mm: num('新的左上角 X，单位 mm', { min: -500, max: 1500 }),
      y_mm: num('新的左上角 Y，单位 mm', { min: -500, max: 1500 }),
      dx_mm: num('相对当前 X 的位移，单位 mm，正数向右', { min: -1000, max: 1000 }),
      dy_mm: num('相对当前 Y 的位移，单位 mm，正数向下', { min: -1000, max: 1000 }),
    },
  },
  {
    name: 'resize_design_object',
    description: '缩放图层。scale 按比例、以中心为锚点；也可直接给 w_mm / h_mm。',
    params: {
      layerId: str('目标图层 ID', { required: true }),
      scale: num('缩放比例，0.1–3，例如 0.85 表示缩小 15%', { min: 0.1, max: 3 }),
      w_mm: num('目标宽度，单位 mm', { min: 1, max: 1000 }),
      h_mm: num('目标高度，单位 mm', { min: 1, max: 1000 }),
      keepAspectRatio: bool('保持比例，默认 true'),
    },
  },
  {
    name: 'rotate_design_object',
    description: '旋转图层。可给绝对角度 rotation，也可给相对角度 delta_deg。',
    params: {
      layerId: str('目标图层 ID', { required: true }),
      rotation: num('目标角度，度，顺时针', { min: -180, max: 180 }),
      delta_deg: num('相对旋转角度，度', { min: -360, max: 360 }),
    },
  },
  {
    name: 'change_object_color',
    description: '修改文字或形状的颜色。图片图层不支持直接改色。',
    params: {
      layerId: str('目标图层 ID', { required: true }),
      color: { ...COLOR, required: true },
    },
  },
  {
    name: 'replace_image_layer',
    description: '替换图片图层的内容，保留位置尺寸。只能使用当前项目里已存在的图片或素材图层的 src。',
    params: {
      layerId: str('目标图片图层 ID', { required: true }),
      src: str('现有图片的 src（data URL 或项目素材 https 地址）'),
      sourceLayerId: str('从当前项目的另一个图片图层取图，给该图层 ID'),
    },
  },
  {
    name: 'create_shape_layer',
    description: '在当前面创建矩形 / 椭圆 / 直线。尺寸用毫米。',
    params: {
      shape: str('形状', { required: true, enum: ['rect', 'ellipse', 'line'] }),
      x_mm: num('左上角 X，单位 mm', { min: 0, max: 1000 }),
      y_mm: num('左上角 Y，单位 mm', { min: 0, max: 1000 }),
      w_mm: num('宽度，单位 mm', { min: 0.3, max: 1000 }),
      h_mm: num('高度，单位 mm', { min: 0.1, max: 1000 }),
      color: COLOR,
      stroke: SOFT_COLOR,
      strokeWidth: num('描边宽度，单位 mm', { min: 0, max: 20 }),
      radius: num('圆角半径，单位 mm', { min: 0, max: 100 }),
      opacity: num('不透明度 0–1', { min: 0.05, max: 1 }),
      rotation: num('旋转角度，度', { min: -180, max: 180 }),
      name: str('图层显示名，可省略'),
    },
  },
  {
    name: 'delete_layer',
    description: '删除一个图层。删除多个对象会被列为危险操作，必须额外确认。',
    params: {
      layerId: str('目标图层 ID', { required: true }),
    },
  },
  {
    name: 'duplicate_layer',
    description: '复制一个图层，生成新 ID；默认向右下偏移 3mm。',
    params: {
      layerId: str('目标图层 ID', { required: true }),
      offset_mm: num('副本偏移，单位 mm', { min: 0, max: 50 }),
    },
  },
  {
    name: 'set_layer_visibility',
    description: '显示或隐藏一个图层。',
    params: {
      layerId: str('目标图层 ID', { required: true }),
      visible: { ...bool('true 显示 / false 隐藏'), required: true },
    },
  },
  {
    name: 'update_layer_order',
    description: '调整一个或多个图层的叠放次序。',
    params: {
      layerIds: { ...LAYER_IDS, required: true, description: '要调整的图层 ID 数组' },
      action: str('调整方式', { required: true, enum: ['front', 'back', 'up', 'down'] }),
    },
  },
  {
    name: 'align_objects',
    description: '对齐一组对象。参照 selection 时按这组对象的包围盒对齐；参照 panel 时按当前面安全区对齐。',
    params: {
      layerIds: { ...LAYER_IDS, description: '目标图层 ID 数组；省略则使用当前选中对象', maxItems: 20 },
      align: str('对齐方向', { required: true, enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'] }),
      ref: str('参照物', { enum: ['selection', 'panel'], default: 'selection' }),
    },
  },
  {
    name: 'distribute_objects',
 description: '水平或垂直等间距分布 3 个以上对象。',
    params: {
      layerIds: { ...LAYER_IDS, description: '目标图层 ID 数组；省略则使用当前选中对象', minItems: 3 },
      axis: str('分布方向', { required: true, enum: ['horizontal', 'vertical'] }),
    },
  },
  {
    name: 'change_background',
    description: '修改当前面或明确指定面的背景色。改其它面属于跨面板操作，需要危险确认。',
    params: {
      color: { ...COLOR, required: true },
      face: FACE,
      opacity: num('背景不透明度 0–1，可省略', { min: 0.05, max: 1 }),
    },
  },
  {
    name: 'run_prepress_check',
    description: '运行当前工程的印前检查，返回错误与警告。只读。',
    params: {},
  },
  {
    name: 'update_dimensions',
    description: '修改包装成品长宽高（mm）。会重新运行刀模几何；属于结构操作，必须危险确认。',
    params: {
      l: num('长，mm', { required: true, min: 5, max: 2000 }),
      w: num('宽，mm', { required: true, min: 5, max: 2000 }),
      h: num('高，mm', { required: true, min: 5, max: 2000 }),
    },
  },
  {
    name: 'update_structure',
    description: '修改包装结构。本阶段不开放给 AI 直接执行：必须走需求步骤的结构接口并重新排布。',
    params: {
      structure: str('目标结构', {
        required: true,
        enum: ['tuck', 'topBottom', 'drawer', 'mailer', 'pouch', 'labelRect', 'labelRound'],
      }),
    },
  },
];

export const studioToolByName = (name: string): StudioToolDef | undefined =>
  STUDIO_TOOL_DEFS.find((t) => t.name === name);

/** 给模型看的工具说明。必须和运行时 Schema 同源，避免文档与校验漂移。 */
export function studioToolsReference(): string {
  return STUDIO_TOOL_DEFS.map((t) => {
    const params = Object.entries(t.params)
      .map(([k, p]) => {
        const req = p.required ? '*' : '';
        const opts = p.enum
          ? `(${p.enum.join('|')})`
          : p.pattern
            ? `(格式 ${p.pattern})`
            : '';
        return `${k}${req}:${p.type}${opts}`;
      })
      .join(', ');
    return `- ${t.name}(${params})：${t.description}`;
  }).join('\n');
}
