# 部署说明（GitHub Pages）

线上地址：<https://solyoung-ai.github.io/LuanSol/>

## 架构

- 前端：React 18 + TypeScript + Vite 5 + Three.js + jsPDF + JSZip，手写 CSS（无 Tailwind 运行时依赖）。
- 路由：**hash 路由**（`#/create`、`#/editor` …），因此 GitHub Pages 不需要任何服务端 rewrite，`404.html` 也不需要。
- Vite `base: './'`：构建产物放在任意子路径都能正确加载资源。
- 数据：IndexedDB（localStorage 兜底），**零服务器、零数据库成本**。
- 部署目标：GitHub 仓库 `SolYoung-Ai/LuanSol` 的 `gh-pages` 分支根目录。

## 自动部署（推荐）

工作流文件位于仓库 `docs/deploy-workflow.yml`，本地源码也保留了一份 `.github/workflows/deploy.yml`。
**当前创建仓库所用的令牌只有 `repo` 权限、没有 `workflow` 权限，因此无法由脚本把 `.github/workflows/*.yml` 推上 GitHub**（GitHub 会拒绝）。启用自动部署只需在 GitHub 网页端打开仓库 → Add file → Create new file → 路径填 `.github/workflows/deploy.yml` → 粘贴 `docs/deploy-workflow.yml` 的内容并提交；之后每次 push 到 main 都会自动构建部署。

本次上线已采用下方的「手动部署」方式把 `dist/` 推到 `gh-pages` 分支并开启 Pages，网站现在即可访问。

工作流内容：

1. 推送到 `main` 触发工作流；
2. `npm ci` → `npm run build`（含 `tsc --noEmit`）→ `npm test`；
3. `touch dist/.nojekyll`；
4. `peaceiris/actions-gh-pages@v4` 把 `dist/` 推到 `gh-pages` 分支。

仓库设置：**Settings → Pages → Build and deployment → Source = Deploy from a branch → Branch = `gh-pages` / `(root)`**。

工作流权限需要 `contents: write`（已在 workflow 中声明；若组织限制，请在 Settings → Actions → General → Workflow permissions 中开启 Read and write permissions）。

也支持在 Actions 页面手动 `Run workflow`。

## 手动部署（无 Actions 时）

```bash
npm ci
npm run build
touch dist/.nojekyll

cd dist
git init -b gh-pages
git add -A
git commit -m "deploy: LunaSol build"
git remote add origin https://github.com/SolYoung-Ai/LuanSol.git
git push -f origin gh-pages
```

然后在仓库 Settings → Pages 中选择 `gh-pages` / root，等待约 1 分钟即可访问。

## 本地预览生产构建

```bash
npm run build
python3 -m http.server 8765 --bind 127.0.0.1
# 打开 http://127.0.0.1:8765/dist/
```

## 常见问题

- **页面空白**：确认 Pages 选择的是 `gh-pages` 分支而非 `main`；确认 `dist/index.html` 存在。
- **资源 404**：`vite.config.ts` 使用 `base: './'`，不要改成绝对路径 `/`，否则项目站子路径会失败。
- **刷新子页面 404**：本站使用 hash 路由，不会出现该问题。
- **API Key 报错**：密钥只存在本机浏览器，换设备需重新配置；详见 [AI_SETUP.md](AI_SETUP.md)。
