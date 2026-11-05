// Multiplayer test: real pages of the game joining private rooms by code (v91).
//   node tools/net_test.mjs p2p    PeerJS transport: local PeerServer, 3 browser contexts (host, guest, third)
//   node tools/net_test.mjs room   Claude-room transport, emulated with a BroadcastChannel shim (same presence API)
//   node tools/net_test.mjs relay  like p2p, but the guests cannot open WebRTC (no path, as on mobile data / CGNAT):
//                                  they must get in through the MQTT relay (local aedes broker over WebSocket)
//   node tools/net_test.mjs lab    interpolation lab: synthetic 20 Hz states with lag, jitter and loss
// Exit 1 if any check fails. Screenshots in shots/net_*.png.
// Needs: THREE_DIR=<three@0.160.0 package> (jsDelivr is blocked in the cloud box) and, for p2p,
//        NET_DEPS=<folder with node_modules/peer and node_modules/peerjs>  (npm i peer@1 peerjs@1.5.5 there;
//        relay also needs aedes@0.51 and ws@8).
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import { createRequire } from 'node:module';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..'), DIST = path.join(root, 'dist');
const mode = process.argv[2] || 'p2p';
const MIME = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => { const f = path.join(DIST, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/spa.html'));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const port = srv.address().port;
let peerSrv = null, peerJsPath = null;
const P2P = mode === 'p2p' || mode === 'relay';
if (P2P) {
  const req = createRequire(path.join(process.env.NET_DEPS || root, 'package.json'));
  const { ExpressPeerServer } = req('peer'), express = req('express'); peerJsPath = req.resolve('peerjs/dist/peerjs.min.js');
  const app = express(); peerSrv = app.listen(9123, '127.0.0.1'); app.use('/', ExpressPeerServer(peerSrv, { path: '/' }));
  if (mode === 'relay') {   // MQTT broker over WebSocket, like the public ones the game uses
    const broker = req('aedes')(), { WebSocketServer, createWebSocketStream } = req('ws');
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 9125, handleProtocols: () => 'mqtt' });
    wss.on('connection', (ws) => broker.handle(createWebSocketStream(ws)));
  }
}
fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
let fails = 0; const t0 = Date.now();
const ok = (cond, msg, extra) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

const SHIM = () => {   // Claude room emulation: presence records over a BroadcastChannel (same tab-local API as window.claude.use('room'))
  const ch = new BroadcastChannel('fake-claude-room'), id = 'tab-' + Math.random().toString(36).slice(2, 8), list = new Map(), fns = [];
  const peers = () => [...list.values()].map(e => ({ peer: e.peer, sameTab: e.peer === id, kind: 'viewer', presence: e.p, updatedAt: e.at }));
  const emit = () => { const ps = peers(); fns.forEach(f => { try { f({ peers: ps }); } catch (e) { console.error(e); } }); };
  ch.onmessage = (ev) => { const m = ev.data; if (m.t === 'u') { list.set(m.peer, { peer: m.peer, p: m.p, at: Date.now() }); emit(); } else if (m.t === 'x') { list.delete(m.peer); emit(); } else if (m.t === 'hello' && list.has(id)) ch.postMessage({ t: 'u', peer: id, p: list.get(id).p }); };
  const ROOM = { peers, onPeers(f) { fns.push(f); }, presence(patch) { const p = Object.assign({}, (list.get(id) || { p: {} }).p); for (const k in patch) { if (patch[k] === null) delete p[k]; else p[k] = patch[k]; } list.set(id, { peer: id, p, at: Date.now() }); ch.postMessage({ t: 'u', peer: id, p }); emit(); return Promise.resolve(); } };
  list.set(id, { peer: id, p: {}, at: Date.now() });
  window.claude = { use: async (k) => { if (k !== 'room') throw new Error('no'); return ROOM; } };
  ch.postMessage({ t: 'hello' });
  window.__shimLeave = () => { ch.postMessage({ t: 'x', peer: id }); };
};

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] });
async function openGame(ctx, name, init) {
  const pg = await ctx.newPage(); pg.setDefaultTimeout(240000);
  pg.errs = []; pg.logs = []; pg.on('pageerror', e => pg.errs.push(String(e))); pg.on('console', m => pg.logs.push(m.type() + ' ' + m.text().slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error' && !/WebGL|GPU|favicon|404|Could not connect to peer/.test(m.text())) pg.errs.push('console: ' + m.text()); });
  if (process.env.THREE_DIR) await pg.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ path: path.join(process.env.THREE_DIR, r.request().url().split('three@0.160.0/')[1]), contentType: 'text/javascript' }));
  if (peerJsPath) await pg.route(/peerjs(@1\.5\.5\/dist|\/1\.5\.5)\/peerjs\.min\.js/, r => r.fulfill({ path: peerJsPath, contentType: 'text/javascript' }));
  await pg.addInitScript(() => { try { localStorage.setItem('spa_rec_settings', JSON.stringify({ quality: 'bajo', fpsCap: 30 })); } catch (e) { } });
  if (init) await pg.addInitScript(init.fn, init.arg);
  await pg.goto(`http://localhost:${port}/spa.html`);
  await pg.waitForFunction(() => window.__spa && !document.getElementById('menu').hidden && document.getElementById('loading').hidden);
  pg.nm = name; log(name + ' loaded');
  return pg;
}
const net = (pg) => pg.evaluate(() => __spa.net());
const until = (pg, fn, arg, ms) => pg.waitForFunction(fn, arg, { timeout: ms || 30000, polling: 200 }).then(() => true, () => false);
const shot = async (pg, f) => { await pg.evaluate(() => __spa.redraw()); await pg.waitForTimeout(1200); await pg.screenshot({ path: path.join(root, 'shots', f + '.png') }); log('shot ' + f); };
async function setName(pg, n) { await pg.fill('#netName', n); }

