// ============================================================================
//  DAMAGE MODEL (pure logic, shared by the physics and the headless tests)
//
//  Reference points (Assetto Corsa mechanical damage, EA F1 component damage, rFactor 2 / LMU):
//   - damage depends on the ENERGY of the impact (closing speed, mass), where it lands on the car, the direction,
//     what was hit (rigid wall, crushable rail, tyre wall, another car) and what is already broken;
//   - wings / splitters / floors break at small speeds and change the aero balance (front loss = understeer,
//     rear loss = unstable tail); suspension bends under side and corner hits (pull, shake, less grip, a wheel can
//     come off); tyres puncture after cuts or a broken corner; the radiator / engine / gearbox die from heavy
//     nose and tail hits; a low-speed rub is cosmetic;
//   - hits accumulate: a damaged part is weaker, the thresholds drop.
//  Damage is computed per impact episode: the peak closing speed of one contact (a rail that is being pushed
//  for half a second is ONE hit, not 60), and only the growth of the peak adds damage.
// ============================================================================
const DMG = { scale: 1 };                       // 0 = off, 0.55 = reduced, 1 = realistic (set from the settings)
const DMG_LEVELS = { off: 0, low: 0.55, real: 1 };
const DMG_CORNER = ['FL', 'FR', 'RL', 'RR'];     // front-left, front-right, rear-left, rear-right (left = +x)
const DMG_NAMES = {
  fw: 'Alerón delantero', rw: 'Alerón trasero', floor: 'Fondo plano', eng: 'Motor', cool: 'Radiador', gear: 'Caja de cambios',
  sus: ['Suspensión del. izq.', 'Suspensión del. der.', 'Suspensión tras. izq.', 'Suspensión tras. der.'],
  tyre: ['Neumático del. izq.', 'Neumático del. der.', 'Neumático tras. izq.', 'Neumático tras. der.']
};

// Per-car damage profile: what the car actually carries at each end and how it is built. A single-seater has a bare front
// wing on a nose and exposed wheels; a GT3 a splitter + a rear wing on stays; a NASCAR a steel tube frame with a splitter and a
// decklid spoiler; a road SUV only bumpers. Names, fragility, aero effect, what flies off, where engine / radiators sit.
//  fw / rw: { n: name, k: fragility (x of the 'small speed' curve), aero: share of the downforce it carries, off: can be torn off }
//  tough: crash structure; sus: suspension fragility; wheelX: closing speed that can rip a broken corner off;
//  eng: 'F' front | 'M' mid | 'R' rear engine; cool: 'F' front radiators | 'S' sidepods; tyre: puncture proneness (exposed wheels)
const DMG_PROFILES = {
  open:  { fw: { n: 'Alerón delantero', k: 1, aero: 1, off: true }, rw: { n: 'Alerón trasero', k: 1, aero: 1, off: true }, floor: 'Fondo plano', tough: 1.05, sus: 1.25, wheelX: 13, eng: 'M', cool: 'S', tyre: 1.6 },
  proto: { fw: { n: 'Splitter delantero', k: 0.75, aero: 0.8, off: true }, rw: { n: 'Alerón trasero', k: 0.8, aero: 1, off: true }, floor: 'Fondo plano y difusor', tough: 1.15, sus: 0.95, wheelX: 15, eng: 'M', cool: 'S', tyre: 1 },
  gt3:   { fw: { n: 'Splitter delantero', k: 0.65, aero: 0.6, off: true }, rw: { n: 'Alerón trasero', k: 0.62, aero: 0.9, off: true }, floor: 'Fondo plano', tough: 1.22, sus: 0.85, wheelX: 16, eng: 'F', cool: 'F', tyre: 0.8 },
  stock: { fw: { n: 'Splitter y faldón', k: 0.5, aero: 0.5, off: false }, rw: { n: 'Spoiler trasero', k: 0.45, aero: 0.6, off: false }, floor: 'Bajos', tough: 1.4, sus: 0.75, wheelX: 18, eng: 'F', cool: 'F', tyre: 0.8 },
  hyper: { fw: { n: 'Labio delantero', k: 0.55, aero: 0.5, off: false }, rw: { n: 'Alerón activo', k: 0.6, aero: 0.8, off: true }, floor: 'Fondo plano', tough: 1.05, sus: 0.9, wheelX: 15, eng: 'M', cool: 'F', tyre: 0.8 },
  road:  { fw: { n: 'Paragolpes delantero', k: 0.4, aero: 0, off: false }, rw: { n: 'Paragolpes trasero', k: 0.4, aero: 0, off: false }, floor: 'Bajos', tough: 1, sus: 0.8, wheelX: 17, eng: 'F', cool: 'F', tyre: 0.7 }
};
const DMG_CAR = {   // per-car tweaks over the family profile
  p992_gt3r: { eng: 'R' }, p992_rexy: { eng: 'R' },
  chiron: { rw: { n: 'Alerón activo', k: 0.55, aero: 0.7, off: false } },
  amg_one: { rw: { n: 'Alerón trasero', k: 0.7, aero: 0.9, off: true }, fw: { n: 'Splitter delantero', k: 0.6, aero: 0.5, off: false } },
  valkyrie: { fw: { n: 'Splitter delantero', k: 0.65, aero: 0.7, off: false }, rw: { n: 'Alerón trasero', k: 0.7, aero: 0.9, off: true } },
  bolide: { fw: { n: 'Splitter delantero', k: 0.75, aero: 0.8, off: true } },
  indy_2028: { tough: 1.15 }
};
function dmgProfile(spec) {
  if (spec._dmgP) return spec._dmgP;
  const b = spec.body, fam = ['f1', 'f1h', 'indy', 'fe'].includes(b) ? 'open' : ['lmp', 'track'].includes(b) ? 'proto' : b === 'gt3' ? 'gt3' : b === 'stock' ? 'stock' : b === 'hyper' ? 'hyper' : 'road';
  const p = Object.assign({ fam }, DMG_PROFILES[fam], DMG_CAR[spec.id] || {});
  try { Object.defineProperty(spec, '_dmgP', { value: p, enumerable: false }); } catch (e) {}
  return p;
}
function dmgName(spec, part) { const p = dmgProfile(spec); return part === 'fw' ? p.fw.n : part === 'rw' ? p.rw.n : part === 'floor' ? p.floor : DMG_NAMES[part]; }

function newDamage() {
  return {
    body: { f: 0, r: 0, l: 0, rt: 0 },           // crush of the four panels (0..1)
    fw: 0, rw: 0, floor: 0,                       // aero parts
    sus: [0, 0, 0, 0], tyre: [0, 0, 0, 0], lost: [0, 0, 0, 0], // suspension bend, puncture, wheel gone
    eng: 0, cool: 0, temp: 0, gear: 0, brk: 0, rack: 0,
    total: 0, dead: false, why: '', ep: null, epT: 0, ver: 0, ev: [],
    fx: null
  };
}
const _sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// derived effects (cheap; refreshed whenever a part changes or the temperature moves)
function dmgRefresh(V) {
  const D = V.dmg, P = V.P;
  const aeroShare = Math.min(1, Math.max(0.2, P.clA / 2.2));         // how much a wing / floor matters on this car
  const fl = D.floor;
  const pf = dmgProfile(V.spec);
  const kAF = 1 - (0.62 * D.fw * pf.fw.aero + 0.38 * fl) * aeroShare;
  const kAR = 1 - (0.62 * D.rw * pf.rw.aero + 0.38 * fl) * aeroShare;
  const bodySum = D.body.f + D.body.r + D.body.l + D.body.rt;
  const kD = Math.min(1.45, Math.max(0.85, 1 + 0.07 * bodySum - 0.05 * D.fw * pf.fw.aero - 0.05 * D.rw * pf.rw.aero));
  const pen = (c) => 0.3 * D.sus[c] * D.sus[c] * (3 - 2 * D.sus[c]) * 0.5 + 0.3 * D.sus[c] + 0.5 * D.tyre[c] + (D.lost[c] ? 0.45 : 0);
  const p0 = pen(0), p1 = pen(1), p2 = pen(2), p3 = pen(3);
  const gF = Math.max(0.35, 1 - (p0 + p1) / 2), gR = Math.max(0.35, 1 - (p2 + p3) / 2);
  const toe = (D.sus[0] - D.sus[1]) * 0.05 + (D.tyre[0] - D.tyre[1]) * 0.035 + (D.lost[0] - D.lost[1]) * 0.05;   // + = pulls left
  const drag0 = 0.025, hw = (V.spec.wid || 1.9) * 0.5;
  const dragL = (D.tyre[0] + D.tyre[2]) * drag0 + (D.lost[0] + D.lost[2]) * 0.2 + (D.sus[0] + D.sus[2]) * 0.01;
  const dragR = (D.tyre[1] + D.tyre[3]) * drag0 + (D.lost[1] + D.lost[3]) * 0.2 + (D.sus[1] + D.sus[3]) * 0.01;
  const hot = _sm(0.55, 1, D.temp);
  const pwr = D.dead ? 0 : Math.max(0.12, (1 - 0.65 * D.eng) * (1 - 0.5 * hot));
  const shift = 1 + 2.2 * D.gear;
  const brk = Math.max(0.35, 1 - 0.22 * Math.max(D.sus[0], D.sus[1]) - 0.1 * D.brk - 0.2 * (D.lost[0] + D.lost[1] + D.lost[2] + D.lost[3]));
  const steerLim = Math.max(0.45, 1 - 0.3 * Math.max(D.sus[0], D.sus[1]) - 0.25 * D.rack);
  const vib = Math.min(1, 0.55 * Math.max(D.sus[0], D.sus[1]) + 0.35 * Math.max(D.sus[2], D.sus[3]) + 0.6 * Math.max(...D.tyre) + 0.8 * Math.max(...D.lost) + 0.3 * D.rack);
  const nLost = D.lost[0] + D.lost[1] + D.lost[2] + D.lost[3];
  // overall pace the AI should drive at (1 = healthy)
  const perf = Math.max(0.15, Math.min(1, (0.5 * (gF + gR)) * (0.6 + 0.4 * 0.5 * (kAF + kAR)) * (0.5 + 0.5 * pwr) * (1 - 0.3 * Math.min(1, nLost))));
  D.fx = { kAF, kAR, kD, gF, gR, toe, dragL, dragR, hw, pwr, shift, brk, steerLim, vib, perf, pace: D.dead ? 0 : Math.pow(perf, 0.85), hot };
  D.total = Math.min(1, (D.fw * 0.5 + D.rw * 0.5 + D.floor * 0.4 + (D.sus[0] + D.sus[1] + D.sus[2] + D.sus[3]) * 0.25 + (D.tyre[0] + D.tyre[1] + D.tyre[2] + D.tyre[3]) * 0.15
    + D.eng * 0.5 + D.cool * 0.3 + D.gear * 0.2 + bodySum * 0.15 + nLost * 0.5) / 2.2);
  D.ver++;
}

// peak-based damage curves (x = change of velocity of the car in the impact, m/s). Every curve is 0 below its threshold
const dc = (x, x0, k) => x <= 0 ? 0 : Math.pow(x / x0, k);

