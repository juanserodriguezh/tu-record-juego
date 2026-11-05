// =============================================================================
//  Multiplayer · Room Manager (private rooms by code, no matchmaking)
// =============================================================================
// Two transports expose the same small presence API { peers(), presence(patch), onPeers(fn, err) }:
//   A) the Claude room (window.claude.use('room')) when the page runs as a Claude artifact (signed-in viewers);
//   B) P2PRoom: WebRTC through PeerJS. The host claims the peer id P2P_PREFIX + CODE on the signalling server,
//      guests connect to it and the host relays everyone's presence (star). No backend of our own.
// Every client publishes ONE presence record; a room is the set of records that carry the same `code`.
//
// Presence record (all optional except g/code):
//   g 'spa1'             game tag (other games / old pages are ignored)
//   code, host 0|1, since  room code, host flag, join time (the oldest host wins)
//   pid name car c1 c2 pt fn rm   pilot profile: persistent id, nickname, car id, livery (c1 = avatar colour)
//   rdy 0|1              ready in the lobby
//   trk                  circuit this client has loaded (a guest is only "ready" on the host's circuit)
//   ph 'lobby'|'race'    phase
//   lp col               host only: room settings shown to guests (laps, collisions 1/0)
//   cfg                  host only, at start: { seq, laps, col, weather, trk, startAt, grid:[peer…] }
//   st rs fin            in race: [x, z, heading, u, v, lap, s, y], race seq, finish time
//   now                  sender clock (ms), stamped by netSet: lets the receiver time-stamp states without
//                        network jitter (see netClock / netSampleAt)
//
// Admission: in P2P the host decides (P2PRoom.admit → { t:'deny', why }); in the Claude room the joining
// client checks the shared presence before it publishes its code. Errors: invalid, nohost, full, started, hostgone.
const NET = { bar: 'real', bwSeen: null, bwSeq: 0, room: null, mode: null, avail: null, peers: [], code: null, host: false, offset: null, startPerf: 0, lastSend: 0, cfgSeen: 0, connecting: null, err: null, joining: false, hadHost: false, closed: false, roster: null };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no O/0 or I/1: a code read aloud or from a screenshot cannot be mistyped
const CODE_LEN = 4;
const NET_MAX = +window.__NET_MAX || 8;                   // pilots per room (the host relays every state: 8 × 20 Hz is light); tests lower it
const P2P_PREFIX = 'spa-record-v1-';                     // kept on purpose: rooms keep working across versions
const NET_SILENCE_LOAD = 75000;                         // the same during the first 75 s of a race: the circuit loads (a slow phone, Monaco)
const NET_SILENCE = 20000;                               // ms without any message before a PeerJS link counts as dead (a slow phone can stall seconds loading a circuit)

// ---- room codes ----------------------------------------------------------------
// accepts "k7qx", " K7-QX ", or a pasted invite link "…#K7QX"
function normCode(raw) {
  let s = String(raw || '').trim();
  const m = /#([A-Za-z0-9]{4,6})\s*$/.exec(s); if (m) s = m[1];
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
const codeValid = (c) => typeof c === 'string' && c.length === CODE_LEN && [...c].every(ch => CODE_CHARS.includes(ch));
const newCode = () => { let code = ''; do { code = ''; for (let i = 0; i < CODE_LEN; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; } while (NET.mode === 'room' && NET.peers.some(p => pres(p).code === code)); return code; };

// ---- pilot profile ---------------------------------------------------------------
function pilotId() {
  let id = store.get('pid', null);
  if (typeof id !== 'string' || id.length < 8) { id = ''; for (let i = 0; i < 10; i++) id += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; store.set('pid', id); }
  return id;
}
const pilotName = () => String(S.game.name || '').trim().slice(0, 16) || 'Piloto';
function pilotProfile() {
  const sp = carById(S.carId), liv = liveryOf(sp);
  return { pid: pilotId(), name: pilotName(), car: sp.id, c1: liv.col, c2: liv.col2, pt: liv.pattern, fn: liv.finish, rm: liv.rim };
}
// name, car or livery changed (menu, garage or the room panel): everyone in the room sees it at once
function netProfileSync() { if (NET.code) netSet(pilotProfile()); if (lobbyOn()) renderLobby(); }
const hexOr = (c, d) => /^#[0-9a-f]{6}$/i.test(c) ? c : d;

// ---- relay: MQTT over WebSocket (v106) -----------------------------------------------
// WebRTC needs a direct path between the two browsers. Between two home routers it usually works; on mobile
// data, carrier-grade NAT, some Wi-Fi and most school/company networks it does not, and the PeerJS TURN relay
// is not dependable. Then the guest talks to the host through a public MQTT broker (WebSocket + TLS): no account,
// no backend of ours. Same star protocol; the broker only forwards. Minimal MQTT 3.1.1 client: QoS 0 only.
const RELAY_URLS = () => window.__RELAY_URLS || ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const RELAY_TOPIC = 'armk-racing/v1/';
const RELAY_AFTER = 4000;
const NET_BATCH_MS = 40;   // the host sends the newest state of everyone every 40 ms (a state waits 20 ms on average)   // ms a guest waits for the direct link before it also tries the relay
class MqttWs {
  constructor(url, will) { this.url = url; this.will = will || null; this.ws = null; this.buf = new Uint8Array(0); this.subs = new Map(); this.pid = 1; this.ok = false; this.onclose = null; this.ping = 0; }
  static str(s) { const b = new TextEncoder().encode(s); const o = new Uint8Array(b.length + 2); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; }
  static pack(type, parts) {
    const len = parts.reduce((a, p) => a + p.length, 0), hd = [type]; let x = len;
    do { let d = x % 128; x = Math.floor(x / 128); if (x > 0) d |= 128; hd.push(d); } while (x > 0);
    const o = new Uint8Array(hd.length + len); o.set(hd, 0); let k = hd.length; for (const p of parts) { o.set(p, k); k += p.length; } return o;
  }
  connect(ms) {
    return new Promise((res, rej) => {
      let done = false; const fin = (ok, why) => { if (done) return; done = true; clearTimeout(to); ok ? res(this) : (this.close(), rej(why)); };
      const to = setTimeout(() => fin(false, 'timeout'), ms || 7000);
      let ws; try { ws = this.ws = new WebSocket(this.url, ['mqtt']); } catch (e) { fin(false, 'ws'); return; }
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        const id = 'armk-' + Math.random().toString(36).slice(2, 12);
        const flags = 0x02 | (this.will ? 0x04 : 0);
        const parts = [MqttWs.str('MQTT'), Uint8Array.of(4, flags, 0, 90), MqttWs.str(id)];   // keep-alive 90 s: a phone loading a circuit can freeze for a while
        if (this.will) parts.push(MqttWs.str(this.will.topic), MqttWs.str(JSON.stringify(this.will.msg)));
        ws.send(MqttWs.pack(0x10, parts));
      };
      ws.onerror = () => fin(false, 'ws');
      ws.onclose = () => { const was = this.ok; this.ok = false; clearInterval(this.ping); fin(false, 'ws'); if (was && this.onclose) this.onclose(); };
      ws.onmessage = (ev) => {
        const add = new Uint8Array(ev.data), b = new Uint8Array(this.buf.length + add.length); b.set(this.buf); b.set(add, this.buf.length); this.buf = b;
        for (;;) {
          const B = this.buf; if (B.length < 2) break;
          let len = 0, mul = 1, i = 1, d;
          do { if (i >= B.length) return; d = B[i++]; len += (d & 127) * mul; mul *= 128; } while (d & 128);
          if (B.length < i + len) break;
          const type = B[0] >> 4, body = B.subarray(i, i + len); this.buf = B.slice(i + len);
          if (type === 2) { if (body[1] === 0) { this.ok = true; this.ping = setInterval(() => this.raw(Uint8Array.of(0xc0, 0)), 20000); fin(true); } else fin(false, 'refused'); }
          else if (type === 3) {
            const tl = (body[0] << 8) | body[1], topic = new TextDecoder().decode(body.subarray(2, 2 + tl)), qos = (B[0] >> 1) & 3;
            const pay = body.subarray(2 + tl + (qos ? 2 : 0)), fn = this.subs.get(topic);
            if (fn) { let m = null; try { m = JSON.parse(new TextDecoder().decode(pay)); } catch (e) { } if (m && typeof m === 'object') fn(m); }
          }
        }
      };
    });
  }
  raw(u8) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(u8); } catch (e) { } }
  sub(topic, fn) { this.subs.set(topic, fn); const id = this.pid++ & 0xffff || 1; this.raw(MqttWs.pack(0x82, [Uint8Array.of(id >> 8, id & 255), MqttWs.str(topic), Uint8Array.of(0)])); }
  pub(topic, msg) { if (this.ok) this.raw(MqttWs.pack(0x30, [MqttWs.str(topic), new TextEncoder().encode(JSON.stringify(msg))])); }
  close() { clearInterval(this.ping); const ws = this.ws; this.ok = false; this.onclose = null; if (ws) { try { if (ws.readyState === 1) ws.send(Uint8Array.of(0xe0, 0)); ws.close(); } catch (e) { } } }
}
// a guest reached through the relay, shaped like a PeerJS DataConnection for the host code (open/data/close)
class RelayConn {
  constructor(mq, base, peer) { this.mq = mq; this.base = base; this.peer = peer; this.open = true; this.relay = true; this.h = {}; }
  on(ev, fn) { (this.h[ev] || (this.h[ev] = [])).push(fn); }
  fire(ev, a) { for (const f of this.h[ev] || []) { try { f(a); } catch (e) { console.warn(e); } } }
  send(m) { this.mq.pub(this.base + 'g/' + this.peer, m); }
  close() { if (!this.open) return; this.open = false; this.fire('close'); }
}

