/* 十步向导端到端走查工具（配合 agent-browser 使用）。
 *
 * 用法：
 *   agent-browser open "http://127.0.0.1:4173/#/wizard"
 *   agent-browser eval "$(cat scripts/walk.js)"          # 注入 window.__t
 *   agent-browser eval "window.__t.state()"              # 查看当前步骤 / 提示 / 输入框
 *
 * window.__t 提供按可见文本点击、按 placeholder 填值（React 受控组件兼容）、
 * 读取当前步骤与 toast 的能力，用来验证「参数都填好了却仍被拦住」这类假死问题。
 * 草稿存在 IndexedDB（库名 lunasol-studio），清库需用 indexedDB.deleteDatabase。
 */
window.__t = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  q: (s) => Array.from(document.querySelectorAll(s)),
  clickText(txt, sel = 'button') {
    const el = Array.from(document.querySelectorAll(sel)).find((b) => (b.textContent || '').trim().includes(txt));
    if (!el) return 'NOT_FOUND:' + txt;
    el.click();
    return 'OK:' + txt;
  },
  fill(ph, val) {
    const el = Array.from(document.querySelectorAll('input,textarea')).find((e) => (e.placeholder || '').includes(ph));
    if (!el) return 'NOT_FOUND:' + ph;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return 'OK:' + ph;
  },
  fillNth(inputSel, idx, val) {
    const el = document.querySelectorAll(inputSel)[idx];
    if (!el) return 'NOT_FOUND:' + idx;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return 'OK:' + idx;
  },
  state() {
    const seg = this.q('.v3-progress-seg').findIndex((s) => s.className.includes('current'));
    return {
      step: seg + 1,
      title: document.querySelector('.v3-title, h1')?.textContent?.trim() || '',
      toast: this.q('[class*="toast"]').map((e) => (e.textContent || '').trim()).filter(Boolean),
      inputs: this.q('input,textarea').map((e) => ({ t: e.type, ph: (e.placeholder || '').slice(0, 12), v: (e.value || '').slice(0, 14) })),
    };
  },
  async next(label = '下一步') {
    const b = this.q('button').find((x) => (x.textContent || '').includes(label));
    if (!b) return 'NO_NEXT';
    b.click();
    await this.sleep(700);
    return JSON.stringify(this.state());
  },
};
'ready';
