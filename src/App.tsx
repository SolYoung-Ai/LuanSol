import React, { useEffect, useState } from 'react';
import { useApp } from './store';
import { Button, Logo, Nav, go, useHash } from './ui';
import Home from './pages/home';
import { BriefPage, Create, Editor, Schemes } from './pages/flow';
import { Inspiration, ProjectDetail, Projects, Structures } from './pages/library';
import { ExportCenter, Prepress, Preview3D } from './pages/output';
import { ModelConfig, Settings } from './pages/settings';
import Account from './pages/account';
import Wizard from './v3/Wizard';
import Review from './v3/Review';
import { useAuth } from './cloud/auth';
import { LoginDialog } from './cloud/LoginDialog';
import { cloudConfigured } from './cloud/config';

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
    <main className="main">{page}</main>
    <Footer />
    {toast && <div className="toast" onClick={() => setToast(null)}><span>✓</span>{toast}</div>}
    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={(m) => setToast(m)} />
    {!cloudConfigured && <span className="cloud-off-flag" aria-hidden>本地模式</span>}
  </div>;
}
