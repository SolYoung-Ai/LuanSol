/* ============================================================
 * LunaSol V7 统一创作工作台
 * ------------------------------------------------------------
 * 复用全局 DesignDoc/Face/Layer 类型和项目系统
 * 三栏布局：左侧 AI 对话 + 中间设计画布 + 右侧属性面板
 * 真正接入设计引擎、AI 模型和文件导出系统。
 * ============================================================ */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../store';
import { go, useHash } from '../ui';
import { useAuth } from '../cloud/auth';
import { useSubscription, recordUsage } from '../cloud/subscription';
import { loadAI, llmChat, llmJson, llmImage } from '../engine/llm';
import { buildSchemes, addImageLayer, cloneDesign, faceMarkup } from '../engine/design';
import { styleById } from '../v3/styles';
import { buildDieline, faceSizes, STRUCTURES, structureById } from '../engine/structure';
import { spreadSvg, svgToCanvas } from '../engine/export';
import { uid, downloadBlob, mmToPx } from '../engine/utils';
import Viewer3D from '../components/Viewer3D';
import type { DesignDoc, Face, FaceId, Layer, TextLayer, ImageLayer, ShapeLayer, DesignBrief, ChatMessage, StructureId } from '../types';
import { createEmptyBrief } from '../engine/brief';

const SYSTEM_PROMPT = `你是 Luna，LunaSol 的包装设计主理人。你是一位有 12 年经验、服务过 200+ 品牌的资深包装设计师，审美高、懂印刷工艺、能聊商业也能聊创意。

你的工作方式：
1. 像一个真正的设计师那样和用户聊天，不要像客服机器人
2. 一次只问一个最重要的问题，不要一次性抛出一堆问题
3. 用户说得模糊时，主动给出专业建议和选项
4. 用户说得足够清楚时，直接开始设计，不要反复确认
5. 主动提取用户提到的所有信息，不要重复询问

你需要收集的信息：
- 产品是什么（茶叶/咖啡/护肤品/零食等）
- 品牌名
- 目标人群
- 设计风格（现代/国风/极简/复古等）
- 主色调
- 材质（牛皮纸/白卡/铁盒/玻璃等）
- 包装尺寸和结构
- 是否需要插画/图案
- 产品文案
- 是否需要条形码

当信息足够开始初步设计时，告诉用户：「我已经理解了你的需求，现在开始为你生成设计方案。」

回复要自然、专业、有温度，不要太官方。`;

// 输入框通用样式
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 12,
  boxSizing: 'border-box',
};

// 迷你按钮（图层列表里的小图标）
const miniBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  padding: 2,
  lineHeight: 1,
};

// 小按钮（操作行）
const smallBtn: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  padding: '3px 8px',
};