// Apply one impact episode update. h = { x: peak closing delta-v (m/s), a, b: contact point in the body frame (forward/left, m),
// nF, nL: direction of the push on the car in the body frame (unit), soft: 0..1 how much the thing hit absorbs (1 = tyre wall), kind }
function dmgImpact(V, h) {
  const s = DMG.scale; if (!(s > 0)) return;
  const D = V.dmg; if (!D) return;
  const hl = (V.spec.len || 4.5) / 2, hw = (V.spec.wid || 1.9) / 2, P = V.P;
  const ep = D.ep && D.epT > 0 ? D.ep : (D.ep = { x: 0, w: null, ev: 0 });
  D.epT = 0.5;
  // effective speed: the soft barriers eat part of the energy, 'reduced' scales the whole thing down; a tougher (race) tub needs more
  const pf = dmgProfile(V.spec), tough = pf.tough;
  const x = h.x * (1 - 0.5 * (h.soft || 0)) * 0.85 / (tough * (0.55 + 0.45 * s));
  if (x <= ep.x + 0.05) return;
  const prev = ep.x; ep.x = x;
  // zone weights
  const ar = h.a / hl, br = h.b / hw;
  const wf = _sm(0.3, 0.8, ar), wr = _sm(0.3, 0.8, -ar);
  const wl = _sm(0.35, 0.85, br), wrt = _sm(0.35, 0.85, -br);
  const side = Math.max(wl, wrt) * (1 - 0.6 * Math.max(wf, wr));       // pure side hit
  const head = Math.abs(h.nF);                                         // push along the car axis = crumple zone works
  const lat = Math.abs(h.nL);                                          // push across the car = suspension / sill
  const weak = (v) => 1 + 0.7 * v;                                     // a damaged part gives way sooner
  const inc = (cur, add, mul) => Math.min(1, cur + Math.max(0, add) * mul);
  const g = (sc, k) => dc(x, sc, k) - dc(prev, sc, k);            // growth of this curve in this update
  const had = D.fx ? { fw: D.fw, rw: D.rw, eng: D.eng, cool: D.cool, gear: D.gear, sus: D.sus.slice(), tyre: D.tyre.slice(), lost: D.lost.slice() } : null;
  const B = D.body;
  // body panels (cosmetic crush that also grows drag and weakens the structure)
  B.f = inc(B.f, g(13, 1.35) * wf * (0.55 + 0.45 * head), weak(B.f));
  B.r = inc(B.r, g(13, 1.35) * wr * (0.55 + 0.45 * head), weak(B.r));
  B.l = inc(B.l, g(12, 1.3) * (wl * (0.6 + 0.4 * lat) + 0.45 * (wf + wr) * (1 - lat) * (h.b > 0 ? 1 : 0)), weak(B.l));
  B.rt = inc(B.rt, g(12, 1.3) * (wrt * (0.6 + 0.4 * lat) + 0.45 * (wf + wr) * (1 - lat) * (h.b < 0 ? 1 : 0)), weak(B.rt));
  // aero parts: they break at small speeds
  // a bare wing on a nose breaks at walking pace; a splitter needs more, a bumper more still (curve threshold scales with 1/k)
  D.fw = inc(D.fw, g(4.2 / pf.fw.k, 1.25) * wf, weak(D.fw) * (0.6 + 0.4 * wf));
  D.rw = inc(D.rw, g(4.8 / pf.rw.k, 1.25) * wr, weak(D.rw) * (0.6 + 0.4 * wr));
  // parts that cannot be torn off (bumper, lip, decklid spoiler) stay hanging on the car
  if (!pf.fw.off) D.fw = Math.min(D.fw, 0.9); if (!pf.rw.off) D.rw = Math.min(D.rw, 0.9);
  // heavy impacts also bend the floor
  D.floor = inc(D.floor, g(15, 1.9), 0.75 * weak(D.floor));
  // suspension corners: closer corner and sideways pushes weigh more
  const cpos = [[P.a, 1], [P.a, -1], [-P.b, 1], [-P.b, -1]];
  for (let c = 0; c < 4; c++) {
    const da = (h.a - cpos[c][0]) / (hl * 0.95), db = (h.b - cpos[c][1] * hw * 1.05) / (hw * 1.4);
    const near = _sm(1.25, 0.18, Math.hypot(da, db));
    if (near <= 0.01) continue;
    const ang = 0.55 + 0.75 * lat;                                      // sideways loads bend the tie rods
    D.sus[c] = inc(D.sus[c], g(9.5 / pf.sus, 1.75) * near * ang, weak(D.sus[c]));
  }
  // front / rear structure: radiator and engine up front, the gearbox behind
  // radiators: in the nose (front hits) or in the sidepods (side hits); engine where it really sits
  const wCool = pf.cool === 'F' ? wf * (0.4 + 0.6 * head) : side * (0.4 + 0.6 * lat) + 0.25 * wf;
  const wEng = pf.eng === 'F' ? wf * (0.4 + 0.6 * head) : pf.eng === 'R' ? wr * (0.4 + 0.6 * head) : 0.6 * wr * (0.4 + 0.6 * head) + 0.3 * side;
  D.cool = inc(D.cool, g(10.5, 2.0) * wCool, weak(D.cool));
  D.eng = inc(D.eng, g(20, 2.2) * wEng, weak(D.eng));
  D.gear = inc(D.gear, g(17, 2.1) * wr * (0.4 + 0.6 * head), weak(D.gear));
  D.brk = inc(D.brk, g(14, 1.8) * (wf + wr) * 0.5, 1);
  D.rack = inc(D.rack, g(11, 1.9) * wf * (0.3 + 0.7 * lat), 1);
  // punctures: a broken corner or a cutting hit; rolled once per growth of the peak
  for (let c = 0; c < 4; c++) {
    if (D.tyre[c] >= 1) continue;
    const near = _sm(1.3, 0.2, Math.hypot((h.a - cpos[c][0]) / (hl * 0.95), (h.b - cpos[c][1] * hw * 1.05) / (hw * 1.4)));
    const pr = near * (_sm(6, 17, x) * 0.7 + 0.5 * D.sus[c] * _sm(4, 10, x)) * (x - prev) / Math.max(1, x);
    const prK = pr * (h.kind === 'car' ? pf.tyre : 1);
    if (Math.random() < prK * 1.6) D.tyre[c] = 1;
  }
  // a fully broken corner loses its wheel
  for (let c = 0; c < 4; c++) if (D.sus[c] >= 0.97 && !D.lost[c] && x > pf.wheelX) D.lost[c] = 1;
  // retirement
  if (!D.dead) {
    const nLost = D.lost[0] + D.lost[1] + D.lost[2] + D.lost[3];
    if (D.eng >= 0.98 || nLost >= 2 || (D.lost[0] && D.lost[1]) || x > 38) { D.dead = true; D.why = D.eng >= 0.98 ? 'motor' : x > 38 ? 'impacto' : 'ruedas'; }
  }
  dmgRefresh(V);
  if (!D.dead && D.total > 0.86) { D.dead = true; D.why = 'daños'; }
  // events for the UI / effects
  const ev = (type, idx) => D.ev.push({ type, idx: idx != null ? idx : -1, a: h.a, b: h.b, nF: h.nF, nL: h.nL, x });
  if (had) {
    if (had.fw < 0.5 && D.fw >= 0.5) ev('fw'); if (had.rw < 0.5 && D.rw >= 0.5) ev('rw');
    if (pf.fw.off && had.fw < 0.95 && D.fw >= 0.95) ev('fwOff'); if (pf.rw.off && had.rw < 0.95 && D.rw >= 0.95) ev('rwOff');
    for (let c = 0; c < 4; c++) {
      if (had.sus[c] < 0.4 && D.sus[c] >= 0.4) ev('sus', c);
      if (!had.lost[c] && D.lost[c]) ev('wheel', c);
      if (!had.tyre[c] && D.tyre[c]) ev('puncture', c);
    }
    if (had.cool < 0.3 && D.cool >= 0.3) ev('leak');
    if (had.eng < 0.4 && D.eng >= 0.4) ev('engine');
    if (had.gear < 0.4 && D.gear >= 0.4) ev('gearbox');
  }
  ep.ev++;
  (D.hits || (D.hits = [])).push({ x, a: h.a, b: h.b, nF: h.nF, nL: h.nL, dx: x - prev, kind: h.kind });   // consumed by the visuals (dents, sparks)
  if (D.hits.length > 10) D.hits.shift();
  dmgRefresh(V);
}

// rubbing along a wall / another car: cosmetic wear on the panel, sidewall cuts at speed (called every step while in contact)
function dmgScrape(V, vt, a, b, dt) {
  const s = DMG.scale; if (!(s > 0) || !V.dmg) return;
  const D = V.dmg, hl = (V.spec.len || 4.5) / 2, hw = (V.spec.wid || 1.9) / 2;
  const w = Math.min(1, Math.abs(vt) / 30) * dt * s;
  if (w <= 0) return;
  if (Math.abs(b) / hw > 0.5) { const k = b > 0 ? 'l' : 'rt'; D.body[k] = Math.min(1, D.body[k] + 0.05 * w); }
  if (a / hl > 0.55) D.body.f = Math.min(1, D.body.f + 0.02 * w);
  if (-a / hl > 0.55) D.body.r = Math.min(1, D.body.r + 0.02 * w);
  D.floor = Math.min(1, D.floor + 0.012 * w);
  // a sidewall rubbing the barrier at 100+ km/h can cut: slow chance per second
  if (Math.abs(vt) > 28 && Math.random() < 0.06 * dt * s) {
    const c = (a > 0 ? 0 : 2) + (b > 0 ? 0 : 1);
    if (!D.tyre[c]) { D.tyre[c] = 1; D.ev.push({ type: 'puncture', idx: c, a, b, nF: 0, nL: 0, x: 0 }); }
  }
  D.scrape = 0.15;
}

// coolant leak -> heat -> derate -> seized engine; called every step
function dmgTick(V, dt, throttle) {
  const D = V.dmg; if (!D) return;
  if (D.epT > 0) { D.epT -= dt; if (D.epT <= 0) D.ep = null; }
  if (D.scrape > 0) D.scrape -= dt;
  if (D.cool > 0.25 && !D.dead) {
    const load = 0.25 + 0.75 * throttle;
    D.temp = Math.min(1.05, D.temp + dt * D.cool * 0.0095 * load);
    if (D.temp >= 1 && D.eng < 0.98) { D.eng = Math.min(1, D.eng + dt * 0.08); }
    if (D.eng >= 0.98 && !D.dead) { D.dead = true; D.why = 'motor'; D.ev.push({ type: 'seized', idx: -1, a: 0, b: 0, nF: 0, nL: 0, x: 0 }); }
    D.tempTick = (D.tempTick || 0) + dt;
    if (D.tempTick > 0.5) { D.tempTick = 0; dmgRefresh(V); }
  } else if (D.temp > 0) { D.temp = Math.max(0, D.temp - dt * 0.02); }
}

// repairs: returns the time (s) the work takes. mode: 'free' (instant, practice) | list of parts
const REPAIR_T = { tyres: 3, fw: 8, rw: 14, floor: 10, body: 6, sus: 22, eng: 28, cool: 16, gear: 18 };
function dmgRepairPlan(D) {
  const plan = [];
  const add = (part, amount, t) => { if (amount > 0.02) plan.push({ part, t }); };
  add('tyres', Math.max(...D.tyre), REPAIR_T.tyres);
  add('fw', D.fw, REPAIR_T.fw); add('rw', D.rw, REPAIR_T.rw); add('floor', D.floor, REPAIR_T.floor);
  add('body', D.body.f + D.body.r + D.body.l + D.body.rt, REPAIR_T.body);
  add('sus', Math.max(...D.sus, ...D.lost), REPAIR_T.sus);
  add('eng', D.eng, REPAIR_T.eng); add('cool', D.cool, REPAIR_T.cool); add('gear', D.gear, REPAIR_T.gear);
  return plan;
}
function dmgRepairPart(V, part) {
  const D = V.dmg;
  if (part === 'tyres') D.tyre = [0, 0, 0, 0];
  else if (part === 'fw') D.fw = 0;
  else if (part === 'rw') D.rw = 0;
  else if (part === 'floor') D.floor = 0;
  else if (part === 'body') D.body = { f: 0, r: 0, l: 0, rt: 0 };
  else if (part === 'sus') { D.sus = [0, 0, 0, 0]; D.lost = [0, 0, 0, 0]; D.rack = 0; D.brk = 0; }
  else if (part === 'eng') { D.eng = 0; D.temp = 0; }
  else if (part === 'cool') { D.cool = 0; D.temp = 0; }
  else if (part === 'gear') D.gear = 0;
  if (D.dead && D.eng < 0.98 && D.lost.reduce((a, b) => a + b, 0) < 2) { D.dead = false; D.why = ''; }
  D.ev.push({ type: 'repair', part, idx: -1, a: 0, b: 0, nF: 0, nL: 0, x: 0 });
  dmgRefresh(V);
}
function dmgRepairAll(V) { const D = V.dmg; const keep = D.ver; V.dmg = newDamage(); V.dmg.ver = keep + 1; V.dmg.ev.push({ type: 'repairAll', idx: -1, a: 0, b: 0, nF: 0, nL: 0, x: 0 }); dmgRefresh(V); }

