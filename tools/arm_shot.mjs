// Cockpit arms check: for each car, cockpit camera with the wheel straight, full left and full right lock.
// Saves shots/<prefix>_<car>_<0|L|R>.png and prints how much of the screen the arms + gloves cover
// (pixels that change when they are hidden; frozen frame, so the comparison is pixel exact).
// node tools/arm_shot.mjs <prefix> <track> <car,car,...> [width]     (env: DIST, THREE_DIR, DPR, OPEN)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..'), DIST = process.env.DIST || path.join(root, 'dist');
const [pre = 'arms', trk = 'monza', cars = 'sf26', W = '1000'] = process.argv.slice(2);
const MIME = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(DIST, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/spa.html'));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const port = srv.address().port;
fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
const out = [];
for (const car of cars.split(',')) {
  const b = await chromium.launch();   // one browser per car: SwiftShader runs out of memory after a few scanned cars
  const pg = await b.newPage({ viewport: { width: +W, height: Math.round(W * 0.5625) }, deviceScaleFactor: +(process.env.DPR || 1) }); pg.setDefaultTimeout(240000);
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  if (process.env.THREE_DIR) await pg.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.160.0/')[1]), contentType: 'text/javascript' }));
  await pg.goto(`http://localhost:${port}/spa.html`);
  await pg.waitForFunction(() => window.__spa && !document.getElementById('menu').hidden);
  await pg.evaluate(async ([t, c]) => { await __spa.switchTrack(t); __spa.selectCar(c); }, [trk, car]);
  await pg.waitForFunction(() => document.getElementById('loading').hidden);
  await pg.evaluate((o) => { __spa.startFromMenu(); __spa.S.camIdx = 2; if (o) __spa.armCfg.open = +o; }, process.env.OPEN || '');   // OPEN=<rad>: try another single-seater wheel lock
  await pg.waitForTimeout(5000);
  const row = { car };
  for (const [tag, key] of [['0', null], ['L', 'KeyA'], ['R', 'KeyD']]) {
    await pg.evaluate((k) => { for (const c of ['KeyA', 'KeyD']) window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); if (k) window.dispatchEvent(new KeyboardEvent('keydown', { code: k })); }, key);
    await pg.waitForFunction(([k]) => Math.abs(__spa.INPUT.steer - (k === 'KeyA' ? 1 : k === 'KeyD' ? -1 : 0)) < 0.02, [key]);
    await pg.waitForTimeout(1500);
    await pg.evaluate(() => __spa.freeze(true));
    const f = path.join(root, 'shots', `${pre}_${car}_${tag}.png`);
    const shotA = await pg.screenshot({ path: f });
    // hide arms + hands, redraw the same frame, compare
    await pg.evaluate(() => { const m = __spa.model; window.__armVis = []; for (const A of m.arms || []) { for (const o of [A.arm.group, A.H.root]) { window.__armVis.push([o, o.visible]); o.visible = false; } } __spa.redraw(); });
    await pg.waitForTimeout(1200);
    const shotB = await pg.screenshot();
    await pg.evaluate(() => { for (const [o, v] of window.__armVis) o.visible = v; __spa.freeze(false); });
    const cov = await pg.evaluate(async ([a, bb]) => {
      const load = (u8) => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + u8; });
      const [A, B] = await Promise.all([load(a), load(bb)]);
      const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const x = c.getContext('2d');
      x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data; x.drawImage(B, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0, nc = 0; const w = c.width, h = c.height;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) { n++; const p = i / 4, px = p % w, py = (p / w) | 0; if (Math.abs(px - w / 2) < w * 0.3 && py < h * 0.6) nc++; }
      return { all: +(100 * n / (w * h)).toFixed(1), view: +(100 * nc / (w * 0.6 * h * 0.6)).toFixed(1) };
    }, [shotA.toString('base64'), shotB.toString('base64')]);
    row[tag] = cov;
  }
  row.errors = errs.length; out.push(row); console.log(JSON.stringify(row));
  await b.close();
}
srv.close();