export default function Studio() {
  const { s, dieline, update, patchBrief, addChat, saveProject, loadProject, addVersion, restoreVersion } = useApp();
  const auth = useAuth();
  const sub = useSubscription();
  const hash = useHash();
  const projectId = new URLSearchParams(hash.split('?')[1] || '').get('id');

  // 三栏宽度
  const [leftWidth, setLeftWidth] = useState(360);
  const [rightWidth, setRightWidth] = useState(320);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // 当前包装面
  const [currentFace, setCurrentFace] = useState<FaceId>('front');

  // 选中图层
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);

  // 画布
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');

  // 生成状态
  const [generating, setGenerating] = useState(false);
  const [genQueue, setGenQueue] = useState<{ name: string; status: 'waiting' | 'running' | 'done' | 'error' }[]>([]);

  // 对话
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 设计需求摘要展开
  const [briefOpen, setBriefOpen] = useState(false);

  // 版本历史
  const [historyOpen, setHistoryOpen] = useState(false);

  // 拖拽状态
  const dragState = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // 缩放状态
  type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
  const resizeState = useRef<{
    id: string; handle: HandlePos;
    startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  } | null>(null);

  // 核心数据（提前定义，供后面的回调使用）
  const design = s.design;
  const brief = s.brief;
  const face = design?.faces[currentFace] || null;

  // 撤销/重做历史栈
  const pastRef = useRef<DesignDoc[]>([]);
  const futureRef = useRef<DesignDoc[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // 记录历史（在修改 design 前调用）
  const pushHistory = useCallback(() => {
    if (!design) return;
    pastRef.current.push(JSON.parse(JSON.stringify(design)));
    if (pastRef.current.length > 50) pastRef.current.shift(); // 最多保留 50 步
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [design]);

  // 撤销
  const undo = useCallback(() => {
    if (!pastRef.current.length || !design) return;
    const prev = pastRef.current.pop()!;
    futureRef.current.push(JSON.parse(JSON.stringify(design)));
    update({ design: prev });
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
  }, [design, update]);

  // 重做
  const redo = useCallback(() => {
    if (!futureRef.current.length || !design) return;
    const next = futureRef.current.pop()!;
    pastRef.current.push(JSON.parse(JSON.stringify(design)));
    update({ design: next });
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }, [design, update]);

  // 快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // 初始化：加载项目或创建新项目
  useEffect(() => {
    if (projectId) {
      loadProject(projectId);
    } else if (!s.activeId) {
      // 新建项目
      const newDesign = buildSchemes(s.brief, styleById(s.draft.style_id || 'minimal'))[0];
      update({ design: newDesign, activeId: null });
    }
  }, [projectId]);

  // 滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [s.chat, loading]);

  // 局部 AI 修改：只修改选中的图层
  const localEdit = async (instruction: string) => {
    if (!selectedL || !face || !design) return;
    const ai = loadAI();
    const aiWithModel = { ...ai, cloudbaseUid: auth.user?.id || '' };

    addChat({ role: 'ai', text: `正在修改「${selectedL.name}」...` });

    if (selectedL.type === 'image') {
      // 图片图层：调用图像生成模型重新生成
      const imgLayer = selectedL as ImageLayer;
      const prompt = `包装设计素材修改。原素材：${selectedL.name}。修改要求：${instruction}。设计风格：${brief.style || '现代简约'}。保持素材用途和构图风格一致，只按要求修改。`;
      const newImg = await llmImage(prompt, aiWithModel);

      // 只替换选中图层的图片，其他都不动
      pushHistory();
      const layers = face.layers.map((l) =>
        l.id === imgLayer.id
          ? { ...l, src: newImg.src, naturalW: newImg.naturalW, naturalH: newImg.naturalH } as ImageLayer
          : l
      );
      update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
      addVersion(`局部修改：${selectedL.name}`);

      // 扣积分（10 积分/张）
      if (auth.user) {
        await recordUsage(auth.user.id, 10);
        sub.refresh();
      }

      addChat({ role: 'ai', text: `「${selectedL.name}」已经修改好了，你看看效果。如果不满意可以继续告诉我。` });
    } else if (selectedL.type === 'text') {
      // 文字图层：用 JSON 模型生成修改指令
      const textLayer = selectedL as TextLayer;
      const result = await llmJson<{ text?: string; fontSize?: number; color?: string; fontWeight?: number; align?: string }>(
        [
          { role: 'system', content: '你是文字设计修改助手。根据用户的修改要求，输出 JSON 对象，包含需要修改的字段：text(文字内容), fontSize(字号), color(颜色十六进制), fontWeight(字重300-700), align(left/center/right)。只输出 JSON，不要其他内容。' },
          { role: 'user', content: `当前文字：${textLayer.text}\n当前字号：${textLayer.fontSize}\n当前颜色：${textLayer.color}\n修改要求：${instruction}` },
        ],
        aiWithModel
      );

      pushHistory();
      const patch: Partial<TextLayer> = {};
      if (result.text) patch.text = result.text;
      if (result.fontSize) patch.fontSize = result.fontSize;
      if (result.color) patch.color = result.color;
      if (result.fontWeight) patch.fontWeight = result.fontWeight;
      if (result.align && ['left', 'center', 'right'].includes(result.align)) {
        patch.align = result.align as TextLayer['align'];
      }
      const layers = face.layers.map((l) =>
        l.id === textLayer.id ? ({ ...l, ...patch } as TextLayer) : l
      );
      update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
      addVersion(`文字修改：${selectedL.name}`);

      if (auth.user) {
        await recordUsage(auth.user.id, 1);
        sub.refresh();
      }

      addChat({ role: 'ai', text: `文字已经修改好了。` });
    } else {
      // 形状图层：简单修改颜色
      const shapeLayer = selectedL as ShapeLayer;
      const result = await llmJson<{ fill?: string }>(
        [
          { role: 'system', content: '你是颜色修改助手。根据用户要求输出 JSON，包含 fill 字段（十六进制颜色）。只输出 JSON。' },
          { role: 'user', content: `当前颜色：${shapeLayer.fill}\n修改要求：${instruction}` },
        ],
        aiWithModel
      );
      if (result.fill) {
        pushHistory();
        const layers = face.layers.map((l) =>
          l.id === shapeLayer.id ? ({ ...l, fill: result.fill } as ShapeLayer) : l
        );
        update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
      }
      addChat({ role: 'ai', text: `颜色已经修改好了。` });
    }
  };

  // 发送消息
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);

    addChat({ role: 'user', text });

    // 如果有选中图层，走局部修改流程
    if (selectedLayer) {
      try {
        await localEdit(text);
      } catch (e) {
        addChat({ role: 'ai', text: `修改失败：${(e as Error).message}。请稍后再试。` });
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const ai = loadAI();
      const aiWithModel = { ...ai, cloudbaseUid: auth.user?.id || '' };
      const reply = await llmChat([
        { role: 'system', content: SYSTEM_PROMPT },
        ...s.chat.map((m) => ({ role: m.role === 'ai' ? 'assistant' as const : m.role, content: m.text })),
      ], aiWithModel);

      addChat({ role: 'ai', text: reply });

      // 扣减对话积分（1积分）
      if (auth.user) {
        await recordUsage(auth.user.id, 1);
        sub.refresh();
      }

      // 异步提取设计简报
      llmJson<Partial<DesignBrief>>([
        { role: 'user', content: `从以下对话中提取包装设计信息，只输出 JSON 对象，字段包括：product, brand, style, material, colors, audience, size, structure, illustration, copy, barcode。没有的字段留空。\n\n对话：${s.chat.map((m) => m.text).join('\n')}` },
      ], aiWithModel)
        .then((extracted) => {
          const cleaned = Object.fromEntries(Object.entries(extracted).filter(([, v]) => v));
          patchBrief(cleaned);
        })
        .catch(() => { /* 提取失败不影响对话 */ });
    } catch (e) {
      const msg = (e as Error).message || 'AI 暂时连不上';
      addChat({ role: 'ai', text: `抱歉，${msg}。请稍后再试。` });
    } finally {
      setLoading(false);
    }
  };

  // 生成设计方案
  const generateDesign = async () => {
    if (!auth.user) {
      go('/luna?login=1');
      return;
    }
    if (generating) return;
    setGenerating(true);
    pushHistory(); // 生成前记录历史

    try {
      const ai = loadAI();
      const aiWithModel = { ...ai, cloudbaseUid: auth.user?.id || '' };

      // 1. 生成背景材质
      addChat({ role: 'ai', text: '正在生成背景材质...' });
      setGenQueue([{ name: '背景材质', status: 'running' }]);
      const bgPrompt = `${brief.material || '牛皮纸'}材质纹理，${brief.colors[0] || '米白色'}背景，包装设计底纹，高清，细腻质感`;
      const bgImg = await llmImage(bgPrompt, aiWithModel);
      setGenQueue((prev) => prev.map((q) => q.name === '背景材质' ? { ...q, status: 'done' } : q));

      // 2. 生成主视觉插画
      addChat({ role: 'ai', text: '正在生成主视觉插画...' });
      setGenQueue((prev) => [...prev, { name: '主视觉插画', status: 'running' }]);
      const illusPrompt = `${brief.motif || '山水插画'}，${brief.style || '现代东方风格'}，${brief.product || '茶叶'}主题，包装设计插画，干净背景`;
      const illusImg = await llmImage(illusPrompt, aiWithModel);
      setGenQueue((prev) => prev.map((q) => q.name === '主视觉插画' ? { ...q, status: 'done' } : q));

      // 3. 生成贴纸装饰
      addChat({ role: 'ai', text: '正在生成装饰贴纸...' });
      setGenQueue((prev) => [...prev, { name: '装饰贴纸', status: 'running' }]);
      const stickerPrompt = `小贴纸装饰，${brief.product || '茶叶'}主题，${brief.style || '现代东方'}风格，透明背景，独立小图标`;
      const stickerImg = await llmImage(stickerPrompt, aiWithModel);
      setGenQueue((prev) => prev.map((q) => q.name === '装饰贴纸' ? { ...q, status: 'done' } : q));

      // 4. 组装到 DesignDoc
      const baseDesign = buildSchemes(brief, styleById(s.draft.style_id || 'minimal'))[0];
      let newDesign = cloneDesign(baseDesign);

      // 把生成的图片加到正面图层
      const frontFace = newDesign.faces.front;
      if (frontFace) {
        // 背景材质
        const bgLayer: ImageLayer = {
          id: uid(), type: 'image', name: '背景材质',
          x: 0, y: 0, w: frontFace.w, h: frontFace.h,
          rotation: 0, opacity: 1, locked: false,
          src: bgImg.src, naturalW: bgImg.naturalW, naturalH: bgImg.naturalH, fit: 'cover',
        };
        frontFace.layers = [bgLayer, ...frontFace.layers];

        // 主视觉插画
        const illusLayer: ImageLayer = {
          id: uid(), type: 'image', name: '主视觉插画',
          x: frontFace.w * 0.1, y: frontFace.h * 0.15,
          w: frontFace.w * 0.8, h: frontFace.h * 0.5,
          rotation: 0, opacity: 1, locked: false,
          src: illusImg.src, naturalW: illusImg.naturalW, naturalH: illusImg.naturalH, fit: 'contain',
        };
        frontFace.layers = [...frontFace.layers, illusLayer];

        // 装饰贴纸
        const stickerLayer: ImageLayer = {
          id: uid(), type: 'image', name: '装饰贴纸',
          x: frontFace.w * 0.7, y: frontFace.h * 0.7,
          w: frontFace.w * 0.2, h: frontFace.w * 0.2,
          rotation: 0, opacity: 1, locked: false,
          src: stickerImg.src, naturalW: stickerImg.naturalW, naturalH: stickerImg.naturalH, fit: 'contain',
        };
        frontFace.layers = [...frontFace.layers, stickerLayer];
      }

      update({ design: newDesign });
      addVersion('AI 生成初版');

      // 扣减积分（3张图，每张10积分）
      await recordUsage(auth.user.id, 30);
      sub.refresh();

      addChat({ role: 'ai', text: '设计初版已经生成完成！你可以点击画布上的任意元素进行修改。' });
    } catch (e) {
      const msg = (e as Error).message || '生成失败';
      addChat({ role: 'ai', text: `抱歉，${msg}。请稍后再试。` });
    } finally {
      setGenerating(false);
      setGenQueue([]);
    }
  };

  // 图层操作
  const onLayerMouseDown = (e: React.MouseEvent, layer: Layer) => {
    if (layer.locked) return;
    e.stopPropagation();
    setSelectedLayer(layer.id);
    pushHistory(); // 拖拽开始前记录历史
    dragState.current = {
      id: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: layer.x,
      origY: layer.y,
    };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    // 优先处理缩放
    if (resizeState.current) {
      onResizeMouseMove(e);
      return;
    }
    if (!dragState.current || !face) return;
    const dx = (e.clientX - dragState.current.startX) / zoom;
    const dy = (e.clientY - dragState.current.startY) / zoom;
    const layers = face.layers.map((l) =>
      l.id === dragState.current!.id
        ? { ...l, x: dragState.current!.origX + dx, y: dragState.current!.origY + dy }
        : l
    );
    update({ design: { ...design!, faces: { ...design!.faces, [currentFace]: { ...face, layers } } } });
  };

  const onMouseUp = () => {
    dragState.current = null;
    resizeState.current = null;
  };

  // 缩放：控制点按下
  const onResizeMouseDown = (e: React.MouseEvent, layer: Layer, handle: HandlePos) => {
    e.stopPropagation();
    e.preventDefault();
    pushHistory();
    resizeState.current = {
      id: layer.id, handle,
      startX: e.clientX, startY: e.clientY,
      origX: layer.x, origY: layer.y,
      origW: layer.w, origH: layer.h,
    };
  };

  // 缩放：鼠标移动
  const onResizeMouseMove = (e: React.MouseEvent) => {
    const rs = resizeState.current;
    if (!rs || !face || !design) return;
    const dx = (e.clientX - rs.startX) / (zoom * 3.78); // 像素转 mm
    const dy = (e.clientY - rs.startY) / (zoom * 3.78);

    let newX = rs.origX, newY = rs.origY, newW = rs.origW, newH = rs.origH;
    const h = rs.handle;

    // 右边
    if (h.includes('e')) newW = Math.max(5, rs.origW + dx);
    // 左边
    if (h.includes('w')) {
      newW = Math.max(5, rs.origW - dx);
      newX = rs.origX + (rs.origW - newW);
    }
    // 下边
    if (h.includes('s')) newH = Math.max(5, rs.origH + dy);
    // 上边
    if (h.includes('n')) {
      newH = Math.max(5, rs.origH - dy);
      newY = rs.origY + (rs.origH - newH);
    }

    // 角点等比例缩放（按住 Shift 或者默认角点等比例）
    if (e.shiftKey && (h === 'nw' || h === 'ne' || h === 'se' || h === 'sw')) {
      const ratio = rs.origW / rs.origH;
      if (newW / newH > ratio) {
        newH = newW / ratio;
      } else {
        newW = newH * ratio;
      }
      // 重新计算位置
      if (h.includes('w')) newX = rs.origX + (rs.origW - newW);
      if (h.includes('n')) newY = rs.origY + (rs.origH - newH);
    }

    const layers = face.layers.map((l) =>
      l.id === rs.id ? { ...l, x: newX, y: newY, w: newW, h: newH } : l
    );
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };

  const toggleLock = (id: string) => {
    if (!face) return;
    pushHistory();
    const layers = face.layers.map((l) => l.id === id ? { ...l, locked: !l.locked } : l);
    update({ design: { ...design!, faces: { ...design!.faces, [currentFace]: { ...face, layers } } } });
  };

  const toggleVisible = (id: string) => {
    if (!face) return;
    pushHistory();
    const layers = face.layers.map((l) => l.id === id ? { ...l, hidden: !l.hidden } : l);
    update({ design: { ...design!, faces: { ...design!.faces, [currentFace]: { ...face, layers } } } });
  };

  const deleteLayer = (id: string) => {
    if (!face) return;
    pushHistory();
    const layers = face.layers.filter((l) => l.id !== id);
    update({ design: { ...design!, faces: { ...design!.faces, [currentFace]: { ...face, layers } } } });
    if (selectedLayer === id) setSelectedLayer(null);
  };

  // 复制图层
  const duplicateLayer = (id: string) => {
    if (!face || !design) return;
    const src = face.layers.find((l) => l.id === id);
    if (!src) return;
    pushHistory();
    const copy = JSON.parse(JSON.stringify(src)) as Layer;
    copy.id = uid();
    copy.name = src.name + ' 副本';
    copy.x = src.x + 5;
    copy.y = src.y + 5;
    const idx = face.layers.findIndex((l) => l.id === id);
    const layers = [...face.layers];
    layers.splice(idx + 1, 0, copy);
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
    setSelectedLayer(copy.id);
  };

  // 重命名图层
  const renameLayer = (id: string) => {
    const l = face?.layers.find((x) => x.id === id);
    if (!l) return;
    const name = prompt('图层名称', l.name);
    if (name && name.trim()) updateLayer(id, { name: name.trim() });
  };

  // 调整层级：上移
  const moveLayerUp = (id: string) => {
    if (!face || !design) return;
    const idx = face.layers.findIndex((l) => l.id === id);
    if (idx >= face.layers.length - 1) return;
    pushHistory();
    const layers = [...face.layers];
    [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]];
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };

  // 调整层级：下移
  const moveLayerDown = (id: string) => {
    if (!face || !design) return;
    const idx = face.layers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    pushHistory();
    const layers = [...face.layers];
    [layers[idx], layers[idx - 1]] = [layers[idx - 1], layers[idx]];
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };

  // 置顶
  const bringToFront = (id: string) => {
    if (!face || !design) return;
    pushHistory();
    const l = face.layers.find((x) => x.id === id);
    if (!l) return;
    const layers = [...face.layers.filter((x) => x.id !== id), l];
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };

  // 置底
  const sendToBack = (id: string) => {
    if (!face || !design) return;
    pushHistory();
    const l = face.layers.find((x) => x.id === id);
    if (!l) return;
    const layers = [l, ...face.layers.filter((x) => x.id !== id)];
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };

  // 更新选中图层的属性
  const updateLayer = (id: string, patch: Partial<Layer>) => {
    if (!face || !design) return;
    pushHistory();
    const layers = face.layers.map((l) => l.id === id ? ({ ...l, ...patch } as Layer) : l);
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };

  const selectedL = face?.layers.find((l) => l.id === selectedLayer) || null;

  // 导出 PNG
  const exportPNG = async () => {
    if (!design) return;
    const svg = spreadSvg(design, dieline, 0, false);
    const canvas = await svgToCanvas(svg, dieline.sheets[0].width, dieline.sheets[0].height, 150);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${design.name || 'lunasol'}.png`);
    });
  };

  // 导出 PDF
  const exportPDF = async () => {
    if (!design) return;
    const { spreadSvg, svgToCanvas } = await import('../engine/export');
    const { jsPDF } = await import('jspdf');
    const svg = spreadSvg(design, dieline, 0, true);
    const canvas = await svgToCanvas(svg, dieline.sheets[0].width, dieline.sheets[0].height, 300);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: dieline.sheets[0].width > dieline.sheets[0].height ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [dieline.sheets[0].width, dieline.sheets[0].height],
    });
    pdf.addImage(imgData, 'PNG', 0, 0, dieline.sheets[0].width, dieline.sheets[0].height);
    pdf.save(`${design.name || 'lunasol'}.pdf`);
  };

  return (
    <div className="studio-layout" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 左侧：AI 对话 */}
      {!leftCollapsed && (
        <div style={{ width: leftWidth, borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column' }}>
          {/* 顶部：设计需求摘要 */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
            <button
              onClick={() => setBriefOpen(!briefOpen)}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                设计需求摘要 {briefOpen ? '▼' : '▶'}
              </div>
            </button>
            {briefOpen && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#666', lineHeight: 1.8 }}>
                <div>产品：{brief.product || '—'}</div>
                <div>品牌：{brief.brand || '—'}</div>
                <div>风格：{brief.style || '—'}</div>
                <div>材质：{brief.material || '—'}</div>
                <div>主色：{brief.colors.join(', ') || '—'}</div>
              </div>
            )}
          </div>

          {/* 模式提示条 */}
          <div style={{
            padding: '8px 16px',
            fontSize: 12,
            background: selectedLayer ? '#fef3c7' : '#f0f9ff',
            color: selectedLayer ? '#92400e' : '#075985',
            borderBottom: '1px solid #eee',
          }}>
            {selectedLayer
              ? `🎯 模块修改模式：输入指令只会修改选中的「${selectedL?.name || ''}」`
              : '💬 整体对话模式：描述你的需求，AI 会帮你梳理设计方向'}
          </div>

          {/* 对话列表 */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {s.chat.map((m, i) => (
              <div key={i} style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 14,
                  lineHeight: 1.6,
                  background: m.role === 'user' ? '#333' : '#f5f5f5',
                  color: m.role === 'user' ? '#fff' : '#333',
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ marginBottom: 12, color: '#999', fontSize: 14 }}>Luna 正在输入...</div>
            )}
          </div>

          {/* 生成队列 */}
          {genQueue.length > 0 && (
            <div style={{ padding: '8px 16px', borderTop: '1px solid #eee', fontSize: 12 }}>
              {genQueue.map((q, i) => (
                <div key={i} style={{ marginBottom: 4, color: q.status === 'done' ? '#22c55e' : q.status === 'error' ? '#ef4444' : '#f59e0b' }}>
                  {q.status === 'running' ? '⏳' : q.status === 'done' ? '✓' : '⏸'} {q.name}
                </div>
              ))}
            </div>
          )}

          {/* 输入框 */}
          <div style={{ padding: 16, borderTop: '1px solid #eee' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="告诉我你的设计想法..."
                style={{ flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{ padding: '10px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              >
                发送
              </button>
            </div>
            <button
              onClick={generateDesign}
              disabled={generating}
              style={{
                marginTop: 8, width: '100%', padding: '10px',
                background: generating ? '#999' : '#f5c451', color: '#333',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
              }}
            >
              {generating ? '生成中...' : '✨ 生成设计方案'}
            </button>
          </div>
        </div>
      )}

      {/* 中间：设计画布 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        {/* 顶部工具栏 */}
        <div style={{ height: 48, borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, background: '#fff' }}>
          <button onClick={() => go('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← 返回</button>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{design?.name || '未命名项目'}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={undo}
            disabled={!canUndo}
            style={{ padding: '4px 10px', background: '#fff', border: '1px solid #ddd', borderRadius: 6, cursor: canUndo ? 'pointer' : 'not-allowed', fontSize: 13, opacity: canUndo ? 1 : 0.4 }}
            title="撤销 (Cmd+Z)"
          >
            ↶ 撤销
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            style={{ padding: '4px 10px', background: '#fff', border: '1px solid #ddd', borderRadius: 6, cursor: canRedo ? 'pointer' : 'not-allowed', fontSize: 13, opacity: canRedo ? 1 : 0.4 }}
            title="重做 (Cmd+Shift+Z)"
          >
            ↷ 重做
          </button>
          <button onClick={() => setHistoryOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>版本历史</button>
          <button onClick={() => setViewMode('2d')} style={{ padding: '4px 12px', background: viewMode === '2d' ? '#333' : '#fff', color: viewMode === '2d' ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>2D</button>
          <button onClick={() => setViewMode('3d')} style={{ padding: '4px 12px', background: viewMode === '3d' ? '#333' : '#fff', color: viewMode === '3d' ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>3D</button>
          <button onClick={exportPNG} style={{ padding: '4px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>导出 PNG</button>
          <button onClick={exportPDF} style={{ padding: '4px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>导出 PDF</button>
        </div>

        {/* 包装面切换 */}
        <div style={{ height: 36, borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 4, background: '#fff' }}>
          {(['front', 'back', 'left', 'right', 'top'] as FaceId[]).map((f) => (
            <button
              key={f}
              onClick={() => setCurrentFace(f)}
              style={{
                padding: '4px 12px', fontSize: 12,
                background: currentFace === f ? '#333' : '#fff',
                color: currentFace === f ? '#fff' : '#666',
                border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer',
              }}
            >
              {f === 'front' ? '正面' : f === 'back' ? '背面' : f === 'left' ? '左侧' : f === 'right' ? '右侧' : '顶面'}
            </button>
          ))}
        </div>

        {/* 画布区域 */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {viewMode === '2d' && face && (
            <div
              style={{
                position: 'relative',
                width: face.w * zoom * 3.78, // mm to px (96dpi)
                height: face.h * zoom * 3.78,
                background: face.bg,
                boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
              }}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onClick={() => setSelectedLayer(null)}
            >
              {face.layers.filter((l) => !l.hidden).map((layer) => (
                <div
                  key={layer.id}
                  onMouseDown={(e) => onLayerMouseDown(e, layer)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    left: layer.x * zoom * 3.78,
                    top: layer.y * zoom * 3.78,
                    width: layer.w * zoom * 3.78,
                    height: layer.h * zoom * 3.78,
                    border: selectedLayer === layer.id ? '2px solid #f5c451' : 'none',
                    cursor: layer.locked ? 'not-allowed' : 'move',
                    opacity: layer.opacity,
                  }}
                >
                  {layer.type === 'text' && (
                    <div style={{
                      fontSize: (layer as TextLayer).fontSize * zoom,
                      color: (layer as TextLayer).color,
                      fontFamily: (layer as TextLayer).fontFamily,
                      fontWeight: (layer as TextLayer).fontWeight,
                      textAlign: (layer as TextLayer).align,
                      lineHeight: (layer as TextLayer).lineHeight,
                    }}>
                      {(layer as TextLayer).text}
                    </div>
                  )}
                  {layer.type === 'image' && (
                    <img
                      src={(layer as ImageLayer).src}
                      style={{ width: '100%', height: '100%', objectFit: (layer as ImageLayer).fit }}
                      draggable={false}
                    />
                  )}
                  {layer.type === 'shape' && (
                    <div style={{ width: '100%', height: '100%', background: (layer as ShapeLayer).fill }} />
                  )}

                  {/* 8 个缩放控制点（选中时显示） */}
                  {selectedLayer === layer.id && !layer.locked && (
                    <>
                      {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandlePos[]).map((h) => {
                        const posStyle: React.CSSProperties = {
                          position: 'absolute',
                          width: 10, height: 10,
                          background: '#fff',
                          border: '2px solid #f5c451',
                          borderRadius: 2,
                          zIndex: 10,
                        };
                        if (h === 'nw') { posStyle.top = -6; posStyle.left = -6; posStyle.cursor = 'nwse-resize'; }
                        if (h === 'n') { posStyle.top = -6; posStyle.left = '50%'; posStyle.transform = 'translateX(-50%)'; posStyle.cursor = 'ns-resize'; }
                        if (h === 'ne') { posStyle.top = -6; posStyle.right = -6; posStyle.cursor = 'nesw-resize'; }
                        if (h === 'e') { posStyle.top = '50%'; posStyle.right = -6; posStyle.transform = 'translateY(-50%)'; posStyle.cursor = 'ew-resize'; }
                        if (h === 'se') { posStyle.bottom = -6; posStyle.right = -6; posStyle.cursor = 'nwse-resize'; }
                        if (h === 's') { posStyle.bottom = -6; posStyle.left = '50%'; posStyle.transform = 'translateX(-50%)'; posStyle.cursor = 'ns-resize'; }
                        if (h === 'sw') { posStyle.bottom = -6; posStyle.left = -6; posStyle.cursor = 'nesw-resize'; }
                        if (h === 'w') { posStyle.top = '50%'; posStyle.left = -6; posStyle.transform = 'translateY(-50%)'; posStyle.cursor = 'ew-resize'; }
                        return (
                          <div
                            key={h}
                            style={posStyle}
                            onMouseDown={(e) => onResizeMouseDown(e, layer, h)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        );
                      })}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {viewMode === '3d' && design && (
            <Viewer3D
              design={design}
              structure={brief.structure || 'tuck'}
              size={brief.size}
              open={true}
              material="kraft"
              background="light"
              light={0.8}
              autoRotate={true}
            />
          )}
        </div>
      </div>

      {/* 右侧：属性和图层 */}
      {!rightCollapsed && (
        <div style={{ width: rightWidth, borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column', background: '#fff' }}>
          {/* 顶部：选中图层属性 */}
          <div style={{ padding: 16, borderBottom: '1px solid #eee', maxHeight: '50%', overflowY: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 12 }}>
              {selectedL ? `选中：${selectedL.name}` : '未选中图层'}
            </div>
            {selectedL && (
              <div style={{ fontSize: 12, color: '#666' }}>
                {/* 通用属性 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <label>
                    <div style={{ marginBottom: 4 }}>X (mm)</div>
                    <input
                      type="number" step="0.1" value={selectedL.x.toFixed(1)}
                      onChange={(e) => updateLayer(selectedL.id, { x: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </label>
                  <label>
                    <div style={{ marginBottom: 4 }}>Y (mm)</div>
                    <input
                      type="number" step="0.1" value={selectedL.y.toFixed(1)}
                      onChange={(e) => updateLayer(selectedL.id, { y: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </label>
                  <label>
                    <div style={{ marginBottom: 4 }}>宽度 (mm)</div>
                    <input
                      type="number" step="0.1" value={selectedL.w.toFixed(1)}
                      onChange={(e) => updateLayer(selectedL.id, { w: parseFloat(e.target.value) || 1 })}
                      style={inputStyle}
                    />
                  </label>
                  <label>
                    <div style={{ marginBottom: 4 }}>高度 (mm)</div>
                    <input
                      type="number" step="0.1" value={selectedL.h.toFixed(1)}
                      onChange={(e) => updateLayer(selectedL.id, { h: parseFloat(e.target.value) || 1 })}
                      style={inputStyle}
                    />
                  </label>
                  <label>
                    <div style={{ marginBottom: 4 }}>旋转 (°)</div>
                    <input
                      type="number" value={selectedL.rotation}
                      onChange={(e) => updateLayer(selectedL.id, { rotation: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </label>
                  <label>
                    <div style={{ marginBottom: 4 }}>透明度</div>
                    <input
                      type="number" min="0" max="1" step="0.1" value={selectedL.opacity}
                      onChange={(e) => updateLayer(selectedL.id, { opacity: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </label>
                </div>

                {/* 文字图层专属属性 */}
                {selectedL.type === 'text' && (() => {
                  const tl = selectedL as TextLayer;
                  return (
                    <div style={{ borderTop: '1px solid #eee', paddingTop: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>文字属性</div>
                      <label style={{ display: 'block', marginBottom: 8 }}>
                        <div style={{ marginBottom: 4 }}>文字内容</div>
                        <textarea
                          value={tl.text}
                          onChange={(e) => updateLayer(tl.id, { text: e.target.value })}
                          rows={3}
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <label>
                          <div style={{ marginBottom: 4 }}>字号 (pt)</div>
                          <input
                            type="number" value={tl.fontSize}
                            onChange={(e) => updateLayer(tl.id, { fontSize: parseFloat(e.target.value) || 12 })}
                            style={inputStyle}
                          />
                        </label>
                        <label>
                          <div style={{ marginBottom: 4 }}>字重</div>
                          <select
                            value={tl.fontWeight}
                            onChange={(e) => updateLayer(tl.id, { fontWeight: parseInt(e.target.value) })}
                            style={inputStyle}
                          >
                            <option value="300">300 细</option>
                            <option value="400">400 常规</option>
                            <option value="500">500 中等</option>
                            <option value="600">600 半粗</option>
                            <option value="700">700 粗</option>
                          </select>
                        </label>
                        <label>
                          <div style={{ marginBottom: 4 }}>颜色</div>
                          <input
                            type="color" value={tl.color}
                            onChange={(e) => updateLayer(tl.id, { color: e.target.value })}
                            style={{ ...inputStyle, height: 34, padding: 2 }}
                          />
                        </label>
                        <label>
                          <div style={{ marginBottom: 4 }}>行高</div>
                          <input
                            type="number" step="0.1" value={tl.lineHeight}
                            onChange={(e) => updateLayer(tl.id, { lineHeight: parseFloat(e.target.value) || 1.2 })}
                            style={inputStyle}
                          />
                        </label>
                        <label>
                          <div style={{ marginBottom: 4 }}>字距 (em)</div>
                          <input
                            type="number" step="0.01" value={tl.letterSpacing}
                            onChange={(e) => updateLayer(tl.id, { letterSpacing: parseFloat(e.target.value) || 0 })}
                            style={inputStyle}
                          />
                        </label>
                        <label>
                          <div style={{ marginBottom: 4 }}>对齐</div>
                          <select
                            value={tl.align}
                            onChange={(e) => updateLayer(tl.id, { align: e.target.value as TextLayer['align'] })}
                            style={inputStyle}
                          >
                            <option value="left">左对齐</option>
                            <option value="center">居中</option>
                            <option value="right">右对齐</option>
                          </select>
                        </label>
                      </div>
                      <label style={{ display: 'block', marginBottom: 8 }}>
                        <div style={{ marginBottom: 4 }}>字体</div>
                        <select
                          value={tl.fontFamily}
                          onChange={(e) => updateLayer(tl.id, { fontFamily: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="system-ui, sans-serif">系统无衬线</option>
                          <option value="Georgia, serif">Georgia 衬线</option>
                          <option value="'Times New Roman', serif">Times New Roman</option>
                          <option value="Courier New, monospace">Courier New 等宽</option>
                        </select>
                      </label>
                    </div>
                  );
                })()}

                {/* 图片图层专属属性 */}
                {selectedL.type === 'image' && (() => {
                  const il = selectedL as ImageLayer;
                  return (
                    <div style={{ borderTop: '1px solid #eee', paddingTop: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>图片属性</div>
                      <label style={{ display: 'block', marginBottom: 8 }}>
                        <div style={{ marginBottom: 4 }}>填充模式</div>
                        <select
                          value={il.fit}
                          onChange={(e) => updateLayer(il.id, { fit: e.target.value as ImageLayer['fit'] })}
                          style={inputStyle}
                        >
                          <option value="contain">完整显示 (contain)</option>
                          <option value="cover">铺满裁切 (cover)</option>
                        </select>
                      </label>
                      <label style={{ display: 'block' }}>
                        <div style={{ marginBottom: 4 }}>替换图片</div>
                        <input
                          type="file" accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const img = new Image();
                              img.onload = () => {
                                updateLayer(il.id, {
                                  src: reader.result as string,
                                  naturalW: img.naturalWidth,
                                  naturalH: img.naturalHeight,
                                });
                              };
                              img.src = reader.result as string;
                            };
                            reader.readAsDataURL(file);
                          }}
                          style={{ fontSize: 11 }}
                        />
                      </label>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* 图层列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 12 }}>图层列表</div>
            {face?.layers.slice().reverse().map((layer) => (
              <div
                key={layer.id}
                onClick={() => setSelectedLayer(layer.id)}
                style={{
                  padding: '8px 10px',
                  marginBottom: 4,
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: selectedLayer === layer.id ? '#f5f5f5' : 'transparent',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {layer.type === 'text' ? '📝' : layer.type === 'image' ? '🖼' : '⬛'} {layer.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleVisible(layer.id); }}
                    style={miniBtn} title="显示/隐藏"
                  >
                    {layer.hidden ? '🚫' : '👁'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleLock(layer.id); }}
                    style={miniBtn} title="锁定/解锁"
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicateLayer(layer.id); }}
                    style={miniBtn} title="复制"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                    style={miniBtn} title="删除"
                  >
                    🗑
                  </button>
                </div>
                {/* 选中时展开更多操作 */}
                {selectedLayer === layer.id && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, paddingTop: 6, borderTop: '1px solid #eee' }}>
                    <button onClick={(e) => { e.stopPropagation(); renameLayer(layer.id); }} style={smallBtn}>
                      ✏️ 重命名
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); moveLayerUp(layer.id); }} style={smallBtn} title="上移一层">
                      ↑
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); moveLayerDown(layer.id); }} style={smallBtn} title="下移一层">
                      ↓
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); bringToFront(layer.id); }} style={smallBtn} title="置顶">
                      ⤒
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); sendToBack(layer.id); }} style={smallBtn} title="置底">
                      ⤓
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
