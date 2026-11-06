import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useApp, toastTone } from './store';
import { Button, Logo, Nav, Notice, PageHead, go, useHash } from './ui';
import Home from './pages/home';
import { useAuth } from './cloud/auth';
import { LoginDialog } from './cloud/LoginDialog';
import { SubscriptionProvider } from './cloud/subscription';
import { cloudConfigured } from './cloud/config';
import { LunaLoader } from './components/LunaLoader';

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
const ProjectDetail = lazy(() => import('./pages/library').then((m) => ({ default: m.ProjectDetail })));
const Workspace = lazy(() => import('./pages/workspace'));
const Market = lazy(() => import('./pages/market').then((m) => ({ default: m.default })));
const MarketSite = lazy(() => import('./pages/market').then((m) => ({ default: m.MarketSitePage })));
const MarketWork = lazy(() => import('./pages/market').then((m) => ({ default: m.MarketWorkPage })));
const Preview3D = lazy(() => import('./pages/output').then((m) => ({ default: m.Preview3D })));
const Prepress = lazy(() => import('./pages/output').then((m) => ({ default: m.Prepress })));
const ExportCenter = lazy(() => import('./pages/output').then((m) => ({ default: m.ExportCenter })));
const Settings = lazy(() => import('./pages/settings').then((m) => ({ default: m.Settings })));
const ModelConfig = lazy(() => import('./pages/settings').then((m) => ({ default: m.ModelConfig })));
const Subscribe = lazy(() => import('./pages/subscribe'));
const Security = lazy(() => import('./pages/security'));
const Help = lazy(() => import('./pages/help'));
const Luna = lazy(() => import('./pages/luna'));

function Footer() {
  return <footer className="footer-min"><div className="footer-min-inner">
    <div className="footer-min-brand"><Logo compact /><span>AI PACKAGING DESIGN STUDIO</span></div>
    <div className="footer-min-links">
      <a href="#/wizard">开始设计</a>
      <a href="#/workspace">工作台</a>
      <a href="#/market">审美市场</a>
      <a href="#/subscribe">会员说明</a>
    </div>
    <span className="footer-min-copy">© 2026 LunaSol · 从想法，到一件作品</span>
  </div></footer>;
}

/** 页面级加载态统一交给品牌加载组件：LunaSol 字标被橙色填满 + Sol 三字轻跳 */
function PageFallback() {
  return <LunaLoader />;
}

export default function App() {
  const hash = useHash();
  const { toast, setToast } = useApp();
  const auth = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  // 必须稳定引用：SubscriptionProvider 会把它放进 useEffect 依赖，
  // 每次渲染都新建函数会让闸门反复注销重注册，中间存在计量空窗。
  const requestLogin = useCallback(() => setLoginOpen(true), []);
  // 路由切换后必须回到顶部：懒加载页面在 effect 之后才挂载，只调用一次 scrollTo 会被
  // 后来的内容撑高 / 滚动锚定带偏（实测进入工作台会停在中段，标题被导航遮住），所以补一帧再归零。
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const t = window.setTimeout(() => window.scrollTo({ top: 0 }), 32);
    return () => window.clearTimeout(t);
  }, [hash]);

  const path = hash.split('?')[0];
  let page: React.ReactNode;

  // 设计链路：必须登录后才能开始。未登录访问时统一拦在门口，引导登录。
  const DESIGN_GATE = ['/wizard', '/review', '/create', '/brief', '/schemes', '/editor', '/preview', '/prepress', '/export'];
  const gated = DESIGN_GATE.some((p) => path.startsWith(p));
  if (gated && auth.ready && !auth.user) {
    page = <div className="page page-narrow">
      <PageHead kicker="SIGN IN" title="先登录，再开始设计"
        desc="包装设计会按账号保存项目、同步云端并记录 AI 额度。请先登录或注册账号。" />
      <Notice tone="info">未登录不能进入设计向导。登录免费，新用户自动获得 2 次 AI 体验。</Notice>
      <div style={{ marginTop: 20 }}><Button size="lg" onClick={requestLogin}>登录 / 注册</Button></div>
    </div>;
  } else if (path === '/') page = <Home />;
  else if (path === '/wizard') page = <Wizard />;
  else if (path === '/review') page = <Review />;
  else if (path === '/create') page = <Create />;
  else if (path === '/brief') page = <BriefPage />;
  else if (path === '/schemes') page = <Schemes />;
  else if (path === '/editor') page = <Editor />;
  else if (path === '/preview') page = <Preview3D />;
  /* 旧灵感库（内容为虚构项目）已下线：统一指向真实可溯源的审美市场 */
  else if (path === '/inspiration') page = <Market />;
  else if (path === '/structures') page = <Structures />;
  /* 工作台：/workspace 与历史路径 /projects 指向同一个新页面，旧链接不 404 */
  else if (path === '/workspace' || path === '/projects') page = <Workspace />;
  /* 审美市场：列表 + 站点详情 + 作品详情 */
  else if (path === '/market') page = <Market />;
  else if (path.startsWith('/market/site/')) page = <MarketSite />;
  else if (path.startsWith('/market/work/')) page = <MarketWork />;
  else if (path.startsWith('/project/')) page = <ProjectDetail />;
  else if (path === '/prepress') page = <Prepress />;
  else if (path === '/export') page = <ExportCenter />;
  else if (path === '/account') page = <Account />;
  else if (path === '/settings') page = <Settings />;
  else if (path === '/models') page = <ModelConfig />;
  else if (path === '/subscribe') page = <Subscribe />;
  else if (path === '/security') page = <Security />;
  else if (path === '/help') page = <Help />;
  else if (path === '/luna') page = <Luna />;
  else page = <div className="page page-narrow"><h1>页面不存在</h1><Button onClick={() => go('/')}>回到首页</Button></div>;

  return <SubscriptionProvider requestLogin={requestLogin}>
    <div className="app">
      <Nav onLogin={requestLogin} />
      <main className="main">
        {/* 全局返回：非首页都有，优先回上一页，无历史回首页 */}
        {path !== '/' && <button className="global-back" onClick={() => {
          if (window.history.length > 1) window.history.back(); else go('/');
        }} aria-label="返回">← 返回</button>}
        <Suspense fallback={<PageFallback />}>{page}</Suspense>
      </main>
      <Footer />
      {toast && <div className={`toast ${toastTone(toast)}`} onClick={() => setToast(null)}><span aria-hidden>{toastTone(toast) === 'warn' ? '!' : '✓'}</span>{toast}</div>}
      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={(m) => setToast(m)} />
      {!cloudConfigured && <span className="cloud-off-flag" aria-hidden>本地模式</span>}
    </div>
  </SubscriptionProvider>;
}
