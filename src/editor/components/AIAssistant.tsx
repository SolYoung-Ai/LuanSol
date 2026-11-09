/* AI 对话面板：需求摘要、模式提示、对话列表、生成队列、输入与上传、生成方案。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { Icon } from '../../components/icons';

export default function AIAssistant() {
  const ed = useEditor();

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', minWidth: 0 }}>
      {/* 需求摘要 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
        <button
          onClick={() => ed.setBriefOpen((v) => !v)}
          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>设计需求摘要</span>
          <div style={{ flex: 1 }} />
          <Icon name={ed.briefOpen ? 'chevronDown' : 'chevronUp'} size={15} style={{ color: '#999' }} />
        </button>
        {ed.briefOpen && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#666', lineHeight: 1.9 }}>
            <div>产品：{ed.brief.product || '—'}</div>
            <div>品牌：{ed.brief.brand || '—'}</div>
            <div>风格：{ed.brief.style || '—'}</div>
            <div>材质：{ed.brief.material || '—'}</div>
            <div>主色：{ed.brief.colors.join(', ') || '—'}</div>
          </div>
        )}
      </div>

      {/* 模式提示条 */}
      <div style={{
        padding: '8px 16px', fontSize: 12,
        background: ed.selectedLayer ? '#fef3c7' : '#f0f9ff',
        color: ed.selectedLayer ? '#92400e' : '#075985',
        borderBottom: '1px solid #eee', lineHeight: 1.5,
      }}>
        {ed.selectedLayer
          ? `模块修改模式：输入指令只会修改选中的「${ed.selectedL?.name || ''}」`
          : '整体对话模式：描述你的需求，AI 会帮你梳理设计方向'}
      </div>

      {/* 对话列表 */}
      <div ref={ed.scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {ed.s.chat.length === 0 && (
          <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', marginTop: 40, lineHeight: 1.8 }}>
            描述你的设计想法，
            <br />
            或上传参考图开始。
          </div>
        )}
        {ed.s.chat.map((m, i) => (
          <div key={i} style={{
            marginBottom: 12, display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%', padding: '10px 14px', borderRadius: 10,
              fontSize: 13, lineHeight: 1.6,
              background: m.role === 'user' ? '#333' : '#f3f3f3',
              color: m.role === 'user' ? '#fff' : '#333',
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {ed.loading && (
          <div style={{ color: '#999', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="clock" size={14} />
            正在输入...
          </div>
        )}
      </div>

      {/* 生成队列 */}
      {ed.genQueue.length > 0 && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid #eee', fontSize: 12 }}>
          {ed.genQueue.map((q, i) => (
            <div key={i} style={{
              marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6,
              color: q.status === 'done' ? '#16a34a' : q.status === 'error' ? '#ef4444' : '#d97706',
            }}>
              <Icon
                name={q.status === 'running' ? 'refresh' : q.status === 'done' ? 'check' : 'clock'}
                size={13}
              />
              {q.name}
            </div>
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div style={{ padding: 14, borderTop: '1px solid #eee' }}>
        {/* 已上传图片预览 */}
        {ed.chatImages.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {ed.chatImages.map((img, i) => (
              <div key={i} style={{ position: 'relative', width: 56, height: 56 }}>
                <img src={img.src} alt={img.name} style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  borderRadius: 6, border: '1px solid #ddd',
                }} />
                <button
                  onClick={() => ed.removeChatImage(i)}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                    borderRadius: '50%', background: '#ef4444', color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: 10, padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <input ref={ed.chatImgRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={ed.onPickChatImage} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => ed.chatImgRef.current?.click()}
            style={{
              padding: '0 12px', background: '#fff', border: '1px solid #ddd',
              borderRadius: 8, cursor: 'pointer', color: '#555',
              display: 'flex', alignItems: 'center',
            }}
            title="上传参考图/Logo/产品照片"
          >
            <Icon name="upload" size={17} />
          </button>
          <input
            value={ed.input}
            onChange={(e) => ed.setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ed.sendMessage()}
            placeholder="告诉我你的设计想法..."
            style={{
              flex: 1, padding: '9px 12px', border: '1px solid #ddd',
              borderRadius: 8, fontSize: 13,
            }}
          />
          <button
            onClick={ed.sendMessage}
            disabled={ed.loading || (!ed.input.trim() && ed.chatImages.length === 0)}
            style={{
              padding: '0 16px', background: '#333', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
            }}
          >
            <Icon name="chevronRight" size={17} />
          </button>
        </div>

        {/* 生成方案按钮 */}
        <button
          onClick={ed.generateDesign}
          disabled={ed.generating}
          style={{
            marginTop: 8, width: '100%', padding: '10px',
            background: ed.generating ? '#999' : '#f5c451', color: '#333',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Icon name="spark" size={15} />
          {ed.generating ? '生成中...' : '生成设计方案'}
        </button>
      </div>
    </div>
  );
}
