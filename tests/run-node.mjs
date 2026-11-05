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
let failed = 0;
for (const r of results) {
  const mark = r.ok ? '✓' : '✕';
  console.log(`${mark} ${r.name}${r.ok ? '' : '\n    ' + r.detail}`);
  if (r.ok && r.detail !== 'OK') console.log(`    ${r.detail}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} 项通过`);
process.exit(failed ? 1 : 0);
