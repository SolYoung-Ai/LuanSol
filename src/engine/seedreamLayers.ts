/* ============================================================
   Seedream 5.5 图层拆分 — 响应解析器
   ------------------------------------------------------------
   所有原始模型响应都在这里落地成稳定的 TS 结构；React 组件只读
   已经校验过的数据，不直接碰 data[] / bounding_box / OCR 原文。

   设计原则：
   1. 未知字段一律忽略，不因多一个字段就整单失败；
   2. 关键字段（底图尺寸、bbox、z_index）缺失时给出 issue，
      能降级就降级，不能降级就让调用方明确失败；
   3. 绝不把 OCR 的 similar_font_family 当成真实字体名；
   4. 图层分类是启发式，低置信度归 unknown，允许用户手动改。
   ============================================================ */
import type { PixelBox } from './layerPlacement';

export type LayerKind = 'background' | 'illustration' | 'decorative' | 'product' | 'logo' | 'text' | 'unknown';

export interface OcrRunStyle {
  similarFontFamily?: string;
  foregroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  shadow?: boolean;
  translucent?: boolean;
}

export interface OcrRun {
  text: string;
  style: OcrRunStyle;
}

export interface OcrLine {
  text: string;
  box: PixelBox | null;
  runs: OcrRun[];
}

export interface LayerOcr {
  /** 整段文字，行之间用 \n */
  text: string;
  lines: OcrLine[];
  /** 启发式置信度：模型没有返回置信度字段，这里只根据结构完整度估。
   *  永远不要展示成「模型确认 99%」。 */
  confidence: number;
  /** 字体不可信 / 行结构缺失 / 存在 unknown 字体时 true */
  uncertain: boolean;
}

export interface ParsedLayer {
  /** 稳定用于导入的 id；来自服务端 assetId，缺省用 z-index 生成 */
  key: string;
  zIndex: number;
  name: string;
  description: string;
  /** 标准化后的 absolute bbox；底图没有 bbox，为 null */
  box: PixelBox | null;
  /** 原始 size 字符串，如 2048x2048 */
  sizeText: string;
  width: number;
  height: number;
  mime: string;
  /** b64 原始数据（服务端通常已持久化并从响应里省略） */
  dataUrl: string;
  assetId: string;
  assetUrl: string;
  ocr: LayerOcr | null;
  kind: LayerKind;
  /** 分类置信度 0..1；模型分类不是 100% 准确 */
  kindConfidence: number;
  /** 原始模型给的类型（如果有），仅供排查 */
  rawType: string;
  issues: string[];
}

export interface ParsedSplit {
  base: ParsedLayer | null;
  /** 由底向上，z_index 从小到大 */
  layers: ParsedLayer[];
  issues: string[];
  model: string;
  provider: string;
  jobId: string;
  cost: number;
  balance: number;
}

