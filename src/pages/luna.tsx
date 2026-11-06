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
import { LoginDialog } from '../cloud/LoginDialog';
import { CLOUD } from '../cloud/config';
import { loadAI, llmChat, llmJson } from '../engine/llm';
import { parseSize } from '../engine/brief';

type Msg = { role: 'user' | 'assistant'; text: string; image?: string };

/** 调用云函数 Seedream 图像路由 */
async function callSeedream(prompt: string, referenceImage?: string, model?: string): Promise<string> {
  if (!CLOUD.aiBaseUrl || !CLOUD.aiToken) throw new Error('图像服务未配置');
  const r = await fetch(`${CLOUD.aiBaseUrl}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LunaSol-Token': CLOUD.aiToken },
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

const SYSTEM_PROMPT = `你是 LunaSol 的包装设计助手 Luna，一个有审美、懂印刷工艺的设计师。你的工作是通过对话，帮用户把包装需求从模糊聊到具体。

规则：
1. 每次只问 1-2 个问题，不要一次轰炸。先问最关键的：做什么产品、品牌叫什么、想要什么感觉（风格）。
2. 只聊包装设计相关话题：产品、品牌、风格、材质、工艺、尺寸、目标人群、使用场景。聊跑题时温和拉回："这个我们先聊完包装再展开？"
3. 信息尽量具体：产品是什么、品牌名、风格（极简/东方/复古/自然/插画/轻奢）、材质（纸/铁/玻璃/塑料/木）、尺寸（长宽高 mm）、目标人群。
4. 用户主动描述时，先复述确认，再补问缺失项。
5. 回复用中文，口语化，像设计师在聊天，不要列点，不要用 Markdown 标题。
6. 不要提"你将进入工作台"之类的元话；你只负责聊设计。`;

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
  const [loginOpen, setLoginOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageTier, setImageTier] = useState<'flash' | 'lite' | 'pro'>('flash');
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
      const reply = await llmChat([
        { role: 'system', content: SYSTEM_PROMPT + (img ? '\n（用户刚上传了一张参考图，请在回复中提及你已收到这张图，并询问这是产品图还是对标参考。）' : '') },
        ...next.map((m) => ({ role: m.role, content: m.text })),
      ], ai);
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);

      // 异步抽取结构化信息（不阻塞对话）
      llmJson<Extracted>([{ role: 'user', content: EXTRACT_PROMPT(next) }], ai)
        .then((ex) => setExtracted((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(ex).filter(([, v]) => v)) })))
        .catch(() => { /* 抽取失败不影响对话 */ });
    } catch (e) {
      setToast((e as Error).message || 'AI 暂时连不上');
    } finally { setLoading(false); }
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
      const url = await callSeedream(prompt, lastUserImage, imageTier);
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
    <div className="luna-chat" ref={scrollRef}>
      {messages.map((m, i) => <div key={i} className={`luna-msg ${m.role}`}>
        {m.role === 'assistant' && <div className="luna-avatar">L</div>}
        <div className="luna-bubble">
          {m.text && <div>{m.text}</div>}
          {m.image && <img src={m.image} alt="参考图" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, marginTop: 8, display: 'block' }} />}
        </div>
      </div>)}
      {loading && <div className="luna-msg assistant"><div className="luna-avatar">L</div><div className="luna-bubble luna-typing">正在输入…</div></div>}
      {imageGenerating && <div className="luna-msg assistant"><div className="luna-avatar">L</div><div className="luna-bubble luna-typing">正在生成效果图…（首次约 10-30 秒）</div></div>}
    </div>

    <div className="luna-input-bar">
      <div className="luna-progress">
        <div className="luna-progress-label">关键信息 {progress}/{FIELDS.length}</div>
        <div className="luna-progress-track"><div className="luna-progress-fill" style={{ width: `${(progress / FIELDS.length) * 100}%` }} /></div>
        <div className="luna-progress-fields">{FIELDS.map((f) => <span key={f.key} className={extracted[f.key] ? 'done' : ''}>{f.label}</span>)}</div>
      </div>
      {pendingImage && <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0' }}>
        <img src={pendingImage} alt="待发送" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
        <span style={{ fontSize: 12, color: '#888' }}>已选图，发送后作为参考</span>
        <button className="v4-btn-line" onClick={() => setPendingImage(null)}>移除</button>
      </div>}
      <div className="luna-input-row">
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickImage} />
        <button className="v4-btn-line" title="上传产品图 / 对标图" onClick={() => fileRef.current?.click()}>📎</button>
        <input className="luna-input" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
          placeholder="告诉 Luna 你的想法，或发产品图…" />
        <button className="v4-btn-line" disabled={loading} onClick={() => void send()}>{loading ? '…' : '发送'}</button>
        <button className="v4-btn-line" disabled={imageGenerating || progress < 1} onClick={() => void generateMockup()}>
          {imageGenerating ? '生成中…' : '✨ 生成效果图'}
        </button>
        <button className="v4-btn-dark" disabled={progress < 1} onClick={enterWorkspace}>进入工作台 →</button>
      </div>
      <div className="luna-model-row">
        <span className="luna-model-label">对话：</span>
        <select className="luna-model-select" value="deepseek" onChange={() => setToast('GPT 接入后可在此切换')}>
          <option value="deepseek">DeepSeek（deepseek-chat）</option>
          <option value="gpt" disabled>GPT（即将接入）</option>
        </select>
        <span className="luna-model-label" style={{ marginLeft: 16 }}>生图：</span>
        <select className="luna-model-select" value={imageTier} onChange={(e) => setImageTier(e.target.value as 'flash' | 'lite' | 'pro')}>
          <option value="flash">Flash（≈4 积分/张，快）</option>
          <option value="lite">Lite（≈7 积分/张，平衡）</option>
          <option value="pro">Pro（≈10 积分/张，精细）</option>
        </select>
      </div>
    </div>
  </div>;
}
