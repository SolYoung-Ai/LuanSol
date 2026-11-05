import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 相对 base + hash 路由：构建产物可放在任意子路径（GitHub Pages 项目站 / 本地目录 / CDN）均可运行。
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '0.0.0.0', allowedHosts: true },
  build: {
    target: 'es2020', outDir: 'dist', assetsInlineLimit: 0, sourcemap: false,
    // 把体积较大的第三方库拆成可长期缓存的独立 chunk：主包从约 1.3 MB 降到约 255 KB，
    // 首屏脚本可并行下载；后续改动业务代码时不必让 3D / PDF 引擎跟着失效。
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/three/')) return 'vendor-three';
          if (id.includes('/html2canvas/') || id.includes('/dompurify/')) return 'vendor-canvas';
          if (id.includes('/jspdf/')) return 'vendor-pdf';
          if (id.includes('/jszip/') || id.includes('/pako/')) return 'vendor-zip';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
});
