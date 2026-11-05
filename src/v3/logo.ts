/* ============================================================
 * 品牌 Logo：上传素材管理 + AI Logo 制作
 * ------------------------------------------------------------
 * 上传：原文件完整保留，未经确认不修改；检查透明度与清晰度。
 * 制作：输出可独立保存 / 替换 / 编辑的 SVG 矢量。
 * 未配置模型时使用内置矢量模板，界面明确标注「未调用 AI」，
 * 不把模板生成冒充真实 AI 生成，也不宣称完成商标注册或检索。
 * ============================================================ */
import type { LogoAISpec, LogoAsset, LogoOption } from './draft';
import type { AISettings } from '../types';
import { llmJson, aiConfigured } from '../engine/llm';

export const LOGO_STYLES = ['极简文字 Logo', '图形 Logo', '中英文组合 Logo', '印章风格', '现代品牌标识', '复古商业标识'];
export const LOGO_INDUSTRIES = ['食品', '茶饮 / 咖啡', '美妆个护', '日用品', '健康产品', '礼品文创', '其它'];
export const LOGO_POSITIONS = ['平价亲民', '大众中端', '中高端', '高端礼品', '年轻潮流'];

export const TRADEMARK_NOTE = '生成的 Logo 为设计草稿，需你确认与修改；不代表已完成商标注册、商标检索或可自由使用的法律结论。正式使用前请自行完成近似检索与权利核查。';

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const initials = (name: string) => {
  const cn = name.replace(/[^\u4e00-\u9fa5]/g, '');
  if (cn) return cn.slice(0, 2);
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'LS';
};
const enName = (name: string) => /[\u4e00-\u9fa5]/.test(name) ? 'LUNASOL STUDIO' : name.toUpperCase();

function frame(color: string, bg: string, inner: string, w = 320, h = 200): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" fill="${bg}"/>${inner}</svg>`;
}

/** 三个明显不同的方向；每个都是纯矢量，可单独下载、替换与改色 */
export function generateLogoOptions(spec: LogoAISpec, variant = 0): LogoOption[] {
  const name = (spec.brandName || 'LunaSol').trim();
  const color = /^#[0-9a-f]{6}$/i.test(spec.color) ? spec.color : '#20463a';
  const ink = '#1d1d1b';
  const bg = '#ffffff';
  const monogram = initials(name);
  const en = enName(name);
  const seed = Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0), 0)) + variant;

  const styles = spec.style || LOGO_STYLES[0];
  const seal = styles === '印章风格' || (seed % 3 === 2 && styles === '中英文组合 Logo');

  // 方向一：文字为主
  const a = frame(color, bg,
    `<text x="160" y="98" text-anchor="middle" font-family="'PingFang SC','Noto Sans CJK SC',sans-serif" font-size="34" font-weight="500" letter-spacing="5" fill="${ink}">${esc(name)}</text>`
    + `<line x1="96" y1="116" x2="224" y2="116" stroke="${color}" stroke-width="1.2"/>`
    + `<text x="160" y="136" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" letter-spacing="3.4" fill="${color}">${esc(en)}</text>`);

  // 方向二：图形 + 文字
  const shape = seal
    ? `<rect x="124" y="30" width="72" height="72" rx="4" fill="${color}"/><rect x="130" y="36" width="60" height="60" rx="2" fill="none" stroke="#fff" stroke-width="1.2"/><text x="160" y="80" text-anchor="middle" font-family="'PingFang SC',sans-serif" font-size="30" fill="#fff">${esc(monogram)}</text>`
    : `<circle cx="160" cy="66" r="34" fill="none" stroke="${color}" stroke-width="2.4"/>`
      + `<path d="M160 38 A28 28 0 0 1 188 66 L160 66 Z" fill="${color}" opacity=".85"/>`
      + `<path d="M132 66 A28 28 0 0 0 160 94 L160 66 Z" fill="${color}" opacity=".45"/>`
      + `<circle cx="160" cy="66" r="7" fill="${ink}"/>`;
  const b = frame(color, bg, shape
    + `<text x="160" y="142" text-anchor="middle" font-family="'PingFang SC','Noto Sans CJK SC',sans-serif" font-size="22" font-weight="500" letter-spacing="3" fill="${ink}">${esc(name)}</text>`
    + `<text x="160" y="160" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" letter-spacing="2.6" fill="${color}">${esc(en)}</text>`);

  // 方向三：徽章 / 标识
  const c = frame(color, bg,
    `<rect x="52" y="40" width="216" height="120" fill="none" stroke="${color}" stroke-width="1.4"/>`
    + `<rect x="58" y="46" width="204" height="108" fill="none" stroke="${color}" stroke-width="0.5" opacity=".6"/>`
    + `<text x="160" y="96" text-anchor="middle" font-family="Georgia,'Songti SC',serif" font-size="30" letter-spacing="4" fill="${ink}">${esc(name)}</text>`
    + `<line x1="112" y1="110" x2="208" y2="110" stroke="${color}" stroke-width="1"/>`
    + `<text x="160" y="132" text-anchor="middle" font-family="Arial,sans-serif" font-size="8.5" letter-spacing="3" fill="${color}">${esc(en)}</text>`
    + `<circle cx="160" cy="40" r="5" fill="${color}"/><circle cx="160" cy="160" r="5" fill="${color}"/>`);

  return [
    { id: `logo-a-${seed}`, name: '方向 01 · 文字主导', svg: a, note: '以品牌名为唯一主角，适合留白大的包装与极简风格。' },
    { id: `logo-b-${seed}`, name: seal ? '方向 02 · 印章图形' : '方向 02 · 图形标识', svg: b, note: '图形与品牌名组合，缩到瓶盖或封口贴也清楚。' },
    { id: `logo-c-${seed}`, name: '方向 03 · 徽章标识', svg: c, note: '双线框徽章，适合礼盒、复古与商业标识风格。' },
  ];
}

