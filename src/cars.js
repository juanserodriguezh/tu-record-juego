// ============================================================================
//  CAR ROSTER  — approximate public specs (power hp, mass kg, top speed km/h)
// ============================================================================
const BODY_DEF = {
  hatch:  { wf: 0.61, cgh: 0.52, wb: 2.73, len: 4.59, wid: 1.89, hgt: 1.41, mu: 1.06, cla: 0.25, gears: 6, shift: 0.22, wing: 1, red: 7000, cyl: 4 },
  muscle: { wf: 0.54, cgh: 0.53, wb: 2.85, len: 4.85, wid: 1.92, hgt: 1.37, mu: 1.03, cla: 0.12, gears: 6, shift: 0.2, wing: 1, red: 6500, cyl: 8, shape: 1.15 },
  gt:     { wf: 0.51, cgh: 0.47, wb: 2.75, len: 4.62, wid: 1.94, hgt: 1.29, mu: 1.07, cla: 0.22, gears: 8, shift: 0.12, wing: 0, red: 7000, cyl: 8 },
  super:  { wf: 0.42, cgh: 0.43, wb: 2.65, len: 4.55, wid: 1.98, hgt: 1.2, mu: 1.1, cla: 0.35, gears: 7, shift: 0.09, wing: 0, red: 8500, cyl: 8 },
  hyper:  { wf: 0.43, cgh: 0.40, wb: 2.7, len: 4.62, wid: 2.04, hgt: 1.16, mu: 1.14, cla: 0.8, gears: 7, shift: 0.07, wing: 1, red: 8500, cyl: 8 },
  track:  { wf: 0.43, cgh: 0.36, wb: 2.7, len: 4.75, wid: 2.05, hgt: 1.12, mu: 1.4, cla: 2.6, gears: 7, shift: 0.05, wing: 2, red: 8500, cyl: 8 },
  gt3:    { wf: 0.45, cgh: 0.40, wb: 2.7, len: 4.62, wid: 2.04, hgt: 1.2, mu: 1.62, cla: 3.0, gears: 6, shift: 0.05, wing: 2, red: 8000, cyl: 8, race: true, inc: true },
  f1:     { wf: 0.46, cgh: 0.27, wb: 3.05, len: 4.55, wid: 1.8, hgt: 0.95, mu: 1.72, cla: 5.0, gears: 7, shift: 0.02, wing: 2, red: 19000, cyl: 10, race: true, inc: true },
  lmp:    { wf: 0.46, cgh: 0.30, wb: 3.0, len: 4.65, wid: 1.9, hgt: 1.05, mu: 1.8, cla: 5.8, gears: 7, shift: 0.03, wing: 2, red: 9000, cyl: 4, race: true, inc: true },
  stock:  { wf: 0.53, cgh: 0.43, wb: 2.79, len: 4.9, wid: 2.03, hgt: 1.3, mu: 1.48, cla: 1.6, gears: 5, shift: 0.1, wing: 1, red: 9000, cyl: 8, race: true, inc: true },
  f1h:    { wf: 0.45, cgh: 0.27, wb: 3.73, len: 5.65, wid: 2.0, hgt: 0.95, mu: 1.88, cla: 6.2, gears: 8, shift: 0.02, wing: 2, red: 13500, cyl: 6, race: true, inc: true },
  fe:     { wf: 0.42, cgh: 0.28, wb: 2.97, len: 5.016, wid: 1.7, hgt: 1.023, mu: 1.45, cla: 1.9, gears: 1, shift: 0, wing: 2, red: 20000, cyl: 4, race: true, inc: true, ev: true, shape: 1.0, xpk: 0.2, xLaunch: 0.2, spread: 1 },
  indy:   { wf: 0.42, cgh: 0.28, wb: 3.05, len: 5.1, wid: 1.95, hgt: 1.0, mu: 1.6, cla: 3.6, gears: 6, shift: 0.03, wing: 2, red: 12000, cyl: 6, race: true, inc: true }
};

const CAT_NAMES = {
  proto: 'Monoplazas y prototipos', calle: 'Deportivos de calle', super: 'Superdeportivos', hyper: 'Hiperdeportivos', pista: 'Coches de pista'
};

function mkCar(id, name, cat, body, hp, kg, drive, vmax, x) {
  const b = BODY_DEF[body];
  return Object.assign({ id, name, cat, body, hp, kg, drive, vmax }, b, x || {});
}