export interface ParseOptions {
  /** 服务端返回的扣费与任务信息 */
  model?: string;
  provider?: string;
  jobId?: string;
  cost?: number;
  balance?: number;
  /** 底图实际像素尺寸；响应 size 缺失时可由前端解码图片补上 */
  baseSize?: { w: number; h: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function parseSize(text: string): { w: number; h: number } | null {
  const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(text.trim());
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? { w, h } : null;
}

function parseBox(raw: unknown): PixelBox | null {
  if (Array.isArray(raw) && raw.length >= 4) {
    const n = raw.slice(0, 4).map((x) => num(x));
    if (n.every((x): x is number => x !== null) && n[2] > n[0] && n[3] > n[1]) {
      return { left: n[0], top: n[1], right: n[2], bottom: n[3] };
    }
  }
  if (isObj(raw) && Array.isArray(raw.absolute)) return parseBox(raw.absolute);
  return null;
}

function parseOcr(raw: unknown): LayerOcr | null {
  if (!isObj(raw)) return null;
  const text = str(raw.text);
  const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
  const lines: OcrLine[] = [];
  for (const l of rawLines) {
    if (!isObj(l)) continue;
    const ltext = str(l.text);
    if (!ltext) continue;
    const runsRaw = Array.isArray(l.runs) ? l.runs : [];
    const runs: OcrRun[] = [];
    for (const r of runsRaw) {
      if (!isObj(r)) continue;
      const rtext = str(r.text);
      if (!rtext) continue;
      const st = isObj(r.style) ? r.style : {};
      runs.push({
        text: rtext,
        style: {
          similarFontFamily: str(st.similar_font_family) || undefined,
          foregroundColor: str(st.foreground_color) || undefined,
          bold: st.bold === true,
          italic: st.italic === true,
          underline: st.underline === true,
          strikethrough: st.strikethrough === true,
          shadow: st.shadow === true,
          translucent: st.translucent === true,
        },
      });
    }
    lines.push({ text: ltext, box: parseBox(l.bounding_box), runs });
  }
  if (!text && !lines.length) return null;

  // 不是模型置信度：只衡量“这段 OCR 是否足够结构化，能安全转成文本对象”。
  const withRuns = lines.filter((l) => l.runs.length > 0).length;
  const allLinesHaveRuns = lines.length > 0 && withRuns === lines.length;
  const unknownFont = lines.some((l) => l.runs.some((r) => !r.style.similarFontFamily || r.style.similarFontFamily === 'unknown'));
  const confidence = !lines.length ? 0.35 : allLinesHaveRuns ? 0.78 : 0.58;
  return {
    text: text || lines.map((l) => l.text).join('\n'),
    lines,
    confidence,
    uncertain: unknownFont || !allLinesHaveRuns || confidence < 0.7,
  };
}

/** 分类：先看 OCR，再看名称/描述，最后才看提示词。
 *  不确定就返回 unknown，不为了“看起来完整”硬塞一个类型。 */
export function classifyLayer(input: {
  zIndex: number;
  name: string;
  description: string;
  ocr: LayerOcr | null;
  prompt?: string;
}): { kind: LayerKind; confidence: number } {
  if (input.zIndex === 0) return { kind: 'background', confidence: 0.98 };
  const name = `${input.name} ${input.description}`.toLowerCase();
  const prompt = (input.prompt || '').toLowerCase();
  if (input.ocr && input.ocr.text.trim()) return { kind: 'text', confidence: input.ocr.confidence };
  if (/logo|标志|商标|字标|brand mark/.test(name)) return { kind: 'logo', confidence: 0.82 };
  if (/背景|底图|底色|background|backdrop/.test(name)) return { kind: 'background', confidence: 0.9 };
  if (/产品|实物|瓶|罐|盒|packshot|product photo|bottle|jar|can\b/.test(name)) return { kind: 'product', confidence: 0.7 };
  if (/文字|标题|文案|排版|typography|headline|copy\b|lettering/.test(name)) return { kind: 'text', confidence: 0.66 };
  if (/装饰|纹理|花纹|点缀|边框|decorat|ornament|pattern|border|badge|ribbon/.test(name)) {
    return { kind: 'decorative', confidence: 0.7 };
  }
  if (/插画|主视觉|人物|动物|植物|花|illustration|artwork|character|flower|plant|bird|leaf/.test(name)) {
    return { kind: 'illustration', confidence: 0.68 };
  }
  if (/illustration|插画|图案|手绘/.test(prompt)) return { kind: 'unknown', confidence: 0.35 };
  return { kind: 'unknown', confidence: 0.25 };
}

function toDataUrl(b64: string, mime: string): string {
  if (!b64) return '';
  if (b64.startsWith('data:')) return b64;
  return `data:${mime || 'image/png'};base64,${b64}`;
}

/**
 * 解析代理返回的拆图响应。
 * 允许 data[] 里混有底图（z_index=0 / 没有 bbox），也允许完全没有底图。
 */
export function parseSplitResponse(raw: unknown, opt: ParseOptions = {}): ParsedSplit {
  const issues: string[] = [];
  const root = isObj(raw) ? raw : {};
  const data = Array.isArray(root.data) ? root.data : [];
  if (!data.length) {
    return {
      base: null, layers: [], issues: ['响应里没有 data[]'],
      model: opt.model || '', provider: opt.provider || '', jobId: opt.jobId || '',
      cost: Number(opt.cost) || 0, balance: Number(opt.balance) || 0,
    };
  }

  const parsed: ParsedLayer[] = [];
  data.forEach((d, i) => {
    if (!isObj(d)) { issues.push(`第 ${i + 1} 张不是对象，已跳过`); return; }
    const localIssues: string[] = [];
    const sizeText = str(d.size);
    const dims = parseSize(sizeText) || { w: 0, h: 0 };
    const zIndex = num(d.z_index);
    const z = zIndex === null ? (i === 0 ? 0 : i) : Math.round(zIndex);
    const b64 = str(d.b64_json);
    const url = str(d.url);
    const dataUrl = toDataUrl(b64, str(d.output_format) || 'image/png');
    const assetUrl = str(d.assetUrl);
    if (!dataUrl && !url && !assetUrl) localIssues.push('既没有 b64_json、url，也没有服务端持久化 assetUrl');
    if (!dims.w || !dims.h) localIssues.push('缺少 size，需由前端口径补尺寸');
    const box = parseBox(d.bounding_box);
    if (z !== 0 && !box) localIssues.push('图层缺少 bounding_box.absolute，无法定位');
    if (box && dims.w && dims.h) {
      const clipped = box.left < 0 || box.top < 0 || box.right > dims.w || box.bottom > dims.h;
      if (clipped) localIssues.push('bbox 超出图层自身画布，导入时会夹回边界');
    }
    const ocr = parseOcr(d.text_recognition);
    const name = str(d.name) || `图层 ${z}`;
    const description = str(d.description);
    const cls = classifyLayer({ zIndex: z, name, description, ocr });
    for (const msg of localIssues) issues.push(`${name}：${msg}`);
    parsed.push({
      key: str(d.assetId) || `z${z}_${i}`,
      zIndex: z,
      name,
      description,
      box,
      sizeText,
      width: dims.w,
      height: dims.h,
      mime: str(d.output_format) || (dataUrl.startsWith('data:image/') ? dataUrl.slice(5, dataUrl.indexOf(';')) : 'image/png'),
      dataUrl,
      assetId: str(d.assetId),
      assetUrl,
      ocr,
      kind: cls.kind,
      kindConfidence: cls.confidence,
      rawType: str(d.type),
      issues: localIssues,
    });
  });

  const baseCandidates = parsed.filter((p) => p.zIndex === 0 && !p.box);
  const base = baseCandidates[0] || parsed.find((p) => !p.box) || null;
  const layers = parsed.filter((p) => p !== base).sort((a, b) => a.zIndex - b.zIndex);
  if (!base) issues.push('没有可识别的底图（z_index=0 且无 bounding_box），导入将只保留图层');
  if (!layers.length) issues.push('没有可导入的透明图层');
  if (base && opt.baseSize && (!base.width || !base.height)) {
    base.width = opt.baseSize.w;
    base.height = opt.baseSize.h;
  }
  const dupZ = layers.filter((l, i) => i > 0 && l.zIndex === layers[i - 1].zIndex).length;
  if (dupZ) issues.push(`${dupZ} 个图层 z_index 重复，已按数组顺序保留`);

  return {
    base,
    layers,
    issues,
    model: str(root.model) || opt.model || '',
    provider: str(root.provider) || opt.provider || '',
    jobId: str(root.jobId) || opt.jobId || '',
    cost: num(root.cost) ?? (opt.cost || 0),
    balance: num(root.balance) ?? (opt.balance || 0),
  };
}

/** OCR → 可编辑文字元素所需的最小数据；不做字体猜测。 */
export function ocrToTextSpec(layer: ParsedLayer): {
  text: string;
  color: string;
  weight: number;
  italic: boolean;
  lineHeight: number;
  confidence: number;
  uncertain: boolean;
} | null {
  if (!layer.ocr || !layer.ocr.text.trim()) return null;
  const first = layer.ocr.lines[0]?.runs[0]?.style;
  const hex = first?.foregroundColor && /^#[0-9a-f]{6}$/i.test(first.foregroundColor) ? first.foregroundColor : '#191919';
  return {
    text: layer.ocr.text,
    color: hex,
    weight: first?.bold ? 700 : 400,
    italic: first?.italic === true,
    lineHeight: 1.35,
    confidence: layer.ocr.confidence,
    uncertain: layer.ocr.uncertain,
  };
}
