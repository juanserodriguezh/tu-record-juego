// Fresh-device check (v104): pilots with no saved state create rooms from the UI, also when they tap before the
// online module (PeerJS) has loaded; and inside Claude, a viewer the room does not admit gets the web-version link.
//   THREE_DIR=... NET_DEPS=... node tools/net_fresh_test.mjs     (exit 1 if a check fails; shots/net_fresh_*.png)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import { createRequire } from 'node:module';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..'), DIST = path.join(root, 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(DIST, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/spa.html'));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const port = srv.address().port;
const req = createRequire(path.join(process.env.NET_DEPS || root, 'package.json'));
const { ExpressPeerServer } = req('peer'), express = req('express'), peerJsPath = req.resolve('peerjs/dist/peerjs.min.js');
const app = express(), peerSrv = app.listen(9124, '127.0.0.1'); app.use('/', ExpressPeerServer(peerSrv, { path: '/' }));
fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
let fails = 0; const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };
const browser = await chromium.launch();
async function open(name, init, peerDelay) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });   // new context = empty localStorage (another device)
  const pg = await ctx.newPage(); pg.setDefaultTimeout(240000); pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(String(e)));
  if (process.env.THREE_DIR) await pg.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.160.0/')[1]), contentType: 'text/javascript' }));
  await pg.route(/peerjs(@1\.5\.5\/dist|\/1\.5\.5)\/peerjs\.min\.js/, async r => { await new Promise(s => setTimeout(s, peerDelay || 0)); r.fulfill({ path: peerJsPath, contentType: 'text/javascript' }); });
  await pg.addInitScript(init || (() => { window.__P2P_SERVER = { host: '127.0.0.1', port: 9124, path: '/', secure: false, config: { iceServers: [] } }; }));
  await pg.goto(`http://localhost:${port}/spa.html`);
  await pg.waitForFunction(() => window.__spa && !document.getElementById('menu').hidden && document.getElementById('loading').hidden);
  await pg.evaluate(() => __spa.freeze && __spa.freeze(true));
  console.log(name + ' loaded'); return pg;
}
const net = (pg) => pg.evaluate(() => __spa.net());
const until = (pg, fn, ms) => pg.waitForFunction(fn, null, { timeout: ms || 40000, polling: 200 }).then(() => true, () => false);
const shot = async (pg, f) => { await pg.evaluate(() => __spa.redraw()); await pg.waitForTimeout(800); await pg.screenshot({ path: path.join(root, 'shots', f + '.png') }); };

// 1. fresh device, PeerJS slow (5 s): Unirse a sala -> main button at once. Before: the tap only started loading and was lost.
const a = await open('A', null, 5000);
await a.click('#btnJoin'); await a.waitForTimeout(150);
const lbl0 = await a.textContent('#startBtn');
await a.click('#startBtn');
const s0 = await net(a);
ok(s0.avail == null, 'A: online module still loading when tapped', { avail: s0.avail, btn: lbl0 });
await shot(a, 'net_fresh_1_loading');
ok(await until(a, () => __spa.net().code && __spa.net().host), 'A: room created by the queued tap', await net(a));
await shot(a, 'net_fresh_2_hosting');
const code = (await net(a)).code;

// 2. another fresh device creates its own room with «Crear sala privada» (two hosts at once, different codes)
const b = await open('B', null, 0);
await b.click('#btnJoin');
await b.waitForSelector('#netCreate:visible');
await b.click('#netCreate');
ok(await until(b, () => __spa.net().code && __spa.net().host), 'B: second pilot hosts too', await net(b));
const codeB = (await net(b)).code; ok(codeB && codeB !== code, 'B: own code', { code, codeB });

// 3. a third fresh device joins B's room by typing the code
const c = await open('C', null, 0);
await c.click('#btnJoin'); await c.waitForSelector('#netCode:visible'); await c.fill('#netCode', codeB);
ok(await until(c, (k) => __spa.net().code && !__spa.net().host, 40000), 'C: joined B', await net(c));

// 4. inside Claude without room access (public link / signed out): message + web-version link
const d = await open('D', () => { window.claude = { use: async () => null }; }, 0);
await d.click('#btnJoin');
ok(await until(d, () => __spa.net().avail === false), 'D: Claude room unavailable');
const web = await d.evaluate(() => { const w = document.getElementById('netWeb'); return { href: w.href, note: document.getElementById('lobbyNote').textContent }; });
ok(/github\.io\/tu-record-juego/.test(web.href) && /versión web/.test(web.note), 'D: explains why and points to the web version', web);
await d.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
await d.click('#startBtn');
ok((await d.evaluate(() => window.__opened[0] || '')).includes('github.io'), 'D: main button opens the web version URL');
ok(/versión web/.test(await d.textContent('#startBtn')), 'D: main button opens the web version');
await d.evaluate(() => __spa.menuStep('sesion')); await d.waitForTimeout(1500);
await shot(d, 'net_fresh_3_claude_blocked');
for (const p of [a, b, c, d]) ok(!p.errs.length, 'no page errors', p.errs.slice(0, 3));
await browser.close(); srv.close(); peerSrv.close();
console.log(fails ? fails + ' FAILED' : 'all ok'); process.exit(fails ? 1 : 0);
