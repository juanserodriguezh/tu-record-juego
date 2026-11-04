// One road surface per spot (v97): loads every circuit in Chromium and lists any non-decal surface of the scenery that lies
// on the circuit asphalt (a few cm above or below it). Such a layer shows through the asphalt near a low camera (onboard)
// as a patch of another texture with a wavy edge. Exit 1 if any circuit has one.
// node tools/road_layers.mjs [track,track…]      (needs playwright; THREE_DIR for offline sandboxes, like tools/shot.mjs)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..'), DIST = path.join(root, 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(DIST, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/spa.html'));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 640, height: 360 } }); pg.setDefaultTimeout(300000);
const errs = []; pg.on('pageerror', e => errs.push(String(e)));
if (process.env.THREE_DIR) await pg.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.160.0/')[1]), contentType: 'text/javascript' }));
await pg.goto(`http://localhost:${srv.address().port}/spa.html`);
await pg.waitForFunction(() => window.__spa && !document.getElementById('menu').hidden);
const all = await pg.evaluate(() => __spa.trackIds());
const tracks = process.argv[2] ? process.argv[2].split(',') : all;
let bad = 0;
for (const t of tracks) {
  await pg.evaluate(async t => { await __spa.switchTrack(t); }, t);
  await pg.waitForFunction(() => document.getElementById('loading').hidden);
  const r = await pg.evaluate(() => __spa.roadLayers());
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${t.padEnd(12)} ${r.tris} flat triangles checked${r.ok ? '' : ''}`);
  for (const l of r.layers) console.log(`     ${l.tag}: ${l.n} points on the asphalt, ${Math.round(l.dy[0] * 1000)}..${Math.round(l.dy[1] * 1000)} mm from it, s ${l.s.map(x => x[0] === x[1] ? x[0] : x[0] + '-' + x[1]).join(' ')} m, first at ${l.at}`);
  if (!r.ok) bad++;
}
console.log(bad ? `${bad} circuit(s) with a second road layer` : 'every circuit: one road surface per spot', '| page errors:', errs.length ? errs : 'none');
await b.close(); srv.close(); process.exit(bad ? 1 : 0);
