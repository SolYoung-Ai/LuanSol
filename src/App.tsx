import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useApp, toastTone } from './store';
import { Button, Nav, Notice, PageHead, go, useHash } from './ui';
import { useAuth } from './cloud/auth';
import { SubscriptionProvider } from './cloud/subscription';
import { ProfileProvider } from './cloud/profile';
import { ChatStoreProvider } from './cloud/useChatStore';
import { CloudSyncProvider } from './cloud/useCloudSync';
import { cloudConfigured } from './cloud/config';
import { LunaLoader } from './components/LunaLoader';
import SiteNav from './site/SiteNav';
import SiteFooter from './site/SiteFooter';
import SiteIntro from './site/SiteIntro';
import SideNav from './components/SideNav';
import { useLang } from './i18n';

// 路由级代码分割：除首页外壳外，所有页面按需加载。
// 这样首屏不会拉起 three.js（3D 预览）、jsPDF / JSZip（导出）等重库，
// 它们只在访问对应页面时才下载。manualChunks 已把重库拆成独立 vendor chunk，
// 配合这里的动态 import，浏览器只需在真正用到时才请求对应 chunk。
// 2.0 公开站点（首页 / Product / About / Studio 空壳）与旧应用分开打包：
// 公开页不该为工作台的依赖付首屏成本。
const SiteHome = lazy(() => import('./site/HomePage'));
const SiteProduct = lazy(() => import('./site/ProductPage'));
const SiteAbout = lazy(() => import('./site/AboutPage'));
const StudioShell = lazy(() => import('./site/StudioShell'));
const Account = lazy(() => import('./pages/account'));
const Structures = lazy(() => import('./pages/library').then((m) => ({ default: m.Structures })));
const ProjectDetail = lazy(() => import('./pages/library').then((m) => ({ default: m.ProjectDetail })));
const Workspace = lazy(() => import('./pages/workspace'));
const Settings = lazy(() => import('./pages/settings').then((m) => ({ default: m.Settings })));
const ModelConfig = lazy(() => import('./pages/settings').then((m) => ({ default: m.ModelConfig })));
const Subscribe = lazy(() => import('./pages/subscribe'));
const Help = lazy(() => import('./pages/help'));
const Luna = lazy(() => import('./pages/luna'));
const Start = lazy(() => import('./pages/start'));
/* 旧版整屏编辑器（pages/studio）在 2.0 阶段 1 不再挂到 /studio：
   该路径已经交给新的 Studio 空壳。文件先留着，等阶段 2 的新流程
   接好之后再决定复用还是删除，不在本阶段做破坏性改动。 */
const NewDesign = lazy(() => import('./pages/new'));
const Admin = lazy(() => import('./pages/admin'));
const Replicate = lazy(() => import('./pages/replicate'));
const ReplicateList = lazy(() => import('./pages/replicate-list'));
const ReplicateTemplates = lazy(() => import('./pages/replicate-templates'));
const Login = lazy(() => import('./pages/login'));

/** 页面级加载态统一交给品牌加载组件：LunaSol 字标被橙色填满 + Sol 三字轻跳。
 *  但**延迟 150ms** 才出现：chunk 已在缓存里时切换只要一帧，
 *  这时先闪一个整屏字标再换回真实页面，就是用户说的「显示不出来、闪一下」。 */
function PageFallback() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 150);
    return () => window.clearTimeout(t);
  }, []);
  return show ? <LunaLoader /> : null;
}

/** 页面真的挂上来了（懒加载 chunk 到位、组件渲染完成）才会执行。
 *  进度条靠它收尾，而不是靠定时器猜。 */
function RouteReady({ onReady }: { onReady: () => void }) {
  useEffect(() => { onReady(); }, [onReady]);
  return null;
}

/** 顶部进度条：2px 橙色，页面在换、内容还没到时先给一个交代。
 *  两个细节：延迟 120ms 才出现——chunk 已在缓存里时切换不到一帧，
 *  这时闪一下线本身就成了新的抖动；每次导航换 key，动画从头跑。 */
