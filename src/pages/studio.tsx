/* ============================================================
 * LunaSol V6 统一创作工作台
 * ------------------------------------------------------------
 * 三栏布局：左侧 AI 对话 + 中间设计画布 + 右侧属性面板
 * 取消九步向导，所有设计通过对话和可视化完成。
 * ============================================================ */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '../store';
import { go, useHash } from '../ui';
import { useAuth } from '../cloud/auth';
import { useSubscription } from '../cloud/subscription';
import { loadAI, llmChat, llmJson } from '../engine/llm';
import { CLOUD } from '../cloud/config';

type Msg = { role: 'user' | 'assistant'; text: string; image?: string; ts: number };

type Layer = {
  id: string;
  type: 'text' | 'image' | 'shape' | 'background';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  content?: string;
  src?: string;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
};

type DesignBrief = {
  product: string;
  brand: string;
  style: string;
  material: string;
  colors: string;
  audience: string;
  size: string;
  structure: string;
  illustration: string;
  copy: string;
  barcode: string;
};

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

export default function Studio() {
  const { s, update, loadProject } = useApp();
  const auth = useAuth();
  const sub = useSubscription();
  const hash = useHash();
  const projectId = new URLSearchParams(hash.split('?')[1] || '').get('id');

  // 三栏宽度
  const [leftWidth, setLeftWidth] = useState(360);
  const [rightWidth, setRightWidth] = useState(320);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // 对话
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', text: '你好！我是 Luna，你的专属包装设计师。告诉我你想做什么样的包装？比如：产品类型、品牌名、风格偏好，我来帮你一步步完成设计。', ts: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 设计简报
  const [brief, setBrief] = useState<Partial<DesignBrief>>({});
  const [briefOpen, setBriefOpen] = useState(false);

  // 图层
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);

  // 画布
  const [zoom, setZoom] = useState(1);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);

    const next: Msg[] = [...messages, { role: 'user', text, ts: Date.now() }];
    setMessages(next);

    try {
      const ai = loadAI();
      const aiWithModel = { ...ai, cloudbaseUid: auth.user?.id || '' };
      const reply = await llmChat([
        { role: 'system', content: SYSTEM_PROMPT },
        ...next.map((m) => ({ role: m.role, content: m.text })),
      ], aiWithModel);

      setMessages((prev) => [...prev, { role: 'assistant', text: reply, ts: Date.now() }]);

      // 异步提取设计简报
      llmJson<Partial<DesignBrief>>([
        { role: 'user', content: `从以下对话中提取包装设计信息，只输出 JSON 对象，字段包括：product, brand, style, material, colors, audience, size, structure, illustration, copy, barcode。没有的字段留空。\n\n对话：${next.map((m) => m.text).join('\n')}` },
      ], aiWithModel)
        .then((extracted) => {
          setBrief((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(extracted).filter(([, v]) => v)) }));
        })
        .catch(() => { /* 提取失败不影响对话 */ });
    } catch (e) {
      const msg = (e as Error).message || 'AI 暂时连不上';
      setMessages((prev) => [...prev, { role: 'assistant', text: `抱歉，${msg}。请稍后再试。`, ts: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const generateMockup = async () => {
    if (!auth.user) {
      go('/luna?login=1');
      return;
    }
    // TODO: 调用生图 API
    setLayers([
      { id: 'bg', type: 'background', name: '背景', x: 0, y: 0, width: 400, height: 500, visible: true },
      { id: 'text1', type: 'text', name: '产品名称', x: 100, y: 100, width: 200, height: 40, content: brief.product || '产品名称', fontSize: 24, color: '#333' },
    ]);
  };

  const selectedLayerObj = layers.find((l) => l.id === selectedLayer);

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', background: '#f5f5f5' }}>
      {/* 顶部工具栏 */}
      <div style={{
        height: 52,
        background: '#fff',
        borderBottom: '1px solid #e5e5e5',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
      }}>
        <button onClick={() => go('/workspace')} style={btnStyle}>← 返回</button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{brief.brand || '未命名项目'}</span>
        <span style={{ color: '#999', fontSize: 12 }}>已保存</span>
        <div style={{ flex: 1 }} />
        <button style={btnStyle}>撤销</button>
        <button style={btnStyle}>重做</button>
        <button style={btnStyle}>2D / 3D</button>
        <button style={btnStyle}>印前检查</button>
        <button style={{ ...btnStyle, background: '#1a1a2e', color: '#fff' }}>导出</button>
      </div>

      {/* 三栏主体 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左侧：AI 对话 */}
        {!leftCollapsed && (
          <div style={{
            width: leftWidth,
            background: '#fff',
            borderRight: '1px solid #e5e5e5',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}>
            {/* 设计简报折叠面板 */}
            <div style={{ borderBottom: '1px solid #e5e5e5' }}>
              <button
                onClick={() => setBriefOpen(!briefOpen)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>设计需求摘要</span>
                <span>{briefOpen ? '▼' : '▶'}</span>
              </button>
              {briefOpen && (
                <div style={{ padding: '0 16px 12px', fontSize: 12, color: '#666', lineHeight: 1.8 }}>
                  {Object.entries(brief).map(([k, v]) => (
                    <div key={k}>
                      <span style={{ color: '#999' }}>{k}: </span>{v}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 消息列表 */}
            <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {messages.map((m, i) => (
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
                    background: m.role === 'user' ? '#1a1a2e' : '#f0f0f0',
                    color: m.role === 'user' ? '#fff' : '#333',
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ color: '#999', fontSize: 13, padding: '8px 0' }}>Luna 正在思考...</div>
              )}
            </div>

            {/* 输入框 */}
            <div style={{ padding: 12, borderTop: '1px solid #e5e5e5' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="告诉 Luna 你的想法..."
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading}
                  style={{
                    padding: '10px 16px',
                    background: '#1a1a2e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  发送
                </button>
              </div>
              <button
                onClick={generateMockup}
                style={{
                  marginTop: 8,
                  width: '100%',
                  padding: '10px',
                  background: '#e8f5e9',
                  border: '1px solid #4caf50',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#2e7d32',
                }}
              >
                ✨ 生成设计方案
              </button>
            </div>
          </div>
        )}

        {/* 中间：设计画布 */}
        <div style={{ flex: 1, overflow: 'auto', position: 'relative', padding: 40 }}>
          <div style={{
            width: 400,
            height: 500,
            margin: '0 auto',
            background: '#fff',
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
            position: 'relative',
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
          }}>
            {layers.map((layer) => (
              <div
                key={layer.id}
                onClick={() => setSelectedLayer(layer.id)}
                style={{
                  position: 'absolute',
                  left: layer.x,
                  top: layer.y,
                  width: layer.width,
                  height: layer.height,
                  border: selectedLayer === layer.id ? '2px solid #2196f3' : '1px dashed transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: layer.fontSize || 14,
                  color: layer.color || '#333',
                  background: layer.type === 'background' ? '#f5f0e8' : 'transparent',
                }}
              >
                {layer.type === 'text' ? layer.content : layer.name}
              </div>
            ))}
            {layers.length === 0 && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: '#999',
                fontSize: 14,
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
                <div>画布是空的</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>和 Luna 聊聊你的需求，然后生成设计方案</div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：属性面板 */}
        {!rightCollapsed && (
          <div style={{
            width: rightWidth,
            background: '#fff',
            borderLeft: '1px solid #e5e5e5',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}>
            <div style={{ padding: 16, borderBottom: '1px solid #e5e5e5' }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>图层</h4>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  onClick={() => setSelectedLayer(layer.id)}
                  style={{
                    padding: '10px 12px',
                    marginBottom: 4,
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: selectedLayer === layer.id ? '#e3f2fd' : 'transparent',
                    fontSize: 13,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{layer.name}</span>
                  <span style={{ color: '#999', fontSize: 12 }}>{layer.type}</span>
                </div>
              ))}
            </div>

            {/* 属性编辑 */}
            {selectedLayerObj && (
              <div style={{ borderTop: '1px solid #e5e5e5', padding: 16 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                  {selectedLayerObj.name}
                </h4>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 2 }}>
                  <div>X: {selectedLayerObj.x}</div>
                  <div>Y: {selectedLayerObj.y}</div>
                  <div>宽: {selectedLayerObj.width}</div>
                  <div>高: {selectedLayerObj.height}</div>
                </div>
                {selectedLayerObj.type === 'text' && (
                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 12, color: '#666' }}>文字内容</label>
                    <input
                      value={selectedLayerObj.content || ''}
                      onChange={(e) => setLayers((prev) => prev.map((l) => l.id === selectedLayer ? { ...l, content: e.target.value } : l))}
                      style={{
                        width: '100%',
                        padding: '8px',
                        marginTop: 4,
                        border: '1px solid #ddd',
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    />
                  </div>
                )}
                <button
                  onClick={() => alert('AI 修改功能开发中...')}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: '10px',
                    background: '#f3e5f5',
                    border: '1px solid #9c27b0',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#7b1fa2',
                  }}
                >
                  ✨ 让 AI 修改这个元素
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: '#f5f5f5',
  border: '1px solid #ddd',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
};
