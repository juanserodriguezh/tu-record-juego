// Browser screenshots of the built game (needs: npm i  ->  playwright).  Serves dist/ itself.
// node tools/shot.mjs <prefix> <track> <car> "<js>|||<js>..." [width]
//   env: DPR=2 (device pixel ratio, like a Retina screen) · DIST=<dir> (serve another build, e.g. the one before a change)
//   each js snippet runs after the session has started, then a screenshot <prefix>_<n>.png is saved in shots/
//   handy hooks (window.__spa): view(s, d, h, back, lookD, fov) track camera · camAt([x,y,z],[x,y,z],fov) car-local camera
//   car (live Vehicle) · model · T (track) · simulate(sec) · race · selectCar(id) · switchTrack(id) · startFromMenu()
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..'), DIST = process.env.DIST || path.join(root, 'dist');
const [pre = 'shot', trk = 'spa', car = 'amg_gt3', js = '1', W = '1100'] = process.argv.slice(2);
const MIME = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(DIST, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/spa.html'));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: process.env.SWIFTSHADER ? ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=swiftshader'] : [] });
const pg = await b.newPage({ viewport: { width: +W, height: Math.round(W * 0.57) }, deviceScaleFactor: +(process.env.DPR || 1) }); pg.setDefaultTimeout(180000);
const errs = []; pg.on('pageerror', e => errs.push(String(e)));
if (process.env.THREE_DIR) await pg.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.160.0/')[1]), contentType: 'text/javascript' }));   // offline sandboxes only
await pg.goto(`http://localhost:${port}/spa.html`);
await pg.waitForFunction(() => window.__spa && !document.getElementById('menu').hidden);
await pg.evaluate(async ([t, c]) => { await __spa.switchTrack(t); __spa.selectCar(c); }, [trk, car]);
await pg.waitForFunction(() => document.getElementById('loading').hidden);
await pg.evaluate(() => __spa.startFromMenu()); await pg.waitForTimeout(6000);
fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
let i = 0; for (const s of js.split('|||')) { const r = await pg.evaluate(s); await pg.waitForTimeout(2000); const f = path.join(root, 'shots', `${pre}_${i}.png`); await pg.screenshot({ path: f }); console.log(i++, JSON.stringify(r), '->', path.relative(root, f)); }
console.log('page errors:', errs.length ? errs : 'none'); await b.close(); srv.close();
