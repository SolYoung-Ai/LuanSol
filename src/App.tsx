import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useApp, toastTone } from './store';
import { Button, Logo, Nav, Notice, PageHead, go, useHash } from './ui';
import Home from './pages/home';
import { useAuth } from './cloud/auth';
import { LoginDialog } from './cloud/LoginDialog';
import { SubscriptionProvider } from './cloud/subscription';
import { ProfileProvider } from './cloud/profile';
import { ChatStoreProvider } from './cloud/useChatStore';
import { CloudSyncProvider } from './cloud/useCloudSync';
import { cloudConfigured } from './cloud/config';
import { LunaLoader } from './components/LunaLoader';
import SideNav from './components/SideNav';

// 路由级代码分割：除首页外壳外，所有页面按需加载。
// 这样首屏不会拉起 three.js（3D 预览）、jsPDF / JSZip（导出）等重库，
// 它们只在访问对应页面时才下载。manualChunks 已把重库拆成独立 vendor chunk，
// 配合这里的动态 import，浏览器只需在真正用到时才请求对应 chunk。
const Account = lazy(() => import('./pages/account'));
const Structures = lazy(() => import('./pages/library').then((m) => ({ default: m.Structures })));
const ProjectDetail = lazy(() => import('./pages/library').then((m) => ({ default: m.ProjectDetail })));
const Workspace = lazy(() => import('./pages/workspace'));
const Market = lazy(() => import('./pages/market').then((m) => ({ default: m.default })));
const MarketSite = lazy(() => import('./pages/market').then((m) => ({ default: m.MarketSitePage })));
const MarketWork = lazy(() => import('./pages/market').then((m) => ({ default: m.MarketWorkPage })));
const Settings = lazy(() => import('./pages/settings').then((m) => ({ default: m.Settings })));
const ModelConfig = lazy(() => import('./pages/settings').then((m) => ({ default: m.ModelConfig })));
const Subscribe = lazy(() => import('./pages/subscribe'));
const Help = lazy(() => import('./pages/help'));
const Luna = lazy(() => import('./pages/luna'));
const Start = lazy(() => import('./pages/start'));
const Studio = lazy(() => import('./pages/studio'));
const NewDesign = lazy(() => import('./pages/new'));
const Admin = lazy(() => import('./pages/admin'));

function Footer() {
  return <footer className="footer-min"><div className="footer-min-inner">
    <div className="footer-min-brand"><Logo compact /><span>AI PACKAGING DESIGN STUDIO</span></div>
    <div className="footer-min-links">
      <a href="#/studio">开始设计</a>
      <a href="#/workspace">工作台</a>
      <a href="#/market">审美市场</a>
      <a href="#/subscribe">会员说明</a>
    </div>
    {/* 法务与价格必须是真实可抓取的静态地址：支付通道审核会直接请求 /terms 这类路径，
        而 #/terms 这种 hash 路由在他们眼里等于不存在。 */}
    <div className="footer-min-legal">
      <a href="./pricing/">价格</a>
      <a href="./terms/">服务条款</a>
      <a href="./privacy/">隐私说明</a>
      <a href="./aup/">使用规范</a>
      <a href="./contact/">联系</a>
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

  // 法务页已迁到真正的静态地址（/terms/、/privacy/、/aup/），旧书签里的 #/terms 直接跳过去，
  // 不能让老链接停在「页面不存在」。
  useEffect(() => {
    const legacy = ['/terms', '/privacy', '/aup'];
    if (legacy.includes(path)) window.location.replace(`.${path}/`);
  }, [path]);

  let page: React.ReactNode;

  // 旧设计链路路由：全部重定向到新的统一工作台 /studio
  const OLD_FLOW_ROUTES = ['/wizard', '/review', '/create', '/brief', '/schemes', '/editor', '/preview', '/prepress', '/export'];
  const isOldFlow = OLD_FLOW_ROUTES.some((p) => path.startsWith(p));

  // 工作台与 AI 新建设计流程需要登录
  const needLogin = (isOldFlow || path === '/studio' || path === '/new') && auth.ready && !auth.user;
  if (needLogin) {
    page = <div className="page page-narrow">
      <PageHead kicker="SIGN IN" title="先登录，再开始设计"
        desc="包装设计会按账号保存项目、同步云端并记录 AI 额度。请先登录或注册账号。" />
      <Notice tone="info">登录免费，新用户自动获得免费体验积分。</Notice>
      <div style={{ marginTop: 20 }}><Button size="lg" onClick={requestLogin}>登录 / 注册</Button></div>
    </div>;
  } else if (isOldFlow) {
    // 旧路由直接重定向到新工作台
    page = <OldRouteRedirect />;
  } else if (path === '/') page = <Home />;
  else if (path === '/studio') page = <Studio />;
  else if (path === '/new') page = <NewDesign />;
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
  /* 账户信息是唯一入口：/security 是旧链接，直接渲染同一页，避免功能分家 */
  else if (path === '/account' || path === '/security') page = <Account />;
  else if (path === '/settings') page = <Settings />;
  else if (path === '/models') page = <ModelConfig />;
  else if (path === '/subscribe') page = <Subscribe />;
  else if (path === '/help') page = <Help />;
  else if (path === '/start' || path === '/home') page = <Start />;
  else if (path === '/luna') page = <Luna />;
  else if (path === '/studio') page = <Studio />;
  else if (path === '/admin') page = <Admin />;
  else page = <div className="page page-narrow"><h1>页面不存在</h1><Button onClick={() => go('/')}>回到首页</Button></div>;

  return <SubscriptionProvider requestLogin={requestLogin}>
    <CloudSyncProvider>
      <ProfileProvider>
        <ChatStoreProvider>
          <div className={`app ${path.startsWith('/luna') ? '' : path.startsWith('/studio') ? 'no-side' : 'has-side'}`}>
            <Nav onLogin={requestLogin} />
            {/* 桌面端左栏：Luna 与编辑器自带整屏工作区，这两种页面返回 null；
                其中 /studio 保留顶部条，避免工具栏页连导航都没有 */}
            <SideNav onLogin={requestLogin} />
            <main className="main">
              {/* 全局返回：非首页且非 Luna 对话页显示 */}
              {path !== '/' && !path.startsWith('/luna') && <button className="global-back" onClick={() => {
                if (window.history.length > 1) window.history.back(); else go('/');
              }} aria-label="返回">← 返回</button>}
              <Suspense fallback={<PageFallback />}>{page}</Suspense>
            </main>
            <Footer />
            {toast && <div className={`toast ${toastTone(toast)}`} onClick={() => setToast(null)}><span aria-hidden>{toastTone(toast) === 'warn' ? '!' : '✓'}</span>{toast}</div>}
            <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} onDone={(m) => setToast(m)} />
            {!cloudConfigured && <span className="cloud-off-flag" aria-hidden>本地模式</span>}
          </div>
        </ChatStoreProvider>
      </ProfileProvider>
    </CloudSyncProvider>
  </SubscriptionProvider>;
}

/** 旧设计链路路由统一重定向到新工作台 */
function OldRouteRedirect() {
  React.useEffect(() => {
    window.location.hash = '#/studio';
  }, []);
  return <div className="page" style={{ padding: 40, textAlign: 'center', color: '#888' }}>
    正在跳转到工作台…
  </div>;
}
