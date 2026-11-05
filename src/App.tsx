import React, { useEffect, useState } from 'react';
import { useApp } from './store';
import { Button, Logo, Modal, Nav, go, useHash } from './ui';
import Home from './pages/home';
import { BriefPage, Create, Editor, Schemes } from './pages/flow';
import { Inspiration, ProjectDetail, Projects, Structures } from './pages/library';
import { ExportCenter, Prepress, Preview3D } from './pages/output';
import { ModelConfig, Settings } from './pages/settings';

function Footer() {
  return <footer className="footer"><div className="footer-inner">
    <div className="footer-brand"><Logo /><p>让每个人都能轻松完成专业包装设计。</p><span>AI PACKAGING DESIGN STUDIO</span></div>
    <div className="footer-col"><strong>产品</strong>
      <a href="#/create">开始创作</a><a href="#/inspiration">灵感库</a><a href="#/structures">包装类型</a><a href="#/projects">我的作品</a></div>
    <div className="footer-col"><strong>流程</strong>
      <a href="#/brief">需求分析</a><a href="#/editor">设计工作台</a><a href="#/preview">3D 预览</a><a href="#/prepress">印前检查</a><a href="#/export">文件导出</a></div>
    <div className="footer-col"><strong>设置</strong>
      <a href="#/models">AI 模型配置</a><a href="#/settings">个人设置</a><a href="#/">返回首页</a>
      <span className="footer-note">纯静态站点 · 项目保存在本机浏览器</span></div>
  </div><div className="footer-bottom"><span>© 2026 LunaSol AI Packaging Studio</span><span>Made for people who have never designed before.</span></div></footer>;
}

export default function App() {
  const hash = useHash();
  const { toast, setToast, s } = useApp();
  const [loginOpen, setLoginOpen] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [hash]);

  const path = hash.split('?')[0];
  let page: React.ReactNode;
  if (path === '/') page = <Home />;
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
  else if (path === '/settings') page = <Settings />;
  else if (path === '/models') page = <ModelConfig />;
  else page = <div className="page page-narrow"><h1>页面不存在</h1><Button onClick={() => go('/')}>回到首页</Button></div>;

  return <div className="app">
    <Nav onLogin={() => setLoginOpen(true)} />
    <main className="main">{page}</main>
    <Footer />
    {toast && <div className="toast" onClick={() => setToast(null)}><span>✓</span>{toast}</div>}
    <Modal open={loginOpen} title="关于账号" onClose={() => setLoginOpen(false)}>
      <p className="modal-p">LunaSol 是<strong>本地优先</strong>的纯静态应用，不需要注册或登录即可使用全部功能。项目保存在你这台设备的浏览器（{s.storage}）里，不会上传到任何服务器。</p>
      <p className="modal-p">跨设备使用：在「个人设置」导出项目 JSON，再在另一台设备导入即可。</p>
      <div className="modal-buttons"><Button variant="outline" onClick={() => { setLoginOpen(false); go('/settings'); }}>打开个人设置</Button>
        <Button onClick={() => setLoginOpen(false)}>知道了</Button></div>
    </Modal>
  </div>;
}
