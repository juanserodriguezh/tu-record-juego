// ============================================================================
//  PROCEDURAL CAR MODELS  (+Z forward, +X left, +Y up, origin on the ground under the CG)
//  Closed bodies are lofted shells with real wheel arches and a separate greenhouse.
//  Every part is merged per material (paint / trim / gloss / lights / brake / decals),
//  so a whole car costs about ten draw calls.
// ============================================================================
const RIMS = { plata: '#c9ced4', negro: '#1d1e21', oro: '#c9a24a', bronce: '#8c6a45' };
const CM = {}; // shared materials / geometry caches
function carMaterials() {
  if (CM.trim) return;
  const phys = (o) => new THREE.MeshPhysicalMaterial(Object.assign({ vertexColors: true }, o));
  CM.paint = {
    brillo: phys({ roughness: 0.34, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05 }),
    mate: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.0 }),
    metal: phys({ roughness: 0.26, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08 })
  };
  CM.trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 });
  CM.gloss = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.35 });
  CM.light = new THREE.MeshBasicMaterial({ vertexColors: true });
  CM.brakeOff = new THREE.MeshStandardMaterial({ color: 0x7a0c08, roughness: 0.2, metalness: 0.1, emissive: 0x2a0000 });
  CM.brakeOn = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  CM.wheel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.4 });
  CM.screen = new THREE.MeshPhysicalMaterial({ color: 0x223040, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  // cockpit-only materials (a single car's interior is ever visible)
  CM.dark = new THREE.MeshLambertMaterial({ color: 0x16181b });
  CM.carbon = new THREE.MeshLambertMaterial({ color: 0x1f2124 });
  CM.interior = new THREE.MeshLambertMaterial({ color: 0x1e2024 });
  CM.interior2 = new THREE.MeshLambertMaterial({ color: 0x2c2f34 });
  CM.steel = new THREE.MeshLambertMaterial({ color: 0x8b9096 });
  CM.wheelGeo = new Map(); CM.decal = new Map();
}
const C3 = (() => { const cache = new Map(); return (hex) => { let c = cache.get(hex); if (!c) { c = new THREE.Color(hex); cache.set(hex, c); } return c; }; })();
const GLASS = '#0b1117', BLACK = '#151618', CARBON = '#1d1f22', CHROME = '#c9ced4', TYRE = '#161616';

function numberTex(num, bg, fg) {
  return canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = bg || '#ffffff'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
    g.fillStyle = fg || '#111111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "800 84px 'Saira Condensed', 'Arial Narrow', sans-serif"; g.fillText(num, 64, 70);
  });
}
function bigNumberTex(num, fill, stroke) {
  return canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "italic 800 230px 'Saira Condensed', 'Arial Narrow', sans-serif";
    g.lineWidth = 16; g.strokeStyle = stroke; g.strokeText(num, 128, 140); g.fillStyle = fill; g.fillText(num, 128, 140);
  });
}
function decalMat(key, make) {
  let m = CM.decal.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: make(), transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); CM.decal.set(key, m); }
  return m;
}

// ---------------------------------------------------------------------------
//  Kit: collects coloured geometry per material key, merges at the end
// ---------------------------------------------------------------------------
const _km = new THREE.Matrix4(), _kq = new THREE.Quaternion(), _ke = new THREE.Euler(), _ks = new THREE.Vector3(), _kp = new THREE.Vector3();
class Kit {
  constructor() { this.parts = {}; }
  put(key, geo, color, m) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    for (const nm of Object.keys(g.attributes)) if (nm !== 'position' && nm !== 'normal' && nm !== 'color' && !(key === 'decal' && nm === 'uv')) g.deleteAttribute(nm);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (color != null || !g.attributes.color) {
      const c = color && color.isColor ? color : C3(color != null ? color : '#ffffff'), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    (this.parts[key] || (this.parts[key] = [])).push(g);
    return g;
  }
  xf(x, y, z, rx, ry, rz) { _ke.set(rx || 0, ry || 0, rz || 0); _kq.setFromEuler(_ke); _kp.set(x || 0, y || 0, z || 0); _ks.set(1, 1, 1); return _km.compose(_kp, _kq, _ks); }
  box(key, col, sx, sy, sz, x, y, z, rx, ry, rz) { return this.put(key, new THREE.BoxGeometry(sx, sy, sz), col, this.xf(x, y, z, rx, ry, rz)); }
  bar(key, col, p0, p1, t) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), o = new THREE.Object3D();
    o.position.copy(a).add(b).multiplyScalar(0.5); o.lookAt(b); o.updateMatrix();
    return this.put(key, new THREE.BoxGeometry(t, t, a.distanceTo(b)), col, o.matrix);
  }
  cyl(key, col, r0, r1, h, seg, x, y, z, rx, ry, rz) { return this.put(key, new THREE.CylinderGeometry(r0, r1, h, seg || 10), col, this.xf(x, y, z, rx, ry, rz)); }
  plane(key, w, h, x, y, z, rx, ry, rz) { return this.put(key, new THREE.PlaneGeometry(w, h), '#ffffff', this.xf(x, y, z, rx, ry, rz)); }
  mesh(key, mat) { const L = this.parts[key]; if (!L || !L.length) return null; return new THREE.Mesh(mergeGeos(L), mat); }
}

// smooth monotone-ish curve through [t, v] points (cubic Hermite, finite-difference tangents)
function curveAt(pts, t) {
  const n = pts.length;
  if (t <= pts[0][0]) return pts[0][1];
  if (t >= pts[n - 1][0]) return pts[n - 1][1];
  let i = 1; while (t > pts[i][0]) i++;
  const [t0, v0] = pts[i - 1], [t1, v1] = pts[i], h = t1 - t0, u = (t - t0) / h;
  const slope = (k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)]; return (b[1] - a[1]) / (b[0] - a[0]); };
  let m0 = slope(i - 1), m1 = slope(i);
  const d = (v1 - v0) / h; if (d === 0) { m0 = m1 = 0; } else { if (m0 * d < 0) m0 = 0; if (m1 * d < 0) m1 = 0; }
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * m1;
}

// Loft closed rings along z. ringFn(z) -> K points [x, y]; tagFn(seg, z) -> [key, THREE.Color] (null key = skip)
function loftShell(kit, zs, ringFn, K, segOf, tagFn, capF, capR) {
  const rings = zs.map(z => ringFn(z));
  const P = [], idx = [], tags = [];
  for (let i = 0; i < zs.length; i++) for (let k = 0; k < K; k++) P.push(rings[i][k][0], rings[i][k][1], zs[i]);
  for (let i = 0; i < zs.length - 1; i++) {
    const zc = (zs[i] + zs[i + 1]) / 2;
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K, a = i * K + k, b = i * K + k2, c = (i + 1) * K + k, d = (i + 1) * K + k2;
      const tg = tagFn(segOf(k), zc);
      idx.push(a, b, d, a, d, c); tags.push(tg, tg);
    }
  }
  // caps: a plain tag, or { outer, inner, center: [x, y], scale, bulge } for a two-ring domed cap (grille / fascia)
  const cap = (i, front, cfg) => {
    if (!cfg) return;
    const opt = Array.isArray(cfg) ? { outer: cfg } : cfg, r = rings[i], z = zs[i], dz = front ? 1 : -1;
    const base = P.length / 3; let cy = 0;
    for (let k = 0; k < K; k++) { P.push(r[k][0], r[k][1], z); cy += r[k][1]; }
    cy /= K;
    const gc = opt.center || [0, cy], bz = opt.bulge || 0;
    if (opt.inner) {
      const sc = opt.scale || 0.5, inr = base + K, c = base + 2 * K;
      for (let k = 0; k < K; k++) P.push(lerp(r[k][0], gc[0], sc), lerp(r[k][1], gc[1], sc), z + dz * bz * 0.8);
      P.push(gc[0], gc[1], z + dz * bz);
      for (let k = 0; k < K; k++) {
        const k2 = (k + 1) % K;
        if (front) { idx.push(inr + k, base + k, base + k2, inr + k, base + k2, inr + k2, c, inr + k, inr + k2); }
        else { idx.push(inr + k, base + k2, base + k, inr + k, inr + k2, base + k2, c, inr + k2, inr + k); }
        tags.push(opt.outer, opt.outer, opt.inner);
      }
    } else {
      P.push(gc[0], gc[1], z + dz * bz); const c = base + K;
      for (let k = 0; k < K; k++) { const k2 = (k + 1) % K; if (front) idx.push(c, base + k, base + k2); else idx.push(c, base + k2, base + k); tags.push(opt.outer); }
    }
  };
  cap(zs.length - 1, true, capF); cap(0, false, capR);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
  const pa = g.attributes.position.array, na = g.attributes.normal.array, out = {};
  for (let t = 0; t < tags.length; t++) {
    const tg = tags[t]; if (!tg || !tg[0]) continue;
    const o = out[tg[0]] || (out[tg[0]] = { p: [], n: [], c: [] }), cc = tg[1];
    for (let j = 0; j < 3; j++) { const v = idx[t * 3 + j]; o.p.push(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2]); o.n.push(na[v * 3], na[v * 3 + 1], na[v * 3 + 2]); o.c.push(cc.r, cc.g, cc.b); }
  }
  for (const key in out) {
    const o = out[key], geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
    kit.put(key, geo, null);
  }
}
// simple superellipse loft (open-wheelers, prototypes, pods)
function loft(secs, K) {
  K = K || 14;
  secs = secs.slice().sort((p, q) => q.z - p.z);
  const S = secs.length, pos = [], idx = [];
  const ring = (sc) => {
    const a = sc.w / 2, b = (sc.y1 - sc.y0) / 2, cy = (sc.y1 + sc.y0) / 2, cx = sc.x || 0, n = sc.n || 3, r = [];
    for (let k = 0; k < K; k++) { const th = k / K * Math.PI * 2, c = Math.cos(th), s = Math.sin(th); r.push(cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n), sc.z); }
    return r;
  };
  const rings = secs.map(ring);
  for (const r of rings) for (let k = 0; k < K; k++) pos.push(r[k * 3], r[k * 3 + 1], r[k * 3 + 2]);
  for (let i = 0; i < S - 1; i++) for (let k = 0; k < K; k++) {
    const k2 = (k + 1) % K, a = i * K + k, b = i * K + k2, c = (i + 1) * K + k, d = (i + 1) * K + k2;
    idx.push(a, c, d, a, d, b);
  }
  const cap = (i, front) => {
    const base = pos.length / 3, sc = secs[i], r = rings[i];
    for (let k = 0; k < K; k++) pos.push(r[k * 3], r[k * 3 + 1], r[k * 3 + 2]);
    pos.push(sc.x || 0, (sc.y0 + sc.y1) / 2, sc.z);
    const c = base + K;
    for (let k = 0; k < K; k++) { const k2 = (k + 1) % K; if (front) idx.push(c, base + k, base + k2); else idx.push(c, base + k2, base + k); }
  };
  cap(0, true); cap(S - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function mbox(sx, sy, sz, mat, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0);
  return m;
}
function bar(p0, p1, t, mat) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, len), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b);
  return m;
}