function RouteBar({ active }: { active: boolean }) {
  const [show, setShow] = useState(false);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!active) { setShow(false); return; }
    const t = window.setTimeout(() => { setShow(true); setRun((n) => n + 1); }, 120);
    return () => window.clearTimeout(t);
  }, [active]);
  return <div className={`route-bar ${show ? 'is-on' : 'is-done'}`} aria-hidden><i key={run} /></div>;
}

export default function App() {
  const { t } = useLang();
  const hash = useHash();
  const { toast, setToast } = useApp();
  const auth = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  // 必须稳定引用：SubscriptionProvider 会把它放进 useEffect 依赖，
  // 每次渲染都新建函数会让闸门反复注销重注册，中间存在计量空窗。
  const requestLogin = useCallback((target?: string) => {
    // 只接受字符串：这个词也会被当作 onClick 直接挂到按钮上，
    // 那时第一个参数是 MouseEvent，`.startsWith` 会直接抛错（登录点了没反应就是这个）
    const cur = (typeof target === 'string' && target) || window.location.hash.replace(/^#/, '') || '/';
    if (cur.startsWith('/login')) return;            // 已经在登录页，不要自我跳转
    go(`/login?next=${encodeURIComponent(cur)}`);    // 登录后回到发起登录的位置
  }, []);
  // 路由切换后必须回到顶部：懒加载页面在 effect 之后才挂载，只调用一次 scrollTo 会被
  // 后来的内容撑高 / 滚动锚定带偏（实测进入工作台会停在中段，标题被导航遮住），所以补一帧再归零。
  // 桌面端正文卡是独立滚动容器（.main 固定高度 + 内部滚动），
  // 只重置 window 是不够的——不一起清 .main 的 scrollTop，换页会停在上一页的滚动位置。
  useEffect(() => {
    const reset = () => {
      window.scrollTo({ top: 0 });
      if (mainRef.current) mainRef.current.scrollTop = 0;
    };
    reset();
    const t = window.setTimeout(reset, 32);
    return () => window.clearTimeout(t);
  }, [hash]);

  const path = hash.split('?')[0];

  /* 路由进度：shown 是「已经真正渲染出来的地址」。
     只有 RouteReady 挂载后才会更新，所以 shown !== hash 就等于「还在路上」，
     不依赖定时器，也不会因为 chunk 已在缓存里而闪一下。 */
  const [shown, setShown] = useState(hash);
  const navigating = shown !== hash;
  const markShown = useCallback(() => setShown(hash), [hash]);
  // 自带整屏工作区的页面：内部有 fixed 抽屉与贴底输入栏。
  // 给 .main 加 transform 会把 .main 变成这些 fixed 元素的包含块，动画期间抽屉会错位，
  // 所以这两页的切换过渡只允许淡入，不允许位移。
  const isFullBleed = path.startsWith('/luna') || path.startsWith('/studio') || path === '/login';
  /* 登录页是独立整屏版式：自带顶栏，隐藏全站导航与侧栏 */
  const isAuthPage = path === '/login';

  /* 预取主入口页面的 chunk。懒加载 fallback 是一整屏高的字标，
     首次点进 Luna 时「loader → 真实页面」的高度变化也会被看成整页跳一下。
     空闲后提前取回，切换时直接渲染真实页面。 */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import('./pages/luna');
      void import('./pages/start');
      void import('./pages/workspace');
      void import('./pages/replicate');
      void import('./pages/replicate-list');
      void import('./pages/replicate-templates');
      // 顶栏与账号卡会频繁点到的几页，一并预热：chunk 到位后切页只剩一帧
      void import('./pages/subscribe');
      void import('./pages/account');
      void import('./pages/help');
    }, 1400);
    return () => window.clearTimeout(timer);
  }, []);

  /* 主入口按固定顺序排列，切换时按「从上往下 / 从下往上」决定滑入方向 */
  const prevNav = useRef<number>(-1);
  useEffect(() => {
    const order = ['/start', '/home', '/luna', '/workspace', '/projects', '/replicate'];
    const idxOf = (p: string) => {
      if (p === '/start' || p === '/home') return 0;
      if (p.startsWith('/luna')) return 1;
      if (p.startsWith('/workspace') || p.startsWith('/projects')) return 2;
      if (p.startsWith('/replicate')) return 3;
      return -1;
    };
    const cur = idxOf(path);
    const prev = prevNav.current;
    prevNav.current = cur;
    if (cur === -1 || prev === -1 || cur === prev) return;
    const main = document.querySelector<HTMLElement>('.main');
    if (!main) return;
    const cls = cur > prev ? 'nav-in-down' : 'nav-in-up';
    main.classList.remove('nav-in-down', 'nav-in-up');
    void main.offsetWidth;
    main.classList.add(cls);
    const timer = window.setTimeout(() => main.classList.remove(cls), 320);
    return () => window.clearTimeout(timer);
    // order 只用于判定顺序，不参与依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

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

  /* 2.0 公开站点：独立壳（顶部导航 + 页脚），不套旧应用的侧栏，
     也不加载侧栏依赖的 store 逻辑。 */
  const isPublic = path === '/' || path === '/product' || path === '/about' || path === '/studio';

  // 工作台与 AI 新建设计流程需要登录（/studio 现在只是空壳，不再拦登录）
  const needLogin = (isOldFlow || path === '/new') && auth.ready && !auth.user;
  if (needLogin) {
    /* 不再半路拦一个「请登录」空页：直接进登录页，成功后自动回到这里 */
    page = <OldRouteRedirect to={`/login?next=${encodeURIComponent(path)}`} />;
  } else if (isOldFlow) {
    // 旧路由直接重定向到新的 Studio
    page = <OldRouteRedirect />;
  } else if (path === '/') page = <SiteHome />;
  else if (path === '/product') page = <SiteProduct />;
  else if (path === '/about') page = <SiteAbout />;
  /* 独立登录页（V5 那版做的，保留）：整屏左右分栏，登录后回 ?next= */
  else if (isAuthPage) page = <Login />;
  else if (path === '/studio') page = <StudioShell />;
  else if (path === '/new') page = <NewDesign />;
  else if (path === '/structures') page = <Structures />;
  /* 包装设计：/workspace 与历史路径 /projects 指向同一个页面，旧链接不 404 */
  else if (path === '/workspace' || path === '/projects') page = <Workspace />;
  /* 复刻设计：/replicate 是复刻记录（独立草稿箱），
     /replicate/templates 是模版库（参考图已备好，点一下直接进工作区），
     /replicate/new 与 /replicate/edit?id= 是工作区。
     key 用 hash：从「新建」切到「编辑某条记录」时组件必须重挂，
     否则会沿用上一条记录已输入的状态。 */
  else if (path === '/replicate') page = <ReplicateList />;
  /* 模版库必须排在 /replicate/ 通配之前，否则会被当成工作区渲染。
     /replicate/models 是上一版的地址，保留同页渲染，别让老书签 404。 */
  else if (path === '/replicate/templates' || path === '/replicate/models') page = <ReplicateTemplates />;
  else if (path.startsWith('/replicate/')) page = <Replicate key={hash} />;
  /* 审美市场已永久下线：老书签（/market、/market/site/*、/inspiration）统一送回工作台，
     不做 404，也不再保留任何入口与数据。 */
  else if (path.startsWith('/market') || path === '/inspiration') page = <OldRouteRedirect to="/workspace" />;
  else if (path.startsWith('/project/')) page = <ProjectDetail />;
  /* 账户信息是唯一入口：/security 是旧链接，直接渲染同一页，避免功能分家 */
  else if (path === '/account' || path === '/security') page = <Account />;
  else if (path === '/settings') page = <Settings />;
  else if (path === '/models') page = <ModelConfig />;
  // /credits 是纯积分制的主路径；/subscribe 是旧链接兼容别名，不再对外展示
  else if (path === '/credits' || path === '/subscribe') page = <Subscribe />;
  else if (path === '/help') page = <Help />;
  else if (path === '/start' || path === '/home') page = <Start />;
  else if (path === '/luna') page = <Luna />;
  else if (path === '/admin') page = <Admin />;
  else page = <div className="page page-narrow">
    <h1>{t('页面不存在', 'Page not found')}</h1>
    <Button onClick={() => go('/')}>{t('回到首页', 'Back to home')}</Button>
  </div>;

  return <SubscriptionProvider requestLogin={requestLogin}>
    <CloudSyncProvider>
      <ProfileProvider>
        <ChatStoreProvider>
          {/* 两套壳，互不嵌套：
              · .site-root = 2.0 公开站点（顶部导航 + 页脚，没有侧栏）
              · .app      = 旧应用（左栏 + 正文卡），工作台 / 账户 / 积分仍在用
              登录页虽然走 .app，但它是整屏版式，所以挂 no-side + is-auth。 */}
          <div className={isPublic
            ? 'site-root'
            : `app ${isAuthPage ? 'no-side is-auth' : 'has-side'} ${isFullBleed ? 'is-fullbleed' : ''} ${path.startsWith('/luna') ? 'is-luna' : ''}`}>
            <RouteBar active={navigating} />

            {isPublic ? <>
              <SiteNav onLogin={requestLogin} />
              {/* 公开页的 chunk 都是几十 KB，但首屏遇到发版瞬间仍可能等一两秒。
                  这里不给「空白 + 页脚顶上来」的画面，先占住一屏高度。 */}
              <Suspense fallback={<div className="site-page" style={{ minHeight: '72vh' }} />}>
                {page}
                <RouteReady key={`ready:${hash}`} onReady={markShown} />
              </Suspense>
              <SiteFooter />
              {/* 品牌开场：只在首页、且同一会话没播过时出现 */}
              <SiteIntro enabled={path === '/'} />
            </> : <>
              <Nav onLogin={requestLogin} />
              {/* 桌面端左栏 */}
              <SideNav onLogin={requestLogin} />
              <main className="main" ref={mainRef}>
                {/* 全局返回：非首页且非 Luna 对话页显示 */}
                {path !== '/' && !path.startsWith('/luna') && <button className="global-back" onClick={() => {
                  if (window.history.length > 1) window.history.back(); else go('/');
                }} aria-label={t('返回', 'Back')}>← {t('返回', 'Back')}</button>}
                <Suspense fallback={<PageFallback />}>
                  {page}
                  <RouteReady key={`ready:${hash}`} onReady={markShown} />
                </Suspense>
                {/* 页脚不在这里：正文卡是固定高度、卡内滚动的，
                    滚到底多出一条页脚只会让每一页多出一段「滑下来才看到」的白条。
                    站内导航、法务链接与版权统一收在帮助与反馈页的最后一屏。 */}
              </main>
            </>}

            {toast && <div className={`toast ${toastTone(toast)}`} onClick={() => setToast(null)}><span aria-hidden>{toastTone(toast) === 'warn' ? '!' : '✓'}</span>{toast}</div>}
            {!cloudConfigured && <span className="cloud-off-flag" aria-hidden>{t('本地模式', 'Local mode')}</span>}
          </div>
        </ChatStoreProvider>
      </ProfileProvider>
    </CloudSyncProvider>
  </SubscriptionProvider>;
}

/** 旧路由统一重定向到新工作台 */
function OldRouteRedirect({ to = '/studio' }: { to?: string }) {
  React.useEffect(() => {
    window.location.hash = `#${to}`;
  }, [to]);
  return <div className="page" style={{ padding: 40, textAlign: 'center', color: '#888' }}>
    Redirecting to the workspace…
  </div>;
}