if (mode === 'lab') {
  // ---- interpolation lab: a car on an 80 m circle at 50 m/s; 20 Hz states, 40 ms latency + 0-60 ms jitter, 5 % loss.
  // new  = sender-clock timeline + adaptive delay + Hermite (netSampleAt);  old = receive-time stamps + linear, fixed 110 ms
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const pg = await openGame(ctx, 'lab');
  const res = await pg.evaluate(() => {
    const { netSampleAt, netClock, netRenderTime } = __spa.netLab;
    const R = 80, V = 50, w = V / R;
    const truth = (t) => { const a = w * t / 1000; return [R * Math.sin(a), R * Math.cos(a), a + Math.PI / 2]; };
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const out = { x: 0, z: 0 }, rows = [];
    for (const [jit, loss] of [[0, 0], [30, 0.02], [60, 0.05], [120, 0.1]]) {
      const pk = [];
      for (let ts = 0; ts < 20000; ts += 50) { if (rnd() < loss) continue; const [x, z, h] = truth(ts); pk.push({ ts, rt: ts + 40 + rnd() * jit, st: [x, z, h, V, 0, 0, 0, 0] }); }
      pk.sort((a, b) => a.rt - b.rt);
      const run = (neu) => {
        const e = { buf: [] }, oldB = []; let k = 0, prev = null, sp = [], ct = [], lag = [];
        for (let tf = 1000; tf < 19500; tf += 1000 / 60) {
          while (k < pk.length && pk[k].rt <= tf) { const p = pk[k++]; if (neu) { const last = e.buf[e.buf.length - 1]; if (!last || p.ts > last.ts) { netClock(e, p.ts, last, p.rt); e.buf.push({ ts: p.ts, st: p.st }); } } else oldB.push({ t: p.rt, st: p.st }); }
          let x, z, shown;
          if (neu) { shown = netRenderTime(e, tf, 1000 / 60); netSampleAt(e.buf, shown, out); x = out.x; z = out.z; }
          else {   // the v90 code: linear between receive times at now − 110 ms, extrapolation ≤ 0.3 s
            const tR = tf - 110; let a = oldB[0], b = null;
            for (let j = oldB.length - 1; j >= 0; j--) if (oldB[j].t <= tR) { a = oldB[j]; b = oldB[j + 1] || null; break; }
            const A = a.st; if (b) { const f = Math.min(1, Math.max(0, (tR - a.t) / Math.max(1, b.t - a.t))); x = A[0] + (b.st[0] - A[0]) * f; z = A[1] + (b.st[1] - A[1]) * f; }
            else { const ex = Math.min(0.3, Math.max(0, (tR - a.t) / 1000)); x = A[0] + V * Math.cos(A[2]) * ex; z = A[1] - V * Math.sin(A[2]) * ex; }
            shown = null;
          }
          ct.push(Math.abs(Math.hypot(x, z) - R));
          if (prev) sp.push(Math.hypot(x - prev[0], z - prev[1]) * 60);
          if (shown != null) lag.push(tf - shown - 40);   // display delay beyond the 40 ms network floor
          prev = [x, z];
        }
        const m = sp.reduce((s, v) => s + v, 0) / sp.length, sd = Math.sqrt(sp.reduce((s, v) => s + (v - m) ** 2, 0) / sp.length);
        return { crossRmsCm: +(Math.sqrt(ct.reduce((s, v) => s + v * v, 0) / ct.length) * 100).toFixed(1), crossMaxCm: +(Math.max(...ct) * 100).toFixed(0), speedSd: +sd.toFixed(2), extraDelayMs: lag.length ? Math.round(lag.reduce((s, v) => s + v, 0) / lag.length) : 110 };
      };
      rows.push({ jitterMs: jit, loss, neu: run(true), old: run(false) });
    }
    return rows;
  });
  for (const r of res) { console.log(`jitter ${r.jitterMs} ms, loss ${r.loss * 100}%:  new ${JSON.stringify(r.neu)}   old ${JSON.stringify(r.old)}`); }
  ok(res.every(r => r.neu.speedSd <= r.old.speedSd && r.neu.crossRmsCm <= r.old.crossRmsCm), 'new interpolation is smoother and closer to the path in every case');
  // ---- v106 prediction lab: a car lapping the real circuit (Spa centreline + racing offset), speed 25-80 m/s
  // with braking/acceleration; 20 Hz states, one-way latency L + jitter + loss. Where does the receiver draw it
  // compared with where it really is at that instant? v91-v105 = interpolation (netSampleAt at netRenderTime),
  // v106 = netPredict from the newest state, aged by the clock offset + the latency estimate (round trip / 2).
  const pred = await pg.evaluate(() => {
    const { netSampleAt, netClock, netRenderTime, netPredict, trackPoint } = __spa.netLab, T = __spa.T;
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const spd = (t) => 52 + 27 * Math.sin(t / 2300) + 8 * Math.sin(t / 700);   // m/s, changes like corners/straights
    const S0 = 300, sAt = []; { let s = S0; for (let t = 0; t <= 40000; t += 5) { sAt.push(s); s += spd(t) * 0.005; } }
    const dAt = (t) => 2.5 * Math.sin(t / 1900);
    const truth = (t) => { const k = Math.min(sAt.length - 1, Math.round(t / 5)), s = sAt[k], P = trackPoint(T, s, dAt(t)); return { x: P.x, z: P.z, h: P.h, e: P.e, s }; };
    const out = { x: 0, z: 0 }, rows = [], Q = __spa.netLab.newQ();
    for (const [L, jit, loss] of [[30, 10, 0], [60, 30, 0.02], [100, 60, 0.05], [150, 80, 0.08]]) {
      const pk = [];
      for (let ts = 0; ts < 38000; ts += 50) {
        if (rnd() < loss) continue;
        const a = truth(ts), b = truth(ts + 10), u = Math.hypot(b.x - a.x, b.z - a.z) / 0.01, h = Math.atan2(b.x - a.x, b.z - a.z);
        pk.push({ ts, rt: ts + L + rnd() * jit, st: [a.x, a.z, h, u, 0, 0, a.s, a.e] });
      }
      pk.sort((p, q) => p.rt - q.rt);
      const run = (neu) => {
        const e = { buf: [] }; let k = 0; const behind = [], err = [];
        for (let tf = 2000; tf < 37000; tf += 1000 / 60) {
          while (k < pk.length && pk[k].rt <= tf) { const p = pk[k++]; const last = e.buf[e.buf.length - 1]; if (!last || p.ts > last.ts) { netClock(e, p.ts, last, p.rt); e.buf.push({ ts: p.ts, st: p.st }); if (e.buf.length > 30) e.buf.shift(); } }
          if (neu) { const last = e.buf[e.buf.length - 1], age = Math.min(0.6, Math.max(0, (tf - e.off + L - last.ts) / 1000)); netPredict(last.st, age, out); }
          else netSampleAt(e.buf, netRenderTime(e, tf, 1000 / 60), out);
          const tr = truth(tf), q = T.project(out.x, out.z, -1, Q);
          let ds = tr.s - q.s; ds -= Math.round(ds / T.L) * T.L;
          behind.push(ds); err.push(Math.hypot(out.x - tr.x, out.z - tr.z));
        }
        const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], p95 = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
        return { behindM: +med(behind).toFixed(2), errMedM: +med(err).toFixed(2), err95M: +p95(err).toFixed(2) };
      };
      rows.push({ L, jit, loss, now: run(true), before: run(false) });
    }
    return rows;
  });
  for (const r of pred) console.log(`latency ${r.L} ms + jitter ${r.jit} ms, loss ${r.loss * 100}%:  v106 ${JSON.stringify(r.now)}   before ${JSON.stringify(r.before)}`);
  ok(pred.every(r => Math.abs(r.now.behindM) < 1.5 && r.now.errMedM < r.before.errMedM / 3), 'prediction: the car is shown where it is now (median along-track < 1.5 m, error a third of before or less)');
  // ---- v113 smoothness lab: the same lapping car, drawn at 60 FPS through the full display path. Smooth = the drawn
  // car's acceleration and turn rate match the real car's (no speed kicks or heading snaps when a state arrives).
  // v112 = first-order decay of the correction + heading straight from the prediction; v113 = netPoseStep.
  const smooth = await pg.evaluate(() => {
    const { netClock, netPredict, netPoseStep, trackPoint } = __spa.netLab, T = __spa.T;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const spd = (t) => 52 + 27 * Math.sin(t / 2300) + 8 * Math.sin(t / 700);
    const S0 = 300, sAt = []; { let s = S0; for (let t = 0; t <= 40000; t += 5) { sAt.push(s); s += spd(t) * 0.005; } }
    const dAt = (t) => 2.5 * Math.sin(t / 1900);
    const truth = (t) => { const f = Math.max(0, Math.min(sAt.length - 2, t / 5)), k = Math.floor(f), sv = sAt[k] + (sAt[k + 1] - sAt[k]) * (f - k), P = trackPoint(T, sv, dAt(t)); return { x: P.x, z: P.z, e: P.e, s: sv }; };
    const wrap = (a) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
    const rows = [];
    for (const [L, jit, loss] of [[60, 30, 0.02], [150, 80, 0.05], [250, 150, 0.08], [300, 200, 0.12]]) {
      const pk = [];
      for (let ts = 0; ts < 38000; ts += 50) {
        if (rnd() < loss) continue;
        const a = truth(ts), b = truth(ts + 10), u = Math.hypot(b.x - a.x, b.z - a.z) / 0.01, h = Math.atan2(b.x - a.x, b.z - a.z);
        pk.push({ ts, rt: ts + L + rnd() * jit, st: [a.x, a.z, h, u, 0, 0, a.s, a.e] });
      }
      pk.sort((p, q) => p.rt - q.rt);
      const run = (neu, spring) => {
        const e = { buf: [], phint: -1, spring }, pos = [], tru = [], hd = [];
        let k = 0, old = null; const out = { x: 0, z: 0 };
        for (let i = 0, tf = 2000; tf < 37000; i++) {
          const dt = (1000 / 60 + (rnd() - 0.5) * 6) / 1000; tf += dt * 1000;   // a real frame clock wobbles a little
          while (k < pk.length && pk[k].rt <= tf) { const p = pk[k++]; const last = e.buf[e.buf.length - 1]; if (!last || p.ts > last.ts) { netClock(e, p.ts, last, p.rt); e.buf.push({ ts: p.ts, st: p.st }); if (e.buf.length > 30) e.buf.shift(); } }
          if (!e.buf.length) continue;
          let x, z, h;
          if (neu) { const D = netPoseStep(e, tf, dt, L); x = D.x; z = D.z; h = D.h; }
          else {   // v112 netPoseRemote
            const last = e.buf[e.buf.length - 1], age = Math.min(0.6, Math.max(0, (tf - e.off + L - last.ts) / 1000));
            netPredict(last.st, age, out, e.phint); if (out.i >= 0) e.phint = out.i;
            const vx = out.u * Math.sin(out.h), vz = out.u * Math.cos(out.h);
            if (!old) old = { ex: 0, ez: 0 };
            else { const dx = out.x - (old.px + old.pvx * dt), dz = out.z - (old.pz + old.pvz * dt); if (dx * dx + dz * dz < 16) { old.ex -= dx; old.ez -= dz; } else { old.ex = 0; old.ez = 0; } }
            old.px = out.x; old.pz = out.z; old.pvx = vx; old.pvz = vz;
            const kk = Math.exp(-dt * 7); old.ex *= kk; old.ez *= kk;
            x = out.x + old.ex; z = out.z + old.ez; h = out.h;
          }
          const tr = truth(tf);
          pos.push([tf, x, z]); tru.push([tf, tr.x, tr.z]); hd.push([tf, h]);
        }
        // accelerations by finite differences over each frame (drawn vs real), turn rate error, position error
        const acc = (a, i) => { const [t0, x0, z0] = a[i - 1], [t1, x1, z1] = a[i], [t2, x2, z2] = a[i + 1], d1 = (t1 - t0) / 1000, d2 = (t2 - t1) / 1000;
          return [((x2 - x1) / d2 - (x1 - x0) / d1) / ((d1 + d2) / 2), ((z2 - z1) / d2 - (z1 - z0) / d1) / ((d1 + d2) / 2)]; };
        const aErr = [], rErr = [], pErr = [], kick = [];
        for (let i = 2; i < pos.length - 1; i++) {
          const a = acc(pos, i), b = acc(tru, i); aErr.push(Math.hypot(a[0] - b[0], a[1] - b[1]));
          const dtv = (hd[i][0] - hd[i - 1][0]) / 1000, rate = wrap(hd[i][1] - hd[i - 1][1]) / dtv;
          const vx1 = (tru[i][1] - tru[i - 1][1]), vz1 = (tru[i][2] - tru[i - 1][2]), vx0 = (tru[i - 1][1] - tru[i - 2][1]), vz0 = (tru[i - 1][2] - tru[i - 2][2]);
          const trate = wrap(Math.atan2(vx1, vz1) - Math.atan2(vx0, vz0)) / dtv;
          rErr.push([rate, trate]);
          pErr.push(Math.hypot(pos[i][1] - tru[i][1], pos[i][2] - tru[i][2]));
          // speed kick: change of drawn speed in one frame beyond the real one (m/s)
          const sp = (A, j) => Math.hypot(A[j][1] - A[j - 1][1], A[j][2] - A[j - 1][2]) / ((A[j][0] - A[j - 1][0]) / 1000);
          kick.push(Math.abs((sp(pos, i) - sp(pos, i - 1)) - (sp(tru, i) - sp(tru, i - 1))));
        }
        const q = (a, f) => +a.slice().sort((x, y) => x - y)[Math.floor(a.length * f)].toFixed(2), rms = (a) => +Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length).toFixed(2);
        // turn kick: change of the drawn turn rate in one frame (deg/s), p99 -- a heading snap shows up here
        const tk = []; for (let i = 1; i < rErr.length; i++) tk.push(Math.abs(rErr[i][0] - rErr[i - 1][0]) * 180 / Math.PI);
        return { accErrRms: rms(aErr), turnKick99: q(tk, 0.99), kick99: q(kick, 0.99), posMed: q(pErr, 0.5), pos95: q(pErr, 0.95) };
      };
      rows.push({ L, jit, loss, v113: run(true), v112: run(false) });
    }
    return rows;
  });
  for (const r of smooth) console.log(`smooth: latency ${r.L} ms + jitter ${r.jit} ms, loss ${r.loss * 100}%:  v113 ${JSON.stringify(r.v113)}   v112 ${JSON.stringify(r.v112)}`);
  ok(smooth.every(r => r.v113.accErrRms < r.v112.accErrRms / 2 && r.v113.kick99 < r.v112.kick99 / 2 && r.v113.turnKick99 <= r.v112.turnKick99 && r.v113.pos95 < r.v112.pos95 * 1.5 + 0.3),
    'smoothness: no speed kicks or heading snaps when states arrive (acceleration error and speed kicks at most half of v112), position error not worse than 1.5x');
  await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
}

