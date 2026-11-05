import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 相对 base + hash 路由：构建产物可放在任意子路径（GitHub Pages 项目站 / 本地目录 / CDN）均可运行。
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '0.0.0.0', allowedHosts: true },
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 0, sourcemap: false },
});
