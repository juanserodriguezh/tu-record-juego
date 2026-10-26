// ============================================================================
//  Driver hands: articulated gloved hands (palm, 4 fingers x 3 phalanges, thumb x 3, cuff) and two-bone arms.
//  Hand frame: origin = middle of the knuckle line (MCP), +y towards the fingertips, +z = back of the hand,
//  x across the hand (the thumb sits at +x for a left hand, -x for a right hand). Everything is built from lofted
//  superellipse tubes so the volumes read as a real glove and not as balls/capsules.
// ============================================================================
function handLoft(secs, M) {
  M = M || 14;
  const pos = [], idx = [];
  for (const s of secs) for (let i = 0; i < M; i++) {
    const t = (i / M) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t), e = 2 / (s.n || 2);
    pos.push((s.cx || 0) + s.a * Math.sign(c) * Math.pow(Math.abs(c), e), s.y, (s.cz || 0) + s.b * Math.sign(sn) * Math.pow(Math.abs(sn), e));
  }
  for (let k = 0; k < secs.length - 1; k++) for (let i = 0; i < M; i++) {
    const a = k * M + i, b = k * M + (i + 1) % M, c = (k + 1) * M + i, d = (k + 1) * M + (i + 1) % M;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// tube along +y from y0 to y1 with radius r0 -> r1 (elliptical when flat != 1) and optional rounded ends
function handTube(y0, y1, r0, r1, o) {
  o = o || {};
  const fl = o.flat || 1, secs = [], capN = 6, n = o.n || 2;
  const S = (y, r) => ({ y, a: Math.max(r, 1e-4), b: Math.max(r * fl, 1e-4), n });
  if (o.capA) for (let j = 0; j < capN; j++) { const ph = (j / capN) * Math.PI / 2; secs.push(S(y0 - r0 * Math.cos(ph), r0 * Math.sin(ph) + 1e-4)); }
  const m = o.mid || 2;
  for (let j = 0; j <= m; j++) { const f = j / m; secs.push(S(y0 + (y1 - y0) * f, r0 + (r1 - r0) * f)); }
  if (o.capB) for (let j = 1; j <= capN; j++) { const ph = (j / capN) * Math.PI / 2; secs.push(S(y1 + r1 * Math.sin(ph), r1 * Math.cos(ph) + 1e-4)); }
  return handLoft(secs, o.M || 16);
}

const HAND_FINGERS = [   // x = offset from the hand centre towards the thumb side
  { n: 'index',  x: 0.0325, y: 0.003,  L: [0.043, 0.026, 0.0215], r: 0.0104 },
  { n: 'middle', x: 0.0108, y: 0.007,  L: [0.047, 0.029, 0.0225], r: 0.0107 },
  { n: 'ring',   x: -0.0108, y: 0.002, L: [0.044, 0.027, 0.0215], r: 0.0101 },
  { n: 'pinky',  x: -0.0325, y: -0.007, L: [0.035, 0.020, 0.0195], r: 0.0090 }
];
let HAND_MATS = null;
function handMats(glove, accent, light) {
  const k = (glove ? glove.getHexString() : 'x') + (accent ? accent.getHexString() : 'x') + (light ? 'L' : '');
  if (HAND_MATS && HAND_MATS.k === k) return HAND_MATS;
  const base = light && glove ? glove.clone().multiplyScalar(0.62) : new THREE.Color(0.034, 0.036, 0.04).add((glove || new THREE.Color(0.1, 0.1, 0.1)).clone().multiplyScalar(0.05));
  return HAND_MATS = { k,
    glove: new THREE.MeshStandardMaterial({ color: base, roughness: 0.78, metalness: 0.02 }),
    finger: new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(1.18), roughness: 0.74, metalness: 0.02 }),
    patch: new THREE.MeshStandardMaterial({ color: (accent || new THREE.Color(0.6, 0.1, 0.1)).clone().multiplyScalar(0.8), roughness: 0.6, metalness: 0.05 }),
    cuff: new THREE.MeshStandardMaterial({ color: (accent || new THREE.Color(0.6, 0.1, 0.1)).clone().multiplyScalar(0.42).add(new THREE.Color(0.012, 0.012, 0.015)), roughness: 0.74, metalness: 0.02 }) };
}
// Geometry shared by all hands (built once per side)
const HAND_GEO = {};
function handGeo(tS) {
  if (HAND_GEO[tS]) return HAND_GEO[tS];
  const G = {};
  // back of the hand / palm: wrist -> knuckle line, slightly wider towards the knuckles
  G.palm = handLoft([
    { y: -0.112, a: 0.029, b: 0.019, n: 2.4 }, { y: -0.085, a: 0.0335, b: 0.0185, n: 2.4 }, { y: -0.055, a: 0.0395, b: 0.0175, n: 2.5 },
    { y: -0.025, a: 0.0435, b: 0.0170, n: 2.6 }, { y: -0.005, a: 0.0450, b: 0.0160, n: 2.6 }, { y: 0.008, a: 0.0430, b: 0.0140, n: 2.4 }, { y: 0.0135, a: 0.0300, b: 0.009, n: 2 }, { y: 0.015, a: 0.0001, b: 0.0001, n: 2 }], 18);
  // raised pad over the back of the hand (team colour) and knuckle guard
  G.patch = handLoft([{ y: -0.050, a: 0.0001, b: 0.0001, cz: 0.0172 }, { y: -0.046, a: 0.012, b: 0.0006, cz: 0.0172, n: 3 }, { y: -0.034, a: 0.021, b: 0.0016, cz: 0.0172, n: 3 }, { y: -0.020, a: 0.024, b: 0.0016, cz: 0.0172, n: 3 }, { y: -0.015, a: 0.0001, b: 0.0001, cz: 0.0172 }], 12);
  // cuff (gauntlet): flares from the wrist
  G.cuff = handLoft([{ y: -0.124, a: 0.0372, b: 0.0312, n: 2.3 }, { y: -0.116, a: 0.0372, b: 0.0312, n: 2.3 }, { y: -0.104, a: 0.0352, b: 0.0272, n: 2.3 }, { y: -0.088, a: 0.0332, b: 0.0225, n: 2.3 }], 18);
  G.knuckle = new THREE.SphereGeometry(1, 10, 8);
  G.seg = {};
  for (const f of HAND_FINGERS) {
    const rs = [f.r, f.r * 0.95, f.r * 0.9];
    f.L.forEach((l, i) => { const key = f.n + i; G.seg[key] = handTube(0, l, rs[i], i === 2 ? f.r * 0.84 : rs[i] * 0.97, { capA: true, capB: true, flat: i === 2 ? 0.92 : 1, mid: 1 }); });
  }
  const tl = [0.043, 0.034, 0.027], tr = [0.0128, 0.0118, 0.0108];
  G.thumb = tl.map((l, i) => handTube(0, l, tr[i], i === 2 ? tr[i] * 0.86 : tr[i] * 0.94, { capA: true, capB: true, mid: 1 }));
  return HAND_GEO[tS] = G;
}

