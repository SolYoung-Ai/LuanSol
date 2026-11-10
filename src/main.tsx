import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { AppProvider } from './store';
import { AuthProvider } from './cloud/auth';
import { LangProvider } from './i18n';
import { applyTheme, readTheme } from './theme';
import './styles.css';
import './v3.css';
import './v4.css';

declare global {
  interface Window {
    /** index.html 内联兜底层提供：带 ?v= 重新加载，绕过 HTML 缓存 */
    __lunasolRecover?: (reason?: string) => void;
    __lunasolBooted?: () => void;
    __lunasolReload?: () => void;
  }
}

/* ------------------------------------------------------------
 * 发版后旧 chunk 已被删除，但页面还停留在旧 index.html 时，
 * 动态 import 会失败（Chrome 里表现为整页空白）。Vite 会派发
 * vite:preloadError，这里拦下来做一次自动恢复，而不是白屏到底。
 * ------------------------------------------------------------ */
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  window.__lunasolRecover?.('新版本已发布，正在重新加载');
});

// 主题必须在 React 挂载之前写到 <html> 上：晚一帧就会先闪白再变深色。
applyTheme(readTheme());

/** 首帧真的画出来之后，才撤掉 index.html 里的启动兜底层。
 *  放在组件里（而不是 createRoot 之后立刻）是为了避免「React 还没提交、
 *  遮罩已经撤掉」造成一瞬白屏。 */
function BootReady() {
  useEffect(() => {
    const t = window.setTimeout(() => window.__lunasolBooted?.(), 60);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BootReady />
    <LangProvider>
      <AuthProvider>
          <AppProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </AppProvider>
      </AuthProvider>
    </LangProvider>
  </React.StrictMode>,
);
