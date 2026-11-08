import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useApp, toastTone } from './store';
import { Button, Logo, Nav, Notice, PageHead, go, useHash } from './ui';
import Home from './pages/home';
import { useAuth } from './cloud/auth';
import { LoginDialog } from './cloud/LoginDialog';
import { SubscriptionProvider } from './cloud/subscription';
import { ProfileProvider } from './cloud/profile';
import { ChatStoreProvider } from './cloud/useChatStore';
import { cloudConfigured } from './cloud/config';
import { LunaLoader } from './components/LunaLoader';

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
const Security = lazy(() => import('./pages/security'));
const Help = lazy(() => import('./pages/help'));
const Luna = lazy(() => import('./pages/luna'));
const Studio = lazy(() => import('./pages/studio'));
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

  // 旧设计链路路由：全部重定向到新的统一工作台 /studio
  const OLD_FLOW_ROUTES = ['/wizard', '/review', '/create', '/brief', '/schemes', '/editor', '/preview', '/prepress', '/export'];
  const isOldFlow = OLD_FLOW_ROUTES.some((p) => path.startsWith(p));

  // 工作台需要登录
  const needLogin = (isOldFlow || path === '/studio') && auth.ready && !auth.user;
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
  else if (path === '/account') page = <Account />;
  else if (path === '/settings') page = <Settings />;
  else if (path === '/models') page = <ModelConfig />;
  else if (path === '/subscribe') page = <Subscribe />;
  else if (path === '/security') page = <Security />;
  else if (path === '/help') page = <Help />;
  else if (path === '/luna') page = <Luna />;
  else if (path === '/studio') page = <Studio />;
  else if (path === '/admin') page = <Admin />;
  else page = <div className="page page-narrow"><h1>页面不存在</h1><Button onClick={() => go('/')}>回到首页</Button></div>;

  return <SubscriptionProvider requestLogin={requestLogin}>
    <ProfileProvider>
      <ChatStoreProvider>
        <div className="app">
          <Nav onLogin={requestLogin} />
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
          <BetaAnnouncement />
        </div>
      </ChatStoreProvider>
    </ProfileProvider>
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

/** 内测公告：每次打开网站弹一次（当天只弹一次），引导签到/兑换码/反馈 */
function BetaAnnouncement() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const key = `lunasol_beta_${new Date().toISOString().slice(0, 10)}`;
    if (!localStorage.getItem(key)) {
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);
  if (!open) return null;
  const close = () => {
    localStorage.setItem(`lunasol_beta_${new Date().toISOString().slice(0, 10)}`, '1');
    setOpen(false);
  };
  return <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'grid', placeItems: 'center', padding: 20 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
      <div style={{ fontSize: 12, color: '#a07020', letterSpacing: 2, marginBottom: 8 }}>BETA · 内测中</div>
      <h2 style={{ fontSize: 24, marginBottom: 12 }}>欢迎来到 LunaSol</h2>
      <p style={{ color: '#555', lineHeight: 1.7, marginBottom: 16 }}>
        目前平台处于内测阶段，预计 <strong>2027 年 1 月 1 日</strong>正式上线。
        内测期间所有功能免费开放，你可以通过<strong>每日签到</strong>和<strong>兑换码</strong>获得积分，体验完整的 AI 包装设计流程。
      </p>
      <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
        遇到 bug、或有任何产品建议，欢迎发邮件到 <a href="mailto:soyoung@outlook.com">soyoung@outlook.com</a>，工作日内回复。
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="v4-btn-line" onClick={close}>先逛逛</button>
        <button className="v4-btn-dark" onClick={() => { close(); go('/subscribe'); }}>去签到领积分</button>
      </div>
    </div>
  </div>;
}
