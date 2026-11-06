import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 相对 base + hash 路由：构建产物可放在任意子路径（GitHub Pages 项目站 / 本地目录 / CDN）均可运行。
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '0.0.0.0', allowedHosts: true },
  build: {
    target: 'es2020', outDir: 'dist', assetsInlineLimit: 0, sourcemap: false,
    // 关闭 modulepreload：Vite 会把多个动态页面共享的依赖（如 jsPDF）提升为 entry 的
    // 静态预加载（import{_ as T}from vendor-pdf），导致首屏被强制 fetch+执行重库。
    // 关闭后，动态页面仍按需在跳转时加载，只是少了「提前预取」，对体验影响极小，
    // 换来首屏只下载 index + react（three / jsPDF / jsZip / canvas 全部延迟到真正用到时）。
    modulePreload: false,
    // three / CloudBase SDK 拆成独立 vendor chunk（长期缓存）；
    // 注意：jsPDF / JSZip 故意【不】放进 manualChunks —— 一旦成为「被多个动态页面共享的
    // 命名 chunk」，Vite 会把它强制提升进 entry 的静态预加载（import{_ as T}from vendor-pdf），
    // 反而让首屏拉起 358KB 的 PDF 库。它们已在 engine/export.ts 内改成「用时才动态 import」，
    // 因此交给 Rollup 自动并入用到它的动态页面 chunk，首屏不会加载。
    chunkSizeWarningLimit: 900,
    // 把体积较大的第三方库拆成可长期缓存的独立 chunk：主包从约 1.3 MB 降到约 255 KB，
    // 首屏脚本可并行下载；后续改动业务代码时不必让 3D / PDF 引擎跟着失效。
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@cloudbase/')) return 'vendor-cloudbase';
          if (id.includes('/three/')) return 'vendor-three';
          if (id.includes('/html2canvas/') || id.includes('/dompurify/')) return 'vendor-canvas';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
});
