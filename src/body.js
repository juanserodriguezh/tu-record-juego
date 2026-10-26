// ============================================================================
//  ROAD / SUPER / HYPER / GT3 / TRACK BODIES  (the NASCAR keeps buildClosed)
//  A lofted shell whose heights are tied to the wheel size (so hoods, fenders
//  and beltlines sit where they do on real cars of each layout), rounded nose
//  and tail, real wheel arches, a greenhouse built from the glass angles, and
//  lights / intakes / vents laid directly on the body surface.
// ============================================================================
// A = windshield base (fraction of the body length from the tail); gh = greenhouse height;
// rakeF / rakeR = run per rise of windshield / rear glass; roof = roof length (m);
// fo = share of the overhang ahead of the front axle.
const CAR_STYLES = {
  hatch: { A: .755, gh: .48, rakeF: 1.4, roof: 1.15, glassDrop: .42, hoodHigh: .8, noseY: .8, ffF: .12, ffR: .12, tumble: .82, rcF: .44, rcR: .3, taper: .02, clr: .135, bulge: .016, mid: 0, doors: 4, tail: 'hatch', fo: .53, rn: .2, dropN: .06, edgeN: .09, pf: .36 },
  sedan: { A: .665, gh: .46, rakeF: 1.45, roof: 1.05, rakeR: 1.35, hoodHigh: .75, noseY: .82, ffF: .12, ffR: .12, tumble: .84, rcF: .36, rcR: .3, taper: .015, clr: .13, bulge: .02, mid: 0, doors: 4, tail: 'notch', fo: .47, rn: .18, dropN: .05, edgeN: .08, pf: .33 },
  pony: { A: .64, gh: .41, rakeF: 1.6, roof: .72, rakeR: 2.2, hoodHigh: .7, noseY: .78, ffF: .12, ffR: .13, tumble: .78, rcF: .36, rcR: .3, taper: .02, clr: .13, bulge: .024, mid: 0, doors: 2, tail: 'fast', fo: .45, rn: .2, dropN: .06, edgeN: .09, pf: .36 },
  gt: { A: .6, gh: .4, rakeF: 1.75, roof: .55, rakeR: 2.45, hoodHigh: .45, noseY: .66, ffF: .12, ffR: .14, tumble: .75, rcF: .48, rcR: .4, taper: .05, clr: .12, bulge: .024, mid: 0, doors: 2, tail: 'fast', fo: .47, rn: .26, dropN: .085, edgeN: .12, pf: .44 },
  mid: { A: .71, gh: .37, rakeF: 1.85, roof: .5, rakeR: 3.0, hoodHigh: .2, noseY: .6, ffF: .12, ffR: .17, tumble: .72, rcF: .52, rcR: .38, taper: .07, clr: .11, bulge: .028, mid: 1, doors: 2, tail: 'engine', fo: .52, rn: .3, dropN: .1, edgeN: .13, pf: .46 },
  hyper: { A: .72, gh: .345, rakeF: 1.95, roof: .45, rakeR: 3.2, hoodHigh: .1, noseY: .54, ffF: .115, ffR: .16, tumble: .7, rcF: .56, rcR: .4, taper: .09, clr: .1, bulge: .032, mid: 1, doors: 2, tail: 'engine', fo: .5, rn: .32, dropN: .1, edgeN: .13, pf: .48 }
};
// per-model proportions only (layout, hood length, roof height / length, canopy width)
const CAR_BODY = {
  civic_r: { s: 'hatch' },
  duster: { s: 'hatch', A: .71, gh: .64, rakeF: 1.3, roof: 1.77, glassDrop: .36, hoodHigh: .9, noseY: .9, rcF: .34, rcR: .22, taper: .01, clr: .21, bulge: .012, ffF: .2, ffR: .2, tumble: .9, rn: .16, dropN: .1, edgeN: .1, pf: .3, tail: 'hatch', fo: .5, lamp: 1 },
  gtr_nismo: { gh: .46, A: .63, rakeF: 1.5, roof: .8, rakeR: 1.7, tumble: .8, hoodHigh: .45, vents: 1 },
  viper: { A: .52, roof: .42, rakeR: 2.1, noseY: .57 }, amg_gtr: { A: .56, vents: 1 }, db11: { A: .58 }, victor: { A: .55, vents: 1 },
  wiesmann_mf5: { A: .55, roof: .45 }, alfieri: { A: .58 }, gr_supra: { A: .6, roof: .42 }, ftype_svr: { A: .59 },
  conti_gt: { gh: .44, roof: .72, rakeR: 2.1, tumble: .8, hoodHigh: .45 },
  mclaren_f1: { canopy: .62 }, czinger_21c: { canopy: .52 }, valkyrie: { canopy: .62, gh: .33 }, t50: { canopy: .7 },
  p935: { tailExt: .28 }, speedtail: { tailExt: .25, canopy: .8 }, countach: { rakeF: 2.1 }, sp3: { rakeF: 2.0 },
  // Chiron: taller W16 hypercar - windshield well forward, long rounded roof, long engine deck, slim lamps, bar tail
  chiron: { A: .65, gh: .37, rakeF: 1.76, roof: .6, rakeR: 3.1, noseY: .69, hoodHigh: .1, ffF: .17, ffR: .27, canopy: .86, tumble: .72, rcF: .36, pf: .3, rn: .2, dropN: .02, edgeN: .04, taper: .05, bulge: .036, fo: .55, lamp: -1, tail: 'engine', tailBar: 1 }
};
function buildBody(out, spec, liv) {
  const { kit, interior, a, b, L, W, H } = out;
  const race = !!spec.race, gt3 = spec.body === 'gt3', track = spec.body === 'track', hyperB = spec.body === 'hyper';
  const baseKey = spec.body === 'hatch' ? 'hatch' : spec.body === 'muscle' ? 'pony' : spec.body === 'gt' ? 'gt' : spec.body === 'super' ? 'mid' : gt3 ? (spec.wf >= 0.47 ? 'gt' : 'mid') : 'hyper';
  const ov = CAR_BODY[spec.id] || {};
  const st = Object.assign({}, CAR_STYLES[ov.s || baseKey], ov);
  // deterministic per-model variation (lamp / intake graphics, small proportion shifts)
  let hs = 7; for (const ch of spec.id) hs = (hs * 31 + ch.charCodeAt(0)) % 100003;
  const vr = (k) => ((Math.sin(hs * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const chiron = spec.model === 'chiron';
  const lampV = st.lamp != null ? st.lamp : Math.floor(vr(1) * 3), tailV = st.tailBar != null ? 2 : Math.floor(vr(2) * 3), intakeV = Math.floor(vr(3) * 3);
  if (spec.model !== 'chiron') { st.roof *= 0.94 + 0.12 * vr(4); st.noseY *= 0.97 + 0.06 * vr(5); }
  const sporty = race || track || st.mid || hyperB;
  const R = race ? 0.345 : st.mid ? 0.355 : 0.345, Ra = R + 0.04, kR = R / 0.35;
  const big = st.mid || track;
  const wF = race ? 0.3 : big ? 0.27 : 0.25, wR = race ? 0.32 : big ? 0.33 : 0.28;
  const clr = race ? 0.075 : track ? 0.09 : st.clr;
  const over = L - spec.wb;
  const zF = a + over * st.fo, zR = -b - over * (1 - st.fo) - (st.tailExt || 0), Lb = zF - zR;
  const tOf = (z) => (z - zR) / Lb;
  const flare = gt3 ? 0.075 : track ? 0.05 : st.mid ? 0.02 : 0.012;
  const halfW0 = W / 2 - flare - st.bulge - 0.004;
  const xin = W / 2 - Math.max(wF, wR) - 0.12;
  // ---- key heights / stations
  const yA = H - st.gh;
  const fenderF = 2 * R + st.ffF, fenderR = 2 * R + st.ffR;
  const hoodA = lerp(fenderF - 0.04, yA - 0.05, st.hoodHigh);
  const noseY = Math.min(st.noseY * kR, hoodA - 0.05);
  const zA = zR + st.A * Lb, zB = zA - st.rakeF * st.gh, zC = zB - st.roof;
  let yD, zD;
  if (st.tail === 'hatch') { yD = H - st.glassDrop; zD = zR + 0.14; }
  else if (st.tail === 'engine') { yD = yA + 0.06; zD = zC - st.rakeR * (H - yD); }
  else { yD = yA + 0.03; zD = zC - st.rakeR * (H - yD); }
  zD = Math.max(zD, zR + (st.tail === 'hatch' ? 0.14 : 0.32));
  const yTail = st.tail === 'hatch' ? yD - 0.03 : yD - 0.045;
  const pts = [[zR, yTail]];
  if (zD > zR + 0.45) pts.push([zR + 0.3, yTail + 0.015]);
  pts.push([zD, yD], [zA, yA]);
  if (a < zA + 0.15) pts.push([a + 0.3, hoodA - 0.02]); else pts.push([a, hoodA]);
  pts.push([zF - 0.2, noseY], [zF, noseY - 0.03]);
  pts.sort((p, q) => p[0] - q[0]);
  // ---- end rounding (profile and plan)
  const endG = (z, zEnd, len, front) => { const u = front ? (z - (zEnd - len)) / len : ((zEnd + len) - z) / len; if (u <= 0) return 0; const v = Math.min(1, u); return 1 - Math.sqrt(1 - v * v); };
  const rn = st.rn, rt = 0.2;
  const gN = (z) => endG(z, zF, rn, true), gT = (z) => endG(z, zR, rt, false);
  const topC = (z) => curveAt(pts, z) - gN(z) * st.dropN - gT(z) * 0.06;
  const archY = (z) => { let best = null; for (const za of [a, -b]) { const d = (z - za) / Ra; if (Math.abs(d) < 1) { const y = clr + (R + Ra - clr) * Math.sqrt(1 - d * d); if (best == null || y > best) best = y; } } return best; };
  const bump = (d, w) => { const u = Math.abs(d) / w; return u >= 1 ? 0 : Math.cos(u * Math.PI / 2) ** 2; };
  const topE = (z) => {
    const c = curveAt(pts, z) - 0.018;
    let e = c;
    const bf = bump(z - a, Ra + 0.5), br = bump(z + b, Ra + (st.mid ? 0.75 : 0.55));
    if (fenderF > c) e = Math.max(e, c + (fenderF - c) * bf);
    if (fenderR > c) e = Math.max(e, c + (fenderR - c) * br);
    const ay = archY(z); if (ay != null) e = Math.max(e, ay + 0.075);
    return e - gN(z) * st.edgeN - gT(z) * 0.09;
  };
  const yBot = (z) => clr + (race ? 0.04 : 0.07) * smoothstep(zF - 0.6, zF, z) + (race ? 0.05 : 0.09) * smoothstep(zR + 0.5, zR, z) + gN(z) * 0.06 + gT(z) * (race ? 0.04 : 0.08);
  const halfW = (z) => {
    let hw = halfW0;
    const dF = zF - z, dR = z - zR;
    if (dF < st.rcF) { const u = 1 - dF / st.rcF; hw -= st.rcF * st.pf * (1 - Math.sqrt(Math.max(0, 1 - u * u))); }
    if (dR < st.rcR) { const u = 1 - dR / st.rcR; hw -= st.rcR * 0.45 * (1 - Math.sqrt(Math.max(0, 1 - u * u))); }
    hw *= 1 - st.taper * smoothstep(0.62, 1.0, tOf(z));
    for (const za of [a, -b]) hw += flare * bump(z - za, Ra + 0.35);
    return hw;
  };
  const crown = 0.03;
  // cross-section: 14 points on the left half (bottom centre -> side -> top centre), mirrored
  const secCache = new Map();
  // cabin (tub) extent: from behind the seats to under the dashboard
  const tub0 = st.canopy && st.canopy < 1 ? 11 : 10;
  const cabF = (z) => smoothstep(zC - 0.28, zC - 0.12, z) * (1 - smoothstep(zA - 0.32, zA - 0.16, z));
  const secPts = (z) => {
    const key = Math.round(z * 1e4); const hit = secCache.get(key); if (hit) return hit;
    const yb = yBot(z), hw = halfW(z), ay = archY(z), fy = ay != null ? Math.max(ay, yb) : yb;
    const yE = Math.max(topE(z), fy + 0.07), yc = topC(z), rs = 0.045, bl = st.bulge;
    const w = clamp((fy - yb) / 0.25, 0, 1);
    let sill = lerp(yb + 0.13, fy + (yE - fy) * 0.22, w), sh = lerp(yE - 0.13, fy + (yE - fy) * 0.58, w);
    if (sill > sh - 0.05) { sill = fy + (yE - fy) * 0.28; sh = fy + (yE - fy) * 0.62; }
    sill = Math.max(sill, fy + rs * 0.7 + 0.006);
    const xE = hw - 0.055;
    const topY = (x) => { const f = smoothstep(0.45, 1, x / xE); return (yc - crown * (x / xE) ** 2) * (1 - f) + yE * f; };
    const r = [[0, yb], [xin, yb], [xin + 0.003, fy], [hw - 0.03 - rs, fy], [hw - 0.03 - rs * 0.25, fy + rs * 0.7],
      [hw - 0.03, sill], [hw, sill + (sh - sill) * 0.45], [hw + bl, sh], [hw - 0.004, sh + (yE - sh) * 0.62], [xE, yE],
      [xE * 0.72, topY(xE * 0.72)], [0.27, topY(0.27)], [0.07, topY(0.07)], [0, topY(0)]];
    // cabin tub: under the greenhouse the top of the shell drops to the floor (door cards + floor pan)
    const cf = cabF(z);
    if (cf > 0) { const yF = yb + 0.3; for (let k = tub0; k <= 13; k++) r[k][1] = lerp(r[k][1], yF, cf); if (tub0 === 10) r[10][0] = lerp(r[10][0], xE - 0.2, cf); }
    secCache.set(key, r);
    return r;
  };
  const ring = (z) => { const Lh = secPts(z), r = Lh.slice(); for (let k = 12; k >= 1; k--) r.push([-Lh[k][0], Lh[k][1]]); return r; };
  // fractional section index -> [x, y, nx, ny] (left half, outward normal)
  const at = (z, p) => {
    const S = secPts(z), i = clamp(Math.floor(p), 0, 12), f = clamp(p - i, 0, 1), P = S[i], Q = S[i + 1];
    const tx = Q[0] - P[0], ty = Q[1] - P[1], l = Math.hypot(tx, ty) || 1;
    return [lerp(P[0], Q[0], f), lerp(P[1], Q[1], f), ty / l, -tx / l];
  };
  const zs = [];
  for (let z = zR; z < zF - 1e-6;) {
    zs.push(z);
    const nearArch = Math.min(Math.abs(z - a), Math.abs(z + b)) < Ra + 0.06, nearEnd = z < zR + rt + 0.1 || z > zF - rn - 0.1;
    const onHood = z > zA - 0.2 && z < zF - rn; // finer rings where the bonnet camera looks
    z += nearArch ? 0.04 : nearEnd ? 0.035 : onHood ? 0.06 : 0.12;
  }
  zs.push(zF);
  const P1 = out.col1, P2 = out.col2, BK = C3(BLACK), CB = C3(CARBON), UB = C3('#0e0f10'), DK = C3('#0d0e10'), RK = C3('#17181b');
  const pat = liv.pattern, between = (z) => z < a - Ra - 0.05 && z > -b + Ra + 0.05;
  const IC = C3('#1c1d20');
  const zSplit = zA - (zA - zC) * 0.78; // two-tone split just behind the doors
  const tone = (z) => chiron && pat !== 'dos' && z < zSplit ? P2 : P1;
  const tagBody = (s, z) => {
    const inArch = archY(z) != null;
    if (chiron) {
      if (s >= tub0 - 1 && cabF(z) > 0.001) return ['cabin', IC];
      if (s >= tub0 - 1 && z > zD + 0.03 && z < zA - 0.015) return ['trim', IC];
      if (s === 0) return ['trim', UB];
      if (s <= 2) return ['trim', BK];
      if (s === 3) return inArch ? ['trim', BK] : ['trim', RK];
      return ['paint', tone(z)];
    }
    if (s >= tub0 - 1 && cabF(z) > 0.001) return ['cabin', IC]; // cabin tub under the greenhouse
    if (s >= tub0 - 1 && z > zD + 0.03 && z < zA - 0.015) return ['trim', IC];
    if (s === 0) return ['trim', UB];
    if (s <= 2) return ['trim', BK];
    if (s === 3) return inArch ? ['trim', BK] : sporty ? ['trim', race || track ? CB : RK] : ['paint', P1];
    if (s === 4) return sporty && !inArch && between(z) ? ['trim', race || track ? CB : RK] : ['paint', pat === 'banda' && between(z) ? P2 : P1];
    if (s === 5 || s === 6) return ['paint', pat === 'banda' && between(z) ? P2 : P1];
    if (s === 11 && pat === 'franjas') return ['paint', P2];
    return ['paint', P1];
  };
  const faceY0 = yBot(zF), faceY1 = topE(zF), tailY0 = yBot(zR), tailY1 = topE(zR);
  loftShell(kit, zs, ring, 26, (k) => (k <= 12 ? k : 25 - k), tagBody,
    { outer: ['paint', P1], inner: ['paint', P1], center: [0, faceY0 + (faceY1 - faceY0) * 0.5], scale: 0.55, bulge: 0.016 },
    { outer: ['paint', P1], inner: ['paint', P1], center: [0, tailY0 + (tailY1 - tailY0) * 0.45], scale: 0.5, bulge: 0.018 });

  // ---- surface patches (mirrored on both sides unless centred)
  const patch = (key, col, z0, z1, pA, pB, opt) => {
    opt = opt || {};
    const nz = opt.nz || 5, np = opt.np || 3, off = opt.off || 0.004, gb = new GeoBuilder(false), c = col && col.isColor ? col : C3(col || '#ffffff');
    const grid = [];
    for (let i = 0; i <= nz; i++) {
      const u = i / nz, z = lerp(z0, z1, u), p0 = typeof pA === 'function' ? pA(u) : pA, p1 = typeof pB === 'function' ? pB(u) : pB, row = [];
      for (let j = 0; j <= np; j++) { const q = at(z, lerp(p0, p1, j / np)); row.push([q[0] + q[2] * off, q[1] + q[3] * off, z, q[2], q[3]]); }
      grid.push(row);
    }
    for (const side of opt.center ? [1] : [1, -1]) {
      for (let i = 0; i < nz; i++) for (let j = 0; j < np; j++) {
        const m = (p) => [p[0] * side, p[1], p[2]];
        let A0 = m(grid[i][j]), B0 = m(grid[i + 1][j]), C0 = m(grid[i + 1][j + 1]), D0 = m(grid[i][j + 1]);
        const ux = B0[0] - A0[0], uy = B0[1] - A0[1], uz = B0[2] - A0[2], vx = D0[0] - A0[0], vy = D0[1] - A0[1], vz = D0[2] - A0[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz;
        const g = grid[i][j];
        if (nx * g[3] * side + ny * g[4] < 0) { const t = B0; B0 = D0; D0 = t; }
        gb.quad(A0, B0, C0, D0, c);
      }
    }
    kit.put(key, gb.build(), null);
  };
  // headlights: dark lens wrapping the front corner + LED signature
  const nz0 = zF - rn;
  if (lampV === -1) { // slim lamp high on each front corner: dark lens + LED line
    patch('gloss', C3('#141a21'), zF - 0.2, zF - 0.012, (u) => lerp(8.3, 7.9, u), (u) => lerp(9.3, 9.6, u), { nz: 6, np: 4, off: 0.005 });
    patch('light', C3('#f2f7ff'), zF - 0.17, zF - 0.03, (u) => lerp(8.55, 8.2, u), (u) => lerp(8.72, 8.42, u), { nz: 5, np: 1, off: 0.009 });
    patch('light', C3('#e6eef7'), zF - 0.16, zF - 0.035, (u) => lerp(8.95, 8.75, u), (u) => lerp(9.1, 9.0, u), { nz: 5, np: 1, off: 0.009 });
  } else if (lampV === 0) { // slim, swept back
    patch('gloss', C3('#161c23'), zF - 0.36, zF - 0.02, (u) => lerp(8.75, 8.25, u), (u) => lerp(9.75, 10.55, u), { nz: 7, np: 4, off: 0.005 });
    patch('light', C3('#f2f7ff'), zF - 0.33, zF - 0.05, (u) => lerp(9.45, 10.05, u), (u) => lerp(9.62, 10.3, u), { nz: 6, np: 1, off: 0.009 });
  } else if (lampV === 1) { // large unit reaching down the fender
    patch('gloss', C3('#161c23'), zF - 0.32, zF - 0.02, (u) => lerp(8.2, 7.8, u), (u) => lerp(9.9, 10.5, u), { nz: 7, np: 5, off: 0.005 });
    patch('light', C3('#f2f7ff'), zF - 0.28, zF - 0.06, (u) => lerp(8.35, 8.0, u), (u) => lerp(8.55, 8.25, u), { nz: 6, np: 1, off: 0.009 });
    patch('light', C3('#e4ecf6'), zF - 0.14, zF - 0.05, 9.2, 9.9, { nz: 2, np: 2, off: 0.009 });
  } else { // thin horizontal band near the tip
    patch('gloss', C3('#161c23'), zF - 0.22, zF - 0.015, (u) => lerp(8.7, 8.4, u), (u) => lerp(10.3, 11.0, u), { nz: 5, np: 5, off: 0.005 });
    patch('light', C3('#f2f7ff'), zF - 0.2, zF - 0.035, (u) => lerp(8.8, 8.5, u), (u) => lerp(10.2, 10.9, u), { nz: 4, np: 1, off: 0.008 });
  }
  // front grille / intake on the fascia (trapezoid, wider at the bottom) + slim upper grille on front-engined cars
  if (chiron) {
    // tall central intake: straight sides, rounded top, slatted dark mesh inside a satin surround
    const fh = faceY1 - faceY0, g = new GeoBuilder(false), zg = zF + 0.024, y0 = faceY0 + 0.035, hgt = Math.min(0.34, fh - 0.03);
    const outline = (grow) => { const P = [], hw0 = 0.15 + grow, r = hw0, yt = y0 + hgt - r + grow;
      P.push([hw0, y0 - grow]); for (let k = 0; k <= 16; k++) { const t = k / 16 * Math.PI; P.push([Math.cos(t) * r, yt + Math.sin(t) * r * 0.85]); } P.push([-hw0, y0 - grow]); return P; };
    const fan = (P, zz, c) => { const cy = P.reduce((q, p) => q + p[1], 0) / P.length; for (let k = 0; k < P.length; k++) { const p0 = P[k], p1 = P[(k + 1) % P.length]; g.tri([0, cy, zz], [p0[0], p0[1], zz], [p1[0], p1[1], zz], c); } };
    fan(outline(0.022), zg - 0.004, C3('#c3c8cd')); fan(outline(0), zg, DK);
    for (let k = 1; k < 7; k++) { const yy = y0 + k * hgt / 7.5; g.quad([-0.14, yy, zg + 0.002], [0.14, yy, zg + 0.002], [0.14, yy + 0.007, zg + 0.002], [-0.14, yy + 0.007, zg + 0.002], C3('#30343a')); }
    kit.put('trim', g.build(), null);
  } else {
    const hwF = halfW(zF), fh = faceY1 - faceY0, g = new GeoBuilder(false), zg = zF + 0.018;
    const gw0 = hwF * (intakeV === 1 ? 0.78 : 0.66), gw1 = gw0 * (intakeV === 2 ? 0.8 : 0.9), gy0 = faceY0 + fh * 0.1, gy1 = faceY0 + fh * (st.mid || hyperB ? 0.42 : 0.5);
    g.quad([-gw0, gy0, zg], [gw0, gy0, zg], [gw1, gy1, zg], [-gw1, gy1, zg], DK);
    if (!st.mid && !hyperB) { const uy0 = faceY0 + fh * 0.62, uy1 = faceY0 + fh * 0.78, uw = hwF * 0.42; g.quad([-uw, uy0, zg - 0.004], [uw, uy0, zg - 0.004], [uw * 0.92, uy1, zg - 0.008], [-uw * 0.92, uy1, zg - 0.008], DK); }
    kit.put('trim', g.build(), null);
  }
  // lower front corner intakes
  if (chiron) patch('trim', DK, zF - 0.3, zF - 0.012, (u) => lerp(4.4, 4.1, u), (u) => lerp(7.0, 7.7, u), { nz: 5, np: 4, off: 0.004 });
  else if (sporty || intakeV !== 0) patch('trim', DK, zF - 0.24, zF - 0.012, (u) => lerp(4.6, 4.3, u), (u) => lerp(6.3, 6.8, u), { nz: 4, np: 3, off: 0.004 });
  // front lip
  kit.box('trim', race || track ? CB : BK, halfW(zF - 0.08) * 1.8, 0.018, 0.14 + (race || track ? 0.12 : 0), 0, faceY0 - 0.005, zF - 0.06 - (race || track ? 0.06 : 0));
  // bonnet vents
  if (!chiron && (st.vents || track || hyperB || (gt3 && st.mid))) patch('trim', DK, a + 0.02, a + 0.36, 10.15, 11.2, { nz: 4, np: 3, off: 0.004 });
  // tail lights: wrap-around corner units (+ bar across the tail on some)
  const tl0 = zR + 0.004, tl1 = zR + 0.17 + (tailV === 1 ? 0.06 : 0);
  if (tailV === 0) patch('brake', null, tl0, tl1, 7.8, (u) => lerp(10.4, 9.3, u), { nz: 4, np: 4, off: 0.005 });
  else if (tailV === 1) patch('brake', null, tl0, tl1, (u) => lerp(7.6, 7.9, u), (u) => lerp(9.6, 8.8, u), { nz: 4, np: 4, off: 0.005 });
  else patch('brake', null, tl0, tl1, 8.2, (u) => lerp(9.8, 9.0, u), { nz: 4, np: 3, off: 0.005 });
  const hwT = halfW(zR), barY = tailY1 - 0.07;
  if (tailV !== 1 || st.mid || hyperB) kit.box('brake', null, hwT * (tailV === 2 ? 1.75 : 1.3), tailV === 2 ? 0.035 : 0.022, 0.012, 0, barY, zR - 0.004);
  // side intakes ahead of the rear wheels (mid-engine), front fender vents (hyper / race)
  if (chiron) {
    patch('trim', DK, -b + Ra + 0.05, zSplit - 0.03, (u) => lerp(5.0, 5.6, u * u), (u) => lerp(7.9, 8.6, Math.sqrt(u)), { nz: 8, np: 4, off: 0.005 });
  } else if (st.mid) {
    if (intakeV === 0) patch('trim', DK, -b + Ra + 0.1, -b + Ra + 0.62, (u) => lerp(5.3, 4.6, u), (u) => lerp(7.1, 7.5, u), { nz: 5, np: 3, off: 0.005 });
    else if (intakeV === 1) patch('trim', DK, -b + Ra + 0.08, -b + Ra + 0.72, (u) => lerp(6.1, 5.3, u), (u) => lerp(7.3, 7.6, u), { nz: 5, np: 2, off: 0.005 });
    else patch('trim', DK, -b + Ra + 0.1, -b + Ra + 0.45, 4.6, 7.3, { nz: 3, np: 3, off: 0.005 });
  }
  if (hyperB || race || track) patch('trim', DK, a - Ra - 0.36, a - Ra - 0.05, (u) => lerp(6.2, 6.6, u), 7.5, { nz: 3, np: 2, off: 0.004 });

  // ---- greenhouse
  const roofY = H;
  const roofAt = (z) => {
    if (z >= zB) { const u = (z - zB) / (zA - zB); return lerp(roofY, yA, u) + 0.035 * Math.sin(u * Math.PI) * (1 - u * 0.5); }
    if (z <= zC) { const u = clamp((zC - z) / Math.max(0.05, zC - zD), 0, 1); return lerp(roofY, yD, st.tail === 'hatch' ? u : Math.pow(u, 0.85)) + (st.tail === 'hatch' ? 0.03 : 0.05) * Math.sin(u * Math.PI); }
    const m = (z - (zB + zC) / 2) / ((zB - zC) / 2); return roofY - 0.015 * m * m;
  };
  const canopy = st.canopy || 1;
  const cabHW = (z) => (halfW(z) - 0.065) * (canopy < 1 ? 0.86 : 1);
  const ringCab = (z) => {
    const yb = topE(z) - 0.035, yr = Math.max(roofAt(z), yb + 0.03), hb = cabHW(z), ht = hb * st.tumble * canopy;
    const Lh = [[0, yb], [hb, yb], [hb * 0.975, yb + (yr - yb) * 0.48], [ht + 0.035, Math.max(yb + 0.01, yr - 0.045)], [ht - 0.02, yr], [ht * 0.45, yr + 0.012], [0, yr + 0.016]];
    const r = Lh.slice(); for (let k = 5; k >= 1; k--) r.push([-Lh[k][0], Lh[k][1]]);
    return r;
  };
  const zc = []; for (let z = zD; z < zA; z += 0.06) zc.push(z); zc.push(zA);
  for (const zz of [zB, zC]) if (!zc.some(v => Math.abs(v - zz) < 0.02)) zc.push(zz);
  zc.sort((p, q) => p - q);
  const G = C3(GLASS), ROOF = pat === 'dos' || chiron ? P2 : P1, PILLAR = race || (hyperB && !chiron) ? BK : ROOF;
  const zBp = st.doors === 4 ? zB - (zB - zC) * 0.42 : zB - (zB - zC) * 0.62, zCp = zC - 0.02;
  const quarter = st.tail === 'engine' ? 0.18 : st.tail === 'hatch' ? 0.35 : 0.24;
  const tagCab = (s, z) => {
    if (s === 0) return [null, null];
    if (z > zB + 0.01) return s >= 4 ? ['gloss', G] : s === 3 ? ['paint', PILLAR] : ['gloss', G];
    if (z >= zC - 0.01) { if (s >= 3) return ['paint', ROOF]; return Math.abs(z - zBp) < 0.045 || (st.doors === 4 && Math.abs(z - zCp) < 0.03) ? ['trim', BK] : ['gloss', G]; }
    if (s >= 4) return st.tail === 'engine' && z < zC - 0.36 ? ['trim', C3('#1d1f22')] : ['gloss', G];
    if (s === 3) return ['paint', ROOF];
    return z > zC - quarter ? ['gloss', G] : ['paint', ROOF];
  };
  loftShell(kit, zc, ringCab, 12, (k) => (k <= 5 ? k : 11 - k), tagCab, null, null);
  if (st.tail === 'engine') for (let k = 0; k < 4; k++) { const zz = zC - 0.42 - k * 0.09; if (zz > zD + 0.06) kit.box('trim', C3('#0b0c0e'), cabHW(zz) * st.tumble * 1.5, 0.008, 0.022, 0, roofAt(zz) + 0.012, zz, -0.2); }

  // ---- mirrors (pods on stalks), door shut lines and handles
  for (const s of [1, -1]) {
    const mz = zA - 0.17, my = topE(mz) + 0.11, mx = cabHW(mz) + 0.13;
    kit.put('paint', loft([{ z: mz + 0.08, w: 0.03, y0: my - 0.01, y1: my + 0.012, x: s * (mx - 0.02), n: 2.4 }, { z: mz, w: 0.15, y0: my - 0.042, y1: my + 0.04, x: s * mx, n: 3 }, { z: mz - 0.055, w: 0.16, y0: my - 0.045, y1: my + 0.043, x: s * mx, n: 3.5 }], 12), pat === 'dos' ? P2 : P1);
    kit.box('gloss', C3('#7f93a6'), 0.13, 0.07, 0.006, s * mx, my, mz - 0.058);
    kit.bar('trim', BK, [s * (mx - 0.06), my - 0.03, mz - 0.01], [s * (cabHW(mz) + 0.005), my - 0.075, mz + 0.035], 0.024);
  }
  // bonnet / frunk panel gaps (seen from the bonnet camera)
  { const hz0 = zA + 0.04, hz1 = zF - rn - 0.02;
    if (hz1 > hz0 + 0.3) {
      patch('trim', C3('#2a2c30'), hz0, hz1, 9.95, 10.02, { nz: 8, np: 1, off: 0.002 });
      patch('trim', C3('#2a2c30'), hz1 - 0.006, hz1 + 0.006, 9.97, 12.95, { nz: 1, np: 6, off: 0.002 });
    } }
  const lines = [zA - 0.06, zBp - 0.02]; if (st.doors === 4) lines.push(zCp - 0.12);
  for (const zl of lines) patch('trim', C3('#1b1c1f'), zl - 0.005, zl + 0.005, 5.05, 8.9, { nz: 1, np: 5, off: 0.003 });
  patch('trim', C3('#26282c'), zBp + 0.06, zBp + 0.19, 7.25, 7.55, { nz: 1, np: 1, off: 0.005 });
  if (st.doors === 4) patch('trim', C3('#26282c'), zCp - 0.02, zCp + 0.1, 7.25, 7.55, { nz: 1, np: 1, off: 0.005 });

  // ---- rear: diffuser fins, exhausts, plates, wipers
  const yRb = yBot(zR);
  kit.box('trim', CB, W * 0.62, 0.02, 0.36, 0, yRb - 0.005, zR + 0.16, 0.22);
  if (sporty) for (let k = -2; k <= 2; k++) kit.box('trim', CB, 0.012, 0.09, 0.3, k * W * 0.12, yRb + 0.03, zR + 0.13, 0.22);
  const nEx = spec.cyl >= 8 ? 2 : 1;
  for (let e = 0; e < nEx; e++) { const s = nEx === 1 ? 1 : e ? 1 : -1; for (const k of (spec.cyl >= 10 ? [0, 1] : [0])) kit.cyl('gloss', C3(race || track ? '#2a2c2f' : CHROME), 0.042, 0.045, 0.1, 12, s * (W * 0.25 + k * 0.095) * (st.mid ? 0.55 : 1), yRb + 0.08, zR + 0.02, Math.PI / 2, 0, 0); }
  if (!race && !track) {
    if (!chiron) kit.box('trim', C3('#d9dcdf'), 0.5, 0.11, 0.01, 0, faceY0 + 0.08, zF + 0.028);
    kit.box('trim', C3('#d9dcdf'), 0.5, 0.11, 0.01, 0, tailY0 + (tailY1 - tailY0) * 0.42, zR - 0.014);
    for (const s of [1, -0.1]) kit.bar('trim', BK, [s * cabHW(zA) * 0.05, yA + 0.012, zA - 0.07], [s * cabHW(zA) * 0.05 + 0.5, yA + 0.025, zA - 0.13], 0.012);
  }
  // ---- SUV extras (Duster): black lower cladding and arch trim, skid plates, roof rails, chrome grille bar
  if (spec.suv) {
    const PL = C3('#2a2c2f'), SK = C3('#9ea3a8');
    patch('trim', PL, zR + 0.32, zF - 0.3, 3.4, 5.5, { nz: 40, np: 3, off: 0.005 });
    for (const za of [a, -b]) patch('trim', PL, za - Ra - 0.02, za + Ra + 0.02, 3.4, 6.0, { nz: 28, np: 3, off: 0.006 });
    kit.box('trim', SK, W * 0.5, 0.012, 0.3, 0, yBot(zF) + 0.02, zF - 0.12, 0.08);
    kit.box('trim', SK, W * 0.46, 0.012, 0.26, 0, yBot(zR) + 0.03, zR + 0.12, -0.08);
    kit.box('trim', CHROME ? C3(CHROME) : SK, W * 0.5, 0.022, 0.012, 0, faceY0 + (faceY1 - faceY0) * 0.56, zF + 0.02);
    const nR = 12, zr0 = zB - 0.08, zr1 = zC + 0.05;
    for (const s of [1, -1]) { for (let k = 0; k < nR; k++) { const za2 = lerp(zr0, zr1, (k + 0.5) / nR); kit.box('trim', C3('#1d1e20'), 0.034, 0.03, Math.abs(zr1 - zr0) / nR + 0.01, s * cabHW(za2) * 0.93, roofAt(za2) + 0.02, za2); }
      for (const zq of [zr0 - 0.1, (zr0 + zr1) / 2, zr1 + 0.1]) kit.box('trim', SK, 0.03, 0.03, 0.05, s * cabHW(zq) * 0.93, roofAt(zq) + 0.006, zq); }
  }
  // ---- wings / spoilers
  const deckZ = zR + 0.3, deckY = topC(deckZ), wing = spec.wing || 0;
  if (wing >= 2) {
    const wy = deckY + (race ? 0.34 : 0.26), wz = zR + 0.22;
    const wc = race || track ? ['trim', CB] : ['paint', P2];
    kit.box(wc[0], wc[1], W * (race ? 0.96 : 0.88), 0.028, 0.32, 0, wy, wz, 0.1);
    kit.box(wc[0], wc[1], W * (race ? 0.96 : 0.88), 0.02, 0.13, 0, wy + 0.055, wz - 0.17, 0.5);
    for (const s of [1, -1]) {
      kit.box(wc[0], wc[1], 0.02, 0.26, 0.46, s * W * (race ? 0.48 : 0.44), wy - 0.06, wz - 0.03);
      kit.bar('trim', CB, [s * W * 0.2, topC(wz + 0.25) - 0.01, wz + 0.25], [s * W * 0.2, wy + 0.02, wz - 0.02], 0.03);
    }
  } else if (wing === 1 || st.tail === 'notch' || st.tail === 'fast' || st.tail === 'engine') {
    kit.box('paint', pat === 'dos' ? P2 : P1, hwT * 1.75, 0.022, 0.1, 0, topC(zR + 0.06) + 0.012, zR + 0.05, -0.3);
  }
  if (st.tail === 'hatch') kit.box('trim', CB, cabHW(zD + 0.3) * 1.6, 0.025, 0.2, 0, roofAt(zC - 0.05) + 0.005, zC - 0.12, 0.12);
  // dorsal fin: grows out of the roof / engine cover and follows it down to the tail (no gap underneath)
  if (spec.fin) {
    const fb = new GeoBuilder(false), z0 = spec.finLow ? zB - 0.05 : zC + 0.1, z1 = zR + 0.12, n = spec.finLow ? 16 : 10, t = spec.finLow ? 0.02 : 0.012;
    const baseY = (z) => (z >= zD ? roofAt(z) + (z > zC ? 0.012 : 0) : topC(z) - 0.01) - 0.01;
    for (let i = 0; i < n; i++) {
      const za = lerp(z0, z1, i / n), zb = lerp(z0, z1, (i + 1) / n);
      const topL = spec.finLow ? (u) => -1 : (u) => lerp(roofAt(zC) - 0.03, baseY(z1) + 0.15, u);
      const mh = spec.finLow ? 0.035 : 0.015;
      const A = baseY(za), Bq = baseY(zb), topA = Math.max(A + mh, topL(i / n)), topB = Math.max(Bq + mh, topL((i + 1) / n));
      fb.quad([t, A, za], [t, Bq, zb], [t, topB, zb], [t, topA, za], P2);
      fb.quad([-t, A, za], [-t, topA, za], [-t, topB, zb], [-t, Bq, zb], P2);
      fb.quad([t, topA, za], [t, topB, zb], [-t, topB, zb], [-t, topA, za], P2);
    }
    kit.put('paint', spec.finLow ? (() => { const g = fb.build(), c = g.attributes.color, col = ROOF; for (let i = 0; i < c.count; i++) c.setXYZ(i, col.r, col.g, col.b); return g; })() : fb.build(), null);
  }
  // ---- race numbers
  if (spec.num) {
    out.decalMat = decalMat('n' + spec.num, () => numberTex(spec.num));
    const zn = (zA + zBp) / 2 - 0.1, q = at(zn, 6.6), sz = 0.46;
    for (const s of [1, -1]) kit.plane('decal', sz, sz, s * (q[0] + 0.012), q[1], zn, 0, s * Math.PI / 2, 0);
    kit.plane('decal', 0.56, 0.56, 0, roofY + 0.022, (zB + zC) / 2, -Math.PI / 2, 0, 0);
  }
  out.caliper = st.mid || hyperB ? (vr(6) < 0.5 ? '#c9151b' : '#d9a300') : race || track ? '#d4a100' : '#2c2e32';
  addWheels(out, R, wF, wR, W / 2 - wF / 2 - 0.035, W / 2 - wR / 2 - 0.035, race, race ? 0.7 : chiron ? 0.78 : 0.72);
  // ---- cameras / cockpit
  const dx = spec.rhd ? -W * 0.2 : W * 0.2;
  const eye = new THREE.Vector3(dx, roofY - (race ? 0.2 : spec.suv ? 0.46 : 0.21), zB - (spec.suv ? 0.3 : 0.47));
  out.eye = eye;
  const hz = Math.min(zA + 0.45, zF - 0.55);
  // onboard: bonnet camera (TV-style, just ahead of the windshield) on every closed car
  out.cams = { onboard: new THREE.Vector3(0, topC(hz) + 0.19, hz), onPitch: -0.05, onLabel: 'capó', chaseDist: 3.8 + L * 0.62, chaseH: 1.25 + H * 0.45 };
  if (out.lite) return;
  buildCabin(out, {
    E: eye, dx, yA, zA, zB, zC, zBp, roofY, clr, race, track, sporty, W,
    halfW, hb: cabHW(zA - 0.1), hr: cabHW(zB) * st.tumble * canopy, cabHW, yF: clr + 0.3,
    pal: spec.suv ? { top: '#26272a', face: '#2e3034', low: '#222326', head: '#5d5f64', pil: '#34363a', acc: '#a9aeb4', rim: '#25262a', grip: '#2a2b2e' } : chiron ? { top: '#15171b', face: '#1d2230', low: '#171a22', head: '#262c3a', pil: '#1c2029', acc: '#3d7be0', rim: '#15171b', grip: '#1a1d24' } : null, spine: chiron, roundWheel: chiron ? true : undefined
  });
  if (race) out.hk.put('paint', new THREE.SphereGeometry(0.13, 14, 10), C3(spec.helmet || '#f2c230'), out.hk.xf(dx, eye.y - 0.02, eye.z - 0.08));
}

// ---------------------------------------------------------------------------
//  Cockpit (first-person view only): dashboard, binnacle + live cluster,
//  steering wheel with gloved hands, pillars, headliner, mirror, door cards and
//  a faint windshield. Built around the driver's eye so every car frames alike.
// ---------------------------------------------------------------------------
function cabinMaterials() {
  if (CM.cab) return;
  CM.cab = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 });
  CM.cabSatin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55 });
  CM.cabGloss = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.1 });
  CM.cabLit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0.0, envMapIntensity: 0.25, emissive: 0x2a2b2e }); // headliner / pillars (lit by the glass area)
  // rear-view mirror: sky over a dark road, a static reflection
  CM.mirrorGlass = new THREE.MeshBasicMaterial({ map: canvasTex(128, 32, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, '#9fb6cf'); gr.addColorStop(0.5, '#c9d6e2'); gr.addColorStop(0.56, '#46503f'); gr.addColorStop(0.62, '#3a3d40'); gr.addColorStop(1, '#2a2c2e');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 32);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 17, 128, 1);
  }) });
  // windshield: a tint band along the top edge and a faint sheen
  CM.windshield = new THREE.MeshBasicMaterial({ map: canvasTex(8, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(40,58,78,0.62)'); gr.addColorStop(0.13, 'rgba(40,58,78,0.34)'); gr.addColorStop(0.2, 'rgba(120,140,160,0.06)'); gr.addColorStop(1, 'rgba(160,175,190,0.035)');
    g.clearRect(0, 0, 8, 128); g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
  }), transparent: true, depthWrite: false, side: THREE.DoubleSide });
}
function buildCabin(out, C) {
  carMaterials(); cabinMaterials();
  const { E, dx, yA, zA, zB, zC, zBp, roofY, race, track, sporty, halfW, hb, hr, yF } = C;
  const ik = new Kit(), I = out.interior;
  const col = (h) => C3(h);
  const pal = C.pal || {};
  const cTop = col(pal.top || (race ? '#161719' : '#1b1c1f')), cFace = col(pal.face || (race ? '#1c1d20' : '#27282c')), cLow = col(pal.low || '#1d1e21');
  const cHead = col(pal.head || (race ? '#35363a' : '#6a6c71')), cPil = col(pal.pil || (race ? '#242528' : '#3d3f44')), cCarbon = col('#202125');
  const cMetal = col('#8d9197'), cAcc = col(pal.acc || (race || track ? '#d8ad00' : sporty ? '#b52a20' : '#77797e'));
  // extrude a (z, y) profile across x0..x1
  const prismX = (key, c, x0, x1, pts) => {
    const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false, curveSegments: 1 });
    g.rotateY(-Math.PI / 2); g.translate(x1, 0, 0); return ik.put(key, g, c);
  };
  const _o = new THREE.Object3D();
  const rod = (key, c, p0, p1, r0, r1, seg) => {
    const A = new THREE.Vector3(...p0), B = new THREE.Vector3(...p1), len = A.distanceTo(B);
    const g = new THREE.CylinderGeometry(r1, r0, len, seg || 8).rotateX(Math.PI / 2);
    _o.position.copy(A).add(B).multiplyScalar(0.5); _o.lookAt(B); _o.updateMatrix(); return ik.put(key, g, c, _o.matrix);
  };
  // ---- dashboard: full width, windshield base back to the driver, rounded rear edge, knee recess
  const zDr = E.z + 0.6, yDt = yA + 0.035, dHW = halfW(zDr) - 0.105;
  prismX('cab', cFace, -dHW, dHW, [[zA + 0.02, yA - 0.03], [zA - 0.015, yA + 0.004], [zDr + 0.1, yDt], [zDr + 0.035, yDt - 0.006], [zDr + 0.006, yDt - 0.028], [zDr, yDt - 0.06], [zDr + 0.012, yDt - 0.12], [zDr + 0.17, yF + 0.26], [zDr + 0.15, yF - 0.03], [zA + 0.02, yF - 0.03]]);
  prismX('cab', cTop, -dHW + 0.004, dHW - 0.004, [[zA - 0.02, yA + 0.007], [zDr + 0.1, yDt + 0.003], [zDr + 0.035, yDt - 0.003], [zDr + 0.03, yDt - 0.012], [zDr + 0.1, yDt - 0.01], [zA - 0.02, yA - 0.004]]);
  // trim strip across the face (carbon on sporty cars, satin metal otherwise) + contrast stitch on the edge
  ik.box(sporty ? 'cab' : 'satin', sporty ? cCarbon : cMetal, dHW * 2 - 0.02, 0.026, 0.012, 0, yDt - 0.095, zDr + 0.004);
  ik.box('cab', cAcc, dHW * 2 - 0.03, 0.003, 0.004, 0, yDt - 0.011, zDr + 0.025);
  // air vents
  for (const vx of [dHW - 0.13, -(dHW - 0.13), 0.11, -0.11]) {
    ik.box('cab', col('#0c0d0f'), 0.12, 0.042, 0.012, vx, yDt - 0.055, zDr - 0.001);
    for (let k = -1; k <= 1; k++) ik.box('satin', cMetal, 0.112, 0.004, 0.014, vx, yDt - 0.055 + k * 0.012, zDr - 0.004);
  }
  // binnacle visor + cheeks over the cluster (driver side); the scanned wheel carries its own display -> no binnacle (it hid the view)
  const SW0 = typeof GLBS !== 'undefined' && !!GLBS.sw;
  if (!SW0) prismX('cab', cTop, dx - 0.18, dx + 0.18, [[zDr + 0.095, yDt + 0.098], [zDr + 0.31, yDt + 0.02], [zDr + 0.31, yDt - 0.004], [zDr + 0.115, yDt + 0.083]]);
  if (!SW0) for (const sx of [-0.18, 0.165]) prismX('cab', cTop, dx + sx, dx + sx + 0.015, [[zDr + 0.095, yDt + 0.098], [zDr + 0.31, yDt + 0.02], [zDr + 0.31, yDt - 0.012], [zDr + 0.09, yDt - 0.012]]);
  if (!SW0) ik.box('cab', col('#08090a'), 0.33, 0.1, 0.02, dx, yDt + 0.04, zDr + 0.125);
  // centre: infotainment tablet (road) or switch panel (race / track)
  if (C.spine) { /* minimalist: no screen on the dash, the satin spine carries the controls */ }
  else if (!race && !track) {
    const tab = new THREE.BoxGeometry(0.24, 0.14, 0.014); _o.position.set(-dx * 0.08, yDt + 0.07, zDr + 0.13); _o.lookAt(E.x, E.y, E.z); _o.updateMatrix();
    ik.put('gloss', tab, col('#0a0b0d'), _o.matrix);
    if (!CM.navScreen) CM.navScreen = new THREE.MeshBasicMaterial({ map: canvasTex(256, 150, (g) => {
      g.fillStyle = '#0d141c'; g.fillRect(0, 0, 256, 150);
      g.strokeStyle = '#223140'; g.lineWidth = 5; for (const [a, b, c, d] of [[0, 30, 256, 60], [40, 0, 90, 150], [150, 0, 210, 150], [0, 120, 256, 95]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
      g.strokeStyle = '#3d8bff'; g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath(); g.moveTo(128, 150); g.bezierCurveTo(126, 110, 150, 90, 170, 70); g.bezierCurveTo(190, 50, 180, 20, 150, 8); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(128, 118); g.lineTo(138, 140); g.lineTo(128, 134); g.lineTo(118, 140); g.closePath(); g.fill();
      g.fillStyle = 'rgba(8,12,17,0.85)'; g.fillRect(0, 0, 256, 26); g.fillStyle = '#c8d3de'; g.font = "600 15px 'Saira Condensed', sans-serif"; g.fillText('Spa-Francorchamps', 10, 18);
    }) });
    const nv = new THREE.Mesh(new THREE.PlaneGeometry(0.225, 0.126), CM.navScreen); nv.position.copy(_o.position); nv.quaternion.copy(_o.quaternion); nv.translateZ(0.008); I.add(nv);
  } else {
    ik.box('cab', cCarbon, 0.3, 0.13, 0.02, 0, yDt - 0.2, zDr + 0.07, -0.25, 0, 0);
    const bc = ['#d23a2a', '#e8b400', '#2f7de1', '#2fbf5b', '#e6e6e6', '#d23a2a'];
    for (let k = 0; k < 6; k++) ik.box('gloss', col(bc[k]), 0.028, 0.02, 0.012, -0.1 + k * 0.04, yDt - 0.19, zDr + 0.054, -0.25, 0, 0);
  }
  // steering column shroud
  // ---- headliner, header, sun visors, rear-view mirror
  ik.box('lit', cHead, hr * 2, 0.02, zB - zC + 0.06, 0, roofY - 0.03, (zB + zC) / 2);
  ik.box('lit', cHead, hr * 2, 0.05, 0.09, 0, roofY - 0.048, zB - 0.02);
  if (!race) for (const sx of [1, -1]) ik.box('lit', cHead, Math.min(0.36, hr * 0.8), 0.014, 0.17, sx * hr * 0.48, roofY - 0.062, zB - 0.12, 0.08, 0, 0);
  ik.box('cab', cTop, 0.018, 0.06, 0.018, 0, roofY - 0.085, zB + 0.03);
  ik.box('cab', cTop, 0.185, 0.058, 0.03, 0, roofY - 0.13, zB + 0.03);
  const mg = new THREE.Mesh(new THREE.PlaneGeometry(0.172, 0.047), CM.mirrorGlass); mg.position.set(0, roofY - 0.13, zB + 0.014); mg.rotation.y = Math.PI; I.add(mg);
  // ---- pillars, door tops and armrests
  for (const s of [1, -1]) {
    rod('lit', cPil, [s * hb * 0.965, yA + 0.005, zA - 0.035], [s * hr * 0.96, roofY - 0.035, zB + 0.005], race ? 0.03 : 0.04, race ? 0.024 : 0.03, 10);
    ik.box('lit', cPil, 0.05, roofY - yA, 0.09, s * C.cabHW(zBp) * 0.93, (roofY + yA) / 2, zBp);
    ik.box('cab', cFace, 0.06, 0.035, zA - zC, s * hb * 0.95, yA - 0.005, (zA + zC) / 2 - 0.05);
    ik.box('cab', cLow, 0.075, 0.05, 0.55, s * (halfW(E.z) - 0.17), yA - 0.17, E.z + 0.18);
    ik.box('satin', cMetal, 0.012, 0.018, 0.1, s * (halfW(E.z) - 0.2), yA - 0.13, E.z + 0.32);
  }
  // centre console
  ik.box('cab', cLow, 0.26, 0.24, zDr - E.z + 0.1, 0, yF + 0.1, (zDr + E.z) / 2 - 0.02);
  // satin centre spine running from the dash top down the console, with four round selector knobs
  if (C.spine) {
    const cS = col('#c3c7cc');
    ik.box('satin', cS, 0.045, yDt - (yF + 0.22), 0.02, 0, (yDt + yF + 0.22) / 2 - 0.01, zDr + 0.02);
    ik.box('satin', cS, 0.045, 0.012, zDr - E.z + 0.05, 0, yF + 0.226, (zDr + E.z) / 2);
    for (let k = 0; k < 4; k++) ik.cyl('satin', col('#d6d9dd'), 0.019, 0.019, 0.03, 14, 0, yDt - 0.1 - k * 0.055, zDr + 0.0, Math.PI / 2, 0, 0);
  }
  ik.cyl('satin', cMetal, 0.012, 0.012, 0.12, 8, 0, yF + 0.27, E.z + 0.2);
  ik.put('cab', new THREE.SphereGeometry(0.03, 12, 8), col('#141416'), ik.xf(0, yF + 0.34, E.z + 0.2));
  // ---- roll cage (race)
  if (race) {
    const cc = col('#6f757b'), cr = 0.015;
    for (const s of [1, -1]) {
      rod('satin', cc, [s * hr * 0.85, roofY - 0.07, E.z - 0.35], [s * hb * 0.86, yF + 0.05, E.z - 0.35], cr, cr);
      rod('satin', cc, [s * hr * 0.85, roofY - 0.07, E.z - 0.35], [s * hr * 0.9, roofY - 0.075, zB - 0.02], cr, cr);
      rod('satin', cc, [s * hr * 0.9, roofY - 0.075, zB - 0.02], [s * hb * 0.9, yA - 0.05, zA - 0.2], cr, cr);
      rod('satin', cc, [s * hb * 0.9, yA - 0.05, zA - 0.2], [s * hb * 0.86, yF + 0.05, zA - 0.25], cr, cr);
    }
    rod('satin', cc, [hr * 0.85, roofY - 0.07, E.z - 0.35], [-hr * 0.85, roofY - 0.07, E.z - 0.35], cr, cr);
    rod('satin', cc, [hr * 0.9, roofY - 0.075, zB - 0.02], [-hr * 0.9, roofY - 0.075, zB - 0.02], cr, cr);
  }
  // ---- windshield (faint, only seen from inside)
  {
    const b0 = hb * 0.97, b1 = hr * 0.95, y0 = yA + 0.012, y1 = roofY - 0.02, z0 = zA - 0.02, z1 = zB + 0.012;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-b0, y0, z0, b0, y0, z0, b1, y1, z1, -b1, y1, z1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const ws = new THREE.Mesh(g, CM.windshield); ws.renderOrder = 5; I.add(ws);
  }
  // ---- live instrument cluster
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const scr = new THREE.MeshBasicMaterial({ map: tex });
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.086), scr); cl.position.set(dx, yDt + 0.034, zDr + 0.112); cl.lookAt(E.x, E.y - 0.03, E.z); if (!SW0) I.add(cl);
  out.dash = { cv, ctx: cv.getContext('2d'), tex, last: 0, style: race || track ? 'race' : 'road', W: 512, H: 160 };
  // ---- steering wheel (tilted column), hands and forearms
  const SWon = typeof GLBS !== 'undefined' && !!GLBS.sw;
  const wy = SWon ? E.y - 0.27 : Math.min(E.y - (race ? 0.31 : 0.335), yA - (race ? 0.15 : 0.175));
  wheelRig(out, { pos: new THREE.Vector3(dx, wy, E.z + (SWon ? 0.6 : race ? 0.5 : 0.53)), tilt: SWon ? 0.3 : 0.38, race: race || track, round: C.roundWheel != null ? C.roundWheel : !race, tex, accent: cAcc, rimCol: pal.rim, gripCol: pal.grip,
    sleeve: race ? out.col1.clone().multiplyScalar(0.8) : new THREE.Color('#2a2f38'), elbowY: E.y - 0.5, elbowZ: E.z + 0.2, elbowX: 0.3 });
  cabinAdd(ik, I);
}

