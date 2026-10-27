// Frame-cost profile of the built game (needs playwright, like shot.mjs). Serves dist/ itself.
// node tools/perf.mjs <track> <car> <scene> [quality] [seconds] [width]
//   scene: menu · race (12 AI rivals, the AI drives the player, chase camera) · pause · cockpit
//   per drawn frame: JS time of the frame callback, draw calls and triangles of every pass (shadow map + scene + post).
//   fps = frames drawn per second. Headless Chromium rasterises on the CPU (SwiftShader, ~1 FPS with a full grid), so fps and
//   jsMs only compare builds on the same machine; calls and triangles are exact. LOD=1 waits for the car LODs (LOD=0: off).
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..'), DIST = path.join(root, 'dist');
const [trk = 'spa', car = 'amg_gt3', scn = 'race', q = 'medio', secs = '8', W = '1280'] = process.argv.slice(2);
const MIME = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript' };
const srv = http.createServer((rq, r) => { const f = path.join(DIST, decodeURIComponent(rq.url.split('?')[0]).replace(/^\/$/, '/spa.html'));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: +W, height: Math.round(W * 0.5625) }, deviceScaleFactor: +(process.env.DPR || 1) }); pg.setDefaultTimeout(240000);
const errs = []; pg.on('pageerror', e => errs.push(String(e)));
if (process.env.THREE_DIR) await pg.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.160.0/')[1]), contentType: 'text/javascript' }));
await pg.addInitScript(() => {
  const P = window.__perf = { on: false, f: [] }, raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    const r = window.__spa && window.__spa.renderer && window.__spa.renderer();
    if (!P.on || !r) return cb(t);
    r.info.autoReset = false; r.info.reset();
    const t0 = performance.now(); cb(t); const t1 = performance.now();
    if (r.info.render.calls) P.f.push([t1 - t0, r.info.render.calls, r.info.render.triangles]);   // refreshes skipped by the FPS cap draw nothing
  });
});
await pg.goto(`http://localhost:${srv.address().port}/spa.html`);
await pg.waitForFunction(() => window.__spa && !document.getElementById('menu').hidden);
await pg.evaluate(async ([t, c, qq]) => {
  const st = __spa.S.settings; st.quality = qq; st.fps = false;
  await __spa.switchTrack(t); __spa.selectCar(c);
}, [trk, car, q]);
await pg.waitForFunction(() => document.getElementById('loading').hidden);
// apply the quality the same way the settings button does
await pg.evaluate((qq) => { const b = [...document.querySelectorAll('#setQuality button')].find(x => x.dataset.k === qq); if (b) b.click(); }, q);
if (scn !== 'menu') {
  await pg.evaluate(() => { const g = __spa.S.game; g.mode = 'rapida'; g.rivals = true; g.nRivals = 12; g.laps = 5; g.start = 'grid'; __spa.setAuto(7); __spa.startFromMenu(); });
  await pg.waitForTimeout(9000);   // lights out and the field gets going
  if (process.env.LOD) console.log('lod', JSON.stringify(await pg.evaluate(async (on) => { const r = __spa.lod ? await __spa.lodFlush() : null; if (__spa.lod) __spa.lod(on === '1'); return r; }, process.env.LOD)));
  if (scn === 'cockpit') await pg.evaluate(() => { while (__spa.S.camIdx !== 2) __spa.cycleCam(); });
  if (scn === 'pause') await pg.keyboard.press('Escape');
}
await pg.waitForTimeout(1500);
await pg.evaluate(() => { __perf.f = []; __perf.on = true; });
await pg.waitForTimeout(+secs * 1000);
const res = await pg.evaluate(() => { __perf.on = false; return { f: __perf.f, mode: __spa.S.mode, dpr: __spa.renderer().getPixelRatio(), post: __spa.post(), sh: __spa.renderer().shadowMap.enabled }; });
const n = res.f.length;
const avg = (k) => n ? res.f.reduce((a, x) => a + x[k], 0) / n : 0, pct = (k, p) => { const v = res.f.map(x => x[k]).sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(v.length * p))] || 0; };
const out = { track: trk, car, scene: scn, quality: q, mode: res.mode, dpr: res.dpr, post: res.post, shadows: res.sh, fps: +(n / +secs).toFixed(1), jsMs: +avg(0).toFixed(2), jsP95: +pct(0, 0.95).toFixed(2), calls: Math.round(avg(1)), tris: Math.round(avg(2)), errors: errs.length };
console.log(JSON.stringify(out));
await b.close(); srv.close();
