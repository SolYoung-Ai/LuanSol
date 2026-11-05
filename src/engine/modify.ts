/* 对话修改 Agent：把用户一句话转成"局部修改补丁"，绝不重新生成整张包装。
 * 锁定图层不会被修改。每次修改产生一个可恢复的历史版本。 */
import type { AISettings, DesignDoc, FaceId, ShapeKind, TextLayer, TextRole } from '../types';
import { llmJson } from './llm';
import { COLOR_WORDS } from './brief';
import { FONTS, cloneDesign, fitText, makeShape, makeText, textOverflow } from './design';
import { uid } from './utils';

export type PatchOp =
  | { op: 'setBackground'; color: string }
  | { op: 'setColor'; role?: TextRole; color: string }
  | { op: 'scaleText'; role?: TextRole; factor: number }
  | { op: 'setText'; role?: TextRole; text: string }
  | { op: 'addText'; face: FaceId; text: string; role?: TextRole }
  | { op: 'removeDecor' }
  | { op: 'setFont'; family: string }
  | { op: 'setMotif'; shape: ShapeKind; color?: string }
  | { op: 'hideText'; face: FaceId; roles: TextRole[] }
  | { op: 'setSchemeColor'; color: string }
  | { op: 'align'; value: 'left' | 'center' | 'right' };

function colorsIn(text: string): string[] {
  const out: string[] = [];
  const generic: [RegExp, string][] = [
    [/米白|奶白|象牙|浅米/, '#f3eee4'], [/深绿|墨绿|森林绿/, '#20463a'], [/焦糖|棕色|咖啡色/, '#a9673f'],
    [/金色/, '#c8a86b'], [/白色/, '#ffffff'], [/黑色|墨黑/, '#1d1d1b'], [/酒红/, '#7b2d35'],
    [/深蓝|蓝色/, '#2b4c7e'], [/粉色/, '#e7b9bf'], [/奶油/, '#f8f1e1'], [/橙|橘/, '#d98b5f'], [/红色/, '#a8352c'],
  ];
  for (const [re, hex] of generic) if (re.test(text)) out.push(hex);
  for (const [word, hex] of Object.entries(COLOR_WORDS)) if (text.includes(word) && !out.includes(hex)) out.push(hex);
  return out;
}