// ---- multiplayer flows ---------------------------------------------------------------------------------
const P2P_INIT = { fn: (o) => {
  // relay mode: guests get no ICE candidates at all (relay-only policy, no TURN), so WebRTC can never open
  window.__P2P_SERVER = { host: '127.0.0.1', port: 9123, path: '/', secure: false, config: o.noRtc ? { iceServers: [], iceTransportPolicy: 'relay' } : { iceServers: [] }, debug: o.debug || 0 };
  window.__RELAY_URLS = o.relay ? ['ws://127.0.0.1:9125'] : [];
  if (o.max) window.__NET_MAX = o.max; }, arg: {} };
const mk = async (name, max) => {
  // the Claude-room shim talks over a BroadcastChannel, which only spans one browser context: one shared context there
  const ctx = mode === 'room' ? (mk.ctx || (mk.ctx = browser.newContext({ viewport: { width: 1280, height: 720 } }))) : browser.newContext({ viewport: { width: 1280, height: 720 } });
  const inits = P2P ? { fn: P2P_INIT.fn, arg: { max, debug: process.env.NET_DEBUG ? 2 : 0, relay: mode === 'relay', noRtc: mode === 'relay' && name !== 'host' } } : { fn: (o) => { (new Function('(' + o.shim + ')()'))(); if (o.max) window.__NET_MAX = o.max; }, arg: { shim: SHIM.toString(), max } };
  return openGame(await ctx, name, inits);
};
// room size: in P2P the host enforces it; in the Claude room each joiner checks it (same constant for all real players)
const [A, B, C] = await Promise.all([mk('host', 2), mk('guest', mode === 'room' ? 2 : 0), mk('third', mode === 'room' ? 2 : 0)]);
for (const pg of [A, B, C]) await pg.evaluate(() => __spa.openLobby());
// software rendering is slow: stop drawing the 3D menu while testing the lobby (frees the CPU for WebRTC)
const freeze = (on) => Promise.all([A, B, C].filter(p => !p.isClosed()).map(p => p.evaluate((o) => __spa.freeze(o), on)));
await freeze(true);
await until(B, () => __spa.net().avail === true, null, 30000);

