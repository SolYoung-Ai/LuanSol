/* 用 esbuild 把 TS 测试套件打包后，在 Node 与浏览器分别执行。
 * npm test 会同时产出 tests/suite.browser.js，供 Chrome 无头浏览器加载。 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();
const opts = {
  entryPoints: [path.join(root, 'tests/suite.ts')],
  bundle: true,
  logLevel: 'silent',
  target: 'es2020',
  define: { 'process.env.NODE_ENV': '"test"' },
};
await build({ ...opts, platform: 'node', format: 'esm', outfile: path.join(root, 'tests/.build/suite.node.mjs') });
await build({ ...opts, platform: 'browser', format: 'iife', globalName: 'LunaTest', outfile: path.join(root, 'tests/suite.browser.js') });

const mod = await import(pathToFileURL(path.join(root, 'tests/.build/suite.node.mjs')).href + `?v=${Date.now()}`);
const results = await mod.runTests();

/* 计费口径一致性（只能在这里做：套件同时打进浏览器，不能用 fs）。
 * 云函数不是 TS，没法 import PRICING，只能复制一份 IMAGE_TIER_COST。
 * 这条检查把两份数字对起来，避免「界面写 6 分、服务端扣 12 分」这种事故。 */
{
  const fs = await import('node:fs');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  let ok = true;
  let detail = '';
  try {
    const plans = read('src/cloud/plans.ts');
    const fn = read('cloudfunctions/lunasol-ai/index.js');
    const num = (src, key) => {
      const m = new RegExp(`${key}\\s*:\\s*([0-9.]+)`).exec(src);
      if (!m) throw new Error(`src/cloud/plans.ts 里找不到 ${key}`);
      return Number(m[1]);
    };
    const block = /const IMAGE_TIER_COST = \{([\s\S]*?)\n\};/.exec(fn);
    if (!block) throw new Error('云函数里找不到 IMAGE_TIER_COST');
    const srv = {};
    for (const m of block[1].matchAll(/'?([a-z0-9-]+)'?\s*:\s*(\d+)/g)) srv[m[1]] = Number(m[2]);

    const promo = num(plans, 'gptImagePromoRate');
    const pay = (n) => Math.max(1, Math.round(n * promo));
    const sd55 = /const SD55_COST = (\d+);/.exec(fn);
    if (!sd55) throw new Error('云函数里找不到 SD55_COST');
    const expect = {
      flash: num(plans, 'imageFlash'),
      pro: num(plans, 'imagePro'),
      'gpt2-text': pay(num(plans, 'imageGpt2Text')),
      'gpt2-ref': pay(num(plans, 'imageGpt2Ref')),
      sd55: Number(sd55[1]),
    };
    const bad = Object.keys(expect).filter((k) => srv[k] !== expect[k]);
    if (bad.length) {
      ok = false;
      detail = bad.map((k) => `${k}: 前端 ${expect[k]} / 云函数 ${srv[k] ?? '缺失'}`).join('；');
    } else {
      detail = Object.entries(expect).map(([k, v]) => `${k}=${v}`).join(' ');
    }
  } catch (e) {
    ok = false;
    detail = e.message;
  }
  results.push({ name: '安全 · 服务端生图价目与 PRICING 一致（防双口径）', ok, detail });
}

let failed = 0;
for (const r of results) {
  const mark = r.ok ? '✓' : '✕';
  console.log(`${mark} ${r.name}${r.ok ? '' : '\n    ' + r.detail}`);
  if (r.ok && r.detail !== 'OK') console.log(`    ${r.detail}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} 项通过`);
process.exit(failed ? 1 : 0);
