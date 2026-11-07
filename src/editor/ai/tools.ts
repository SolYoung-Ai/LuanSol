/* AI 工具注册表：22 个工具的参数 schema + 校验器。
 * 这里只定义「工具能做什么、需要什么参数」，真正执行在 executor.ts。
 * 校验不通过会抛出明确错误，绝不允许参数流入执行层。 */
import type { AIToolName, ParamSchema } from './types';

export interface ToolDef {
  name: AIToolName;
  description: string;
  params: Record<string, ParamSchema>;
}

/** 校验单个工具的参数，返回清洗后的参数；失败抛出带字段名的错误。 */
export function validateParams(
  def: ToolDef,
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const input = raw || {};
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(def.params)) {
    let value = input[key];
    if (value === undefined || value === null) {
      if (schema.required) throw new Error(`参数「${key}」是必填项`);
      if (schema.default !== undefined) value = schema.default;
      else continue;
    }
    // 类型检查
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (actual !== schema.type) {
      // 宽松：数字字符串转数字
      if (schema.type === 'number' && typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
        value = Number(value);
      } else {
        throw new Error(`参数「${key}」类型应为 ${schema.type}，实际是 ${actual}`);
      }
    }
    if (schema.enum && !schema.enum.includes(value as string | number)) {
      throw new Error(`参数「${key}」必须是以下值之一：${schema.enum.join(' / ')}`);
    }
    if (schema.type === 'number') {
      const n = value as number;
      if (schema.min !== undefined && n < schema.min) throw new Error(`参数「${key}」不能小于 ${schema.min}`);
      if (schema.max !== undefined && n > schema.max) throw new Error(`参数「${key}」不能大于 ${schema.max}`);
    }
    if (schema.type === 'string' && (value as string).trim() === '' && schema.required) {
      throw new Error(`参数「${key}」不能为空`);
    }
    out[key] = value;
  }
  return out;
}

const FACE_ENUM = ['front', 'back', 'left', 'right', 'top'];
const ALIGN_ENUM = ['left', 'center', 'right'];
const STRUCTURE_ENUM = ['tuck', 'topBottom', 'drawer', 'mailer', 'pouch', 'labelRect', 'labelRound'];

