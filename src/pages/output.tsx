import React, { useRef, useState } from 'react';
import Viewer3D, { type BgKind, type MaterialKind, type Viewer3DHandle } from '../components/Viewer3D';
import { Button, Card, Empty, Notice, PageHead, SectionLabel, StepBar, Tag, Toggle, go } from '../ui';
import { useApp } from '../store';
import { autoFix, runPrepress } from '../engine/prepress';
import { buildBundle, buildDxf, buildPdf, downloadText, exportJpgMockup, exportPng, spreadSvg, verifyPdf } from '../engine/export';
import { FLOW_STEPS } from '../data';
import { downloadBlob, formatDate, round } from '../engine/utils';
import { dielineStats, structureById } from '../engine/structure';
import type { CheckItem } from '../types';

/* ============================ 6. 3D 智能包装预览 ============================ */
export function Preview3D() {
  const { s, setToast } = useApp();
  const ref = useRef<Viewer3DHandle>(null);
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState<MaterialKind>('matte');
  const [background, setBackground] = useState<BgKind>('light');
  const [light, setLight] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);
  const advanced = s.settings.advancedMode;
  if (!s.design) return <div className="page page-narrow"><Empty title="还没有设计稿" desc="先完成方案选择与编辑，再来看立体效果。" action={<Button onClick={() => go('/schemes')}>查看方案</Button>} /></div>;

  const capture = () => {
    const url = ref.current?.capture();
    if (!url) { setToast('渲染器尚未就绪，请稍等一秒再试'); return; }
    const a = document.createElement('a'); a.href = url; a.download = `${s.design!.name}-3D效果图.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setToast('高清效果图已导出（当前画布分辨率）');
  };
  return <div className="page page-wide">
    <StepBar steps={FLOW_STEPS} current={4} />
    <PageHead kicker="3D PREVIEW / 05" title="看看它做成实物是什么样" desc="平面稿会自动映射到真实结构模型的每个面；拖拽旋转，滚轮缩放。"
      right={<Button onClick={() => go('/prepress')}>下一步 · 印前检查 <span aria-hidden>→</span></Button>} />
    <div className="preview3d-grid">
      <div className={`viewer-shell bg-${background}`}><Viewer3D ref={ref} design={s.design} structure={s.brief.structure} size={s.brief.size.l ? s.brief.size : { l: 200, w: 150, h: 80 }} open={open} material={material} background={background} light={light} autoRotate={autoRotate} />
        <div className="viewer-hint">拖拽旋转 · 滚轮缩放</div></div>
      <aside className="viewer-controls">
        <Card className="pad-card"><SectionLabel en="QUICK VIEW">普通模式</SectionLabel>
          <Toggle label="自动旋转" checked={autoRotate} onChange={setAutoRotate} />
          <Toggle label={open ? '闭合包装' : '打开包装'} hint="插舌盒翻盖 / 天地盖开合 / 抽屉抽拉" checked={open} onChange={setOpen} />
          <div className="control-label">背景</div><div className="seg full">{(['light', 'warm', 'dark'] as BgKind[]).map((b) => <button key={b} className={background === b ? 'active' : ''} onClick={() => setBackground(b)}>{{ light: '明亮', warm: '暖白', dark: '深色' }[b]}</button>)}</div>
          <Button variant="outline" onClick={capture}>下载当前效果图 PNG <span aria-hidden>↓</span></Button>
        </Card>
        <Card className="pad-card"><SectionLabel en="ADVANCED">高级渲染</SectionLabel>
          {!advanced && <Notice tone="info">在「个人设置」开启高级模式，可调整材质、光照与相机参数。</Notice>}
          <div className="control-label">材质</div><div className="seg full">{(['matte', 'gloss', 'kraft'] as MaterialKind[]).map((m) => <button key={m} disabled={!advanced} className={material === m ? 'active' : ''} onClick={() => setMaterial(m)}>{{ matte: '哑光', gloss: '亮面', kraft: '牛皮纸' }[m]}</button>)}</div>
          <div className="control-label">光照强度 {light.toFixed(1)}×</div><input type="range" min="0.4" max="1.8" step="0.1" value={light} disabled={!advanced} onChange={(e) => setLight(Number(e.target.value))} />
          <p className="control-note">3D 模型由 {structureById(s.brief.structure).name} 的真实结构生成，不是把图片贴在普通立方体上。修改平面稿后，贴图会即时同步。</p>
        </Card>
      </aside>
    </div>
  </div>;
}

/* ============================ 11. 印前检查中心 ============================ */
export function Prepress() {
  const { s, update, dieline, setToast, syncProject } = useApp();
  const [busy, setBusy] = useState(false);
  const report = s.report;
  if (!s.design) return <div className="page page-narrow"><Empty title="还没有设计稿" desc="完成设计后才能进行印前检查。" action={<Button onClick={() => go('/editor')}>去设计工作台</Button>} /></div>;

  const check = () => {
    setBusy(true);
    const r = runPrepress({ design: s.design!, brief: s.brief, dieline, dpi: s.settings.printDpi });
    update({ report: r });
    setToast(r.status === 'error' ? '发现必须处理的问题' : r.status === 'warning' ? '检查基本通过，有建议需要确认' : '全部检查通过');
    setBusy(false);
  };
  const fix = () => {
    const r = autoFix(s.design!, dieline);
    if (!r.changes.length) { setToast('没有需要自动修复的问题'); return; }
    update({ design: r.design });
    syncProject();
    const n = runPrepress({ design: r.design, brief: s.brief, dieline, dpi: s.settings.printDpi });
    update({ report: n });
    setToast(`已修复 ${r.changes.length} 处：${r.changes.slice(0, 2).join('、')}`);
  };
  const groups = report ? [...new Set(report.items.map((i) => i.group))] : [];
  const icon = (l: CheckItem['level']) => l === 'pass' ? '✓' : l === 'warning' ? '!' : '✕';
  return <div className="page page-narrow">
    <StepBar steps={FLOW_STEPS} current={5} />
    <PageHead kicker="PREPRESS CHECK / 06" title="检查我的包装" desc="点一下，系统自动完成尺寸、出血、清晰度、颜色、字体和刀模检查，并把术语翻译成人话。"
      right={<Button onClick={check} disabled={busy}>{busy ? '检查中…' : '检查我的包装'}</Button>} />
    {!report ? <Card className="prepress-cta"><div className="big-mark">◎</div><h2>还没有检查报告</h2>
      <p>导出印刷文件之前，LunaSol 会逐项检查并把能自动修复的问题处理好。</p><Button size="lg" onClick={check}>开始检查 <span aria-hidden>→</span></Button></Card> : <>
      <Card className={`report-summary ${report.status}`}>
        <div className="report-status"><span>{report.status === 'pass' ? '通过' : report.status === 'warning' ? '基本通过' : '需要处理'}</span><em>{formatDate(report.at)}</em></div>
        <h2>{report.summary}</h2>
        <div className="report-counts"><span>✓ {report.items.filter((i) => i.level === 'pass').length} 项通过</span><span>! {report.items.filter((i) => i.level === 'warning').length} 条建议</span><span>✕ {report.items.filter((i) => i.level === 'error').length} 个错误</span></div>
        <div className="report-actions"><Button variant="outline" onClick={fix}>自动修复可修复的问题</Button>
          <Button variant="ghost" onClick={check}>重新检查</Button></div>
      </Card>
      {groups.map((g) => <Card className="check-group" key={g}><div className="check-group-title">{g}</div>
        {report.items.filter((i) => i.group === g).map((i) => <div className={`check-item ${i.level}`} key={i.id}>
          <span className="check-icon">{icon(i.level)}</span><div><strong>{i.title}</strong><p>{i.detail}</p>{i.fix && <em>建议：{i.fix}</em>}</div></div>)}
      </Card>)}
      <Card className="pad-card"><SectionLabel en="CMYK PREVIEW">颜色换算参考</SectionLabel>
        <div className="cmyk-grid">{report.cmyk.slice(0, 8).map((c, i) => <div key={i}><span>CMYK</span><strong>C{c.c} M{c.m} Y{c.y} K{c.k}</strong></div>)}</div>
        <Notice tone="warn">颜色为近似 CMYK 换算，未内嵌 ICC；屏幕色与印刷色可能存在差异，请打样确认。食品、化妆品等标签的法规信息请自行核实，LunaSol 不代替合规审查。</Notice>
      </Card>
      <div className="prepress-next"><Button size="lg" disabled={report.status === 'error'} onClick={() => go('/export')}>前往文件导出 <span aria-hidden>→</span></Button>
        {report.status === 'error' && <span>存在关键错误时不允许标记为印刷合格，也无法导出印刷文件。</span>}</div>
    </>}
  </div>;
}

/* ============================ 12. 文件导出中心 ============================ */
interface FileRow { name: string; info: string; ok: boolean }
export function ExportCenter() {
  const { s, update, dieline, setToast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [pdfCheck, setPdfCheck] = useState<ReturnType<typeof verifyPdf> | null>(null);
  const report = s.report;
  const design = s.design;
  const safe = (n: string) => n.replace(/[\\/:*?"<>|·\s]+/g, '_');
  const wrapper = async (key: string, fn: () => Promise<FileRow>) => {
    setBusy(key);
    try { const r = await fn(); setFiles((f) => [r, ...f]); setToast(`${r.name} 已生成`); }
    catch (e) { setToast(`导出失败：${e instanceof Error ? e.message : e}`); }
    setBusy(null);
  };
  if (!design) return <div className="page page-narrow"><Empty title="没有可导出的设计稿" desc="先完成一套包装设计，再回来做印前检查与导出。" action={<Button onClick={() => go('/wizard')}>开始十步设计</Button>} /></div>;
  const blocked = !report || report.status === 'error';
  const base = safe(design.name);

  const doPdf = () => wrapper('pdf', async () => {
    const { blob, bytes } = await buildPdf(design, dieline, s.settings.printDpi);
    const v = verifyPdf(bytes, dieline.sheets);
    setPdfCheck(v);
    if (!v.ok) throw new Error(`PDF 预检未通过：${v.issues.join('；')}`);
    downloadBlob(blob, `${base}_印刷稿.pdf`);
    update({ projects: s.projects.map((p) => p.id === s.activeId ? { ...p, status: 'exported' } : p) });
    return { name: `${base}_印刷稿.pdf`, info: `${v.pages} 页 · ${Math.round(v.bytes / 1024)} KB · 预检通过`, ok: true };
  });
  const doBundle = () => wrapper('zip', async () => {
    const r = await buildBundle(design, dieline, s.settings.printDpi, true);
    if (!r.check.ok) throw new Error(`PDF 预检未通过：${r.check.issues.join('；')}`);
    downloadBlob(r.blob, `${base}_印刷文件包.zip`);
    return { name: `${base}_印刷文件包.zip`, info: `含 SVG / DXF / PDF / 效果图 / 说明 · ${Math.round(r.blob.size / 1024)} KB`, ok: r.check.ok };
  });

  return <div className="page">
    <StepBar steps={FLOW_STEPS} current={6} />
    <PageHead kicker="EXPORT CENTER / 07" title="文件导出中心" desc="真正的毫米级印刷文件：逐图层绘制的 PDF、保留可编辑文字的 SVG、几何刀模 DXF 与高清图。" />
    <div className="export-top">
      <Card className="pad-card"><SectionLabel en="EXPORT FLOW">导出前六步</SectionLabel>
        <div className="export-flow">
          {[['自动检查', !!report], ['展示报告', !!report], ['自动修复', report ? report.items.every((i) => i.level !== 'error') : false], ['人工确认', confirmed], ['生成文件', files.length > 0], ['允许下载', files.length > 0]].map(([t, done], i) =>
            <div key={String(t)} className={done ? 'done' : ''}><span>{i + 1}</span>{t as string}{done ? ' ✓' : ''}</div>)}
        </div>
        <label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>我已确认：占位文字已替换为真实信息；颜色需打样；法规信息已自行核实。</span></label>
        {!report && <Notice tone="warn">还没有印前检查报告。<Button variant="ghost" onClick={() => go('/prepress')}>去检查 →</Button></Notice>}
        {report?.status === 'error' && <Notice tone="warn">存在关键结构错误，不允许显示印刷合格，印刷文件导出已锁定。</Notice>}
      </Card>
      <Card className="pad-card"><SectionLabel en="SPEC">本次输出规格</SectionLabel>
        <div className="kv"><span>结构</span><strong>{structureById(s.brief.structure).name}</strong></div>
        <div className="kv"><span>成品尺寸</span><strong>{dieline.finished.l} × {dieline.finished.w} × {dieline.finished.h} mm</strong></div>
        <div className="kv"><span>展开图</span><strong>{dieline.sheets.length} 张 · {dieline.sheets.map((x) => `${round(x.width)}×${round(x.height)}`).join('、')} mm</strong></div>
        <div className="kv"><span>出血 / 安全区</span><strong>{dieline.bleed} mm / {dieline.safe} mm</strong></div>
        <div className="kv"><span>裁切 / 压痕</span><strong>{dielineStats(dieline).cut} / {dielineStats(dieline).crease} 段</strong></div>
        <div className="kv"><span>输出 DPI</span><strong>{s.settings.printDpi}</strong></div>
      </Card>
    </div>
    <div className="format-grid">
      <Card className="format-card primary"><div className="format-top"><span>01</span><Tag tone="green">推荐</Tag></div><h3>高清印刷 PDF</h3>
        <p>毫米页面尺寸、3mm 出血、独立刀模页、逐图层绘制（非整图截图）、文字按 DPI 嵌入。导出后自动做字节级预检。</p>
        <Button onClick={doPdf} disabled={blocked || !confirmed || busy === 'pdf'}>{busy === 'pdf' ? '生成中…' : '生成并下载 PDF'}</Button>
        {pdfCheck && <div className={`pdf-verify ${pdfCheck.ok ? 'ok' : 'bad'}`}>预检：{pdfCheck.ok ? `通过 · ${pdfCheck.pages} 页 · 页面尺寸正确` : pdfCheck.issues.join('；')}</div>}
      </Card>
      <Card className="format-card"><div className="format-top"><span>02</span><Tag>SVG</Tag></div><h3>SVG 矢量展开稿</h3><p>保留可编辑文字与矢量图形，每个展开图单独一份，可在 Illustrator 中继续编辑。</p>
        <Button variant="outline" disabled={blocked || !confirmed} onClick={() => wrapper('svg', async () => {
          dieline.sheets.forEach((sh, i) => downloadText(spreadSvg(design, dieline, i, false), `${base}_展开稿_${i + 1}.svg`, 'image/svg+xml'));
          return { name: `展开稿 SVG ×${dieline.sheets.length}`, info: '含全部可编辑文字图层', ok: true };
        })}>下载 SVG</Button></Card>
      <Card className="format-card"><div className="format-top"><span>03</span><Tag>PNG</Tag></div><h3>高清 PNG 展开图</h3><p>按 {s.settings.printDpi} DPI 渲染，适合打样预览与电商详情图。</p>
        <Button variant="outline" disabled={blocked || !confirmed} onClick={() => wrapper('png', async () => {
          const sh = dieline.sheets[0];
          const r = await exportPng(spreadSvg(design, dieline, 0, false), sh.width, sh.height, `${base}_展开稿_${s.settings.printDpi}dpi.png`, s.settings.printDpi);
          return { name: `${base}_展开稿.png`, info: `${r.width} × ${r.height} px · ${r.dpi} DPI`, ok: true };
        })}>下载 PNG</Button></Card>
      <Card className="format-card"><div className="format-top"><span>04</span><Tag>JPG</Tag></div><h3>JPG 立体效果图</h3><p>由设计稿生成的立体盒型效果图，用于详情页与社交分享（非印刷文件）。</p>
        <Button variant="outline" disabled={!confirmed} onClick={() => wrapper('jpg', async () => {
          const r = await exportJpgMockup(design, `${base}_效果图.jpg`);
          return { name: `${base}_效果图.jpg`, info: `${r.width} × ${r.height} px`, ok: true };
        })}>下载 JPG</Button></Card>
      <Card className="format-card"><div className="format-top"><span>05</span><Tag>DXF</Tag></div><h3>DXF 刀模文件</h3><p>CUT 裁切线 / CREASE 压痕线，单位 mm，由结构引擎几何直接写出，供模切厂使用。</p>
        <Button variant="outline" disabled={blocked || !confirmed} onClick={() => wrapper('dxf', async () => {
          dieline.sheets.forEach((_, i) => downloadText(buildDxf(dieline, i), `${base}_刀模_${i + 1}.dxf`, 'application/dxf'));
          return { name: `刀模 DXF ×${dieline.sheets.length}`, info: `CUT ${dielineStats(dieline).cut} 段 / CREASE ${dielineStats(dieline).crease} 段`, ok: true };
        })}>下载 DXF</Button></Card>
      <Card className="format-card"><div className="format-top"><span>06</span><Tag tone="amber">打包</Tag></div><h3>完整印刷文件包</h3><p>一次打包 SVG、DXF、PDF、效果图与导出说明；包内 PDF 同样经过真实预检。</p>
        <Button variant="outline" disabled={blocked || !confirmed || busy === 'zip'} onClick={doBundle}>{busy === 'zip' ? '打包中…' : '下载 ZIP 文件包'}</Button></Card>
    </div>
    <Card className="format-card x4"><div className="format-top"><span>—</span><Tag tone="plain">未提供</Tag></div>
      <h3>PDF/X-4</h3><p>规范要求「通过真实标准验证后提供」。当前版本没有经过 PDF/X-4 标准符合性验证的工具链，因此不提供该选项，也不会把普通 PDF 标注成 PDF/X-4。若印厂要求，请在印前环节使用专业工具转换并验证。</p></Card>
    {files.length > 0 && <Card className="pad-card files-card"><SectionLabel en="FILES">本次已生成</SectionLabel>
      <div className="file-table">{files.map((f, i) => <div key={i}><span>✓</span><strong>{f.name}</strong><em>{f.info}</em></div>)}</div></Card>}
    <div className="export-footer"><Button variant="ghost" onClick={() => go('/projects')}>查看我的作品</Button>
      <Button variant="outline" onClick={() => go('/editor')}>← 返回继续编辑</Button></div>
  </div>;
}
