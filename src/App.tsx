import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useApp, toastTone } from './store';
import { Button, go, useHash } from './ui';
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
import { useLang } from './i18n';
import { lazyPage } from './lazyPage';

// 路由级代码分割：除首页外壳外，所有页面按需加载。
// 这样首屏不会拉起 three.js（3D 预览）、jsPDF / JSZip（导出）等重库，
// 它们只在访问对应页面时才下载。manualChunks 已把重库拆成独立 vendor chunk，
// 配合这里的动态 import，浏览器只需在真正用到时才请求对应 chunk。
// 2.0 公开站点（首页 / Product / About / Studio 空壳）与旧应用分开打包：
// 公开页不该为工作台的依赖付首屏成本。
const SiteHome = lazyPage(() => import('./site/HomePage'));
const SiteAbout = lazyPage(() => import('./site/AboutPage'));
/* Studio 2.0：欢迎界面 + 九步需求收集（阶段 3） */
const StudioPage = lazyPage(() => import('./studio/StudioPage'));
const Account = lazyPage(() => import('./pages/account'));
const Structures = lazyPage(() => import('./pages/library').then((m) => ({ default: m.Structures })));
const ProjectDetail = lazyPage(() => import('./pages/library').then((m) => ({ default: m.ProjectDetail })));
const Workspace = lazyPage(() => import('./pages/workspace'));
const Settings = lazyPage(() => import('./pages/settings').then((m) => ({ default: m.Settings })));
const ModelConfig = lazyPage(() => import('./pages/settings').then((m) => ({ default: m.ModelConfig })));
const Subscribe = lazyPage(() => import('./pages/subscribe'));
const Luna = lazyPage(() => import('./pages/luna'));
const Start = lazyPage(() => import('./pages/start'));
/* 旧版整屏编辑器（pages/studio）在 2.0 阶段 1 不再挂到 /studio：
   该路径已经交给新的 Studio 空壳。文件先留着，等阶段 2 的新流程
   接好之后再决定复用还是删除，不在本阶段做破坏性改动。 */
const NewDesign = lazyPage(() => import('./pages/new'));
const Admin = lazyPage(() => import('./pages/admin'));
const Login = lazyPage(() => import('./pages/login'));

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
  /* 包装工作台（/studio）是整屏编辑器，自带顶栏（← 首页 / 项目名 / 保存状态）。
     进到这里全站导航自动收起：屏幕上只留一条栏，填写时不被两排导航分神，
     回站内点左上角那个返回箭头。 */
  const isStudioWizard = path === '/studio';

  /* 预取主入口页面的 chunk。懒加载 fallback 是一整屏高的字标，
     首次点进 Luna 时「loader → 真实页面」的高度变化也会被看成整页跳一下。
     空闲后提前取回，切换时直接渲染真实页面。 */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import('./pages/luna');
      void import('./pages/start');
      void import('./pages/workspace');
      // 工作台是最常点的入口，提前取回来：点「包装工作台」时不再等一个 chunk
      void import('./studio/StudioPage');
      // 顶栏与账号卡会频繁点到的几页，一并预热：chunk 到位后切页只剩一帧
      void import('./pages/subscribe');
      void import('./pages/account');
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

  /* 2.0 公开站点：首页 / 关于 / 工作室。工作室沿用同一条顶部导航，
     不再套第二层工具壳，页脚不出现（工作区不打断流程）。
     产品介绍页已经撤掉：「产品 → 包装设计」直接进工作室，中间不再有一页自夸的说明。 */
  const isPublic = path === '/' || path === '/about' || path === '/studio';
  /* 账户类页面（积分 / 账户）现在是独立页：套同一条顶部导航，
     不再有左侧栏。它们也吃页脚，读到底有个收尾。 */
  const isDoc = path === '/credits' || path === '/subscribe' || path === '/account'
    || path === '/security';
  const showFooter = (isPublic && path !== '/studio') || isDoc;

  // 旧工作台需要登录；/studio 不强拦：未登录也能看到启动弹窗与欢迎界面，
  // 真正点「开始一个新设计」时才去登录（项目按账号存档，数据必须归属到人）
  const needLogin = (isOldFlow || path === '/new') && auth.ready && !auth.user;
  if (needLogin) {
    /* 不再半路拦一个「请登录」空页：直接进登录页，成功后自动回到这里 */
    page = <OldRouteRedirect to={`/login?next=${encodeURIComponent(path)}`} />;
  } else if (isOldFlow) {
    // 旧路由直接重定向到新的 Studio
    page = <OldRouteRedirect />;
  }   else if (path === '/') page = <SiteHome />;
  /* 产品介绍页整页撤掉（2026-11-17）：老书签不 404，直接送进工作室。
     「产品 → 包装设计」现在点开就是工作台，中间不再夹一层自夸的说明页。 */
  else if (path === '/product') page = <OldRouteRedirect to="/studio" />;
  else if (path === '/about') page = <SiteAbout />;
  /* 独立登录页（V5 那版做的，保留）：整屏左右分栏，登录后回 ?next= */
  else if (isAuthPage) page = <Login />;
  else if (path === '/studio') page = <StudioPage />;
  else if (path === '/new') page = <NewDesign />;
  else if (path === '/structures') page = <Structures />;
  /* 包装设计：/workspace 与历史路径 /projects 指向同一个页面，旧链接不 404 */
  else if (path === '/workspace' || path === '/projects') page = <Workspace />;
  /* 复刻设计已下线（2026-11-17）：整条产品线不再维护，
     老书签统一送回包装工作台，不做 404。 */
  else if (path.startsWith('/replicate')) page = <OldRouteRedirect to="/studio" />;
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
  /* 帮助与反馈已经并入「关于 · 帮助中心」：那一页可搜索，比旧的 FAQ 长页好找 */
  else if (path === '/help') page = <OldRouteRedirect to="/about" />;
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
          {/* 2.0 只有一个壳：顶部导航 + 正文 +（公开页）页脚。
              左侧栏整体撤掉——开始 / Luna AI / 包装设计 / 复刻设计
              全部收进顶部导航与账户菜单，页面自己负责居中。
              登录页例外：它是整屏左右分栏，自带顶栏，不套导航。 */}
          <div className={isAuthPage
            ? 'app no-side is-auth'
            : `site-root app is-site ${isFullBleed ? 'is-fullbleed' : ''} ${path.startsWith('/luna') ? 'is-luna' : ''} ${isStudioWizard ? 'is-nonav' : ''}`}>
            <RouteBar active={navigating} />

            {isAuthPage ? <>
              <Suspense fallback={<PageFallback />}>
                {page}
                <RouteReady key={`ready:${hash}`} onReady={markShown} />
              </Suspense>
            </> : <>
              {!isStudioWizard && <SiteNav onLogin={requestLogin} />}
              <main className="main" ref={mainRef}>
                {/* 公开页的 chunk 都是几十 KB，但首屏遇到发版瞬间仍可能等一两秒。
                    这里不给「空白 + 页脚顶上来」的画面，先占住一屏高度。 */}
                <Suspense fallback={<div className="site-page" style={{ minHeight: '72vh' }} />}>
                  {page}
                  <RouteReady key={`ready:${hash}`} onReady={markShown} />
                </Suspense>
              </main>
              {showFooter && <SiteFooter />}
              {/* 品牌开场：只在首页、且同一会话没播过时出现 */}
              <SiteIntro enabled={path === '/'} />
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
