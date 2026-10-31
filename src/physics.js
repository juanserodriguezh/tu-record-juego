// ============================================================================
//  PHYSICS + TRACK  (shared by the browser game and the Node validation bot)
// ============================================================================
const G = 9.81, RHO = 1.225;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapAng = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function gaussWrap(arr, sigma) {
  const n = arr.length, out = new Float64Array(n);
  if (sigma <= 0) { out.set(arr); return out; }
  const R = Math.ceil(sigma * 3), w = [];
  let ws = 0;
  for (let k = -R; k <= R; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); w.push(v); ws += v; }
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -R; k <= R; k++) s += arr[(i + k + n) % n] * w[k + R];
    out[i] = s / ws;
  }
  return out;
}

function buildTrack(def) {
  if (typeof def === 'string') def = TRACK_DEFS[def] || TRACK_DEFS.spa;
  const NOM = def.nom;
  const rows = def.raw().split(';');
  const n0 = rows.length;
  const px = new Float64Array(n0), pz = new Float64Array(n0), pwr = new Float64Array(n0), pwl = new Float64Array(n0);
  for (let i = 0; i < n0; i++) {
    const a = rows[i].split(',');
    px[i] = +a[0]; pz[i] = -(+a[1]); pwr[i] = +a[2]; pwl[i] = +a[3];
  }
  // optional corner stretch: scale a section about its centre (f), tapering back to the original over the lead-in / run-out
  // (the taper compresses the neighbouring straights by the same length, so the lap length and all sN markers hold)
  for (const [c0, f, a0, a1, b0, b1] of def.reshape || []) {
    const cs = new Float64Array(n0); for (let i = 1; i < n0; i++) cs[i] = cs[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
    const k = NOM / cs[n0 - 1] ; let ic = 0;
    for (let i = 0; i < n0; i++) if (Math.abs(cs[i] * k - c0) < Math.abs(cs[ic] * k - c0)) ic = i;
    const cx = px[ic], cz = pz[ic], ox = px.slice(), oz = pz.slice();
    for (let i = 0; i < n0; i++) { const sN = cs[i] * k; const w = smoothstep(a0, a1, sN) * (1 - smoothstep(b0, b1, sN)); if (w <= 0) continue;
      px[i] = ox[i] + (f - 1) * (ox[i] - cx) * w; pz[i] = oz[i] + (f - 1) * (oz[i] - cz) * w; }
  }
  const sx = gaussWrap(px, 1.0), sz = gaussWrap(pz, 1.0), swr = gaussWrap(pwr, 5), swl = gaussWrap(pwl, 5);

  // dense Catmull-Rom
  const SUB = 8, dn = n0 * SUB;
  const dx = new Float64Array(dn), dz = new Float64Array(dn), dwr = new Float64Array(dn), dwl = new Float64Array(dn);
  for (let i = 0; i < n0; i++) {
    const i0 = (i - 1 + n0) % n0, i1 = i, i2 = (i + 1) % n0, i3 = (i + 2) % n0;
    for (let k = 0; k < SUB; k++) {
      const t = k / SUB, t2 = t * t, t3 = t2 * t;
      const cr = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      const j = i * SUB + k;
      dx[j] = cr(sx[i0], sx[i1], sx[i2], sx[i3]);
      dz[j] = cr(sz[i0], sz[i1], sz[i2], sz[i3]);
      dwr[j] = lerp(swr[i1], swr[i2], t);
      dwl[j] = lerp(swl[i1], swl[i2], t);
    }
  }
  const dl = new Float64Array(dn + 1);
  for (let j = 0; j < dn; j++) { const k = (j + 1) % dn; dl[j + 1] = dl[j] + Math.hypot(dx[k] - dx[j], dz[k] - dz[j]); }
  const L = dl[dn];
  const DS = 2.5, N = Math.round(L / DS), ds = L / N;
  const T = {
    N, L, ds,
    x: new Float64Array(N), z: new Float64Array(N), wl: new Float64Array(N), wr: new Float64Array(N),
    tx: new Float64Array(N), tz: new Float64Array(N), nx: new Float64Array(N), nz: new Float64Array(N),
    k: new Float64Array(N), hd: new Float64Array(N), e: new Float64Array(N), slope: new Float64Array(N), vc: new Float64Array(N),
    runL: new Float64Array(N), runR: new Float64Array(N), tarL: new Float64Array(N), tarR: new Float64Array(N), typL: [], typR: [], kerbL: new Uint8Array(N), kerbR: new Uint8Array(N),
    corners: def.corners, sectors: def.sectors, nom: NOM, id: def.id, def
  };
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    while (j < dn - 1 && dl[j + 1] < s) j++;
    const t = (s - dl[j]) / Math.max(1e-9, dl[j + 1] - dl[j]);
    const k = (j + 1) % dn;
    T.x[i] = lerp(dx[j], dx[k], t); T.z[i] = lerp(dz[j], dz[k], t);
    // exactW: widths measured on the 3D model (white line to white line + edge) are used as they are
    const wk = def.exactW ? 1 : 1.15, wo = def.exactW ? 0 : 0.4, wmin = def.wmin || (def.exactW ? 4.6 : 5.6);   // wmin: narrow street circuits (Monaco)
    T.wr[i] = clamp(lerp(dwr[j], dwr[k], t) * wk + wo, wmin, 9.5);
    T.wl[i] = clamp(lerp(dwl[j], dwl[k], t) * wk + wo, wmin, 9.5);
  }
  // the 2007 "Bus Stop" switchback is wide (large tarmac areas + big kerbs)
  for (const [a0, a1, b0, b1, mw] of def.widen || []) { const ww = new Float64Array(N); for (let i = 0; i < N; i++) { const sN = i * ds * NOM / L; ww[i] = smoothstep(a0, a1, sN) * smoothstep(b0, b1, sN); }
    const wws = gaussWrap(ww, 6); for (let i = 0; i < N; i++) { T.wr[i] = lerp(T.wr[i], Math.max(T.wr[i], mw), wws[i]); T.wl[i] = lerp(T.wl[i], Math.max(T.wl[i], mw), wws[i]); } }
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let tx = T.x[b] - T.x[a], tz = T.z[b] - T.z[a];
    const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    T.tx[i] = tx; T.tz[i] = tz; T.nx[i] = tz; T.nz[i] = -tx; // left normal
    T.hd[i] = Math.atan2(tx, tz);
  }
  const kr = new Float64Array(N);
  for (let i = 0; i < N; i++) kr[i] = wrapAng(T.hd[(i + 1) % N] - T.hd[(i - 1 + N) % N]) / (2 * ds);
  T.k = gaussWrap(kr, 2);

  // elevation
  const eraw = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const s = (i * ds) * (NOM / L), EL = def.elev;
    let m = 0;
    while (m < EL.length - 2 && EL[m + 1][0] < s) m++;
    const A = EL[m], B = EL[m + 1];
    eraw[i] = lerp(A[1], B[1], clamp((s - A[0]) / (B[0] - A[0]), 0, 1));
  }
  T.e = gaussWrap(eraw, 11);
  const sl = new Float64Array(N), vc = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    sl[i] = (T.e[b] - T.e[a]) / (2 * ds);
    vc[i] = (T.e[b] - 2 * T.e[i] + T.e[a]) / (ds * ds);
  }
  T.slope = sl; T.vc = gaussWrap(vc, 3);

  // run-off / kerbs
  const BAR = def.bar ? def.bar().split(';').map(r => r.split(',').map(Number)) : null;
  for (let i = 0; i < N; i++) {
    const s = i * ds * (NOM / L);
    const kk = Math.abs(T.k[i]);
    let rl = 9, rr = 9, tl = 'grass', tr = 'grass', pl = 0, pr = 0;
    if (kk > 1 / 450) { if (T.k[i] > 0) { rr = 18; tr = 'tarmac'; } else { rl = 18; tl = 'tarmac'; } }
    for (const o of def.runoff) {
      if (s >= o[0] && s <= o[1]) {
        if (o[2] === 'L' || o[2] === 'B') { rl = o[3]; tl = o[4]; pl = o[5] || 0; }   // o[5]: tarmac band next to the track before the gravel
        if (o[2] === 'R' || o[2] === 'B') { rr = o[3]; tr = o[4]; pr = o[5] || 0; }
      }
    }
    // measured barriers (Monaco: the collision walls of the 3D model): distance beyond the asphalt edge, every def.barDs nominal metres
    if (BAR) { const f = s / def.barDs, a = Math.floor(f) % BAR.length, b = (a + 1) % BAR.length, t = f - Math.floor(f);
      rl = lerp(BAR[a][0], BAR[b][0], t); rr = lerp(BAR[a][1], BAR[b][1], t); tl = tr = 'tarmac'; }
    // main straight: pit wall on the pit side (right unless def.pitSide = 1), grandstand wall on the other
    const [stA, stB] = def.straight, pitL = def.pitSide > 0;
    if (!def.exactStraight && (s > stA || s < stB)) { if (pitL) { rl = 2.6; rr = Math.min(rr, 6); } else { rr = 2.6; rl = Math.min(rl, 6); } tr = 'tarmac'; tl = 'tarmac'; }   // exactStraight: the measured run-off table already describes the pit straight
    // pit entry / exit transitions: the pit-lane band emerges from a close barrier
    if (!def.exactStraight) for (const [a, b] of def.pitTr) if (s >= a && s <= b) { if (pitL) { rl = 3; tl = 'tarmac'; } else { rr = 3; tr = 'tarmac'; } }
    T.runL[i] = rl; T.runR[i] = rr; T.tarL[i] = pl; T.tarR[i] = pr; T.typL.push(tl); T.typR.push(tr);
  }
  { const [stA, stB] = def.straight; T.isStraightN = (sN) => sN > stA || sN < stB; }
  // kerbs where the corner is meaningful (extend both ways)
  const kmask = new Uint8Array(N);
  if (def.kerbs) {   // measured kerbs [sFrom, sTo, side] (Monaco): only there, only on that side
    for (let i = 0; i < N; i++) { const s = i * ds * NOM / L; for (const [a, b, side] of def.kerbs) if (s >= a && s <= b) (side > 0 ? T.kerbL : T.kerbR)[i] = 1; }
  } else for (let i = 0; i < N; i++) if (Math.abs(T.k[i]) > 1 / 330) kmask[i] = 1;
  const ext = Math.round(18 / ds);
  for (let i = 0; i < N; i++) {
    if (!kmask[i]) continue;
    for (let q = -ext; q <= ext; q++) { const m = (i + q + N) % N; T.kerbL[m] = 1; T.kerbR[m] = 1; }
  }
  // Bus Stop: raised "sausage" kerbs just beyond the flat kerbs on the inside of both apexes
  // (T18 right-hander -> right side, T19 left-hander -> left side): cut the chicane and the car jumps
  T.sausL = new Uint8Array(N); T.sausR = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const s = i * ds * NOM / L; for (const [a, b, side] of def.saus) if (s >= a && s <= b) (side > 0 ? T.sausL : T.sausR)[i] = 1; }

  // spatial hash
  const CELL = 25;
  T.cell = CELL; T.hash = new Map();
  for (let i = 0; i < N; i++) {
    const key = Math.floor(T.x[i] / CELL) + ',' + Math.floor(T.z[i] / CELL);
    let arr = T.hash.get(key); if (!arr) { arr = []; T.hash.set(key, arr); } arr.push(i);
  }
  // clamp run-off so barriers never cross another part of the circuit:
  // a point beside sample i must still project back onto sample i.
  const nearestIdx = (x, z) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = 1e18, bi = -1;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const arr = T.hash.get((cx + a) + ',' + (cz + b)); if (!arr) continue;
      for (const m of arr) { const d = (T.x[m] - x) ** 2 + (T.z[m] - z) ** 2; if (d < best) { best = d; bi = m; } }
    }
    return bi;
  };
  for (let i = 0; i < N; i++) {
    for (const side of [1, -1]) {
      const w = side > 0 ? T.wl[i] : T.wr[i];
      let run = side > 0 ? T.runL[i] : T.runR[i];
      for (let d = 1; d <= run + 8; d += 1) {
        const x = T.x[i] + T.nx[i] * side * (w + d), z = T.z[i] + T.nz[i] * side * (w + d);
        const j = nearestIdx(x, z);
        let di = j < 0 ? 0 : Math.abs(j - i); di = Math.min(di, N - di);
        if (j >= 0 && di * ds > (w + d) * 1.2 + 6) { run = Math.min(run, Math.max(1.6, (d - 8) * 0.5)); break; }
      }
      if (side > 0) T.runL[i] = run; else T.runR[i] = run;
    }
  }
  T.runL = gaussMin(T.runL, 6); T.runR = gaussMin(T.runR, 6);
  { // run-off pads taper in and out over ~40 m instead of ending in a rectangular step (never wider than the clamped value)
    const sl = gaussWrap(T.runL, 9), sr = gaussWrap(T.runR, 9);
    for (let i = 0; i < N; i++) { T.runL[i] = Math.min(T.runL[i], sl[i]); T.runR[i] = Math.min(T.runR[i], sr[i]); }
  }
  T.barL = new Float64Array(N); T.barR = new Float64Array(N);
  for (let i = 0; i < N; i++) { T.tarL[i] = Math.min(T.tarL[i], Math.max(0, T.runL[i] - 2)); T.tarR[i] = Math.min(T.tarR[i], Math.max(0, T.runR[i] - 2)); }
  for (let i = 0; i < N; i++) { T.barL[i] = T.wl[i] + T.runL[i]; T.barR[i] = T.wr[i] + T.runR[i]; }

  // ---- pit lane: a band beside the main straight, on the right (pitSide -1, default) or the left (pitSide 1)
  const ps = T.pitSide = def.pitSide > 0 ? 1 : -1;
  T.pitW = ps > 0 ? T.wl : T.wr; T.pitBar = ps > 0 ? T.barL : T.barR;   // track half-width / barrier on the pit side
  T.pitC = new Float64Array(N).fill(NaN); T.pitSep = new Uint8Array(N); T.pitHW = 5.0;
  for (let i = 0; i < N; i++) {
    const sN = i * ds * NOM / L, [pa0, pa1, pb0, pb1] = def.pit;
    if (!(sN >= pa0 || sN <= pb0)) continue;
    const full = ps * (def.exactStraight ? T.pitBar[i] + 0.6 + T.pitHW : T.pitW[i] + 2.6 + 0.6 + T.pitHW);
    const inner = ps * (T.pitW[i] - 4.0);
    let u = 1;
    if (sN >= pa0) u = smoothstep(pa0, pa1, sN);
    else if (sN >= pb1 && pb0 > pb1) u = smoothstep(pb0, pb1, sN);   // pb0 = pb1: the band ends there (a pit exit road takes over)
    T.pitC[i] = lerp(inner, full, u);
    if (ps * T.pitC[i] - T.pitHW > T.pitBar[i] + 0.35) T.pitSep[i] = 1;
  }
  T.pitSepFrom = -1; T.pitSepTo = -1;
  for (let i = 0; i < N; i++) { if (T.pitSep[i] && !T.pitSep[(i - 1 + N) % N]) T.pitSepFrom = i; if (T.pitSep[i] && !T.pitSep[(i + 1) % N]) T.pitSepTo = i; }
  buildBarriers(T, def, ds, NOM, L);
  T.project = makeProjector(T);
  buildEscape(T, def);
  return T;
}

