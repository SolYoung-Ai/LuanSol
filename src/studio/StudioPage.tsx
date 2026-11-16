/* ============================================================
   Studio 2.0 — /studio 路由入口
   ------------------------------------------------------------
   · 未登录：直接交给登录页（App 层已经重定向），这里只兜底不留白屏
   · /studio            → 欢迎界面（带启动弹窗）
   · /studio?id=st_xxx  → 这个项目的九步向导
   需求项目一人一份：数据存在 lunasol_projects，RLS 按 owner_id 隔离，
   换账号看不到彼此的设计。
   ============================================================ */
import React, { Suspense, lazy } from 'react';
import { useAuth } from '../cloud/auth';
import { useHash } from '../ui';
import { useLang } from '../i18n';

const StudioHome = lazy(() => import('./StudioHome'));
const StudioWizard = lazy(() => import('./StudioWizard'));

function Bare({ children }: { children: React.ReactNode }) {
  return <div className="st-wizard"><div className="st-loading">{children}</div></div>;
}

export default function StudioPage() {
  const { t } = useLang();
  const auth = useAuth();
  const hash = useHash();
  const query = hash.split('?')[1] || '';
  const id = new URLSearchParams(query).get('id') || '';

  if (!auth.ready) return <Bare><span className="st-spin" aria-hidden />{t('正在确认登录状态…', 'Checking your session…')}</Bare>;
  if (!auth.user) return <Bare>{t('正在前往登录…', 'Taking you to sign in…')}</Bare>;

  return <Suspense fallback={<Bare><span className="st-spin" aria-hidden />{t('正在打开工作室…', 'Opening the studio…')}</Bare>}>
    {id ? <StudioWizard id={id} key={id} /> : <StudioHome />}
  </Suspense>;
}
