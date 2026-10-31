// Headless game core (tracks + cars + physics, no browser): node tools/headless.js accel [ids]  |  node tools/headless.js tyres
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const files = ['data_spa', 'data_monza', 'data_albertpark', 'data_toca', 'data_monaco', 'tracks', 'cars', 'physics', 'damage', 'line_offs', 'ai', 'coach', 'rewind'];
const src = files.map(f => fs.readFileSync(path.join(SRC, f + '.js'), 'utf8').replace(/if \(typeof module[^\n]*\n/, '')).join('\n');
const M = new Function(src + '\nreturn { newTyres, TYRES, buildTrack, Vehicle, CARS, TRACK_DEFS, ACCEL_CAL, LINE_OFFS, lineFromOffsets, wxInit, AIDriver, AI_PROFILES, qssProfile, aiProfile, newDamage, pitStopPlan, PIT_CREW, Coach, coachPlan, COACH, DMG, Rewind, REWIND, rwCopy, MONACO_CITY };')();
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
