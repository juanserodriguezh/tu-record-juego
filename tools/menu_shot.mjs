// Screenshots of the main menu (no session started).  Serves dist/ itself.
// node tools/menu_shot.mjs <prefix> "<js>|||<js>..." [width] [height] [mobile]
//   each js snippet runs in the menu, then shots/<prefix>_<n>.png is saved. mobile=1 emulates a phone (touch, DPR 2).
//   handy: __spa.menuStep('pista'|'coche'|'sesion'), document.querySelector(...).click()
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..'), DIST = path.join(root, 'dist');
const [pre = 'menu', js = '1', W = '1280', H = '', mob = ''] = process.argv.slice(2);
const MIME = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(DIST, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/spa.html'));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const port = srv.address().port;
const b = await chromium.launch();
const ctx = await b.newContext(mob ? { viewport: { width: +W, height: +H || Math.round(W * 2.16) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: +W, height: +H || Math.round(W * 0.5625) } });
const pg = await ctx.newPage(); pg.setDefaultTimeout(180000);
const errs = []; pg.on('pageerror', e => errs.push(String(e)));
if (process.env.THREE_DIR) await pg.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.160.0/')[1]), contentType: 'text/javascript' }));
await pg.goto(`http://localhost:${port}/spa.html`);
await pg.waitForFunction(() => window.__spa && !document.getElementById('menu').hidden && document.getElementById('loading').hidden);
await pg.waitForTimeout(1500);
fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
let i = 0; for (const s of js.split('|||')) { const r = await pg.evaluate(s); await pg.waitForFunction(() => document.getElementById('loading').hidden); await pg.waitForTimeout(1500); const f = path.join(root, 'shots', `${pre}_${i}.png`); await pg.screenshot({ path: f }); console.log(i++, JSON.stringify(r), '->', path.relative(root, f)); }
console.log('page errors:', errs.length ? errs : 'none'); await b.close(); srv.close();