function makeCarParams(sp) {
  const race = !!sp.race;
  const P = {};
  P.id = sp.id;
  P.m = sp.kg + (sp.inc ? 0 : 75);
  const cal = (typeof ACCEL_CAL !== 'undefined' && ACCEL_CAL[sp.id]) || null; P.tk = cal ? cal[0] : 1;
  P.power = sp.hp * 745.7 * (cal ? cal[1] : 1); // calibrated to the real 0-100 / 0-200 times (top speed is fixed by the drag area, derived below)
  P.eta = race ? 0.9 : 0.86;
  P.wb = sp.wb; P.wf = sp.wf;
  P.a = P.wb * (1 - P.wf); P.b = P.wb * P.wf;
  P.cgh = sp.cgh; const hyp = sp.body === 'hyper'; P.mu = sp.mu * (race ? 1.06 : hyp ? 1.3 : 1.26); P.ls = sp.ls != null ? sp.ls : (sp.mu > 1.3 ? 0.16 : 0.1);
  P.clA = race ? sp.cla : sp.cla * 1.4 + 0.15; P.aeroF = sp.aeroF != null ? sp.aeroF : sp.wf - 0.02;
  P.alphaPk = sp.apk || (sp.mu > 1.45 ? 0.085 : sp.mu > 1.2 ? 0.095 : 0.098); // stiff tyres: the car answers the wheel at once
  P.Ct = 1.55; P.Bt = Math.tan(Math.PI / (2 * P.Ct)) / P.alphaPk;
  P.Iz = P.m * P.a * P.b * (sp.izk || (race ? 0.84 : hyp ? 0.74 : 0.78)); // dynamic index < 1: mass concentrated between the axles
  P.crr = 0.013;
  P.drive = sp.drive; P.awdF = sp.awdF != null ? sp.awdF : 0.38;
  P.shape = sp.shape != null ? sp.shape : 1.0; P.xpk = sp.xpk || 0.86; P.drop = 0.1;
  P.red = sp.red; P.cyl = sp.cyl;
  P.gears = sp.gears; P.shiftT = sp.shift;
  P.lock = race ? 0.38 : 0.58;
  P.rw = sp.rw || (race ? 0.33 : 0.345);
  P.brakeBias = sp.bb || (race ? 0.56 : 0.62);
  P.race = race;
  const vmax = sp.vmax / 3.6;
  const vtopR = vmax * 1.045;
  const spread = sp.spread || (race ? (sp.gears >= 7 ? 3.0 : 2.8) : (sp.gears >= 8 ? 5.2 : sp.gears >= 7 ? 4.6 : 4.1));
  const v1R = vtopR / spread;
  P.gearV = [];
  for (let g = 0; g < sp.gears; g++) {
    const f = sp.gears === 1 ? 1 : g / (sp.gears - 1);
    P.gearV.push(v1R * Math.pow(vtopR / v1R, Math.pow(f, 0.88)));
  }
  const pfV = powerFrac(vmax / vtopR, P);
  P.cdA = clamp(2 * (P.power * P.eta * pfV - P.crr * P.m * G * vmax) / (RHO * vmax * vmax * vmax), 0.36, 2.2);
  P.lim = sp.lim ? sp.lim / 3.6 : 0;
  P.vmax = sp.lim ? Math.min(vmax, sp.lim / 3.6) : vmax;
  P.ev = !!sp.ev; P.slipK = sp.slipK;
  P.xLaunch = sp.xLaunch || (race ? 0.42 : 0.32);
  // Axle grip balance (tyre widths / setup): tuned so the car keeps a small understeer margin
  // even with moderate trail braking (reference: 150 km/h, 0.3 g deceleration).
  {
    const vr = 42, DF = 0.5 * RHO * P.clA * vr * vr, W = P.m * G;
    const axle = (ad) => {
      const lt = P.m * ad * P.cgh / P.wb;
      const fzf = W * P.wf + DF * P.aeroF + lt, fzr = W * (1 - P.wf) + DF * (1 - P.aeroF) - lt;
      const cf = fzf * Math.pow(fzf / (W * P.wf), -P.ls), cr = fzr * Math.pow(fzr / (W * (1 - P.wf)), -P.ls);
      return [cf, cr];
    };
    const need = P.b / P.a;                                   // required FyF/FyR
    // reference: light trail braking (0.1 g). Steady cornering keeps a small understeer margin (~0.93-0.95),
    // the car still rotates on the brakes; ESC / the driver catch the rest.
    const [cf1, cr1] = axle(0.14 * G);
    const us = sp.us || (race ? 0.985 : hyp ? 1.02 : (sp.body === 'hatch' || sp.body === 'muscle' || sp.body === 'gt') ? 0.99 : 1.0);
    const k = need * us / (cf1 / cr1);
    P.gF = Math.sqrt(k); P.gR = 1 / Math.sqrt(k);
    if (!race) { P.gF *= 1.04; P.gR *= 1.03; } // road cars rotate: the tail answers to throttle, brake and lift (ESC keeps it catchable)
    const [cf0, cr0] = axle(0);
    const F = cf0 * P.gF, R = cr0 * P.gR;
    const tot = F / R < need ? F * P.wb / P.b : R * P.wb / P.a;
    P.latEff = Math.min(1, tot / (F + R));
  }
  P.muX = race ? 1.05 : hyp ? 1.12 : 1.12;
  return P;
}

