/* ============================================================
 * 语言（简体中文 / English）
 * ------------------------------------------------------------
 * 为什么只切换「界面文案」而不动内容：
 *   用户自己起的项目名、设计稿上的包装文案都按原文显示（不做机器翻译），
 *   强行翻译会破坏可溯源性与作者原意。所以语言切换只覆盖平台自己的界面文案，
 *   内容保持原文——这也是国际设计媒体网站的通行做法。
 * 为什么用 t(zh, en) 而不是一个大词典：
 *   文案就写在用到它的地方，改一句话不需要在词典和组件之间来回跳，
 *   也不会出现「词典里有一半 key 没人用」的腐化问题。
 * ============================================================ */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { setCurrentLang } from './langStore';

export type Lang = 'zh' | 'en';
export { currentLang, tl } from './langStore';
const LANG_KEY = 'lunasol.lang';

interface LangApi {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** t(『中文』, 'English') —— 当前语言决定返回哪一个 */
  t: (zh: string, en: string) => string;
}

const LangCtx = createContext<LangApi>({ lang: 'zh', setLang: () => {}, t: (zh) => zh });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh'; } catch { return 'zh'; }
  });
  // 同步写：首帧的子组件就要能读到正确语言，不能等 useEffect
  setCurrentLang(lang);

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* 隐私模式下写不进去，忽略即可 */ }
    document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
    // 标签页标题也跟着语言走：它是最容易被漏掉的界面文案
    document.title = lang === 'en' ? 'LunaSol — Everyone can be a designer' : 'LunaSol — 人人都能成为设计师';
  }, [lang]);

  const t = (zh: string, en: string) => (lang === 'en' ? en : zh);
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}
