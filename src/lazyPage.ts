/* ============================================================
 * 路由级懒加载的安全包装
 * ------------------------------------------------------------
 * 现象：刚发完新版，用户还停在旧 index.html 上，点进一个需要按需加载的
 * 页面时，动态 import 会去要一个已经不在服务器上的旧 chunk。React.lazy
 * 拿不到模块，直接把错误抛进 ErrorBoundary —— 于是先闪一屏
 * 「这个页面没能显示出来」，接着启动兜底层热更新完成，页面才真的进去。
 *
 * 这里把「加载失败」从「渲染失败」里剥出来：
 *   · 第一次失败：静默按新版本重载一次（用户只看到加载态，不看到错误页）
 *   · 重载过还失败：才把错误交给 ErrorBoundary，说清楚发生了什么
 * 成功加载后清掉标记，下次发版还能再自动恢复一次。
 * ============================================================ */
import React, { lazy, type ComponentType } from 'react';

const RETRY_KEY = 'lunasol.chunk.retry';

export function clearChunkRetry() {
  try { sessionStorage.removeItem(RETRY_KEY); } catch { /* 隐私模式忽略 */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy<React.ComponentType<any>>(() => load().then(
    (mod) => {
      clearChunkRetry();
      return mod;
    },
    (err) => {
      let tried = 0;
      try { tried = Number(sessionStorage.getItem(RETRY_KEY) || 0); } catch { tried = 0; }
      if (tried < 1) {
        try { sessionStorage.setItem(RETRY_KEY, '1'); } catch { /* ignore */ }
        // 兜底层提供：带 ?v= 重新加载，绕开 HTML 与 chunk 的强缓存
        try { window.__lunasolReload?.(); } catch { /* ignore */ }
        // 重载没生效（被拦/无网）时的看门狗：不要停在转圈上
        window.setTimeout(() => {
          try { window.location.reload(); } catch { /* ignore */ }
        }, 4000);
        // 永不 resolve：让 Suspense 的加载态留在原地，而不是换成错误页
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    },
  ));
}
