/* ============================================================
 * 设计台（在线设计编辑器）— 入口组件
 * ------------------------------------------------------------
 * 布局（参照 Doory / Canva）：
 *   最左 72px 图标栏 → 展开 300px 功能面板 → 中间画布 → 底部缩放条。
 *   顶部两层：文件名/撤销重做/导出 + 文字编辑工具栏。
 *
 * 画布用 Fabric.js 渲染，engine.ts 封装所有操作。本组件只做状态编排。
 * ============================================================ */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EditorEngine, DESIGN_W, DESIGN_H, LayerItem } from './engine';
import { PANELS, PanelId, panelIcon } from './panels-data';
import { TextPanel, ShapesPanel, StickersPanel, ImagesPanel, BackgroundPanel, LayersPanel, PlaceholderPanel } from './panels';
import { Toolbar } from './toolbar';
import { useLang } from '../i18n';

import '../editor.css';

export default function Editor() {
  const { lang, t } = useLang();
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EditorEngine | null>(null);

  const [activePanel, setActivePanel] = useState<PanelId | null>('text');
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ kind: string; name: string } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState(() => (lang === 'en' ? 'Untitled design' : '未命名设计'));
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);

  // 初始化引擎
  useEffect(() => {
    if (!canvasElRef.current || engineRef.current) return;
    const engine = new EditorEngine(canvasElRef.current, {
      onSelect: (item) => {
        setActiveId(item?.id ?? null);
        setSelected(item ? { kind: item.kind, name: item.name } : null);
      },
      onLayers: (items) => setLayers(items),
      onHistory: (u, r) => { setCanUndo(u); setCanRedo(r); },
      onDirty: (d) => { setDirty(d); },
    });
    engineRef.current = engine;
    setReady(true);

    // 初始适配：让整张画布在可视区内，并把计算出的缩放回填到 React state
    const host = canvasHostRef.current;
    if (host) {
      const fit = () => {
        const z = engine.fitToScreen(host.clientWidth, host.clientHeight);
        setZoom(z);
      };
      const t = setTimeout(fit, 50);
      const onResize = () => {
        const z = engine.fitToScreen(host.clientWidth, host.clientHeight);
        setZoom(z);
      };
      window.addEventListener('resize', onResize);
      return () => { clearTimeout(t); window.removeEventListener('resize', onResize); engine.dispose(); engineRef.current = null; };
    }
    return () => { engine.dispose(); engineRef.current = null; };
  }, []);

  // 键盘：Delete 删除选中（引擎内部也绑了 keydown，这里再兜一层 body 级）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete') engineRef.current?.deleteSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setZoomCb = useCallback((z: number) => {
    engineRef.current?.setZoom(z);
    setZoom(z);
  }, []);

  const onExport = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const url = engine.exportPNG(2);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'design'}.png`;
    a.click();
    setDirty(false);
  }, [title]);

  const renderPanel = () => {
    const engine = engineRef.current;
    if (!engine) return null;
    const close = () => setActivePanel(null);
    switch (activePanel) {
      case 'text': return <TextPanel engine={engine} onClose={close} />;
      case 'shapes': return <ShapesPanel engine={engine} onClose={close} />;
      case 'stickers': return <StickersPanel engine={engine} onClose={close} />;
      case 'images': return <ImagesPanel engine={engine} onClose={close} />;
      case 'background': return <BackgroundPanel engine={engine} onClose={close} />;
      case 'layers': return <LayersPanel engine={engine} layers={layers} activeId={activeId} onClose={close} />;
      case 'templates':
      case 'video':
      case 'brand':
      case 'animation':
      case 'audio': {
        const p = PANELS.find((x) => x.id === activePanel)!;
        return <PlaceholderPanel title={lang === 'en' ? p.name.en : p.name.zh} onClose={close} />;
      }
      default: return null;
    }
  };

  return (
    <div className="ed-app">
      {/* 顶部工具栏 */}
      <Toolbar
        engine={engineRef.current!}
        title={title}
        onTitleChange={setTitle}
        canUndo={canUndo}
        canRedo={canRedo}
        saved={!dirty}
        selected={selected}
        onExport={onExport}
      />

      <div className="ed-body">
        {/* 左侧图标栏 */}
        <nav className="ed-iconbar">
          {PANELS.map((p) => (
            <button key={p.id} className={`ed-iconbar-btn ${activePanel === p.id ? 'on' : ''}`} onClick={() => setActivePanel(activePanel === p.id ? null : p.id)} title={lang === 'en' ? p.name.en : p.name.zh}>
              {panelIcon(p.id)}
              <span>{lang === 'en' ? p.name.en : p.name.zh}</span>
            </button>
          ))}
        </nav>

        {/* 展开的功能面板 */}
        {activePanel && <div className="ed-panel-wrap">{renderPanel()}</div>}

        {/* 画布区 */}
        <div className="ed-canvas-host" ref={canvasHostRef}>
          <div className="ed-canvas-inner" style={{ width: DESIGN_W * zoom, height: DESIGN_H * zoom }}>
            <canvas ref={canvasElRef} style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${zoom})`, transformOrigin: 'top left' }} />
          </div>
        </div>
      </div>

      {/* 底部缩放条 */}
      <div className="ed-bottombar">
        <span className="ed-page-ind">{t('第 1 页，共 1 页', 'Page 1 of 1')}</span>
        <div className="ed-zoom">
          <button onClick={() => setZoomCb(Math.max(0.2, zoom - 0.1))} title={t('缩小', 'Zoom out')}>−</button>
          <input type="range" min={0.2} max={2} step={0.05} value={zoom} onChange={(e) => setZoomCb(parseFloat(e.target.value))} />
          <button onClick={() => setZoomCb(Math.min(2, zoom + 0.1))} title={t('放大', 'Zoom in')}>+</button>
          <span className="ed-zoom-val">{Math.round(zoom * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