// ---------------------------------------------------------------------------
//  Vehicle model: bicycle model, Pacejka-like tyres, friction circle, aero,
//  load transfer, gradient + vertical curvature, gearbox, ABS/TC.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  Tyres (5 compounds) and wet weather.
//  Grip = compound (dry) or wet curve (water on the surface) x wear (slow loss, then a cliff) x temperature window.
//  Water is a level 0..1+ per spot: a global level (weather) + puddles; the racing line holds rubber (slippery when
//  wet) and dries first. Aquaplaning = speed-dependent loss of contact in deep water, worse for slicks.
// ---------------------------------------------------------------------------
const TYRES = {
  S: { id: 'S', name: 'Blando', code: 'C4', col: '#ee2a35', kind: 'slick', g: 1.02, topt: 98, win: 22, life: 12, hk: 1.7, vh: 51 },
  M: { id: 'M', name: 'Medio', code: 'C3', col: '#f4c81d', kind: 'slick', g: 1.0, topt: 100, win: 27, life: 20, hk: 1.5, vh: 51 },
  H: { id: 'H', name: 'Duro', code: 'C2', col: '#f2f2f2', kind: 'slick', g: 0.98, topt: 104, win: 32, life: 28, hk: 1.35, vh: 51 },
  I: { id: 'I', name: 'Intermedio', code: 'INT', col: '#22b04a', kind: 'inter', g: 0.80, topt: 78, win: 30, life: 18, hk: 1.5, vh: 78 },
  W: { id: 'W', name: 'Lluvia extrema', code: 'WET', col: '#2377e6', kind: 'wet', g: 0.70, topt: 68, win: 32, life: 32, hk: 1.5, vh: 120 }
};
const TYRE_ORDER = ['S', 'M', 'H', 'I', 'W'];
const TYW = { scale: 1 }; // tyre wear/temperature intensity: 0 off, 1 normal, 2.5 accelerated
// absolute grip of a compound for a water level (1 = dry soft)
function tyreWetG(t, w) {
  if (t.kind === 'slick') return t.g * (1 - 0.62 * smoothstep(0.03, 0.55, w) - 0.12 * smoothstep(0.55, 1.0, w));
  if (t.kind === 'inter') return 0.80 + 0.06 * smoothstep(0, 0.3, w) - 0.16 * smoothstep(0.3, 1.0, w);
  return 0.68 + 0.14 * smoothstep(0.1, 0.6, w);
}
// how 'dry' the surface is for a rain compound (1 = dry asphalt, nothing to cool the soft rubber / blocks)
function tyreDryness(t, w) { return t.kind === 'inter' ? 1 - smoothstep(0.02, 0.25, w) : t.kind === 'wet' ? 1 - smoothstep(0.05, 0.4, w) : 0; }
// Rain compounds on a dry track (F1 behaviour): the very soft rubber, made to be cooled by water, overheats, blisters and its
// tread blocks squirm and tear: wear is several times the normal rate and gets worse with the blisters -> a few laps of life.
function tyreWearMult(t, w, sim) {
  if (t.kind === 'inter') return 1 + (sim ? 3 : 3.5) * (1 - smoothstep(0.02, 0.25, w));
  if (t.kind === 'wet') return 1 + (sim ? 5 : 6.5) * (1 - smoothstep(0.05, 0.4, w));
  return 1 - 0.35 * smoothstep(0.05, 0.4, w);
}
function newTyres(c, sim) { return { c: c || 'M', sim: !!sim, wF: 0, wR: 0, tF: 62, tR: 62, laps: 0, ovF: 0, ovR: 0, bF: 0, bR: 0 }; }
function tyreGrip(ty, rear, w) {
  const t = TYRES[ty.c]; let g = tyreWetG(t, w);
  if (TYW.scale > 0) {
    const wear = Math.min(1, rear ? ty.wR : ty.wF);
    g *= 1 - 0.06 * wear - 0.28 * smoothstep(0.8, 1.0, wear);
    if (ty.sim) { const x = ((rear ? ty.tR : ty.tF) - t.topt) / t.win; g *= Math.max(0.6, 1 - 0.06 * x * x); }
    else if (t.kind !== 'slick') g *= 1 - 0.18 * (rear ? ty.ovR : ty.ovF);   // overheated rain rubber goes greasy
    g *= 1 - 0.25 * Math.min(1, rear ? ty.bR || 0 : ty.bF || 0);           // blisters: chunks of tread missing
  }
  return g;
}
// water level at lateral position d of sample i (global level + puddles; the racing line dries first)
function wxAt(T, i, d, env) {
  const w0 = env.water;
  if (!(w0 > 0.004)) return 0;
  let w = w0;
  const lo = T.lineOff ? T.lineOff[i] : 0, dl = d - lo;
  if (env.dryLine > 0) w *= 1 - 0.55 * env.dryLine * Math.exp(-dl * dl / 5.8);
  const P = T.puddles;
  if (P) {
    const pf = smoothstep(0.04, 0.35, w0);
    for (let k = 0; k < P.length; k++) {
      const p = P[k]; let di = i - p.i0; if (di < 0) di += T.N;
      if (di > p.n) continue;
      if (d < p.d0 - 0.6 || d > p.d1 + 0.6) continue;
      const e = Math.min(di, p.n - di) / 6, el = Math.min(d - p.d0 + 0.6, p.d1 + 0.6 - d) / 1.2;
      w += p.depth * pf * clamp(e, 0, 1) * clamp(el, 0, 1);
    }
  }
  return Math.min(1.5, w);
}
// rubber on the racing line: slippery when wet (0..1 weight)
function wxRubber(T, i, d, w) {
  if (!(w > 0.04)) return 0;
  const dl = d - (T.lineOff ? T.lineOff[i] : 0);
  return Math.exp(-dl * dl / 4.5) * smoothstep(0.04, 0.3, w);
}
function aquaplane(t, w, spd) {
  if (!(w > 0.25)) return 0;
  const vh = t.vh * (1.25 - 0.6 * Math.min(1.4, w));
  return smoothstep(vh * 0.85, vh * 1.15, spd) * smoothstep(0.25, 0.55, w);
}
// deterministic puddles for a circuit
function genPuddles(T, n, line) {
  let s = 1234567 + T.N; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  for (let k = 0; k < n; k++) {
    const frac = (k + 0.2 + rnd() * 0.6) / n, i0 = Math.floor(frac * T.N) % T.N;
    const len = 28 + rnd() * 40, cnt = Math.round(len / T.ds), wd = 2.0 + rnd() * 2.0;
    // puddles collect beside the racing line (the line itself is pushed clear by the traffic): pick a lateral spot >= 1.5 m from it along the whole length
    let best = null;
    for (let a = 0; a < 60 && !best; a++) {
      const wl = T.wl[i0], wr = T.wr[i0];
      const c = a % 3 === 0 ? -wr + 1.2 + rnd() * Math.max(0.5, wl + wr - 2.4 - wd) : a % 3 === 1 ? wl - 0.6 - wd - rnd() * 1.2 : -wr + 0.6 + rnd() * 1.2;
      let ok = true;
      if (line) for (let m = 0; m <= cnt && ok; m += 3) { const o = line.off[(i0 + m) % T.N]; if (c + wd > o - 1.4 && c < o + 1.4) ok = false; }
      if (ok) best = c;
    }
    if (best == null) continue;
    out.push({ i0, n: cnt, d0: best, d1: best + wd, depth: 0.4 + rnd() * 0.4 });
  }
  return out;
}
function wxInit(T, line, D) {
  T.lineOff = line ? line.off : null;
  T.puddles = genPuddles(T, D && D.puddles || 12, line);
  T.tyreLife = D && D.tyreLife || 1; T.wearRef = D && D.wearRef || 0.30;
}
// tyre temperature + wear (called every step)
function tyreTick(v, dt, uF, uR, spd, wl, wr, env, T) {
  const ty = v.ty, t = TYRES[ty.c], k = TYW.scale;
  if (!(k > 0) || dt <= 0) return;
  const base = 0.8 * k / (t.life * (T.tyreLife || 1) * (T.L || 7000)); // wear per metre: `life` laps to reach 0.8
  const tenv = lerp(32, 16, clamp(env.water || 0, 0, 1));
  const mv = spd;
  if (ty.sim) {
    for (let a = 0; a < 2; a++) {
      const u = a ? uR : uF, w = a ? wr : wl, Tp = a ? ty.tR : ty.tF;
      const work = u * u * (0.3 + spd / 70);
      const cool = 0.012 * (0.5 + spd / 70) + 0.03 * smoothstep(0.02, 0.4, w) * (t.kind === 'slick' ? 1 : 0.5);
      let Tn = Tp + (t.hk * 0.9 * work * 1.39 * 1.35 - cool * (Tp - tenv)) * dt * k;
      Tn = clamp(Tn, tenv - 4, 175);
      const dry = tyreDryness(t, w);
      Tn = Math.min(175, Tn + dry * (18 + 30 * Math.min(1, spd / 70)) * 0.05 * dt * k * (t.kind === 'wet' ? 1.3 : 1) * (Tn < t.topt + t.win * 2.2 ? 1 : 0));
      const over = smoothstep(t.topt + t.win * 0.9, t.topt + t.win * 1.8, Tn);
      const bk = a ? 'bR' : 'bF'; ty[bk] = Math.min(1, (ty[bk] || 0) + over * dry * 0.0035 * dt * k);
      const rate = base * mv * (work / (T.wearRef || 0.30)) * tyreWearMult(t, w, true) * (1 + 2.5 * over) * (1 + 2 * ty[bk]);
      if (a) { ty.tR = Tn; ty.wR = Math.min(1.2, ty.wR + rate * dt); ty.ovR = over; } else { ty.tF = Tn; ty.wF = Math.min(1.2, ty.wF + rate * dt); ty.ovF = over; }
    }
  } else {
    const wm = (wl + wr) / 2;
    if (t.kind !== 'slick') {
      // simple model: rain rubber heats up on dry asphalt (more with speed), water cools it (driving through damp patches helps)
      const dry = tyreDryness(t, wm), tgt = t.topt + dry * (t.kind === 'wet' ? 75 : 55) * (0.35 + 0.65 * Math.min(1, spd / 70)) - (1 - dry) * 6;
      for (const a of [0, 1]) { const tk = a ? 'tR' : 'tF', ok = a ? 'ovR' : 'ovF', bk = a ? 'bR' : 'bF';
        ty[tk] += (tgt - ty[tk]) * Math.min(1, dt * (tgt > ty[tk] ? 0.06 : 0.12) * k);
        ty[ok] = smoothstep(t.topt + t.win * 0.9, t.topt + t.win * 1.8, ty[tk]);
        ty[bk] = Math.min(1, (ty[bk] || 0) + ty[ok] * dry * 0.0035 * dt * k * Math.min(1, spd / 30)); }
    } else { ty.tF += (t.topt - ty.tF) * Math.min(1, dt * 0.05); ty.tR = ty.tF; }
    const rF = base * spd * tyreWearMult(t, wm, false) * dt * (1 + 0.8 * ty.ovF) * (1 + 1.5 * (ty.bF || 0));
    const rR = base * spd * tyreWearMult(t, wm, false) * dt * (1 + 0.8 * ty.ovR) * (1 + 1.5 * (ty.bR || 0));
    ty.wF = Math.min(1.2, ty.wF + rF); ty.wR = Math.min(1.2, ty.wR + rR);
  }
}
// planning grip for the AI (compound at the current water, line rubber included)
function tyreGripEst(ty, water, env) {
  const t = TYRES[ty.c], g = tyreWetG(t, water);
  const wear = TYW.scale > 0 ? Math.min(1, (ty.wF + ty.wR) / 2) : 0;
  const wg = (1 - 0.06 * wear - 0.28 * smoothstep(0.8, 1.0, wear)) * (1 - 0.2 * Math.min(1, ((ty.bF || 0) + (ty.bR || 0)) / 2));
  return g * wg * (1 - 0.15 * 0.85 * smoothstep(0.04, 0.3, water));
}

const SURF = {
  asphalt: { grip: 1.0, drag: 0.0, bump: 0 },
  pitlane: { grip: 1.0, drag: 0.0, bump: 0 },
  kerb: { grip: 0.94, drag: 0.004, bump: 0 },
  tarmac: { grip: 0.9, drag: 0.004, bump: 0.15 },
  grass: { grip: 0.52, drag: 0.05, bump: 0.6 },
  gravel: { grip: 0.45, drag: 0.32, bump: 1 }
};
const PIT_LIMIT = 80 / 3.6;
const SAUS_IN = 1.4, SAUS_OUT = 2.0; // sausage kerb band, metres beyond the track edge
const COLL_PTS = [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1]];