// build one hand. thumbSide: +1 left hand (thumb at +x), -1 right hand
function buildHand(thumbSide, glove, accent, light) {
  const tS = thumbSide, M = handMats(glove, accent, light), G = handGeo(tS);
  const root = new THREE.Group(); root.name = 'hand';
  const add = (g, m, p) => { const o = new THREE.Mesh(g, m); o.castShadow = false; o.receiveShadow = false; if (p) p.add(o); else root.add(o); return o; };
  add(G.palm, M.glove);
  add(G.patch, M.patch);
  const fingers = [];
  for (const f of HAND_FINGERS) {
    const j0 = new THREE.Group(); j0.position.set(tS * f.x, f.y, 0); root.add(j0);
    const j1 = new THREE.Group(), j2 = new THREE.Group();
    add(G.seg[f.n + '0'], M.finger, j0); j1.position.y = f.L[0]; j0.add(j1);
    add(G.seg[f.n + '1'], M.finger, j1); j2.position.y = f.L[1]; j1.add(j2);
    add(G.seg[f.n + '2'], M.finger, j2);
    fingers.push({ f, j: [j0, j1, j2], rest: [0.18 + Math.random() * 0.04, 0.3, 0.22] });
  }
  // thumb: base joint on the thumb side of the palm, abducted away from the fingers
  const t0 = new THREE.Group(); t0.position.set(tS * 0.034, -0.062, -0.004); root.add(t0);
  const t1 = new THREE.Group(), t2 = new THREE.Group();
  add(G.thumb[0], M.finger, t0); t1.position.y = 0.043; t0.add(t1);
  add(G.thumb[1], M.finger, t1); t2.position.y = 0.034; t1.add(t2);
  add(G.thumb[2], M.finger, t2);
  const wrist = new THREE.Object3D(); wrist.position.set(0, -0.108, 0); root.add(wrist);
  const H = { root, fingers, thumb: [t0, t1, t2], wrist, tS, mats: M };
  H.setPose = (p) => handPose(H, p);
  H.setPose({});
  return H;
}
// pose: { R: grip radius (fingers wrap it), grip: 0..1 curl amount, tAb, tFl: thumb abduction / flexion, spread }
function handPose(H, p) {
  const tS = H.tS, grip = p.grip != null ? p.grip : 1, R = p.R || 0.02;
  H.fingers.forEach((F, i) => {
    const f = F.f, Rc = R + f.r * 0.95, L = f.L;
    const w = [L[0] / (2 * Rc), (L[0] + L[1]) / (2 * Rc), (L[1] + L[2]) / (2 * Rc)];
    for (let k = 0; k < 3; k++) F.j[k].rotation.set(-(F.rest[k] + (Math.min(w[k], k === 0 ? 1.25 : 1.6) - F.rest[k]) * grip), 0, 0);
    F.j[0].rotation.y = tS * (i - 1.5) * -0.035 * (p.spread != null ? p.spread : 1);
  });
  const ab = p.tAb != null ? p.tAb : 0.55, fl = p.tFl != null ? p.tFl : 0.35;
  H.thumb[0].rotation.set(-fl, 0, -tS * ab);
  H.thumb[1].rotation.set(-0.28 * (0.6 + fl), 0, 0);
  H.thumb[2].rotation.set(-0.2, 0, 0);
}
// place a hand: C = grip axis centre, P = back-of-hand direction (away from the grip), yDir = where the fingers start to point
const _hm = new THREE.Matrix4(), _hx = new THREE.Vector3(), _hy = new THREE.Vector3(), _hz = new THREE.Vector3();
function placeHand(H, C, P, yDir, R, lift, scale) {
  _hz.copy(P).normalize(); _hy.copy(yDir).addScaledVector(_hz, -yDir.dot(_hz)).normalize(); _hx.crossVectors(_hy, _hz);
  _hm.makeBasis(_hx, _hy, _hz);
  H.root.quaternion.setFromRotationMatrix(_hm);
  const Rc = (R || 0.02) + 0.0105 * (scale || 1);
  H.root.position.copy(C).addScaledVector(_hz, Rc + (lift != null ? lift : 0.004));
}