// ---- transport B: PeerJS (+ relay) ---------------------------------------------------
let peerLib = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLib) return peerLib;
  const urls = ['https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.5/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js'];
  peerLib = new Promise((res, rej) => {
    const next = (k) => {
      if (k >= urls.length) { peerLib = null; rej(new Error('lib')); return; }
      const sc = document.createElement('script'); sc.src = urls[k]; sc.async = true;
      sc.onload = () => window.Peer ? res(window.Peer) : next(k + 1); sc.onerror = () => next(k + 1);
      document.head.appendChild(sc);
    };
    next(0);
  });
  return peerLib;
}
class P2PRoom {
  constructor(Peer) { this.Peer = Peer; this.pj = null; this.id = null; this.list = new Map(); this.me = {}; this.fns = []; this.errs = []; this.conns = new Map(); this.hostConn = null; this.isHost = false; this.dead = false; this.admit = null; this.seen = new Map(); this.gones = new Map(); this.hb = 0; this.mqs = []; this.via = null; this.rtts = []; this.rtt = null; this.states = new Map(); this.dirty = new Set(); this.fast = new Map(); this.fastUp = null; this.onState = null; this.bt = 0; }
  peers() { return [...this.list.values()].map(e => ({ peer: e.peer, sameTab: e.peer === this.id, kind: 'viewer', presence: e.presence, updatedAt: e.at })); }
  onPeers(fn, err) { this.fns.push(fn); if (err) this.errs.push(err); }
  emit() { const ps = this.peers(); for (const f of this.fns) { try { f({ peers: ps }); } catch (e) { console.warn(e); } } }
  fail(code) { if (this.dead) return; for (const f of this.errs) { try { f(code); } catch (e) { console.warn(e); } } }
  softLost() {
    const pj = this.pj; if (this.dead || !pj) return;
    try { if (pj.disconnected && !pj.destroyed) pj.reconnect(); } catch (e) { }
    clearTimeout(this.lostT);
    this.lostT = setTimeout(() => { if (!this.dead && pj.disconnected && ![...this.conns.values()].some(c => c.open)) this.fail('server'); }, 10000);
  }
  opts() { return Object.assign({ debug: 0 }, window.__P2P_SERVER || {}); }
  // guest -> host, over whichever link admitted us
  up(m) {
    if (this.via === 'relay') { if (this.upMq) this.upMq.pub(this.base + 'h', Object.assign({ from: this.id }, m)); }
    else if (this.hostConn && this.hostConn.open) { try { this.hostConn.send(m); } catch (e) { } }
  }
  presence(patch) {
    for (const k in patch) { if (patch[k] === null) delete this.me[k]; else this.me[k] = patch[k]; }
    if (!this.id) return Promise.resolve();
    const p = Object.assign({}, this.me);
    this.list.set(this.id, { peer: this.id, presence: p, at: Date.now() });
    if (this.isHost) this.broadcast({ t: 'u', peer: this.id, p });
    else this.up({ t: 'p', p });
    this.emit();
    return Promise.resolve();
  }
  // direct links one by one; relay guests share one topic per broker (they skip their own echoes)
  broadcast(msg, except) {
    const rel = new Set();
    for (const [id, c] of this.conns) {
      if (id === except || !c.open) continue;
      if (c.relay) rel.add(c.mq); else { try { c.send(msg); } catch (e) { } }
    }
    for (const mq of rel) mq.pub(this.base + 'a', msg);
  }
  snapshot() { return { t: 'all', list: [...this.list.values()].map(e => ({ peer: e.peer, p: e.presence })) }; }
  // host: a guest link (PeerJS DataConnection or RelayConn) — admission, presence relay, ping answers, departure
  attach(c) {
    c.on('open', () => {
      const why = this.admit && this.admit(c.peer);
      if (why) { try { c.send({ t: 'deny', why }); } catch (e) { } setTimeout(() => { try { c.close(); } catch (e) { } }, 500); return; }
      const old = this.conns.get(c.peer);
      this.conns.set(c.peer, c); this.seen.set(c.peer, Date.now()); this.gones.set(c.peer, () => { try { c.close(); } catch (e) { } gone(); });
      try { c.send(this.snapshot()); } catch (e) { }
      if (old && old !== c) { try { old.close(); } catch (e) { } }   // same guest on a new link: the old one is dropped quietly
    });
    c.on('data', (m) => {
      if (this.conns.get(c.peer) !== c) return;
      this.seen.set(c.peer, Date.now());
      if (m && m.t === 'pi') { try { c.send({ t: 'po', a: m.a }); } catch (e) { } return; }
      if (m && m.t === 's') { this.gotState(c.peer, m.a); return; }
      if (!m || m.t !== 'p' || typeof m.p !== 'object' || m.p === null) return;
      this.list.set(c.peer, { peer: c.peer, presence: m.p, at: Date.now() });
      this.broadcast({ t: 'u', peer: c.peer, p: m.p }, c.peer); this.emit();
    });
    const gone = () => { if (this.conns.get(c.peer) !== c) return; this.conns.delete(c.peer); this.seen.delete(c.peer); this.gones.delete(c.peer); this.list.delete(c.peer); this.states.delete(c.peer); const f = this.fast.get(c.peer); if (f) { this.fast.delete(c.peer); try { f.close(); } catch (e) { } } this.broadcast({ t: 'x', peer: c.peer }); this.emit(); };
    c.on('close', gone); c.on('error', gone);
  }
  // host: claim the code on the signalling server, then admit players (this.admit() returns a refusal reason or null)
  host(code) {
    this.isHost = true; this.base = RELAY_TOPIC + code + '/';
    return new Promise((res, rej) => {
      const pj = this.pj = new this.Peer(P2P_PREFIX + code, this.opts());
      const to = setTimeout(() => rej('timeout'), 12000);
      pj.on('open', (id) => { clearTimeout(to); this.id = id; this.presence({}); this.beat(); this.hostRelay(); clearInterval(this.bt); this.bt = setInterval(() => this.flush(), NET_BATCH_MS); res(this); });
      // after the room is up, a lost signalling socket does not break the open player links: reconnect quietly,
      // and only report it if the host is left with nobody connected and cannot get back
      pj.on('error', (e) => { clearTimeout(to); const t = e && e.type; if (!this.id) rej(t === 'unavailable-id' ? 'taken' : t === 'browser-incompatible' ? 'browser' : 'server'); else if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') this.softLost(); });
      pj.on('connection', (c) => (c.metadata && c.metadata.fast ? this.attachFast(c) : this.attach(c)));
      pj.on('disconnected', () => { if (!this.dead) { try { pj.reconnect(); } catch (e) { } } });
    });
  }
  // host: also listen on every relay broker (a guest uses the first one it reaches); reconnects if a broker drops
  hostRelay() {
    for (const url of RELAY_URLS()) {
      // the guests reached through this broker survive a short drop of the host's own link: on reconnection
      // they are moved to the new socket; one that stays silent is dropped by the heartbeat (NET_SILENCE)
      const rc = new Map();
      const open = (wait) => {
        if (this.dead) return;
        const mq = new MqttWs(url);   // no last will: a dropped broker link is not the host leaving
        mq.connect().then(() => {
          if (this.dead) { mq.close(); return; }
          this.mqs.push(mq);
          for (const c of rc.values()) c.mq = mq;
          mq.onclose = () => { this.mqs = this.mqs.filter(x => x !== mq); setTimeout(() => open(2000), 300); };
          mq.sub(this.base + 'h', (m) => {
            const id = typeof m.from === 'string' && m.from.length < 64 ? m.from : null; if (!id) return;
            let c = rc.get(id);
            if (m.t === 'bye') { if (c) { c.close(); rc.delete(id); } return; }
            if (m.t === 'hi') {
              if (c && this.conns.get(id) === c) { try { c.send(this.snapshot()); } catch (e) { } return; }   // our welcome got lost
              c = new RelayConn(mq, this.base, id); rc.set(id, c); c.mq = mq;
              c.on('close', () => { if (rc.get(id) === c) rc.delete(id); });
              this.attach(c); c.fire('open'); return;
            }
            if (c) { delete m.from; c.fire('data', m); }
          });
        }, () => setTimeout(() => open(Math.min(wait * 2, 30000)), wait));
      };
      open(2000);
    }
  }
  // guest: connect to the host of the code. Direct (WebRTC) first; after RELAY_AFTER ms, or at once if the
  // signalling server cannot be reached, the relay too. The first link that brings the host's welcome wins.
  join(code) {
    this.base = RELAY_TOPIC + code + '/';
    return new Promise((res, rej) => {
      let ok = false, rtcDead = false, relayDead = false, relayOn = false;
      const to = setTimeout(() => { if (!ok) { this.stopRelay(); rej('timeout'); } }, 22000);
      const lose = (why) => { if (ok) return; if (rtcDead && relayDead) { clearTimeout(to); rej(why); } };
      // what the host sends, from either link
      const handle = (m, via, myId) => {
        if (!m || typeof m !== 'object') return;
        if (ok && via !== this.via) return;
        if (via === this.via || !ok) this.hostSeen = Date.now();
        if (m.t === 'hb') return;
        if (m.t === 'po') { if (ok && typeof m.a === 'number') this.rttSample(Date.now() - m.a); return; }
        if (m.t === 'S') { if (ok && Array.isArray(m.l)) this.gotBatch(m.l); return; }
        if (m.t === 'bye') { if (ok) this.hostLost('bye'); return; }
        if (m.t === 'deny') { if (ok) return; clearTimeout(to); ok = true; this.stopRelay(); rej(NET_ERR[m.why] ? m.why : 'full'); return; }
        const now = Date.now();
        if (m.t === 'all' && Array.isArray(m.list)) {
          if (via === 'relay') this.hiOk = true;
          if (!ok) {   // the host's welcome: we are admitted on this link; drop the other one
            ok = true; clearTimeout(to); this.via = via; this.id = myId;
            if (via === 'relay') { try { this.pj && this.pj.destroy(); } catch (e) { } this.pj = null; this.hostConn = null; }
            else { this.stopRelay(); this.openFast(code); }
          }
          const mine = this.list.get(this.id); this.list.clear();
          for (const e of m.list) if (e && e.peer && e.peer !== this.id) this.list.set(e.peer, { peer: e.peer, presence: e.p || {}, at: now });
          if (mine) this.list.set(this.id, mine);
          if (!this.hb) { this.presence({}); this.beat(); res(this); return; }
          this.presence({}); return;   // welcomed again after a reconnection: the host needs our record back
        }
        else if (!ok) return;
        else if (m.t === 'u' && m.peer && m.peer !== this.id) this.list.set(m.peer, { peer: m.peer, presence: m.p || {}, at: now });
        else if (m.t === 'x' && m.peer) { this.list.delete(m.peer); this.states.delete(m.peer); }
        this.emit();
      };
      const startRelay = () => {
        if (relayOn || ok || this.dead) return; relayOn = true;
        const rid = 'r-' + Math.random().toString(36).slice(2, 12);
        const urls = RELAY_URLS();
        const tryUrl = (k) => {
          if (ok || this.dead) return;
          if (k >= urls.length) { relayDead = true; lose('server'); return; }
          const mq = new MqttWs(urls[k], { topic: this.base + 'h', msg: { from: rid, t: 'bye' } });
          const h = (m) => handle(m, 'relay', rid);
          // relay link up: subscribe and say hello until the host answers (again after a reconnection)
          const up = (mq) => {
            this.upMq = mq; this.mqs.push(mq);
            mq.sub(this.base + 'g/' + rid, h); mq.sub(this.base + 'a', h);
            let n = 0; const hi = () => { if (this.dead || (ok && this.via !== 'relay') || (ok && n > 0 && this.hiOk)) return; n++; mq.pub(this.base + 'h', { from: rid, t: 'hi' }); this.hiT = setTimeout(hi, 1500); };
            this.hiOk = false; setTimeout(hi, 150);   // after the subscriptions are in
            // the broker dropped us (network change, frozen tab): reconnect with the same id; the heartbeat
            // reports the host gone only if this takes longer than NET_SILENCE
            mq.onclose = () => {
              this.mqs = this.mqs.filter(x => x !== mq); if (this.upMq === mq) this.upMq = null;
              if (this.dead || this.via !== 'relay') return;
              const log = (w) => { (this.rlog || (this.rlog = [])).push([Date.now() % 100000, w]); if (this.rlog.length > 20) this.rlog.shift(); };
              const again = (wait) => { if (this.dead || this.lost) return log('stop'); log('try'); const m2 = new MqttWs(urls[k], { topic: this.base + 'h', msg: { from: rid, t: 'bye' } }); m2.connect().then(() => { log('up'); if (this.dead) { m2.close(); return; } up(m2); }, (why) => { log('fail ' + why); setTimeout(() => again(Math.min(wait * 2, 8000)), wait); }); };
              log('closed');
              again(1000);
            };
          };
          mq.connect().then(() => { if (ok || this.dead) { mq.close(); return; } up(mq); }, () => tryUrl(k + 1));
        };
        tryUrl(0);
      };
      const relayTimer = setTimeout(startRelay, RELAY_AFTER);
      const pj = this.pj = new this.Peer(undefined, this.opts());
      pj.on('open', (id) => {
        if (ok) return;
        const c = this.hostConn = pj.connect(P2P_PREFIX + code, { reliable: true, serialization: 'json' });
        c.on('data', (m) => handle(m, 'rtc', id));
        c.on('close', () => { if (ok && this.via === 'rtc') this.hostLost('close'); });
      });
      pj.on('error', (e) => {
        const t = e && e.type;
        if (ok && this.via === 'rtc') { if (t === 'network' || t === 'server-error' || t === 'socket-error') { try { if (pj.disconnected && !pj.destroyed) pj.reconnect(); } catch (er) { } } return; }
        if (ok) return;
        // nobody holds the code on the signalling server: no room (the relay cannot find a host either)
        if (t === 'peer-unavailable') { clearTimeout(to); clearTimeout(relayTimer); ok = true; this.stopRelay(); rej('nohost'); return; }
        rtcDead = true; clearTimeout(relayTimer); startRelay(); lose(t === 'browser-incompatible' ? 'browser' : 'server');
      });
      pj.on('disconnected', () => { if (!this.dead && this.via === 'rtc' && this.hostConn && this.hostConn.open) { try { pj.reconnect(); } catch (e) { } } });
    });
  }
  // ---- race states (v107) ----------------------------------------------------------------------------
  // The 20 Hz car states no longer ride in the presence record (which carried the whole profile, ~340 bytes, and
  // was relayed by the host one message per guest per state: 320 messages/s from the host with 5 pilots). Now a
  // state is a small array [senderNow, raceSeq, x, z, h, u, v, lap, s, y]; guests send it to the host, and the host
  // sends everybody ONE batch every 50 ms with the newest state of each pilot (80 messages/s with 5 pilots, ~70 %
  // fewer bytes). On WebRTC the states go over a second, unordered channel, so one lost packet no longer holds
  // back the ones behind it (head-of-line blocking on the reliable channel = cars stuttering for everyone).
  state(a) {
    if (!this.id || this.dead) return;
    this.states.set(this.id, a);
    if (this.isHost) { this.dirty.add(this.id); return; }
    const m = { t: 's', a };
    if (this.via === 'rtc' && this.fastUp && this.fastUp.open) { try { this.fastUp.send(m); return; } catch (e) { } }
    this.up(m);
  }
  gotState(peer, a) {
    if (!Array.isArray(a) || a.length < 10 || !a.every(v => typeof v === 'number' && isFinite(v))) return;
    const old = this.states.get(peer); if (old && old[0] >= a[0]) return;   // late duplicate (unordered channel)
    this.states.set(peer, a);
    if (this.isHost) this.dirty.add(peer);
    if (this.onState) { try { this.onState(peer, a); } catch (e) { console.warn(e); } }
  }
  // host: one message with the states that changed since the last one (key = last 8 characters of the peer id)
  flush() {
    if (this.dead || !this.dirty.size) return;
    const l = [];
    for (const id of this.dirty) { const a = this.states.get(id); if (a) l.push([id.slice(-8)].concat(a)); }
    this.dirty.clear();
    const m = { t: 'S', l }, rel = new Set();
    for (const [id, c] of this.conns) {
      if (!c.open) continue;
      if (c.relay) { rel.add(c.mq); continue; }
      const f = this.fast.get(id), ch = f && f.open ? f : c;
      try { ch.send(m); } catch (e) { }
    }
    for (const mq of rel) mq.pub(this.base + 'a', m);
  }
  gotBatch(l) {
    for (const r of l) {
      if (!Array.isArray(r) || typeof r[0] !== 'string') continue;
      if (this.id && this.id.endsWith(r[0])) continue;
      let peer = null; for (const id of this.list.keys()) if (id.endsWith(r[0])) { peer = id; break; }
      if (peer) this.gotState(peer, r.slice(1));
    }
  }
  // guest: second DataConnection, unordered, for states only
  openFast(code) {
    if (!this.pj || this.dead) return;
    try {
      const f = this.pj.connect(P2P_PREFIX + code, { reliable: false, serialization: 'json', metadata: { fast: 1 } });
      f.on('open', () => { if (!this.dead) this.fastUp = f; });
      f.on('data', (m) => { if (m && m.t === 'S' && Array.isArray(m.l)) { this.hostSeen = Date.now(); this.gotBatch(m.l); } });
      f.on('close', () => { if (this.fastUp === f) this.fastUp = null; });
      f.on('error', () => { if (this.fastUp === f) this.fastUp = null; });
    } catch (e) { }
  }
  attachFast(c) {
    c.on('open', () => { if (!this.conns.has(c.peer)) { try { c.close(); } catch (e) { } return; } const o = this.fast.get(c.peer); this.fast.set(c.peer, c); if (o && o !== c) { try { o.close(); } catch (e) { } } });
    c.on('data', (m) => { if (!this.conns.has(c.peer)) return; this.seen.set(c.peer, Date.now()); if (m && m.t === 's') this.gotState(c.peer, m.a); });
    const drop = () => { if (this.fast.get(c.peer) === c) this.fast.delete(c.peer); };
    c.on('close', drop); c.on('error', drop);
  }
  stopRelay() { clearTimeout(this.hiT); for (const mq of this.mqs) mq.close(); this.mqs = []; this.upMq = null; }
  hostLost(why) { if (this.lost) return; this.lost = why || true; const mine = this.list.get(this.id); this.list.clear(); if (mine) this.list.set(this.id, mine); this.emit(); this.fail('hostgone'); }
  // round trip to the host (guests): the smallest of the last 8 pings, i.e. the network without queueing
  rttSample(ms) { if (!(ms >= 0 && ms < 5000)) return; this.rtts.push(ms); if (this.rtts.length > 8) this.rtts.shift(); this.rtt = Math.min(...this.rtts); }
  // heartbeat: a closed tab, a crash or a dropped network does not always close the link at once.
  // Everyone sends a beat every 2 s; NET_SILENCE of silence = gone (the host drops that guest; a guest reports the host gone)
  beat() {
    clearInterval(this.hb);
    this.hostSeen = Date.now();
    let lastTick = Date.now(), n = 0;
    const pingNow = () => { if (!this.isHost) this.up({ t: 'pi', a: Date.now() }); };
    pingNow();
    this.hb = setInterval(() => {
      if (this.dead) return clearInterval(this.hb);
      const now = Date.now();
      // this tab itself was frozen (loading a circuit, background tab): the silence is ours, not theirs
      this.maxGap = Math.max(this.maxGap || 0, now - lastTick);   // diagnostics: longest stall of this tab
      if (now - lastTick > 4000) { for (const k of this.seen.keys()) this.seen.set(k, now); this.hostSeen = now; }
      lastTick = now;
      // while everybody loads the circuit (race start) a slow device can block for far longer than usual
      const quiet = now < (this.graceUntil || 0) ? NET_SILENCE_LOAD : NET_SILENCE;
      if (this.isHost) { this.broadcast({ t: 'hb' }); for (const [id, t] of this.seen) if (now - t > quiet && this.gones.has(id)) this.gones.get(id)(); }
      else {
        this.up({ t: 'hb' }); if (++n % 2 === 0 || this.rtts.length < 4) pingNow();
        if (now - this.hostSeen > quiet) this.hostLost('silence');
      }
    }, 2000);
  }
  destroy() {
    clearInterval(this.hb); clearInterval(this.bt); clearTimeout(this.hiT);
    if (!this.dead) { if (this.isHost) this.broadcast({ t: 'bye' }); else if (this.via === 'relay') this.up({ t: 'bye' }); }
    this.dead = true;
    try { this.pj && this.pj.destroy(); } catch (e) { }
    const mqs = this.mqs; this.mqs = []; setTimeout(() => { for (const mq of mqs) mq.close(); }, 100);   // let the bye leave first
    this.list.clear(); this.conns.clear();
  }
}
for (const ev of ['beforeunload', 'pagehide']) window.addEventListener(ev, () => { if (NET.mode === 'p2p' && NET.room) NET.room.destroy(); });

// ---- connection ------------------------------------------------------------------
function netInit() {
  if (NET.connecting) return NET.connecting;
  NET.connecting = (async () => {
    let room = null;
    try { if (window.claude && typeof window.claude.use === 'function') room = await window.claude.use('room'); } catch (e) { room = null; }
    if (room) {
      NET.mode = 'room'; NET.room = room; NET.avail = true;
      room.onPeers((ch) => { NET.peers = ch.peers; onNetPeers(); }, () => { NET.avail = false; renderLobby(); });
      NET.peers = room.peers();
    } else if (window.claude && typeof window.claude.use === 'function') {
      // inside Claude without room access (signed out / public link): this frame blocks direct connections too
      NET.mode = 'p2p'; NET.avail = false; NET.err = 'claude';
    } else {
      NET.mode = 'p2p';
      try { await loadPeerJS(); NET.avail = true; } catch (e) { NET.avail = false; NET.err = 'lib'; }
    }
    renderLobby();
    // a create or join tapped while the online module was still loading runs now (a fresh device loads PeerJS on first use)
    const q = NET.pending; NET.pending = null;
    if (q && NET.avail && !NET.code && !NET.joining) netJoin(q.host ? newCode() : q.code, q.host);
  })();
  return NET.connecting;
}
const pres = (p) => (p && p.presence) || {};
const myPeer = () => NET.peers.find(p => p.sameTab);
const roomPeers = () => NET.peers.filter(p => p.kind !== 'agent' && pres(p).g === 'spa1' && pres(p).code && pres(p).code === NET.code);
const roomHost = () => roomPeers().filter(p => pres(p).host).sort((a, b) => (pres(a).since || 0) - (pres(b).since || 0))[0];
function netSet(patch) { if (NET.room) NET.room.presence(Object.assign({ now: Date.now() }, patch)).catch(() => { }); }
function netPresence(code, host) {
  return Object.assign({ g: 'spa1', trk: TRACK.id, code, host: host ? 1 : 0, since: Date.now(), ph: 'lobby', rdy: host ? 1 : 0, lp: host ? S.game.netLaps : null, col: host ? S.game.netCol : null, st: null, fin: null, cfg: null }, pilotProfile());
}
// who may come in (P2P host, and the joiner's own check in the Claude room)
function netRefusal(ps, host) {
  if (!host) return 'nohost';
  if (pres(host).ph === 'race') return 'started';
  if (ps.length >= NET_MAX) return 'full';
  return null;
}
function netLeaveRoom(why) {
  // state first: the presence update below can call onNetPeers synchronously, which must already see "no room"
  NET.code = null; NET.host = false; NET.joining = false; NET.err = why || null; NET.closed = false; NET.roster = null; NET.hadHost = false; NET.pending = null;
  NET.rtt = null; NET.rtts = []; NET.poSeen = null; NET.poSent = null; NET.bwOn = false;
  if (NET.mode === 'p2p') { if (NET.room) NET.room.destroy(); NET.room = null; NET.peers = []; }
  else netSet({ code: null, host: 0, ph: null, cfg: null, st: null, rdy: 0, lp: null, col: null, pi: null, po: null, bw: null, bs: null });
  renderLobby();
}
function netFail(why) { NET.err = why; renderLobby(); netNotify(NET_ERR[why] || NET_ERR.server, 'err'); }
function netJoin(code, host, tries) {
  code = normCode(code);
  if (!host && !codeValid(code)) return netFail('invalid');
  if (!NET.avail) {
    if (NET.avail === false && NET.connecting) return netFail(NET.err || 'lib');
    NET.pending = { code, host: !!host }; netInit(); renderLobby(); return;
  }
  NET.cfgSeen = 0; NET.offset = host ? 0 : null; NET.err = null; NET.closed = false; NET.roster = null;
  if (NET.mode !== 'p2p') {
    // Claude room: everybody already sees everybody's presence, so the joiner checks the room itself
    if (!host) {
      const ps = NET.peers.filter(p => p.kind !== 'agent' && pres(p).g === 'spa1' && pres(p).code === code && !p.sameTab);
      const h = ps.filter(p => pres(p).host).sort((a, b) => (pres(a).since || 0) - (pres(b).since || 0))[0];
      const why = netRefusal(ps, h); if (why) return netFail(why);
    }
    NET.code = code; NET.host = host; NET.hadHost = !host; netSet(netPresence(code, host)); renderLobby(); return;
  }
  if (NET.room) { NET.room.destroy(); NET.room = null; NET.peers = []; }
  NET.joining = true; NET.code = null; NET.host = host; NET.joinCode = code; renderLobby();
  const room = new P2PRoom(window.Peer);
  // a pilot of the running race coming back on a new link (the relay dropped and reconnected) is let back in
  if (host) room.admit = (peer) => (SES && SES.mode === 'multi' && (SES.grid || []).includes(peer)) ? null : netRefusal(roomPeers().filter(p => p.peer !== peer), roomHost()) || (SES && SES.mode === 'multi' ? 'started' : null);
  (host ? room.host(code) : room.join(code)).then(() => {
    if (!NET.joining || NET.joinCode !== code) { room.destroy(); return; }
    NET.joining = false; NET.room = room; NET.code = code; NET.hadHost = !host;
    room.onState = netOnState;
    room.onPeers((ch) => { NET.peers = ch.peers; onNetPeers(); }, (why) => { if (why === 'hostgone') netHostGone(); else { NET.err = why; renderLobby(); netNotify(NET_ERR[why] || NET_ERR.server, 'err'); } });
    netSet(netPresence(code, host));
    NET.peers = room.peers(); NET.roster = null; onNetPeers();
  }).catch((why) => {
    room.destroy();
    if (!NET.joining || NET.joinCode !== code) return;
    if (host && why === 'taken' && (tries || 0) < 4) { netJoin(newCode(), true, (tries || 0) + 1); return; }
    if (!host && why === 'timeout' && !tries) { NET.joining = false; netJoin(code, false, 1); return; }   // one quiet retry: slow ICE on the first try
    NET.joining = false; NET.code = null; netFail(why);
  });
}
// the host closed the room or lost the connection. In a race the session goes on (results still count);
// the room is left when the player goes back from the results.
function netHostGone() {
  if (SES && SES.mode === 'multi') { NET.closed = true; netNotify('El anfitrión salió de la sala. Termina tu carrera; al volver, la sala estará cerrada.', 'err'); return; }
  netLeaveRoom('hostgone'); netNotify(NET_ERR.hostgone, 'err');
}
function netRosterDiff() {
  const now = new Map(roomPeers().filter(p => !p.sameTab).map(p => [p.peer, String(pres(p).name || 'Piloto').slice(0, 16)]));
  if (NET.roster) {
    for (const [id, n] of now) if (!NET.roster.has(id)) netNotify(n + ' entró en la sala');
    for (const [id, n] of NET.roster) if (!now.has(id)) netNotify(n + ' salió de la sala');
  }
  NET.roster = now;
}
// Claude room ping (v108): the room has no direct link to measure, so a guest puts its own clock in its presence
// (`pi`, once a second) and the host echoes everyone's latest one in its presence (`po`, keyed by peer). The round
// trip is the real path of a car state (presence -> Claude's servers -> host page -> back), frames included.
function netRoomPing(h) {
  if (NET.mode !== 'room' || !NET.code) return;
  if (NET.host) {
    const po = {};
    for (const p of roomPeers()) if (!p.sameTab && typeof pres(p).pi === 'number') po[p.peer] = pres(p).pi;
    const k = JSON.stringify(po);
    if (k !== NET.poSent) { NET.poSent = k; netSet({ po }); }
    return;
  }
  const me = myPeer(), po = h && pres(h).po, t = me && po && po[me.peer];
  if (typeof t !== 'number' || t === NET.poSeen) return;
  NET.poSeen = t;
  const rtt = Date.now() - t; if (!(rtt >= 0 && rtt < 10000)) return;
  (NET.rtts || (NET.rtts = [])).push(rtt); if (NET.rtts.length > 7) NET.rtts.shift();
  NET.rtt = NET.rtts.slice().sort((a, b) => a - b)[NET.rtts.length >> 1];   // median: one slow frame does not move it
}
// my measured round trip to the host, whichever transport (null until measured)
function netMyRtt() {
  if (NET.host) return 0;
  if (NET.mode === 'p2p') return NET.room && NET.room.rtt != null ? NET.room.rtt : null;
  return NET.mode === 'room' && NET.rtt != null ? NET.rtt : null;
}
function onNetPeers() {
  const h = roomHost();
  netRoomPing(h);
  if (h && !h.sameTab && pres(h).now) { const o = h.updatedAt - pres(h).now; if (NET.offset == null || o < NET.offset) NET.offset = o; }
  if (h && h.sameTab) NET.offset = 0;
  if (NET.code && !NET.host) {
    if (h) NET.hadHost = true;
    else if (NET.hadHost && NET.mode === 'room' && !NET.closed) { netHostGone(); return; }
    if (h) {
      const ht = pres(h).trk;
      if (ht && TRACK_DEFS[ht] && ht !== TRACK.id && S.mode === 'menu' && !trackBusy) switchTrack(ht).then(ok => { if (ok && NET.code) netSet({ trk: TRACK.id }); });
      const cfg = pres(h).cfg;
      if (cfg && cfg.seq && cfg.seq !== NET.cfgSeen && pres(h).ph === 'race' && cfg.startAt + (NET.offset || 0) > Date.now() - 2000) { NET.cfgSeen = cfg.seq; netStartRace(cfg); }
    }
  }
  if (NET.code) netRosterDiff();
  if (lobbyOn()) renderLobby();
  if (SES && SES.mode === 'multi') netSyncRemotes();
}
const NET_ERR = {
  lib: 'No se pudo cargar el módulo online. Revisa tu conexión a internet y vuelve a intentarlo.',
  claude: 'Aquí dentro de Claude las salas solo funcionan para quien tiene acceso a este artefacto con su cuenta; con un enlace público o sin sesión no se puede crear ni unirse. En la versión web cualquiera crea su sala y comparte el código.',
  server: 'No se pudo conectar con el servidor de salas. Revisa tu conexión y prueba otra vez; algunas redes de colegios o empresas bloquean este tipo de conexión.',
  timeout: 'La conexión tardó demasiado. Prueba otra vez; si sigue fallando, puede que tu red bloquee las conexiones directas.',
  invalid: 'Código no válido: son 4 letras o números (no se usan O, 0, I ni 1).',
  nohost: 'No hay ninguna sala abierta con ese código. Revísalo o pide que la vuelvan a crear.',
  full: 'La sala está llena (máximo ' + NET_MAX + ' pilotos).',
  started: 'La carrera de esa sala ya empezó. Espera a que termine y vuelve a unirte.',
  taken: 'No se pudo reservar un código libre. Prueba otra vez.',
  browser: 'Este navegador no permite conexiones directas entre jugadores. Prueba con Chrome, Edge, Firefox o Safari actualizados.',
  hostgone: 'El anfitrión cerró la sala o perdió la conexión.'
};

// ---- lobby state ---------------------------------------------------------------------
const myPres = () => pres(myPeer());
// a guest counts as ready only once it is on the host's circuit and back in the lobby
function netRoomState() {
  const ps = roomPeers(), h = roomHost(), trk = h ? pres(h).trk : TRACK.id;
  const guests = ps.filter(p => !pres(p).host);
  const isReady = (p) => !!pres(p).rdy && pres(p).trk === trk && pres(p).ph !== 'race';
  const waiting = guests.filter(p => !isReady(p));
  return { ps, h, trk, guests, waiting, isReady, canStart: NET.host && !waiting.length && ps.length <= NET_MAX && !trackBusy };
}
function netPilotStatus(p, st) {
  const pr = pres(p);
  if (pr.ph === 'race') return ['En carrera', 'race'];
  if (pr.host) return ['Anfitrión', 'host'];
  if (pr.trk !== st.trk) return ['Cargando pista…', 'wait'];
  return pr.rdy ? ['¡Listo!', 'ok'] : ['Esperando…', 'wait'];
}
function netReady(on) { if (NET.code && !NET.host) netSet({ rdy: on ? 1 : 0 }); }
function netHostSettings(patch) { Object.assign(S.game, patch); saveGame(); if (NET.code && NET.host) netSet({ lp: S.game.netLaps, col: S.game.netCol }); renderLobby(); }

// ---- race ------------------------------------------------------------------------------
function netHostStart() {
  const st = netRoomState(); if (!st.canStart) return;
  const grid = st.ps.map(p => p.peer).sort(() => Math.random() - 0.5);
  const cfg = { seq: Date.now() % 1000000, laps: S.game.netLaps, col: S.game.netCol ? 1 : 0, weather: S.weather, trk: TRACK.id, startAt: Date.now() + 8000, grid, bar: S.settings.barrels === 'off' ? 'off' : 'real' };
  netSet({ ph: 'race', cfg });
  NET.cfgSeen = cfg.seq; netStartRace(cfg);
}
async function netStartRace(cfg) {
  const me = myPeer(); if (!me || !Array.isArray(cfg.grid)) return;
  const slot = cfg.grid.indexOf(me.peer);
  if (slot < 0) { netNotify(NET_ERR.started, 'err'); return; }   // joined after the start: not on the grid
  if (NET.room) NET.room.graceUntil = Date.now() + NET_SILENCE_LOAD;   // everyone is loading the circuit now
  const localStart = cfg.startAt + (NET.offset || 0);
  NET.startPerf = performance.now() + (localStart - Date.now());
  if (cfg.trk && TRACK_DEFS[cfg.trk] && cfg.trk !== TRACK.id) { if (SES) { disposeEntries(); SES = null; } store.set('track', cfg.trk); trackBusy = true; try { await loadTrack(cfg.trk); } finally { trackBusy = false; } if (NET.code) netSet({ trk: TRACK.id }); }
  if (WEATHER[cfg.weather] && cfg.weather !== S.weather) setWeather(cfg.weather);
  const laps = clamp(Math.round(+cfg.laps || 3), 1, 20);
  NET.bar = cfg.bar === 'off' ? 'off' : 'real'; NET.bwSeen = null; NET.bwSeq = 0;   // barrels: the host's setting
  startSession('race', { mode: 'multi', seq: cfg.seq });
  SES.raceLaps = laps; SES.grid = cfg.grid; SES.netCol = cfg.col !== 0;
  const sl = world.gridSlots[Math.min(slot, world.gridSlots.length - 1)];
  car.reset(sl.s, sl.d); snapshot(SES.player); SES.player.prevS = SES.player.s; SES.player.progress = SES.player.s; SES.prevS = car.q.s; SES.player.grid = slot + 1;
  NET.rtSent = undefined;
  netSet({ ph: 'race', rs: cfg.seq, fin: null, st: null, rdy: 0, bw: null, bs: null });
  if (!SES.netCol) toast('Colisiones desactivadas: los coches se atraviesan', 4);
  netSyncRemotes();
}
function netTick() {
  const now = performance.now();
  if (now - NET.lastSend < 50) return;   // 20 Hz
  NET.lastSend = now;
  const r2 = (v) => Math.round(v * 100) / 100;
  const msg = { st: [r2(car.x), r2(car.z), Math.round(car.h * 1000) / 1000, r2(car.u), r2(car.v), SES.player.lap, r2(car.q.s), r2(car.y)], rs: SES.netSeq };
  const mr = netMyRtt(), rt = mr == null ? null : Math.round(mr / 10) * 10;
  if (rt !== NET.rtSent) { msg.rt = rt; NET.rtSent = rt; }   // my round trip to the host: the others add it to their prediction
  if (NET.mode === 'room' && !NET.host && now - (NET.piAt || 0) > 1000) { NET.piAt = now; msg.pi = Date.now(); }
  if (NET.host && BW && BW.list.length) {   // the host owns the barrels
    const bw = BW.netPack();
    if (bw) { msg.bw = bw; msg.bs = ++NET.bwSeq; NET.bwOn = true; }
    // all asleep: take the ~2.8 KB pack out of the presence, or it rides along with every state (Claude room)
    else if (NET.bwOn) { msg.bw = null; NET.bwOn = false; }
  }
  if (NET.mode === 'p2p' && NET.room && NET.room.state) {
    // P2P (v107): the state goes on its own small channel; the presence only when something else changed
    NET.room.state([Date.now(), msg.rs].concat(msg.st));
    delete msg.st; delete msg.rs;
    if (Object.keys(msg).length) netSet(msg);
    return;
  }
  netSet(msg);
}
// a P2P state arrived (P2PRoom.onState): straight into that car's buffer, no presence round
function netOnState(peer, a) {
  const R = SES; if (!R || R.mode !== 'multi' || a[1] !== R.netSeq) return;
  let e = R.entries.find(x => x.peer === peer);
  if (!e) { const p = roomPeers().find(x => x.peer === peer); if (!p || !(R.grid || []).includes(peer)) return; e = netRemoteEntry(R, p); }
  netIngest(e, a[0], a.slice(2, 10));
}
function netIngest(e, ts, st) {
  if (!Array.isArray(st) || st.length < 8 || !st.every(v => typeof v === 'number' && isFinite(v)) || !isFinite(ts)) return;
  const lastB = e.buf[e.buf.length - 1];
  if (!lastB || ts > lastB.ts) {
    netClock(e, ts, lastB);
    e.buf.push({ ts, st }); if (e.buf.length > 30) e.buf.shift();
  }
  e.lap = st[5]; e.progress = st[5] * T.L + st[6];
}
// load lab (tools/net_load.mjs): the real state sender at 20 Hz with synthetic states
function netStress(on, stFn) {
  clearInterval(NET.stressT); if (!on) return;
  NET.stressT = setInterval(() => { if (NET.room && NET.room.state) NET.room.state([Date.now(), 7].concat(stFn())); }, 50);
}
function netLatestTs(peer) { const a = NET.room && NET.room.states && NET.room.states.get(peer); return a ? a[0] : null; }   // a function: window.__spa reads it at load
function netFinish(t) { netSet({ fin: Math.round(t * 1000) / 1000, rs: SES.netSeq }); }
function netLeaveRace() { netSet({ ph: 'lobby', st: null, rdy: NET.host ? 1 : 0 }); NET.startPerf = 0; if (NET.closed) netLeaveRoom('hostgone'); }
// a remote pilot's car in this session (from their lobby presence: car, livery, name)
function netRemoteEntry(R, p) {
  const pr = pres(p), sp = carById(pr.car) || CARS[0];
  const liv = { col: hexOr(pr.c1, sp.col), col2: hexOr(pr.c2, sp.col2), col3: sp.col3, pattern: PATTERNS[pr.pt] ? pr.pt : 'solido', finish: FINISH[pr.fn] ? pr.fn : 'brillo', rim: RIMNAMES[pr.rm] ? pr.rm : 'plata' };
  const m = buildCar(sp, liv, { lite: true }); scene.add(m.root); m.root.visible = false;
  if (m.blob) m.blob.visible = S.settings.quality === 'bajo';
  const nm = String(pr.name || 'Piloto').slice(0, 16), gi = (R.grid || []).indexOf(p.peer);
  const e = newEntry({ id: p.peer, peer: p.peer, pid: pr.pid, isRemote: true, name: nm, code: nm.slice(0, 10), col: liv.col, sp, model: m, len: sp.len, wid: sp.wid, buf: [], q: newQ(), hint: -1, wheelRot: 0, grid: gi + 1 || null });
  // until their first state arrives (they may still be loading the circuit) the car waits in its grid slot
  if (gi >= 0 && world.gridSlots.length) {
    const sl = world.gridSlots[Math.min(gi, world.gridSlots.length - 1)], P = trackPoint(T, sl.s, sl.d);
    e.gridPose = { x: P.x, z: P.z, h: P.h, y: P.e }; e.x = P.x; e.z = P.z; e.lap = 0; e.progress = sl.s;
  }
  R.entries.push(e);
  return e;
}
function netSyncRemotes() {
  const R = SES; if (!R || R.mode !== 'multi') return;
  const seen = new Set();
  for (const p of roomPeers()) {
    if (p.sameTab) continue;
    const pr = pres(p), onGrid = (R.grid || []).includes(p.peer);
    if (pr.rs !== R.netSeq && !onGrid) continue;
    seen.add(p.peer);
    const e = R.entries.find(x => x.peer === p.peer) || netRemoteEntry(R, p);
    e.host = !!pr.host; e.rt = typeof pr.rt === 'number' && isFinite(pr.rt) ? pr.rt : null;
    e.left = false;
    if (pr.rs !== R.netSeq) continue;   // on the grid but not in this race yet (loading)
    const ts = +pr.now;
    if (Array.isArray(pr.st)) netIngest(e, ts, pr.st);   // Claude room: states ride in the presence
    else if (NET.mode === 'p2p' && NET.room && NET.room.states && !e.buf.length) {   // P2P: the newest one already received
      const a = NET.room.states.get(p.peer); if (a && a[1] === R.netSeq) netIngest(e, a[0], a.slice(2, 10));
    }
    if (typeof pr.fin === 'number' && isFinite(pr.fin) && pr.fin > 0) { e.fin = true; e.finT = pr.fin; e.finLaps = R.raceLaps; }
    // the host's barrels correct ours (age: how long ago the host sent them, from the clock offset)
    if (pr.host && !NET.host && pr.bw && pr.bs && pr.bs !== NET.bwSeen && BW && isFinite(ts)) {
      NET.bwSeen = pr.bs; BW.netApply(pr.bw, (Date.now() - ts - (NET.offset || 0)) / 1000 + 0.03);
    }
  }
  for (const e of R.entries) if (e.isRemote && !seen.has(e.peer)) { e.left = true; if (e.model) e.model.root.visible = false; }
  if (R.resultsShown) showRaceResults();
}

// ---- smooth remote cars: sender-clock timestamps, adaptive delay, Hermite interpolation ----
// Each state carries the sender's clock (pr.now). The receiver keeps, per car, the smallest (receive − send)
// seen: that floor is the clock offset plus the fastest trip, so ts + off is when the state "should" have
// arrived without jitter. Rendering then runs `delay` behind that timeline (≈1.25 send gaps + 2 × jitter),
// so normally there is a state on each side and the car is interpolated with a cubic Hermite curve that uses
// the sent velocities (no corners at 20 Hz). When packets are late it extrapolates up to 0.3 s, and the jump
// back onto the new data is spread over ~0.15 s (netPoseRemote) instead of a snap.
function netClock(e, ts, lastB, rt) {
  const o = (rt == null ? Date.now() : rt) - ts;
  if (e.off == null) { e.off = o; e.jit = 0; e.gap = 50; return; }
  if (o < e.off) e.off = o; else e.off += (o - e.off) * 0.002;   // the floor creeps up slowly: clock drift, route change
  e.jit += (Math.abs(o - e.off) - e.jit) * 0.1;
  if (lastB) e.gap += (clamp(ts - lastB.ts, 10, 500) - e.gap) * 0.1;
}
const netDelay = (e) => clamp(e.gap * 1.25 + e.jit * 2, 60, 400);
// sender time to show now. The lag behind "now" (clock offset + delay) moves at most 6 % of real time, so a
// new offset floor or a change in jitter speeds playback up or down a little instead of making the car jump.
function netRenderTime(e, now, dtms) {
  const target = e.off + netDelay(e);
  if (e.lag == null) e.lag = target;
  else { const m = 0.06 * Math.max(0, dtms); e.lag += clamp(target - e.lag, -m, m); }
  return now - e.lag;
}
const netVel = (A) => [A[3] * Math.sin(A[2]) + A[4] * Math.cos(A[2]), A[3] * Math.cos(A[2]) - A[4] * Math.sin(A[2])];
// pure: pose at sender time t from a buffer of { ts, st }. Returns 1 interpolated, 2 extrapolated, 0 held.
function netSampleAt(buf, t, o) {
  const n = buf.length; if (!n) return -1;
  let k = n - 1; while (k > 0 && buf[k].ts > t) k--;
  const a = buf[k], A = a.st;
  if (k < n - 1 && a.ts <= t) {
    const b = buf[k + 1], B = b.st, span = Math.max(1, b.ts - a.ts), f = clamp((t - a.ts) / span, 0, 1), Ts = span / 1000;
    const [avx, avz] = netVel(A), [bvx, bvz] = netVel(B);
    const f2 = f * f, f3 = f2 * f, h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f, h01 = -2 * f3 + 3 * f2, h11 = f3 - f2;
    o.x = h00 * A[0] + h10 * Ts * avx + h01 * B[0] + h11 * Ts * bvx;
    o.z = h00 * A[1] + h10 * Ts * avz + h01 * B[1] + h11 * Ts * bvz;
    o.h = A[2] + wrapAng(B[2] - A[2]) * f; o.u = lerp(A[3], B[3], f); o.v = lerp(A[4], B[4], f); o.y = lerp(A[7], B[7], f);
    return 1;
  }
  const ex = clamp((t - a.ts) / 1000, 0, 0.3), [vx, vz] = netVel(A);
  o.x = A[0] + vx * ex; o.z = A[1] + vz * ex; o.h = A[2]; o.u = A[3]; o.v = A[4]; o.y = A[7];
  return ex > 0 ? 2 : 0;
}
// ---- where the other car is NOW (v106) ----------------------------------------------------------
// Interpolating between received states shows each car where it was ~0.15-0.4 s ago (network + buffer): side
// by side at 250 km/h that is 10-25 m, so each driver saw the other behind. Now every client estimates the
// sender's present: clocks from the offset floor (netClock) plus the one-way latency (half of each hop's round
// trip to the host, measured with pings; the host relays guests, so guest→guest is two hops). The latest state
// is carried forward along the circuit (speed along the track, lateral offset, the road's heading change), up to
// NET_PRED_MAX; new states correct it through the same decaying offset as before (no snaps).
const NET_PRED_MAX = 0.6;
const NET_Q = newQ();
function netLatency(e) {
  const mr = netMyRtt(), mine = mr != null ? mr : 80;
  const theirs = e.host ? 0 : e.rt != null ? e.rt : 80;
  // P2P guests get the states in the host's batches: on average they waited half a batch at the host
  const batch = NET.mode === 'p2p' && !NET.host ? NET_BATCH_MS / 2 : 0;
  return (mine + theirs) / 2 + batch;
}
// pure: state A carried forward `age` seconds. Along the track when the car is running with the road; a straight
// line when it is slow, spinning or crossing (pit entry, a spin, the grass)
function netPredict(A, age, o, hint) {
  const [vx, vz] = netVel(A), sp = Math.hypot(vx, vz);
  o.x = A[0] + vx * age; o.z = A[1] + vz * age; o.h = A[2]; o.u = A[3]; o.v = A[4]; o.y = A[7]; o.i = -1;
  if (!(age > 0) || sp < 4 || !T) return o;
  const q = T.project(A[0], A[1], hint == null ? -1 : hint, NET_Q); o.i = q.i;
  const vs = vx * q.tx + vz * q.tz, vd = vx * q.nx + vz * q.nz;
  if (vs < 0.8 * sp) return o;
  const P0 = trackPoint(T, q.s, q.d), P = trackPoint(T, q.s + vs * age, q.d + vd * age * 0.6);
  o.x = P.x + (A[0] - P0.x); o.z = P.z + (A[1] - P0.z);   // keep the small projection residue
  o.h = A[2] + wrapAng(P.h - P0.h); o.y = A[7] + (P.e - P0.e);
  return o;
}
const NET_POSE = { x: 0, z: 0, h: 0, u: 0, v: 0, y: 0, i: -1 };
// ---- smooth display of a remote car (v113) ---------------------------------------------------------
// The prediction (netPredict) is where the car should be NOW; every new state corrects it a little, and with
// 150-300 ms of ping and jitter those corrections are 0.3-3 m. v106-v112 absorbed them with a first-order decay
// (the car's speed jumped at each packet) and took the heading straight from the prediction (it snapped).
// Now the drawn car is a second-order follower: position error AND velocity error decay together as a critically
// damped spring (NET_SPRING rad/s), so speed and direction are continuous (C1); the heading comes from the drawn
// velocity plus the sender's slip angle, so it turns as smoothly as the car moves. Only a real teleport (reset,
// crane, > NET_SNAP m) jumps.
const NET_SPRING = 9, NET_SNAP = 25;   // 9 rad/s: measured in net_test lab (7 = smoother but +50 % position error, 14 = kicks again)
// pure (also the lab): advance the drawn state `e` to wall time `nowMs` (sender clock offset in e.off, latency `lat` ms)
function netPoseStep(e, nowMs, dt, lat) {
  const P = NET_POSE, last = e.buf[e.buf.length - 1];
  const age = clamp((nowMs - e.off + lat - last.ts) / 1000, 0, NET_PRED_MAX);
  netPredict(last.st, age, P, e.phint); if (P.i >= 0) e.phint = P.i;
  const tvx = P.u * Math.sin(P.h) + P.v * Math.cos(P.h), tvz = P.u * Math.cos(P.h) - P.v * Math.sin(P.h);
  e.age = age; e.mode = age > 0.35 ? 2 : 1;
  const D = e.dsp;
  if (!D || !(dt > 0) || (P.x - D.x) ** 2 + (P.z - D.z) ** 2 > NET_SNAP * NET_SNAP) {
    e.dsp = { x: P.x, z: P.z, vx: tvx, vz: tvz, h: P.h, y: P.y, slip: Math.atan2(P.v, Math.max(1, Math.abs(P.u))) };
  } else {
    // error of the drawn state against the target, then the exact critically damped step over dt
    const w = e.spring || NET_SPRING, k = Math.exp(-w * dt);
    const step = (x, v) => { const c = (v + w * x) * dt; return [(x + c) * k, (v - w * c) * k]; };
    // error at the start of the frame = drawn position minus the (new) target carried back by dt
    const [ex, evx] = step(D.x - P.x + tvx * dt, D.vx - tvx), [ez, evz] = step(D.z - P.z + tvz * dt, D.vz - tvz);
    D.x = P.x + ex; D.z = P.z + ez; D.vx = tvx + evx; D.vz = tvz + evz;
    D.y += (P.y - D.y) * (1 - Math.exp(-10 * dt));
    // heading: the direction it is moving minus the sender's slip angle (smoothed); slow or reversing: follow the target
    const sp = Math.hypot(D.vx, D.vz), slipT = Math.atan2(P.v, Math.max(1, Math.abs(P.u)));
    D.slip += wrapAng(slipT - D.slip) * (1 - Math.exp(-8 * dt));
    const hT = sp > 4 && P.u > 0 ? Math.atan2(D.vx, D.vz) - D.slip : P.h;
    D.h += wrapAng(hT - D.h) * (1 - Math.exp(-(sp > 4 ? 25 : 8) * dt));
  }
  return e.dsp;
}
function netPoseRemote(e, dt) {
  const r = e.model.root;
  if (e.left) { r.visible = false; e.kin = null; e.dsp = null; return; }
  if (!e.buf.length || e.off == null) {   // no state yet: in the grid slot, still
    if (!e.gridPose) { r.visible = false; e.kin = null; return; }
    const g = e.gridPose; e.x = g.x; e.z = g.z; e.u = 0; e.vx = 0; e.vz = 0; e.mode = 3;
    e.kin = { kin: true, x: g.x, z: g.z, h: g.h, vx: 0, vz: 0, len: e.len, wid: e.wid };
    r.visible = true; r.position.set(g.x, g.y, g.z); r.rotation.order = 'YXZ'; r.rotation.set(0, g.h, 0);
    return;
  }
  const D = netPoseStep(e, Date.now(), dt, netLatency(e)), u = NET_POSE.u;
  const x = D.x, z = D.z, h = D.h;
  e.x = x; e.z = z; e.u = u; e.vx = D.vx; e.vz = D.vz;
  T.project(x, z, e.hint, e.q); e.hint = e.q.i; e.s = e.q.s; e.d = e.q.d; e.i = e.q.i;
  e.kin = { kin: true, x, z, h, vx: D.vx, vz: D.vz, len: e.len, wid: e.wid };
  r.visible = true;
  r.position.set(x, D.y, z); r.rotation.order = 'YXZ'; r.rotation.set(0, h, 0);
  e.wheelRot += u / 0.34 * dt; spinVis(e.model, e.wheelRot);
}

// ---- connection badge in an online race (v107) --------------------------------------------
// Always on during a multiplayer session so a stutter can be told apart: the link (direct WebRTC or the relay
// server), the round trip to the host and this screen's frame rate plus the worst frame of the last 2 s.
// The host sees how its guests are connected and the worst guest ping.
const NET_INFO = { acc: 0, n: 0, worst: 0, worstT: 0, shown: '' };
function netInfoText(fps, hitch) {
  const ms = (v) => Math.round(v) + ' ms';
  let parts = [], ping = null;
  if (NET.mode !== 'p2p') {   // Claude room: everything goes through Claude's servers
    parts.push(NET.host ? 'Anfitrión · sala de Claude' : 'Sala de Claude (servidor)');
    if (NET.host) {
      const rts = (SES && SES.entries || []).filter(e => e.isRemote && !e.left && e.rt != null).map(e => e.rt);
      if (rts.length) { ping = Math.max(...rts); parts.push('ping máx ' + ms(ping)); } else parts.push('midiendo ping…');
    } else if (NET.rtt != null) { ping = NET.rtt; parts.push('ping ' + ms(ping)); } else parts.push('midiendo ping…');
  }
  else if (NET.host) {
    const r = NET.room, cs = r && r.conns ? [...r.conns.values()] : [], nr = cs.filter(c => c.relay).length, nd = cs.length - nr;
    parts.push('Anfitrión');
    if (cs.length) parts.push((nd ? nd + ' directa' + (nd > 1 ? 's' : '') : '') + (nd && nr ? ', ' : '') + (nr ? nr + ' por servidor' : ''));
    const rts = (SES && SES.entries || []).filter(e => e.isRemote && !e.left && e.rt != null).map(e => e.rt);
    if (rts.length) { ping = Math.max(...rts); parts.push('ping máx ' + ms(ping)); }
  } else {
    const r = NET.room;
    parts.push(r && r.via === 'relay' ? 'Por servidor' : 'Directa');
    if (r && r.rtt != null) { ping = r.rtt; parts.push('ping ' + ms(ping)); }
  }
  parts.push(fps + ' FPS');
  if (hitch >= 60) parts.push('tirón ' + ms(hitch));
  const lvl = (ping != null && ping > 250) || fps < 25 || hitch >= 150 ? 'bad' : (ping != null && ping > 120) || fps < 45 || hitch >= 60 ? 'warn' : '';
  return { text: parts.join(' · '), lvl };
}
function netInfo(dt) {
  const box = $('netInfo'); if (!box) return;
  const on = !!(SES && SES.mode === 'multi' && NET.code && S.mode !== 'menu');
  if (!on) { if (!box.hidden) box.hidden = true; return; }
  const I = NET_INFO, now = performance.now();
  I.acc += dt; I.n++;
  if (dt * 1000 > I.worst || now - I.worstT > 2000) { I.worst = dt * 1000; I.worstT = now; }
  if (I.acc < 0.5) return;
  const t = netInfoText(Math.round(I.n / I.acc), I.worst); I.acc = 0; I.n = 0;
  const key = t.lvl + t.text;
  if (key !== I.shown) { I.shown = key; box.className = 'netinfo' + (t.lvl ? ' ' + t.lvl : ''); box.lastChild.textContent = t.text; }
  box.hidden = false;
}

// ---- name tags over the other pilots' cars -----------------------------------------------
const NET_TAG_V = new THREE.Vector3();
let NET_TAG_SES = null;
function netTags() {
  const box = $('netTags'); if (!box) return;
  const R = SES;
  if (!R || R.mode !== 'multi' || S.mode === 'menu') { if (!box.hidden) { box.hidden = true; box.innerHTML = ''; NET_TAG_SES = null; } return; }
  if (NET_TAG_SES !== R) { box.innerHTML = ''; NET_TAG_SES = R; for (const e of R.entries) e.tag = null; }
  box.hidden = false;
  const W = window.innerWidth, H = window.innerHeight;
  for (const e of R.entries) {
    if (!e.isRemote) continue;
    if (!e.tag) {
      const t = e.tag = document.createElement('div'); t.className = 'ntag'; t.innerHTML = '<i></i><b></b>';
      t.querySelector('i').style.background = e.col || '#ffffff'; t.querySelector('b').textContent = e.name; box.appendChild(t);
    }
    const r = e.model && e.model.root;
    let show = !!(r && r.visible), d = 0;
    if (show) {
      NET_TAG_V.set(r.position.x, r.position.y + (e.model.H || 1.25) + 0.55, r.position.z);
      d = camera.position.distanceTo(NET_TAG_V);
      NET_TAG_V.project(camera);
      show = d < 400 && NET_TAG_V.z < 1 && Math.abs(NET_TAG_V.x) < 1.05 && Math.abs(NET_TAG_V.y) < 1.05;
    }
    if (show !== !e.tag.hidden) e.tag.hidden = !show;
    if (show) {
      const px = (NET_TAG_V.x + 1) / 2 * W, py = (1 - NET_TAG_V.y) / 2 * H, sc = clamp(28 / Math.max(1, d), 0.6, 1);
      e.tag.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-100%) scale(${sc.toFixed(2)})`;
      e.tag.style.opacity = clamp(1.5 - d / 250, 0.35, 1).toFixed(2);
    }
  }
}
