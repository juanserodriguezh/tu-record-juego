// Headless game core (tracks + cars + physics, no browser): node tools/headless.js accel [ids]  |  node tools/headless.js tyres
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const files = ['data_spa', 'data_monza', 'data_albertpark', 'data_toca', 'tracks', 'cars', 'physics', 'damage'];
const src = files.map(f => fs.readFileSync(path.join(SRC, f + '.js'), 'utf8').replace(/if \(typeof module[^\n]*\n/, '')).join('\n');
const M = new Function(src + '\nreturn { buildTrack, Vehicle, CARS, TRACK_DEFS, ACCEL_CAL };')();
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
