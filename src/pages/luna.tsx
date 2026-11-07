/* ============================================================
 * Luna 对话式设计入口
 * ------------------------------------------------------------
 * 点「开始设计」后进入这里。Luna 主动问问题，把包装需求从
 * 模糊聊到具体；用户也可以主动说。聊够了点「进入工作台」，
 * 所有聊过的信息自动填进设计流程。
 *
 * 模型选择：当前只接 DeepSeek（服务端代理），界面预留 GPT 扩展位。
 * ============================================================ */
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { go } from '../ui';
import { useAuth } from '../cloud/auth';
import { useSubscription, recordUsage } from '../cloud/subscription';
import { LoginDialog } from '../cloud/LoginDialog';
import { CLOUD } from '../cloud/config';
import { PRICING } from '../cloud/plans';
import { loadAI, llmChat, llmJson } from '../engine/llm';
import { parseSize } from '../engine/brief';

type Msg = { role: 'user' | 'assistant'; text: string; image?: string };

/** 调用云函数 Seedream 图像路由 */
async function callSeedream(prompt: string, referenceImage?: string, model?: string, uid?: string): Promise<string> {
  if (!CLOUD.aiBaseUrl || !CLOUD.aiToken) throw new Error('图像服务未配置');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-LunaSol-Token': CLOUD.aiToken,
  };
  if (uid) headers['X-CloudBase-Uid'] = uid;
  const r = await fetch(`${CLOUD.aiBaseUrl}/images/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      size: '1024x1024',
      ...(model ? { model } : {}),
      ...(referenceImage ? { image: referenceImage } : {}),
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `图像生成失败 ${r.status}`);
  const url = j.data && j.data[0] && (j.data[0].url || j.data[0].b64_json);
  if (!url) throw new Error('图像未返回');
  return url.startsWith('data:') ? url : (url.startsWith('http') ? url : `data:image/png;base64,${url}`);
}

const SYSTEM_PROMPT = `你是 Luna，LunaSol 的包装设计主理人。你是一位有 12 年经验、服务过 200+ 品牌的资深包装设计师，审美高、懂印刷工艺、能聊商业也能聊创意。

你的人设：
- 第一句话先做简短自我介绍，然后主动开始引导用户。
- 像一位有耐心的设计师朋友在咖啡馆里跟客户聊，不卑不亢，不说"亲"，不说"为您服务"。
- 有审美主张：用户的方向明显跑偏时，温和但明确地给出专业意见（"这个方向在货架上会吃亏，我建议…"）。
- 只聊包装设计相关话题：产品、品牌、风格、材质、工艺、尺寸、目标人群、使用场景、竞品。聊跑题时温和拉回。

引导流程（按 8 阶段，不要一次问完，每次 1-2 个问题）：
01 品牌诊断：先问做什么产品、品牌叫什么、卖给谁、什么价位段。
02 创意策略：聊想要什么感觉（极简/东方/复古/自然/插画/轻奢/国潮），给 2-3 个方向让用户选。
03 视觉符号：聊要不要 IP 形象、核心图形、品牌记忆点。
04 包装系统：材质（纸/铁/玻璃/塑料/木）、工艺（烫金/UV/压纹/特种纸）、尺寸。
05-08：后续阶段用户进入工作台后再细化。

回复规则：
- 用中文，口语化，像设计师在聊天，不要列点，不要用 Markdown 标题。
- 用户主动描述时，先复述确认，再补问缺失项。
- 不要提"你将进入工作台"之类的元话；你只负责聊设计。
- 信息足够时（产品+品牌+风格+材质基本明确），可以说"我们可以先出一张效果图看看方向，或者你直接进工作台细化"。`;

const EXTRACT_PROMPT = (history: Msg[]) => `下面是用户和包装设计助手 Luna 的对话。请从中提取设计关键信息，返回 JSON，字段如下：
- product: 产品名称（如"桂花乌龙茶"）
- brand: 品牌名（如"山野集"）
- style: 风格（现代极简/现代东方/复古怀旧/自然有机/潮流插画/轻奢商业 之一，不确定留空）
- material: 材质（如 白卡纸/铁盒/玻璃瓶/牛皮纸）
- size: 尺寸描述原文（如"200x150x80mm"）
- audience: 目标人群
- scene: 使用场景
- tagline: 品牌 slogan 或产品卖点
- colors: 配色倾向（如 米白/墨绿）

只返回 JSON，没有的字段返回空字符串。对话：
${history.map((m) => `${m.role === 'user' ? '用户' : 'Luna'}：${m.text}`).join('\n')}`;

interface Extracted {
  product: string; brand: string; style: string; material: string; size: string;
  audience: string; scene: string; tagline: string; colors: string;
}

const FIELDS: { key: keyof Extracted; label: string }[] = [
  { key: 'product', label: '产品' },
  { key: 'brand', label: '品牌' },
  { key: 'style', label: '风格' },
  { key: 'material', label: '材质' },
  { key: 'size', label: '尺寸' },
];

export default function Luna() {
  const { patchBrief, setToast, update } = useApp();
  const auth = useAuth();
  const sub = useSubscription();
  const [loginOpen, setLoginOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageTier, setImageTier] = useState<'flash' | 'lite' | 'pro'>('flash');
  const [chatModel, setChatModel] = useState('deepseek');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [extracted, setExtracted] = useState<Extracted>({ product: '', brand: '', style: '', material: '', size: '', audience: '', scene: '', tagline: '', colors: '' });
  const scrollRef = useRef<HTMLDivElement>(null);

  // 开场：Luna 第一句
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: 'assistant', text: '你好，我是 Luna。我们一起把你的包装聊清楚——先告诉我：你想做什么产品？比如茶叶、咖啡、护肤品、零食，还是别的？' }]);
    }
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);

  const progress = FIELDS.filter((f) => extracted[f.key]).length;

  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || loading) return;
    setInput('');
    const img = pendingImage || undefined;
    setPendingImage(null);
    const next: Msg[] = [...messages, { role: 'user', text: text || (img ? '（参考图）' : ''), image: img }];
    setMessages(next);
    setLoading(true);

    try {
      const ai = loadAI();
      // 把用户选的对话模型和 CloudBase UID 传进去
      const aiWithModel = { ...ai, textModel: chatModel, cloudbaseUid: auth.user?.id || '' };
      const reply = await llmChat([
        { role: 'system', content: SYSTEM_PROMPT + (img ? '\n（用户刚上传了一张参考图，请在回复中提及你已收到这张图，并询问这是产品图还是对标参考。）' : '') },
        ...next.map((m) => ({ role: m.role, content: m.text })),
      ], aiWithModel);
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);

      // 异步抽取结构化信息（不阻塞对话）
      llmJson<Extracted>([{ role: 'user', content: EXTRACT_PROMPT(next) }], aiWithModel)
        .then((ex) => setExtracted((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(ex).filter(([, v]) => v)) })))
        .catch(() => { /* 抽取失败不影响对话 */ });
    } catch (e) {
      const msg = (e as Error).message || 'AI 暂时连不上';
      setToast(msg);
      // 错误也显示在对话里，用户能看到
      setMessages((prev) => [...prev, { role: 'assistant', text: `抱歉，${msg}。请稍后再试，或者换个说法。` }]);
    } finally {
      setLoading(false);
    }
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { setToast('图片请小于 4MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setPendingImage(String(reader.result));
    reader.readAsDataURL(f);
  };

  const generateMockup = async () => {
    if (imageGenerating) return;
    // 信息不足时提示，不让用户点了才发现
    if (progress < 1) {
      setToast(`先和 Luna 聊一聊你的产品和品牌，信息够了就能生成效果图。`);
      return;
    }
    // 积分余额检查：不够直接拦截，不让用户点了才发现
    const cost = imageTier === 'flash' ? PRICING.costs.imageFlash
      : imageTier === 'lite' ? PRICING.costs.imageLite : PRICING.costs.imagePro;
    const balance = sub.usedLeft ?? 0;
    if (balance < cost) {
      setToast(`积分不足：生图需要 ${cost} 积分，当前余额 ${balance}。去充值或兑换码 →`);
      go('/subscribe');
      return;
    }
    setImageGenerating(true);
    try {
      const prompt = [
        '高品质包装设计效果图，商业摄影风格，柔光，干净背景，',
        extracted.product && `产品：${extracted.product}，`,
        extracted.brand && `品牌名：${extracted.brand}，`,
        extracted.style && `风格：${extracted.style}，`,
        extracted.material && `材质：${extracted.material}，`,
        extracted.colors && `配色：${extracted.colors}，`,
        extracted.audience && `面向人群：${extracted.audience}，`,
        '真实感，高清，专业包装样机，正面视角，影棚灯光。',
      ].filter(Boolean).join('');
      const lastUserImage = [...messages].reverse().find((m) => m.role === 'user' && m.image)?.image;
      const url = await callSeedream(prompt, lastUserImage, imageTier, auth.user?.id);
      // 积分由云函数统一扣减，前端只需要刷新显示
      if (auth.user) sub.refresh();
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: '根据我们聊的内容，生成了一张效果图（可基于此方向继续调整，或进入工作台细化）：',
        image: url,
      }]);
    } catch (e) {
      setToast((e as Error).message || '图像生成失败');
    } finally { setImageGenerating(false); }
  };

  const enterWorkspace = () => {
    if (progress < 3) {
      setToast(`还差 ${3 - progress} 项关键信息（产品/品牌/风格/材质/尺寸），先和 Luna 聊完再进工作台，设计会更准。`);
      return;
    }
    const size = parseSize(extracted.size);
    patchBrief({
      product: extracted.product,
      brand: extracted.brand,
      style: extracted.style,
      material: extracted.material,
      audience: extracted.audience,
      scene: extracted.scene,
      tagline: extracted.tagline,
      raw: messages.map((m) => `${m.role === 'user' ? '我' : 'Luna'}：${m.text}`),
      ...(size ? { size } : {}),
    });
    setToast(`已填入 ${progress}/5 项关键信息，进入设计流程`);
    go('/wizard');
  };

  if (!auth.user) {
    return <div className="page page-narrow">
      <div style={{ textAlign: 'center', paddingTop: 80 }}>
        <h1 style={{ fontSize: 32, marginBottom: 12 }}>先登录，再和 Luna 聊设计</h1>
        <p style={{ color: '#888', marginBottom: 24 }}>对话会保存你的需求、记录 AI 额度。</p>
        <button className="v4-btn-dark" onClick={() => setLoginOpen(true)}>登录 / 注册</button>
      </div>
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={(m) => setToast(m)} />
    </div>;
  }

  return <div className="luna-page">
    {/* 左侧作品栏 */}
    <div className="luna-sidebar">
      <div className="luna-sidebar-header">
        <span>作品</span>
        <button className="luna-sidebar-new" title="新建对话">+</button>
      </div>
      <div className="luna-sidebar-list">
        <div className="luna-sidebar-item active">
          <span>当前对话</span>
        </div>
      </div>
      <div className="luna-sidebar-footer">
        <button className="luna-settings-btn" onClick={() => setModelOpen(!modelOpen)}>
          设置
        </button>
      </div>
    </div>

    {/* 中间对话区 */}
    <div className="luna-main">
      {/* 顶部栏 */}
      <div className="luna-topbar">
        <div className="luna-progress-mini">
          <span className="luna-progress-label">已收集 {progress}/{FIELDS.length}</span>
          <div className="luna-progress-track"><div className="luna-progress-fill" style={{ width: `${(progress / FIELDS.length) * 100}%` }} /></div>
        </div>
      </div>

      {/* 模型设置面板 */}
      {modelOpen && (
        <div className="luna-model-panel">
          <div className="luna-model-item">
            <span>对话模型</span>
            <select value={chatModel} onChange={(e) => setChatModel(e.target.value)}>
              <option value="deepseek-v4.1">DeepSeek（推荐）</option>
              <option value="kimi-k3.1">Kimi Pro</option>
              <option value="doubao-seed-pro">Doubao Pro</option>
              <option value="doubao-seed-lite">Doubao Lite</option>
              <option value="glm-5.3">GLM Flash</option>
            </select>
          </div>
          <div className="luna-model-item">
            <span>生图档位</span>
            <select value={imageTier} onChange={(e) => setImageTier(e.target.value as 'flash' | 'lite' | 'pro')}>
              <option value="flash">Flash · 6积分</option>
              <option value="lite">Lite · 10积分</option>
              <option value="pro">Pro · 15积分</option>
            </select>
          </div>
        </div>
      )}

      {/* 对话区 */}
      <div className="luna-chat" ref={scrollRef}>
        {messages.length === 0 && !loading && !imageGenerating && (
          <div className="luna-empty">
            <h1>今天想做什么包装？</h1>
            <p>告诉我你的产品、品牌或想法，我来帮你从零设计到成品。</p>
          </div>
        )}
        {messages.map((m, i) => <div key={i} className={`luna-msg ${m.role}`}>
          {m.role === 'assistant' && <div className="luna-avatar">L</div>}
          <div className="luna-bubble">
            {m.text && <div>{m.text}</div>}
            {m.image && <img src={m.image} alt="生成效果图" onClick={() => setLightbox(m.image!)} />}
          </div>
        </div>)}
        {loading && <div className="luna-msg assistant"><div className="luna-avatar">L</div><div className="luna-bubble luna-typing">正在输入…</div></div>}
        {imageGenerating && <div className="luna-msg assistant"><div className="luna-avatar">L</div><div className="luna-bubble luna-typing">正在生成效果图…（首次约 10-30 秒）</div></div>}
      </div>

      {/* 底部操作区 */}
      <div className="luna-actions">
        <button
          className={`luna-action-btn ${progress < 1 ? 'disabled' : ''}`}
          disabled={imageGenerating}
          onClick={() => void generateMockup()}
        >
          生成效果图
        </button>
        <button
          className={`luna-action-btn ${progress < 3 ? 'disabled' : ''}`}
          onClick={() => go('/brief')}
        >
          确认需求
        </button>
        <button
          className={`luna-action-btn ${progress < 3 ? 'disabled' : 'primary'}`}
          onClick={enterWorkspace}
        >
          进入工作台
        </button>
      </div>

      {/* 输入区 */}
      <div className="luna-input-bar">
        {pendingImage && <div className="luna-pending-img">
          <img src={pendingImage} alt="待发送" />
          <span>已选图，发送后作为参考</span>
          <button onClick={() => setPendingImage(null)}>移除</button>
        </div>}
        <div className="luna-input-wrapper">
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickImage} />
          <button className="luna-input-btn" title="上传产品图 / 对标图" onClick={() => fileRef.current?.click()}>+</button>
          <input className="luna-input" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="告诉 Luna 你的想法…" />
          <button className="luna-send-btn" disabled={loading || !input.trim()} onClick={() => void send()}>发送</button>
        </div>
      </div>
    </div>

    {/* 右侧需求摘要面板 */}
    <div className="luna-summary">
      <div className="luna-summary-header">
        <span>需求摘要</span>
        <span className="luna-summary-count">{progress}/{FIELDS.length}</span>
      </div>
      <div className="luna-summary-list">
        {FIELDS.map((f) => {
          const val = extracted[f.key];
          const has = !!val;
          return (
            <div key={f.key} className={`luna-summary-item ${has ? 'done' : ''}`}>
              <span className="luna-summary-label">{f.label}</span>
              <span className="luna-summary-value">{has ? val : '待补充'}</span>
            </div>
          );
        })}
      </div>
      {progress >= 3 && (
        <div className="luna-summary-hint">
          ✓ 信息已足够，可以进入设计了
        </div>
      )}
    </div>

    {/* 图片放大 lightbox */}
    {lightbox && <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'grid', placeItems: 'center', cursor: 'zoom-out' }}>
      <img src={lightbox} alt="放大预览" style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 8 }} />
    </div>}
  </div>;
}
