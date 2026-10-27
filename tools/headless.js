// Headless game core (tracks + cars + physics, no browser): node tools/headless.js accel [ids]  |  node tools/headless.js tyres
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const files = ['data_spa', 'data_monza', 'data_albertpark', 'data_toca', 'tracks', 'cars', 'physics', 'damage', 'line_offs', 'ai'];
const src = files.map(f => fs.readFileSync(path.join(SRC, f + '.js'), 'utf8').replace(/if \(typeof module[^\n]*\n/, '')).join('\n');
const M = new Function(src + '\nreturn { buildTrack, Vehicle, CARS, TRACK_DEFS, ACCEL_CAL, LINE_OFFS, lineFromOffsets, wxInit, AIDriver, AI_PROFILES, qssProfile, aiProfile, newDamage, pitStopPlan, PIT_CREW };')();
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
      if (ai.needReset) { resets++; break; }
      if (ps > T.L * 0.8 && V.q.s < T.L * 0.2) { if (tl != null) laps.push(t - tl); tl = t; } ps = V.q.s; }
    const fly = laps.slice(1), best = fly.length ? Math.min(...fly) : 0;
    console.log(tid.padEnd(12), id.padEnd(13), 'diff', diff, ' qss', fmt(ai.profObj.time), ' laps', laps.map(fmt).join(' '), ' best', fmt(best), ' vmax', (vtop * 3.6).toFixed(0), resets ? ' STUCK' : ''); }
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