// ---------------------------------------------------------------------------
//  Barrier physics: type per sample (0 armco rail, 1 concrete, 2 tyre wall in front of the rail), tyre-wall
//  thickness left (m) and permanent rail displacement (m). A soft barrier gives way under a car and keeps the shape.
// ---------------------------------------------------------------------------
const TYRE_WALL_W = 1.35, ARMCO_STROKE = 1.25, TYRE_BACK_STROKE = 0.6;
function buildBarriers(T, def, ds, NOM, L) {
  const N = T.N, f = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a))), sm = (a, b, x) => { const t = f(a, b, x); return t * t * (3 - 2 * t); };
  T.btL = new Uint8Array(N); T.btR = new Uint8Array(N);
  T.twL0 = new Float64Array(N); T.twR0 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const sN = i * ds * NOM / L, straight = T.isStraightN(sN);
    if (straight && !def.exactStraight) { T.btL[i] = 1; T.btR[i] = 1; continue; }
    if (T.pitSep[i]) (T.pitSide > 0 ? T.btL : T.btR)[i] = 1;
    for (const [a, b, side] of def.conc || []) if (sN >= a && sN <= b) (side > 0 ? T.btL : T.btR)[i] = 1;   // concrete wall stretches measured on the 3D model
    for (const [a, b, side] of def.tyres || []) {
      if (sN < a - 8 || sN > b + 8) continue;
      const w = TYRE_WALL_W * sm(a - 8, a + 4, sN) * (1 - sm(b - 4, b + 8, sN));
      if (w <= 0.05) continue;
      if (T.pitSep[i] && side === T.pitSide) continue;
      if (side > 0) { T.btL[i] = 2; T.twL0[i] = w; } else { T.btR[i] = 2; T.twR0[i] = w; }
      // measured barriers (def.bar) are the face of the tyre wall: the rail sits behind it
      if (def.bar) { if (side > 0) T.barL[i] += w; else T.barR[i] += w; }
    }
  }
  T.twL = T.twL0.slice(); T.twR = T.twR0.slice();
  T.dentL = new Float64Array(N); T.dentR = new Float64Array(N);
  T.barEv = [];                       // events for the visuals: { side, i, p, tw, dent }
  T.barVer = 0;
  T.resetBarriers = () => { T.twL.set(T.twL0); T.twR.set(T.twR0); T.dentL.fill(0); T.dentR.fill(0); T.barEv.length = 0; T.barVer++; T.barReset = true; };
  // capacity left (m) at sample i on a side
  T.barLeft = (side, i) => {
    const typ = side > 0 ? T.btL[i] : T.btR[i];
    if (typ === 1) return 0;
    const cap = typ === 2 ? TYRE_BACK_STROKE : ARMCO_STROKE;
    return (side > 0 ? T.twL[i] : T.twR[i]) + cap - (side > 0 ? T.dentL[i] : T.dentR[i]);
  };
  // push the barrier by p metres at sample i (spreads over the neighbours); returns tyre metres removed
  T.pushBarrier = (side, i, p) => {
    const tw = side > 0 ? T.twL : T.twR, dent = side > 0 ? T.dentL : T.dentR, bt = side > 0 ? T.btL : T.btR;
    let gone = 0;
    for (let k = -5; k <= 5; k++) {
      const j = (i + k + N) % N, w = Math.exp(-0.5 * (k / 2.1) * (k / 2.1)), pe = p * w;
      if (bt[j] === 1) continue;
      const take = Math.min(tw[j], pe); tw[j] -= take; gone += take;
      const cap = bt[j] === 2 ? TYRE_BACK_STROKE : ARMCO_STROKE;
      dent[j] = Math.min(cap, dent[j] + (pe - take));
    }
    T.barVer++;
    return gone;
  };
}
// Escape road (Monza T1): a tarmac lane straight on from the braking zone that rejoins after the chicane, with
// foam blocks to go around. It is drivable regardless of the barrier offsets of the nearby track samples.
function buildEscape(T, def) {
  T.esc = null; T.inEscape = null;
  if (!def.escape) return;
  const { from, to, rejoin, hw, blocks, pit } = def.escape, N = T.N, k = T.L / def.nom;
  const iA = Math.round(from * k / T.ds) % N, iB = Math.round(to * k / T.ds) % N;
  // pit: the lane is the pit exit road, starting at the end of the pit-lane band (its centre line)
  let d0 = 0; if (pit) for (let q = 0; q < 8; q++) { const c = T.pitC[(iA - q + N) % N]; if (c === c) { d0 = c; break; } }
  const P0 = [T.x[iA] + T.nx[iA] * d0, T.z[iA] + T.nz[iA] * d0], P3 = [T.x[iB] + T.nx[iB] * rejoin, T.z[iB] + T.nz[iB] * rejoin];
  const D = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]);
  const [h1, h2] = def.escape.handles || [0.62, 0.38];   // Bezier handles (fractions of the chord): short ones turn tighter (Monaco pit exit, inside Sainte-Dévote)
  const P1 = [P0[0] + T.tx[iA] * D * h1, P0[1] + T.tz[iA] * D * h1], P2 = [P3[0] - T.tx[iB] * D * h2, P3[1] - T.tz[iB] * D * h2];
  const pts = [], M = 90;
  for (let j = 0; j <= M; j++) {
    const t = j / M, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
    const x = a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0], z = a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1];
    pts.push([x, z, 0]);
  }
  // flat lane: a straight grade from the circuit height where it leaves to where it rejoins (no dips where the global
  // projection jumps to another part of the lap)
  { const eA = T.e[iA], eB = T.e[iB]; for (let j = 0; j <= M; j++) pts[j][2] = eA + (eB - eA) * j / M; }
  // follow: a long road beside the circuit (Spa pit exit) sits at the height of the nearest circuit point, smoothed
  // (a straight grade left it up to 2.3 m below the run-off it crosses: the grass ribbons and banks covered it)
  if (def.escape.follow) {
    const raw = pts.map(p => T.project(p[0], p[1], -1).e), R = 8, sm = raw.slice();
    for (let j = 0; j <= M; j++) { let s = 0, w = 0; for (let q = -R; q <= R; q++) { const jj = Math.min(M, Math.max(0, j + q)), g = Math.exp(-q * q / (2 * 16)); s += raw[jj] * g; w += g; } sm[j] = s / w; }
    for (let j = 0; j <= M; j++) { const lin = pts[j][2], u = Math.min(1, j / 6, (M - j) / 6); pts[j][2] = lin + (sm[j] - lin) * u * u * (3 - 2 * u); }
  }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const E = T.esc = { pts, hw, pit: !!pit, box: [x0 - hw, x1 + hw, z0 - hw, z1 + hw], blocks: [], hits: 0 };
  // nearest point of the lane: [dist, segment, t]
  E.near = (x, z) => {
    let best = 1e18, bj = 0, bt = 0;
    for (let j = 0; j < pts.length - 1; j++) {
      const ax = pts[j][0], az = pts[j][1], bx = pts[j + 1][0] - ax, bz = pts[j + 1][1] - az;
      let t = ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d2 = (ax + bx * t - x) ** 2 + (az + bz * t - z) ** 2; if (d2 < best) { best = d2; bj = j; bt = t; }
    }
    return [Math.sqrt(best), bj, bt];
  };
  T.inEscape = (x, z) => x > E.box[0] && x < E.box[1] && z > E.box[2] && z < E.box[3] && E.near(x, z)[0] < hw;
  // what the car physics lets a car reach at (x, z): the circuit up to its barriers, the pit-lane band or the lane
  // (the visuals draw a rail only where one side of it is not drivable)
  T.drivable = (x, z, m = 0) => {
    const q = T.project(x, z, -1);
    if (q.d < q.bl - m && q.d > -q.br + m) return true;
    if (q.pc === q.pc && Math.abs(q.d - q.pc) < q.phw - m) return true;
    return x > E.box[0] && x < E.box[1] && z > E.box[2] && z < E.box[3] && E.near(x, z)[0] < hw - m;
  };
  E.yAt = (x, z) => { const [, j, t] = E.near(x, z); return pts[j][2] + (pts[j + 1][2] - pts[j][2]) * t; };
  // foam blocks: [position along the lane 0..1, lateral offset (m, + = left), width across, depth]
  for (const [u, off, w, dep] of blocks || []) {
    const f = u * (pts.length - 1), j = Math.min(pts.length - 2, Math.floor(f)), t = f - j;
    const tx = pts[j + 1][0] - pts[j][0], tz = pts[j + 1][1] - pts[j][1], tl = Math.hypot(tx, tz);
    const h = Math.atan2(tx / tl, tz / tl), nx = tz / tl, nz = -tx / tl;
    const x = lerp(pts[j][0], pts[j + 1][0], t) + nx * off, z = lerp(pts[j][1], pts[j + 1][1], t) + nz * off;
    E.blocks.push({ x0: x, z0: z, h0: h, x, z, h, y: 0, hx: w / 2, hz: dep / 2, vx: 0, vz: 0, vr: 0, vy: 0, down: false, e: lerp(pts[j][2], pts[j + 1][2], t) });
  }
  E.reset = () => { for (const b of E.blocks) { b.x = b.x0; b.z = b.z0; b.h = b.h0; b.y = 0; b.vx = b.vz = b.vr = b.vy = 0; b.down = false; b.tilt = 0; } };
  // knocked blocks slide and tumble away (visual only)
  E.update = (dt) => {
    for (const b of E.blocks) if (b.down) {
      b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vr * dt; b.vy -= 9.81 * dt; b.y = Math.max(0, b.y + b.vy * dt); if (b.y === 0) b.vy = 0;
      const damp = Math.exp(-dt * (b.y > 0 ? 0.3 : 2.5)); b.vx *= damp; b.vz *= damp; b.vr *= damp; b.tilt = Math.min(Math.PI / 2, (b.tilt || 0) + Math.hypot(b.vx, b.vz) * dt * 0.4);
    }
  };
}
// smoothing that never grows a value (keeps clamps)
function gaussMin(arr, sig) { const g = gaussWrap(arr, sig); for (let i = 0; i < arr.length; i++) g[i] = Math.min(g[i], arr[i] + 0.0) ; return gaussWrap(g, 2); }