// ---------------------------------------------------------------------------
//  Two-bone arm: shoulder S and wrist W (both in the same local space), elbow solved with a pole vector
// ---------------------------------------------------------------------------
function buildArm(sx, sleeveMat, cuffMat) {
  const g = new THREE.Group();
  const upper = new THREE.Mesh(handLoft([{ y: 0, a: 0.038, b: 0.038 }, { y: 0.5, a: 0.036, b: 0.036 }, { y: 1, a: 0.034, b: 0.034 }], 14), sleeveMat);
  const fore = new THREE.Mesh(handLoft([{ y: 0, a: 0.034, b: 0.034 }, { y: 0.15, a: 0.034, b: 0.034 }, { y: 0.6, a: 0.0325, b: 0.0325 }, { y: 1, a: 0.0315, b: 0.0315 }], 14), sleeveMat);
  // gauntlet cuff, aligned with the forearm (not with the hand): the palm base plugs into it
  const cuff = new THREE.Mesh(handLoft([{ y: 0, a: 0.0372, b: 0.0372 }, { y: 0.18, a: 0.0382, b: 0.0382 }, { y: 0.82, a: 0.0382, b: 0.0382 }, { y: 1, a: 0.0345, b: 0.0345 }], 16), cuffMat || sleeveMat);
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.0345, 14, 10), sleeveMat);
  for (const m of [upper, fore, elbow, cuff]) { m.castShadow = false; m.frustumCulled = false; g.add(m); }
  g.visible = false;   // shown after the first solve (no giant default-pose frame when the cockpit view opens)
  return { group: g, upper, fore, elbow, cuff, sx, L1: 0.29, L2: 0.28, E: new THREE.Vector3() };
}
const _ak = { u: new THREE.Vector3(), v: new THREE.Vector3(), p: new THREE.Vector3(), d: new THREE.Vector3(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0) };
function solveArm(A, S, W, ext) {
  const { u, v, p, d, q, up } = _ak;
  d.subVectors(W, S); let dist = d.length(); u.copy(d).multiplyScalar(1 / Math.max(dist, 1e-5));
  let L1 = A.L1, L2 = A.L2; const tot = L1 + L2;
  if (dist > tot - 0.004) { const k = (dist + 0.004) / tot; L1 *= k; L2 *= k; }
  if (dist < Math.abs(L1 - L2) + 0.01) dist = Math.abs(L1 - L2) + 0.01;
  const x = (dist * dist + L1 * L1 - L2 * L2) / (2 * dist), h = Math.sqrt(Math.max(L1 * L1 - x * x, 0));
  p.set(A.sx * 0.5, -0.85, -0.2); v.copy(p).addScaledVector(u, -p.dot(u)); if (v.lengthSq() < 1e-6) v.set(0, -1, 0); v.normalize();
  A.E.copy(S).addScaledVector(u, x).addScaledVector(v, h);
  const set = (m, a, b, sc) => { d.subVectors(b, a); const l = d.length(); m.position.copy(a); q.setFromUnitVectors(up, d.multiplyScalar(1 / Math.max(l, 1e-5))); m.quaternion.copy(q); m.scale.set(1, l, 1); };
  set(A.upper, S, A.E);
  // forearm runs a little past the wrist so the sleeve end hides inside the cuff
  d.subVectors(W, A.E).normalize(); p.copy(W).addScaledVector(d, ext != null ? ext : 0.0);
  set(A.fore, A.E, p);
  A.elbow.position.copy(A.E);
  // cuff: last 6 cm of the forearm, running 1.2 cm past the wrist into the glove
  d.subVectors(W, A.E).normalize(); const w0 = _ak.p.copy(W).addScaledVector(d, -0.05), w1 = _ak.d.copy(W).addScaledVector(d, 0.012);
  A.cuff.position.copy(w0); q.setFromUnitVectors(up, d); A.cuff.quaternion.copy(q); A.cuff.scale.set(1, 0.062, 1);
  A.group.visible = true;
}