const posParams = {
  layerId: { type: 'string', required: true, description: '目标图层 ID' } as ParamSchema,
  x: { type: 'number', description: '新的 X 坐标（mm）' } as ParamSchema,
  y: { type: 'number', description: '新的 Y 坐标（mm）' } as ParamSchema,
};

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'create_text_layer',
    description: '在当前包装面创建一个独立的可编辑文字图层',
    params: {
      text: { type: 'string', required: true, description: '文字内容' },
      role: { type: 'string', enum: ['brand', 'product', 'tagline', 'info', 'legal', 'custom'], default: 'custom' },
      x: { type: 'number', default: 10 },
      y: { type: 'number', default: 10 },
      w: { type: 'number', default: 80 },
      h: { type: 'number', default: 10 },
      fontSize: { type: 'number', min: 1, max: 200, default: 14 },
      fontWeight: { type: 'number', enum: [300, 400, 500, 600, 700, 800], default: 400 },
      color: { type: 'string', default: '#222222' },
      align: { type: 'string', enum: ALIGN_ENUM, default: 'left' },
    },
  },
  {
    name: 'update_text_layer',
    description: '更新已有文字图层的内容或文字属性（仅改动传入的字段）',
    params: {
      layerId: { type: 'string', required: true },
      text: { type: 'string' },
      fontSize: { type: 'number', min: 1, max: 200 },
      fontWeight: { type: 'number', enum: [300, 400, 500, 600, 700, 800] },
      color: { type: 'string' },
      align: { type: 'string', enum: ALIGN_ENUM },
      fontFamily: { type: 'string' },
      letterSpacing: { type: 'number', min: -0.1, max: 1 },
      lineHeight: { type: 'number', min: 0.5, max: 3 },
    },
  },
  {
    name: 'create_image_layer',
    description: '用已有的图片数据（data URL 或素材）在当前面创建图片图层',
    params: {
      src: { type: 'string', required: true },
      x: { type: 'number', default: 0 },
      y: { type: 'number', default: 0 },
      w: { type: 'number', default: 50 },
      h: { type: 'number', default: 50 },
      fit: { type: 'string', enum: ['cover', 'contain'], default: 'cover' },
    },
  },
  {
    name: 'replace_image_layer',
    description: '替换某个图片图层的图片内容，保留位置和尺寸',
    params: {
      layerId: { type: 'string', required: true },
      src: { type: 'string', required: true },
    },
  },
  {
    name: 'create_shape_layer',
    description: '创建独立矢量形状（矩形/圆形/线条/图案/条码等）',
    params: {
      shape: { type: 'string', required: true, enum: ['rect', 'circle', 'line', 'pattern', 'ornament', 'barcode', 'seal'] },
      x: { type: 'number', default: 0 },
      y: { type: 'number', default: 0 },
      w: { type: 'number', default: 30 },
      h: { type: 'number', default: 30 },
      fill: { type: 'string', default: '#e8783a' },
      stroke: { type: 'string', default: 'none' },
      strokeWidth: { type: 'number', min: 0, max: 20, default: 0 },
      rx: { type: 'number', min: 0, max: 100 },
      barcodeValue: { type: 'string', description: '当 shape=barcode 时的编码值' },
    },
  },
  {
    name: 'update_layer_position',
    description: '移动图层到指定坐标（mm）',
    params: posParams,
  },
  {
    name: 'update_layer_size',
    description: '修改图层宽高（mm），最小 5mm',
    params: {
      layerId: { type: 'string', required: true },
      w: { type: 'number', min: 5 },
      h: { type: 'number', min: 5 },
    },
  },
  {
    name: 'update_layer_style',
    description: '更新图层样式：填充/描边/透明度/旋转/圆角等',
    params: {
      layerId: { type: 'string', required: true },
      fill: { type: 'string' },
      stroke: { type: 'string' },
      strokeWidth: { type: 'number', min: 0, max: 20 },
      opacity: { type: 'number', min: 0, max: 1 },
      rotation: { type: 'number', min: -360, max: 360 },
      rx: { type: 'number', min: 0, max: 100 },
    },
  },
  {
    name: 'delete_layer',
    description: '删除指定图层',
    params: { layerId: { type: 'string', required: true } },
  },
  {
    name: 'duplicate_layer',
    description: '复制指定图层，生成带新 ID 的副本',
    params: { layerId: { type: 'string', required: true } },
  },
  {
    name: 'group_layers',
    description: '将多个图层归为一组（当前版本记录分组关系，便于统一管理）',
    params: {
      layerIds: { type: 'array', required: true, description: '要分组的图层 ID 数组' },
      name: { type: 'string', default: '分组' },
    },
  },
  {
    name: 'set_layer_visibility',
    description: '显示或隐藏图层',
    params: {
      layerId: { type: 'string', required: true },
      visible: { type: 'boolean', required: true },
    },
  },
  {
    name: 'change_background',
    description: '修改当前包装面的背景色',
    params: { color: { type: 'string', required: true } },
  },
  {
    name: 'update_palette',
    description: '更新工程配色板（bg/primary/accent/ink/muted）',
    params: {
      bg: { type: 'string' },
      primary: { type: 'string' },
      accent: { type: 'string' },
      ink: { type: 'string' },
      muted: { type: 'string' },
    },
  },
  {
    name: 'switch_face',
    description: '切换当前编辑的包装面',
    params: { face: { type: 'string', required: true, enum: FACE_ENUM } },
  },
  {
    name: 'update_structure',
    description: '更换包装结构（会触发面尺寸重映射）',
    params: { structure: { type: 'string', required: true, enum: STRUCTURE_ENUM } },
  },
  {
    name: 'update_dimensions',
    description: '修改包装长宽高（mm），最小 5mm',
    params: {
      l: { type: 'number', required: true, min: 5 },
      w: { type: 'number', required: true, min: 5 },
      h: { type: 'number', required: true, min: 5 },
    },
  },
  {
    name: 'generate_image_asset',
    description: '调用 AI 生图模型生成独立素材（背景/插画/纹理/贴纸等），返回素材但不自动上画布',
    params: {
      prompt: { type: 'string', required: true },
      kind: { type: 'string', enum: ['background', 'illustration', 'texture', 'pattern', 'sticker', 'product'], default: 'illustration' },
    },
  },
  {
    name: 'add_generated_asset',
    description: '把已生成的素材（src）作为独立图层加入当前画布',
    params: {
      src: { type: 'string', required: true },
      x: { type: 'number', default: 0 },
      y: { type: 'number', default: 0 },
      w: { type: 'number', default: 60 },
      h: { type: 'number', default: 60 },
    },
  },
  {
    name: 'inspect_design',
    description: '分析当前设计：返回面、图层、配色等结构化信息，用于诊断',
    params: {},
  },
  {
    name: 'run_prepress_check',
    description: '运行印前检查，返回问题清单',
    params: {},
  },
  {
    name: 'export_design',
    description: '按指定格式导出（png/svg/pdf/zip）',
    params: { format: { type: 'string', required: true, enum: ['png', 'svg', 'pdf', 'zip'] } },
  },
];

export const toolByName = (name: AIToolName): ToolDef | undefined =>
  TOOL_DEFS.find((t) => t.name === name);

/** 生成给 AI 的工具说明文本（注入 system prompt） */
export function toolsReferenceText(): string {
  return TOOL_DEFS.map((t) => {
    const params = Object.entries(t.params)
      .map(([k, p]) => `${k}${p.required ? '*' : ''}:${p.type}${p.enum ? `(${p.enum.join('|')})` : ''}${p.description ? ` ${p.description}` : ''}`)
      .join(', ');
    return `- ${t.name}(${params})：${t.description}`;
  }).join('\n');
}