function newQ() { return { i: 0, t: 0, s: 0, d: 0, e: 0, slope: 0, vc: 0, tx: 0, tz: 1, nx: 1, nz: 0, wl: 6, wr: 6, k: 0, bl: 10, br: 10, pc: NaN, phw: 0, sep: 0 }; }
function makeProjector(T) {
  const N = T.N, DEF = newQ();
  let sd2 = 0, st = 0;
  function segTest(i, x, z) {
    const j = i + 1 === N ? 0 : i + 1;
    const ax = T.x[i], az = T.z[i], bx = T.x[j] - ax, bz = T.z[j] - az;
    let t = ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz); t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + bx * t - x, qz = az + bz * t - z;
    sd2 = qx * qx + qz * qz; st = t;
  }
  function fill(Q, i, t, x, z) {
    const j = i + 1 === N ? 0 : i + 1;
    Q.i = i; Q.t = t; Q.s = (i + t) * T.ds;
    const cx = T.x[i] + (T.x[j] - T.x[i]) * t, cz = T.z[i] + (T.z[j] - T.z[i]) * t;
    let nx = T.nx[i] + (T.nx[j] - T.nx[i]) * t, nz = T.nz[i] + (T.nz[j] - T.nz[i]) * t; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    Q.nx = nx; Q.nz = nz; Q.tx = -nz; Q.tz = nx;
    Q.d = (x - cx) * nx + (z - cz) * nz;
    Q.e = lerp(T.e[i], T.e[j], t); Q.slope = lerp(T.slope[i], T.slope[j], t); Q.vc = lerp(T.vc[i], T.vc[j], t);
    Q.wl = lerp(T.wl[i], T.wl[j], t); Q.wr = lerp(T.wr[i], T.wr[j], t); Q.k = T.k[i];
    Q.bl = lerp(T.barL[i], T.barL[j], t); Q.br = lerp(T.barR[i], T.barR[j], t);
    Q.pc = lerp(T.pitC[i], T.pitC[j], t); Q.phw = T.pitHW; Q.sep = T.pitSep[i];
    return Q;
  }
  return function project(x, z, hint, out) {
    const Q = out || DEF;
    let best = 1e18, bi = 0, bt = 0;
    if (hint >= 0) {
      for (let w = 14; w <= 120; w *= 2) {
        best = 1e18;
        for (let q = -w; q <= w; q++) {
          let i = hint + q; if (i < 0) i += N; else if (i >= N) i -= N;
          segTest(i, x, z);
          if (sd2 < best) { best = sd2; bi = i; bt = st; }
        }
        let di = Math.abs(bi - hint); di = Math.min(di, N - di);
        if (di < w - 2 && best < 60 * 60) return fill(Q, bi, bt, x, z);
      }
    }
    best = 1e18;
    const cx = Math.floor(x / T.cell), cz = Math.floor(z / T.cell);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const arr = T.hash.get((cx + a) + ',' + (cz + b)); if (!arr) continue;
      for (const m of arr) {
        segTest(m, x, z); if (sd2 < best) { best = sd2; bi = m; bt = st; }
        const m2 = (m - 1 + N) % N; segTest(m2, x, z); if (sd2 < best) { best = sd2; bi = m2; bt = st; }
      }
    }
    if (best > 1e17) for (let i = 0; i < N; i++) { segTest(i, x, z); if (sd2 < best) { best = sd2; bi = i; bt = st; } }
    return fill(Q, bi, bt, x, z);
  };
}

