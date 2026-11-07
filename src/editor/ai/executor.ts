/* AI 工具执行器：校验参数 → 通过 ToolHost 操作统一工程 → 返回结果。
 * 所有修改都走 ToolHost（即 EditorContext 的状态管理），AI 不接触任何执行环境。 */
import type {
  AIAction, ToolHost, ToolResult,
} from './types';
import type { Layer, TextLayer, ShapeLayer, ImageLayer, Palette, FaceId, StructureId } from '../../types';
import { toolByName, validateParams } from './tools';
import { uid } from '../../engine/utils';

const base = (p: Record<string, unknown>, name: string) => ({
  id: uid('lay'),
  name,
  x: Number(p.x) || 0,
  y: Number(p.y) || 0,
  w: Number(p.w) || 10,
  h: Number(p.h) || 10,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
});

export async function executeAction(action: AIAction, host: ToolHost): Promise<ToolResult> {
  const def = toolByName(action.name);
  if (!def) return { ok: false, message: `未知工具：${action.name}` };

  let p: Record<string, unknown>;
  try {
    p = validateParams(def, action.params);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }

  const requireLayer = (id: unknown): Layer | ToolResult => {
    const layer = host.findLayer(String(id));
    if (!layer) return { ok: false, message: `找不到图层：${String(id)}` };
    return layer;
  };

  try {
    switch (action.name) {
      case 'create_text_layer': {
        const layer: TextLayer = {
          ...base(p, 'AI 文字'),
          type: 'text',
          text: String(p.text),
          role: p.role as TextLayer['role'],
          fontFamily: 'Inter, "PingFang SC", sans-serif',
          fontSize: Number(p.fontSize),
          fontWeight: Number(p.fontWeight),
          color: String(p.color),
          align: p.align as TextLayer['align'],
          letterSpacing: 0,
          lineHeight: 1.3,
        };
        host.addLayer(layer);
        return { ok: true, message: `已创建文字图层「${layer.text.slice(0, 12)}」`, data: { layerId: layer.id } };
      }
      case 'update_text_layer': {
        const r = requireLayer(p.layerId);
        if (!(r instanceof Object) || 'ok' in r && r.ok === false) return r as ToolResult;
        const patch: Partial<TextLayer> = {};
        (['text', 'color', 'align', 'fontFamily'] as const).forEach((k) => { if (p[k] !== undefined) (patch as Record<string, unknown>)[k] = p[k]; });
        (['fontSize', 'fontWeight', 'letterSpacing', 'lineHeight'] as const).forEach((k) => { if (p[k] !== undefined) patch[k] = Number(p[k]); });
        host.patchLayer(String(p.layerId), patch);
        return { ok: true, message: '已更新文字属性' };
      }
      case 'create_image_layer': {
        const layer: ImageLayer = {
          ...base(p, 'AI 图片'),
          type: 'image',
          src: String(p.src),
          naturalW: 0,
          naturalH: 0,
          fit: p.fit as ImageLayer['fit'],
        };
        host.addLayer(layer);
        return { ok: true, message: '已创建图片图层', data: { layerId: layer.id } };
      }
      case 'replace_image_layer': {
        const r = requireLayer(p.layerId);
        if (!(r instanceof Object) || 'ok' in r && r.ok === false) return r as ToolResult;
        host.patchLayer(String(p.layerId), { src: String(p.src) });
        return { ok: true, message: '已替换图片内容' };
      }
      case 'create_shape_layer': {
        const shape = String(p.shape);
        const layer: ShapeLayer = {
          ...base(p, `AI ${shape}`),
          type: 'shape',
          shape: shape as ShapeLayer['shape'],
          fill: String(p.fill),
          stroke: p.stroke ? String(p.stroke) : 'none',
          strokeWidth: Number(p.strokeWidth),
          seed: Math.floor(Math.random() * 100000),
          ...(p.rx !== undefined ? { rx: Number(p.rx) } : {}),
          ...(shape === 'barcode' && p.barcodeValue
            ? { barcode: { type: 'code128', value: String(p.barcodeValue) } }
            : {}),
        };
        host.addLayer(layer);
        return { ok: true, message: `已创建形状「${shape}」`, data: { layerId: layer.id } };
      }
      case 'update_layer_position': {
        const r = requireLayer(p.layerId);
        if (!(r instanceof Object) || 'ok' in r && r.ok === false) return r as ToolResult;
        const patch: Partial<Layer> = {};
        if (p.x !== undefined) patch.x = Number(p.x);
        if (p.y !== undefined) patch.y = Number(p.y);
        host.patchLayer(String(p.layerId), patch);
        return { ok: true, message: '已移动图层' };
      }
      case 'update_layer_size': {
        const r = requireLayer(p.layerId);
        if (!(r instanceof Object) || 'ok' in r && r.ok === false) return r as ToolResult;
        const patch: Partial<Layer> = {};
        if (p.w !== undefined) patch.w = Number(p.w);
        if (p.h !== undefined) patch.h = Number(p.h);
        host.patchLayer(String(p.layerId), patch);
        return { ok: true, message: '已调整尺寸' };
      }
      case 'update_layer_style': {
        const r = requireLayer(p.layerId);
        if (!(r instanceof Object) || 'ok' in r && r.ok === false) return r as ToolResult;
        const patch: Partial<Layer> = {};
        if (p.fill !== undefined) (patch as Partial<ShapeLayer>).fill = String(p.fill);
        if (p.stroke !== undefined) (patch as Partial<ShapeLayer>).stroke = String(p.stroke);
        if (p.strokeWidth !== undefined) (patch as Partial<ShapeLayer>).strokeWidth = Number(p.strokeWidth);
        if (p.rx !== undefined) (patch as Partial<ShapeLayer>).rx = Number(p.rx);
        if (p.opacity !== undefined) patch.opacity = Number(p.opacity);
        if (p.rotation !== undefined) patch.rotation = Number(p.rotation);
        host.patchLayer(String(p.layerId), patch);
        return { ok: true, message: '已更新图层样式' };
      }
      case 'delete_layer': {
        const r = requireLayer(p.layerId);
        if (!(r instanceof Object) || 'ok' in r && r.ok === false) return r as ToolResult;
        host.removeLayer(String(p.layerId));
        return { ok: true, message: '已删除图层' };
      }
      case 'duplicate_layer': {
        const r = requireLayer(p.layerId);
        if (!(r instanceof Object) || 'ok' in r && r.ok === false) return r as ToolResult;
        host.duplicateLayerById(String(p.layerId));
        return { ok: true, message: '已复制图层' };
      }
      case 'group_layers': {
        const ids = p.layerIds as string[];
        if (!Array.isArray(ids) || ids.length < 2) return { ok: false, message: '分组至少需要 2 个图层' };
        // 当前版本：校验图层存在并记录分组名（完整 group 数据结构随 #53 图层分组落地）
        const missing = ids.filter((id) => !host.findLayer(id));
        if (missing.length) return { ok: false, message: `找不到图层：${missing.join(', ')}` };
        return { ok: true, message: `已记录分组「${String(p.name)}」（${ids.length} 个图层）`, data: { layerIds: ids } };
      }
      case 'set_layer_visibility': {
        const r = requireLayer(p.layerId);
        if (!(r instanceof Object) || 'ok' in r && r.ok === false) return r as ToolResult;
        host.setVisibility(String(p.layerId), Boolean(p.visible));
        return { ok: true, message: p.visible ? '已显示图层' : '已隐藏图层' };
      }
      case 'change_background': {
        host.setBackground(String(p.color));
        return { ok: true, message: `背景已改为 ${String(p.color)}` };
      }
      case 'update_palette': {
        const palette: Partial<Palette> = {};
        (['bg', 'primary', 'accent', 'ink', 'muted'] as const).forEach((k) => {
          if (p[k] !== undefined) palette[k] = String(p[k]);
        });
        host.setPalette(palette);
        return { ok: true, message: '配色板已更新' };
      }
      case 'switch_face': {
        host.switchFace(p.face as FaceId);
        return { ok: true, message: `已切换到「${String(p.face)}」面` };
      }
      case 'update_structure': {
        host.setStructure(p.structure as StructureId);
        return { ok: true, message: `结构已更换为「${String(p.structure)}」` };
      }
      case 'update_dimensions': {
        const dim = { l: Number(p.l), w: Number(p.w), h: Number(p.h) };
        host.setDimensions(dim);
        return { ok: true, message: `尺寸已更新为 ${dim.l}×${dim.w}×${dim.h}mm` };
      }
      case 'generate_image_asset': {
        const asset = await host.generateAsset(String(p.prompt), String(p.kind));
        return { ok: true, message: '素材已生成（尚未上画布）', data: asset };
      }
      case 'add_generated_asset': {
        const layer: ImageLayer = {
          ...base(p, 'AI 生成素材'),
          type: 'image',
          src: String(p.src),
          naturalW: 0,
          naturalH: 0,
          fit: 'contain',
        };
        host.addLayer(layer);
        return { ok: true, message: '素材已作为独立图层加入画布', data: { layerId: layer.id } };
      }
      case 'inspect_design': {
        const design = host.getDesign();
        const faceId = host.getCurrentFace();
        const f = host.getFace();
        return {
          ok: true,
          message: `当前「${faceId}」面，共 ${f?.layers.length || 0} 个图层`,
          data: {
            face: faceId,
            faceSize: f ? { w: f.w, h: f.h } : null,
            bg: f?.bg,
            palette: design?.palette,
            layers: f?.layers.map((l) => ({ id: l.id, name: l.name, type: l.type, hidden: l.hidden, locked: l.locked })),
          },
        };
      }
      case 'run_prepress_check': {
        const report = host.runPrepress();
        const errors = report.items.filter((i) => i.level === 'error').length;
        const warnings = report.items.filter((i) => i.level === 'warning').length;
        return {
          ok: true,
          message: `印前检查：${errors} 个错误、${warnings} 个警告`,
          data: report,
        };
      }
      case 'export_design': {
        await host.exportDesign(String(p.format));
        return { ok: true, message: `已导出 ${String(p.format)}` };
      }
      default:
        return { ok: false, message: `工具「${action.name}」尚未实现` };
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message || '执行出错' };
  }
}