// ---------------------------------------------------------------------------
//  Wheels: lathe tyre + five double-spoke rim + disc, one mesh per wheel
// ---------------------------------------------------------------------------
function wheelGeometry(R, w, rimHex, race, rimScale) {
  const key = [R, w, rimHex, race ? 1 : 0, rimScale].join('|');
  let g = CM.wheelGeo.get(key);
  if (g) return g;
  const kit = new Kit();
  const rr = R * (rimScale || 0.7), hw = w / 2;
  // tyre + inner rim barrel as one lathe (profile around the axle)
  const prof = [[rr * 0.96, -hw + 0.03], [rr * 1.0, -hw + 0.012], [R - 0.04, -hw], [R - 0.01, -hw + 0.02], [R, -hw + 0.05], [R, hw - 0.05], [R - 0.01, hw - 0.02], [R - 0.04, hw], [rr * 1.0, hw - 0.012], [rr * 0.985, hw - 0.03], [rr * 0.94, hw - 0.04], [rr * 0.94, -hw + 0.05]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 22).rotateZ(-Math.PI / 2);
  const tg = lathe.toNonIndexed(); const pa = tg.attributes.position, cols = new Float32Array(pa.count * 3);
  const cT = C3(TYRE), cS = C3(race ? '#1b1b1b' : '#232324'), cR = C3(rimHex).clone().multiplyScalar(0.55);
  for (let i = 0; i < pa.count; i++) { const r = Math.hypot(pa.getY(i), pa.getZ(i)); const c = r < rr * 1.001 + 0.002 ? cR : r > R - 0.012 ? cT : cS; cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3)); tg.deleteAttribute('uv');
  kit.put('w', tg, null);
  const rc = C3(rimHex), face = hw - 0.035;
  // rim lip
  kit.put('w', new THREE.RingGeometry(rr * 0.86, rr * 1.0, 24).rotateY(Math.PI / 2), rc, kit.xf(face + 0.012, 0, 0));
  // spokes (five doubles)
  const r0 = rr * 0.22, r1 = rr * 0.9, len = r1 - r0;
  for (let k = 0; k < 10; k++) {
    const th = (Math.floor(k / 2) * 2 * Math.PI / 5) + (k % 2 ? 0.13 : -0.13), rm = (r0 + r1) / 2;
    kit.put('w', new THREE.BoxGeometry(0.03, len, rr * 0.11), rc, kit.xf(face, Math.cos(th) * rm, Math.sin(th) * rm, th - Math.PI / 2 + Math.PI / 2, 0, 0));
  }
  kit.cyl('w', rc, r0, r0 * 1.1, 0.06, 14, face - 0.01, 0, 0, 0, 0, -Math.PI / 2);
  kit.cyl('w', C3('#2a2c30'), r0 * 0.45, r0 * 0.45, 0.07, 10, face, 0, 0, 0, 0, -Math.PI / 2);
  // brake disc behind the spokes
  kit.cyl('w', C3('#6d7074'), rr * 0.82, rr * 0.82, 0.028, 22, face - 0.13, 0, 0, 0, 0, -Math.PI / 2);
  g = mergeGeos(kit.parts.w);
  CM.wheelGeo.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------
function buildCar(spec, liv, opts) {
  carMaterials();
  opts = opts || {};
  const L = spec.len, W = spec.wid, H = spec.hgt, wb = spec.wb;
  const a = wb * (1 - spec.wf), b = wb * spec.wf;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const interior = new THREE.Group(); interior.visible = false; body.add(interior);
  const kit = new Kit(), hk = new Kit();
  const out = { root, body, interior, kit, hk, a, b, L, W, H, wheels: [], steerPivots: [], spec, lite: !!opts.lite, liv,
    col1: C3(liv.col || '#dddddd'), col2: C3(liv.col2 || '#111111'), col3: C3(liv.col3 || spec.col3 || '#d5001c'), rim: RIMS[liv.rim] || RIMS.plata };
  const kind = spec.body;
  if (spec.model === 'valkyrie') buildValkyrie(out, spec, liv);
  else if (spec.model === 'bolide') buildBolide(out, spec, liv);
  else if (spec.model === 'chiron') buildChiron(out, spec, liv);
  else if (spec.model === 'amgone') buildAmgOne(out, spec, liv);
  else if (spec.model === 'formulae') buildFormulaE(out, spec, liv);
  else if (kind === 'f1h') buildF1Hybrid(out, spec, liv);
  else if (kind === 'f1' || kind === 'indy') buildOpenWheel(out, spec, liv, kind);
  else if (kind === 'lmp') buildLMP(out, spec, liv);
  else if (kind === 'stock') buildClosed(out, spec, liv);
  else buildBody(out, spec, liv);
  // real 3D model: the procedural exterior parts are dropped (cockpit, helmet, cameras stay)
  const glbOn = !!(spec.glb && GLBS[spec.glb]);
  if (glbOn) for (const k of Object.keys(kit.parts)) delete kit.parts[k];
  // merge per material
  const paintMat = CM.paint[liv.finish] || CM.paint.brillo;
  if (kit.parts.cabin) { cabinMaterials(); const m = kit.mesh('cabin', CM.cab); if (m) body.add(m); }
  for (const [key, mat] of [['paint', paintMat], ['trim', CM.trim], ['gloss', CM.gloss], ['light', CM.light]]) { const m = kit.mesh(key, mat); if (m) body.add(m); }
  const brake = kit.mesh('brake', CM.brakeOff); if (brake) body.add(brake);
  out.setBrake = (on) => { if (brake) brake.material = on ? CM.brakeOn : CM.brakeOff; };
  if (out.decalMat) { const d = kit.mesh('decal', out.decalMat); if (d) body.add(d); }
  if (hk.parts.paint) { const hm = hk.mesh('paint', CM.paint.brillo); body.add(hm); out.helmetParts = [hm]; const hs = hk.mesh('gloss', CM.gloss); if (hs) { body.add(hs); out.helmetParts.push(hs); } }
  if (hk.parts.trim && !glbOn) { const ho = hk.mesh('trim', CM.trim); body.add(ho); out.hideInCockpit = [ho]; }
  if (glbOn) applyGlb(out, spec);
  if (spec.inPitch != null && out.cams) out.cams.inPitch = spec.inPitch;
  if (glbOn && spec.model === 'formulae') buildCockHalo(out);
  if (glbOn && spec.aero) buildAeroscreen(out, spec.aero, spec.dy || 0);
  // open-wheelers: the procedural screen/windshield glass floats next to the scanned halo/aeroscreen frame -> drop it
  if (glbOn && ['f1', 'f1h', 'indy', 'fe'].includes(kind)) { const rm = []; body.traverse(o => { if (o.isMesh && o.material && o.material.transparent && o.material.opacity < 0.35) rm.push(o); }); for (const o of rm) o.parent.remove(o); }
  if (glbOn && spec.aero) buildIndyCockpit(out);
  // blob shadow
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.3, L * 1.08).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, opacity: 0.9 }));
  blob.position.y = 0.03; blob.renderOrder = 1; root.add(blob); out.blob = blob;
  root.traverse(o => { if (o.isMesh && o !== blob) o.castShadow = true; });
  delete out.kit; delete out.hk;
  return out;
}

// IndyCar aeroscreen: the scan only carries the halo-like frame; this adds the ballistic screen (smoked polycarbonate wrap) between the
// central strut and the cockpit sides. a = { zf, zt, yf, yt, w, drop } in body coordinates (front base z / top z, base y / top y, half width, side drop)
function buildAeroscreen(out, a, dy, key) {
  const NU = 14, NV = 24, pos = [], idx = [];
  for (let i = 0; i <= NU; i++) { const u = i / NU;
    for (let j = 0; j <= NV; j++) { const v = (j / NV) * 2 - 1, av = Math.abs(v);
      const W = a.w + (a.wt - a.w) * u, y0 = a.yf + (a.yt - a.yf) * Math.pow(u, 0.85), drop = a.drop * (1 - 0.5 * u);
      const x = v * W, y = y0 - drop * Math.pow(av, 2.4) + dy, z = a.zf + (a.zt - a.zf) * u - a.wrap * (1 - 0.7 * u) * Math.pow(av, 2.2);
      pos.push(x, y, z); } }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const p = i * (NV + 1) + j, q = p + NV + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x55707f, metalness: 0.1, roughness: 0.14, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.1 });
  const m = new THREE.Mesh(g, mat); m.renderOrder = 7; m.castShadow = false; m.frustumCulled = false; m.name = 'aeroscreen';
  // titanium frame: roof bar, base rail, wrap-around side edges and the central pillar
  const P = (i, j) => { const k = (i * (NV + 1) + j) * 3; return new THREE.Vector3(pos[k], pos[k + 1], pos[k + 2]); };
  const fm = new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.65, roughness: 0.38 });
  const tube = (pts, r) => { const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, r, 8), fm); t.castShadow = false; t.frustumCulled = false; m.add(t); };
  const top = [], base = [], sideL = [], sideR = [], mid = [];
  for (let j = 0; j <= NV; j += 2) { top.push(P(NU, j)); base.push(P(0, j)); }
  for (let i = 0; i <= NU; i += 2) { sideL.push(P(i, 0)); sideR.push(P(i, NV)); mid.push(P(i, NV / 2)); }
  tube(top, 0.017); tube(base, 0.014); tube(sideL, 0.013); tube(sideR, 0.013); tube(mid, 0.02);
  out.body.add(m); out[key || 'aero'] = m; return m;
}