const ACCEL_CAL = {
  f1_2004: [0.961, 0.751],
  p919_evo: [0.624, 1],
  nascar: [0.779, 1],
  w11: [0.858, 1.042],
  rb22: [0.858, 1.042],
  w17: [0.858, 1.042],
  mcl39: [0.858, 1.042],
  mac26: [0.858, 1.042],
  sf26: [0.858, 1.042],
  formula_e: [0.634, 1],
  indy_2028: [0.81, 1],
  civic_r: [0.846, 1],
  duster: [0.8, 1],
  seagull: [1, 1.09],
  amg_gt3: [0.79, 1],
  amg_gt3_rb: [0.79, 1],
  amg_gt3_evo: [0.79, 1],
  p992_gt3r: [0.79, 1],
  p992_rexy: [0.79, 1],
  bmw_mhv8: [0.85, 1],
  valkyrie_lm: [0.85, 1],
  gr_supra: [1.014, 1],
  alfa_4c: [1.643, 1],
  db11: [0.887, 1],
  conti_gt: [0.706, 1],
  camaro_zl1: [1.186, 1],
  charger_srt: [1.105, 1],
  mustang_rtr: [1.064, 1],
  alfieri: [0.856, 1],
  ftype_svr: [0.622, 1],
  amg_gtr: [0.9, 1],
  gtr_nismo: [1, 1],
  emira: [0.714, 1],
  gt4rs: [0.778, 1],
  wiesmann_mf5: [0.868, 1],
  viper: [0.929, 1],
  nsx: [0.882, 1],
  r8: [0.658, 1],
  z06: [1.069, 1],
  sf90: [0.816, 0.924],
  sp3: [0.961, 1],
  ford_gt: [0.908, 1],
  countach: [0.702, 1],
  revuelto: [0.828, 0.93],
  mc20: [1, 1],
  mclaren_f1: [0.942, 1],
  t50: [0.96, 1],
  chiron: [0.765, 0.721],
  venom_f5: [0.978, 1],
  regera: [0.915, 0.966],
  jesko_abs: [1.029, 1],
  speedtail: [0.953, 1],
  p1: [0.917, 0.969],
  p918: [0.704, 0.952],
  utopia: [0.955, 1],
  tuatara_s: [1.031, 1],
  fenyr: [0.971, 1],
  zenvo_st1: [0.948, 1],
  czinger_21c: [0.873, 1],
  sabre: [1, 1],
  amg_one: [0.567, 0.937],
  valkyrie: [0.913, 1],
  vantage_gt3: [0.798, 1],
  f296_gt3: [0.76, 1],
  ford_gt_sport: [0.741, 1],
  xbow_gtx: [0.784, 1],
  p935: [0.747, 1],
  valkyrie_amr: [0.947, 1],
  vulcan: [0.788, 1],
  bt62: [0.757, 1],
  bolide: [0.565, 1],
  apollo_ie: [0.793, 1],
  ef7: [0.689, 1],
  scg004: [0.79, 1],
  senna: [0.871, 1],
  citroen_gts: [0.87, 1]
}; // [launch traction factor, power factor] calibrated to real 0-100 / 0-200 km/h times
const CARS = [
  // ---- the four cars from the reference photos
  mkCar('f1_2004', 'F1 2004', 'proto', 'f1', 890, 640, 'R', 335, { glb: 'f2004', trueWheels: true, len: 4.6, wid: 1.8, hgt: 1.07, wb: 3.05, sub: 'Ferrari F2004 · V10 3.0 L', shape: 1.35, xpk: 0.93, spread: 2.9, col: '#c8120c', col2: '#f2f2f2', num: '1', helmet: '#d11a14', rw: 0.33, isNew: true }),
  mkCar('p919_evo', 'Porsche 919 Hybrid Evo', 'proto', 'lmp', 1160, 880, 'A', 360, { glb: 'p919', cabClip: [0.3,0.55,1.5,0.6,1.7], cdz: 0.5, cdx: 0.18, cdy: -0.15, len: 4.65, wid: 1.9, hgt: 1.05, wb: 2.95, sub: 'LMP1 · V4 turbo híbrido', awdF: 0.28, shape: 0.8, xpk: 0.9, spread: 3.0, col: '#f4f4f4', col2: '#101012', col3: '#d5001c', num: '1', rw: 0.34, isNew: true }),
  mkCar('nascar', 'NASCAR Cup', 'proto', 'stock', 670, 1650, 'R', 285, { sub: 'Next Gen · V8 5.86 L', shape: 1.25, xpk: 0.9, spread: 2.4, col: '#1c4fa0', col2: '#d11f2a', num: '3', rw: 0.35, isNew: true, glb: 'nascar', cabClip: [0.8,0.45,1.6,1.2,0.4], len: 5.01, wid: 1.97, hgt: 1.4, wb: 2.79, cdz: 0 }),
  mkCar('bmw_mhv8', 'BMW M Hybrid V8', 'proto', 'lmp', 680, 1030, 'R', 340, { sub: 'LMDh · V8 4.0 L biturbo + híbrido', wf: 0.45, cyl: 8, red: 8200, glb: 'bmw', cdz: 0.4, cdx: 0.33, len: 5.04, wid: 2.07, hgt: 1.23, wb: 3.15, col: '#1a1d22', col2: '#1c69d4', isNew: true }),
  mkCar('valkyrie_lm', 'Aston Martin Valkyrie LMH', 'proto', 'lmp', 700, 1030, 'R', 340, { sub: 'Hypercar WEC · V12 6.5 L atmosférico', wf: 0.45, cyl: 12, red: 9500, glb: 'valklm', cabClip: [0.8,0.55,1.3,0.9,1.4], cdz: 0.49, cdx: 0.3, len: 5.0, wid: 2.01, hgt: 1.13, wb: 3.14, col: '#0b6f73', col2: '#c6e82c', num: '009', isNew: true }),
  mkCar('w11', 'Mercedes F1 2020', 'proto', 'f1h', 1000, 800, 'R', 345, { sub: 'W11 · Temporada 2020 · V6 1.6 L turbo híbrido', shape: 0.95, xpk: 0.9, spread: 2.8, col: '#111214', col2: '#00a19c', helmet: '#f2f2f2', rw: 0.335, isNew: true, glb: 'w11', series: 'f1mod', len: 5.65, wid: 1.98, hgt: 1.1, wb: 3.7, cdz: 0.66 }),
  mkCar('w17', 'Mercedes F1 2026', 'proto', 'f1h', 1000, 770, 'R', 345, { sub: 'W17 · Temporada 2026 · V6 1.6 L turbo híbrido 50/50', shape: 0.95, xpk: 0.9, spread: 2.8, col: '#c8ccd0', col2: '#00a19c', helmet: '#f2f2f2', rw: 0.354, isNew: true, glb: 'w17', wheelStat: /carbon3/, trueWheels: false, series: 'f1mod', len: 5.39, wid: 1.92, hgt: 1.19, wb: 3.4, cdz: 0.55, cdy: 0.06 }),
  mkCar('rb22', 'Red Bull Racing RB22', 'proto', 'f1h', 1000, 770, 'R', 345, { sub: 'Temporada 2026 · V6 1.6 L turbo híbrido 50/50', shape: 0.95, xpk: 0.9, spread: 2.8, col: '#1c2541', col2: '#e10600', helmet: '#1c2541', rw: 0.358, isNew: true, glb: 'rb22', series: 'f1mod', len: 5.27, wid: 1.97, hgt: 1.17, wb: 3.4, cdz: 0.55, cdy: 0.0 }),
  mkCar('sf26', 'Ferrari SF-26', 'proto', 'f1h', 1000, 770, 'R', 345, { sub: 'Temporada 2026 · V6 1.6 L turbo híbrido 50/50 · aero activa', shape: 0.95, xpk: 0.9, spread: 2.8, col: '#ad0405', col2: '#f2f2f2', helmet: '#d11a14', rw: 0.345, isNew: true, glb: 'sf26', trueWheels: 2, series: 'f1mod', len: 5.32, wid: 1.88, hgt: 1.18, wb: 3.4, cdz: 0.55, cdy: 0.06 }),
  mkCar('mac26', 'Cadillac F1 MAC-26', 'proto', 'f1h', 1000, 770, 'R', 345, { sub: 'Temporada 2026 · motor Ferrari V6 1.6 L turbo híbrido 50/50', shape: 0.95, xpk: 0.9, spread: 2.8, col: '#000000', col2: '#f2f2f2', helmet: '#111214', rw: 0.354, isNew: true, glb: 'mac26', trueWheels: 2, series: 'f1mod', len: 5.45, wid: 1.9, hgt: 1.2, wb: 3.4, cdz: 0.55, cdy: 0.06 }),
  mkCar('mcl39', 'McLaren MCL39', 'proto', 'f1h', 1000, 800, 'R', 345, { sub: 'Temporada 2025 · V6 1.6 L turbo híbrido', shape: 0.95, xpk: 0.9, spread: 2.8, col: '#ff8000', col2: '#111214', helmet: '#ff8000', rw: 0.358, isNew: true, glb: 'mcl39', trueWheels: true, series: 'f1mod', len: 5.61, wid: 2.0, hgt: 1.18, wb: 3.6, cdz: 0.54, cdy: 0.08 }),
  mkCar('formula_e', 'Fórmula E Gen3 Evo', 'proto', 'fe', 470, 860, 'A', 322, { glb: 'fe3', trueWheels: 2, inPitch: -0.12, cabClip: [0.3, 0.62, 1.5, 0.5, 1.0], len: 5.1, wid: 1.7, hgt: 1.11, wb: 2.97, sub: 'Eléctrico · 350 kW · tracción total', model: 'formulae', col: '#5f93dc', col2: '#122454', col3: '#e4eef9', helmet: '#e9eef5', rim: 'negro', rw: 0.345, isNew: true }),
  mkCar('indy_2028', 'IndyCar', 'proto', 'indy', 900, 820, 'R', 320, { glb: 'indy23', dy: -0.08, cdz: 0.1, cdy: 0.07, scanFrame: true, tcFwd: 0.22, tcPitch: -0.11, cabClip: [1.2, -1, 3, 3, 1.3], shDrop: 0.2, suit: '#1a1c22', gloveCol: '#e6e6e2', aero: { zf: 1.42, zt: 0.98, yf: 0.82, yt: 1.08, w: 0.30, wt: 0.24, wrap: 0.5, drop: 0.2 }, len: 5.08, wid: 2.05, hgt: 1.34, wb: 3.3, sub: 'Chasis 2028 · V6 turbo híbrido', shape: 0.95, xpk: 0.9, spread: 2.8, col: '#f3f3f3', col2: '#b0101a', num: '28', helmet: '#ffffff', rw: 0.33, isNew: true }),

  // ---- road cars
  // BYD Seagull 2024 (38,88 kWh «Flying»): 55 kW / 135 Nm delantero, 1.240 kg, 130 km/h limitada, 0-100 en 13,0 s. Sin límite llegaría a ~160 km/h
  // con su CdA (~0,72 m²): vmax 160 + lim 130 deja la resistencia aerodinámica real. Eléctrico de una marcha: par constante hasta ~40 km/h (xpk 0,24: 4,6 kN en rueda ≈ 135 Nm × reducción ~10).
  mkCar('seagull', 'BYD Seagull', 'calle', 'hatch', 75, 1240, 'F', 160, { lim: 130, sub: 'Eléctrico · 55 kW · 135 Nm · batería Blade LFP 38,9 kWh', ev: true, gears: 1, shift: 0, red: 12000, cyl: 4, shape: 1.0, xpk: 0.24, xLaunch: 0.2, spread: 1, isNew: true, glb: 'seagull', trueWheels: false, cdz: 0, cdy: -0.1, swAt: [0.95, 0.42, 0.4], col: '#8fa018', col2: '#1b1c1e', len: 3.78, wid: 1.715, hgt: 1.54, wb: 2.5, wf: 0.6, cgh: 0.56, mu: 0.95, cla: 0, rw: 0.3, rim: 'negro' }),
  mkCar('duster', 'Renault Duster', 'calle', 'hatch', 150, 1290, 'F', 187, { sub: '2.ª gen · Intens 1.3 TCe 150 · SUV', suv: true, isNew: true, glb: 'duster', cdz: 0, col: '#f2f4f5', col2: '#1b1c1e', len: 4.33, wid: 1.93, hgt: 1.77, wb: 2.69, wf: 0.61, cgh: 0.68, mu: 0.97, cla: 0, gears: 6, red: 6000, cyl: 4, shift: 0.26, rim: 'plata' }),

  // ---- supercars

  // ---- hypercars
  mkCar('chiron', 'Bugatti Chiron', 'hyper', 'hyper', 1500, 1996, 'A', 420, { lim: 420, sub: 'W16 8.0 L cuatro turbos · 1.500 CV', glb: 'chiron', cabClip: [0.8,0.45,1.5,1.2,0.4], cdz: 0.8, model: 'chiron', cyl: 16, red: 6700, gears: 7, len: 4.54, wid: 2.04, hgt: 1.21, wb: 2.71, cla: 0.8, col: '#2a6fd0', col2: '#142038', fin: true, finLow: true, isNew: true }),
  mkCar('amg_one', 'Mercedes-AMG ONE', 'hyper', 'hyper', 1063, 1695, 'A', 352, { sub: 'V6 1.6 L de F1 + 4 motores eléctricos', glb: 'amg_one', cabClip: [0.8,0.45,1.5,1.2,0.4], cdz: 0.3, model: 'amgone', cyl: 6, red: 11000, shape: 0.85, cla: 2.2, mu: 1.25, col: '#1a1d20', col2: '#00a19c', rim: 'negro', wing: 2, fin: true, isNew: true }),
  mkCar('valkyrie', 'Aston Martin Valkyrie', 'hyper', 'hyper', 1140, 1270, 'R', 350, { glb: 'valk', cabClip: [0.75,0.55,1.3,0.9,1.3], cdz: 0.37, cdx: -0.2, len: 4.5, wid: 2.0, hgt: 1.06, wb: 2.77, sub: 'V12 6.5 L Cosworth híbrido · 11.100 rpm', model: 'valkyrie', cyl: 12, red: 11100, shape: 1.3, xpk: 0.92, cla: 3.0, mu: 1.28, col: '#0d6e6a', col2: '#c6e82c', helmet: '#d9dde1', wing: 2, isNew: true }),

  // ---- track cars
  mkCar('amg_gt3', 'Mercedes-AMG GT3', 'pista', 'gt3', 585, 1285, 'R', 285, { sub: 'GT3 · V8 6.2 L atmosférico', wf: 0.47, glb: 'gt3', series: 'gt3', cdz: 0, len: 4.65, wid: 2.05, hgt: 1.24, wb: 2.63, isNew: true }),
  mkCar('amg_gt3_evo', 'Mercedes-AMG GT3 Evo', 'pista', 'gt3', 585, 1285, 'R', 285, { sub: 'GT3 Evo · V8 6.2 L atmosférico', wf: 0.47, glb: 'gt3evo', series: 'gt3', cdz: 0, len: 4.75, wid: 2.05, hgt: 1.24, wb: 2.63, isNew: true }),
  mkCar('amg_gt3_rb', 'Mercedes-AMG GT3 Red Bull Racing', 'pista', 'gt3', 585, 1285, 'R', 285, { sub: 'GT3 · librea Red Bull · V8 6.2 L atmosférico', wf: 0.47, glb: 'gt3rb', series: 'gt3', cdz: 0, len: 4.65, wid: 2.05, hgt: 1.24, wb: 2.63, isNew: true }),
  mkCar('p992_gt3r', 'Porsche 911 GT3 R (992)', 'pista', 'gt3', 565, 1300, 'R', 290, { sub: 'GT3 2024 · bóxer 4.2 L', wf: 0.4, cyl: 6, red: 9200, glb: 'p992', series: 'gt3', cdz: -0.44, cdx: -0.1, col: '#d5001c', col2: '#111214', num: '911', len: 4.77, wid: 2.05, hgt: 1.25, wb: 2.52, isNew: true }),
  mkCar('p992_rexy', 'Porsche 911 GT3 R "Rexy"', 'pista', 'gt3', 565, 1300, 'R', 290, { sub: 'GT3 · bóxer 4.2 L · librea Rexy', wf: 0.4, cyl: 6, red: 9200, glb: 'rexy', series: 'gt3', cdz: -0.44, cdx: -0.1, len: 4.77, wid: 2.06, hgt: 1.25, wb: 2.52, isNew: true }),
  mkCar('bolide', 'Bugatti Bolide', 'pista', 'track', 1600, 1450, 'A', 380, { sub: 'Solo circuito · W16 8.0 L cuatro turbos', glb: 'bolide', cdx: 0.25, cdy: 0.25, cdz: 0.25, realCab: 2, cabClip: [0.01, 5, 5.1, 0, 0], swAt: [0.646, 0.64, 0.411], noCluster: true, onb: [0, 1.32, -0.55, -0.1], model: 'bolide', cyl: 16, red: 7000, mu: 1.55, cla: 3.2, len: 4.76, wid: 2.0, hgt: 0.995, wb: 2.75, col: '#16181b', col2: '#2a62d8', helmet: '#1d2b4a', rim: 'negro', isNew: true }),
];

