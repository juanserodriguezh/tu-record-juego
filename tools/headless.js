// Headless game core (tracks + cars + physics, no browser): node tools/headless.js accel [ids]  |  node tools/headless.js tyres
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const files = ['data_spa', 'data_monza', 'data_albertpark', 'data_toca', 'data_monaco', 'tracks', 'cars', 'physics', 'damage', 'barrels', 'line_offs', 'ai', 'coach', 'rewind'];
const src = files.map(f => fs.readFileSync(path.join(SRC, f + '.js'), 'utf8').replace(/if \(typeof module[^\n]*\n/, '')).join('\n');
const M = new Function(src + '\nreturn { newTyres, TYRES, buildTrack, Vehicle, CARS, TRACK_DEFS, ACCEL_CAL, LINE_OFFS, lineFromOffsets, wxInit, AIDriver, AI_PROFILES, qssProfile, aiProfile, newDamage, pitStopPlan, PIT_CREW, Coach, coachPlan, COACH, DMG, Rewind, REWIND, rwCopy, MONACO_CITY, BarrelWorld, BARREL_TYPES, BARRIER_MAT, BAR, barrelMass, placeBarrels, pitWallNose, collideCars };')();
const cmd = process.argv[2] || 'accel';
if (cmd === 'accel') {   // standing-start acceleration on the Spa straight: 0-100 / 0-200 / 0-300 km/h and top speed
  const T = M.buildTrack('spa');
  const env = { grip: 1, abs: true, tc: true, esc: true, autoShift: true, steerAssist: true, slipCap: true, noGrade: true };
  const ids = process.argv[3] ? process.argv[3].split(',') : M.CARS.map(c => c.id);
  for (const id of ids) { const sp = M.CARS.find(c => c.id === id); if (!sp) { console.log('?', id); continue; }
    const V = new M.Vehicle(sp, T); V.collide = () => {}; V.surfaceAt = () => 'asphalt'; V.reset(1800 * T.L / 7000, 0); V.u = 0;
    let t = 0, a = 0, b = 0, c = 0; while (t < 60) { V.step(1 / 240, { throttle: 1, brake: 0, steer: 0 }, env); t += 1 / 240; const k = V.u * 3.6; if (!a && k >= 100) a = t; if (!b && k >= 200) b = t; if (!c && k >= 300) c = t; }
    console.log(id.padEnd(14), String(sp.hp).padStart(5), 'CV', String(sp.kg).padStart(5), 'kg  0-100', a ? a.toFixed(2) : '-', ' 0-200', b ? b.toFixed(1) : '-', ' 0-300', c ? c.toFixed(1) : '-', ' vmax', (V.u * 3.6).toFixed(0), '/', sp.vmax); }
}
if (cmd === 'tyres') {   // tyre barriers must sit on the outside of the corner: curvature-weighted share of the stretch that bends away from the wall
  let bad = 0;
  for (const id of Object.keys(M.TRACK_DEFS)) { const def = M.TRACK_DEFS[id]; if (!def.tyres || !def.tyres.length) continue; const T = M.buildTrack(id);
    const N = T.x.length, ds = T.L / N, k = T.L / def.nom; let ok = 0; const miss = [];
    for (const [a, b, sd] of def.tyres) { let on = 0, all = 0;   // a chicane flips sign inside the stretch, so the midpoint alone says little
      for (let i0 = Math.round(a * k / ds), i1 = Math.round(b * k / ds), j = i0; j <= i1; j++) { const i = j % N, ia = (i - 4 + N) % N, ib = (i + 4) % N;
        const cr = (T.x[i] - T.x[ia]) * (T.z[ib] - T.z[i]) - (T.z[i] - T.z[ia]) * (T.x[ib] - T.x[i]); all += Math.abs(cr); if (Math.sign(cr) === sd) on += Math.abs(cr); }
      const f = all ? on / all : 0; if (f >= 0.75) ok++; else miss.push(`[${a},${b},${sd}] ${(f * 100).toFixed(0)} %`); }
    bad += miss.length;
    console.log(id.padEnd(14), 'tyre barriers on the outside:', ok, '/', def.tyres.length, miss.length ? '  FAIL ' + miss.join('  ') : ''); }
  if (bad) { console.log(bad, 'tyre barrier(s) on the inside of the corner'); process.exit(1); }
}
if (cmd === 'ailap') {   // flying laps of one AI driver alone, dry: node tools/headless.js ailap monza amg_gt3,w17 [diff=5] [laps=3]
  const tid = process.argv[3] || 'monza', ids = (process.argv[4] || 'amg_gt3').split(','), diff = +(process.argv[5] || 5), nl = +(process.argv[6] || 3);
  const D = M.TRACK_DEFS[tid], T = M.buildTrack(D), offs = (M.LINE_OFFS[D.id] || '').split(',').map(v => +v / 100);
  const LINE = M.lineFromOffsets(T, Float64Array.from(offs.length === T.N ? offs : new Array(T.N).fill(0))); M.wxInit(T, LINE, D);
  const fmt = t => t ? Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0') : '-';
  for (const id of ids) { const sp = M.CARS.find(c => c.id === id); if (!sp) { console.log('?', id); continue; }
    const V = new M.Vehicle(sp, T); V.reset(T.L - 150 * T.L / D.nom, 0); V.u = 0;
    const ai = new M.AIDriver(V, T, LINE, { diff, react: 0 }); ai.setEnv({ grip: 1, wet: 0, water: 0, dryLine: 0 }, id); ai.startRolling();
    const self = { id: 'me' }, laps = []; let t = 0, tl = null, ps = V.q.s, vtop = 0, resets = 0; const dt = 1 / 120;
    while (laps.length < nl + 1 && t < 600) { const inp = ai.drive(dt, [self], self, { hold: false }); V.step(dt, inp, ai.env); t += dt; vtop = Math.max(vtop, V.u);
      if (ai.needReset) { resets++; if (process.env.WHERE) console.log('  stuck at s', Math.round(V.q.s * D.nom / T.L), 'd', V.q.d.toFixed(1), 'u', (V.u * 3.6).toFixed(0), 't', t.toFixed(1)); break; }
      if (ps > T.L * 0.8 && V.q.s < T.L * 0.2) { if (tl != null) laps.push(t - tl); tl = t; } ps = V.q.s; }
    const fly = laps.slice(1), best = fly.length ? Math.min(...fly) : 0;
    console.log(tid.padEnd(12), id.padEnd(13), 'diff', diff, ' qss', fmt(ai.profObj.time), ' laps', laps.map(fmt).join(' '), ' best', fmt(best), ' vmax', (vtop * 3.6).toFixed(0), resets ? ' STUCK' : ''); }
}
if (cmd === 'tyrelife') {   // laps until a compound reaches 80 % wear, measured with an AI driver at pace, dry: node tools/headless.js tyrelife [tracks] [car] [diff=9]
  const tids = process.argv[3] ? process.argv[3].split(',') : Object.keys(M.TRACK_DEFS), id = process.argv[4] || 'amg_gt3', diff = +(process.argv[5] || 9);
  const sp = M.CARS.find(c => c.id === id); M.DMG.scale = 0; const out = {};
  for (const tid of tids) { const D = M.TRACK_DEFS[tid], T = M.buildTrack(D), offs = (M.LINE_OFFS[D.id] || '').split(',').map(v => +v / 100);
    const LINE = M.lineFromOffsets(T, Float64Array.from(offs.length === T.N ? offs : new Array(T.N).fill(0))); M.wxInit(T, LINE, D); const row = {};
    for (const c of ['S', 'M', 'H']) {
      const V = new M.Vehicle(sp, T); V.reset(T.L - 150 * T.L / D.nom, 0); V.u = 0; V.ty = M.newTyres(c, true);
      const ai = new M.AIDriver(V, T, LINE, { diff, react: 0 }); ai.setEnv({ grip: 1, wet: 0, water: 0, dryLine: 0 }, id); ai.startRolling();
      const self = { id: 'me' }; let t = 0, n = -1, ps = V.q.s, w0 = 0, resets = 0; const dt = 1 / 120;
      while (n < 3 && t < 900) { const inp = ai.drive(dt, [self], self, { hold: false }); V.step(dt, inp, ai.env); t += dt;
        if (ai.needReset) { V.reset(V.q.s, 0, true); ai.stuckT = 0; ai.wrongT = 0; ai.needReset = false; ai.startRolling(); resets++; }
        if (ps > T.L * 0.8 && V.q.s < T.L * 0.2) { n++; if (n === 1) w0 = Math.max(V.ty.wF, V.ty.wR); } ps = V.q.s; }
      const perLap = n >= 3 ? (Math.max(V.ty.wF, V.ty.wR) - w0) / 2 : 0;   // the axle that wears faster decides
      if (process.env.WHY && !(perLap > 0)) console.log('  ', c, 'laps', n, 't', t.toFixed(0), 'reset', !!ai.needReset, 's', Math.round(V.q.s), 'd', V.q.d.toFixed(1), 'u', (V.u * 3.6).toFixed(0), 'w', V.ty.wF.toFixed(2), V.ty.wR.toFixed(2), 'T', V.ty.tF.toFixed(0), V.ty.tR.toFixed(0));
      row[c] = perLap > 0 ? Math.round(0.8 / perLap) : null; if (resets) row[c + '_resets'] = resets; }
    out[tid] = row; console.log(tid.padEnd(14), id, 'diff', diff, ' laps to 80 %:', JSON.stringify(row)); }
  if (process.env.JSON) console.log(JSON.stringify(out));
}
if (cmd === 'tyretemp') {   // tyre temperature with an AI driver at pace, dry: time to the window, mean / peak per lap, time overheated: node tools/headless.js tyretemp [tracks] [car] [diff=9] [laps=4]
  const tids = process.argv[3] ? process.argv[3].split(',') : Object.keys(M.TRACK_DEFS), id = process.argv[4] || 'amg_gt3', diff = +(process.argv[5] || 9), nl = +(process.argv[6] || 4);
  const sp = M.CARS.find(c => c.id === id); M.DMG.scale = 0;
  for (const tid of tids) { const D = M.TRACK_DEFS[tid], T = M.buildTrack(D), offs = (M.LINE_OFFS[D.id] || '').split(',').map(v => +v / 100);
    const LINE = M.lineFromOffsets(T, Float64Array.from(offs.length === T.N ? offs : new Array(T.N).fill(0))); M.wxInit(T, LINE, D);
    for (const c of (process.env.COMP || 'S,M,H').split(',')) { const t0 = M.TYRES[c];
      const V = new M.Vehicle(sp, T); V.reset(T.L - 150 * T.L / D.nom, 0); V.u = 0; V.ty = M.newTyres(c, true);
      const ai = new M.AIDriver(V, T, LINE, { diff, react: 0 }); ai.setEnv({ grip: 1, wet: 0, water: 0, dryLine: 0 }, id); ai.startRolling();
      const self = { id: 'me' }, dt = 1 / 120; let t = 0, n = -1, ps = V.q.s, tWin = 0, lt = 0, acc = 0, pk = 0, over = 0; const laps = [];
      while (n < nl && t < 1200) { const inp = ai.drive(dt, [self], self, { hold: false }); V.step(dt, inp, ai.env); t += dt;
        if (ai.needReset) { V.reset(V.q.s, 0, true); ai.stuckT = 0; ai.wrongT = 0; ai.needReset = false; ai.startRolling(); }
        const Tm = Math.max(V.ty.tF, V.ty.tR); if (!tWin && Tm >= t0.topt - 10) tWin = t;
        acc += Tm * dt; lt += dt; pk = Math.max(pk, Tm); if (Tm > t0.topt + t0.win * 0.9) over += dt;
        if (ps > T.L * 0.8 && V.q.s < T.L * 0.2) { if (n >= 0) laps.push(`${(acc / lt).toFixed(0)}/${pk.toFixed(0)}${over > 0.5 ? ' +' + Math.round(100 * over / lt) + '%' : ''}`); n++; acc = 0; lt = 0; pk = 0; over = 0; } ps = V.q.s; }
      const wear = Math.max(V.ty.wF, V.ty.wR);
      console.log(tid.padEnd(13), c, `opt ${t0.topt}±${t0.win}`, ` window ${tWin.toFixed(0)} s`, ' laps mean/peak (+% overheated):', laps.join('  '), ` wear ${(wear * 100).toFixed(0)} %`); } }
}
if (cmd === 'coach') {   // adaptive line: zones and how it judges three drivers (late / good / early): node tools/headless.js coach [track] [car] [laps=4]
  const tid = process.argv[3] || 'monza', id = process.argv[4] || 'amg_gt3', nl = +(process.argv[5] || 4);
  const D = M.TRACK_DEFS[tid], T = M.buildTrack(D), offs = (M.LINE_OFFS[D.id] || '').split(',').map(v => +v / 100);
  const LINE = M.lineFromOffsets(T, Float64Array.from(offs.length === T.N ? offs : new Array(T.N).fill(0))); M.wxInit(T, LINE, D);
  const sp = M.CARS.find(c => c.id === id), P = new M.Vehicle(sp, T).P;
  let t0 = Date.now(); const vel = M.coachPlan(T, LINE, P, 1); const tPlan = Date.now() - t0;
  t0 = Date.now(); const C0 = new M.Coach(T, vel, {}); const tBuild = Date.now() - t0;
  t0 = Date.now(); for (let k = 0; k < 20; k++) C0.rebuild(); const tReb = (Date.now() - t0) / 20;
  console.log(tid, id, '·', C0.zones.length, 'braking zones:', C0.zones.map(z => `${z.name} ${Math.round(vel[z.b] * 3.6)}→${Math.round(vel[z.a] * 3.6)}`).join(', '));
  console.log(`cost: plan ${tPlan} ms, coach ${tBuild} ms, rebuild after a corner ${tReb.toFixed(1)} ms`);
  let fail = 0; M.DMG.scale = 0;   // no damage: a crash would leave a slower car and blur the next corners
  // late: AI level 10 that keeps the throttle 40 m past its own braking point in every zone; good: AI level 10; early: AI level 1
  for (const [name, diff, late, want] of [['late', 10, 40, 'late'], ['good', 10, 0, 'good'], ['early', 1, 0, 'early']]) {
    const V = new M.Vehicle(sp, T); V.reset(T.L - 150 * T.L / D.nom, 0); V.u = 0;
    const ai = new M.AIDriver(V, T, LINE, { diff, react: 0 }); ai.setEnv({ grip: 1, wet: 0, water: 0, dryLine: 0 }, id); ai.startRolling();
    const miss = [], C = new M.Coach(T, vel, {}), cnt = { late: 0, good: 0, early: 0 }, laps = []; let t = 0, ps = V.q.s, lap = 0, hidden = [];
    const self = { id: 'me' }, dt = 1 / 120;
    let zk = -1, s0 = null, redOut = 0;
    // where the plan brakes (top speed before a zone to just past its apex): a clean driver must never see red elsewhere
    const brkPart = new Uint8Array(T.N); for (const z of C.zones) for (let j = z.p; j !== (z.a + 3) % T.N; j = (j + 1) % T.N) brkPart[j] = 1;
    while (lap <= nl && t < 900) { let inp = ai.drive(dt, [self], self, { hold: false });
      if (late) { const k = C.zEval[V.q.i]; if (k !== zk) { zk = k; s0 = null; }
        if (k >= 0 && inp.brake > 0.05 && s0 == null) s0 = V.q.s;
        if (s0 != null && s0 >= 0 && ((V.q.s - s0 + T.L) % T.L) < late) inp = Object.assign({}, inp, { brake: 0, throttle: 1 }); else if (s0 != null) s0 = -1; }
      V.step(dt, inp, ai.env); t += dt;
      if (ai.needReset) { V.reset(V.q.s, LINE.off[V.q.i], true); V.u = 10; ai.needReset = false; ai.stuckT = 0; ai.startRolling(); C.obs = null; }
      const q = V.q, off = Math.abs(q.d) > (q.d >= 0 ? q.wl : q.wr) + 1.3 + 0.95;
      const ev = C.observe(q.i, Math.abs(V.u), inp.brake, off, V.impactT > 0.45 && V.lastImpact > 4, dt);
      if (lap >= 1 && !brkPart[q.i] && C.code(Math.abs(V.u), q.i) > 1.5) redOut += dt;
      if (ev) { cnt[ev.kind]++; if (ev.kind !== want) miss.push(ev.zone.name + ' ' + ev.kind + ' (' + ev.err + ' m, ' + (ev.ratio * 100).toFixed(0) + ' %)'); }
      if (ps > T.L * 0.8 && q.s < T.L * 0.2) { lap++; hidden.push(C.zones.filter(z => z.hidden).length); } ps = q.s; }
    // the plan keeps a braking margin, so braking 40 m late still makes some corners (more on fast tracks): those
    // are fine (good), and one that brakes at the red but then over-slows is told so (early). A late braker must get
    // mostly late verdicts and few early ones (<15 % of the late ones); the other two need 90 %.
    const tot = cnt.late + cnt.good + cnt.early, share = tot ? cnt[want] / tot : 0;
    if (want === 'late' ? !cnt.late || cnt.early > 0.15 * cnt.late : share < 0.9) fail++;
    const ro = redOut / Math.max(1, nl); if (want !== 'late' && ro > 0.3) fail++;
    console.log(`${name.padEnd(6)} late ${cnt.late}  good ${cnt.good}  early ${cnt.early}  -> ${(share * 100).toFixed(0)} % as expected · red under the car outside braking ${ro.toFixed(1)} s/lap · corners withdrawn after each lap: ${hidden.join(' ')}`);
    if (miss.length) console.log('    other verdicts:', [...new Set(miss)].slice(0, 6).join(' · '));
  }
  if (fail) { console.log(fail, 'driver(s) misjudged'); process.exit(1); }
}
if (cmd === 'city') {   // measured town (Monaco): no building block or grandstand may reach inside the barriers of any part of the lap (exit 1)
  const C = M.MONACO_CITY, D = M.TRACK_DEFS.monaco, T = M.buildTrack('monaco'), sN = q => Math.round(q.s * D.nom / T.L); let bad = 0;
  const inside = (cx, cz, hw, hd, rot, top) => { const c = Math.cos(rot), s = Math.sin(rot); let w = null;
    for (let a = 0, nu = Math.max(2, Math.ceil(hw)); a <= nu; a++) for (let b = 0, nv = Math.max(2, Math.ceil(hd)); b <= nv; b++) {
      const u = (2 * a / nu - 1) * hw, v = (2 * b / nv - 1) * hd, q = T.project(cx + u * c - v * s, cz + u * s + v * c, -1), m = Math.abs(q.d) - (q.d > 0 ? q.bl : q.br);
      if (top > q.e && m < 0 && (!w || m < w[1])) w = [sN(q), m]; }
    return w; };
  const B = C.buildings.split(';').map(r => r.split(',').map(Number)); let nb = 0;
  for (const [cx, cz, hw, hd, rot, base, top] of B) { const w = inside(cx, cz, hw, hd, rot, top); if (w) { nb++; console.log('  building at s', w[0], 'reaches', (-w[1]).toFixed(1), 'm inside the barrier'); } }
  let ns = 0; for (const [, , cx, cz, hw, hd, rot, base, top] of C.stands) { const w = inside(cx, cz, hw, hd, rot, top); if (w) { ns++; console.log('  grandstand at s', w[0], 'reaches', (-w[1]).toFixed(1), 'm inside the barrier'); } }
  bad = nb + ns; console.log('monaco         buildings', B.length, 'over the circuit', nb, '| grandstands', C.stands.length, 'over the circuit', ns);
  if (bad) process.exit(1);
}
if (cmd === 'pits') {   // grandstands, pit lane and pit buildings must not overlap the circuit or each other: node tools/headless.js pits [track]
  let bad = 0;
  for (const id of process.argv[3] ? [process.argv[3]] : Object.keys(M.TRACK_DEFS)) {
    const D = M.TRACK_DEFS[id], T = M.buildTrack(id), N = T.N, sc = T.L / D.nom, ds = T.ds, md = i => ((i % N) + N) % N;
    const idx = sN => md(Math.round(sN * sc / ds)), sOf = i => Math.round(md(i) * ds / sc), gapI = (a, b) => { const d = Math.abs(md(a) - md(b)); return Math.min(d, N - d); };
    const ps = T.pitSide, hasPit = i => T.pitC[md(i)] === T.pitC[md(i)], dOut = i => T.pitC[md(i)] + ps * (T.pitHW + 0.4), span = (a, b) => [Math.min(a, b), Math.max(a, b)];
    // same rule as world.js: a pit-building footprint is dropped when it comes within half-width + pad of another part of the circuit
    const farTrack = (x, z, kSelf, pad) => { const skip = Math.ceil(70 / ds);
      for (let i = 0; i < N; i++) { if (gapI(i, kSelf) < skip) continue; const dx = x - T.x[i], dz = z - T.z[i], lim = Math.max(T.wl[i], T.wr[i]) + pad; if (dx * dx + dz * dz < lim * lim) return true; } return false; };
    const P = (i, d) => { i = md(i); return [T.x[i] + T.nx[i] * d, T.z[i] + T.nz[i] * d]; };
    const footHits = (k, i0, i1, dA, dB, pad) => { if (dA < dB) [dA, dB] = [dB, dA]; for (let u = i0; u <= i1; u++) for (let d = dA; d >= dB - 0.01; d -= Math.max(1.5, (dA - dB) / 6)) { const p = P(k + u, d); if (farTrack(p[0], p[1], k, pad)) return true; } return false; };
    // footprints: { name, kind, lo[i], hi[i] } over a set of samples (lateral interval, + left)
    const F = [], band = (name, kind, iA, iB, f) => { const lo = new Map(), hi = new Map(); for (let i = iA; i <= iB; i++) { const r = f(md(i)); if (r) { lo.set(md(i), r[0]); hi.set(md(i), r[1]); } } F.push({ name, kind, lo, hi }); };
    band('circuit', 'track', 0, N - 1, i => [-T.barR[i], T.barL[i]]);
    let pA = 0; while (!hasPit(pA) || hasPit(pA - 1)) pA++; let pB = pA; while (hasPit(pB + 1)) pB++;
    band('pit lane', 'pit', pA, pB, i => span(T.pitC[i] + ps * T.pitHW, ps * Math.max(ps * T.pitC[i] - T.pitHW, T.pitW[i])));
    let iF = T.pitSepFrom, iT = T.pitSepTo; if (iT < iF) iT += N;
    const dep = D.pitDepth || 18, gar = new Set(); for (let i = iF + 2; i < iT - 2; i += 4) if (!footHits(i, 0, 4, dOut(i), dOut(i) + ps * (dep + 1.5), 3)) for (let u = 0; u <= 4; u++) gar.add(md(i + u));
    band('pit building', 'garage', iF, iT, i => gar.has(i) ? span(dOut(i), dOut(i) + ps * dep) : null);
    if (D.tower !== false) { const k = idx(60), o = T.pitC[k] + ps * T.pitHW, u = Math.ceil(11 / ds); if (!footHits(k, -u, u, o + ps * 4, o + ps * 20, 3)) band('control tower', 'garage', k - u, k + u, i => span(o + ps * 4, o + ps * 20)); }
    D.stands.forEach(([sA, sB, side, gap, tiers]) => { const iA = idx(sA), iB = idx(sB) + (sB < sA ? N : 0);
      band(`stand [${sA},${sB},${side}]`, 'stand', iA, iB, i => { const bar = side > 0 ? T.barL[i] : T.barR[i], a = side * (bar + gap - 0.7), b = side * (bar + gap + tiers * 0.95 + 1.0); return [Math.min(a, b), Math.max(a, b)]; }); });
    // small pieces beside the track (same placement rules as world.js): marshal posts, banner pillars
    for (let s = 150; s < D.nom; s += 330) { const k = idx(s), side = (Math.floor(s / 330) % 2) ? 1 : -1; if (side === ps && hasPit(k)) continue;
      const d = side * ((side > 0 ? T.barL[k] : T.barR[k]) + 2.2); band(`marshal post s${s}`, 'post', k, k, () => [d - 1.1, d + 1.1]); }
    if (D.brakeBanner) { const k = idx(D.brakeBanner.s), pit = (side, bar) => hasPit(k) && side === ps ? bar - 1.4 : bar;
      for (const side of [1, -1]) { const d = side * (pit(side, side > 0 ? T.barL[k] : T.barR[k]) + 1.2); band(`banner pillar ${side > 0 ? 'L' : 'R'}`, 'post', k, k, () => [d - 0.7, d + 0.7]); } }
    // does point (x,z) fall inside footprint c? (projected on c's own samples near it)
    const inside = (c, x, z, from, local) => { const cx = Math.floor(x / T.cell), cz = Math.floor(z / T.cell);
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const arr = T.hash.get((cx + a) + ',' + (cz + b)); if (!arr) continue;
        for (const j of arr) { if (!c.lo.has(j)) continue; const g = gapI(j, from); if (local === 'far' && g * ds < 120) continue;
          const dx = x - T.x[j], dz = z - T.z[j], al = dx * T.tx[j] + dz * T.tz[j]; if (Math.abs(al) > ds * 0.75) continue;
          const lat = dx * T.nx[j] + dz * T.nz[j]; if (lat > c.lo.get(j) + 0.3 && lat < c.hi.get(j) - 0.3) return j; } } return -1; };
    const out = [];
    for (const a of F) { if (a.kind === 'track') continue;
      for (const c of F) { if (c === a) continue;
        // stands: nothing at all may overlap them; pit lane / buildings: only other parts of the circuit; posts: track and pit lane
        const rule = a.kind === 'stand' ? 'any' : a.kind === 'post' ? (c.kind === 'pit' || c.kind === 'garage' ? 'any' : c.kind === 'track' ? 'far' : 'skip') : c.kind === 'track' ? 'far' : 'skip';
        if (rule === 'skip' || (a.kind === 'stand' && c.kind === 'stand' && F.indexOf(c) < F.indexOf(a))) continue;
        let n = 0, sMin = 1e9, sMax = -1e9, cS = null;
        for (const [i, lo] of a.lo) { if (i % 2 && a.kind !== 'post') continue; const hi = a.hi.get(i);
          for (let d = lo; d <= hi + 0.01; d += Math.max(0.75, (hi - lo) / 12)) { const [x, z] = P(i, d), j = inside(c, x, z, i, rule); if (j >= 0) { n++; const s = sOf(i); sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); cS = sOf(j); } } }
        if (n) out.push(`${a.name} overlaps ${c.name}${c.kind === 'track' ? ' (s≈' + cS + ')' : ''} around s ${sMin}-${sMax} (${n} pts)`); } }
    if (T.esc && T.esc.pit) { const E = T.esc, n0 = Math.round(E.pts.length * 0.1), n1 = Math.round(E.pts.length * 0.68);   // pit exit road: clear of the circuit between where it leaves and where it crosses the run-off to blend in
      for (const c of F) { let n = 0; for (let j = n0; j <= n1; j++) { const [px, pz] = E.pts[j], tx = E.pts[j + 1][0] - px, tz = E.pts[j + 1][1] - pz, tl = Math.hypot(tx, tz);
          for (const o of [-E.hw, 0, E.hw]) if (inside(c, px + tz / tl * o, pz - tx / tl * o, 0, "any") >= 0) n++; }
        if (n) out.push(`pit exit road overlaps ${c.name} (${n} pts)`); } }
    const garN = [...gar].length, sepLen = ((T.pitSepTo - T.pitSepFrom + N) % N) * ds / sc;
    console.log(id.padEnd(14), `pit lane ${Math.round(((pB - pA + N) % N) * ds / sc)} m (separated ${Math.round(sepLen)} m), buildings ${Math.round(garN * ds / sc)} m`, out.length ? '  FAIL' : '  ok');
    for (const o of out) console.log('   ', o);
    bad += out.length; }
  if (bad) { console.log(bad, 'overlap(s)'); process.exit(1); }
}
if (cmd === 'pitstop') {   // stationary pit-stop time per body type: tyres only / tyres + light nose damage / heavy damage
  const cases = [['neumáticos', D => {}, true], ['neum. + alerón leve', D => { D.fw = 0.25; }, true], ['neum. + alerón roto', D => { D.fw = 1; }, true],
    ['alerón + carrocería', D => { D.fw = 0.6; D.body.f = 1; }, true], ['suspensión media', D => { D.sus[0] = 0.5; }, true], ['choque fuerte', D => { D.fw = 1; D.body.f = 1.2; D.body.l = 0.8; D.sus[0] = 1; D.cool = 0.6; }, true]];
  console.log('body'.padEnd(7), cases.map(c => c[0].padStart(20)).join(''));
  for (const body of Object.keys(M.PIT_CREW)) console.log(body.padEnd(7), cases.map(([, f, ty]) => { const D = M.newDamage(); f(D); return (M.pitStopPlan(D, body, ty).tot.toFixed(1) + ' s').padStart(20); }).join(''));
}
if (cmd === 'rewind') {   // practice rewind: exact restore (replay = same lap), damage, cost and the adaptive line: node tools/headless.js rewind [track] [cars]
  const tid = process.argv[3] || 'monza', ids = (process.argv[4] || 'amg_gt3,w17,duster').split(',');
  const D = M.TRACK_DEFS[tid], T = M.buildTrack(D), offs = (M.LINE_OFFS[D.id] || '').split(',').map(v => +v / 100);
  const LINE = M.lineFromOffsets(T, Float64Array.from(offs.length === T.N ? offs : new Array(T.N).fill(0))); M.wxInit(T, LINE, D);
  const dt = 1 / 240, self = { id: 'me' }; let fail = 0;
  const diff = (a, b) => { let m = 0, k = ''; const walk = (x, y, p) => { if (typeof x === 'number') { const d = Math.abs(x - y); if (!(d <= m)) { m = d; k = p; } } else if (x && typeof x === 'object') for (const j in x) walk(x[j], y ? y[j] : undefined, p + '.' + j); else if (x !== y) { m = Infinity; k = p; } }; walk(a, b, ''); return [m, k]; };
  const skip = { spec: 1, P: 1, T: 1 }, state = (V) => { const o = {}; for (const k in V) if (!skip[k] && typeof V[k] !== 'function') o[k] = M.rwCopy(V[k]); return o; };
  // 1) exact: drive 40 s (AI level 10, damage on), go back 5 s, replay the same inputs: the car must end bit-identical
  M.DMG.scale = 1;
  for (const id of ids) { const sp = M.CARS.find(c => c.id === id);
    const V = new M.Vehicle(sp, T); V.reset(T.L - 150 * T.L / D.nom, 0); V.u = 0;
    const ai = new M.AIDriver(V, T, LINE, { diff: 10, react: 0 }); ai.setEnv({ grip: 1, wet: 0, water: 0, dryLine: 0 }, id); ai.startRolling();
    const RW = new M.Rewind(), inps = []; let n = 0;
    for (; n < 40 / dt; n++) { const inp = Object.assign({}, ai.drive(dt, [self], self, { hold: false })); inps.push(inp); V.step(dt, inp, ai.env); RW.tick(dt, V, { n: n + 1 }); }
    const end = state(V), b = RW.back(5); RW.restore(V, b.sn);
    const back = (end.q.s - V.q.s + T.L) % T.L;
    for (let j = b.sn.x.n; j < n; j++) V.step(dt, inps[j], ai.env);
    const [m, k] = diff(end, state(V)); if (m !== 0) fail++;
    console.log(`${tid} ${id.padEnd(9)} back ${b.sec} s (${back.toFixed(0)} m), replay -> max difference ${m}${m ? ' in ' + k : ' (identical)'}`); }
  // 2) damage: hit the wall at 180 km/h, rewind to before the hit: damage, tyres and speed as they were
  { const sp = M.CARS.find(c => c.id === ids[0]), V = new M.Vehicle(sp, T), i = Math.round(T.N * 0.3), RW = new M.Rewind();
    V.reset(i * T.ds, T.barL[i] - 8, false); V.h = Math.atan2(T.tx[i], T.tz[i]) + 25 * Math.PI / 180; V.u = 50;
    const env = { grip: 1, abs: true, tc: true, esc: true, autoShift: true, steerAssist: true, slipCap: true };
    for (let j = 0; j < 3 / dt; j++) { V.step(dt, { steer: 0, throttle: 0.3, brake: 0 }, env); RW.tick(dt, V, {}); }
    const hit = V.dmg.total, b = RW.back(15); RW.restore(V, b.sn);
    const ok = hit > 0.05 && V.dmg.total === b.sn.v.dmg.total && V.dmg.total < 0.01 && Math.abs(V.u - b.sn.v.u) === 0;
    if (!ok) fail++;
    console.log(`damage: after the hit ${(hit * 100).toFixed(0)} %, rewound ${b.sec} s -> ${(V.dmg.total * 100).toFixed(1)} % at ${(V.u * 3.6).toFixed(0)} km/h ${ok ? 'OK' : 'FAIL'}`); }
  // 3) cost: time per snapshot and memory of a full ring (15 s at 10 Hz); a full ring reuses its objects (no garbage)
  { let gc = null; try { require('v8').setFlagsFromString('--expose-gc'); gc = require('vm').runInNewContext('gc'); } catch (e) { }
    const sp = M.CARS.find(c => c.id === ids[0]), V = new M.Vehicle(sp, T); V.reset(1000, 0); V.u = 40;
    for (let j = 0; j < 240; j++) V.step(dt, { steer: 0, throttle: 1, brake: 0 }, { grip: 1 });
    const x = { started: true, lapT: 12.3, cp: [true, false], sectorsCur: [31.2], ghostLen: 480 };
    const heap = () => { if (gc) gc(); return process.memoryUsage().heapUsed; };
    const h0 = heap(), rings = []; for (let r = 0; r < 20; r++) { const RW = new M.Rewind(); for (let j = 0; j < RW.n; j++) { RW.acc = 0; RW.tick(dt, V, x); } rings.push(RW); }
    const per = (heap() - h0) / 20;
    const RW = rings[0], t0 = process.hrtime.bigint(), N = 20000; for (let j = 0; j < N; j++) { RW.acc = 0; RW.tick(dt, V, x); }
    const us = Number(process.hrtime.bigint() - t0) / 1e3 / N, h1 = heap(); for (let j = 0; j < 20000; j++) { RW.acc = 0; RW.tick(dt, V, x); } const grow = heap() - h1;
    console.log(`cost: ${us.toFixed(1)} µs per snapshot (10 per second = ${(us * 10 / 1000).toFixed(3)} ms/s of CPU, ${(us * 10 / 1e4).toFixed(4)} % of one core), ring of ${RW.n} snapshots ${(per / 1024).toFixed(0)} KB${gc ? '' : ' (no gc: rough)'}, heap after 20 000 more snapshots ${grow >= 0 ? '+' : ''}${(grow / 1024).toFixed(0)} KB`);
    if (us > 50 || per > 2e6) fail++; }
  // 4) adaptive line: AI level 10 drives 2 laps and rewinds 3 s at every apex; the retry must be judged (and judged right)
  { const sp = M.CARS.find(c => c.id === ids[0]), V = new M.Vehicle(sp, T); V.reset(T.L - 150 * T.L / D.nom, 0); V.u = 0; M.DMG.scale = 0;
    const ai = new M.AIDriver(V, T, LINE, { diff: 10, react: 0 }); ai.setEnv({ grip: 1, wet: 0, water: 0, dryLine: 0 }, ids[0]); ai.startRolling();
    const C = new M.Coach(T, M.coachPlan(T, LINE, V.P, 1), {}), RW = new M.Rewind(), cnt = { late: 0, good: 0, early: 0 }, at = {};
    let t = 0, lap = 0, ps = V.q.s, rw = 0, retried = 0, judgedRetry = 0, pend = -1, dts = 1 / 120;
    while (lap < 3 && t < 900) { const inp = ai.drive(dts, [self], self, { hold: false }); V.step(dts, inp, ai.env); t += dts; RW.tick(dts, V, {});
      const q = V.q, k = C.zEval[q.i];
      const ev = C.observe(q.i, Math.abs(V.u), inp.brake, false, false, dts);
      if (ev) { cnt[ev.kind]++; if (pend === C.zones.indexOf(ev.zone)) { judgedRetry++; pend = -1; } }
      if (lap >= 1 && k >= 0 && at[k] !== lap && C.rel(C.zones[k], q.i) >= C.rel(C.zones[k], C.zones[k].a)) {   // at the apex: back 3 s
        at[k] = lap; const b = RW.back(3); if (b) { RW.restore(V, b.sn); const e2 = C.rewound(); if (e2) cnt[e2.kind]++; rw++; const r = C.zEval[V.q.i]; if (r === k && C.rel(C.zones[k], V.q.i) < C.rel(C.zones[k], C.zones[k].b) - 4) { retried++; pend = k; } ps = V.q.s; continue; } }
      if (ps > T.L * 0.8 && q.s < T.L * 0.2) lap++; ps = q.s; }
    const tot = cnt.late + cnt.good + cnt.early, ok = judgedRetry >= 0.9 * retried && cnt.good >= 0.9 * tot;
    if (!ok) fail++;
    console.log(`line: ${rw} rewinds at the apex, ${retried} landed before the braking point, ${judgedRetry} of those retries judged · verdicts good ${cnt.good} late ${cnt.late} early ${cnt.early} ${ok ? 'OK' : 'FAIL'}`); }
  if (fail) { console.log(fail, 'rewind check(s) failed'); process.exit(1); }
}
if (cmd === 'reverse') {   // reverse and full lock at walking pace: the car must move and turn, never spin: node tools/headless.js reverse [cars]
  const T = M.buildTrack('spa'), ids = process.argv[3] ? process.argv[3].split(',') : M.CARS.map(c => c.id); let fail = 0;
  const mk = (sp) => { const V = new M.Vehicle(sp, T); V.collide = () => {}; V.surfaceAt = () => 'asphalt'; V.reset(1800 * T.L / 7000, 0); V.u = 0; return V; };
  for (const grip of [1, 0.6]) { const env = { grip, abs: true, tc: true, esc: true, autoShift: true, steerAssist: true, slipCap: true, noGrade: true };
    for (const id of ids) { const sp = M.CARS.find(c => c.id === id); if (!sp) { console.log('?', id); continue; }
      // a) hold brake to engage R, then full lock from standstill for 3 s
      let V = mk(sp), t = 0; while (V.gear !== -1 && t < 3) { V.step(1 / 120, { throttle: 0, brake: 1, steer: 0 }, env); t += 1 / 120; }
      const h0 = V.h, x0 = V.x, z0 = V.z; for (t = 0; t < 3; t += 1 / 120) V.step(1 / 120, { throttle: 0, brake: 1, steer: 1 }, env);
      const turn = Math.abs(V.h - h0) * 180 / Math.PI, dist = Math.hypot(V.x - x0, V.z - z0);
      // b) full reverse speed in a straight line, then full lock for 6 s: must keep going backwards (no spin)
      const W = mk(sp); let maxU = -99; for (t = 0; t < 10; t += 1 / 120) { W.step(1 / 120, { throttle: 0, brake: 1, steer: t > 4 ? 1 : 0 }, env); if (t > 4) maxU = Math.max(maxU, W.u); }
      // c) forward, 30 % throttle and full lock from standstill
      const F = mk(sp); for (t = 0; t < 3; t += 1 / 120) F.step(1 / 120, { throttle: 0.3, brake: 0, steer: 1 }, env);
      const ok = turn > 45 && dist > 4 && maxU < -1 && F.u > 1;
      if (!ok) fail++;
      console.log('grip', grip, id.padEnd(13), 'R full lock 3 s: turn', turn.toFixed(0).padStart(4), '° moved', dist.toFixed(1).padStart(5), 'm  · late lock at', (-W.u * 3.6).toFixed(0), 'km/h, worst u', (maxU * 3.6).toFixed(1), ' · fwd lock', (F.u * 3.6).toFixed(1), 'km/h', ok ? 'OK' : 'FAIL'); } }
  if (fail) { console.log(fail, 'reverse check(s) failed'); process.exit(1); }
}
if (cmd === 'barrels') {   // barrel physics: impacts, towers, walls, determinism, cost (exit 1 on failure): node tools/headless.js barrels
  const D = M.TRACK_DEFS.monza, T = M.buildTrack(D), dt = 1 / 240, rad = Math.PI / 180;
  const env = { grip: 1, abs: true, tc: true, esc: true, autoShift: true, steerAssist: true, slipCap: true, noGrade: true };
  const iAt = (sN) => Math.round(sN * T.L / D.nom / T.ds) % T.N, hd = (i) => Math.atan2(T.tx[i], T.tz[i]);
  const pt = (i, d) => [T.x[i] + T.nx[i] * d, T.z[i] + T.nz[i] * d];
  let fail = 0; const check = (ok, txt) => { if (!ok) fail++; console.log((ok ? 'OK   ' : 'FAIL ') + txt); };
  const hash = (W, V) => { let h = 0; const add = (x) => { h = (h * 31 + Math.round(x * 1e9)) % 2147483647; }; for (const b of W.list) for (const k of ['x', 'y', 'z', 'qw', 'qx', 'qy', 'qz', 'vx', 'vy', 'vz', 'wx', 'wy', 'wz']) add(b[k]); if (V) for (const k of ['x', 'z', 'h', 'u', 'v', 'r']) add(V[k]); return h; };
  // a car at `kmh`, heading along the track (+ yaw), coasting straight into what `setup` placed `gap` metres ahead
  const run = (o) => {
    M.DMG.scale = o.dmg === false ? 0 : 1;
    const sp = M.CARS.find(c => c.id === (o.car || 'amg_gt3')), i0 = iAt(o.s || 600), V = new M.Vehicle(sp, T), W = new M.BarrelWorld(T);
    V.reset(i0 * T.ds, o.d || 0, false, hd(i0) + (o.yaw || 0) * rad); V.u = (o.kmh || 0) / 3.6;
    const fx = Math.sin(V.h), fz = Math.cos(V.h), lx = Math.cos(V.h), lz = -Math.sin(V.h), ahead = (a, c) => [V.x + fx * a + lx * c, V.z + fz * a + lz * c];
    o.setup(W, ahead, V, i0);
    const st = W.list.map(b => ({ y0: b.y, x0: b.x, z0: b.z, maxV: 0, maxH: 0, bounce: 0, air: false, vyPrev: 0, sleepAt: -1 }));
    const h0 = V.h; let u0 = V.u, uHit = -1, t = 0, firstHit = -1, maxAw = 0, msMax = 0, msSum = 0, nSt = 0;
    const inp = o.inp || { steer: 0, throttle: o.kmh > 15 ? 0 : 0.18, brake: 0 };
    const brk = Object.assign({}, inp, { throttle: 0, brake: 0.7 });
    while (t < (o.T || 8)) {
      V.step(dt, firstHit > 0 && t - firstHit > 0.4 && o.kmh > 15 && !o.coast ? brk : inp, env);   // the driver brakes after the hit
      const t1 = process.hrtime.bigint(); W.step(dt, [V]); const ms = Number(process.hrtime.bigint() - t1) / 1e6; msMax = Math.max(msMax, ms); msSum += ms; nSt++;
      t += dt; maxAw = Math.max(maxAw, W.stats.awake);
      if (firstHit < 0 && V.barT) { firstHit = t; uHit = V.u; }
      if (firstHit > 0 && uHit >= 0 && t - firstHit >= 0.25) { u0 = uHit + (V.u - V.u); o.du = (uHit - V.u) * 3.6; uHit = -1; }
      W.list.forEach((b, k) => { const s = st[k], v = Math.hypot(b.vx, b.vy, b.vz); if (s.g0 == null) s.g0 = s.y0 - W.ground(s.x0, s.z0).e; s.maxV = Math.max(s.maxV, v); s.maxVh = Math.max(s.maxVh || 0, Math.hypot(b.vx, b.vz)); if (!b.sleep) s.maxH = Math.max(s.maxH, b.y - W.ground(b.x, b.z).e - s.g0);
        if (s.vyPrev < -1 && b.vy > 0.5 && b.touch) s.bounce++; s.vyPrev = b.vy; if (b.sleep && s.sleepAt < 0 && t > 0.1) s.sleepAt = t; if (!b.sleep) s.sleepAt = -1; });
      if (o.snapAt && Math.abs(t - o.snapAt) < dt / 2) o.snap = { w: W.snap(), v: M.rwCopy(Object.fromEntries(Object.entries(V).filter(([k]) => !['spec', 'P', 'T'].includes(k)))), t };
    }
    const dist = W.list.map((b, k) => Math.hypot(b.x - st[k].x0, b.z - st[k].z0));
    const tilt = W.list.map(b => { const a = { qw: b.qw, qx: b.qx, qy: b.qy, qz: b.qz }; const y = 1 - 2 * (a.qx * a.qx + a.qz * a.qz); return Math.acos(Math.max(-1, Math.min(1, y))) / rad; });
    return { V, W, st, dist, tilt, du: o.du != null ? o.du : 0, dyaw: (V.h - h0) / rad, firstHit, maxAw, msMax, msAvg: msSum / nSt, dmg: V.dmg.total, hash: hash(W, V) };
  };
  const one = (type, a, c) => (W, ahead) => { const p = ahead(a, c); W.tower(type || 'plastic', p[0], p[1], 1); };
  const fmt = (r, k) => `barrel ${(r.st[k].maxV * 3.6).toFixed(0)} km/h max, ${r.st[k].maxH.toFixed(2)} m up, ${r.st[k].bounce} bounces, rests ${r.dist[k].toFixed(1)} m away (tilt ${r.tilt[k].toFixed(0)}°)${r.st[k].sleepAt > 0 ? ', asleep at ' + r.st[k].sleepAt.toFixed(1) + ' s' : ', still moving'}`;
  console.log('--- car into barrels (Monza main straight, coasting into them, braking 0.4 s after the hit, damage on)');
  // 1) 80 km/h, front corner: the barrel leaves at an angle, the car yaws a little
  { const r = run({ kmh: 80, setup: one('plastic', 12, 0.95) }), b = r.W.list[0], ang = Math.atan2((b.x - r.st[0].x0) * Math.cos(r.V.h) - (b.z - r.st[0].z0) * Math.sin(r.V.h), (b.x - r.st[0].x0) * Math.sin(r.V.h) + (b.z - r.st[0].z0) * Math.cos(r.V.h)) / rad;
    console.log(`80 km/h, GT3 front-left corner: ${fmt(r, 0)}, leaves ${ang.toFixed(0)}° off the car's path; car -${r.du.toFixed(1)} km/h in the hit, yaw ${r.dyaw.toFixed(2)}°, damage ${(r.dmg * 100).toFixed(1)} %`);
    check(r.st[0].maxV < 80 / 3.6 * 1.45 && r.st[0].maxV > 80 / 3.6 * 0.6 && Math.abs(ang) > 5 && r.du > 0.2 && r.du < 6, '80 km/h corner hit: barrel faster than 0.6x and below 1.45x the car, deflected, car loses 0.2-6 km/h'); }
  // 2) 150 km/h frontal, GT3 and F1 (raked nose: lifts the barrel more)
  for (const car of ['amg_gt3', 'w17']) { const r = run({ car, kmh: 150, setup: one('plastic', 14, 0) });
    console.log(`150 km/h frontal, ${car}: ${fmt(r, 0)}; car -${r.du.toFixed(1)} km/h in the hit, yaw ${r.dyaw.toFixed(2)}°, damage ${(r.dmg * 100).toFixed(1)} %`);
    check(r.st[0].maxV < 150 / 3.6 * 1.45 && r.st[0].maxH > 0.3 && r.st[0].maxH < 25 && r.du < 8 && r.du > 0.5, `150 km/h ${car}: flies (>0.3 m), no explosion (< 1.45x car speed, < 25 m high), car loses 0.5-8 km/h in the hit`); }
  // 3) walking pace push: the barrel is pushed or tipped, never thrown
  { const r = run({ kmh: 8, setup: one('plastic', 3, 0), T: 6, inp: { steer: 0, throttle: 0, brake: 0 } });
    console.log(`8 km/h push, GT3: ${fmt(r, 0)}; car now ${(r.V.u * 3.6).toFixed(1)} km/h`);
    check(r.st[0].maxV < 8 / 3.6 * 1.5 && r.st[0].maxH < 0.45, 'push at 8 km/h: barrel never faster than 12 km/h nor above 0.45 m (pushed / tipped, not thrown)'); }
  // 4) tower of 4 left alone: stays up, asleep, no drift
  { const r = run({ kmh: 0, T: 10, setup: (W, ahead) => { const p = ahead(30, 0); W.tower('plastic', p[0], p[1], 4); for (const b of W.list) W.wake(b); }, inp: { steer: 0, throttle: 0, brake: 1 } });
    const drift = Math.max(...r.dist), sl = r.W.list.every(b => b.sleep), sink = r.W.list[3].y - r.st[3].y0;
    console.log(`tower of 4 untouched 10 s: sideways drift ${(drift * 1000).toFixed(1)} mm, top barrel ${(sink * 1000).toFixed(1)} mm (placed with 2 mm gaps), tilt ${Math.max(...r.tilt).toFixed(2)}°, all asleep ${sl} (at ${Math.max(...r.st.map(s => s.sleepAt)).toFixed(2)} s)`);
    check(drift < 0.01 && Math.abs(sink) < 0.015 && sl, 'tower of 4 stands still (< 1 cm) and sleeps'); }
  // 5) tower of 4 hit at the base at 30 km/h: collapses on its own (no script), nothing explodes
  { const r = run({ kmh: 30, T: 10, setup: (W, ahead) => { const p = ahead(10, 0.3); W.tower('plastic', p[0], p[1], 4); } });
    const fell = r.W.list.slice(1).filter((b, k) => b.y < r.st[k + 1].y0 - 0.4).length, vmax = Math.max(...r.st.map(s => s.maxVh)), asleep = r.W.list.filter(b => b.sleep).length;
    console.log(`tower of 4 hit at 30 km/h: ${fell}/3 upper barrels fell, fastest ${(vmax * 3.6).toFixed(0)} km/h horizontally (falling adds speed), spread ${Math.max(...r.dist).toFixed(1)} m, ${asleep}/4 asleep after 10 s; car -${r.du.toFixed(1)} km/h`);
    check(fell === 3 && vmax < 30 / 3.6 * 1.6, 'tower collapses (3/3 upper barrels down), no barrel faster than 1.6x the car horizontally'); }
  // 5b) the same tower at 100 km/h: how high do the barrels go above where they stood
  { const r = run({ kmh: 100, T: 8, setup: (W, ahead) => { const p = ahead(14, 0.3); W.tower('plastic', p[0], p[1], 4); } });
    const up = r.st.map(s => s.maxH), vmax = Math.max(...r.st.map(s => s.maxVh));
    console.log(`tower of 4 hit at 100 km/h: rise above the start per barrel ${up.map(h => h.toFixed(1)).join(' / ')} m, fastest ${(vmax * 3.6).toFixed(0)} km/h horizontally; car -${r.du.toFixed(1)} km/h, damage ${(r.dmg * 100).toFixed(1)} %`);
    check(Math.max(...up) < 6 && vmax < 100 / 3.6 * 1.6, 'tower at 100 km/h: no barrel rises more than 6 m, none faster than 1.6x the car'); }
  // 6) pyramid 3-2-1 at 60 km/h
  { const r = run({ kmh: 60, T: 10, setup: (W, ahead, V) => { const p = ahead(12, 0); W.pyramid('plastic', p[0], p[1], V.h, 3); } });
    const vmax = Math.max(...r.st.map(s => s.maxV)), hmax = Math.max(...r.st.map(s => s.maxH));
    console.log(`pyramid 3-2-1 at 60 km/h: fastest ${(vmax * 3.6).toFixed(0)} km/h, highest ${hmax.toFixed(2)} m, spread ${Math.max(...r.dist).toFixed(1)} m, ${r.W.list.filter(b => b.sleep).length}/6 asleep; car -${r.du.toFixed(1)} km/h, damage ${(r.dmg * 100).toFixed(1)} %`);
    check(vmax < 60 / 3.6 * 1.6, 'pyramid: no barrel faster than 1.6x the car'); }
  // 7) attenuator: 2x3 water barrels (80 kg each) at 100 km/h: the car feels it
  { const r = run({ kmh: 100, T: 6, setup: (W, ahead, V) => { const p = ahead(14, 0); W.grid('water', p[0], p[1], V.h, 2, 3); } });
    console.log(`2x3 water barrels at 100 km/h: car -${r.du.toFixed(1)} km/h, yaw ${r.dyaw.toFixed(1)}°, damage ${(r.dmg * 100).toFixed(1)} %, fastest barrel ${(Math.max(...r.st.map(s => s.maxV)) * 3.6).toFixed(0)} km/h`);
    check(r.du > 8 && r.du < 60, 'water barrels: the car loses 8-60 km/h in the hit'); }
  // 8) a barrel thrown at a concrete wall: rebound with its own restitution
  { const i = iAt(300), W = new M.BarrelWorld(T), bl = T.barL[i], p = pt(i, bl - 2); W.tower('plastic', p[0], p[1], 1); const b = W.list[0]; W.wake(b);
    b.vx = T.nx[i] * 15; b.vz = T.nz[i] * 15; b.y += 0.0; let vin = 0, vout = 0;
    for (let t = 0; t < 1.5; t += dt) { const vn = b.vx * T.nx[i] + b.vz * T.nz[i]; if (vn > 0) vin = Math.max(vin, vn); W.step(dt, []); const v2 = b.vx * T.nx[i] + b.vz * T.nz[i]; if (v2 < 0) vout = Math.max(vout, -v2); }
    const typ = ['armco', 'concrete', 'tyres'][T.btL[i]];
    console.log(`plastic barrel at ${vin.toFixed(1)} m/s into the ${typ} wall: rebounds at ${vout.toFixed(1)} m/s (ratio ${(vout / vin).toFixed(2)}; material e = ${M.BARREL_TYPES.plastic && 0.3})`);
    check(vout / vin > 0.1 && vout / vin < 0.5, 'barrel rebound off concrete between 0.1 and 0.5 of the impact speed'); }
  // 9) determinism: same impact twice -> bit-identical; snapshot mid-impact, restore, replay -> identical
  { const o = { kmh: 150, setup: one('plastic', 14, 0.4), T: 4, coast: true }, a = run(o), b = run(o);
    const o2 = Object.assign({}, o, { snapAt: 2.0 }); const c = run(o2), sn = o2.snap;
    const V = c.V, W = c.W; for (const k in sn.v) V[k] = M.rwCopy(sn.v[k], V[k]); W.restore(sn.w);
    for (let t = sn.t; t < 4 - dt / 2; t += dt) { V.step(dt, { steer: 0, throttle: 0, brake: 0 }, env); W.step(dt, [V]); }
    const h3 = hash(W, V);
    check(a.hash === b.hash && h3 === c.hash, `determinism: run twice ${a.hash === b.hash ? 'identical' : 'DIFFERENT'}, snapshot at 2 s + replay ${h3 === c.hash ? 'identical' : 'DIFFERENT'}`); }
  // 10) cost: 4 towers of 4 + a pyramid knocked over at once
  { const r = run({ kmh: 120, T: 6, setup: (W, ahead, V) => { for (let k = 0; k < 4; k++) { const p = ahead(14 + k * 3, (k - 1.5) * 0.7); W.tower('plastic', p[0], p[1], 4); } const p = ahead(30, 0); W.pyramid('plastic', p[0], p[1], V.h, 4); } });
    console.log(`cost with ${r.W.list.length} barrels (${r.maxAw} awake at most): ${r.msAvg.toFixed(3)} ms per step on average, ${r.msMax.toFixed(2)} ms worst (240 steps/s)`);
    check(r.msAvg < 0.5, 'cost: under 0.5 ms per step on average'); }
  // 11) the circuits: the pit-wall attenuator sits off the racing surface on every track
  { for (const id of Object.keys(M.TRACK_DEFS)) { const T2 = M.buildTrack(M.TRACK_DEFS[id]), W = new M.BarrelWorld(T2); M.placeBarrels(W, T2, 'real');
      let bad = 0, n = W.list.length; for (const b of W.list) { const q = T2.project(b.x, b.z, -1); const d = q.d; if (d < q.wl && d > -q.wr) bad++; }
      // settle 3 s: nothing may move more than 2 cm (placed on the ground, not inside a wall)
      for (const b of W.list) W.wake(b); const x0 = W.list.map(b => [b.x, b.y, b.z]); for (let t = 0; t < 3; t += dt) W.step(dt, []);
      const mv = W.list.reduce((m, b, k) => Math.max(m, Math.hypot(b.x - x0[k][0], b.y - x0[k][1], b.z - x0[k][2])), 0);
      check(bad === 0 && mv < 0.02 && (n > 0 || id === 'monaco'), `${id.padEnd(14)} attenuator: ${n} barrels, ${bad} on the racing surface, settle ${(mv * 100).toFixed(1)} cm`); } }
  if (fail) { console.log(fail, 'barrel check(s) failed'); process.exit(1); }
}
if (cmd === 'walls') {   // car into each barrier type: speed kept, rebound, peak deceleration, yaw, damage: node tools/headless.js walls [old]
  const dt = 1 / 240, rad = Math.PI / 180, TR = {}, WDBG = process.env.WDBG;
  if (process.argv[3] === 'old') Object.assign(M.BARRIER_MAT, { concrete: { e: 0.2, mu: 0.35 }, armco: { e: 0.12, mu: 0.35, scrape: 0.38 }, tyres: { e: 0.12, mu: 0.35, scrape: 0.7 } });
  const env = { grip: 1, abs: true, tc: true, esc: true, autoShift: true, steerAssist: true, slipCap: true, noGrade: true };
  // a stretch of 60 m with the same barrier type on that side, nearly straight, away from the pits and escape roads
  // a stretch of 44 m with the same barrier type on that side, close to the asphalt (the car hits it on tarmac, not after a grass run-off),
  // nearly straight, away from the pits; searched on every circuit
  const find = (T, typ, side, len, kMax) => { const bt = side > 0 ? T.btL : T.btR, bar = side > 0 ? T.barL : T.barR, wd = side > 0 ? T.wl : T.wr, w = Math.round(len / T.ds);
    for (let i = w + 5; i < T.N - w; i++) { let ok = true; for (let k = -w; k <= w && ok; k++) { const j = i + k; if (bt[j] !== typ || T.pitSep[j] || Math.abs(T.k[j]) > kMax || T.project(T.x[j] + T.nx[j] * side * (bar[j] + 2), T.z[j] + T.nz[j] * side * (bar[j] + 2), -1).pc === T.project(T.x[j] + T.nx[j] * side * (bar[j] + 2), T.z[j] + T.nz[j] * side * (bar[j] + 2), -1).pc || (T.esc && T.esc.near(T.x[j] + T.nx[j] * side * bar[j], T.z[j] + T.nz[j] * side * bar[j])[0] < T.esc.hw + 25)) ok = false; } if (ok) return i; } return -1; };
  const where = (typ) => { for (const [len, kMax] of [[22, 0.004], [12, 0.012]]) for (const id of Object.keys(M.TRACK_DEFS)) { const T = TR[id] || (TR[id] = M.buildTrack(M.TRACK_DEFS[id])); for (const side of [1, -1]) { const i = find(T, typ, side, len, kMax); if (i >= 0) return { T, i, side, id }; } } return null; };
  for (const [name, typ] of [['concrete', 1], ['armco', 0], ['tyres', 2]]) {
    const W0 = where(typ); if (!W0) { console.log(name, 'not found'); continue; } const { T, i, side, id } = W0;
    for (const [kmh, ang] of [[80, 30], [150, 10], [50, 90], [150, 90]]) {
      M.DMG.scale = 1; T.resetBarriers();
      const sp = M.CARS.find(c => c.id === 'amg_gt3'), V = new M.Vehicle(sp, T), bar = side > 0 ? T.barL[i] : T.barR[i];
      V.surfaceAt = () => 'asphalt';   // the run-off is asphalt here: only the barrier is measured
      const gap = ang >= 89 ? 5 : 2.5, back = ang >= 89 ? 0 : gap / Math.tan(ang * rad), i0 = (i - Math.round(back / T.ds) + T.N) % T.N;
      V.reset(i0 * T.ds, side * (bar - gap - 2.3), false, Math.atan2(T.tx[i0], T.tz[i0]) + side * ang * rad); V.u = kmh / 3.6;
      let t = 0, out = 0, hit = -1, v0 = V.u, vHit = 0, d01 = 0, exitV = -1, v1 = -1, yaw = 0;
      while (t < 2.5) { V.step(dt, { steer: 0, throttle: 0, brake: 0 }, env); t += dt;
        const fx = Math.sin(V.h), fz = Math.cos(V.h), lx = Math.cos(V.h), lz = -Math.sin(V.h), vx = V.u * fx + V.v * lx, vz = V.u * fz + V.v * lz, sp = Math.hypot(vx, vz);
        const vd = (vx * V.q.nx + vz * V.q.nz) * side;   // + = towards the wall
        if (V.impactT > 0.49 && hit < 0) { hit = t; vHit = sp; }
        if (hit > 0 && t - hit <= 0.1 + 1e-9) d01 = (vHit - sp) / (t - hit + dt) / 9.81;
        if (hit > 0 && t - hit < 0.8) out = Math.max(out, -vd);
        const clear = (side > 0 ? V.q.bl : V.q.br) - side * V.q.d - (sp > 0 ? 1.1 : 0);
        if (hit > 0 && exitV < 0 && t - hit > 0.05 && clear > 0.25) exitV = sp;
        if (hit > 0 && v1 < 0 && t - hit >= 1) v1 = sp;
        if (hit > 0 && Math.abs(t - hit - 0.5) < dt / 2) yaw = V.r / rad;
        if (process.env.WDBG && WDBG === name + kmh + ang && Math.round(t / dt) % 12 === 0) console.log(t.toFixed(2), 'd', V.q.d.toFixed(2), 'bl', (side > 0 ? V.q.bl : -V.q.br).toFixed(2), 'u', (V.u * 3.6).toFixed(0), 'v', V.v.toFixed(1), 'vd', vd.toFixed(1), 'imp', V.impactT.toFixed(2), 'scr', (V.scrapeT || 0).toFixed(2), 'r', (V.r / rad).toFixed(0), 'dead', V.dmg.dead); }
      console.log(`${(name + ' ' + id).padEnd(20)} ${String(kmh).padStart(3)} km/h ${String(ang).padStart(2)}°: ${hit < 0 ? 'NO HIT ' : ''}${(v1 * 3.6).toFixed(0).padStart(3)} km/h 1 s after the hit, ${ang >= 45 ? '' : exitV < 0 ? 'stays on the wall, ' : 'leaves it at ' + (exitV * 3.6).toFixed(0) + ' km/h, '}rebound ${out.toFixed(1)} m/s, ${d01.toFixed(1)} g mean over 0.1 s, yaw ${yaw.toFixed(0)}°/s at +0.5 s, damage ${(V.dmg.total * 100).toFixed(0)} %`);
    }
  }
}