// IndyCar first person (driver POV like the real onboard): the scan is clipped away around the cockpit (spec.cabClip) and replaced by a
// procedural carbon tub: cockpit rims, dash cowl, black aeroscreen frame (top brow, central pillar with camera pod, side frames) and
// an almost clear ballistic screen. All coordinates are relative to the eye (+z forward, +y up). Shown only in the cockpit view.
function buildIndyCockpit(out) {
  const e = out.eye, g = new THREE.Group(); g.visible = false;
  const carbon = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
  const carbonM = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide });
  const P = (x, y, z) => new THREE.Vector3(e.x + x, e.y + y, e.z + z);
  const surf = (fn, nu, nv, mat) => { const pos = [], idx = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const p = fn(i / nu, j / nv); pos.push(p.x, p.y, p.z); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const p = i * (nv + 1) + j, q = p + nv + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.castShadow = false; g.add(m); return m; };
  const tube = (pts, r, mat) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 6, r, 10), mat || carbon); m.frustumCulled = false; g.add(m); return m; };
  const lerp = (a, b, t) => a + (b - a) * t, sm = t => t * t * (3 - 2 * t);
  // cockpit rims: rounded carbon edge on each side, the opening narrows towards the cowl
  const prof = [[0.47, -0.42], [0.43, -0.26], [0.37, -0.205], [0.31, -0.195], [0.275, -0.22], [0.26, -0.5]];
  const profAt = (v) => { const f = v * (prof.length - 1), k = Math.min(Math.floor(f), prof.length - 2), t = f - k; return [lerp(prof[k][0], prof[k + 1][0], t), lerp(prof[k][1], prof[k + 1][1], t)]; };
  for (const sx of [1, -1]) surf((u, v) => { const z = lerp(-0.45, 0.62, u), n = 1 - 0.32 * sm(Math.max(0, (z - 0.15) / 0.47)), [x, y] = profAt(v);
    return P(sx * x * n, y + 0.025 * sm(Math.max(0, (z - 0.2) / 0.42)), z); }, 24, 20, carbon);
  // dash cowl: hood over the driver's legs, from the rims to the nose
  surf((u, v) => { const z = lerp(0.5, 1.15, u), w = lerp(0.30, 0.2, u), x = (v * 2 - 1) * w, c = 1 - (x / w) * (x / w);
    return P(x, lerp(-0.175, -0.25, u) + 0.06 * c * (1 - 0.6 * u), z); }, 14, 20, carbonM);
  // aeroscreen top brow (inside of the frame above the helmet)
  surf((u, v) => { const x = (v * 2 - 1) * lerp(0.3, 0.34, u), a = (x / 0.32) * (x / 0.32);
    return P(x, lerp(0.135 - 0.05 * a, 0.2 - 0.02 * a, u), lerp(0.36 - 0.12 * a, -0.02, u)); }, 8, 24, carbonM);
  // frame edges: front edge of the brow, side frames down to the rims, base rail over the cowl
  const brow = [], sideL = [], sideR = [], base = [];
  for (let j = 0; j <= 12; j++) { const x = (j / 6 - 1) * 0.3, a = (x / 0.32) * (x / 0.32); brow.push(P(x, 0.135 - 0.05 * a, 0.36 - 0.12 * a)); }
  for (const [arr, sx] of [[sideL, -1], [sideR, 1]]) for (let i = 0; i <= 6; i++) { const t = i / 6; arr.push(P(sx * lerp(0.3, 0.335, t), lerp(0.085, -0.19, t), lerp(0.24, 0.3, sm(t)))); }
  for (let j = 0; j <= 12; j++) { const t = j / 12, x = (t * 2 - 1) * 0.31; base.push(P(x, -0.19 + 0.05 * (1 - (x / 0.31) ** 2), 0.3 + 0.5 * (1 - (x / 0.31) ** 2))); }
  tube(brow, 0.024, carbonM); tube(sideL, 0.022, carbonM); tube(sideR, 0.022, carbonM); tube(base, 0.012, carbonM);
  // central pillar from the cowl up to the brow, with the forward camera pod
  tube([P(0, -0.13, 0.8), P(0, -0.03, 0.6), P(0, 0.07, 0.42), P(0, 0.13, 0.35)], 0.016, carbonM);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 14).rotateX(Math.PI / 2), carbonM); pod.position.copy(P(0, -0.005, 0.54)); g.add(pod);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.08), carbonM); cam.position.copy(P(0, 0.16, 0.22)); g.add(cam);
  // ballistic screen: clear polycarbonate between the brow, the side frames and the cowl
  const glass = new THREE.MeshStandardMaterial({ color: 0x8aa3b0, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
  const gm = surf((u, v) => { const x = (v * 2 - 1) * 0.3, a = (x / 0.31) ** 2;
    return P(x * lerp(1, 1.03, u), lerp(0.135 - 0.05 * a, -0.19 + 0.05 * (1 - a), u), lerp(0.36 - 0.12 * a, 0.3 + 0.5 * (1 - a), u)); }, 10, 20, glass);
  gm.renderOrder = 7;
  out.body.add(g); out.cockAero = g;
}

// first-person halo for the scanned open-wheelers (IndyCar, Formula E): the scanned halo is clipped out of the cockpit view and replaced by
// a thin carbon arch + centre strut placed relative to the eye (same look as the W11's: one slim bar rising from the scuttle, arms out of view)
function buildCockHalo(out) {
  const e = out.eye, g = new THREE.Group(); g.visible = false;
  const mat = new THREE.MeshStandardMaterial({ color: 0x101316, roughness: 0.42, metalness: 0.35 });
  const P = (x, y, z) => new THREE.Vector3(e.x + x, e.y + y, e.z + z);
  const A = P(0, 0.10, 0.55), B = P(0, -0.17, 1.02);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([A, P(0, -0.03, 0.78), B]), 12, 0.026, 8), mat));
  for (const sx of [1, -1]) {
    const arm = new THREE.CatmullRomCurve3([A, P(sx * 0.09, 0.11, 0.47), P(sx * 0.20, 0.08, 0.27), P(sx * 0.26, -0.02, 0.05), P(sx * 0.27, -0.17, -0.18)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(arm, 24, 0.019, 8), mat));
  }
  out.body.add(g); out.cockHalo = g;
}