class Vehicle {
  constructor(spec, track) {
    this.spec = spec; this.P = makeCarParams(spec); this.T = track;
    this.q = newQ(); this.qc = newQ();
    this.dmg = newDamage(); dmgRefresh(this); this.ty = newTyres('M', false);
    this.reset(0, 0);
  }
  reset(s, d, keepHint, heading) {
    const p = trackPoint(this.T, s, d);
    this.x = p.x; this.z = p.z; this.h = heading != null ? heading : p.h; this.y = p.e;
    this.u = 0; this.v = 0; this.r = 0; this.delta = 0;
    if (!keepHint) { this.dmg = newDamage(); dmgRefresh(this); this.ty = newTyres(this.ty.c, this.ty.sim); } // a respawn on the track keeps the damage; a new session starts clean
    this.axF = 0; this.ayF = 0; this.gear = 1; this.shiftTimer = 0; this.shiftCool = 0;
    this.rpm = this.P.red * 0.12; this.revTimer = 0;
    this.af = 0; this.ar = 0;
    this.wheelRot = 0; this.slipF = 0; this.slipR = 0; this.surfF = 'asphalt'; this.surfR = 'asphalt';
    this.impact = 0; this.impactT = 0; this.pitch = 0; this.roll = 0; this.bump = 0; this.load = 1; this.escLvl = 0; this.escOn = false; this.spin = 0; this.lastImpact = 0; this.sausT = 0; this.sausN = 0;
    this.inPit = false; this.limiter = false; this.absAct = false; this.tcAct = false;
    this.T.project(this.x, this.z, keepHint ? this.hint : -1, this.q); this.hint = this.q.i;
  }
  inBand(q, d) { return q.pc === q.pc && d <= q.pc + q.phw && d >= q.pc - q.phw; }
  surfaceAt(q, d) {
    const T = this.T, i = q.i;
    if (d < -q.wr - 0.2 && this.inBand(q, d)) return 'pitlane';
    if (d >= 0) {
      if (d <= q.wl) return 'asphalt';
      if (T.kerbL[i] && d <= q.wl + 1.3) return 'kerb';
      if (T.sausL[i] && d <= q.wl + SAUS_OUT) return 'kerb';
      if (T.tarL[i] > 0 && d <= q.wl + T.tarL[i]) return 'tarmac';
      return T.typL[i];
    } else {
      if (-d <= q.wr) return 'asphalt';
      if (T.kerbR[i] && -d <= q.wr + 1.3) return 'kerb';
      if (T.sausR[i] && -d <= q.wr + SAUS_OUT) return 'kerb';
      if (T.tarR[i] > 0 && -d <= q.wr + T.tarR[i]) return 'tarmac';
      return T.typR[i];
    }
  }
  maxSteer(u, env) {
    const P = this.P;
    if (!env.steerAssist) return P.lock;
    const au = Math.abs(u);
    const aLat = P.mu * env.grip * (this.tyG != null ? Math.min(1, this.tyG) : 1) * (G + 0.5 * RHO * P.clA * au * au / P.m) * 0.95;
    const loadR = 1 + 0.5 * RHO * P.clA * au * au / (P.m * G);
    // steady-state steer for the grip limit: kinematic part + front slip share. At speed the front slip share
    // shrinks (the rear takes part of the slip in a balanced car), so a full keyboard input does not snap the car
    const slipK = env.slipCap ? (P.slipK != null ? P.slipK : P.race ? lerp(0.15, 0.05, smoothstep(35, 65, au)) : 0.35) : 1.15; // (the AI keeps its own mapping)
    const need = P.wb * aLat / Math.max(au * au, 1) * 1.1 + P.alphaPk * Math.pow(loadR, 0.3) * slipK;
    return Math.min(P.lock, need);
  }
  driveForceAt(gear, u, throttle) {
    const P = this.P, vg = P.gearV[gear - 1];
    const x = Math.abs(u) / vg;
    if (x >= 1.0) return 0;
    const xe = gear === 1 ? Math.max(x, P.xLaunch) : Math.max(x, 0.12);
    return throttle * P.power * P.eta * powerFrac(xe, P) / (xe * vg);
  }
  step(dt, inp, env) {
    const P = this.P, T = this.T;
    const fx = Math.sin(this.h), fz = Math.cos(this.h), lx = Math.cos(this.h), lz = -Math.sin(this.h);
    const q = T.project(this.x, this.z, this.hint, this.q); this.hint = q.i;
    const dotFN = fx * q.nx + fz * q.nz;
    const dF = q.d + P.a * dotFN, dR = q.d - P.b * dotFN;
    let sF = this.surfaceAt(q, dF), sR = this.surfaceAt(q, dR);
    if (T.inEscape) { if (sF !== 'asphalt' && T.inEscape(this.x + fx * P.a, this.z + fz * P.a)) sF = 'tarmac'; if (sR !== 'asphalt' && T.inEscape(this.x - fx * P.b, this.z - fz * P.b)) sR = 'tarmac'; }
    this.surfF = sF; this.surfR = sR;
    // which wheels ride on a kerb (kerb ridges make the car buzz)
    {
      const dotLN = Math.cos(this.h) * q.nx - Math.sin(this.h) * q.nz, ht = (this.spec.wid || 1.9) * 0.42, i = q.i;
      let kl = 0, kr = 0, sn = 0;
      for (const ax of [P.a, -P.b]) for (const sd of [1, -1]) {
        const dw = q.d + ax * dotFN + sd * ht * dotLN;
        const on = dw >= 0 ? (T.kerbL[i] && dw > q.wl - 0.05 && dw < q.wl + 1.35) : (T.kerbR[i] && -dw > q.wr - 0.05 && -dw < q.wr + 1.35);
        if (on) { if (sd > 0) kl++; else kr++; } // counted per side of the car (left / right wheels)
        if (dw >= 0 ? (T.sausL[i] && dw > q.wl + SAUS_IN && dw < q.wl + SAUS_OUT) : (T.sausR[i] && -dw > q.wr + SAUS_IN && -dw < q.wr + SAUS_OUT)) { sn++; this.sausSide = dw >= 0 ? 1 : -1; }
      }
      this.kerbL = kl; this.kerbR = kr; this.kerbN = kl + kr;
      this.kerbPh = (this.kerbPh || 0) + Math.abs(this.u) * dt / 0.55;
      // sausage kerb: a hard hit (lift + kick + grip loss for a moment)
      if (sn && Math.abs(this.u) > 3) { if (!(this.sausT > 0)) { this.sausHit = (this.sausHit || 0) + 1; this.sausKick = -this.sausSide; } this.sausT = 0.32; this.sausN = sn; }
      else if (this.sausT > 0) { this.sausT -= dt; if (this.sausT <= 0) { this.sausT = 0; this.sausN = 0; } }
    }
    this.inPit = q.sep === 1 && this.inBand(q, q.d);
    const SF = SURF[sF], SR = SURF[sR];
    let u = this.u, v = this.v, r = this.r;
    const au = Math.abs(u), spd = Math.hypot(u, v);

    // ---- loads
    const cosrel = fx * q.tx + fz * q.tz;
    const grade = env.noGrade ? 0 : q.slope * cosrel;
    const fxd = DMG.scale > 0 ? this.dmg.fx : null; // damage effects (null = damage off)
    this.dtc = dt;
    const DF = 0.5 * RHO * P.clA * u * u;
    const drag = 0.5 * RHO * P.cdA * u * u * (fxd ? fxd.kD : 1);
    const gEff = clamp(G / Math.sqrt(1 + grade * grade) + (env.noGrade ? 0 : u * u * q.vc * cosrel * cosrel), 0.35 * G, 3 * G);
    this.load = gEff / G;
    const W = P.m * gEff;
    const lt = P.m * this.axF * P.cgh / P.wb * (env.slipCap ? 0.7 : 1); // (the player car transfers a little less weight under brake / power: the tail stays planted)
    let Fzf = W * P.wf - lt + DF * P.aeroF * (fxd ? fxd.kAF : 1);
    let Fzr = W * (1 - P.wf) + lt + DF * (1 - P.aeroF) * (fxd ? fxd.kAR : 1);
    Fzf = Math.max(Fzf, 0.08 * W); Fzr = Math.max(Fzr, 0.08 * W);
    const Fz0f = P.m * G * P.wf, Fz0r = P.m * G * (1 - P.wf);
    const wxW = env.water > 0.004;
    const wlF = wxW ? wxAt(T, q.i, dF, env) : 0, wlR = wxW ? wxAt(T, q.i, dR, env) : 0;
    const wetK = wxW ? smoothstep(0.05, 0.4, (wlF + wlR) / 2) : 0;
    const offRoad = (sF === 'grass' || sF === 'gravel') ? 0.25 * wetK : 0, offRoadR = (sR === 'grass' || sR === 'gravel') ? 0.25 * wetK : 0;
    const kerbF = sF === 'kerb' ? 0.42 * smoothstep(0.04, 0.3, wlF) : 0, kerbR = sR === 'kerb' ? 0.42 * smoothstep(0.04, 0.3, wlR) : 0; // painted kerbs: ice when wet
    const ty = this.ty, tyT = TYRES[ty.c];
    let tgF = tyreGrip(ty, 0, wlF), tgR = tyreGrip(ty, 1, wlR);
    if (wxW) {
      tgF *= (1 - 0.15 * wxRubber(T, q.i, dF, wlF)) * (1 - 0.05 * wetK * (1 - smoothstep(15, 40, spd))); // rubber line + understeer in slow corners
      tgR *= (1 - 0.15 * wxRubber(T, q.i, dR, wlR)) * (1 - 0.05 * wetK);                                  // lighter tail: power oversteer
    }
    const aqF = wxW ? aquaplane(tyT, wlF, spd) : 0, aqR = wxW ? aquaplane(tyT, wlR, spd) : 0;
    this.aqua = Math.max(aqF, aqR); this.wxNow = Math.max(wlF, wlR); this.tyG = (tgF + tgR) / 2;
    const sausG = this.sausT > 0 ? 0.72 : 1; // wheels in the air over the sausage kerb
    const muF = P.mu * env.grip * SF.grip * (1 - offRoad) * (1 - kerbF) * (1 - 0.88 * aqF) * tgF * sausG * Math.pow(Fzf / Fz0f, -P.ls);
    const muR = P.mu * env.grip * SR.grip * (1 - offRoadR) * (1 - kerbR) * (1 - 0.88 * aqR) * tgR * sausG * Math.pow(Fzr / Fz0r, -P.ls);
    const FmaxF = muF * Fzf * P.gF * (fxd ? fxd.gF : 1), FmaxR = muR * Fzr * P.gR * (fxd ? fxd.gR : 1);

    // ---- steering
    // hard braking unloads the rear: the full-lock window narrows a little so a held key does not step the tail out
    let target = clamp(inp.steer, -1, 1) * this.maxSteer(u, env) * (env.steerAssist ? 1 - 0.15 * clamp(inp.brake, 0, 1) * smoothstep(15, 40, Math.abs(u)) : 1) * (fxd ? fxd.steerLim : 1);
    // player steering assist: direct mapping (the wheels go where the input says, no yaw-rate feedback trimming
    // the angle). Only guard: past the front tyre's peak slip, relative to where the front axle is heading, extra
    // lock just scrubs; the window always includes the steady-state angle for the grip limit, so turn-in is never cut.
    if (env.slipCap && au > 6) {
      const thF = Math.atan2(v + P.a * r, au) * (u >= 0 ? 1 : -1);
      const ms = this.maxSteer(u, env), apk = P.alphaPk * Math.pow(clamp(Fzf / Fz0f, 0.3, 5), 0.3);
      if (target > 0) target = Math.min(target, Math.max(thF, 0) + Math.max(ms - apk * 1.05, 0) + apk * 1.35);
      else if (target < 0) target = Math.max(target, Math.min(thF, 0) - Math.max(ms - apk * 1.05, 0) - apk * 1.35);
    }
    const rate = (P.race ? 3.2 : 3.2) / (env.slipCap ? 1 + au / 60 : 1); // rad/s at the wheels (player: slower hands at speed)
    this.delta += clamp(target - this.delta, -rate * dt, rate * dt);
    // a bent front corner pulls the car to its side (toe change), more under braking
    const delta = this.delta + (fxd ? fxd.toe * (1 + 1.2 * clamp(inp.brake, 0, 1)) * smoothstep(3, 15, Math.abs(u)) : 0);
    const cd = Math.cos(delta), sd = Math.sin(delta);

    // ---- slip angles from the real velocity of each axle (valid sideways and backwards)
    const vyA = v + P.a * r;
    const vxF = u * cd + vyA * sd, vyF = -u * sd + vyA * cd;
    const afRaw = -Math.atan2(vyF, Math.abs(vxF) + 0.5);
    const arRaw = -Math.atan2(v - P.b * r, Math.abs(u) + 0.5);
    const relax = clamp(dt * (spd + 4) / 0.45, 0, 1);
    this.af += (afRaw - this.af) * relax; this.ar += (arRaw - this.ar) * relax;
    const BtF = P.Bt * Math.pow(clamp(Fzf / Fz0f, 0.3, 5), -0.3), BtR = P.Bt * Math.pow(clamp(Fzr / Fz0r, 0.3, 5), -0.3);
    const pureF = Math.sin(P.Ct * Math.atan(BtF * this.af)), pureR = Math.sin(P.Ct * Math.atan(BtR * this.ar));

    // ---- stability control (ESC)
    this.escLvl = 0; this.escOn = false;
    // the stability control is an asphalt aid: it lets the car slide (drift) up to a generous angle, then ramps in hard
    // so a spin needs a real mistake; on grass / gravel it barely acts, so the terrain decides whether the car is lost
    const looseF = sF === 'grass' || sF === 'gravel' ? 1 : 0, looseR = sR === 'grass' || sR === 'gravel' ? 1 : 0;
    this.escK = !env.slipCap ? 1 : 1 - ((sF === 'gravel' ? 0.6 : looseF * 0.7) + (sR === 'gravel' ? 0.6 : looseR * 0.7)) / 2;
    if (env.esc && au > 5 && !inp.handbrake) {
      const rRef = u * Math.tan(delta) / P.wb;
      const beta = Math.atan2(v, au), ab = Math.abs(beta);
      const apk = P.alphaPk * Math.pow((Fzf + Fzr) / (P.m * G), 0.3);
      const excess = Math.abs(r) - (Math.abs(rRef) + Math.min(0.25 * apk * au / P.wb, 0.05 + 0.1 * Math.abs(rRef)) + 0.03);
      const pl = !!env.slipCap; // player: generous slide window; AI keeps the tight classic control
      const gate = pl ? smoothstep(0.04, 0.14, ab) : 1; // mild rotation (trail-braking, a tail-out slide) is left to the driver
      const over = pl ? ((excess > 0 && Math.sign(r) === Math.sign(rRef || r)) || (Math.sign(r) !== Math.sign(rRef) && Math.abs(r) > 0.1 && ab > 0.2))
        : ((excess > 0 && Math.sign(r) === Math.sign(rRef || r)) || (Math.sign(r) !== Math.sign(rRef) && Math.abs(r) > 0.1 && ab > 0.035));
      const betaLim = apk * 0.9 + 0.015;
      const slideLvl = pl ? (v * r < 0 ? smoothstep(0.16, 0.55, ab) : 0) : (v * r < 0 && ab > betaLim ? (ab - betaLim) / 0.05 : 0);
      const e1 = over ? Math.max(0.3, excess / 0.12) * gate : 0;
      this.escLvl = clamp(Math.max(e1, slideLvl), 0, 1) * this.escK;
      this.escOn = this.escLvl > 0.02;
    }

    // ---- gearbox (automatic / manual) and reverse
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    if (this.shiftCool > 0) this.shiftCool -= dt;
    let throttle = clamp(inp.throttle, 0, 1), brake = clamp(inp.brake, 0, 1);
    if (fxd) { dmgTick(this, dt, throttle); if (this.dmg.dead) throttle = 0; }
    if (this.escOn) throttle *= 1 - 0.55 * this.escLvl;
    if (this.gear === -1) {
      const t2 = throttle; throttle = brake; brake = t2;
      if (u > -0.4 && inp.throttle > 0.1) { this.gear = 1; throttle = inp.throttle; brake = 0; }
    } else if (spd < 0.7 && inp.brake > 0.4 && inp.throttle < 0.05) {
      this.revTimer += dt;
      if (this.revTimer > 0.35) { this.gear = -1; this.revTimer = 0; }
    } else this.revTimer = 0;

    if (this.gear >= 1) {
      if (env.autoShift) {
        if (this.shiftCool <= 0 && this.shiftTimer <= 0) {
          const g = this.gear;
          if (g < P.gears) {
            const x = au / P.gearV[g - 1];
            const fNow = this.driveForceAt(g, u, 1), fNext = this.driveForceAt(g + 1, u, 1);
            if (x > 0.985 || (x > 0.6 && fNext >= fNow && throttle > 0.3)) { this.gear++; this.shiftTimer = P.shiftT * (fxd ? fxd.shift : 1); this.shiftCool = 0.3; }
          }
          if (this.gear === g && g > 1) {
            const xl = au / P.gearV[g - 2];
            const lower = this.driveForceAt(g - 1, u, 1), cur = this.driveForceAt(g, u, 1);
            if ((throttle > 0.3 && xl < 0.93 && lower > cur * 1.08) || (throttle <= 0.3 && xl < 0.82)) { this.gear--; this.shiftTimer = P.shiftT * 0.6 * (fxd ? fxd.shift : 1); this.shiftCool = 0.25; }
          }
        }
      } else {
        if (inp.shiftUp && this.gear < P.gears && this.shiftTimer <= 0) { this.gear++; this.shiftTimer = P.shiftT * (fxd ? fxd.shift : 1); }
        if (inp.shiftDown && this.gear > 1 && this.shiftTimer <= 0) {
          if (au / P.gearV[this.gear - 2] < 1.02) { this.gear--; this.shiftTimer = P.shiftT * 0.6 * (fxd ? fxd.shift : 1); }
        }
      }
    }

    // ---- longitudinal demand
    let Fdrive = 0;
    if (this.gear >= 1) {
      const vg = P.gearV[this.gear - 1];
      const x = au / vg;
      const xe = this.gear === 1 && throttle > 0.02 ? Math.max(x, P.xLaunch) : Math.max(x, 0.12);
      // standing on the brake (grid, pit box): clutch in, the engine revs freely with the throttle
      if (au < 1.2 && brake > 0.5) this.rpm = lerp(this.rpm, (0.13 + 0.72 * throttle) * P.red, clamp(dt * 7, 0, 1));
      else this.rpm = lerp(this.rpm, Math.max(0.12, Math.min(xe, 1.0)) * P.red, clamp(dt * 20, 0, 1));
      if (this.shiftTimer <= 0 && x < 1.0) Fdrive = this.driveForceAt(this.gear, u, throttle) * (fxd ? fxd.pwr : 1);
      if (au > 1) Fdrive -= (1 - throttle) * P.m * G * 0.035 * (0.4 + x) * (u > 0 ? 1 : -1);
      if (P.lim && u > P.lim) Fdrive = Math.min(Fdrive, 0);
      if (u < -0.5) Fdrive = Math.max(Fdrive, 0);
    } else {
      this.rpm = lerp(this.rpm, (0.15 + 0.5 * throttle) * P.red, clamp(dt * 10, 0, 1));
      Fdrive = u > -9 ? -throttle * P.m * 3.2 : 0;
    }
    const brakeMax = 1.3 * P.mu * env.grip * (P.m * G + DF) * (fxd ? fxd.brk : 1);
    let Bdem = brake * brakeMax;
    // pit-lane speed limiter
    this.limiter = false;
    if (this.inPit && u > PIT_LIMIT - 0.5) {
      Fdrive = Math.min(Fdrive, 0); this.limiter = true;
      if (u > PIT_LIMIT + 0.5) Bdem = Math.max(Bdem, (u - PIT_LIMIT) * P.m * 1.5);
    }
    const dirU = u > 0.05 ? 1 : u < -0.05 ? -1 : 0;

    let FxF = 0, FxR = 0;
    const dF_ = P.drive === 'F' ? 1 : P.drive === 'A' ? clamp(FmaxF / (FmaxF + FmaxR), Math.min(P.awdF, 0.2), 0.6) : 0;
    FxF += Fdrive * dF_; FxR += Fdrive * (1 - dF_);
    const bias = clamp(Fzf / (Fzf + Fzr) + 0.08, 0.5, 0.9);
    FxF -= Bdem * bias * dirU; FxR -= Bdem * (1 - bias) * dirU;

    // ---- friction circle per axle (ABS / TC)
    this.absAct = false; this.tcAct = false; this.lockF = false; this.lockR = false;
    const aPred = clamp(Math.abs(r * u) / Math.max(1, (FmaxF + FmaxR) / P.m), 0, 1) * 0.95 * smoothstep(8, 20, spd);
    const axle = (Fx, Fmax, pure, driven, rear) => {
      let latCap;
      const FxM = Fmax * P.muX * (driven && !(Fx * dirU < 0) ? P.tk : 1);
      // the rear brakes keep their share of grip for the yaw the car is already carrying (predicted from yaw rate x speed): braking in a turn never uses up the tail
      const needLat = Math.max(Math.min(1, Math.abs(pure)) * smoothstep(2, 8, spd), rear ? aPred : 0);
      const lim = FxM * 0.985;
      const braking = Fx * dirU < 0;
      if (braking && env.abs) {
        const cap = lim * (rear ? 0.88 * Math.max(0.3, Math.sqrt(Math.max(0, 1 - needLat * needLat))) : Math.max(0.5, Math.sqrt(Math.max(0, 1 - needLat * needLat))));
        if (Math.abs(Fx) > cap) { Fx = Math.sign(Fx) * cap; if (!rear) this.absAct = true; }
      } else if (!braking && driven && env.tc) {
        // traction control lets the driven axle slip a little: a rear-driven car steps out on the power, a front-driven one pushes wide
        const nl = needLat * (rear ? 0.9 : 0.94);
        const cap = lim * Math.max(0.22, Math.sqrt(Math.max(0, 1 - nl * nl)));
        if (Math.abs(Fx) > cap) { Fx = Math.sign(Fx) * cap; this.tcAct = true; }
      }
      if (Math.abs(Fx) > lim) { Fx = Math.sign(Fx) * 0.85 * FxM; latCap = 0.3 * Fmax; if (rear) this.lockR = true; else this.lockF = true; }
      else latCap = Fmax * Math.sqrt(Math.max(0, 1 - (Fx / FxM) * (Fx / FxM)));
      return [Fx, latCap];
    };
    const drivenF = P.drive !== 'R', drivenR = P.drive !== 'F';
    const [fxF, capF] = axle(FxF, FmaxF, pureF, drivenF, false);
    let [fxR, capR] = axle(FxR, FmaxR, pureR, drivenR, true);
    const FyF = capF * pureF * (1 - (inp.brake > 0.05 ? 0.35 : 0.35) * this.escLvl);
    let FyR = capR * pureR;
    // handbrake: rear wheels locked -> kinetic friction against the rear contact velocity
    if (inp.handbrake && spd > 0.4) {
      const vrx = u, vry = v - P.b * r, m = Math.hypot(vrx, vry) || 1;
      fxR = -0.8 * FmaxR * vrx / m; FyR = -0.8 * FmaxR * vry / m;
    }
    if (this.debug) this.dbg = { Fzf, Fzr, FmaxF, FmaxR, fxF, fxR, capF, capR, FyF, FyR, af: this.af, ar: this.ar, FxF, FxR };
    this.FzF = Fzf; this.FzR = Fzr;
    if (TYW.scale > 0) tyreTick(this, dt, Math.min(1.3, Math.hypot(fxF, FyF) / Math.max(1, FmaxF)), Math.min(1.3, Math.hypot(fxR, FyR) / Math.max(1, FmaxR)), spd, wlF, wlR, env, T);
    this.slipF = Math.abs(this.af) / P.alphaPk; this.slipR = Math.abs(this.ar) / P.alphaPk;
    this.spin = Math.abs(fxR) > 0.95 * FmaxR * P.muX || Math.abs(fxF) > 0.95 * FmaxF * P.muX || (inp.handbrake && spd > 3) ? 1 : 0;
    // tyre marks: locked or sliding beyond the peak (ABS stops at the limit, so only a very hard stop marks faintly)
    {
      const brk = FxF * dirU < 0, uF = Math.abs(fxF) / Math.max(1, FmaxF * P.muX), uR = Math.abs(fxR) / Math.max(1, FmaxR * P.muX), sp = smoothstep(5, 11, spd);
      const lat = (a) => clamp((a - 1.12) * 2.2, 0, 1);
      const hard = smoothstep(30, 45, spd); // an ABS stop only marks (faintly) from very high speed
      this.skidF = sp * clamp(Math.max(this.lockF ? 1 : 0, brk ? (uF - 0.975) * 6 * hard : 0, lat(this.slipF)), 0, 1);
      this.skidR = sp * clamp(Math.max(this.lockR || (inp.handbrake && spd > 3) ? 1 : 0, (this.spin && drivenR && !brk) ? 0.8 : 0, brk ? (uR - 0.975) * 6 * hard : 0, lat(this.slipR)), 0, 1);
    }

    // ---- resistances
    const surfDrag = (SF.drag + SR.drag) * 0.5 * P.m * G * (spd > 0.5 ? 1 : 0);
    const dmgDrag = fxd ? (fxd.dragL + fxd.dragR) * W : 0;
    const Fres = (drag + P.crr * (Fzf + Fzr) + surfDrag + dmgDrag) * dirU;
    const Fgrade = -P.m * G * grade / Math.sqrt(1 + grade * grade);

    // corrective yaw moment: stops short of reversing the yaw the steering asks for
    const rWant = u * Math.tan(delta) / P.wb, sameDir = Math.sign(r) === Math.sign(rWant);
    let Mesc = this.escLvl * -Math.sign(r) * (Fzf + Fzr) * 0.24 * (sameDir ? clamp((Math.abs(r) - Math.abs(rWant) * 0.6) / 0.15, 0, 1) : 1);
    // yaw damper: yaw rate beyond what the tyres can sustain (transient overshoot at speed) is damped back
    if (env.esc && au > 12 && !inp.handbrake) {
      const rLim = (FmaxF + FmaxR) / (P.m * au) * 1.06, ex = Math.abs(r) - rLim;
      if (ex > 0) { const md = -Math.sign(r) * Math.min(P.Iz * ex * 25, (Fzf + Fzr) * 0.3) * (this.escK != null ? this.escK : 1); Mesc = Math.abs(md) > Math.abs(Mesc) ? md : Mesc; this.yawDamp = true; } else this.yawDamp = false;
    }
    const Fesc = this.escLvl * (Fzf + Fzr) * 0.12 * dirU;
    const Fx = fxF * cd - FyF * sd + fxR - Fres + Fgrade - Fesc;
    const Fy = fxF * sd + FyF * cd + FyR;
    const Mz = P.a * (fxF * sd + FyF * cd) - P.b * FyR + Mesc + (fxd ? (fxd.dragL - fxd.dragR) * W * fxd.hw * dirU : 0);

    // ---- integrate
    const uNew = u + (Fx / P.m + v * r) * dt;
    // resistances must not push a (nearly) stopped car backwards; spinning cars may slide backwards freely
    const nearlyStopped = spd < 1.5 && Math.abs(v) < 0.8;
    if (nearlyStopped && this.gear >= 1 && u >= 0 && uNew < 0 && Fdrive <= 0) u = 0;
    else if (nearlyStopped && this.gear === -1 && u <= 0 && uNew > 0 && Fdrive >= 0) u = 0;
    else u = uNew;
    v += (Fy / P.m - this.u * r) * dt;
    r += (Mz / P.Iz) * dt;
    // very low speed: blend to the kinematic model (based on TOTAL speed, so slides keep their momentum)
    const spd2 = Math.hypot(u, v);
    const kb = clamp((spd2 - 1.2) / 2.5, 0, 1);
    if (kb < 1) {
      const rk = u * Math.tan(delta) / P.wb;
      r = lerp(rk, r, kb); v = lerp(0, v, kb);
    }
    if (this.sausT > 0) { // the kerb kicks the car away from it and scrubs speed
      if (this.sausKick) { r += this.sausKick * 0.24 * Math.min(1, Math.abs(u) / 15); v += this.sausKick * 0.6; this.sausKick = 0; }
      u -= Math.sign(u) * Math.min(Math.abs(u), 3.2 * dt * this.sausN);
    }
    const axRaw = (u - this.u) / dt;
    this.axF += (clamp(axRaw, -60, 40) - this.axF) * clamp(dt * 7, 0, 1);
    this.ayF += ((Fy / P.m) - this.ayF) * clamp(dt * 7, 0, 1);
    this.u = u; this.v = v; this.r = r;
    this.h += r * dt;
    this.x += (u * fx + v * lx) * dt;
    this.z += (u * fz + v * lz) * dt;
    this.wheelRot += (inp.handbrake && this.wheelRot !== undefined ? 0.35 : 1) * u / P.rw * dt;

    // ---- barriers
    this.collide();

    // ---- visual attitude & bumps
    const q2 = T.project(this.x, this.z, this.hint, this.q); this.hint = q2.i;
    this.bump = (SF.bump + SR.bump) * 0.5 * Math.min(1, spd / 20);
    // beyond the barrier line (an escape-road opening, a gap) the ground falls away like the terrain does: no hovering car
    { const dd = q2.d, ov = dd >= 0 ? dd - q2.bl : -dd - q2.br, inE = T.inEscape && T.inEscape(this.x, this.z);
      // on the escape lane (off the circuit asphalt) the car sits on the flat lane, blended over the first metres from the track edge
      if (inE && T.esc.yAt) { const off = dd >= 0 ? dd - q2.wl : -dd - q2.wr, w = clamp(off / 3, 0, 1); this.y = lerp(q2.e, T.esc.yAt(this.x, this.z), w); }
      else this.y = q2.e - (ov > 0 && q2.pc !== q2.pc ? Math.min(1.4, ov * 0.5) : 0); }
    const pitchTarget = Math.atan(grade) + this.axF * 0.0022 * (P.race ? 0.4 : 0.55);
    this.pitch += (pitchTarget - this.pitch) * clamp(dt * 10, 0, 1);
    const rollTarget = -this.ayF * 0.0035 * (P.race ? 0.35 : 0.5);
    this.roll += (rollTarget - this.roll) * clamp(dt * 8, 0, 1);
    if (this.impactT > 0) this.impactT -= dt;
  }
  // barriers: the drivable area is the circuit (up to its barriers) UNION the pit-lane band
  // foam blocks on the escape road: they give way (the car scrubs speed, the block is knocked flying)
  hitBlocks(hl, hw, fx, fz, lx, lz) {
    const E = this.T.esc;
    for (const b of E.blocks) {
      if (b.down || (b.x - this.x) ** 2 + (b.z - this.z) ** 2 > 100) continue;
      const bs = Math.sin(b.h), bc = Math.cos(b.h);
      let hit = false;
      for (let k = 0; k < 6 && !hit; k++) {
        const a = COLL_PTS[k][0] * hl, c = COLL_PTS[k][1] * hw;
        const px = this.x + fx * a + lx * c - b.x, pz = this.z + fz * a + lz * c - b.z;
        const al = px * bs + pz * bc, ac = px * bc - pz * bs; // along the lane / across
        if (Math.abs(ac) < b.hx + 0.1 && Math.abs(al) < b.hz + 0.1) hit = true;
      }
      if (!hit) continue;
      const Vx = this.u * fx + this.v * lx, Vz = this.u * fz + this.v * lz, sp = Math.hypot(Vx, Vz);
      b.down = true; b.vx = Vx * 0.9 + (Math.random() - 0.5) * 3; b.vz = Vz * 0.9 + (Math.random() - 0.5) * 3; b.vy = Math.min(6, sp * 0.15); b.vr = (Math.random() - 0.5) * 6;
      this.u *= 0.82; this.v *= 0.82; this.r *= 0.85;
      this.impact = Math.max(this.impact || 0, sp * 0.18); this.impactT = 0.5; this.lastImpact = sp * 0.18;
      this.blockHits = (this.blockHits || 0) + 1; E.hits++;
    }
  }
  collide() {
    const P = this.P, T = this.T;
    const q = T.project(this.x, this.z, this.hint, this.qc); this.hint = q.i;
    const hl = (this.spec.len || 4.5) / 2, hw = (this.spec.wid || 1.9) / 2;
    const fx = Math.sin(this.h), fz = Math.cos(this.h), lx = Math.cos(this.h), lz = -Math.sin(this.h);
    const band = q.pc === q.pc, iq = q.i;
    const dmgOn = DMG.scale > 0 && T.dentL;
    // collision faces: the rail / the tyre wall in front of it, displaced by what earlier cars did to them
    const BL = q.bl + (dmgOn ? T.dentL[iq] - T.twL[iq] : 0), BR = q.br + (dmgOn ? T.dentR[iq] - T.twR[iq] : 0);
    let wPen = 0, wC = 0, wpx = 0, wpz = 0, wBand = false, wEsc = false, enx = 0, enz = 0;
    const E = T.esc, inBox = E && this.x > E.box[0] - 12 && this.x < E.box[1] + 12 && this.z > E.box[2] - 12 && this.z < E.box[3] + 12;
    for (let k = 0; k < 6; k++) {
      const a = COLL_PTS[k][0] * hl, b = COLL_PTS[k][1] * hw;
      const px = fx * a + lx * b, pz = fz * a + lz * b;
      const d = q.d + px * q.nx + pz * q.nz;
      if (d <= BL && d >= -BR) continue;
      if (band && d <= q.pc + q.phw && d >= q.pc - q.phw) continue;
      let c = d > BL ? BL - d : -BR - d, isBand = false, isEsc = false, ex = 0, ez = 0;
      if (band) { const c2 = d > q.pc + q.phw ? q.pc + q.phw - d : q.pc - q.phw - d; if (Math.abs(c2) < Math.abs(c)) { c = c2; isBand = true; } }
      // the escape road is drivable too: the car is held by whichever edge (circuit barrier / lane edge) is closest, never snapped across the gap between them
      if (inBox) {
        const wx = this.x + px, wz = this.z + pz, nr = E.near(wx, wz);
        if (nr[0] < E.hw) continue;
        const pe = nr[0] - E.hw;
        if (pe < Math.abs(c)) {
          const j = nr[1], t = nr[2], cx = E.pts[j][0] + (E.pts[j + 1][0] - E.pts[j][0]) * t, cz = E.pts[j][1] + (E.pts[j + 1][1] - E.pts[j][1]) * t;
          const dl = Math.hypot(wx - cx, wz - cz) || 1;
          c = pe; isEsc = true; ez = (cz - wz) / dl; ex = (cx - wx) / dl; isBand = false;   // normal back into the lane
        }
      }
      if (Math.abs(c) > wPen) { wPen = Math.abs(c); wC = c; wpx = px; wpz = pz; wBand = isBand; wEsc = isEsc; enx = ex; enz = ez; }
    }
    if (T.esc) this.hitBlocks(hl, hw, fx, fz, lx, lz);
    if (wPen <= 0) return;
    const sg = wC > 0 ? 1 : -1;
    const nx = wEsc ? enx : q.nx * sg, nz = wEsc ? enz : q.nz * sg; // wall normal pointing back into the drivable area
    const side = wC < 0 ? 1 : -1;         // barrier on the left (+1) or the right (-1)
    const typ = wBand || wEsc ? 1 : (side > 0 ? T.btL : T.btR) ? (side > 0 ? T.btL[iq] : T.btR[iq]) : 1;
    let Vx = this.u * fx + this.v * lx, Vz = this.u * fz + this.v * lz;
    const r = this.r, px = wpx, pz = wpz;
    const cvx = Vx + r * pz, cvz = Vz - r * px;
    const vn = cvx * nx + cvz * nz;
    const rn = pz * nx - px * nz, effM = 1 / (1 / P.m + rn * rn / P.Iz);
    const tx = -nz, tz = nx, vt = cvx * tx + cvz * tz, rt = pz * tx - px * tz, effT = 1 / (1 / P.m + rt * rt / P.Iz);
    const ca = px * fx + pz * fz, cb = px * lx + pz * lz;      // contact point in the body frame (forward / left)
    const nF = nx * fx + nz * fz, nL = nx * lx + nz * lz;       // push on the car in the body frame
    const dt = this.dtc || 1 / 120;
    // ---- soft barrier: the rail bends / the tyres are crushed at a constant force and keep the deformation
    const bLeft = dmgOn && typ !== 1 && !wBand && !wEsc ? T.barLeft(side, iq) : 0;     // travel left in the rail / tyres from the current face
    if (bLeft - wPen > 0.03) {
      const inTyres = (side > 0 ? T.twL[iq] : T.twR[iq]) > 0.05;
      if (vn < 0) {
        const jMax = -vn * effM;
        // constant crush force, raised when needed so the car is stopped inside the travel that is left (no tunnelling, no snap-back)
        const jStop = 1.35 * effM * vn * vn / (2 * Math.max(0.08, bLeft - wPen)) * dt;
        const j = Math.min(Math.max((inTyres ? 6.5 : 12.5) * G * P.m * dt, jStop), jMax);
        Vx += j / P.m * nx; Vz += j / P.m * nz;
        this.r = clamp(r + j * rn / P.Iz, -4, 4);
        this.impact = Math.max(this.impact, -vn); this.impactT = 0.5; this.lastImpact = -vn;
        dmgImpact(this, { x: -vn, a: ca, b: cb, nF, nL, soft: inTyres ? 0.95 : 0.35, kind: inTyres ? 'tyres' : 'armco' });
        this.hitJ = (this.hitJ || 0) + j;
      }
      // scraping along it: friction scaled by how hard it is pressed
      const mu = inTyres ? 0.7 : 0.38, fn = Math.max(0.45 * P.m * G * dt, (vn < 0 ? 12 * G * P.m * dt : 0));
      const jt = clamp(-vt * effT, -mu * fn, mu * fn);
      Vx += jt / P.m * tx; Vz += jt / P.m * tz; this.r = clamp(this.r + jt * rt / P.Iz, -4, 4);
      dmgScrape(this, vt, ca, cb, dt);
      this.u = Vx * fx + Vz * fz; this.v = Vx * lx + Vz * lz;
      // the barrier gives way to where the car is
      const gone = T.pushBarrier(side, iq, wPen);
      T.barEv.push({ side, i: iq, p: wPen, gone, x: this.x + px, z: this.z + pz, vx: Vx, vz: Vz, nx, nz, typ, close: Math.max(0, -vn) });
      this.scrapeT = 0.12; this.scrapeAt = [this.x + px, this.z + pz, Math.abs(vt)];
      return;
    }
    // ---- rigid wall (concrete, pit wall, a barrier that has run out of travel)
    // push-out is limited per step: a barrier that sweeps onto the car (chicane, corner exit) squeezes it out smoothly instead of snapping it
    { const corr = Math.min(wPen, 0.35 + 1.5 * Math.abs(Math.min(vn, 0)) * dt); this.x += nx * corr; this.z += nz * corr; }
    if (vn < 0) {
      const e = typ === 1 ? 0.2 : 0.12;
      const j = -(1 + e) * vn / (1 / P.m + rn * rn / P.Iz);
      Vx += j / P.m * nx; Vz += j / P.m * nz;
      let rNew = r + j * rn / P.Iz;
      let jt = -vt / (1 / P.m + rt * rt / P.Iz);
      const mc = 0.35 * j; jt = clamp(jt, -mc, mc);
      Vx += jt / P.m * tx; Vz += jt / P.m * tz; rNew += jt * rt / P.Iz;
      this.r = clamp(rNew, -4, 4);
      this.u = Vx * fx + Vz * fz; this.v = Vx * lx + Vz * lz;
      const sev = -vn;
      if (sev > this.impact || this.impactT <= 0) this.impact = sev;
      this.impactT = 0.5;
      this.lastImpact = sev;
      dmgImpact(this, { x: j / P.m, a: ca, b: cb, nF, nL, soft: 0, kind: 'wall' });
      dmgScrape(this, vt, ca, cb, dt);
      this.scrapeT = 0.12; this.scrapeAt = [this.x + px, this.z + pz, Math.abs(vt)];
    }
  }
}