function trackPoint(T, s, d) {
  const N = T.N; s = ((s % T.L) + T.L) % T.L;
  const f = s / T.ds, i = Math.floor(f) % N, j = (i + 1) % N, t = f - Math.floor(f);
  const x = lerp(T.x[i], T.x[j], t) + lerp(T.nx[i], T.nx[j], t) * d;
  const z = lerp(T.z[i], T.z[j], t) + lerp(T.nz[i], T.nz[j], t) * d;
  const e = lerp(T.e[i], T.e[j], t);
  const h = Math.atan2(lerp(T.tx[i], T.tx[j], t), lerp(T.tz[i], T.tz[j], t));
  return { x, z, e, h, i };
}

// ---------------------------------------------------------------------------
//  Racing line (minimum curvature elastic band) + quasi-steady-state speed map
// ---------------------------------------------------------------------------
function lineFromOffsets(T, off) {
  const N = T.N, px = new Float64Array(N), pz = new Float64Array(N);
  for (let i = 0; i < N; i++) { px[i] = T.x[i] + T.nx[i] * off[i]; pz[i] = T.z[i] + T.nz[i] * off[i]; }
  const k = new Float64Array(N), sd = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 2 + N) % N, b = (i + 2) % N;
    const ax = px[i] - px[a], az = pz[i] - pz[a], bx = px[b] - px[i], bz = pz[b] - pz[i];
    k[i] = wrapAng(Math.atan2(bx, bz) - Math.atan2(ax, az)) / (0.5 * (Math.hypot(ax, az) + Math.hypot(bx, bz)));
    const c = (i + 1) % N; sd[i] = Math.hypot(px[c] - px[i], pz[c] - pz[i]);
  }
  return { off, x: px, z: pz, k: gaussWrap(k, 1.5), sd };
}