log('1) invalid code');
await B.fill('#netCode', 'oo-11'); await B.click('#netJoin');
let n = await net(B); ok(n.err === 'invalid' && /no válido/.test(n.toast), 'invalid code rejected with a pop-up', { err: n.err, toast: n.toast });

log('2) code with no room');
await B.fill('#netCode', ''); await B.type('#netCode', 'zz9q');   // typed: joins by itself on the 4th character
ok(await until(B, () => __spa.net().err === 'nohost', null, 35000), 'unknown code: "no hay ninguna sala"', (await net(B)).note);
await shot(B, 'net_' + mode + '_1_error_codigo');

log('3) create + join');
await setName(A, 'Ana'); await setName(B, 'Beto');
await A.click('#netCreate');
ok(await until(A, () => !!__spa.net().code, null, 30000), 'host gets a room code');
const code = (await net(A)).code; ok(/^[A-HJ-NP-Z2-9]{4}$/.test(code), 'code is 4 unambiguous characters', code);
await B.fill('#netCode', ''); await B.type('#netCode', code.toLowerCase());
const joined = await until(B, (c) => __spa.net().code === c && __spa.net().room.length === 2, code, 30000);
ok(joined, 'guest joined by typing the code (no extra tap)');
if (mode === 'relay') ok((await net(B)).via === 'relay', 'guest without a direct path got in through the relay', (await net(B)).via);
else if (mode === 'p2p') ok((await net(B)).via === 'rtc', 'guest on a direct link', (await net(B)).via);
if (process.env.NET_DEBUG && !joined) { console.log('B', JSON.stringify(await net(B)), (await B.inputValue('#netCode'))); console.log('A', JSON.stringify(await net(A))); console.log(B.logs.filter(l => !/GPU stall|fallback/.test(l)).slice(-40).join('\n')); console.log('--A'); console.log(A.logs.filter(l => !/GPU stall|fallback/.test(l)).slice(-25).join('\n')); process.exit(2); }
ok(await until(A, () => __spa.net().room.length === 2 && __spa.net().room.some(p => p.name === 'Beto'), null, 15000), 'host sees the guest by name');
n = await net(A); ok(n.disabled && /Esperando a 1/.test(n.startHint), 'host start disabled until the guest is ready', n.startHint);
ok(/Beto entró/.test(n.toast), 'host gets a "entró en la sala" notice', n.toast);