// Fitted compound -> tyre look (race cars only). Scanned tyres whose texture carries coloured sidewall markings (e.g. the W11's yellow
// P ZERO lettering + band) get those saturated texels recoloured to the compound colour, so the whole tyre image changes with the compound;
// tyres with plain dark/white sidewalls keep the coloured ring painted on the sidewall.
// mode: 1 = saturated coloured markings (W11 yellow P ZERO), 2 = plain white/grey lettering (F2004 Bridgestone), 0 = nothing to recolour
function tyreTexMode(mat) {
  const t = mat && mat.map; if (!t || !t.image) return 0;
  if (t.userData.tyreMode != null) return t.userData.tyreMode;
  let mode = 0;
  try {
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(t.image, 0, 0, S, S); const d = g.getImageData(0, 0, S, S).data; let nSat = 0, nWhite = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), sat = mx ? (mx - mn) / mx : 0;
      if (mx > 90 && sat > 0.55) nSat++; else if (mx > 110 && sat < 0.3) nWhite++;
    }
    const px = S * S;
    mode = nSat / px > 0.004 ? 1 : (nWhite / px > 0.004 && nWhite / px < 0.12 ? 2 : 0);
  } catch (e) { mode = 0; }
  return t.userData.tyreMode = mode;
}
function tyreColorMat(base, hex, mode) {
  CM.tyreTexMat = CM.tyreTexMat || new Map();
  const key = base.uuid + '|' + hex + '|' + mode; let m = CM.tyreTexMat.get(key); if (m) return m;
  m = base.clone(); const col = new THREE.Color(hex);
  const body = mode === 2
    ? `float k = smoothstep(0.12, 0.28, mx) * (1.0 - smoothstep(0.18, 0.4, sat));
        diffuseColor.rgb = mix(diffuseColor.rgb, uTyreCol * (0.5 + 0.9 * mx), k);`
    : `float k = smoothstep(0.38, 0.62, sat) * smoothstep(0.05, 0.2, mx);
        diffuseColor.rgb = mix(diffuseColor.rgb, uTyreCol * (0.45 + 1.1 * mx), k);`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTyreCol = { value: col };
    sh.fragmentShader = 'uniform vec3 uTyreCol;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
        float sat = (mx - mn) / max(mx, 1e-3);
        ${body} }`);
  };
  m.customProgramCacheKey = () => 'tyrecol' + mode;
  CM.tyreTexMat.set(key, m); return m;
}
// outward sidewall surface of a GLB tyre (wheel-local x, outward positive) where the fallback compound ring is laid
function tyreRingX(w) {
  if (w.userData.ringX != null) return w.userData.ringX;
  const R = w.userData.R, out = w.userData.out || 1; let best = -1e9;
  const v = new THREE.Vector3();
  w.traverse(o => {
    if (!o.isMesh || !o.geometry || !/tyre|tire|rubber/i.test(o.name + ((o.userData.tyreBase || o.material).name || ''))) return;
    const P = o.geometry.attributes.position; o.updateMatrix();
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrix); const r = Math.hypot(v.y, v.z); if (r > R * 0.8 && r < R * 0.9) best = Math.max(best, v.x * out); }
  });
  return w.userData.ringX = best > -1e8 ? best + 0.002 : (w.userData.hw || 0.15) + 0.0015;
}
function setTyreMark(model, hex) {
  if (!model || !model.spec || !model.spec.race) return;
  CM.tyreMarkMat = CM.tyreMarkMat || {};
  const mat = CM.tyreMarkMat[hex] || (CM.tyreMarkMat[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  for (const w of model.wheels) {
    const R = w.userData.R, hw = w.userData.hw; if (!R) continue;
    let textured = false;
    if (model.glb) w.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const base = o.userData.tyreBase || o.material;
      if (!(/tyre|tire|rubber/i.test(o.name) || /tyre|tire|rubber/i.test(base.name || ''))) return;
      const mode = tyreTexMode(base); if (!mode) return;
      o.userData.tyreBase = base; o.material = tyreColorMat(base, hex, mode); textured = true;
    });
    const rx = model.glb ? tyreRingX(w) : hw + 0.0015, sgn = model.glb ? (w.userData.out || 1) : 1;
    if (w.userData.mark) { w.userData.mark.material = mat; w.userData.mark.visible = !textured; continue; }
    if (textured) continue;
    const g = new THREE.RingGeometry(R * 0.81, R * 0.9, 40).rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.x = sgn * rx; w.add(m); w.userData.mark = m;
  }
}
function addWheels(out, R, wF, wR, halfF, halfR, race, rimScale) {
  const { a, b, body } = out;
  for (const [z, half, w, front] of [[a, halfF, wF, true], [-b, halfR, wR, false]]) {
    const geo = wheelGeometry(R, w, out.rim, race, rimScale);
    if (out.kit && out.caliper) for (const side of [1, -1]) {
      const rr = R * (rimScale || 0.7), th = front ? 0.5 : Math.PI - 0.5;
      out.kit.box('trim', C3(out.caliper), 0.055, rr * 0.28, rr * 0.62, side * (half + w / 2 - 0.16), R + Math.sin(th) * rr * 0.62, z + Math.cos(th) * rr * 0.62, th - Math.PI / 2, 0, 0);
    }
    for (const side of [1, -1]) {
      const wheel = new THREE.Mesh(geo, CM.wheel);
      if (side < 0) wheel.rotation.y = Math.PI;
      if (front) {
        const piv = new THREE.Group(); piv.position.set(side * half, R, z); piv.add(wheel); body.parent.add(piv);
        out.steerPivots.push(piv);
      } else { wheel.position.set(side * half, R, z); body.parent.add(wheel); }
      wheel.userData.R = R; wheel.userData.hw = w / 2;
      out.wheels.push(wheel);
    }
  }
}

// ---------------------------------------------------------------------------
//  Closed cars (road, GT3, track specials, stock car)
// ---------------------------------------------------------------------------
// side profile of the hood/deck centre line (t: 0 rear bumper -> 1 front bumper, value * H),
// greenhouse stations A (windshield base) B (roof front) C (roof rear) D (rear glass base)
const STYLES = {
  hatch:  { prof: [[0, .46], [.025, .62], [.09, .67], [.5, .65], [.78, .63], [.92, .57], [1, .46]], A: .76, B: .57, C: .3, D: .06, rcF: .5, rcR: .34, taper: .03, clr: .13, mid: false, bulge: .012 },
  muscle: { prof: [[0, .46], [.03, .6], [.14, .63], [.6, .6], [.92, .56], [1, .47]], A: .67, B: .55, C: .34, D: .21, rcF: .34, rcR: .3, taper: .02, clr: .13, mid: false, bulge: .02 },
  gt:     { prof: [[0, .43], [.03, .56], [.12, .6], [.35, .57], [.66, .55], [.9, .47], [1, .37]], A: .67, B: .5, C: .31, D: .1, rcF: .46, rcR: .4, taper: .05, clr: .12, mid: false, bulge: .02 },
  super:  { prof: [[0, .5], [.03, .63], [.14, .69], [.35, .67], [.6, .6], [.78, .59], [.91, .52], [1, .38]], A: .69, B: .55, C: .41, D: .16, rcF: .5, rcR: .38, taper: .08, clr: .11, mid: true, bulge: .025 },
  hyper:  { prof: [[0, .46], [.03, .6], [.15, .66], [.38, .62], [.62, .56], [.8, .55], [.92, .47], [1, .33]], A: .71, B: .57, C: .43, D: .2, rcF: .55, rcR: .4, taper: .1, clr: .1, mid: true, bulge: .03 },
  // NASCAR Next Gen: long flat hood level with the fenders, blunt nose, fastback glass, short high deck
  stock:  { prof: [[0, .5], [.025, .645], [.07, .68], [.14, .685], [.6, .665], [.78, .66], [.9, .63], [.965, .57], [1, .47]], A: .6, B: .47, C: .26, D: .11, rcF: .26, rcR: .2, taper: .015, clr: .075, mid: false, bulge: .012 }
};
function buildClosed(out, spec, liv) {
  const { kit, interior, a, b, L, W, H } = out;
  const race = !!spec.race;
  let pk = spec.body;
  if (pk === 'gt3') pk = spec.wf >= 0.47 ? 'gt' : 'super';
  if (pk === 'track') pk = 'hyper';
  const st = STYLES[pk] || STYLES.gt;
  const stockCar = spec.body === 'stock';
  const R = stockCar ? 0.345 : race ? 0.345 : (spec.body === 'hatch' || spec.body === 'muscle') ? 0.345 : 0.355;
  const Ra = R + 0.045;
  const wF = race ? 0.3 : (spec.body === 'hyper' || spec.body === 'super' || spec.body === 'track') ? 0.27 : 0.25;
  const wR = race ? 0.32 : (spec.body === 'hyper' || spec.body === 'super' || spec.body === 'track') ? 0.33 : 0.28;
  const clr = race ? 0.075 : st.clr;
  const over = L - spec.wb, fo = pk === 'super' || pk === 'hyper' ? 0.44 : 0.47;
  const zF = a + over * fo, zR = -b - over * (1 - fo), Lb = zF - zR;
  const tOf = (z) => (z - zR) / Lb;
  const flare = (spec.body === 'gt3' ? 0.07 : spec.body === 'stock' ? 0.03 : spec.body === 'track' ? 0.05 : 0.015);
  const halfW0 = W / 2 - flare - 0.005;
  const xin = W / 2 - Math.max(wF, wR) - 0.13;
  const yTop = (z) => curveAt(st.prof, tOf(z)) * H;
  const yBot = (z) => { const t = tOf(z); return clr + (race ? 0.05 : 0.1) * smoothstep(0.9, 1, t) + (race ? 0.08 : 0.13) * smoothstep(0.1, 0, t); };
  const archY = (z) => { let best = null; for (const za of [a, -b]) { const d = (z - za) / Ra; if (Math.abs(d) < 1) { const y = clr + (R + Ra - clr) * Math.sqrt(1 - d * d); if (best == null || y > best) best = y; } } return best; };
  const halfW = (z) => {
    let hw = halfW0;
    const dF = zF - z, dR = z - zR;
    if (dF < st.rcF) { const u = 1 - dF / st.rcF; hw -= st.rcF * 0.5 * (1 - Math.sqrt(Math.max(0, 1 - u * u))); }
    if (dR < st.rcR) { const u = 1 - dR / st.rcR; hw -= st.rcR * 0.45 * (1 - Math.sqrt(Math.max(0, 1 - u * u))); }
    hw *= 1 - st.taper * smoothstep(0.62, 1.0, tOf(z));
    for (const za of [a, -b]) { const d = Math.abs(z - za) / (Ra + 0.3); if (d < 1) hw += flare * Math.cos(d * Math.PI / 2) ** 1.5; }
    hw -= 0.012 * smoothstep(Ra + 0.25, Ra + 0.6, Math.min(Math.abs(z - a), Math.abs(z + b))) * (z < a && z > -b ? 1 : 0); // waist
    return hw;
  };
  const shoulderAt = (z) => { const yb = yBot(z), yt = yTop(z), ya = archY(z); let sh = yb + (yt - yb) * 0.55; if (ya != null) sh = Math.max(sh, ya + 0.055); return sh; };
  const edgeAt = (z) => Math.max(yTop(z) - 0.035, shoulderAt(z) + 0.065);
  const topAt = (z, x, hw) => Math.max(yTop(z) - 0.035 * (x / hw) ** 2, edgeAt(z) - (hw * 0.93 - x) * 0.9);
  const zA0 = zR + st.A * Lb, zC0 = zR + st.C * Lb;
  const cabF = (z) => smoothstep(zC0 - 0.3, zC0 - 0.14, z) * (1 - smoothstep(zA0 - 0.34, zA0 - 0.18, z));
  const ring = (z) => {
    const yb = yBot(z), hw = halfW(z), ya = archY(z), fy = ya != null ? Math.max(ya, yb) : yb;
    const sh = shoulderAt(z), yE = edgeAt(z), rs = 0.05, bl = st.bulge;
    const y4 = fy + rs * 0.75, y5 = clamp(Math.max(fy + rs * 1.6, yb + (sh - yb) * 0.55), y4 + 0.004, sh - 0.008);
    const Lh = [[0, yb], [xin, yb], [xin + 0.003, fy], [hw - rs, fy], [hw - rs * 0.25, y4], [hw, y5], [hw + bl, sh], [hw * 0.985 + bl * 0.4, Math.max(sh + 0.01, yE - 0.05)], [hw * 0.93, yE],
      [hw * 0.5, topAt(z, hw * 0.5, hw)], [0.27, topAt(z, 0.27, hw)], [0.07, topAt(z, 0.07, hw)], [0, topAt(z, 0, hw)]];
    const cf = cabF(z); if (cf > 0) for (let k = 9; k <= 12; k++) Lh[k][1] = lerp(Lh[k][1], yb + 0.3, cf); // cabin tub
    const r = Lh.slice(); for (let k = 11; k >= 1; k--) r.push([-Lh[k][0], Lh[k][1]]);
    return r;
  };
  // z stations: dense around the arches
  const zs = [];
  for (let z = zR; z < zF - 1e-6; ) {
    zs.push(z);
    const nearArch = Math.min(Math.abs(z - a), Math.abs(z + b)) < Ra + 0.06, nearEnd = z < zR + 0.12 || z > zF - 0.2;
    z += nearArch ? 0.045 : nearEnd ? 0.04 : 0.14;
  }
  zs.push(zF);
  const P1 = out.col1, P2 = out.col2, BK = C3(BLACK), CB = C3(CARBON), UB = C3('#0e0f10');
  const pat = liv.pattern;
  const tagBody = (s, z) => {
    const inArch = archY(z) != null;
    if (s >= 9 && cabF(z) > 0.001) return ['cabin', C3('#2a2c30')];
    if (s <= 2) return ['trim', (s === 0 ? UB : BK)];
    if (s === 3) return inArch ? ['trim', BK] : (race || st.mid) && !stockCar ? ['trim', CB] : ['paint', P1];
    if (s === 4) return race && !inArch && !stockCar ? ['trim', CB] : ['paint', pat === 'banda' && z < a - Ra && z > -b + Ra ? P2 : P1];
    if (s === 5) return ['paint', pat === 'banda' && z < a - Ra && z > -b + Ra ? P2 : P1];
    if (s === 10 && pat === 'franjas') return ['paint', P2];
    return ['paint', P1];
  };
  loftShell(kit, zs, ring, 24, (k) => (k <= 11 ? k : 23 - k), tagBody, ['paint', P1], ['paint', P1]);

  // ---- greenhouse
  const zA = zR + st.A * Lb, zB = zR + st.B * Lb, zC = zR + st.C * Lb, zD = zR + st.D * Lb;
  const yA = yTop(zA), yD = yTop(zD), roofY = H;
  const roofAt = (z) => {
    if (z >= zB) { const u = (z - zB) / (zA - zB); return lerp(roofY, yA, u) + 0.05 * Math.sin(u * Math.PI) * (1 - u); }
    if (z <= zC) { const u = (zC - z) / (zC - zD); return lerp(roofY, yD, Math.pow(u, 0.9)) + 0.06 * Math.sin(u * Math.PI); }
    const m = (z - (zB + zC) / 2) / ((zB - zC) / 2); return roofY - 0.012 * m * m;
  };
  const cabHW = (z) => halfW(z) * 0.9 - 0.02;
  const ringCab = (z) => {
    const yb = yTop(z) - 0.05 - 0.07 * cabF(z), yr = Math.max(roofAt(z), yb + 0.03), hb = cabHW(z), ht = hb * 0.74;
    const Lh = [[0, yb], [hb, yb], [hb * 0.972, yb + (yr - yb) * 0.5], [ht + 0.035, Math.max(yb + 0.01, yr - 0.045)], [ht - 0.02, yr], [ht * 0.45, yr + 0.012], [0, yr + 0.016]];
    const r = Lh.slice(); for (let k = 5; k >= 1; k--) r.push([-Lh[k][0], Lh[k][1]]);
    return r;
  };
  const zc = []; for (let z = zD; z < zA; z += 0.07) zc.push(z); zc.push(zA);
  for (const zz of [zB, zC]) if (!zc.some(v => Math.abs(v - zz) < 0.02)) zc.push(zz);
  zc.sort((p, q) => p - q);
  const G = C3(GLASS), ROOF = pat === 'dos' ? P2 : P1, PILLAR = race || pk === 'hyper' ? BK : ROOF;
  const zBp = zB - (zB - zC) * 0.5, quarter = st.mid ? 0.1 : 0.22;
  const tagCab = (s, z) => {
    if (s === 0) return [null, null];
    if (z > zB + 0.01) return s >= 4 ? ['gloss', G] : s === 3 ? ['paint', PILLAR] : ['gloss', G];
    if (z >= zC - 0.01) { if (s >= 3) return ['paint', ROOF]; return Math.abs(z - zBp) < 0.045 ? ['trim', BK] : ['gloss', G]; }
    if (s >= 4) return st.mid && z < zC - 0.32 ? ['trim', C3('#202226')] : ['gloss', G];
    if (s === 3) return ['paint', PILLAR];
    return z > zC - quarter ? ['gloss', G] : ['paint', ROOF];
  };
  loftShell(kit, zc, ringCab, 12, (k) => (k <= 5 ? k : 11 - k), tagCab, null, null);

  // ---- details
  const hoodSlope = (z) => Math.atan2(yTop(z + 0.05) - yTop(z - 0.05), 0.1);
  const lightZ = zF - 0.16, lx = halfW(lightZ) * 0.64, lightY = topAt(lightZ, lx, halfW(lightZ));
  for (const s of [1, -1]) {
    // headlight: dark glass housing + LED strip (stock cars: flat stickers laid on the nose)
    if (stockCar) {
      const hz = zF - 0.2, hx = halfW(hz) * 0.66, hy = topAt(hz, hx, halfW(hz)), sl = hoodSlope(hz);
      kit.box('trim', C3('#3a3f45'), W * 0.2, 0.004, 0.2, s * hx, hy + 0.002, hz, -sl, s * 0.12, 0);
      kit.box('gloss', C3('#c9d2da'), W * 0.13, 0.005, 0.07, s * (hx + 0.02), hy + 0.004, hz + 0.02, -sl, s * 0.12, 0);
    } else {
      kit.box('gloss', C3('#1a2027'), W * 0.19, 0.03, 0.24, s * lx, lightY - 0.012, lightZ, -hoodSlope(lightZ));
      kit.box('light', C3('#eef4ff'), W * 0.14, 0.014, 0.03, s * (lx + 0.02), lightY - 0.001, lightZ + 0.09, -hoodSlope(lightZ));
    }
    // tail light
    const tz = zR + 0.012, ty = yTop(zR + 0.05) - 0.06;
    if (stockCar) kit.box('brake', null, W * 0.3, 0.05, 0.012, s * W * 0.22, ty + 0.01, tz - 0.004);
    else if (st.mid || race) kit.box('brake', null, W * 0.34, 0.04, 0.04, s * W * 0.2, ty, tz);
    else kit.box('brake', null, W * 0.24, 0.075, 0.05, s * halfW(tz) * 0.62, ty, tz);
    // mirrors
    const mz = zA - 0.14, my = yTop(mz) + 0.13, mx = cabHW(mz) + 0.13;
    if (!stockCar || s > 0) { // stock car: one mirror, on the driver's side, sitting on the door top
      const mxx = stockCar ? cabHW(mz) + 0.07 : mx, myy = stockCar ? yTop(mz) + 0.07 : my;
      kit.box('paint', pat === 'dos' ? P2 : P1, 0.15, 0.075, 0.1, s * mxx, myy, mz, 0, s * 0.12, 0);
      kit.box('gloss', C3('#8fa2b5'), 0.12, 0.06, 0.01, s * mxx, myy, mz - 0.052, 0, s * 0.12, 0);
      // short stalk that ends inside the door skin (never floats, never pokes through)
      kit.bar('trim', BK, [s * (mxx - 0.06), myy - 0.025, mz], [s * (cabHW(mz) + 0.01), Math.min(myy - 0.05, yTop(mz) + 0.01), mz + 0.02], 0.025);
    }
    if (st.mid) kit.box('trim', C3('#0f1012'), 0.02, 0.17, 0.42, s * (halfW(-b + Ra + 0.32) + st.bulge + 0.004), shoulderAt(-b + Ra + 0.32) - 0.1, -b + Ra + 0.32);
    // side skirt between the arches
    if ((race || st.mid) && !stockCar) kit.box('trim', CB, 0.06, 0.06, (a + b) - 2 * Ra - 0.2, s * (halfW((a - b) / 2) - 0.015), clr + 0.03, (a - b) / 2);
    // door line hint
    if (!race) kit.box('trim', C3('#2a2c30'), 0.004, (shoulderAt(zA - 0.3) - clr) * 0.7, 0.012, s * (halfW(zA - 0.3) + st.bulge * 0.6 + 0.002), clr + (shoulderAt(zA - 0.3) - clr) * 0.55, zA - 0.3);
  }
  if (st.mid || race) kit.box('brake', null, W * 0.62, 0.02, 0.03, 0, yTop(zR + 0.05) - 0.05, zR + 0.015);
  // front: grille / intakes / splitter
  const yf0 = yBot(zF), yf1 = yTop(zF);
  kit.box('trim', C3('#0f1012'), W * (st.mid ? 0.42 : 0.5), (yf1 - yf0) * 0.42, 0.03, 0, yf0 + (yf1 - yf0) * 0.32, zF + 0.004);
  if (!st.mid && !race && spec.body !== 'stock') kit.box('trim', C3('#2b2e33'), W * 0.46, 0.012, 0.035, 0, yf0 + (yf1 - yf0) * 0.46, zF + 0.012);
  for (const s of [1, -1]) kit.box('trim', C3('#0f1012'), W * 0.14, (yf1 - yf0) * 0.3, 0.03, s * W * 0.33, yf0 + (yf1 - yf0) * 0.26, zF - 0.02);
  if (race || spec.body === 'track' || spec.body === 'hyper' || spec.body === 'stock') kit.box('trim', CB, W * 0.95, 0.025, 0.3, 0, clr - 0.01, zF - 0.1);
  if (!race) { kit.box('trim', C3('#d9dcdf'), 0.5, 0.11, 0.012, 0, yf0 + 0.1, zF + 0.012); kit.box('trim', C3('#d9dcdf'), 0.5, 0.11, 0.012, 0, yBot(zR) + (yTop(zR) - yBot(zR)) * 0.45, zR - 0.01); }
  // rear: diffuser + exhausts
  kit.box('trim', CB, W * 0.7, 0.1, 0.28, 0, yBot(zR) + 0.02, zR + 0.12, 0.28);
  if (!stockCar) for (const s of (spec.cyl >= 8 ? [1, -1] : [1])) for (const k of (spec.cyl >= 10 ? [0, 1] : [0])) kit.cyl('gloss', C3(CHROME), 0.045, 0.045, 0.12, 10, s * (W * 0.24 + k * 0.1), yBot(zR) + 0.1, zR + 0.03, Math.PI / 2, 0, 0);
  // bonnet vents on track / hyper cars
  if (spec.body === 'track' || spec.body === 'hyper' || spec.body === 'gt3') for (const s of [1, -1]) kit.box('trim', C3('#0f1012'), 0.28, 0.012, 0.3, s * 0.34, yTop(a + 0.15) - 0.005, a + 0.15, -hoodSlope(a + 0.15));
  // wings / spoilers
  const deckY = yTop(zR + 0.25), wing = spec.wing || 0;
  if (stockCar) {
    // spoiler: a near-vertical blade standing on the trailing edge of the deck, braced from behind
    const sz = zR + 0.09, sy = yTop(sz) - 0.01, hS = 0.16, lean = 0.2;
    kit.box('trim', C3('#16181b'), W * 0.9, hS, 0.012, 0, sy + hS / 2 * Math.cos(lean), sz - hS / 2 * Math.sin(lean), -lean);
    for (const s of [1, -1, 0.34, -0.34]) kit.box('trim', C3('#16181b'), 0.012, hS * 0.7, 0.07, s * W * 0.43, sy + hS * 0.33, sz + 0.02, -lean * 0.5);
    // hood louvres over the front wheels, cowl vent, side exhausts ahead of the rear wheels, roof rails
    for (const s of [1, -1]) {
      const lz = a + 0.12, lxx = halfW(lz) * 0.55, ly = topAt(lz, lxx, halfW(lz));
      kit.box('trim', C3('#101113'), 0.36, 0.006, 0.3, s * lxx, ly + 0.001, lz, -hoodSlope(lz));
      for (let k = 0; k < 5; k++) kit.box('trim', C3('#2a2d31'), 0.34, 0.01, 0.012, s * lxx, ly + 0.004, lz - 0.12 + k * 0.06, -hoodSlope(lz));
      const ez = -b + Ra + 0.22;
      for (const dz of [0, 0.11]) kit.cyl('gloss', C3('#6d6a66'), 0.045, 0.05, 0.1, 12, s * (halfW(ez) - 0.02), clr + 0.1, ez + dz, 0, 0, Math.PI / 2);
      kit.box('trim', C3('#0f1012'), 0.012, 0.02, zB - zC - 0.1, s * cabHW(zBp) * 0.62, roofAt(zBp) + 0.01, (zB + zC) / 2);
    }
    kit.box('trim', C3('#101113'), W * 0.5, 0.006, 0.06, 0, yTop(zA + 0.08) + 0.001, zA + 0.08, -hoodSlope(zA + 0.08));
    // rocker skirts and lower front fascia opening
    for (const s of [1, -1]) kit.box('trim', CB, 0.05, 0.08, (a + b) - 2 * Ra - 0.1, s * (halfW((a - b) / 2) - 0.01), clr + 0.04, (a - b) / 2);
  } else if (wing >= 2) {
    const wy = deckY + (race ? 0.36 : 0.28), wz = zR + 0.24;
    kit.box(race ? 'trim' : 'paint', race ? CB : P2, W * (race ? 0.98 : 0.9), 0.035, 0.34, 0, wy, wz, 0.1);
    kit.box(race ? 'trim' : 'paint', race ? CB : P2, W * (race ? 0.98 : 0.9), 0.025, 0.14, 0, wy + 0.06, wz - 0.18, 0.5);
    for (const s of [1, -1]) {
      kit.box(race ? 'trim' : 'paint', race ? CB : P2, 0.025, 0.28, 0.46, s * W * (race ? 0.49 : 0.45), wy - 0.08, wz - 0.03);
      kit.box('trim', CB, 0.035, wy - deckY + 0.03, 0.1, s * W * 0.2, (deckY + wy) / 2, wz + 0.02);
    }
  } else if (wing === 1) {
    kit.box(spec.body === 'hatch' ? 'trim' : 'paint', spec.body === 'hatch' ? CB : P1, W * 0.84, 0.035, 0.16, 0, deckY + 0.025, zR + 0.12, -0.12);
  }
  if (spec.body === 'hatch') kit.box('trim', CB, W * 0.7, 0.03, 0.18, 0, roofY - 0.01, zD + 0.12, 0.25); // roof spoiler over the hatch
  if (spec.fin) kit.box('paint', P2, 0.025, 0.22, (zC - zR) * 0.8, 0, roofAt(zC) - 0.08, (zC + zR) / 2);
  // race numbers
  if (spec.num) {
    const stock = spec.body === 'stock';
    out.decalMat = decalMat('n' + spec.num + (stock ? 's' + liv.col2 : ''), () => stock ? bigNumberTex(spec.num, '#ffffff', liv.col2 || '#111') : numberTex(spec.num));
    const zc2 = (a - b) / 2, sz = stock ? 0.62 : 0.5, yc = stock ? clr + (shoulderAt(zc2) - clr) * 0.56 : Math.min(shoulderAt(zc2), yTop(zc2)) - sz * 0.45;
    for (const s of [1, -1]) kit.plane('decal', sz, sz, s * (halfW(zc2) + st.bulge + 0.006), yc, zc2, 0, s * Math.PI / 2, 0);
    kit.plane('decal', 0.6, 0.6, 0, roofY + 0.022, (zB + zC) / 2, -Math.PI / 2, 0, 0);
  }
  // wheels
  addWheels(out, R, wF, wR, W / 2 - wF / 2 - 0.035, W / 2 - wR / 2 - 0.035, race, race ? 0.7 : 0.72);
  // ---- cameras / cockpit
  const lhd = spec.body === 'stock' || !spec.rhd;
  const dx = lhd ? W * 0.2 : -W * 0.2;
  const eye = new THREE.Vector3(dx, roofY - (race ? 0.2 : 0.21), zB - 0.42);
  out.eye = eye;
  out.cams = {
    onboard: spec.body === 'stock' || race ? new THREE.Vector3(0, roofY + 0.12, zB - 0.25) : new THREE.Vector3(0, Math.max(yTop(zA + 0.4), yA) + 0.24, zA + 0.15),
    chaseDist: 3.8 + L * 0.62, chaseH: 1.25 + H * 0.45
  };
  if (out.lite) return;
  buildCabin(out, { E: eye, dx, yA, zA, zB, zC, zBp, roofY, clr, race, track: false, sporty: true, W, halfW, hb: cabHW(zA - 0.1), hr: cabHW(zB) * 0.74, cabHW, yF: clr + 0.3, roundWheel: spec.body === 'stock' });
  if (race) { out.hk.put('paint', new THREE.SphereGeometry(0.13, 14, 10), C3(spec.helmet || '#f2c230'), out.hk.xf(dx, eye.y - 0.02, eye.z - 0.08)); }
}

// ---------------------------------------------------------------------------
//  Steering wheel + digital dash shared by all cars
// ---------------------------------------------------------------------------
function addWheelAndDash(out, eye, style, pos) {
  const p = pos || new THREE.Vector3(eye.x, eye.y - 0.3, eye.z + 0.44), open = style === 'f1';
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  out.dash = { cv, ctx: cv.getContext('2d'), tex, last: 0, style: 'race', W: 512, H: 160 };
  wheelRig(out, { pos: p, tilt: 0.3, race: true, round: false, f1: open, tex, sleeve: open ? out.col2.clone().multiplyScalar(0.8) : out.col1.clone().multiplyScalar(0.6), glove: open ? out.col2.clone().lerp(new THREE.Color(1, 1, 1), 0.4) : null,
    elbowX: open ? 0.3 : 0.28, elbowY: eye.y - (open ? 0.34 : 0.48), elbowZ: eye.z + (open ? 0.08 : 0.18), column: !open,
    shDrop: (out.spec && out.spec.shDrop) || (open ? 0.15 : 0), shDz: open && !(out.spec && out.spec.shDrop) ? 0.06 : 0, ...(out.spec && out.spec.suit ? { sleeve: new THREE.Color(out.spec.suit), glove: new THREE.Color(out.spec.gloveCol || '#d8d8d4'), gloveLight: true } : {}) });
}
function drawDash(out, veh, units) {
  drawDash0(out, veh, units);
  const D = out.dash; if (D && D.sw) drawWheelScreen(D.sw, veh, units);
}
// display of the scanned competition steering wheel
function drawWheelScreen(S, veh, units) {
  const g = S.ctx, w = S.W, h = S.H, P = veh.P;
  const sp = Math.abs(veh.u) * (units === 'mph' ? 2.23694 : 3.6), gear = veh.gear === -1 ? 'R' : veh.gear === 0 ? 'N' : String(veh.gear);
  g.fillStyle = '#04060a'; g.fillRect(0, 0, w, h);
  const x = clamp(veh.rpm / P.red, 0, 1), n = 15, lit = Math.round(x * n * 1.05);
  for (let i = 0; i < n; i++) { g.fillStyle = i < lit ? (i < 5 ? '#2fd27a' : i < 10 ? '#ff3b30' : '#4aa3ff') : '#161a20'; g.beginPath(); g.arc(24 + i * 28, 22, 9, 0, 7); g.fill(); }
  g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillStyle = S.acc || '#f6c21c'; g.font = "800 150px 'Saira Condensed', sans-serif"; g.fillText(gear, w / 2, 128);
  g.fillStyle = '#eceef1'; g.font = "700 58px 'Saira Condensed', sans-serif";
  g.textAlign = 'left'; g.fillText(String(Math.round(sp)), 14, 118); g.textAlign = 'right'; g.fillText(String(Math.round(veh.rpm / 100) * 100), w - 14, 118);
  g.font = "600 26px 'Saira Condensed', sans-serif"; g.fillStyle = '#8d95a0';
  g.textAlign = 'left'; g.fillText(units === 'mph' ? 'MPH' : 'KM/H', 14, 168); g.textAlign = 'right'; g.fillText('RPM', w - 14, 168);
  g.fillStyle = '#1b2028'; g.fillRect(14, 208, w - 28, 16); g.fillStyle = x > 0.92 ? '#ff3b30' : (S.acc || '#4aa3ff'); g.fillRect(14, 208, (w - 28) * x, 16);
  S.tex.needsUpdate = true;
}
function drawDash0(out, veh, units) {
  const D = out.dash; if (!D) return;
  const g = D.ctx, w = D.W || 256, h = D.H || 128, P = veh.P;
  const sp = Math.abs(veh.u) * (units === 'mph' ? 2.23694 : 3.6), gear = veh.gear === -1 ? 'R' : veh.gear === 0 ? 'N' : String(veh.gear);
  if (D.style === 'road') {
    // analogue tachometer + digital speed, like a modern road-car cluster
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0b0f14'); bg.addColorStop(1, '#030405');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cx = 128, cy = 96, r = 70, a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, maxR = Math.ceil(P.red / 1000 + 1) * 1000;
    const ang = (rpm) => a0 + (a1 - a0) * clamp(rpm / maxR, 0, 1);
    g.lineWidth = 7; g.strokeStyle = '#1b222b'; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
    g.strokeStyle = '#d8321f'; g.beginPath(); g.arc(cx, cy, r, ang(P.red), a1); g.stroke();
    g.strokeStyle = '#5fb4ff'; g.beginPath(); g.arc(cx, cy, r, a0, ang(veh.rpm)); g.stroke();
    g.fillStyle = '#c9d3dd'; g.font = "600 15px 'Saira Condensed', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k <= maxR / 1000; k++) { const t = ang(k * 1000); g.fillText(String(k), cx + Math.cos(t) * (r - 20), cy + Math.sin(t) * (r - 20)); }
    const t = ang(veh.rpm); g.strokeStyle = '#ff6a3d'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(cx + Math.cos(t) * 8, cy + Math.sin(t) * 8); g.lineTo(cx + Math.cos(t) * (r + 4), cy + Math.sin(t) * (r + 4)); g.stroke();
    g.fillStyle = '#20262e'; g.beginPath(); g.arc(cx, cy, 11, 0, 7); g.fill();
    g.fillStyle = '#7f8b98'; g.font = "600 12px 'Saira Condensed', sans-serif"; g.fillText('x1000 rpm', cx, cy + 34);
    g.textAlign = 'right'; g.fillStyle = '#f2f5f8'; g.font = "700 76px 'Saira Condensed', sans-serif"; g.fillText(String(Math.round(sp)), 390, 84);
    g.fillStyle = '#7f8b98'; g.font = "600 16px 'Saira Condensed', sans-serif"; g.fillText(units === 'mph' ? 'mph' : 'km/h', 390, 132);
    g.textAlign = 'center'; g.fillStyle = '#f6c21c'; g.font = "800 58px 'Saira Condensed', sans-serif"; g.fillText(gear, 462, 84);
    g.fillStyle = '#394350'; g.fillRect(430, 122, 64, 3);
    D.tex.needsUpdate = true; return;
  }
  const sx = w / 256, sy = h / 128;
  g.setTransform(sx, 0, 0, sy, 0, 0);
  g.fillStyle = '#05070a'; g.fillRect(0, 0, 256, 128);
  const x = clamp(veh.rpm / P.red, 0, 1);
  const n = 15, lit = Math.round(x * n * 1.05);
  for (let i = 0; i < n; i++) { g.fillStyle = i < lit ? (i < 5 ? '#2fd27a' : i < 10 ? '#ff3b30' : '#4aa3ff') : '#1a1d22'; g.beginPath(); g.arc(18 + i * 15.7, 14, 6, 0, 7); g.fill(); }
  g.fillStyle = '#f6c21c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = "800 72px 'Saira Condensed', sans-serif"; g.fillText(gear, 128, 76);
  g.fillStyle = '#eceef1'; g.font = "700 30px 'Saira Condensed', sans-serif";
  g.textAlign = 'left'; g.fillText(String(Math.round(sp)), 12, 80);
  g.textAlign = 'right'; g.fillText(String(Math.round(veh.rpm / 100) * 100), 246, 80);
  g.font = "600 14px 'Saira Condensed', sans-serif"; g.fillStyle = '#8d95a0';
  g.textAlign = 'left'; g.fillText(units === 'mph' ? 'MPH' : 'KM/H', 12, 108); g.textAlign = 'right'; g.fillText('RPM', 246, 108);
  g.setTransform(1, 0, 0, 1, 0, 0);
  D.tex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
//  Open-wheelers: F1 2004 and IndyCar
// ---------------------------------------------------------------------------
function buildOpenWheel(out, spec, liv, kind) {
  const { kit, hk, a, b } = out;
  const indy = kind === 'indy';
  const R = 0.33;
  const zN = a + (indy ? 1.05 : 0.92), zT = -b - (indy ? 0.62 : 0.55);
  const P = out.col1, S = out.col2, CB = C3(CARBON), DK = C3('#141518');
  const put = (key, geo, col) => kit.put(key, geo, col);
  // monocoque: nose up to the front bulkhead, and the rear chassis from behind the driver; the cockpit between is open
  put('paint', loft([
    { z: zN, w: indy ? .16 : .1, y0: indy ? .2 : .3, y1: indy ? .3 : .36, n: 2.5 },
    { z: zN - .25, w: indy ? .26 : .22, y0: indy ? .18 : .29, y1: indy ? .36 : .45, n: 2.5 },
    { z: a + .25, w: .34, y0: indy ? .14 : .26, y1: indy ? .46 : .53, n: 2.6 },
    { z: a - .3, w: .46, y0: .16, y1: .59, n: 3 },
    { z: .9, w: .58, y0: .08, y1: .63, n: 3.5 },
    { z: .5, w: .7, y0: .06, y1: .67, n: 4 }
  ], 20), P);
  put('paint', loft([
    { z: -.2, w: .78, y0: .05, y1: .63, n: 4 },
    { z: -.45, w: .8, y0: .05, y1: .68, n: 4 },
    { z: -1.0, w: .56, y0: .08, y1: .64, n: 3.5 },
    { z: -1.55, w: .34, y0: .14, y1: .5, n: 3 },
    { z: zT + .05, w: .2, y0: .2, y1: .4, n: 3 }
  ], 20), P);
  openCockpit(out, { z0: -.2, z1: .5, halfIn: .235, out0: .39, out1: .35, yFloor: .1, rim0: .63, rim1: .665, P, DK, CB });
  // airbox / engine cover
  put('paint', loft([{ z: indy ? -.2 : -.28, w: .2, y0: .6, y1: indy ? .86 : .92, n: 3 }, { z: -.5, w: .32, y0: .6, y1: indy ? .9 : .97, n: 3 }, { z: -1.1, w: .22, y0: .58, y1: .74, n: 3 }, { z: -1.6, w: .12, y0: .45, y1: .52, n: 3 }], 14), P);
  kit.box('trim', DK, 0.12, 0.09, 0.04, 0, indy ? .8 : .85, indy ? -.11 : -.27);
  kit.box('trim', DK, 0.1, 0.05, 0.1, 0, indy ? .93 : .995, indy ? -.38 : -.5); // T-cam pod
  for (const s of [1, -1]) {
    put('paint', loft([{ z: .6, w: .38, y0: .1, y1: .52, n: 4, x: s * .5 }, { z: .15, w: .46, y0: .08, y1: .55, n: 4, x: s * .52 }, { z: -.6, w: indy ? .44 : .4, y0: .08, y1: .47, n: 4, x: s * .5 }, { z: -1.25, w: .2, y0: .1, y1: .3, n: 3, x: s * .34 }], 14), indy ? S : P);
    kit.box('trim', DK, 0.26, 0.3, 0.02, s * .5, .31, .592);
    kit.box('trim', CB, 0.02, 0.28, 0.45, s * .33, .2, .95);
    kit.bar('trim', CB, [s * .36, .6, .45], [s * .52, .66, .42], .025);
    kit.box('trim', CB, 0.13, 0.06, 0.05, s * .55, .67, .42);
    kit.box('gloss', C3('#aab8c6'), 0.115, 0.045, 0.006, s * .55, .67, .394);
  }
  // floor between the axles (stepped plank + edges), diffuser behind, gearbox and crash structure to the rear wing
  singleSeaterFloor(kit, CB, { zF: a - .55, zR: -b + .32, w: indy ? 1.45 : 1.36, zT });
  put('trim', loft([{ z: -1.1, w: .34, y0: .16, y1: .44, n: 3.5 }, { z: -b, w: .3, y0: .18, y1: .42, n: 3.5 }, { z: zT + .02, w: .16, y0: .26, y1: .38, n: 3 }], 12), CB);
  // front wing
  const fwW = indy ? 1.75 : 1.4, fwZ = zN - .02;
  kit.box('trim', CB, fwW, 0.03, 0.34, 0, .1, fwZ, 0.06);
  kit.box('paint', indy ? S : P, fwW * .92, 0.03, 0.2, 0, .17, fwZ - .2, 0.35);
  if (indy) kit.box('trim', CB, fwW * .8, 0.025, 0.16, 0, .22, fwZ - .32, 0.5);
  for (const s of [1, -1]) {
    kit.box('paint', indy ? S : P, 0.025, 0.24, 0.5, s * fwW / 2, .19, fwZ - .08);
    kit.bar('trim', CB, [s * .06, indy ? .21 : .3, fwZ + .02], [s * .09, .11, fwZ - .02], .03); // nose pillars down to the mainplane
  }
  // rear wing: endplates reach down to the diffuser, central pylon on the gearbox
  const rwW = indy ? 1.1 : 0.9, rwZ = zT + .12;
  kit.box('trim', CB, rwW, 0.035, 0.3, 0, indy ? .8 : .86, rwZ, -0.15);
  kit.box(indy ? 'paint' : 'trim', indy ? S : CB, rwW, 0.03, 0.2, 0, indy ? .9 : .97, rwZ - .18, -0.45);
  kit.box('trim', CB, rwW * .85, 0.03, 0.2, 0, .42, rwZ + .1, -0.1);
  for (const s of [1, -1]) kit.box('paint', indy ? S : P, 0.025, 0.7, 0.62, s * rwW / 2, .66, rwZ - .05);
  kit.box('trim', CB, 0.05, (indy ? .8 : .86) - .36, 0.12, 0, ((indy ? .8 : .86) + .36) / 2, rwZ + .08);
  kit.box('brake', null, 0.08, 0.05, 0.03, 0, .33, zT + .02);
  if (indy) {
    // rear wheel guards joined to the floor
    for (const s of [1, -1]) {
      put('paint', loft([{ z: -b - .3, w: .26, y0: .06, y1: .36, n: 4, x: s * .7 }, { z: -b - .62, w: .3, y0: .06, y1: .4, n: 4, x: s * .68 }], 10), S);
      kit.box('trim', CB, .36, .03, .45, s * .52, .07, -b - .45);
    }
    // aeroscreen: titanium frame + screen stretched from the cockpit rim up to the frame (one piece, no gaps)
    if (!CM.aero) CM.aero = new THREE.MeshPhysicalMaterial({ color: 0xc9d6e2, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    const ring = [[.3, .64, -.28], [.34, .8, -.1], [.31, .905, .1], [.16, .93, .2], [0, .935, .22], [-.16, .93, .2], [-.31, .905, .1], [-.34, .8, -.1], [-.3, .64, -.28]];
    haloTube(kit, 'trim', CB, [[0, .665, .5], [0, .79, .4], [0, .925, .22]], 0.018);
    haloTube(kit, 'trim', CB, ring, 0.02);
    const top = new THREE.CatmullRomCurve3([[.34, .8, -.1], [.31, .905, .1], [.16, .93, .2], [0, .935, .22], [-.16, .93, .2], [-.31, .905, .1], [-.34, .8, -.1]].map(p => new THREE.Vector3(...p)), false, 'centripetal');
    const bot = new THREE.CatmullRomCurve3([[.27, .64, -.1], [.25, .655, .16], [.16, .665, .38], [0, .67, .5], [-.16, .665, .38], [-.25, .655, .16], [-.27, .64, -.1]].map(p => new THREE.Vector3(...p)), false, 'centripetal');
    const M = 28, pos = [], idx = [];
    for (let k = 0; k <= M; k++) { const u = top.getPoint(k / M), l = bot.getPoint(k / M); pos.push(l.x, l.y, l.z, u.x, u.y, u.z); }
    for (let k = 0; k < M; k++) { const b0 = k * 2; idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(idx); sg.computeVertexNormals();
    const scr = new THREE.Mesh(sg, CM.aero); scr.renderOrder = 4; out.body.add(scr);
    for (const s of [1, -1]) kit.bar('trim', CB, [s * .27, .64, -.1], [s * .34, .8, -.1], .02); // screen side frame
  }
  singleSeaterSuspension(kit, CB, a, -b, indy ? .73 : .73, .7, R);
  if (spec.num) {
    out.decalMat = decalMat('n' + spec.num, () => numberTex(spec.num, '#ffffff', '#111'));
    for (const s of [1, -1]) kit.plane('decal', .22, .22, s * .155, .43, a + .35, 0, s * Math.PI / 2 + s * 0.2, 0);
    kit.plane('decal', .3, .3, 0, .655, -.9, -1.2, 0, 0);
  }
  // helmet (hidden in the cockpit view)
  hk.put('paint', new THREE.SphereGeometry(.13, 16, 12), C3(spec.helmet || '#d11a14'), hk.xf(0, .74, -.08));
  hk.box('gloss', C3('#1b2530'), .2, .05, .08, 0, .76, .02);
  hk.box('trim', C3('#1c1d20'), .42, .12, .3, 0, .6, -.02);
  addWheels(out, R, indy ? .3 : .27, indy ? .38 : .37, .73, .7, true, indy ? .7 : .66);
  out.eye = new THREE.Vector3(0, .77, -.1);
  if (!out.lite) addWheelAndDash(out, out.eye, 'f1', new THREE.Vector3(0, .63, .29));
  out.cams = { onboard: indy ? new THREE.Vector3(0, 1.08, -.45) : new THREE.Vector3(0, 1.06, -.38), onPitch: indy ? undefined : -0.2, chaseDist: 5.7, chaseH: 1.65, inPitch: -0.03 };
}

// floor of a single-seater: plank between the axles, raised edges, diffuser behind the rear axle
function singleSeaterFloor(kit, CB, o) {
  const L = o.zF - o.zR;
  kit.box('trim', CB, o.w, 0.025, L, 0, .045, (o.zF + o.zR) / 2);
  kit.box('trim', CB, 0.3, 0.02, L * 0.9, 0, .025, (o.zF + o.zR) / 2);
  for (const s of [1, -1]) kit.box('trim', CB, 0.02, 0.06, L * 0.8, s * (o.w / 2 - 0.01), .07, (o.zF + o.zR) / 2 - L * 0.08);
  const dl = Math.max(0.3, o.zR - o.zT - 0.05);
  kit.box('trim', CB, o.w * 0.66, 0.025, dl, 0, .12, o.zR - dl / 2, -0.28);
  for (const s of [1, -1, 0.35, -0.35]) kit.box('trim', CB, 0.012, 0.13, dl, s * o.w * 0.31, .14, o.zR - dl / 2, -0.28);
}
// wishbones (two legs each), pushrod, upright and brake duct at every corner
function singleSeaterSuspension(kit, CB, zf, zr, hF, hR, R) {
  for (const [z, half, front] of [[zf, hF, true], [zr, hR, false]]) for (const s of [1, -1]) {
    const hub = s * (half - .13);
    kit.box('trim', CB, .05, .26, .1, hub, R, z);                         // upright
    kit.box('trim', CB, .1, .16, .16, s * (half - .19), R + .02, z);        // brake duct
    for (const dz of [.16, -.16]) {
      kit.bar('trim', CB, [s * .22, .47, z + dz], [hub, R + .1, z], .03);   // upper wishbone
      kit.bar('trim', CB, [s * .2, .2, z + dz * 1.1], [hub, R - .11, z], .03); // lower wishbone
    }
    kit.bar('trim', CB, [s * .24, front ? .54 : .5, z - .06], [hub, R - .1, z], .022); // pushrod
    if (!front) kit.bar('trim', CB, [s * .18, .32, z - .2], [hub, R, z - .05], .022); // toe link
  }
}

// open cockpit of a single-seater: seat tub, side walls up to the rim, padding and bulkheads,
// so the steering wheel sits inside the opening instead of inside the bodywork
function openCockpit(out, o) {
  const { kit, interior } = out;
  const mid = (o.z0 + o.z1) / 2;
  for (const s of [1, -1]) {
    const sec = (z, ho, rim) => ({ z, w: ho - o.halfIn + 0.02, x: s * (o.halfIn + (ho - o.halfIn) / 2 - 0.01), y0: o.yFloor + 0.06, y1: rim, n: 5 });
    kit.put('paint', loft([sec(o.z0, o.out0, o.rim0), sec(mid, (o.out0 + o.out1) / 2, (o.rim0 + o.rim1) / 2), sec(o.z1, o.out1, o.rim1)], 12), o.P);
    // padded rim edge
    kit.bar('trim', o.DK, [s * (o.halfIn + 0.012), o.rim0 + 0.004, o.z0 + 0.02], [s * (o.halfIn + 0.012), o.rim1 + 0.004, o.z1 - 0.02], 0.03);
    // headrest wings beside the helmet
    kit.box('trim', o.DK, 0.07, 0.1, 0.26, s * (o.halfIn - 0.02), o.rim0 + 0.045, o.z0 + 0.14);
  }
  kit.put('trim', loft([{ z: o.z0, w: o.halfIn * 2 + 0.03, y0: o.yFloor - 0.04, y1: o.yFloor + 0.2, n: 4 }, { z: o.z1, w: o.halfIn * 2 + 0.03, y0: o.yFloor - 0.04, y1: o.yFloor + 0.2, n: 4 }], 12), o.DK);
  kit.box('trim', o.DK, o.halfIn * 2, 0.14, 0.08, 0, o.rim0 + 0.02, o.z0 + 0.02);
  if (out.lite) return;
  // cockpit-only: padding on the inner walls, dark front and rear bulkheads
  cabinMaterials();
  const ik = new Kit(), pad = C3('#17181b');
  for (const s of [1, -1]) ik.box('cab', pad, 0.02, o.rim1 - o.yFloor - 0.12, o.z1 - o.z0 - 0.04, s * (o.halfIn - 0.008), (o.rim1 + o.yFloor + 0.1) / 2, mid);
  ik.box('cab', pad, o.halfIn * 2, o.rim1 - o.yFloor - 0.02, 0.012, 0, (o.rim1 + o.yFloor) / 2, o.z1 - 0.006);
  ik.box('cab', pad, o.halfIn * 2, 0.3, 0.012, 0, o.yFloor + 0.28, o.z0 + 0.006);
  cabinAdd(ik, interior);
}
// titanium halo / aeroscreen frame: a tube through the given points
function haloTube(kit, key, col, pts, r) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  kit.put(key, new THREE.TubeGeometry(curve, Math.max(8, pts.length * 8), r, 8, false), col);
}

// ---------------------------------------------------------------------------
//  LMP1 prototype (Porsche 919 Hybrid Evo)
// ---------------------------------------------------------------------------
function buildLMP(out, spec, liv) {
  const { kit, hk, interior, a, b, W } = out;
  const R = 0.34, P = out.col1, S = out.col2, RED = out.col3, CB = C3(CARBON);
  const zN = a + .72, zT = -b - .62;
  kit.put('paint', loft([
    { z: zN, w: .6, y0: .1, y1: .26, n: 3 }, { z: a + .1, w: .72, y0: .08, y1: .42, n: 3.5 }, { z: .95, w: .86, y0: .08, y1: .6, n: 4 },
    { z: .1, w: .9, y0: .08, y1: .62, n: 4 }, { z: -.8, w: .8, y0: .08, y1: .6, n: 4 }, { z: zT + .2, w: .6, y0: .12, y1: .5, n: 3 }
  ], 20), P);
  kit.put('gloss', loft([{ z: .95, w: .62, y0: .55, y1: .62, n: 3 }, { z: .55, w: .8, y0: .55, y1: 1.0, n: 3.2 }, { z: -.1, w: .78, y0: .55, y1: 1.02, n: 3.4 }, { z: -.55, w: .6, y0: .55, y1: .86, n: 3 }], 18), C3(GLASS));
  kit.put('paint', loft([{ z: .2, w: .5, y0: .96, y1: 1.045, n: 3 }, { z: -.2, w: .55, y0: .96, y1: 1.05, n: 3 }, { z: -1.3, w: .3, y0: .6, y1: .8, n: 3 }], 12), P);
  kit.box('paint', S, .025, .32, 1.35, 0, .78, -1.15);
  for (const s of [1, -1]) {
    kit.put('paint', loft([{ z: zN + .05, w: .38, y0: .1, y1: .3, n: 3, x: s * .72 }, { z: a + .45, w: .46, y0: .08, y1: .7, n: 3.5, x: s * .72 }, { z: a, w: .48, y0: .08, y1: .84, n: 3.8, x: s * .73 }, { z: a - .5, w: .45, y0: .08, y1: .72, n: 3.5, x: s * .72 }, { z: .45, w: .34, y0: .1, y1: .42, n: 3, x: s * .7 }], 16), P);
    kit.put('paint', loft([{ z: -.15, w: .36, y0: .1, y1: .5, n: 3, x: s * .72 }, { z: -b + .55, w: .48, y0: .08, y1: .8, n: 3.8, x: s * .73 }, { z: -b - .1, w: .48, y0: .08, y1: .8, n: 3.8, x: s * .73 }, { z: zT + .05, w: .4, y0: .12, y1: .62, n: 3, x: s * .72 }], 16), P);
    kit.box('paint', S, .5, .22, 1.9, s * .72, .08, -.2);
    // accent stripes laid exactly on the crown of each fender pod (same stations, so they follow the surface)
    kit.put('paint', loft([{ z: a + .45, w: .07, y0: .69, y1: .706, n: 2.2, x: s * .72 }, { z: a, w: .07, y0: .83, y1: .846, n: 2.2, x: s * .73 }, { z: a - .5, w: .07, y0: .71, y1: .726, n: 2.2, x: s * .72 }], 8), RED);
    kit.put('paint', loft([{ z: -b + .55, w: .07, y0: .79, y1: .806, n: 2.2, x: s * .73 }, { z: -b - .1, w: .07, y0: .79, y1: .806, n: 2.2, x: s * .73 }], 8), RED);
    for (const k of [0, 1]) kit.box('light', C3('#eef4ff'), .1, .05, .06, s * (.64 + k * .1), .55, a + .52);
    kit.box('brake', null, .3, .05, .05, s * .72, .55, zT + .03);
  }
  kit.box('trim', CB, W, .03, .45, 0, .04, zN - .15);
  kit.box('trim', CB, W * .85, .12, .45, 0, .06, zT + .2, .25);
  const wz = zT + .1;
  kit.box('trim', CB, W * .96, .04, .38, 0, .98, wz, -.1);
  kit.box('paint', S, W * .96, .03, .2, 0, 1.06, wz - .22, -.5);
  for (const s of [1, -1]) { kit.box('paint', S, .025, .55, .7, s * W * .48, .82, wz); kit.box('trim', CB, .04, .4, .08, s * .25, .78, wz + .05); }
  out.decalMat = decalMat('lmp' + (spec.num || '1'), () => canvasTex(128, 128, (g) => { g.fillStyle = '#d5001c'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = "800 100px 'Saira Condensed', sans-serif"; g.fillText(spec.num || '1', 64, 70); }));
  kit.plane('decal', .34, .34, 0, .44, a + .15, -Math.PI / 2 + 0.28, 0, 0);
  for (const s of [1, -1]) kit.plane('decal', .3, .3, s * .985, .45, -b + .15, 0, s * Math.PI / 2, 0);
  addWheels(out, R, .31, .36, .72, .72, true, .72);
  const eye = new THREE.Vector3(-.18, .9, .05);
  out.eye = eye;
  hk.put('paint', new THREE.SphereGeometry(.13, 14, 10), C3('#f2f2f2'), hk.xf(-.18, .86, -.02));
  out.cams = { onboard: new THREE.Vector3(0, 1.16, .15), chaseDist: 6.2, chaseH: 1.75 };
  if (out.lite) return;
  {
    cabinMaterials(); const ik = new Kit(), cc = C3('#202125'), o3 = new THREE.Object3D();
    ik.box('cab', cc, .7, .1, .35, 0, .6, .6);
    for (const s of [1, -1]) { const A = new THREE.Vector3(s * .4, .62, .92), B = new THREE.Vector3(s * .31, 1.0, .38); o3.position.copy(A).add(B).multiplyScalar(.5); o3.lookAt(B); o3.updateMatrix(); ik.put('cab', new THREE.CylinderGeometry(.018, .022, A.distanceTo(B), 8).rotateX(Math.PI / 2), cc, o3.matrix); }
    ik.box('lit', C3('#3a3b3f'), .62, .02, .8, 0, .995, -.05);
    cabinAdd(ik, interior);
  }
  addWheelAndDash(out, eye, 'race', new THREE.Vector3(-.18, .68, .42));
}