function cabinAdd(k, parent) { for (const [key, mat] of [['cab', CM.cab], ['lit', CM.cabLit], ['satin', CM.cabSatin], ['gloss', CM.cabGloss]]) { const m = k.mesh(key, mat); if (m) parent.add(m); } }
// steering wheel on a tilted column + gloved hands (at ten-to-two) and forearms posed every frame
// o: { pos, tilt, race, round, tex, accent, sleeve, elbowX, elbowY, elbowZ, rimR, column }
function wheelRig(out, o) {
  carMaterials(); cabinMaterials();
  const I = out.interior, col = (h) => C3(h), cMetal = col('#8d9197'), cCarbon = col('#202125');
  const wg = new THREE.Group(); wg.position.copy(o.pos); wg.rotation.x = o.tilt; I.add(wg);
  const sw = new THREE.Group(); wg.add(sw);
  const wk = new Kit(), swk = new Kit(), rimR = o.rimR || (o.round ? 0.18 : 0.15);
  if (o.column !== false && !(typeof GLBS !== 'undefined' && GLBS.sw && o.glbSw !== false)) wk.cyl('cab', col('#1a1b1d'), 0.034, 0.042, 0.3, 12, 0, -0.01, 0.17, Math.PI / 2, 0, 0);
  const SWG = (typeof GLBS !== 'undefined' && GLBS.sw) || null, useSw = !!SWG && o.glbSw !== false;
  if (useSw) o = Object.assign({}, o, { round: false });
  if (useSw) {
    // scanned competition wheel (F1-style): face towards the driver (-z), up = +y; hub at the group origin
    const s = o.swScale || (o.f1 ? 0.95 : 0.85), m = SWG.clone(true);
    m.scale.setScalar(s); m.rotation.set(-Math.PI / 2, Math.PI, 0); m.position.z = -0.012 + 0.0465 * s;
    m.traverse(c => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
    sw.add(m); out.swModel = m;
    // live wheel display (own canvas, drawn by drawDash)
    const cv2 = document.createElement('canvas'); cv2.width = 448; cv2.height = 256;
    const tex2 = new THREE.CanvasTexture(cv2); tex2.colorSpace = THREE.SRGBColorSpace; tex2.anisotropy = 4;
    let acc = '#f6c21c'; { const c = out.col2 || out.col1; if (c && c.getHSL) { const hsl = {}; c.getHSL(hsl); if (hsl.l > 0.28 && hsl.s > 0.2) acc = '#' + c.clone().offsetHSL(0, 0, hsl.l < 0.5 ? 0.12 : 0).getHexString(); } }
    if (out.dash) out.dash.sw = { cv: cv2, ctx: cv2.getContext('2d'), tex: tex2, W: 448, H: 256, acc };
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.104 * s, 0.0595 * s), new THREE.MeshBasicMaterial({ map: tex2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    d.position.set(0, 0.0285 * s, -0.012 - 0.0018); d.rotation.y = Math.PI; sw.add(d);
  } else if (o.round) {
    swk.put('cab', new THREE.TorusGeometry(rimR, 0.019, 10, 40), col(o.rimCol || '#18181a'));
    if (o.gripCol) for (const sx of [1, -1]) swk.put('cab', new THREE.TorusGeometry(rimR, 0.0205, 10, 14, 1.1).rotateZ(sx > 0 ? -0.55 : Math.PI - 0.55), col(o.gripCol));
    swk.box('cab', o.accent || col('#b52a20'), 0.024, 0.044, 0.044, 0, rimR, 0);
    swk.put('cab', new THREE.CylinderGeometry(0.062, 0.07, 0.05, 20).rotateX(Math.PI / 2), col('#1f2023'), swk.xf(0, 0, 0.018));
    swk.put('satin', new THREE.TorusGeometry(0.03, 0.004, 6, 20), cMetal, swk.xf(0, 0.004, -0.008));
    for (const sx of [1, -1]) { swk.box('satin', col('#55585d'), rimR * 0.56, 0.032, 0.018, sx * rimR * 0.62, -0.006, 0.01); swk.box('satin', cMetal, 0.045, 0.1, 0.007, sx * (rimR - 0.04), 0.02, 0.055); }
    swk.box('satin', col('#55585d'), 0.034, rimR * 0.56, 0.018, 0, -rimR * 0.64, 0.01);
    if (o.race && o.tex) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.04), new THREE.MeshBasicMaterial({ map: o.tex })); d.position.set(0, 0.0, -0.01); d.rotation.y = Math.PI; sw.add(d); }
  } else if (o.f1) {
    // single-seater wheel: wide carbon body, grips, big central display, LEDs, buttons and rotaries
    swk.box('cab', cCarbon, 0.23, 0.125, 0.035, 0, -0.005, 0.006);
    for (const sx of [1, -1]) swk.put('cab', new THREE.CapsuleGeometry(0.026, 0.1, 4, 10), col('#141416'), swk.xf(sx * 0.135, -0.01, 0.002, 0, 0, sx * 0.14));
    swk.box('cab', cCarbon, 0.27, 0.02, 0.03, 0, 0.062, 0.006);
    const bc = ['#d23a2a', '#e8b400', '#2f7de1', '#2fbf5b', '#e6e6e6', '#d06bd0'];
    for (let k = 0; k < 6; k++) for (const sx of [1, -1]) swk.put('gloss', new THREE.CylinderGeometry(0.009, 0.009, 0.01, 10).rotateX(Math.PI / 2), col(bc[(k + (sx > 0 ? 0 : 3)) % 6]), swk.xf(sx * (0.088 + (k % 2) * 0.004), 0.04 - k * 0.017, -0.014));
    for (const [kx, kc] of [[-0.048, '#e0782f'], [0, '#d85fa0'], [0.048, '#4ab34f']]) swk.put('gloss', new THREE.CylinderGeometry(0.014, 0.014, 0.012, 14).rotateX(Math.PI / 2), col(kc), swk.xf(kx, -0.05, -0.014));
    for (const sx of [1, -1]) swk.box('satin', cMetal, 0.07, 0.13, 0.008, sx * 0.13, 0.01, 0.055);
    if (o.tex) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.058), new THREE.MeshBasicMaterial({ map: o.tex })); d.position.set(0, 0.018, -0.014); d.rotation.y = Math.PI; sw.add(d); }
  } else {
    swk.box('cab', cCarbon, 0.21, 0.1, 0.03, 0, 0, 0.005);
    for (const sx of [1, -1]) swk.put('cab', new THREE.CapsuleGeometry(0.024, 0.1, 4, 10), col('#161618'), swk.xf(sx * 0.125, -0.005, 0, 0, 0, sx * 0.12));
    swk.box('cab', cCarbon, 0.24, 0.018, 0.022, 0, 0.058, 0.004); swk.box('cab', cCarbon, 0.2, 0.018, 0.022, 0, -0.06, 0.004);
    const bc = ['#d23a2a', '#e8b400', '#2f7de1', '#2fbf5b'];
    for (let k = 0; k < 4; k++) for (const sx of [1, -1]) swk.box('gloss', col(bc[k]), 0.016, 0.016, 0.008, sx * (0.08 - (k % 2) * 0.018), 0.03 - Math.floor(k / 2) * 0.05, -0.013);
    for (const sx of [1, -1]) swk.box('satin', cMetal, 0.06, 0.12, 0.008, sx * 0.12, 0.015, 0.05);
    if (o.tex) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.05), new THREE.MeshBasicMaterial({ map: o.tex })); d.position.set(0, 0.012, -0.012); d.rotation.y = Math.PI; sw.add(d); }
  }
  // hands: articulated gloves (hands.js) wrapped round the grips / rim + two-bone arms solved every frame (main.poseModel)
  cabinAdd(wk, wg); cabinAdd(swk, sw);
  const sleeveM = new THREE.MeshStandardMaterial({ color: (o.sleeve ? new THREE.Color(o.sleeve).multiplyScalar(0.4) : new THREE.Color('#1c2027')), roughness: 0.92, metalness: 0 });
  const gloveC = o.glove || null, accC = (o.sleeve ? new THREE.Color(o.sleeve).multiplyScalar(1.0) : new THREE.Color('#8a8f96'));
  const ws = o.swScale || (o.f1 ? 0.95 : 0.85), Ev = o.pos.y, hs = 0.93;
  const shY = o.elbowY + 0.5 - 0.25 - (o.shDrop || 0), shZ = o.elbowZ - 0.2 - 0.05 - (o.shDrop || 0) * 0.4 + (o.shDz || 0);
  out.arms = [];
  for (const sx of [1, -1]) {
    let C, P, R;
    if (useSw) { R = 0.021 * ws / 0.95; C = new THREE.Vector3(sx * 0.13 * ws / 0.9, -0.025, 0.012); P = new THREE.Vector3(sx * 0.9, 0, -0.3); }
    else if (o.round) { const th = sx > 0 ? 0.42 : Math.PI - 0.42; R = 0.019; C = new THREE.Vector3(Math.cos(th) * rimR, Math.sin(th) * rimR, 0); P = new THREE.Vector3(Math.cos(th) * 0.85, Math.sin(th) * 0.85, -0.4); }
    else { R = 0.026; C = new THREE.Vector3(sx * (o.f1 ? 0.135 : 0.125), -0.01, 0.004); P = new THREE.Vector3(sx * 0.9, 0, -0.3); }
    const H = buildHand(sx > 0 ? 1 : -1, gloveC, accC, !!o.gloveLight); H.root.scale.setScalar(hs);
    placeHand(H, C, P, new THREE.Vector3(0, 0, 1), R, 0.004, hs);
    H.setPose({ R: R / hs, grip: 1, tAb: 0.5, tFl: 0.35 });
    sw.add(H.root);
    const arm = buildArm(sx, sleeveM, H.mats.cuff); I.add(arm.group);
    out.arms.push({ hand: H.wrist, H, arm, sh: new THREE.Vector3(o.pos.x + sx * 0.2, shY, shZ) });
  }
  out.steeringWheel = sw;
  return sw;
}