log('4) profile sync: car + colour + name');
await B.evaluate(() => __spa.selectCar('w17'));
await B.click('#netColors button:nth-child(5)');
ok(await until(A, () => { const b = __spa.net().room.find(p => p.name === 'Beto'); return b && b.car === 'w17' && b.c1 === '#00a3e0'; }, null, 15000), 'host sees the guest change car and colour in the room');
await setName(B, 'Beto R.');
ok(await until(A, () => __spa.net().room.some(p => p.name === 'Beto R.'), null, 15000), 'rename propagates');

log('5) full room');
await C.fill('#netCode', code); await C.click('#netJoin');
ok(await until(C, () => __spa.net().err === 'full', null, 30000), 'third pilot refused: room full (test limit 2)', (await net(C)).note);

log('6) ready + host settings');
await A.evaluate(() => __spa.netHostSettings({ netLaps: 2, netCol: 0 }));
ok(await until(B, () => /No/.test(document.getElementById('netHostCfg').textContent) && /2/.test(document.getElementById('netHostCfg').textContent), null, 15000), 'guest sees laps 2 and collisions off');
await B.evaluate(() => __spa.menuStep('sesion'));
await B.click('#startBtn');
ok(await until(A, () => __spa.net().canStart && !__spa.net().disabled, null, 15000), 'guest ready -> host can start');
n = await net(B); ok(n.startText === 'Listo ✓', 'guest button shows Listo ✓', n.startText);
await shot(A, 'net_' + mode + '_2_sala_anfitrion'); await shot(B, 'net_' + mode + '_3_sala_invitado');