function computeRacingLine(T, margin) {
  const N = T.N, off = new Float64Array(N);
  const px = new Float64Array(N), pz = new Float64Array(N);
  const upd = () => { for (let i = 0; i < N; i++) { px[i] = T.x[i] + T.nx[i] * off[i]; pz[i] = T.z[i] + T.nz[i] * off[i]; } };
  // Minimise the summed squared curvature (biharmonic gradient descent), multi-scale.
  const gx = new Float64Array(N), gz = new Float64Array(N);
  for (const [K, iters] of (T.lineSched || [[32, 1500], [16, 2500], [8, 4000], [4, 6000], [2, 4000]])) {
    for (let it = 0; it < iters; it++) {
      upd();
      for (let i = 0; i < N; i++) { // second difference at scale K
        const a = (i - K + N) % N, b = (i + K) % N;
        gx[i] = px[a] - 2 * px[i] + px[b]; gz[i] = pz[a] - 2 * pz[i] + pz[b];
      }
      for (let i = 0; i < N; i++) {
        const a = (i - K + N) % N, b = (i + K) % N;
        const fx4 = gx[a] - 2 * gx[i] + gx[b], fz4 = gz[a] - 2 * gz[i] + gz[b];
        const dlt = fx4 * T.nx[i] + fz4 * T.nz[i];
        // a kerb with a wall right behind it (Monaco) gives no extra room
        off[i] = clamp(off[i] - dlt * 0.1, Math.max(-T.wr[i] + margin - (T.kerbR[i] ? 0.9 : 0), -T.barR[i] + margin), Math.min(T.wl[i] - margin + (T.kerbL[i] ? 0.9 : 0), T.barL[i] - margin));
      }
    }
  }
  // refine: re-weight the bending energy by local curvature so tight corners (hairpins,
  // the chicane) get the widest possible radius instead of a sharp apex
  const wgt = new Float64Array(N).fill(1);
  for (const [K, iters] of (T.lineRefine || [[4, 2500], [2, 2500]])) {
    for (let it = 0; it < iters; it++) {
      upd();
      if (it % 50 === 0) {
        for (let i = 0; i < N; i++) {
          const a = (i - 2 + N) % N, b = (i + 2) % N;
          const h1 = Math.atan2(px[i] - px[a], pz[i] - pz[a]), h2 = Math.atan2(px[b] - px[i], pz[b] - pz[i]);
          const kk = Math.abs(wrapAng(h2 - h1)) / (4 * T.ds);
          wgt[i] = 1 + (kk * 55) ** 2;
        }
      }
      for (let i = 0; i < N; i++) {
        const a = (i - K + N) % N, b = (i + K) % N;
        gx[i] = (px[a] - 2 * px[i] + px[b]) * wgt[i]; gz[i] = (pz[a] - 2 * pz[i] + pz[b]) * wgt[i];
      }
      for (let i = 0; i < N; i++) {
        const a = (i - K + N) % N, b = (i + K) % N;
        const fx4 = gx[a] - 2 * gx[i] + gx[b], fz4 = gz[a] - 2 * gz[i] + gz[b];
        const wm = Math.max(wgt[a], wgt[i], wgt[b]);
        const dlt = (fx4 * T.nx[i] + fz4 * T.nz[i]) / wm;
        // a kerb with a wall right behind it (Monaco) gives no extra room
        off[i] = clamp(off[i] - dlt * 0.1, Math.max(-T.wr[i] + margin - (T.kerbR[i] ? 0.9 : 0), -T.barR[i] + margin), Math.min(T.wl[i] - margin + (T.kerbL[i] ? 0.9 : 0), T.barL[i] - margin));
      }
    }
  }
  // light smoothing of the offsets to remove residual ripples
  const so = gaussWrap(off, 2);
  for (let i = 0; i < N; i++) off[i] = clamp(so[i], -T.wr[i] + margin - (T.kerbR[i] ? 0.9 : 0), T.wl[i] - margin + (T.kerbL[i] ? 0.9 : 0));
  return lineFromOffsets(T, off);
}

// ---------------------------------------------------------------------------
//  Car parameters
// ---------------------------------------------------------------------------
function powerFrac(x, P) {
  if (x < 0.05) x = 0.05;
  if (x <= P.xpk) return Math.pow(x / P.xpk, P.shape);
  const t = (x - P.xpk) / (1 - P.xpk);
  return 1 - P.drop * t * t;
}
