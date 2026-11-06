import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useApp } from './store';
import { Button, Logo, Nav, go, useHash } from './ui';
import Home from './pages/home';
import { useAuth } from './cloud/auth';
import { LoginDialog } from './cloud/LoginDialog';
import { cloudConfigured } from './cloud/config';

// 路由级代码分割：除首页外壳外，所有页面按需加载。
// 这样首屏不会拉起 three.js（3D 预览）、jsPDF / JSZip（导出）等重库，
// 它们只在访问对应页面时才下载。manualChunks 已把重库拆成独立 vendor chunk，
// 配合这里的动态 import，浏览器只需在真正用到时才请求对应 chunk。
const Wizard = lazy(() => import('./v3/Wizard'));
const Review = lazy(() => import('./v3/Review'));
const Account = lazy(() => import('./pages/account'));
const Create = lazy(() => import('./pages/flow').then((m) => ({ default: m.Create })));
const BriefPage = lazy(() => import('./pages/flow').then((m) => ({ default: m.BriefPage })));
const Schemes = lazy(() => import('./pages/flow').then((m) => ({ default: m.Schemes })));
const Editor = lazy(() => import('./pages/flow').then((m) => ({ default: m.Editor })));
const Inspiration = lazy(() => import('./pages/library').then((m) => ({ default: m.Inspiration })));
const Structures = lazy(() => import('./pages/library').then((m) => ({ default: m.Structures })));
const Projects = lazy(() => import('./pages/library').then((m) => ({ default: m.Projects })));
const ProjectDetail = lazy(() => import('./pages/library').then((m) => ({ default: m.ProjectDetail })));
const Preview3D = lazy(() => import('./pages/output').then((m) => ({ default: m.Preview3D })));
const Prepress = lazy(() => import('./pages/output').then((m) => ({ default: m.Prepress })));
const ExportCenter = lazy(() => import('./pages/output').then((m) => ({ default: m.ExportCenter })));
const Settings = lazy(() => import('./pages/settings').then((m) => ({ default: m.Settings })));
const ModelConfig = lazy(() => import('./pages/settings').then((m) => ({ default: m.ModelConfig })));

function Footer() {
  return <footer className="footer"><div className="footer-inner">
    <div className="footer-brand"><Logo /><p>让每个人都能轻松完成专业包装设计。</p><span>AI PACKAGING DESIGN STUDIO</span></div>
    <div className="footer-col"><strong>产品</strong>
      <a href="#/wizard">开始设计</a><a href="#/create">对话式快速开始</a><a href="#/inspiration">灵感库</a><a href="#/structures">包装类型</a><a href="#/projects">我的作品</a></div>
    <div className="footer-col"><strong>流程</strong>
      <a href="#/brief">需求分析</a><a href="#/editor">设计工作台</a><a href="#/preview">3D 预览</a><a href="#/prepress">印前检查</a><a href="#/export">文件导出</a></div>
    <div className="footer-col"><strong>账户</strong>
      <a href="#/account">账户与云端项目</a><a href="#/models">AI 模型配置</a><a href="#/settings">个人设置</a>
      <span className="footer-note">未登录时项目保存在本机浏览器；登录后按账号同步到云端</span></div>
  </div><div className="footer-bottom"><span>© 2026 LunaSol AI Packaging Studio</span><span>Made for people who have never designed before.</span></div></footer>;
}

function PageFallback() {
  return <div className="page-loading"><span className="spinner" />页面加载中…</div>;
}

export default function App() {
  const hash = useHash();
  const { toast, setToast } = useApp();
  const auth = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [hash]);

  const path = hash.split('?')[0];
  let page: React.ReactNode;
  if (path === '/') page = <Home />;
  else if (path === '/wizard') page = <Wizard />;
  else if (path === '/review') page = <Review />;
  else if (path === '/create') page = <Create />;
  else if (path === '/brief') page = <BriefPage />;
  else if (path === '/schemes') page = <Schemes />;
  else if (path === '/editor') page = <Editor />;
  else if (path === '/preview') page = <Preview3D />;
  else if (path === '/inspiration') page = <Inspiration />;
  else if (path === '/structures') page = <Structures />;
  else if (path === '/projects') page = <Projects />;
  else if (path.startsWith('/project/')) page = <ProjectDetail />;
  else if (path === '/prepress') page = <Prepress />;
  else if (path === '/export') page = <ExportCenter />;
  else if (path === '/account') page = <Account />;
  else if (path === '/settings') page = <Settings />;
  else if (path === '/models') page = <ModelConfig />;
  else page = <div className="page page-narrow"><h1>页面不存在</h1><Button onClick={() => go('/')}>回到首页</Button></div>;

  return <div className="app">
    <Nav onLogin={() => setLoginOpen(true)} accountLabel={auth.user ? auth.user.label : null} />
    <main className="main"><Suspense fallback={<PageFallback />}>{page}</Suspense></main>
    <Footer />
    {toast && <div className="toast" onClick={() => setToast(null)}><span>✓</span>{toast}</div>}
    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={(m) => setToast(m)} />
    {!cloudConfigured && <span className="cloud-off-flag" aria-hidden>本地模式</span>}
  </div>;
}