log('7) race');
await freeze(false);
await A.click('#startBtn');
ok(await until(B, () => __spa.race && __spa.race.mode === 'multi', null, 120000), 'guest pulled into the race');
ok(await until(A, () => __spa.race && __spa.race.mode === 'multi', null, 60000), 'host in the race');
// on the grid, before the lights go out, each already sees the other car (v106: states flow during the lights)
ok(await until(A, () => __spa.car.u < 1 && (__spa.net().remotes || []).some(r => r.vis), null, 30000), 'host sees the guest car on the grid before anyone moves', await A.evaluate(() => [__spa.race.state, __spa.car.u, __spa.net().remotes]));
ok(await until(B, () => (__spa.net().remotes || []).some(r => r.vis), null, 30000), 'guest sees the host car on the grid', await B.evaluate(() => [__spa.race.state, __spa.net().remotes, __spa.netRoom && __spa.netRoom.lost]));
ok((await A.evaluate(() => __spa.race.netCol)) === false, 'collisions off reached the session');
await C.fill('#netCode', code); await C.click('#netJoin');
ok(await until(C, () => __spa.net().err === 'started', null, 60000), 'join during the race: "ya empezó"', (await net(C)).note);
for (const pg of [A, B]) await pg.evaluate(() => __spa.setAuto(8));
ok(await until(B, () => __spa.race.state === 'run' && __spa.car.u > 20, null, 120000), 'race started, guest moving');
await B.waitForTimeout(8000);
const ra = await A.evaluate(() => ({ stall: __spa.netRoom && __spa.netRoom.maxGap, r: __spa.net().remotes, st: [...document.querySelectorAll('#stRows li .n')].map(e => e.textContent) }));
const rb = await B.evaluate(() => ({ stall: __spa.netRoom && __spa.netRoom.maxGap, lost: __spa.netRoom && __spa.netRoom.lost, via: __spa.net().via, r: __spa.net().remotes, st: [...document.querySelectorAll('#stRows li .n')].map(e => e.textContent) }));
console.log('  host view', JSON.stringify(ra)); console.log('  guest view', JSON.stringify(rb));
ra.r = ra.r || []; rb.r = rb.r || [];
ok(ra.r.length === 1 && ra.r[0].vis && rb.r.length === 1 && rb.r[0].vis, 'each sees the other car on track');
// v108: the race badge says how this pilot is connected, with a measured ping (the Claude room too)
const badge = (pg) => pg.evaluate(() => { const b = document.getElementById('netInfo'); return b && !b.hidden ? b.textContent : null; });
await until(B, () => __spa.net().rtt != null, null, 30000);
const bA = await badge(A), bB = await badge(B), rttB = await B.evaluate(() => __spa.net().rtt);
ok(bA && /Anfitrión/.test(bA) && /FPS/.test(bA) && bB && /ping \d+ ms/.test(bB) && /FPS/.test(bB) && rttB != null, 'race badge: connection, ping and FPS on host and guest', [bA, bB, rttB]);
ok(ra.st.includes('Beto R.') && rb.st.includes('Ana'), 'standings show the other pilot by name');
if (mode === 'relay') {   // the broker drops the guest mid-race: it reconnects with the same id and the host keeps it
  await B.evaluate(() => __spa.netRoom.upMq.ws.close());
  await B.waitForTimeout(4000);
  await until(B, () => !!(__spa.netRoom.upMq && __spa.netRoom.upMq.ok), null, 60000);   // software rendering: slow
  await B.waitForTimeout(3000);
  const back = await until(A, () => { const r = (__spa.net().remotes || [])[0]; return r && r.vis && !r.left; }, null, 30000);
  const vb = await B.evaluate(() => ({ via: __spa.net().via, up: !!(__spa.netRoom.upMq && __spa.netRoom.upMq.ok), lost: __spa.netRoom.lost || false, log: __spa.netRoom.rlog, now: Date.now() % 100000, host: (__spa.net().remotes || [])[0] }));
  ok(back && vb.up && vb.host && !vb.host.left, 'relay dropped mid-race: guest reconnects and both still see each other', vb);
}
// headless Chromium renders in software at a few FPS, so states go out at a few Hz with big jitter: only check the
// estimates exist and the delay adapted to them (the lab mode measures smoothness)
ok([...ra.r, ...rb.r].every(r => isFinite(r.off) && isFinite(r.jit) && r.gap > 0), 'interpolation clock running (offset, jitter, send gap estimated)', [...ra.r, ...rb.r].map(r => ({ gap: Math.round(r.gap), jit: Math.round(r.jit) })));
// v106: where the guest shows the host's car vs where the host's car really is at the same instant (same machine,
// same clock). Positive = shown behind. Before v106 the remote was drawn ~(latency + buffer) in the past.
{ const rec = (pg, remote) => pg.evaluate((rm) => new Promise(res => { const out = [], t0 = Date.now();
    const f = () => { const r = rm ? (__spa.net().remotes || [])[0] : null; out.push(rm ? (r ? [Date.now(), r.x, r.z, r.age] : null) : [Date.now(), __spa.car.x, __spa.car.z, __spa.car.q.s, __spa.car.u]); if (Date.now() - t0 < 6000) setTimeout(f, 30); else res(out.filter(Boolean)); }; f(); }), remote);
  const [truth, seen] = await Promise.all([rec(A, false), rec(B, true)]);
  const at = (t) => { let k = truth.findIndex(p => p[0] >= t); if (k <= 0) return null; const a = truth[k - 1], b = truth[k], f = (t - a[0]) / Math.max(1, b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[4]]; };
  const errs = [], along = [];
  for (const p of seen) { const q = at(p[0]); if (!q) continue; const dx = p[1] - q[0], dz = p[2] - q[1]; errs.push(Math.hypot(dx, dz)); }
  // behind/ahead: compare with the host's heading of travel (sign of the error along the velocity)
  for (const p of seen) { const k = truth.findIndex(t => t[0] >= p[0]); if (k <= 0) continue; const a = truth[k - 1], b = truth[k], vx = b[1] - a[1], vz = b[2] - a[2], l = Math.hypot(vx, vz); if (l < 1e-3) continue; const q = at(p[0]); along.push(((q[0] - p[1]) * vx + (q[1] - p[2]) * vz) / l); }
  const med = (a) => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : NaN, spd = med(truth.map(t => t[4]));
  const res = { samples: errs.length, kmh: Math.round(spd * 3.6), medErr: +med(errs).toFixed(2), medBehind: +med(along).toFixed(2), age: +med(seen.map(p => p[3] || 0)).toFixed(3) };
  console.log('  remote vs truth', JSON.stringify(res));
  // a constant 0.25 s lag at this speed would show the car spd*0.25 m behind; the prediction must stay well under that
  // headless renders at 1-5 FPS, so states go out at a few Hz: printed only; `lab` measures the prediction }
}
// barrels: both have the host's attenuator; a barrel the host knocks over lands in the same place on the guest (host-authoritative)
{ const nb = await Promise.all([A, B].map(p => p.evaluate(() => __spa.BW ? __spa.BW.list.length : -1)));
  ok(nb[0] > 0 && nb[0] === nb[1], 'both have the attenuator barrels', nb);
  await A.evaluate(() => { const W = __spa.BW, b = W.list[W.list.length - 1]; W.wake(b); b.vy = 3; b.wx = 4; b.ownT = null; });
  const moved = await until(B, () => { const b = __spa.BW.list[__spa.BW.list.length - 1]; return !b.sleep || b.dent > 0 || Math.abs(b.qw) < 0.99; }, null, 30000);
  ok(moved, 'the guest sees the barrel the host knocked over move');
  const settled = await until(A, () => __spa.BW.list.every(b => b.sleep), null, 60000);
  await B.waitForTimeout(3000);
  const ha = await A.evaluate(() => __spa.BW.list.map(b => [b.x, b.y, b.z])), hb = await B.evaluate(() => __spa.BW.list.map(b => [b.x, b.y, b.z]));
  const dmax = Math.max(...ha.map((p, k) => Math.hypot(p[0] - hb[k][0], p[1] - hb[k][1], p[2] - hb[k][2])));
  ok(settled && dmax < 0.05, 'after it settles the guest has the host\'s barrels (< 5 cm)', { cm: +(dmax * 100).toFixed(1) }); }
