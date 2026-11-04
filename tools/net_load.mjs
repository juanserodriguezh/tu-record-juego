// Multiplayer load lab (v107): N real game pages in one room (host + N-1 guests), every page sending race states at
// 20 Hz like netTick, for a few seconds. Measures what the network has to carry and how fresh the other cars are:
//   - per page: messages and KB per second sent (RTCDataChannel.send / WebSocket.send are counted)
//   - broker: publishes per second (relay mode)
//   - on one guest: age of the newest state of another GUEST (sender clock → now; same machine, same clock):
//     median, p95 and max, and the longest gap between two new states (a stall = what looks "trabado")
//   node tools/net_load.mjs rtc|relay [N=5] [seconds=12]      (THREE_DIR, NET_DEPS as for net_test.mjs)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import { createRequire } from 'node:module';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..'), DIST = process.env.DIST || path.join(root, 'dist');
const mode = process.argv[2] || 'rtc', N = +process.argv[3] || 5, SECS = +process.argv[4] || 12;
const MIME = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(DIST, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/spa.html'));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const req = createRequire(path.join(process.env.NET_DEPS || root, 'package.json'));
const { ExpressPeerServer } = req('peer'), express = req('express'), peerJsPath = req.resolve('peerjs/dist/peerjs.min.js');
const app = express(), peerSrv = app.listen(9133, '127.0.0.1'); app.use('/', ExpressPeerServer(peerSrv, { path: '/' }));
const broker = req('aedes')(), { WebSocketServer, createWebSocketStream } = req('ws');
let pubs = 0; broker.on('publish', (p, c) => { if (c && /^armk-racing/.test(p.topic)) pubs++; });
new WebSocketServer({ host: '127.0.0.1', port: 9134, handleProtocols: () => 'mqtt' }).on('connection', (ws) => broker.handle(createWebSocketStream(ws)));
const browser = await chromium.launch();
const log = (m) => console.log(m);
async function open(i) {
  const pg = await (await browser.newContext({ viewport: { width: 640, height: 400 } })).newPage(); pg.setDefaultTimeout(300000);
  if (process.env.THREE_DIR) await pg.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.160.0/')[1]), contentType: 'text/javascript' }));
  await pg.route(/peerjs(@1\.5\.5\/dist|\/1\.5\.5)\/peerjs\.min\.js/, r => r.fulfill({ path: peerJsPath, contentType: 'text/javascript' }));
  await pg.addInitScript((o) => {
    try { localStorage.setItem('spa_rec_settings', JSON.stringify({ quality: 'bajo', fpsCap: 30 })); } catch (e) { }
    window.__P2P_SERVER = { host: '127.0.0.1', port: 9133, path: '/', secure: false, config: o.noRtc ? { iceServers: [], iceTransportPolicy: 'relay' } : { iceServers: [] } };
    window.__RELAY_URLS = ['ws://127.0.0.1:9134'];
    const C = window.__netCount = { n: 0, b: 0 };
    const wrap = (P) => { const s = P.send; P.send = function (d) { C.n++; C.b += typeof d === 'string' ? d.length : (d.byteLength || d.size || 0); return s.apply(this, arguments); }; };
    wrap(RTCDataChannel.prototype); wrap(WebSocket.prototype);
  }, { noRtc: mode === 'relay' && i > 0 });
  await pg.goto(`http://localhost:${srv.address().port}/spa.html`);
  await pg.waitForFunction(() => window.__spa && document.getElementById('loading').hidden);
  await pg.evaluate(() => { __spa.freeze(true); __spa.openLobby(); });
  await pg.waitForFunction(() => __spa.net().avail === true);
  return pg;
}
const pages = [];
for (let i = 0; i < N; i++) pages.push(await open(i));
const H = pages[0];
await H.evaluate((n) => { document.getElementById('netName').value = 'P0'; }, 0);
await H.click('#netCreate'); await H.waitForFunction(() => __spa.net().code);
const code = await H.evaluate(() => __spa.net().code);
for (let i = 1; i < N; i++) {
  await pages[i].evaluate((c) => __spa.netJoin(c, false), code);
  await pages[i].waitForFunction(() => __spa.net().code && __spa.net().room.length > 1, null, { timeout: 90000 });
}
await H.waitForFunction((n) => __spa.net().room.length === n, N, { timeout: 90000 });
log(`${N} pilots in room ${code} (${mode}); guest links: ${JSON.stringify(await Promise.all(pages.slice(1).map(p => p.evaluate(() => __spa.net().via))))}`);
// race traffic: the game's own sender when it has one (__spa.netStress), else what v91-v106 netTick did (full presence)
await Promise.all(pages.map((p, i) => p.evaluate((i) => {
  let k = 0; const now = () => Date.now();
  const st = () => { k++; return [100 + k * 0.5, 200 + i * 3, 0.5, 60 + i, 0.3, 1, 1000 + k * 3.123, 12.34]; };
  window.__latest = new Map(); window.__gaps = [];
  if (__spa.netStress) __spa.netStress(true, st);
  else window.__stress = setInterval(() => __spa.netRoom.presence({ st: st(), rs: 7, now: now() }), 50);
}, i)));
await new Promise(r => setTimeout(r, 2000));
// probe on guest 1: newest state of guest 2 (age) and the gaps between new states
const P = pages[1], target = await pages[2].evaluate(() => __spa.netRoom.id);
await P.evaluate((tg) => {
  let last = null, lastAt = 0; window.__ages = []; window.__gaps = [];
  window.__probe = setInterval(() => {
    let ts = null;
    if (__spa.netLatestTs) ts = __spa.netLatestTs(tg);
    else { const e = __spa.netRoom.list.get(tg); ts = e && e.presence && e.presence.now; }
    if (ts == null) return;
    const t = Date.now(); window.__ages.push(t - ts);
    if (ts !== last) { if (last != null) window.__gaps.push(t - lastAt); last = ts; lastAt = t; }
  }, 10);
}, target);
// main-thread cost of the traffic (pages are frozen, so this is the network code): CDP script + task time
if (process.env.RACE) await Promise.all(pages.map(p => p.evaluate(() => { __spa.S.mode = 'pause'; })));   // lobby UI off, as in a race
const cdps = await Promise.all(pages.map(async p => { const c = await p.context().newCDPSession(p); await c.send('Performance.enable'); return c; }));
const met = () => Promise.all(cdps.map(async c => Object.fromEntries((await c.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))));
const m0 = await met();
const c0 = await Promise.all(pages.map(p => p.evaluate(() => ({ ...__netCount })))), p0 = pubs, t0 = Date.now();
await new Promise(r => setTimeout(r, SECS * 1000));
const c1 = await Promise.all(pages.map(p => p.evaluate(() => ({ ...__netCount })))), p1 = pubs, dt = (Date.now() - t0) / 1000;
const m1 = await met();
const pr = await P.evaluate(() => { clearInterval(__probe); const s = (a) => a.slice().sort((x, y) => x - y), q = (a, f) => a.length ? s(a)[Math.min(a.length - 1, Math.floor(a.length * f))] : null; return { ageMed: q(__ages, 0.5), age95: q(__ages, 0.95), ageMax: q(__ages, 1), gapMed: q(__gaps, 0.5), gap95: q(__gaps, 0.95), gapMax: q(__gaps, 1), states: __gaps.length }; });
const rows = pages.map((p, i) => ({ page: i ? 'guest' + i : 'host', msgPerS: Math.round((c1[i].n - c0[i].n) / dt), kBPerS: +((c1[i].b - c0[i].b) / dt / 1024).toFixed(1), scriptMsPerS: Math.round((m1[i].ScriptDuration - m0[i].ScriptDuration) / dt * 1000), taskMsPerS: Math.round((m1[i].TaskDuration - m0[i].TaskDuration) / dt * 1000) }));
console.table(rows);
log(`broker publishes/s: ${Math.round((p1 - p0) / dt)}`);
log(`guest1 sees guest2: new states/s ${(pr.states / dt).toFixed(1)}, age ms median ${pr.ageMed} p95 ${pr.age95} max ${pr.ageMax}, gap ms median ${pr.gapMed} p95 ${pr.gap95} max ${pr.gapMax}`);
console.log('RESULT ' + JSON.stringify({ mode, N, rows, brokerPerS: Math.round((p1 - p0) / dt), probe: pr }));
await browser.close(); srv.close(); peerSrv.close(); process.exit(0);
