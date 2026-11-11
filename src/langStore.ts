/* ============================================================
 * 当前语言快照（非组件模块用）
 * ------------------------------------------------------------
 * 界面文案统一走 useLang().t，但那要求「在组件里」。
 * 鉴权、订阅、云同步、AI 回退这些模块也会产出用户可见文案，
 * 它们拿不到 hook 上下文，于是这里存一份当前语言快照：
 *   LangProvider 在渲染期写入，任何模块都能用 tl() 取到同语言文案。
 * 单独成文件（不放在 i18n.tsx）是为了让 Node 单测可以 import 而不拉进 React。
 * ============================================================ */
export type Lang = 'zh' | 'en';

let CURRENT: Lang = 'zh';

export const setCurrentLang = (l: Lang) => { CURRENT = l; };
export const currentLang = (): Lang => CURRENT;
/** tl('中文', 'English') —— 语义与组件内 t() 完全一致 */
export const tl = (zh: string, en: string) => (CURRENT === 'en' ? en : zh);
