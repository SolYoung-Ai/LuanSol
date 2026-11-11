/* LunaSol 编辑器统一状态层（单一数据源）。
 * 所有编辑器状态、撤销重做、AI 逻辑、画布交互、图层操作、导出、印前都在这里，
 * 渲染组件通过 useEditor() 读取，避免多套状态和 props 层层透传。 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { tl } from '../langStore';
import { useHash } from '../ui';
import { useAuth } from '../cloud/auth';
import { useSubscription, recordUsage } from '../cloud/subscription';
import { PRICING } from '../cloud/plans';
import { loadAI, llmChat, llmJson, llmImage, aiEnabled } from '../engine/llm';
import { LUNA_PERSONA_PROMPT } from '../engine/persona';
import { buildSchemes, cloneDesign } from '../engine/design';
import { faceSizes } from '../engine/structure';
import { styleById } from '../v3/styles';
import { runPrepress, autoFix } from '../engine/prepress';
import { spreadSvg, svgToCanvas } from '../engine/export';
import { uid, downloadBlob } from '../engine/utils';
import type { DesignDoc, Face, FaceId, Layer, TextLayer, ImageLayer, ShapeLayer, DesignBrief, StructureId, Asset, AssetCategory } from '../types';
import { HandlePos, MM_TO_PX, TextPreset, ToolId, ViewMode } from './constants';
import { executeAction } from './ai/executor';
import { planFromUser } from './ai/planner';
import type { ToolHost } from './ai/types';
import { fileToPng, svgToPng } from './raster';

const SYSTEM_PROMPT = `${LUNA_PERSONA_PROMPT}

现在你在 LunaSol 的设计工作台里陪用户做包装，除了上面的人设，还要遵守这套工作方式：
1. 一次只问一个最重要的问题，不要一次性抛出一堆问题
2. 用户说得模糊时，主动给出专业建议和选项
3. 用户说得足够清楚时，直接开始设计，不要反复确认
4. 主动提取用户提到的所有信息，不要重复询问
需要留意的信息：产品、品牌名、目标人群、设计风格、主色调、材质、包装尺寸结构、是否需要插画图案、产品文案、是否需要条形码。
当信息足够开始初步设计时，告诉用户：「我已经理解了你的需求，现在开始为你生成设计方案。」`;

interface EditorCtx {
  // 数据
  s: ReturnType<typeof useApp>['s'];
  design: DesignDoc | null;
  brief: DesignBrief;
  face: Face | null;
  currentFace: FaceId;
  setCurrentFace: (f: FaceId) => void;
  // 工具与视图
  activeTool: ToolId;
  setActiveTool: (t: ToolId) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  // 选择
  selectedLayer: string | null;
  setSelectedLayer: React.Dispatch<React.SetStateAction<string | null>>;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedL: Layer | null;
  clearSelection: () => void;
  // 画布
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  showGrid: boolean;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  guides: { v?: number; h?: number };
  isPanning: boolean;
  spacePressed: React.MutableRefObject<boolean>;
  fitToScreen: () => void;
  // 生成
  generating: boolean;
  genQueue: { name: string; status: 'waiting' | 'running' | 'done' | 'error' }[];
  generateDesign: () => Promise<void>;
  // 对话
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  chatImages: { src: string; name: string }[];
  chatImgRef: React.RefObject<HTMLInputElement>;
  onPickChatImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeChatImage: (idx: number) => void;
  sendMessage: () => Promise<void>;
  briefOpen: boolean;
  setBriefOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // 保存
  saveStatus: 'idle' | 'saving' | 'saved';
  manualSave: () => void;
  // 图层操作
  toggleLock: (id: string) => void;
  toggleVisible: (id: string) => void;
  deleteLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  renameLayer: (id: string) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  updateLayer: (id: string, patch: Partial<Layer>, record?: boolean) => void;
  /** 新增文字图层（左栏「文字」面板的预设） */
  addTextPreset: (kind: TextPreset) => void;
  /** 把内置矢量素材栅格化后放进画布（形状 / 图标 / 纹样） */
  addSvgMaterial: (svg: string, name: string) => Promise<void>;
  /** 上传本地图片：转 PNG data URL，同时入素材库并加入画布 */
  uploadImages: (files: FileList | File[]) => Promise<number>;
  // 独立素材库
  addAssetToCanvas: (assetId: string) => void;
  assetFileRef: React.RefObject<HTMLInputElement>;
  onPickAssetFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  generateToLibrary: (prompt: string, category: import('../types').AssetCategory) => Promise<void>;
  assetBusy: boolean;
  removeAsset: (id: string) => void;
  toggleFavoriteAsset: (id: string) => void;
  // 画布交互
  onLayerMouseDown: (e: React.MouseEvent, layer: Layer) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onResizeMouseDown: (e: React.MouseEvent, layer: Layer, handle: HandlePos) => void;
  onRotateMouseDown: (e: React.MouseEvent, layer: Layer) => void;
  onCanvasMouseDown: (e: React.MouseEvent) => void;
  onCanvasMouseMove: (e: React.MouseEvent) => void;
  onCanvasMouseUp: (e: React.MouseEvent) => void;
  onCanvasMouseLeave: () => void;
  // 对齐
  alignLayers: (kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdist' | 'vdist') => void;
  // 导出
  exportPNG: () => Promise<void>;
  exportPDF: () => Promise<void>;
  exportSVG: () => void;
  exportZIP: () => Promise<void>;
  // 印前
  prepressOpen: boolean;
  prepressReport: ReturnType<typeof runPrepress> | null;
  openPrepress: () => void;
  closePrepress: () => void;
  doAutoFix: () => void;
  // 撤销重做
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
}

const Ctx = createContext<EditorCtx | null>(null);
export const useEditor = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEditor 必须在 EditorProvider 内使用');
  return c;
};