/** 无 API Key 时的确定性意图解析（明确标注为"内置规则"，不冒充 AI） */
export function localIntent(text: string): PatchOp[] {
  const t = text.trim();
  const ops: PatchOp[] = [];
  const c = colorsIn(t);
  if (/背景|底色|底纹/.test(t) && c.length) ops.push({ op: 'setBackground', color: c[0] });
  if (/字.*(颜色|色)|文字.*色|标题.*色/.test(t) && c.length) ops.push({ op: 'setColor', color: c[0] });
  if (/主色|强调色|品牌色/.test(t) && c.length) ops.push({ op: 'setSchemeColor', color: c[0] });
  if (/更简约|简洁一点|简单一点|去掉装饰|减少元素|留白多一点/.test(t)) ops.push({ op: 'removeDecor' });
  if (/放大|大一些|大一点|更醒目/.test(t)) ops.push({ op: 'scaleText', role: t.includes('产品') || t.includes('标题') && !t.includes('品牌') ? 'product' : 'brand', factor: 1.22 });
  if (/缩小|小一些|小一点/.test(t)) ops.push({ op: 'scaleText', role: t.includes('产品') ? 'product' : 'brand', factor: 0.85 });
  if (/居中|对齐中间/.test(t)) ops.push({ op: 'align', value: 'center' });
  if (/左对齐/.test(t)) ops.push({ op: 'align', value: 'left' });
  if (/(宋体|衬线|优雅.*字)/.test(t)) ops.push({ op: 'setFont', family: FONTS[1].id });
  if (/(黑体|无衬线|现代.*字)/.test(t)) ops.push({ op: 'setFont', family: FONTS[0].id });
  if (/(英.*字|国际|Helvetica)/i.test(t)) ops.push({ op: 'setFont', family: FONTS[3].id });
  if (/(山水|东方|水墨|国风|韵味)/.test(t)) ops.push({ op: 'setMotif', shape: 'mountain' });
  if (/(植物|花草|叶子|自然)/.test(t)) ops.push({ op: 'setMotif', shape: 'botanical' });
  if (/(波浪|海|水纹)/.test(t)) ops.push({ op: 'setMotif', shape: 'wave' });
  if (/(几何|线条|网格)/.test(t)) ops.push({ op: 'setMotif', shape: 'grid' });
  if (/(正面|前面).*(不要|减少|去掉|别放).*(文字|字)/.test(t)) ops.push({ op: 'hideText', face: 'front', roles: ['info', 'legal', 'tagline'] });
  if (/(背面|后面).*(增加|加上|加一段|添加).*(介绍|说明|文字)/.test(t)) ops.push({ op: 'addText', face: 'back', text: '产品说明：请替换为真实介绍文字', role: 'info' });
  const quoted = t.match(/[改成|改为|换成|写成|改为]?\s*[「“"]([^」”"]{1,40})[」”"]/);
  if (quoted && /(改成|改为|换成|写成|文字|标题|名称)/.test(t)) ops.push({ op: 'setText', role: t.includes('品牌') ? 'brand' : 'product', text: quoted[1] });
  if (!ops.length) {
    // 兜底：任何描述都尽量给出一个可感知的局部调整
    if (/暖|温柔|柔和/.test(t)) ops.push({ op: 'setBackground', color: '#f8f1e1' });
    else if (/冷|清爽|冷静/.test(t)) ops.push({ op: 'setBackground', color: '#eef1ef' });
    else if (c.length) ops.push({ op: 'setBackground', color: c[0] });
    else ops.push({ op: 'removeDecor' });
  }
  return ops;
}

function foreachText(d: DesignDoc, fn: (l: TextLayer) => void) {
  for (const face of Object.values(d.faces)) if (face) for (const l of face.layers) if (l.type === 'text' && !l.locked) fn(l);
}

export function applyPatch(design: DesignDoc, ops: PatchOp[]): { design: DesignDoc; changes: string[] } {
  const d = cloneDesign(design);
  const changes: string[] = [];
  for (const op of ops) {
    switch (op.op) {
      case 'setBackground': {
        for (const f of Object.values(d.faces)) if (f) f.bg = op.color;
        changes.push(`所有面的底色改为 ${op.color}`);
        break;
      }
      case 'setSchemeColor': {
        d.palette.primary = op.color;
        for (const f of Object.values(d.faces)) if (f) for (const l of f.layers) if (l.type === 'shape' && !l.locked) l.fill = op.color;
        changes.push(`主色改为 ${op.color}`);
        break;
      }
      case 'setColor': {
        foreachText(d, (l) => { if (!op.role || l.role === op.role) l.color = op.color; });
        changes.push(`文字颜色改为 ${op.color}`);
        break;
      }
      case 'scaleText': {
        let count = 0;
        foreachText(d, (l) => { if (!op.role || l.role === op.role) { l.fontSize = Math.max(5, Math.min(72, l.fontSize * op.factor)); fitText(l); count++; } });
        changes.push(`${count} 处文字字号${op.factor > 1 ? '放大' : '缩小'} ${Math.round(Math.abs(op.factor - 1) * 100)}%`);
        break;
      }
      case 'setText': {
        foreachText(d, (l) => { if (!op.role || l.role === op.role) { l.text = op.text; l.placeholder = false; fitText(l); } });
        changes.push(`文字内容更新为「${op.text}」`);
        break;
      }
      case 'addText': {
        const f = d.faces[op.face];
        if (f) {
          const l = makeText('新增文字', op.text, op.role || 'custom', { x: 8, y: f.h * 0.72, w: f.w - 16, h: f.h * 0.14 }, { fontSize: 8, color: '#1d1d1b' });
          l.placeholder = true;
          f.layers.push(l);
          changes.push(`已在${op.face === 'back' ? '背面' : '指定面'}增加一段文字`);
        }
        break;
      }
      case 'removeDecor': {
        let count = 0;
        for (const f of Object.values(d.faces)) {
          if (!f) continue;
          const keep = f.layers.filter((l) => {
            if (l.locked) return true;
            if (l.type === 'shape' && ['mountain', 'wave', 'botanical', 'dots', 'stripes', 'grid', 'blob', 'sun'].includes(l.shape)) { count++; return false; }
            return true;
          });
          f.layers = keep;
        }
        changes.push(count ? `移除了 ${count} 个装饰图层，版面更留白` : '当前没有可移除的装饰图层');
        break;
      }
      case 'setFont': {
        foreachText(d, (l) => { l.fontFamily = op.family; });
        changes.push('字体已整体更换');
        break;
      }
      case 'setMotif': {
        let count = 0;
        for (const f of Object.values(d.faces)) {
          if (!f) continue;
          f.layers = f.layers.filter((l) => !(l.type === 'shape' && !l.locked && ['mountain', 'wave', 'botanical', 'grid', 'dots', 'stripes'].includes(l.shape)));
          if (f.id === 'front' || f.id === 'top') {
            const s = makeShape('东方插画', op.shape, { x: 0, y: f.h * 0.28, w: f.w, h: f.h * 0.7 }, { fill: op.color || d.palette.primary, opacity: 0.85, seed: 42 });
            f.layers.unshift(s);
            count++;
          }
        }
        changes.push(`插画方向已替换为「${op.shape}」`);
        break;
      }
      case 'hideText': {
        const f = d.faces[op.face];
        if (f) { let c = 0; for (const l of f.layers) if (l.type === 'text' && op.roles.includes(l.role) && !l.locked) { l.hidden = true; c++; } changes.push(`${op.face === 'front' ? '正面' : '指定面'}隐藏了 ${c} 处文字`); }
        break;
      }
      case 'align': {
        foreachText(d, (l) => { l.align = op.value; });
        changes.push(`文字对齐方式改为${op.value === 'center' ? '居中' : op.value === 'left' ? '左对齐' : '右对齐'}`);
        break;
      }
    }
  }
  return { design: d, changes };
}

export async function aiModify(text: string, design: DesignDoc, s: AISettings): Promise<{ ops: PatchOp[]; usedAI: boolean; note: string }> {
  const layerSummary = Object.values(design.faces).filter(Boolean).map((f) => {
    const ff = f!;
    return `${ff.id}: ${ff.layers.map((l) => `${l.id.slice(-5)}/${l.type}${l.type === 'text' ? `/${l.role}:${l.text.slice(0, 12)}` : ''}${l.locked ? '/锁定' : ''}`).join(' | ')}`;
  }).join('\n');
  const prompt = `你是包装设计的"局部修改"执行器。只输出 JSON：{"ops":[...],"note":"给用户的一句话说明"}。
可用 op（严格使用这些字段）：
{"op":"setBackground","color":"#rrggbb"} 改所有面底色
{"op":"setSchemeColor","color":"#rrggbb"} 改主色
{"op":"setColor","role":"brand|product|tagline|info|legal|custom","color":"#rrggbb"}
{"op":"scaleText","role":"brand|product","factor":1.2}
{"op":"setText","role":"brand|product","text":"..."}
{"op":"addText","face":"front|back|left|right|top","text":"...","role":"info"}
{"op":"removeDecor"} 移除装饰图层
{"op":"setFont","family":"serif|sans|latin"}
{"op":"setMotif","shape":"mountain|botanical|wave|grid|blob|dots|stripes","color":"#rrggbb"}
{"op":"hideText","face":"front","roles":["info","legal"]}
{"op":"align","value":"center|left|right"}
规则：只做局部修改；不要删除或改写用户品牌名/产品名，除非用户明确要求；不要编造法规文字；最多 3 个 op；用户明确指定的内容必须执行。
当前图层：\n${layerSummary}\n用户说：${text}`;
  try {
    const data = await llmJson<{ ops: unknown; note?: string }>([
      { role: 'system', content: '只输出合法 JSON 对象，不要输出解释文字。' },
      { role: 'user', content: prompt },
    ], s);
    if (!Array.isArray(data.ops)) throw new Error('模型未返回 ops 数组');
    const valid = new Set(['setBackground', 'setSchemeColor', 'setColor', 'scaleText', 'setText', 'addText', 'removeDecor', 'setFont', 'setMotif', 'hideText', 'align', 'setSchemeColor']);
    const ops = data.ops.filter((o): o is PatchOp => typeof o === 'object' && o !== null && valid.has((o as { op: string }).op)).slice(0, 3) as PatchOp[];
    const withFonts = ops.map((o) => o.op === 'setFont' ? { ...o, family: ({ serif: FONTS[1].id, sans: FONTS[0].id, latin: FONTS[3].id } as Record<string, string>)[(o as { family: string }).family] || FONTS[0].id } : o);
    return { ops: withFonts, usedAI: true, note: data.note || 'AI 已完成局部修改' };
  } catch (e) {
    return { ops: localIntent(text), usedAI: false, note: `AI 修改未成功，已使用内置规则完成局部调整（${e instanceof Error ? e.message : e}）` };
  }
}

export function versionLabel(text: string) { return `${text.slice(0, 18)}${text.length > 18 ? '…' : ''} · ${uid('v').slice(-4)}`; }

export function lockedSummary(design: DesignDoc) {
  const all = Object.values(design.faces).filter(Boolean).flatMap((f) => f!.layers);
  return { total: all.length, locked: all.filter((l) => l.locked).length, overflow: all.filter((l) => l.type === 'text' && textOverflow(l as TextLayer)).length };
}
