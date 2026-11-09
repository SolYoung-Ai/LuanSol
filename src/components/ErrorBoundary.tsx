/* ============================================================
 * 渲染错误兜底
 * ------------------------------------------------------------
 * 之前任何一处渲染抛错（典型是旧草稿缺新字段，如 themeColors）都会把整棵
 * React 树打掉，用户看到的是 index.html 里的启动失败页，文案还写着
 * 「缓存了旧版本」——其实刷新多少次都没用，因为错的是浏览器里存的数据。
 *
 * 这里把渲染错误就地接住：页面仍然是可用的壳，用户能一键回到工作台，
 * 而不是被一片白屏卡死。启动失败页只留给真正的「脚本没加载到」。
 * ============================================================ */
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  copied: boolean;
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147482000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'rgba(250,250,251,0.92)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  font: '14px/1.65 -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif',
  color: '#171717',
};

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  padding: '30px 26px 24px',
  borderRadius: 22,
  textAlign: 'center',
  background: 'rgba(255,255,255,0.94)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 24px 60px -32px rgba(16,18,22,0.34)',
};

const primaryBtn: React.CSSProperties = {
  padding: '11px 22px',
  border: 0,
  borderRadius: 999,
  background: '#171717',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ghostBtn: React.CSSProperties = {
  padding: '11px 18px',
  border: 0,
  borderRadius: 999,
  background: 'rgba(0,0,0,0.05)',
  color: '#3f3f46',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 留一份在控制台，用户反馈时可以直接截图
    console.error('[LunaSol] 页面渲染失败：', error, info?.componentStack);
  }

  /** 回到工作台并清掉错误态：工作台不依赖出问题的那个页面数据，能正常渲染 */
  private goWorkspace = () => {
    try {
      if (location.hash !== '#/workspace') location.hash = '#/workspace';
    } catch { /* ignore */ }
    this.setState({ error: null, copied: false });
  };

  private reload = () => {
    try { location.reload(); } catch { /* ignore */ }
  };

  private copy = async () => {
    const e = this.state.error;
    const text = `${e?.name || 'Error'}: ${e?.message || ''}\n${location.href}\n${e?.stack || ''}`;
    try {
      await navigator.clipboard.writeText(text.slice(0, 4000));
      this.setState({ copied: true });
    } catch { /* 无剪贴板权限就忽略 */ }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 14 }} aria-hidden>🌙</div>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
            这个页面没能显示出来
          </h1>
          <p style={{ fontSize: 13, color: '#737373', margin: '0 0 6px' }}>
            你的草稿和登录状态都还在，只是这一页的数据读取出了问题。
          </p>
          <p style={{ fontSize: 13, color: '#737373', margin: '0 0 18px' }}>
            先回工作台，再从草稿箱重新打开这个设计就行。
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" style={primaryBtn} onClick={this.goWorkspace}>回到工作台</button>
            <button type="button" style={ghostBtn} onClick={this.reload}>重新加载</button>
            <button type="button" style={ghostBtn} onClick={this.copy}>
              {this.state.copied ? '已复制' : '复制错误信息'}
            </button>
          </div>
          <small style={{
            display: 'block', marginTop: 16, fontSize: 11.5, color: '#a0a09a',
            wordBreak: 'break-all', textAlign: 'left',
          }}>
            {String(error.message || error).slice(0, 180)}
          </small>
        </div>
      </div>
    );
  }
}