export function EditorProvider({
  children, projectId: forcedProjectId, initialTool,
}: {
  children: React.ReactNode;
  /** 强制指定项目 ID（嵌入流程时用）；不传则从 URL hash 解析，保持独立 /studio 行为 */
  projectId?: string;
  /** 挂载时初始激活的工具（如 'assets' 直接打开素材库） */
  initialTool?: ToolId;
}) {
  const { s, dieline, update, patchBrief, addChat, saveProject, loadProject, addVersion, syncProject, addAsset, removeAsset, toggleFavoriteAsset, setToast } = useApp();
  const auth = useAuth();
  const sub = useSubscription();
  const hash = useHash();
  const projectId = forcedProjectId ?? new URLSearchParams(hash.split('?')[1] || '').get('id');

  // 当前包装面
  const [currentFace, setCurrentFace] = useState<FaceId>('front');
  // 工具与视图
  const [activeTool, setActiveTool] = useState<ToolId>(initialTool ?? 'select');
  const [viewMode, setViewMode] = useState<ViewMode>('design');
  // 选中图层
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 画布
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [guides, setGuides] = useState<{ v?: number; h?: number }>({});
  const [isPanning, setIsPanning] = useState(false);
  // 生成
  const [generating, setGenerating] = useState(false);
  const [genQueue, setGenQueue] = useState<{ name: string; status: 'waiting' | 'running' | 'done' | 'error' }[]>([]);
  // 对话
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  // 保存
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 对话图片
  const [chatImages, setChatImages] = useState<{ src: string; name: string }[]>([]);
  const chatImgRef = useRef<HTMLInputElement>(null);
  // 平移
  const panState = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const spacePressed = useRef(false);
  // 旋转
  const rotateState = useRef<{ id: string; centerX: number; centerY: number } | null>(null);
  // 印前
  const [prepressOpen, setPrepressOpen] = useState(false);
  const [prepressReport, setPrepressReport] = useState<ReturnType<typeof runPrepress> | null>(null);
  // 拖拽 / 缩放
  const dragState = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeState = useRef<{
    id: string; handle: HandlePos;
    startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  } | null>(null);

  // 核心数据
  const design = s.design;
  const brief = s.brief;
  const face = design?.faces[currentFace] || null;

  // 撤销重做栈
  const pastRef = useRef<DesignDoc[]>([]);
  const futureRef = useRef<DesignDoc[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = useCallback(() => {
    if (!design) return;
    pastRef.current.push(JSON.parse(JSON.stringify(design)));
    if (pastRef.current.length > 50) pastRef.current.shift();
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [design]);

  const undo = useCallback(() => {
    if (!pastRef.current.length || !design) return;
    const prev = pastRef.current.pop()!;
    futureRef.current.push(JSON.parse(JSON.stringify(design)));
    update({ design: prev });
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
  }, [design, update]);

  const redo = useCallback(() => {
    if (!futureRef.current.length || !design) return;
    const next = futureRef.current.pop()!;
    pastRef.current.push(JSON.parse(JSON.stringify(design)));
    update({ design: next });
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }, [design, update]);

  // 1) 加载指定的已有项目
  useEffect(() => {
    if (projectId) loadProject(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // 2) 无项目、无 design 时，初始化统一默认尺寸的空白工程。
  //    响应 design 为空，这样首页 newProject() 清空后进入也会重新创建。
  useEffect(() => {
    if (projectId || s.activeId || design) return;
    // 统一真实默认尺寸，避免平面(最小兜底)/刀模/3D(零尺寸)三套尺寸不一致
    const DEFAULT_SIZE = { l: 200, w: 150, h: 80 };
    const effectiveBrief = s.brief.size.l
      ? s.brief
      : { ...s.brief, size: DEFAULT_SIZE };
    if (!s.brief.size.l) patchBrief({ size: DEFAULT_SIZE });
    const newDesign = buildSchemes(effectiveBrief, styleById(s.draft.style_id || 'minimal'))[0];
    update({ design: newDesign, activeId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, s.activeId, design, s.brief, s.draft.style_id]);

  // 自动保存
  useEffect(() => {
    if (!design) return;
    setSaveStatus('saving');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (s.activeId) syncProject();
      else saveProject();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }, 1500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, s.activeId]);

  const manualSave = () => {
    if (!design) return;
    setSaveStatus('saving');
    saveProject();
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  // 对话滚动
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [s.chat, loading]);

  // 对话图片选择
  const onPickChatImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > 800) { h = h * 800 / w; w = 800; }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d')!.drawImage(img, 0, 0, w, h);
          setChatImages((prev) => [...prev, { src: c.toDataURL('image/jpeg', 0.85), name: file.name }]);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeChatImage = (idx: number) => setChatImages((prev) => prev.filter((_, i) => i !== idx));

  // 局部 AI 修改
  const localEdit = async (instruction: string) => {
    if (!selectedL || !face || !design) return;
    const ai = loadAI();
    const aiWithModel = { ...ai, cloudbaseUid: auth.user?.id || '' };

    addChat({ role: 'ai', text: `正在修改「${selectedL.name}」...` });

    if (selectedL.type === 'image') {
      const imgLayer = selectedL as ImageLayer;
      const prompt = `包装设计素材修改。原素材：${selectedL.name}。修改要求：${instruction}。设计风格：${brief.style || '现代简约'}。保持素材用途和构图风格一致，只按要求修改。`;
      const newImg = await llmImage(prompt, aiWithModel);
      pushHistory();
      const layers = face.layers.map((l) =>
        l.id === imgLayer.id
          ? { ...l, src: newImg.src, naturalW: newImg.naturalW, naturalH: newImg.naturalH } as ImageLayer
          : l
      );
      update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
      addVersion(`局部修改：${selectedL.name}`);
      if (auth.user) { await recordUsage(auth.user.id, PRICING.costs.imageFlash, 'image'); sub.refresh(); }
      addChat({ role: 'ai', text: `「${selectedL.name}」已经修改好了，你看看效果。如果不满意可以继续告诉我。` });
    } else if (selectedL.type === 'text') {
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
      const layers = face.layers.map((l) => l.id === textLayer.id ? ({ ...l, ...patch } as TextLayer) : l);
      update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
      addVersion(`文字修改：${selectedL.name}`);
      // 文字/颜色类修改只是文本模型的一次调用，按「对话免费」口径不扣积分。 
      addChat({ role: 'ai', text: `文字已经修改好了。` });
    } else {
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
        const layers = face.layers.map((l) => l.id === shapeLayer.id ? ({ ...l, fill: result.fill } as ShapeLayer) : l);
        update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
      }
      addChat({ role: 'ai', text: `颜色已经修改好了。` });
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    const imgs = [...chatImages];
    if ((!text && imgs.length === 0) || loading) return;
    setInput('');
    setChatImages([]);
    setLoading(true);

    const msgText = text + (imgs.length ? `\n[附带 ${imgs.length} 张参考图片]` : '');
    addChat({ role: 'user', text: msgText });

    if (imgs.length > 0 && face && design) {
      const firstImg = imgs[0];
      const img = new Image();
      img.onload = () => {
        const newLayer: ImageLayer = {
          id: uid('lay'), name: firstImg.name || '上传素材', type: 'image',
          src: firstImg.src, x: 10, y: 10,
          w: Math.min(40, img.width / 3.78),
          h: Math.min(40, img.width / 3.78 * img.height / img.width),
          rotation: 0, opacity: 1, naturalW: img.width, naturalH: img.height,
          fit: 'contain', locked: false,
        };
        update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers: [...face.layers, newLayer] } } } });
      };
      img.src = firstImg.src;
    }

    if (selectedLayer) {
      try { await localEdit(text); }
      catch (e) { addChat({ role: 'ai', text: `修改失败：${(e as Error).message}。请稍后再试。` }); }
      finally { setLoading(false); }
      return;
    }

    // 整体对话：自然语言 → 结构化工具计划 → 校验执行
    const ai = loadAI();
    if (!aiEnabled(ai) || !face || !design) {
      addChat({ role: 'ai', text: 'AI 尚未启用，请在「模型配置」里接入后，再让我操作设计工程。' });
      setLoading(false);
      return;
    }
    try {
      const aiWithModel = { ...ai, cloudbaseUid: auth.user?.id || '' };
      const plan = await planFromUser(
        text,
        s.chat,
        {
          currentFace,
          faceSize: { w: face.w, h: face.h },
          bg: face.bg,
          layers: face.layers.map((l) => ({ id: l.id, name: l.name, type: l.type, hidden: l.hidden, locked: l.locked })),
          palette: design.palette,
          structure: brief.structure,
        },
        aiWithModel,
      );
      if (plan.thought) addChat({ role: 'ai', text: plan.thought });

      if (plan.actions.length === 0) {
        // 纯对话不扣积分（与「对话免费」口径一致）
      } else {
        for (const action of plan.actions) {
          const result = await executeAction(action, toolHost);
          addChat({ role: 'ai', text: `${action.name}｜${result.ok ? '已完成' : '未完成'}：${result.message}` });
        }
        const hasImage = plan.actions.some((a) => a.name === 'generate_image_asset');
        if (auth.user && hasImage) { await recordUsage(auth.user.id, PRICING.costs.imageFlash, 'image'); sub.refresh(); }
      }
    } catch (e) {
      const msg = (e as Error).message || 'AI 暂时连不上';
      addChat({ role: 'ai', text: `操作失败：${msg}。请稍后再试。` });
    } finally {
      setLoading(false);
    }
  };

  const generateDesign = async () => {
    if (!auth.user) { window.location.hash = '#/luna?login=1'; return; }
    if (generating) return;
    setGenerating(true);
    pushHistory();

    try {
      const ai = loadAI();
      const aiWithModel = { ...ai, cloudbaseUid: auth.user?.id || '' };

      addChat({ role: 'ai', text: '正在生成背景材质...' });
      setGenQueue([{ name: '背景材质', status: 'running' }]);
      const bgPrompt = `${brief.material || '牛皮纸'}材质纹理，${brief.colors[0] || '米白色'}背景，包装设计底纹，高清，细腻质感`;
      const bgImg = await llmImage(bgPrompt, aiWithModel);
      setGenQueue((prev) => prev.map((q) => q.name === '背景材质' ? { ...q, status: 'done' } : q));

      addChat({ role: 'ai', text: '正在生成主视觉插画...' });
      setGenQueue((prev) => [...prev, { name: '主视觉插画', status: 'running' }]);
      const illusPrompt = `${brief.motif || '山水插画'}，${brief.style || '现代东方风格'}，${brief.product || '茶叶'}主题，包装设计插画，干净背景`;
      const illusImg = await llmImage(illusPrompt, aiWithModel);
      setGenQueue((prev) => prev.map((q) => q.name === '主视觉插画' ? { ...q, status: 'done' } : q));

      addChat({ role: 'ai', text: '正在生成装饰贴纸...' });
      setGenQueue((prev) => [...prev, { name: '装饰贴纸', status: 'running' }]);
      const stickerPrompt = `小贴纸装饰，${brief.product || '茶叶'}主题，${brief.style || '现代东方'}风格，透明背景，独立小图标`;
      const stickerImg = await llmImage(stickerPrompt, aiWithModel);
      setGenQueue((prev) => prev.map((q) => q.name === '装饰贴纸' ? { ...q, status: 'done' } : q));

      const baseDesign = buildSchemes(brief, styleById(s.draft.style_id || 'minimal'))[0];
      const newDesign = cloneDesign(baseDesign);
      const frontFace = newDesign.faces.front;
      if (frontFace) {
        const bgLayer: ImageLayer = {
          id: uid(), type: 'image', name: '背景材质',
          x: 0, y: 0, w: frontFace.w, h: frontFace.h,
          rotation: 0, opacity: 1, locked: false,
          src: bgImg.src, naturalW: bgImg.naturalW, naturalH: bgImg.naturalH, fit: 'cover',
        };
        frontFace.layers = [bgLayer, ...frontFace.layers];
        const illusLayer: ImageLayer = {
          id: uid(), type: 'image', name: '主视觉插画',
          x: frontFace.w * 0.1, y: frontFace.h * 0.15,
          w: frontFace.w * 0.8, h: frontFace.h * 0.5,
          rotation: 0, opacity: 1, locked: false,
          src: illusImg.src, naturalW: illusImg.naturalW, naturalH: illusImg.naturalH, fit: 'contain',
        };
        frontFace.layers = [...frontFace.layers, illusLayer];
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
      // 三张图按 Flash 档计（与实际调用的模型一致），不再按 3×Pro 扣 30 分
      await recordUsage(auth.user.id, PRICING.costs.imageFlash * 3, 'image');
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

  // 图层交互
  const onLayerMouseDown = (e: React.MouseEvent, layer: Layer) => {
    if (layer.locked) return;
    e.stopPropagation();
    if (e.shiftKey) {
      setSelectedLayer(layer.id);
      setSelectedIds((prev) => prev.includes(layer.id) ? prev.filter((id) => id !== layer.id) : [...prev, layer.id]);
      return;
    }
    setSelectedLayer(layer.id);
    setSelectedIds([layer.id]);
    pushHistory();
    dragState.current = { id: layer.id, startX: e.clientX, startY: e.clientY, origX: layer.x, origY: layer.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (rotateState.current) {
      const rs = rotateState.current;
      if (!face || !design) return;
      const dx = e.clientX - rs.centerX;
      const dy = e.clientY - rs.centerY;
      let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      if (e.shiftKey) angle = Math.round(angle / 15) * 15;
      angle = Math.round(angle);
      const layers = face.layers.map((l) => l.id === rs.id ? { ...l, rotation: angle } : l);
      update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
      return;
    }
    if (resizeState.current) { onResizeMouseMove(e); return; }
    if (!dragState.current || !face) return;
    const dx = (e.clientX - dragState.current.startX) / zoom;
    const dy = (e.clientY - dragState.current.startY) / zoom;
    let newX = dragState.current.origX + dx;
    let newY = dragState.current.origY + dy;
    const dragLayer = face.layers.find((l) => l.id === dragState.current!.id)!;
    const snapDist = 2;
    const newGuides: { v?: number; h?: number } = {};

    const centerX = face.w / 2;
    const layerCenterX = newX + dragLayer.w / 2;
    if (Math.abs(newX - 0) < snapDist) { newX = 0; newGuides.v = 0; }
    else if (Math.abs(layerCenterX - centerX) < snapDist) { newX = centerX - dragLayer.w / 2; newGuides.v = centerX; }
    else if (Math.abs(newX + dragLayer.w - face.w) < snapDist) { newX = face.w - dragLayer.w; newGuides.v = face.w; }

    const centerY = face.h / 2;
    const layerCenterY = newY + dragLayer.h / 2;
    if (Math.abs(newY - 0) < snapDist) { newY = 0; newGuides.h = 0; }
    else if (Math.abs(layerCenterY - centerY) < snapDist) { newY = centerY - dragLayer.h / 2; newGuides.h = centerY; }
    else if (Math.abs(newY + dragLayer.w - face.h) < snapDist) { newY = face.h - dragLayer.h; newGuides.h = face.h; }

    setGuides(newGuides);
    const layers = face.layers.map((l) => l.id === dragState.current!.id ? { ...l, x: newX, y: newY } : l);
    update({ design: { ...design!, faces: { ...design!.faces, [currentFace]: { ...face, layers } } } });
  };

  const onMouseUp = () => {
    dragState.current = null;
    resizeState.current = null;
    rotateState.current = null;
    setGuides({});
  };

  // 缩放移动
  const onResizeMouseMove = (e: React.MouseEvent) => {
    const rs = resizeState.current;
    if (!rs || !face || !design) return;
    const dx = (e.clientX - rs.startX) / (zoom * MM_TO_PX);
    const dy = (e.clientY - rs.startY) / (zoom * MM_TO_PX);

    let newX = rs.origX, newY = rs.origY, newW = rs.origW, newH = rs.origH;
    const h = rs.handle;

    if (h.includes('e')) newW = Math.max(5, rs.origW + dx);
    if (h.includes('w')) { newW = Math.max(5, rs.origW - dx); newX = rs.origX + (rs.origW - newW); }
    if (h.includes('s')) newH = Math.max(5, rs.origH + dy);
    if (h.includes('n')) { newH = Math.max(5, rs.origH - dy); newY = rs.origY + (rs.origH - newH); }

    if (e.shiftKey && (h === 'nw' || h === 'ne' || h === 'se' || h === 'sw')) {
      const ratio = rs.origW / rs.origH;
      if (newW / newH > ratio) newH = newW / ratio;
      else newW = newH * ratio;
      if (h.includes('w')) newX = rs.origX + (rs.origW - newW);
      if (h.includes('n')) newY = rs.origY + (rs.origH - newH);
    }

    const layers = face.layers.map((l) => l.id === rs.id ? { ...l, x: newX, y: newY, w: newW, h: newH } : l);
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };

  const onResizeMouseDown = (e: React.MouseEvent, layer: Layer, handle: HandlePos) => {
    e.stopPropagation();
    e.preventDefault();
    pushHistory();
    resizeState.current = {
      id: layer.id, handle,
      startX: e.clientX, startY: e.clientY,
      origX: layer.x, origY: layer.y, origW: layer.w, origH: layer.h,
    };
  };

  const onRotateMouseDown = (e: React.MouseEvent, layer: Layer) => {
    e.stopPropagation();
    e.preventDefault();
    pushHistory();
    const canvasRect = (e.currentTarget.closest('.studio-canvas-wrap') as HTMLElement).getBoundingClientRect();
    const centerX = canvasRect.left + (layer.x + layer.w / 2) * zoom * MM_TO_PX;
    const centerY = canvasRect.top + (layer.y + layer.h / 2) * zoom * MM_TO_PX;
    rotateState.current = { id: layer.id, centerX, centerY };
  };

  // 画布平移
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || spacePressed.current) {
      e.preventDefault();
      const container = e.currentTarget as HTMLElement;
      panState.current = {
        startX: e.clientX, startY: e.clientY,
        scrollLeft: container.scrollLeft, scrollTop: container.scrollTop,
      };
      if (spacePressed.current) container.style.cursor = 'grabbing';
    }
  };
  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (!panState.current) return;
    const container = e.currentTarget as HTMLElement;
    const dx = e.clientX - panState.current.startX;
    const dy = e.clientY - panState.current.startY;
    container.scrollLeft = panState.current.scrollLeft - dx;
    container.scrollTop = panState.current.scrollTop - dy;
  };
  const onCanvasMouseUp = (e: React.MouseEvent) => {
    panState.current = null;
    (e.currentTarget as HTMLElement).style.cursor = isPanning ? 'grab' : 'default';
  };
  const onCanvasMouseLeave = () => { panState.current = null; };

  // 图层操作
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
  const renameLayer = (id: string) => {
    const l = face?.layers.find((x) => x.id === id);
    if (!l) return;
    const name = prompt('图层名称', l.name);
    if (name && name.trim()) updateLayer(id, { name: name.trim() });
  };
  const moveLayerUp = (id: string) => {
    if (!face || !design) return;
    const idx = face.layers.findIndex((l) => l.id === id);
    if (idx >= face.layers.length - 1) return;
    pushHistory();
    const layers = [...face.layers];
    [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]];
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };
  const moveLayerDown = (id: string) => {
    if (!face || !design) return;
    const idx = face.layers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    pushHistory();
    const layers = [...face.layers];
    [layers[idx], layers[idx - 1]] = [layers[idx - 1], layers[idx]];
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };
  const bringToFront = (id: string) => {
    if (!face || !design) return;
    pushHistory();
    const l = face.layers.find((x) => x.id === id);
    if (!l) return;
    const layers = [...face.layers.filter((x) => x.id !== id), l];
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };
  const sendToBack = (id: string) => {
    if (!face || !design) return;
    pushHistory();
    const l = face.layers.find((x) => x.id === id);
    if (!l) return;
    const layers = [l, ...face.layers.filter((x) => x.id !== id)];
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };
  const updateLayer = (id: string, patch: Partial<Layer>, record = true) => {
    if (!face || !design) return;
    if (record) pushHistory();
    const layers = face.layers.map((l) => l.id === id ? ({ ...l, ...patch } as Layer) : l);
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };

  /** 插入一张图片图层：按画布比例给一个合适的初始尺寸，居中摆放 */
  const insertImageLayer = (src: string, name: string, naturalW: number, naturalH: number) => {
    if (!face || !design) return null;
    const ratio = naturalW > 0 ? naturalH / naturalW : 1;
    // 初始尺寸不超过画布的 55%，长边也不超过 90mm，避免一插入就出界
    let w = Math.min(face.w * 0.55, face.h * 0.55, 90);
    let h = w * ratio;
    if (h > face.h * 0.55) { h = face.h * 0.55; w = h / (ratio || 1); }
    const layer: ImageLayer = {
      id: uid('lay'), name, type: 'image', src,
      x: +Math.max(0, (face.w - w) / 2).toFixed(1),
      y: +Math.max(0, (face.h - h) / 2).toFixed(1),
      w: +w.toFixed(1), h: +h.toFixed(1),
      rotation: 0, opacity: 1, locked: false,
      naturalW, naturalH, fit: 'contain',
    };
    addLayer(layer);
    setSelectedLayer(layer.id);
    setSelectedIds([layer.id]);
    return layer;
  };

  /** 左栏「文字」：五个常用预设，插入后直接可在面板里改字体与排版 */
  const addTextPreset = (kind: TextPreset) => {
    if (!face || !design) return;
    const accent = design.palette.accent || '#C0392B';
    const base = {
      id: uid('lay'), type: 'text' as const, rotation: 0, opacity: 1, locked: false,
      letterSpacing: 0, lineHeight: 1.4, curve: 0, placeholder: true,
    };
    const preset: Record<TextPreset, Partial<TextLayer> & { text: string; name: string }> = {
      title: {
        name: tl('主标题', 'Headline'), text: '主标题文字', role: 'product', fontFamily: '"Songti SC","STSong","Noto Serif CJK SC",serif',
        fontSize: 30, fontWeight: 700, color: '#1c1a17', align: 'center', letterSpacing: 0.04, lineHeight: 1.3,
      },
      subtitle: {
        name: tl('副标题', 'Subheading'), text: '副标题文字', role: 'tagline', fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif',
        fontSize: 14, fontWeight: 400, color: '#333333', align: 'center', letterSpacing: 0.12, lineHeight: 1.5,
      },
      body: {
        name: tl('正文', 'Body copy'), text: '在这里输入正文内容', role: 'info', fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif',
        fontSize: 8, fontWeight: 400, color: '#4a4a4a', align: 'left', letterSpacing: 0, lineHeight: 1.7,
      },
      price: {
        name: tl('价格标签', 'Price tag'), text: '¥ 128', role: 'custom', fontFamily: '"Helvetica Neue",Arial,sans-serif',
        fontSize: 24, fontWeight: 700, color: accent, align: 'left', letterSpacing: 0.02, lineHeight: 1.2,
      },
      label: {
        name: tl('英文标签', 'Small label'), text: 'PREMIUM QUALITY', role: 'legal', fontFamily: '"Helvetica Neue",Arial,sans-serif',
        fontSize: 9, fontWeight: 500, color: '#666666', align: 'center', letterSpacing: 0.3, lineHeight: 1.4,
      },
    };
    const p = preset[kind];
    const w = kind === 'body' ? face.w * 0.72 : Math.min(face.w * 0.8, 140);
    const h = Math.max(8, (p.fontSize || 12) * 0.3528 * (p.lineHeight || 1.4) * (kind === 'body' ? 3 : 1.2));
    const layer: TextLayer = {
      ...base,
      ...p,
      w: +w.toFixed(1),
      h: +h.toFixed(1),
      x: +((face.w - w) / 2).toFixed(1),
      y: +(kind === 'price' ? face.h * 0.78 : face.h * 0.3).toFixed(1),
    } as TextLayer;
    addLayer(layer);
    setSelectedLayer(layer.id);
    setSelectedIds([layer.id]);
    setActiveTool('text');
  };

  /** 内置矢量素材：栅格化后插入画布 */
  const addSvgMaterial = async (svg: string, name: string) => {
    const png = await svgToPng(svg, 640);
    insertImageLayer(png.src, name, png.w, png.h);
  };

  /** 上传本地图片：入素材库 + 直接上画布 */
  const uploadImages = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /^image\//.test(f.type) || /\.svg$/i.test(f.name));
    let ok = 0;
    for (const file of list) {
      try {
        const png = await fileToPng(file);
        addAsset({
          id: uid('asset'), name: png.name,
          src: png.src, kind: 'uploaded', category: 'other',
          naturalW: png.w, naturalH: png.h, favorite: false,
          projectId: s.activeId || undefined, createdAt: Date.now(),
        });
        insertImageLayer(png.src, png.name, png.w, png.h);
        ok += 1;
      } catch {
        // 单个文件失败不阻断其余文件
      }
    }
    return ok;
  };
  /** 通用新增图层（AI 工具系统使用） */
  const addLayer = (layer: Layer) => {
    if (!face || !design) return;
    pushHistory();
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers: [...face.layers, layer] } } } });
  };
  /** 显式设置可见性（与 toggleVisible 的切换语义区分，AI 工具使用） */
  const setLayerVisible = (id: string, visible: boolean) => {
    if (!face || !design) return;
    const target = face.layers.find((l) => l.id === id);
    if (!target || target.hidden === !visible) return;
    pushHistory();
    const layers = face.layers.map((l) => l.id === id ? { ...l, hidden: !visible } : l);
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers } } } });
  };
  /** 修改当前面背景色 */
  const setFaceBackground = (color: string) => {
    if (!face || !design) return;
    pushHistory();
    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, bg: color } } } });
  };
  /** 更新工程配色板 */
  const setDesignPalette = (palette: Partial<DesignDoc['palette']>) => {
    if (!design) return;
    pushHistory();
    update({ design: { ...design, palette: { ...design.palette, ...palette } } });
  };

  /** 更换结构：更新 brief，并重映射各面尺寸（保留图层坐标，不挤压变形） */
  const applyStructure = (structure: StructureId) => {
    if (!design) return;
    pushHistory();
    patchBrief({ structure });
    const sizes = faceSizes(structure, brief.size.l ? brief.size : { l: 200, w: 150, h: 80 });
    const faces = { ...design.faces };
    (Object.keys(faces) as FaceId[]).forEach((fid) => {
      const ns = sizes[fid];
      if (ns && faces[fid]) faces[fid] = { ...faces[fid]!, w: ns.w, h: ns.h };
    });
    update({ design: { ...design, faces } });
  };
  /** 修改尺寸：更新 brief 与各面尺寸，保留图层 */
  const applyDimensions = (size: { l: number; w: number; h: number }) => {
    if (!design) return;
    pushHistory();
    patchBrief({ size });
    const sizes = faceSizes(brief.structure, size);
    const faces = { ...design.faces };
    (Object.keys(faces) as FaceId[]).forEach((fid) => {
      const ns = sizes[fid];
      if (ns && faces[fid]) faces[fid] = { ...faces[fid]!, w: ns.w, h: ns.h };
    });
    update({ design: { ...design, faces } });
  };

  // —— 独立素材库操作 ——
  const assetFileRef = useRef<HTMLInputElement>(null);
  const [assetBusy, setAssetBusy] = useState(false);

  /** 把素材库中的素材作为独立图片图层加入当前画布 */
  const addAssetToCanvas = (assetId: string) => {
    const asset = s.assets.find((a) => a.id === assetId);
    if (!asset || !face || !design) return;
    const ratio = asset.naturalW ? asset.naturalH / asset.naturalW : 1;
    const w = Math.min(60, asset.naturalW ? asset.naturalW / 3.78 : 60);
    const layer: ImageLayer = {
      id: uid('lay'), name: asset.name, type: 'image',
      src: asset.src, x: 10, y: 10,
      w, h: +(w * ratio).toFixed(1),
      rotation: 0, opacity: 1,
      naturalW: asset.naturalW, naturalH: asset.naturalH,
      fit: 'contain', locked: false,
    };
    addLayer(layer);
    setSelectedLayer(layer.id);
  };

  /** 上传文件到素材库（统一转 PNG，SVG 也能用于导出） */
  const onPickAssetFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(async (file) => {
      try {
        const png = await fileToPng(file);
        addAsset({
          id: uid('asset'), name: png.name,
          src: png.src, kind: 'uploaded', category: 'other',
          naturalW: png.w, naturalH: png.h, favorite: false,
          projectId: s.activeId || undefined, createdAt: Date.now(),
        });
      } catch {
        // 单个文件失败不影响其余
      }
    });
    e.target.value = '';
  };

  /** 调用 AI 生成素材并直接入库（独立成层，不自动上画布） */
  const generateToLibrary = async (prompt: string, category: AssetCategory) => {
    if (!prompt.trim()) return;
    const ai = { ...loadAI(), cloudbaseUid: auth.user?.id || '' };
    setAssetBusy(true);
    try {
      const fullPrompt = category === 'background'
        ? `${prompt}。纯背景，不要任何文字、Logo 或人物，无缝可平铺。`
        : prompt;
      const img = await llmImage(fullPrompt, ai);
      addAsset({
        id: uid('asset'), name: prompt.slice(0, 16),
        src: img.src, kind: 'generated', category,
        naturalW: img.naturalW, naturalH: img.naturalH, favorite: false,
        projectId: s.activeId || undefined, sourcePrompt: prompt, createdAt: Date.now(),
      });
    } finally {
      setAssetBusy(false);
    }
  };

  const clearSelection = () => { setSelectedLayer(null); setSelectedIds([]); };

  // 对齐
  const alignLayers = (kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdist' | 'vdist') => {
    if (!face || !design || selectedIds.length < 2) return;
    pushHistory();
    const layers = face.layers.filter((l) => selectedIds.includes(l.id));
    let newLayers = [...face.layers];

    if (kind === 'left') {
      const minX = Math.min(...layers.map((l) => l.x));
      newLayers = newLayers.map((l) => selectedIds.includes(l.id) ? { ...l, x: minX } : l);
    } else if (kind === 'hcenter') {
      const centers = layers.map((l) => l.x + l.w / 2);
      const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
      newLayers = newLayers.map((l) => selectedIds.includes(l.id) ? { ...l, x: avg - l.w / 2 } : l);
    } else if (kind === 'right') {
      const maxRight = Math.max(...layers.map((l) => l.x + l.w));
      newLayers = newLayers.map((l) => selectedIds.includes(l.id) ? { ...l, x: maxRight - l.w } : l);
    } else if (kind === 'top') {
      const minY = Math.min(...layers.map((l) => l.y));
      newLayers = newLayers.map((l) => selectedIds.includes(l.id) ? { ...l, y: minY } : l);
    } else if (kind === 'vcenter') {
      const centers = layers.map((l) => l.y + l.h / 2);
      const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
      newLayers = newLayers.map((l) => selectedIds.includes(l.id) ? { ...l, y: avg - l.w / 2 } : l);
    } else if (kind === 'bottom') {
      const maxBottom = Math.max(...layers.map((l) => l.y + l.h));
      newLayers = newLayers.map((l) => selectedIds.includes(l.id) ? { ...l, y: maxBottom - l.h } : l);
    } else if (kind === 'hdist') {
      const sorted = [...layers].sort((a, b) => a.x - b.x);
      const totalW = sorted.reduce((sum, l) => sum + l.w, 0);
      const gap = (sorted[sorted.length - 1].x + sorted[sorted.length - 1].w - sorted[0].x - totalW) / (sorted.length - 1);
      let curX = sorted[0].x;
      const pos = new Map<string, number>();
      sorted.forEach((l) => { pos.set(l.id, curX); curX += l.w + gap; });
      newLayers = newLayers.map((l) => pos.has(l.id) ? { ...l, x: pos.get(l.id)! } : l);
    } else if (kind === 'vdist') {
      const sorted = [...layers].sort((a, b) => a.y - b.y);
      const totalH = sorted.reduce((sum, l) => sum + l.h, 0);
      const gap = (sorted[sorted.length - 1].y + sorted[sorted.length - 1].h - sorted[0].y - totalH) / (sorted.length - 1);
      let curY = sorted[0].y;
      const pos = new Map<string, number>();
      sorted.forEach((l) => { pos.set(l.id, curY); curY += l.h + gap; });
      newLayers = newLayers.map((l) => pos.has(l.id) ? { ...l, y: pos.get(l.id)! } : l);
    }

    update({ design: { ...design, faces: { ...design.faces, [currentFace]: { ...face, layers: newLayers } } } });
  };

  // 导出
  /** 印刷级导出（PDF / SVG / ZIP）是会员权益；PNG 预览图免费。
   *  统一在这里拦截，避免只藏按钮、AI 工具链却仍能导出的「假门槛」。 */
  const blockedByPlan = (label: string) => {
    setToast(tl(`${label} 导出为会员权益，开通后即可下载`, `${label} export is a member benefit — subscribe to download`));
    window.location.hash = '#/subscribe';
  };
  const exportPNG = async () => {
    if (!design) return;
    const svg = spreadSvg(design, dieline, 0, false);
    const canvas = await svgToCanvas(svg, dieline.sheets[0].width, dieline.sheets[0].height, 150);
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, `${design.name || 'lunasol'}.png`); });
  };
  const exportPDF = async () => {
    if (!design) return;
    if (!sub.isPro) { blockedByPlan('PDF'); return; }
    const { spreadSvg: ss, svgToCanvas: sc } = await import('../engine/export');
    const { jsPDF } = await import('jspdf');
    const svg = ss(design, dieline, 0, true);
    const canvas = await sc(svg, dieline.sheets[0].width, dieline.sheets[0].height, 300);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: dieline.sheets[0].width > dieline.sheets[0].height ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [dieline.sheets[0].width, dieline.sheets[0].height],
    });
    pdf.addImage(imgData, 'PNG', 0, 0, dieline.sheets[0].width, dieline.sheets[0].height);
    pdf.save(`${design.name || 'lunasol'}.pdf`);
  };
  const exportSVG = () => {
    if (!design) return;
    if (!sub.isPro) { blockedByPlan('SVG 矢量稿'); return; }
    const svg = spreadSvg(design, dieline, 0, false);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, `${design.name || 'lunasol'}.svg`);
  };
  const exportZIP = async () => {
    if (!design) return;
    if (!sub.isPro) { blockedByPlan('ZIP 完整交付包'); return; }
    const { buildBundle } = await import('../engine/export');
    const { blob } = await buildBundle(design, dieline, 300, true);
    downloadBlob(blob, `${design.name || 'lunasol'}_完整交付包.zip`);
  };

  // 印前
  const openPrepress = () => {
    if (!design) return;
    setPrepressReport(runPrepress({ design, brief: s.brief, dieline, dpi: 300 }));
    setPrepressOpen(true);
  };
  const closePrepress = () => setPrepressOpen(false);
  const doAutoFix = () => {
    if (!design) return;
    pushHistory();
    const { design: fixed, changes } = autoFix(design, dieline);
    update({ design: fixed });
    setPrepressReport(runPrepress({ design: fixed, brief: s.brief, dieline, dpi: 300 }));
    if (changes.length) addChat({ role: 'ai', text: '自动修复完成：' + changes.join('；') });
  };

  const fitToScreen = () => {
    if (!face) return;
    const container = document.querySelector('.studio-canvas-wrap') as HTMLElement;
    if (!container) return;
    const pxW = face.w * MM_TO_PX;
    const pxH = face.h * MM_TO_PX;
    const scaleW = (container.clientWidth - 48) / pxW;
    const scaleH = (container.clientHeight - 48) / pxH;
    setZoom(+Math.min(scaleW, scaleH, 2).toFixed(2));
  };

  // 复制粘贴暂存
  const copyRef = useRef<Layer | null>(null);

  // 全局键盘快捷键
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const editing = isEditable(e.target);

      // 空格：临时平移（任何位置都处理，但输入框除外）
      if (e.code === 'Space' && !editing) {
        e.preventDefault();
        spacePressed.current = true;
        return;
      }

      // 输入框聚焦时，只保留 Escape 等，跳过所有设计快捷键
      if (editing) return;

      // 组合键
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); return; }
        if (key === 's') { e.preventDefault(); manualSave(); return; }
        if (key === 'd') { e.preventDefault(); if (selectedLayer) duplicateLayer(selectedLayer); return; }
        if (key === 'c' && selectedLayer) {
          const src = face?.layers.find((l) => l.id === selectedLayer);
          if (src) copyRef.current = JSON.parse(JSON.stringify(src));
          return;
        }
        if (key === 'v' && copyRef.current && face) {
          e.preventDefault();
          const copy = JSON.parse(JSON.stringify(copyRef.current)) as Layer;
          copy.id = uid();
          copy.name = copyRef.current.name + ' 副本';
          copy.x = copyRef.current.x + 5;
          copy.y = copyRef.current.y + 5;
          pushHistory();
          update({ design: { ...design!, faces: { ...design!.faces, [currentFace]: { ...face, layers: [...face.layers, copy] } } } });
          setSelectedLayer(copy.id);
          return;
        }
        if (key === '=' || key === '+') { e.preventDefault(); setZoom((z) => Math.min(5, +(z + 0.1).toFixed(2))); return; }
        if (key === '-') { e.preventDefault(); setZoom((z) => Math.max(0.1, +(z - 0.1).toFixed(2))); return; }
        if (key === '0') { e.preventDefault(); setZoom(1); return; }
        return;
      }

      // 单键
      if (e.key === 'v') { setActiveTool('select'); return; }
      if (e.key === 't') { setActiveTool('text'); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayer) {
        e.preventDefault();
        deleteLayer(selectedLayer);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spacePressed.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face, selectedLayer, currentFace, design, undo, redo]);

  const selectedL = face?.layers.find((l) => l.id === selectedLayer) || null;

  /** AI 工具系统的宿主：把受控能力暴露给执行器，所有操作仍走统一状态管理 */
  const toolHost: ToolHost = {
    getDesign: () => design,
    getCurrentFace: () => currentFace,
    getFace: () => face,
    findLayer: (id) => {
      if (face?.layers.some((l) => l.id === id)) return face.layers.find((l) => l.id === id) || null;
      for (const f of Object.values(design?.faces || {})) {
        const hit = f?.layers.find((l) => l.id === id);
        if (hit) return hit;
      }
      return null;
    },
    addLayer,
    removeLayer: deleteLayer,
    patchLayer: updateLayer,
    duplicateLayerById: duplicateLayer,
    setVisibility: setLayerVisible,
    switchFace: setCurrentFace,
    setBackground: setFaceBackground,
    setPalette: setDesignPalette,
    setStructure: applyStructure,
    setDimensions: applyDimensions,
    generateAsset: async (prompt, kind) => {
      const ai = { ...loadAI(), cloudbaseUid: auth.user?.id || '' };
      const fullPrompt = kind === 'background'
        ? `${prompt}。纯背景，不要任何文字、Logo 或人物，无缝可平铺。`
        : prompt;
      const img = await llmImage(fullPrompt, ai);
      // 生成素材自动入库，保持可复用与可独立管理
      const category = (['background', 'illustration', 'texture', 'pattern', 'sticker', 'product'].includes(kind)
        ? kind
        : 'other') as AssetCategory;
      addAsset({
        id: uid('asset'), name: prompt.slice(0, 16),
        src: img.src, kind: 'generated', category,
        naturalW: img.naturalW, naturalH: img.naturalH, favorite: false,
        projectId: s.activeId || undefined, sourcePrompt: prompt, createdAt: Date.now(),
      });
      return img;
    },
    runPrepress: () => runPrepress({ design: design!, brief: s.brief, dieline, dpi: 300 }),
    exportDesign: async (format) => {
      if (format === 'png') return exportPNG();
      if (format === 'svg') return exportSVG();
      if (format === 'pdf') return exportPDF();
      if (format === 'zip') return exportZIP();
      throw new Error(`不支持的导出格式：${format}`);
    },
  };

  const value: EditorCtx = {
    s, design, brief, face, currentFace, setCurrentFace,
    activeTool, setActiveTool, viewMode, setViewMode,
    selectedLayer, setSelectedLayer, selectedIds, setSelectedIds, selectedL, clearSelection,
    zoom, setZoom, showGrid, setShowGrid, guides, isPanning, spacePressed, fitToScreen,
    generating, genQueue, generateDesign,
    input, setInput, loading, scrollRef, chatImages, chatImgRef, onPickChatImage, removeChatImage, sendMessage,
    briefOpen, setBriefOpen,
    saveStatus, manualSave,
    toggleLock, toggleVisible, deleteLayer, duplicateLayer, renameLayer,
    moveLayerUp, moveLayerDown, bringToFront, sendToBack, updateLayer,
    addTextPreset, addSvgMaterial, uploadImages,
    addAssetToCanvas, assetFileRef, onPickAssetFiles, generateToLibrary, assetBusy,
    removeAsset, toggleFavoriteAsset,
    onLayerMouseDown, onMouseMove, onMouseUp, onResizeMouseDown, onRotateMouseDown,
    onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp, onCanvasMouseLeave,
    alignLayers,
    exportPNG, exportPDF, exportSVG, exportZIP,
    prepressOpen, prepressReport, openPrepress, closePrepress, doAutoFix,
    canUndo, canRedo, undo, redo, pushHistory,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