// ---------------------------------------------------------------------------
//  Car-to-car contact (three circles per car, rigid-body impulses)
// ---------------------------------------------------------------------------
function carCircles(c, out) {
  const len = c.len, wid = c.wid, off = Math.max(0, len / 2 - wid * 0.5);
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  out[0] = c.x + fx * off; out[1] = c.z + fz * off; out[2] = c.x; out[3] = c.z; out[4] = c.x - fx * off; out[5] = c.z - fz * off;
  return wid * 0.5;
}
const _cA = new Float64Array(6), _cB = new Float64Array(6);
// A: Vehicle. B: Vehicle, or a kinematic body {x,z,h,vx,vz,len,wid} (infinite mass) when B.kin is true.
function collideCars(A, B) {
  const ca = { x: A.x, z: A.z, h: A.h, len: A.spec.len || 4.5, wid: A.spec.wid || 1.9 };
  const kin = !!B.kin;
  const cb = kin ? B : { x: B.x, z: B.z, h: B.h, len: B.spec.len || 4.5, wid: B.spec.wid || 1.9 };
  const dx0 = cb.x - ca.x, dz0 = cb.z - ca.z, reach = (ca.len + cb.len) * 0.5 + 0.5;
  if (dx0 * dx0 + dz0 * dz0 > reach * reach) return 0;
  const rA = carCircles(ca, _cA), rB = carCircles(cb, _cB);
  let best = 0, bi = -1, bj = -1;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const dx = _cB[j * 2] - _cA[i * 2], dz = _cB[j * 2 + 1] - _cA[i * 2 + 1];
    const pen = rA + rB - Math.hypot(dx, dz);
    if (pen > best) { best = pen; bi = i; bj = j; }
  }
  if (bi < 0) return 0;
  let nx = _cB[bj * 2] - _cA[bi * 2], nz = _cB[bj * 2 + 1] - _cA[bi * 2 + 1];
  const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  const PA = A.P, mA = PA.m, IA = PA.Iz;
  const imA = 1 / mA, iIA = 1 / IA;
  const imB = kin ? 0 : 1 / B.P.m, iIB = kin ? 0 : 1 / B.P.Iz;
  const wA = imA / (imA + imB);
  A.x -= nx * best * wA; A.z -= nz * best * wA;
  if (!kin) { B.x += nx * best * (1 - wA); B.z += nz * best * (1 - wA); }
  const cx = _cA[bi * 2] + nx * rA, cz = _cA[bi * 2 + 1] + nz * rA;
  const fxA = Math.sin(A.h), fzA = Math.cos(A.h), lxA = Math.cos(A.h), lzA = -Math.sin(A.h);
  let VAx = A.u * fxA + A.v * lxA, VAz = A.u * fzA + A.v * lzA;
  const rax = cx - A.x, raz = cz - A.z;
  let VBx, VBz, rbx = 0, rbz = 0, rB_ = 0, fxB, fzB, lxB, lzB;
  if (kin) { VBx = B.vx || 0; VBz = B.vz || 0; }
  else {
    fxB = Math.sin(B.h); fzB = Math.cos(B.h); lxB = Math.cos(B.h); lzB = -Math.sin(B.h);
    VBx = B.u * fxB + B.v * lxB; VBz = B.u * fzB + B.v * lzB; rbx = cx - B.x; rbz = cz - B.z; rB_ = B.r;
  }
  const vAcx = VAx + A.r * raz, vAcz = VAz - A.r * rax;
  const vBcx = VBx + rB_ * rbz, vBcz = VBz - rB_ * rbx;
  const vn = (vBcx - vAcx) * nx + (vBcz - vAcz) * nz;
  if (vn >= 0) return 0;
  const raN = raz * nx - rax * nz, rbN = rbz * nx - rbx * nz;
  const e = 0.2;
  const j = -(1 + e) * vn / (imA + imB + raN * raN * iIA + rbN * rbN * iIB);
  VAx -= j * imA * nx; VAz -= j * imA * nz; A.r -= j * raN * iIA;
  // friction along the contact tangent
  const tx = -nz, tz = nx;
  const vt = (vBcx - vAcx) * tx + (vBcz - vAcz) * tz;
  const raT = raz * tx - rax * tz, rbT = rbz * tx - rbx * tz;
  let jt = -vt / (imA + imB + raT * raT * iIA + rbT * rbT * iIB); const mc = 0.3 * j; jt = clamp(jt, -mc, mc);
  VAx -= jt * imA * tx; VAz -= jt * imA * tz; A.r -= jt * raT * iIA;
  A.r = clamp(A.r, -4, 4);
  A.u = VAx * fxA + VAz * fzA; A.v = VAx * lxA + VAz * lzA;
  if (!kin) {
    VBx += j * imB * nx; VBz += j * imB * nz; B.r += j * rbN * iIB;
    VBx += jt * imB * tx; VBz += jt * imB * tz; B.r += jt * rbT * iIB;
    B.r = clamp(B.r, -4, 4);
    B.u = VBx * fxB + VBz * fzB; B.v = VBx * lxB + VBz * lzB;
    B.lastCar = -vn; B.carT = 0.5;
  }
  A.lastCar = -vn; A.carT = 0.5;
  if (DMG.scale > 0) {
    // each car takes the change of velocity it suffers (a light car hit by a heavy one suffers more); contact point in each body frame
    const dvA = j * imA, dvB = kin ? 0 : j * imB, dt = A.dtc || 1 / 120;
    dmgImpact(A, { x: dvA, a: rax * fxA + raz * fzA, b: rax * lxA + raz * lzA, nF: -(nx * fxA + nz * fzA), nL: -(nx * lxA + nz * lzA), soft: 0.1, kind: 'car' });
    dmgScrape(A, vt, rax * fxA + raz * fzA, rax * lxA + raz * lzA, dt);
    if (!kin && B.dmg) {
      dmgImpact(B, { x: dvB, a: rbx * fxB + rbz * fzB, b: rbx * lxB + rbz * lzB, nF: nx * fxB + nz * fzB, nL: nx * lxB + nz * lzB, soft: 0.1, kind: 'car' });
      dmgScrape(B, vt, rbx * fxB + rbz * fzB, rbx * lxB + rbz * lzB, dt);
    }
  }
  return -vn;
}