// look at whoever is ahead from behind: the one behind sees the name tag
const pa = await A.evaluate(() => __spa.race.player.progress), pb = await B.evaluate(() => __spa.race.player.progress);
const behind = pa < pb ? A : B;
await behind.evaluate(() => __spa.setAuto(null));
await shot(behind, 'net_' + mode + '_4_carrera_etiqueta');
const tagOn = await behind.evaluate(() => __spa.net().remotes[0].tag);
if (Math.abs(pa - pb) < 12) console.log('  skip name tag check: the cars are side by side (' + Math.abs(pa - pb).toFixed(1) + ' m), the other one is out of the camera');
else ok(tagOn, 'name tag shown over the other car (from the car behind)');

log('8) host leaves');
if (P2P) await A.close(); else { await A.evaluate(() => window.__shimLeave()); await A.close(); }
ok(await until(B, () => __spa.net().closed && __spa.net().notices.some(t => /anfitrión salió/.test(t)), null, 60000), 'guest told the host left (race goes on)', (await net(B)).notices.slice(-2));
await shot(B, 'net_' + mode + '_5_anfitrion_salio');
await B.evaluate(() => { document.getElementById('pauseBtn').click(); document.getElementById('pMenu').click(); });
ok(await until(B, () => !__spa.net().code && document.getElementById('lobbyRoom').hidden, null, 30000), 'back in the menu the room is closed');

log('9) host closes the room while guests wait');
await freeze(true);
await C.evaluate(() => __spa.openLobby()); await C.fill('#netName', 'Caro'); await C.click('#netCreate');
ok(await until(C, () => !!__spa.net().code, null, 30000), 'third creates a new room');
const code2 = (await net(C)).code;
await B.evaluate(() => __spa.openLobby()); await B.fill('#netCode', ''); await B.type('#netCode', code2);
ok(await until(B, (c) => __spa.net().code === c, code2, 30000), 'guest joins it');
await C.click('#netLeave');
ok(await until(B, () => !__spa.net().code && __spa.net().err === 'hostgone', null, 30000), 'host closed the room: guest back to the join form with a notice', (await net(B)).toast);
await shot(B, 'net_' + mode + '_6_sala_cerrada');

for (const pg of [A, B, C]) if (!pg.isClosed()) ok(!pg.errs.length, pg.nm + ': no page errors', pg.errs.slice(0, 3));
console.log(fails ? fails + ' FAILED' : 'all passed', `(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
await browser.close(); srv.close(); if (peerSrv) peerSrv.close();
process.exit(fails ? 1 : 0);
