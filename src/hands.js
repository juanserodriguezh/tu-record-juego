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
// same loft with UVs (u around, v along) and a duplicated seam column whose normals are welded, for textured sleeves
function armLoft(secs, M) {
  const pos = [], uv = [], idx = [], R = M + 1;
  secs.forEach((s, k) => { for (let i = 0; i <= M; i++) {
    const t = (i / M) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t), e = 2 / (s.n || 2);
    pos.push((s.cx || 0) + s.a * Math.sign(c) * Math.pow(Math.abs(c), e), s.y, (s.cz || 0) + s.b * Math.sign(sn) * Math.pow(Math.abs(sn), e));
    uv.push(i / M, k / (secs.length - 1));
  } });
  for (let k = 0; k < secs.length - 1; k++) for (let i = 0; i < M; i++) {
    const a = k * R + i, b = a + 1, c = a + R, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const N = g.attributes.normal;
  for (let k = 0; k < secs.length; k++) { const a = k * R, b = a + M; const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1; N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l); }
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
//  Two-bone arm (v114): shoulder S and wrist W in the interior frame, elbow solved with a pole vector that keeps it low and
//  out to the side (as in a real cockpit), shoulders placed from the driver's eye (main.armShoulders) and allowed to come
//  forward a little when the hand reaches (scapula), so the arm is never a straight bar pointing past the camera.
//  Sleeves are lofted race-suit limbs (deltoid / biceps / elbow / forearm muscle tapering to the wrist, a few folds where the
//  sleeve bunches) in a fabric material; the forearm rolls with the hand so the flat wrist meets the glove gauntlet.
// ---------------------------------------------------------------------------
const ARM_GEO = {};
function armGeo() {
  if (ARM_GEO.fore) return ARM_GEO;
  // y: 0 = shoulder / elbow end, 1 = elbow / wrist end (scaled to the bone length every frame); a = width, b = depth
  const ring = (y, a, b, n) => ({ y, a, b, n: n || 2.15 });
  ARM_GEO.upper = armLoft([ring(-0.06, 0.0001, 0.0001), ring(-0.045, 0.034, 0.033), ring(-0.02, 0.046, 0.044), ring(0.04, 0.051, 0.048), ring(0.16, 0.049, 0.045),
    ring(0.36, 0.045, 0.043), ring(0.55, 0.044, 0.041), ring(0.72, 0.041, 0.038), ring(0.86, 0.039, 0.037), ring(0.94, 0.040, 0.038), ring(1.0, 0.041, 0.039)], 20);
  // forearm: elbow knob, muscle belly in the first third, flat wrist; three soft folds near the gauntlet
  ARM_GEO.fore = armLoft([ring(-0.07, 0.0001, 0.0001), ring(-0.06, 0.026, 0.026), ring(-0.035, 0.038, 0.037), ring(0.0, 0.042, 0.040), ring(0.1, 0.043, 0.038),
    ring(0.22, 0.043, 0.037), ring(0.36, 0.041, 0.034), ring(0.5, 0.039, 0.031), ring(0.64, 0.035, 0.0285), ring(0.78, 0.0325, 0.0265), ring(0.9, 0.031, 0.0255), ring(1.0, 0.0305, 0.025)], 20);
  // glove gauntlet: flared, slightly flat, open towards the hand
  ARM_GEO.cuff = handLoft([ring(0, 0.0345, 0.0285, 2.3), ring(0.15, 0.0368, 0.0306, 2.3), ring(0.7, 0.0378, 0.0318, 2.3), ring(0.88, 0.0384, 0.0322, 2.3), ring(0.97, 0.034, 0.027, 2.3), ring(1.0, 0.026, 0.018, 2.3), ring(1.0, 0.0001, 0.0001)], 20);
  return ARM_GEO;
}
// race-suit fabric (Nomex): matte, a little darker than the livery, with a canvas texture that breaks up the flat colour:
// soft creases across the sleeve, a stitched seam on the inner side and a quilted band at the elbow (u around, v along)
let SUIT_TEX = null;
function suitTexture() {
  if (SUIT_TEX) return SUIT_TEX;
  const W = 128, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#e9e9e9'; g.fillRect(0, 0, W, H);
  let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 26; k++) {   // creases: soft dark bands across the sleeve, slightly slanted, lighter ridge beside them
    const y = rnd() * H, w = 2 + rnd() * 5, a = 0.05 + rnd() * 0.09, sl = (rnd() - 0.5) * 18;
    const gr = g.createLinearGradient(0, y - w, 0, y + w); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(0, 0); g.transform(1, sl / W, 0, 1, 0, 0); g.fillStyle = gr; g.fillRect(0, y - w, W, 2 * w);
    g.fillStyle = `rgba(255,255,255,${a * 0.6})`; g.fillRect(0, y + w, W, 1.2); g.restore();
  }
  for (let k = 0; k < 4000; k++) { const v = rnd() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},0.035)`; g.fillRect(rnd() * W, rnd() * H, 1, 1); }   // weave grain
  for (const u of [0.25 * W, 0.75 * W]) {   // seams: a darker line with stitches
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(u - 1, 0, 2, H);
    g.fillStyle = 'rgba(255,255,255,0.18)'; for (let y = 0; y < H; y += 5) g.fillRect(u + 2, y, 1, 2.5);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return SUIT_TEX = t;
}
function suitMaterial(c) {
  const col = c ? c.clone() : new THREE.Color('#1c2027'), hsl = {}; col.getHSL(hsl);
  col.setHSL(hsl.h, hsl.s * 0.8, Math.min(hsl.l, hsl.s < 0.2 ? 0.09 : 0.2));   // white / silver liveries: charcoal suit (a pale sleeve read as grey plastic)
  return new THREE.MeshStandardMaterial({ color: col, map: suitTexture(), roughness: 0.93, metalness: 0, envMapIntensity: 0.5 });
}
function buildArm(sx, sleeveMat, cuffMat) {
  const G = armGeo(), g = new THREE.Group();
  const upper = new THREE.Mesh(G.upper, sleeveMat), fore = new THREE.Mesh(G.fore, sleeveMat), cuff = new THREE.Mesh(G.cuff, cuffMat || sleeveMat);
  for (const m of [upper, fore, cuff]) { m.castShadow = false; m.frustumCulled = false; g.add(m); }
  g.visible = false;   // shown after the first solve (no giant default-pose frame when the cockpit view opens)
  return { group: g, upper, fore, cuff, sx, L1: 0.30, L2: 0.27, E: new THREE.Vector3(), S: new THREE.Vector3() };
}
const ARM_POLE = new THREE.Vector3(0.6, -0.75, -0.15);   // elbow direction (x mirrored per side)
const _ak = { u: new THREE.Vector3(), v: new THREE.Vector3(), p: new THREE.Vector3(), d: new THREE.Vector3(), x: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4() };
// orient a limb mesh: local +y from a to b (scaled to the length), local +z towards zHint (roll)
function armBone(mesh, a, b, zHint, sc) {
  const { d, x, z, m } = _ak;
  d.subVectors(b, a); const l = Math.max(d.length(), 1e-5); d.multiplyScalar(1 / l);
  z.copy(zHint).addScaledVector(d, -zHint.dot(d)); if (z.lengthSq() < 1e-8) z.set(0, 0, 1).addScaledVector(d, -d.z); z.normalize();
  x.crossVectors(d, z); m.makeBasis(x, d, z);
  mesh.quaternion.setFromRotationMatrix(m); mesh.position.copy(a); mesh.scale.set(1, sc != null ? sc : l, 1);
}
// S0: rest shoulder, W: wrist, back: back-of-hand direction (forearm roll), all in the interior frame
function solveArm(A, S0, W, back) {
  const { u, v, p, d } = _ak;
  const L1 = A.L1, L2 = A.L2, reach = (L1 + L2) * 0.93;
  // scapula: the shoulder comes forward / in towards the hand by up to 14 cm when the hand is out of easy reach
  const S = A.S.copy(S0); d.subVectors(W, S); let dist = d.length();
  if (dist > reach) { const k = Math.min(dist - reach, 0.14); S.addScaledVector(d, k / dist); d.subVectors(W, S); dist = d.length(); }
  u.copy(d).multiplyScalar(1 / Math.max(dist, 1e-5));
  let l1 = L1, l2 = L2;
  if (dist > l1 + l2 - 0.004) { const k = (dist + 0.004) / (l1 + l2); l1 *= k; l2 *= k; }
  const dd = Math.max(dist, Math.abs(l1 - l2) + 0.01);
  const xx = (dd * dd + l1 * l1 - l2 * l2) / (2 * dd), h = Math.sqrt(Math.max(l1 * l1 - xx * xx, 0));
  // pole: elbow out to the side and down (inside the cockpit sides), a touch back
  p.set(A.sx * ARM_POLE.x, ARM_POLE.y, ARM_POLE.z); v.copy(p).addScaledVector(u, -p.dot(u)); if (v.lengthSq() < 1e-6) v.set(0, -1, 0); v.normalize();
  A.E.copy(S).addScaledVector(u, xx).addScaledVector(v, h);
  // upper arm: roll so the biceps faces forward-in; forearm: flat side follows the back of the hand
  p.set(-A.sx * 0.3, 0.2, 1);
  armBone(A.upper, S, A.E, p);
  armBone(A.fore, A.E, W, back || v);
  // gauntlet: last 6.5 cm of the forearm running 1.2 cm into the glove
  d.subVectors(W, A.E).normalize(); p.copy(W).addScaledVector(d, -0.065);
  armBone(A.cuff, p, W, back || v, 0.077);
  A.group.visible = true;
}
