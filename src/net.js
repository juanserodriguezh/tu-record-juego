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
const NET = { room: null, mode: null, avail: null, peers: [], code: null, host: false, offset: null, startPerf: 0, lastSend: 0, cfgSeen: 0, connecting: null, err: null, joining: false, hadHost: false, closed: false, roster: null };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no O/0 or I/1: a code read aloud or from a screenshot cannot be mistyped
const CODE_LEN = 4;
const NET_MAX = +window.__NET_MAX || 8;                   // pilots per room (the host relays every state: 8 × 20 Hz is light); tests lower it
const P2P_PREFIX = 'spa-record-v1-';                     // kept on purpose: rooms keep working across versions
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

// ---- transport B: PeerJS ---------------------------------------------------------
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
  constructor(Peer) { this.Peer = Peer; this.pj = null; this.id = null; this.list = new Map(); this.me = {}; this.fns = []; this.errs = []; this.conns = new Map(); this.hostConn = null; this.isHost = false; this.dead = false; this.admit = null; this.seen = new Map(); this.gones = new Map(); this.hb = 0; }
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
  presence(patch) {
    for (const k in patch) { if (patch[k] === null) delete this.me[k]; else this.me[k] = patch[k]; }
    if (!this.id) return Promise.resolve();
    const p = Object.assign({}, this.me);
    this.list.set(this.id, { peer: this.id, presence: p, at: Date.now() });
    if (this.isHost) this.broadcast({ t: 'u', peer: this.id, p });
    else if (this.hostConn && this.hostConn.open) { try { this.hostConn.send({ t: 'p', p }); } catch (e) { } }
    this.emit();
    return Promise.resolve();
  }
  broadcast(msg, except) { for (const [id, c] of this.conns) if (id !== except && c.open) { try { c.send(msg); } catch (e) { } } }
  snapshot() { return { t: 'all', list: [...this.list.values()].map(e => ({ peer: e.peer, p: e.presence })) }; }
  // host: claim the code on the signalling server, then admit players (this.admit() returns a refusal reason or null)
  host(code) {
    this.isHost = true;
    return new Promise((res, rej) => {
      const pj = this.pj = new this.Peer(P2P_PREFIX + code, this.opts());
      const to = setTimeout(() => rej('timeout'), 12000);
      pj.on('open', (id) => { clearTimeout(to); this.id = id; this.presence({}); this.beat(); res(this); });
      // after the room is up, a lost signalling socket does not break the open player links: reconnect quietly,
      // and only report it if the host is left with nobody connected and cannot get back
      pj.on('error', (e) => { clearTimeout(to); const t = e && e.type; if (!this.id) rej(t === 'unavailable-id' ? 'taken' : t === 'browser-incompatible' ? 'browser' : 'server'); else if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') this.softLost(); });
      pj.on('connection', (c) => {
        c.on('open', () => {
          const why = this.admit && this.admit(c.peer);
          if (why) { try { c.send({ t: 'deny', why }); } catch (e) { } setTimeout(() => { try { c.close(); } catch (e) { } }, 500); return; }
          this.conns.set(c.peer, c); this.seen.set(c.peer, Date.now()); try { c.send(this.snapshot()); } catch (e) { }
        });
        c.on('data', (m) => {
          if (!this.conns.has(c.peer)) return;
          this.seen.set(c.peer, Date.now());
          if (!m || m.t !== 'p' || typeof m.p !== 'object' || m.p === null) return;
          this.list.set(c.peer, { peer: c.peer, presence: m.p, at: Date.now() });
          this.broadcast({ t: 'u', peer: c.peer, p: m.p }, c.peer); this.emit();
        });
        const gone = () => { if (!this.conns.has(c.peer)) return; this.conns.delete(c.peer); this.seen.delete(c.peer); this.gones.delete(c.peer); this.list.delete(c.peer); this.broadcast({ t: 'x', peer: c.peer }); this.emit(); };
        c.on('close', gone); c.on('error', gone); this.gones.set(c.peer, () => { try { c.close(); } catch (e) { } gone(); });
      });
      pj.on('disconnected', () => { if (!this.dead) { try { pj.reconnect(); } catch (e) { } } });
    });
  }
  // guest: connect to the host of the code
  join(code) {
    return new Promise((res, rej) => {
      const pj = this.pj = new this.Peer(undefined, this.opts());
      const to = setTimeout(() => rej('timeout'), 22000);
      pj.on('open', (id) => {
        this.id = id;
        const c = this.hostConn = pj.connect(P2P_PREFIX + code, { reliable: true, serialization: 'json' });
        let ok = false;
        c.on('data', (m) => {
          this.hostSeen = Date.now();
          if (!m || typeof m !== 'object' || m.t === 'hb') return;
          if (m.t === 'deny') { clearTimeout(to); rej(NET_ERR[m.why] ? m.why : 'full'); return; }
          const now = Date.now();
          if (m.t === 'all' && Array.isArray(m.list)) {
            const mine = this.list.get(this.id); this.list.clear();
            for (const e of m.list) if (e && e.peer && e.peer !== this.id) this.list.set(e.peer, { peer: e.peer, presence: e.p || {}, at: now });
            if (mine) this.list.set(this.id, mine);
            // the snapshot is the host's "welcome": only now is the guest admitted
            if (!ok) { ok = true; clearTimeout(to); this.presence({}); this.beat(); res(this); return; }
          }
          else if (m.t === 'u' && m.peer && m.peer !== this.id) this.list.set(m.peer, { peer: m.peer, presence: m.p || {}, at: now });
          else if (m.t === 'x' && m.peer) this.list.delete(m.peer);
          this.emit();
        });
        c.on('close', () => { if (this.lost) return; this.lost = true; const mine = this.list.get(this.id); this.list.clear(); if (mine) this.list.set(this.id, mine); this.emit(); this.fail('hostgone'); });
      });
      pj.on('error', (e) => { clearTimeout(to); const t = e && e.type; if (t === 'peer-unavailable') rej('nohost'); else if (!this.hostConn || !this.hostConn.open) rej(t === 'browser-incompatible' ? 'browser' : 'server'); else if (t === 'network' || t === 'server-error' || t === 'socket-error') { try { if (pj.disconnected && !pj.destroyed) pj.reconnect(); } catch (er) { } } });
      pj.on('disconnected', () => { if (!this.dead && this.hostConn && this.hostConn.open) { try { pj.reconnect(); } catch (e) { } } });
    });
  }
  // heartbeat: a closed tab, a crash or a dropped network does not always close the WebRTC channel at once.
  // Everyone sends a beat every 2 s; NET_SILENCE of silence = gone (the host drops that guest; a guest reports the host gone)
  beat() {
    clearInterval(this.hb);
    this.hostSeen = Date.now();
    let lastTick = Date.now();
    this.hb = setInterval(() => {
      if (this.dead) return clearInterval(this.hb);
      const now = Date.now();
      // this tab itself was frozen (loading a circuit, background tab): the silence is ours, not theirs
      if (now - lastTick > 4000) { for (const k of this.seen.keys()) this.seen.set(k, now); this.hostSeen = now; }
      lastTick = now;
      if (this.isHost) { this.broadcast({ t: 'hb' }); for (const [id, t] of this.seen) if (now - t > NET_SILENCE && this.gones.has(id)) this.gones.get(id)(); }
      else if (this.hostConn) {
        try { if (this.hostConn.open) this.hostConn.send({ t: 'hb' }); } catch (e) { }
        if (now - this.hostSeen > NET_SILENCE && !this.lost) { this.lost = true; const mine = this.list.get(this.id); this.list.clear(); if (mine) this.list.set(this.id, mine); this.emit(); this.fail('hostgone'); }
      }
    }, 2000);
  }
  destroy() { clearInterval(this.hb); this.dead = true; try { this.pj && this.pj.destroy(); } catch (e) { } this.list.clear(); this.conns.clear(); }
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
    if (NET.pendingCode && NET.avail) { const c = NET.pendingCode; NET.pendingCode = null; netJoin(c, false); }
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
  NET.code = null; NET.host = false; NET.joining = false; NET.err = why || null; NET.closed = false; NET.roster = null; NET.hadHost = false;
  if (NET.mode === 'p2p') { if (NET.room) NET.room.destroy(); NET.room = null; NET.peers = []; }
  else netSet({ code: null, host: 0, ph: null, cfg: null, st: null, rdy: 0, lp: null, col: null });
  renderLobby();
}
function netFail(why) { NET.err = why; renderLobby(); netNotify(NET_ERR[why] || NET_ERR.server, 'err'); }
function netJoin(code, host, tries) {
  code = normCode(code);
  if (!host && !codeValid(code)) return netFail('invalid');
  if (!NET.avail) { NET.pendingCode = host ? null : code; netInit(); return; }
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
  if (host) room.admit = () => netRefusal(roomPeers(), roomHost()) || (SES && SES.mode === 'multi' ? 'started' : null);
  (host ? room.host(code) : room.join(code)).then(() => {
    if (!NET.joining || NET.joinCode !== code) { room.destroy(); return; }
    NET.joining = false; NET.room = room; NET.code = code; NET.hadHost = !host;
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
function onNetPeers() {
  const h = roomHost();
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
  claude: 'Dentro de Claude, el online solo funciona con la sesión de Claude iniciada. Para jugar con cualquiera sin cuenta, abre la versión del juego publicada fuera de Claude: allí basta con compartir el código o el enlace de la sala.',
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
  const cfg = { seq: Date.now() % 1000000, laps: S.game.netLaps, col: S.game.netCol ? 1 : 0, weather: S.weather, trk: TRACK.id, startAt: Date.now() + 8000, grid };
  netSet({ ph: 'race', cfg });
  NET.cfgSeen = cfg.seq; netStartRace(cfg);
}
async function netStartRace(cfg) {
  const me = myPeer(); if (!me || !Array.isArray(cfg.grid)) return;
  const slot = cfg.grid.indexOf(me.peer);
  if (slot < 0) { netNotify(NET_ERR.started, 'err'); return; }   // joined after the start: not on the grid
  const localStart = cfg.startAt + (NET.offset || 0);
  NET.startPerf = performance.now() + (localStart - Date.now());
  if (cfg.trk && TRACK_DEFS[cfg.trk] && cfg.trk !== TRACK.id) { if (SES) { disposeEntries(); SES = null; } store.set('track', cfg.trk); trackBusy = true; try { await loadTrack(cfg.trk); } finally { trackBusy = false; } if (NET.code) netSet({ trk: TRACK.id }); }
  if (WEATHER[cfg.weather] && cfg.weather !== S.weather) setWeather(cfg.weather);
  const laps = clamp(Math.round(+cfg.laps || 3), 1, 20);
  startSession('race', { mode: 'multi', seq: cfg.seq });
  SES.raceLaps = laps; SES.grid = cfg.grid; SES.netCol = cfg.col !== 0;
  const sl = world.gridSlots[Math.min(slot, world.gridSlots.length - 1)];
  car.reset(sl.s, sl.d); snapshot(SES.player); SES.player.prevS = SES.player.s; SES.player.progress = SES.player.s; SES.prevS = car.q.s; SES.player.grid = slot + 1;
  netSet({ ph: 'race', rs: cfg.seq, fin: null, st: null, rdy: 0 });
  if (!SES.netCol) toast('Colisiones desactivadas: los coches se atraviesan', 4);
  netSyncRemotes();
}
function netTick() {
  const now = performance.now();
  if (now - NET.lastSend < 50) return;   // 20 Hz
  NET.lastSend = now;
  const r2 = (v) => Math.round(v * 100) / 100;
  netSet({ st: [r2(car.x), r2(car.z), Math.round(car.h * 1000) / 1000, r2(car.u), r2(car.v), SES.player.lap, r2(car.q.s), r2(car.y)], rs: SES.netSeq });
}
function netFinish(t) { netSet({ fin: Math.round(t * 1000) / 1000, rs: SES.netSeq }); }
function netLeaveRace() { netSet({ ph: 'lobby', st: null, rdy: NET.host ? 1 : 0 }); NET.startPerf = 0; if (NET.closed) netLeaveRoom('hostgone'); }
function netSyncRemotes() {
  const R = SES; if (!R || R.mode !== 'multi') return;
  const seen = new Set();
  for (const p of roomPeers()) {
    if (p.sameTab) continue;
    const pr = pres(p); if (pr.rs !== R.netSeq) continue;
    seen.add(p.peer);
    let e = R.entries.find(x => x.peer === p.peer);
    if (!e) {
      const sp = carById(pr.car) || CARS[0];
      const liv = { col: hexOr(pr.c1, sp.col), col2: hexOr(pr.c2, sp.col2), col3: sp.col3, pattern: PATTERNS[pr.pt] ? pr.pt : 'solido', finish: FINISH[pr.fn] ? pr.fn : 'brillo', rim: RIMNAMES[pr.rm] ? pr.rm : 'plata' };
      const m = buildCar(sp, liv, { lite: true }); scene.add(m.root); m.root.visible = false;
      if (m.blob) m.blob.visible = S.settings.quality === 'bajo';
      const nm = String(pr.name || 'Piloto').slice(0, 16);
      e = newEntry({ id: p.peer, peer: p.peer, pid: pr.pid, isRemote: true, name: nm, code: nm.slice(0, 10), col: liv.col, sp, model: m, len: sp.len, wid: sp.wid, buf: [], q: newQ(), hint: -1, wheelRot: 0, grid: ((R.grid || []).indexOf(p.peer) + 1) || null });
      R.entries.push(e);
    }
    const st = pr.st, ts = +pr.now;
    if (Array.isArray(st) && st.length >= 8 && st.every(v => typeof v === 'number' && isFinite(v)) && isFinite(ts)) {
      const lastB = e.buf[e.buf.length - 1];
      if (!lastB || ts > lastB.ts) {
        netClock(e, ts, lastB);
        e.buf.push({ ts, st }); if (e.buf.length > 30) e.buf.shift();
      }
      e.lap = st[5]; e.progress = st[5] * T.L + st[6];
    }
    if (typeof pr.fin === 'number' && isFinite(pr.fin) && pr.fin > 0) { e.fin = true; e.finT = pr.fin; e.finLaps = R.raceLaps; }
    e.left = false;
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
const NET_POSE = { x: 0, z: 0, h: 0, u: 0, v: 0, y: 0 };
function netPoseRemote(e, dt) {
  if (e.left || !e.buf.length || e.off == null) { e.model.root.visible = false; e.kin = null; e.px = null; return; }
  const P = NET_POSE;
  e.mode = netSampleAt(e.buf, netRenderTime(e, Date.now(), dt * 1000), P);
  let x = P.x, z = P.z;
  const h = P.h, u = P.u, v = P.v, y = P.y;
  const vx = u * Math.sin(h) + v * Math.cos(h), vz = u * Math.cos(h) - v * Math.sin(h);
  // error smoothing: a jump of the target beyond its own motion (new data after extrapolating) is absorbed
  // into an offset that decays, so the car glides onto the new path; teleports (> 4 m) are taken as they come
  if (e.px != null && dt > 0) {
    const dx = x - (e.px + e.pvx * dt), dz = z - (e.pz + e.pvz * dt);
    if (dx * dx + dz * dz < 16) { e.ex -= dx; e.ez -= dz; } else { e.ex = 0; e.ez = 0; }
  } else { e.ex = 0; e.ez = 0; }
  e.px = x; e.pz = z; e.pvx = vx; e.pvz = vz;
  const k = Math.exp(-dt * 7); e.ex *= k; e.ez *= k;
  x += e.ex; z += e.ez;
  e.x = x; e.z = z; e.u = u; e.vx = vx; e.vz = vz;
  T.project(x, z, e.hint, e.q); e.hint = e.q.i; e.s = e.q.s; e.d = e.q.d; e.i = e.q.i;
  e.kin = { kin: true, x, z, h, vx, vz, len: e.len, wid: e.wid };
  const r = e.model.root; r.visible = true;
  r.position.set(x, y, z); r.rotation.order = 'YXZ'; r.rotation.set(0, h, 0);
  e.wheelRot += u / 0.34 * dt; for (const w of e.model.wheels) spinWheel(w, e.wheelRot);
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