// real-world dimensions (m: length, width without mirrors, height, wheelbase) where they differ from the family
const DIMS = {
  camaro_zl1: [4.78, 1.90, 1.35, 2.81], nsx: [4.49, 1.94, 1.215, 2.63], r8: [4.43, 1.94, 1.24, 2.65], z06: [4.69, 2.03, 1.23, 2.72],
  sf90: [4.71, 1.97, 1.19, 2.65], sp3: [4.69, 2.05, 1.14, 2.65], ford_gt: [4.76, 2.0, 1.11, 2.71], countach: [4.87, 2.1, 1.14, 2.7],
  revuelto: [4.95, 2.03, 1.16, 2.78], mc20: [4.67, 1.97, 1.22, 2.7], mclaren_f1: [4.29, 1.82, 1.14, 2.72], p72: [4.7, 2.0, 1.1, 2.7],
  hussarya: [4.72, 2.0, 1.1, 2.75], akula: [4.5, 2.0, 1.12, 2.7], zerouno: [4.88, 2.07, 1.1, 2.65], c8_preliator: [4.59, 1.95, 1.14, 2.6],
  t50: [4.35, 1.85, 1.16, 2.7], victor: [4.7, 2.0, 1.2, 2.8], chiron: [4.54, 2.14, 1.29, 2.69], venom_f5: [4.73, 2.05, 1.15, 2.73],
  regera: [4.56, 2.05, 1.11, 2.66], jesko_abs: [4.61, 2.03, 1.21, 2.7], speedtail: [5.14, 2.0, 1.12, 2.8], p1: [4.59, 1.95, 1.19, 2.67],
  p918: [4.64, 1.94, 1.17, 2.73], utopia: [4.9, 2.04, 1.17, 2.8], tuatara_s: [4.72, 2.0, 1.07, 2.74], fenyr: [4.8, 2.0, 1.2, 2.7],
  zenvo_st1: [4.67, 2.04, 1.2, 2.7], czinger_21c: [4.97, 2.05, 1.2, 2.9], sabre: [4.8, 2.0, 1.1, 2.7], amg_one: [4.75, 2.01, 1.17, 2.66],
  valkyrie: [4.51, 1.92, 1.07, 2.72], valkyrie_amr: [4.78, 1.98, 1.08, 2.72], vulcan: [4.81, 2.06, 1.18, 2.75], bt62: [4.46, 1.95, 1.2, 2.7], bolide: [4.88, 1.99, 1.15, 2.79],
  apollo_ie: [5.18, 2.19, 1.1, 2.7], ef7: [4.4, 2.0, 1.1, 2.65], scg004: [4.6, 2.0, 1.15, 2.7], senna: [4.74, 1.96, 1.23, 2.67],
  citroen_gts: [4.96, 2.08, 1.09, 2.9], mustang_rtr: [4.79, 1.92, 1.38, 2.72], emira: [4.41, 1.9, 1.23, 2.58]
};
for (const c of CARS) { const d = DIMS[c.id]; if (d) { c.len = d[0]; c.wid = d[1]; c.hgt = d[2]; c.wb = d[3]; } }

