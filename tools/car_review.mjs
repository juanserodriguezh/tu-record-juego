// Review shots of one car: 4 exterior angles in the garage + cockpit view on track.  One browser per car (SwiftShader dies after ~3 scans).
// node tools/car_review.mjs <outDir> <track> <car>[,<car>...]     env: THREE_DIR, DIST, W (width, 1000), EXTRA="<js>|||<js>" extra cockpit-state shots
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..'), DIST = process.env.DIST || path.join(root, 'dist');
const [out = 'shots/review', trk = 'monza', cars = 'amg_gt3'] = process.argv.slice(2), W = +(process.env.W || 1000);
const MIME = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(DIST, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/spa.html'));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const port = srv.address().port; fs.mkdirSync(out, { recursive: true });
const EXT = [['fl', "__spa.camAt([2.6,1.5,3.6],[0,0.5,0.2],38)"], ['rr', "__spa.camAt([-2.6,1.5,-3.8],[0,0.5,-0.2],38)"], ['top', "__spa.camAt([0.01,5.2,0.3],[0,0,0.3],48)"], ['side', "__spa.camAt([4.6,0.9,0],[0,0.55,0],38)"]];
for (const car of cars.split(',')) {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: W, height: Math.round(W * 0.57) } }); pg.setDefaultTimeout(240000);
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  if (process.env.THREE_DIR) await pg.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.160.0/')[1]), contentType: 'text/javascript' }));
  try {
    await pg.goto(`http://localhost:${port}/spa.html`);
    await pg.waitForFunction(() => window.__spa && !document.getElementById('menu').hidden);
    await pg.evaluate(async ([t, c]) => { await __spa.switchTrack(t); __spa.selectCar(c); }, [trk, car]);
    await pg.waitForFunction(() => document.getElementById('loading').hidden);
    await pg.evaluate(() => __spa.startFromMenu()); await pg.waitForTimeout(5000);
    if (!process.env.NOEXT) for (const [k, js] of EXT) { await pg.evaluate(js); await pg.waitForTimeout(2500); await pg.screenshot({ path: path.join(out, `${car}_${k}.png`) }); }
    await pg.evaluate(() => { __spa.noview(); __spa.S.camIdx = 2; if (1) for (const e of document.querySelectorAll('#hud, .hud, #minimap, #lights')) e.style.display = 'none'; }); await pg.waitForTimeout(3500); await pg.screenshot({ path: path.join(out, `${car}_cab.png`) });
    let i = 0; for (const js of (process.env.EXTRA || '').split('|||').filter(Boolean)) { const r = await pg.evaluate(js); await pg.waitForTimeout(3000); await pg.screenshot({ path: path.join(out, `${car}_x${i++}.png`) }); console.log(car, 'extra', JSON.stringify(r)); }
    console.log(car, 'ok', errs.length ? errs : '');
  } catch (e) { console.log(car, 'FAILED', String(e).slice(0, 200)); }
  await b.close();
}
srv.close();