/** 配置模型后由 LLM 给出设计方向建议，再用矢量模板呈现；诚实标注来源 */
export async function aiLogoAdvice(spec: LogoAISpec, ai: AISettings): Promise<{ usedAI: boolean; note: string; suggestions: { title: string; reason: string }[] }> {
  const fallback = {
    usedAI: false, note: '未配置 AI 模型，以下为内置矢量模板生成的三个方向（未调用 AI）。',
    suggestions: [
      { title: '文字主导', reason: `${spec.industry || '通用'}品类适合清晰识别，` },
      { title: '图形标识', reason: '便于缩放到封口贴与瓶盖。' },
      { title: '徽章标识', reason: `${spec.position || '中高端'}定位可用双线框增强品牌感。` },
    ],
  };
  if (!aiConfigured(ai)) return fallback;
  try {
    const r = await llmJson<{ suggestions?: { title: string; reason: string }[] }>([
      { role: 'system', content: '你是品牌标识设计师。只输出 JSON：{"suggestions":[{"title":"","reason":""}]}，三个互不相同的 Logo 方向，reason 用中文一句话，不超过 40 字。不要声称完成商标注册或检索。' },
      { role: 'user', content: `品牌名：${spec.brandName}；行业：${spec.industry}；定位：${spec.position}；希望风格：${spec.style}；颜色：${spec.color}；图形偏好：${spec.motif || '无'}。` },
    ], ai);
    if (r?.suggestions?.length === 3) return { usedAI: true, note: 'AI 已给出三个设计方向建议，图形由内置矢量模板输出（非 AI 图像生成）。', suggestions: r.suggestions };
  } catch { /* 连接失败时回退，不伪造 */ }
  return fallback;
}

/** 用户确认后改色 / 缩放 —— 只在用户主动选择时执行 */
export function adjustLogoSvg(svg: string, o: { color?: string; scale?: number }): string {
  let out = svg;
  if (o.color && /^#[0-9a-f]{6}$/i.test(o.color) && /^#[0-9a-f]{6}$/i.test((svg.match(/fill="(#[0-9a-f]{6})"/i) || [])[1] || '#')) {
    // 只替换模板色，不动墨黑与白底
    const m = svg.match(/(?:stroke|fill)="(#[0-9a-f]{6})"/i);
    if (m && m[1].toLowerCase() !== '#1d1d1b' && m[1].toLowerCase() !== '#ffffff') {
      out = out.split(m[1]).join(o.color);
    }
  }
  if (o.scale && o.scale !== 1) {
    const s = Math.max(0.6, Math.min(1.4, o.scale));
    out = out.replace('<svg ', `<svg style="transform:scale(${s});transform-origin:center" `);
  }
  return out;
}

/** 读取上传文件：保留原文件，检查透明背景与清晰度 */
export async function readLogoFile(file: File): Promise<{ asset: LogoAsset | null; message: string }> {
  const okTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf'];
  if (!okTypes.includes(file.type) && !/\.(png|jpe?g|svg|pdf)$/i.test(file.name))
    return { asset: null, message: '仅支持 PNG / JPG / SVG / PDF。' };
  if (file.size > 12 * 1024 * 1024) return { asset: null, message: '文件超过 12 MB，请压缩后重试。' };
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const src = await fileToDataUrl(file);
    return {
      asset: { name: file.name, src, mime: 'application/pdf', naturalW: 0, naturalH: 0, transparent: true, sharp: false, scale: 1, recolor: '', removeBg: false, keepOriginal: true },
      message: 'PDF 已作为原始文件保留。当前预览无法解析 PDF 内容，导出前请另行提供可印刷的矢量或高清位图。',
    };
  }
  const src = await fileToDataUrl(file);
  const info = await new Promise<{ w: number; h: number; transparent: boolean }>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = Math.min(img.naturalWidth, 160); cv.height = Math.min(img.naturalHeight, 160);
        const cx = cv.getContext('2d');
        if (!cx) return resolve({ w: img.naturalWidth, h: img.naturalHeight, transparent: false });
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        let alpha = false;
        try {
          const d = cx.getImageData(0, 0, cv.width, cv.height).data;
          for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { alpha = true; break; }
        } catch { /* SVG 跨域时忽略 */ }
        resolve({ w: img.naturalWidth, h: img.naturalHeight, transparent: alpha });
      } catch { resolve({ w: img.naturalWidth, h: img.naturalHeight, transparent: false }); }
    };
    img.onerror = () => resolve({ w: 0, h: 0, transparent: false });
    img.src = src;
  });
  const isVector = file.type === 'image/svg+xml';
  const sharp = isVector || (info.w >= 600 && info.h >= 200);
  return {
    asset: {
      name: file.name, src, mime: file.type, naturalW: info.w, naturalH: info.h,
      transparent: info.transparent || isVector, sharp, scale: 1, recolor: '', removeBg: false, keepOriginal: true,
    },
    message: isVector ? 'SVG 矢量素材，可无损缩放。'
      : sharp ? `${info.w} × ${info.h} px，清晰度足够用于常规包装印刷。${info.transparent ? ' 检测到透明背景。' : ''}`
        : `${info.w} × ${info.h} px，分辨率偏低：按 300 DPI 计算，建议宽度至少 600 px，否则印出来可能发虚。`,
  };
}

export const fileToDataUrl = (f: File | Blob) => new Promise<string>((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result));
  fr.onerror = () => reject(new Error('文件读取失败'));
  fr.readAsDataURL(f);
});