// brand of each car (drives the two-step garage: brand -> models)
const BRAND_PREFIXES = ['BMW', 'Mercedes-AMG', 'Aston Martin', 'Alfa Romeo', 'Emerson Fittipaldi', 'De Tomaso', 'W Motors', 'Porsche', 'Ferrari', 'Lamborghini', 'McLaren', 'Bugatti', 'Koenigsegg', 'Chevrolet', 'Dodge', 'Ford', 'Honda', 'Acura', 'Toyota', 'Nissan', 'Audi', 'Bentley', 'Jaguar', 'Maserati', 'Lotus', 'Pagani', 'Wiesmann', 'Arrinera', 'Ginetta', 'Italdesign', 'Spyker', 'GMA', 'Hennessey', 'SSC', 'Zenvo', 'Czinger', 'KTM', 'Brabham', 'Apollo', 'SCG', 'Citroën', 'Renault'];
const BRAND_OVERRIDE = { f1_2004: 'Ferrari', nascar: 'NASCAR', formula_e: 'Fórmula E', indy_2028: 'IndyCar' };
function brandOf(c) {
  if (BRAND_OVERRIDE[c.id]) return BRAND_OVERRIDE[c.id];
  for (const b of BRAND_PREFIXES) if (c.name === b || c.name.startsWith(b + ' ')) return b;
  return c.name.split(' ')[0];
}