// ---------------------------------------------------------------------------
//  Quasi-steady-state lap estimate (used for the ideal-line colours + checks)
// ---------------------------------------------------------------------------
function qssProfile(T, line, P, env, opt) {
  const N = T.N, vmaxA = new Float64Array(N), bk = opt && opt.brake || 1, lk = opt && opt.lat || 1;
  const g = env.grip;
  const aLatAt = (v, i) => {
    const Fz = P.m * clamp(G + v * v * T.vc[i], 0.35 * G, 3 * G) + 0.5 * RHO * P.clA * v * v;
    const mu = P.mu * g * Math.pow(Fz / (P.m * G), -P.ls);
    return mu * Fz / P.m * Math.min(0.97, P.latEff) * lk;
  };
  for (let i = 0; i < N; i++) {
    const k = Math.abs(line.k[i]);
    let v = P.vmax;
    if (k > 1e-5) {
      v = 20;
      for (let it = 0; it < 30; it++) v = Math.sqrt(aLatAt(v, i) / k);
      v = Math.min(v, P.vmax * 1.2);
    }
    vmaxA[i] = v;
  }
  const vel = new Float64Array(N);
  const accel = (v, i, latFrac) => {
    // best gear drive force
    let best = 0;
    for (let gg = 1; gg <= P.gears; gg++) {
      const vg = P.gearV[gg - 1]; const x = v / vg; if (x >= 1) continue;
      const xe = gg === 1 ? Math.max(x, P.xLaunch) : Math.max(x, 0.12);
      best = Math.max(best, P.power * P.eta * powerFrac(xe, P) / (xe * vg));
    }
    if (P.lim && v >= P.lim) best = 0;
    const DF = 0.5 * RHO * P.clA * v * v;
    const Fz = P.m * G + DF;
    const drivenFz = P.drive === 'A' ? Fz : P.drive === 'F' ? (P.m * G * P.wf + DF * P.aeroF) * 0.9 : (P.m * G * (1 - P.wf) + DF * (1 - P.aeroF)) * 1.1;
    const mu = P.mu * g * Math.pow(Fz / (P.m * G), -P.ls);
    const trac = mu * P.muX * P.tk * drivenFz * Math.sqrt(Math.max(0.05, 1 - latFrac * latFrac));
    const drag = 0.5 * RHO * P.cdA * v * v + P.crr * Fz;
    return (Math.min(best, trac) - drag) / P.m - G * T.slope[i];
  };
  const decel = (v, i, latFrac) => {
    const DF = 0.5 * RHO * P.clA * v * v;
    const Fz = P.m * G + DF;
    const mu = P.mu * g * Math.pow(Fz / (P.m * G), -P.ls);
    const drag = 0.5 * RHO * P.cdA * v * v;
    return (mu * P.muX * Fz * 0.95 * bk * Math.sqrt(Math.max(0.1, 1 - latFrac * latFrac)) + drag) / P.m + G * T.slope[i];
  };
  // iterate forward/backward twice to close the loop
  let start = 0; let mn = 1e9; for (let i = 0; i < N; i++) if (vmaxA[i] < mn) { mn = vmaxA[i]; start = i; }
  for (let i = 0; i < N; i++) vel[i] = vmaxA[i];
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 0; c < N; c++) {
      const i = (start + c) % N, jn = (i + 1) % N;
      const v = vel[i]; const lat = Math.min(1, (v * v * Math.abs(line.k[i])) / aLatAt(v, i));
      const a = accel(v, i, lat);
      const vn = Math.sqrt(Math.max(0, v * v + 2 * a * line.sd[i]));
      if (vn < vel[jn]) vel[jn] = vn;
    }
    for (let c = 0; c < N; c++) {
      const i = (start - c + 2 * N) % N, jp = (i - 1 + N) % N;
      const v = vel[i]; const lat = Math.min(1, (v * v * Math.abs(line.k[i])) / aLatAt(v, i));
      const a = decel(v, i, lat);
      const vp = Math.sqrt(v * v + 2 * a * line.sd[jp]);
      if (vp < vel[jp]) vel[jp] = vp;
    }
  }
  let t = 0; for (let i = 0; i < N; i++) t += line.sd[i] / Math.max(1, (vel[i] + vel[(i + 1) % N]) / 2);
  return { vel, time: t };
}

