// Tesla Model 3 (2018): FBX (converted with FBX2glTF -b) -> assets/model3.glb in the game's convention.
//   node prep_tesla.mjs <in.glb> <out.glb>
// Car frame: +Z forward, +X left, +Y up, metres, y = 0 under the tyres. Wheels into WHL_FL/FR/RL/RR (axle on X, hub at the
// node origin); the calipers go inside the wheel nodes as 'caliper_*' (off-axis, so glb.js keeps them still but steering).
// Body paint flagged { paint: 1 }, cabin parts { tag: 'int' }.
// The asset is in Z-up (FBX root -90° on X) with the nose at -Z: it is turned 180° about Y. Scale: wheelbase 3.205 -> real
// 2.875 m (length then 4.72 vs 4.694 real, tyre radius 0.336 vs 0.335 of a 235/45 R18). The asset is ~6 % too wide
// (1.96 m body vs 1.849 real), so X is scaled a further 0.945: wheels stay round (they spin about X).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, clearNodeTransform, prune, dedup, weld, join, simplifyPrimitive, textureCompress, quantize, meshopt, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
const [IN, OUT] = process.argv.slice(2);
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(IN), root = doc.getRoot(), scene = root.getDefaultScene();

// 1) frame and scale, every transform baked into the vertices
const K = 2.875 / 3.205, KX = 0.945;
const wrap = doc.createNode('wrap').setScale([K * KX, K, K]).setRotation([0, 1, 0, 0]);   // 180° about Y
for (const c of scene.listChildren()) { scene.removeChild(c); wrap.addChild(c); }
scene.addChild(wrap);
await doc.transform(flatten());
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  if (m.listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(m.clone());
  if (n.getParentNode()) { const w = n.getWorldMatrix(); n.getParentNode().removeChild(n); scene.addChild(n); n.setMatrix(w); }
  clearNodeTransform(n);
  // the matrix had a mirror (scale -1 parity)? clearNodeTransform keeps winding only for positive determinants: checked below
}
for (const n of root.listNodes()) if (!n.getMesh()) n.dispose();
// junk: a 2-triangle shadow quad, 1-triangle door markers, the cabin night light
for (const n of root.listNodes()) if (/^(chassis|door_..?_ok|interiorlights)$/.test(n.getName())) { const m = n.getMesh(); n.dispose(); m && m.dispose(); }
const isWheelNode = (s) => /^wheels/.test(s);
let y0 = 1e9; for (const n of root.listNodes()) if (isWheelNode(n.getName())) y0 = Math.min(y0, getBounds(n).min[1]);
for (const p of root.listMeshes().flatMap(m => m.listPrimitives())) { const P = p.getAttribute('POSITION'), v = [0, 0, 0]; for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); v[1] -= y0; P.setElement(i, v); } }

// 2) wheels: the 'wheels' (front pair) and 'wheels.001' (rear pair) meshes split by side; hub centre from the tyre material
const tri = (p) => { const I = p.getIndices(); const n = I ? I.getCount() : p.getAttribute('POSITION').getCount(); const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = I ? I.getScalar(i) : i; return a; };
const W = {};
for (const n of root.listNodes()) { if (!isWheelNode(n.getName())) continue;
  for (const p of n.getMesh().listPrimitives()) { if (!/tyre/.test(p.getMaterial().getBaseColorTexture()?.getName() || '')) continue;
    const P = p.getAttribute('POSITION'), v = [0, 0, 0];
    for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); const k = (v[2] > 0 ? 'F' : 'R') + (v[0] > 0 ? 'L' : 'R'); const b = W[k] || (W[k] = { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] }); for (let j = 0; j < 3; j++) { b.lo[j] = Math.min(b.lo[j], v[j]); b.hi[j] = Math.max(b.hi[j], v[j]); } } } }
for (const k in W) { const b = W[k]; b.c = b.lo.map((a, j) => (a + b.hi[j]) / 2); b.R = (b.hi[1] - b.lo[1]) / 2; console.log('wheel', k, b.c.map(x => x.toFixed(3)).join(','), 'R', b.R.toFixed(3), 'width', (b.hi[0] - b.lo[0]).toFixed(3), 'diamZ', (b.hi[2] - b.lo[2]).toFixed(3)); }
console.log('wheelbase', (W.FL.c[2] - W.RL.c[2]).toFixed(3), 'track F', (W.FL.c[0] - W.FR.c[0]).toFixed(3), 'R', (W.RL.c[0] - W.RR.c[0]).toFixed(3));
function sub(p, tris, off) {
  const map = new Map(), out = doc.createPrimitive().setMaterial(p.getMaterial()), idx = [];
  for (const i of tris) { if (!map.has(i)) map.set(i, map.size); idx.push(map.get(i)); }
  for (const sem of p.listSemantics()) { const A = p.getAttribute(sem), n = A.getElementSize(), arr = new Float32Array(map.size * n), e = new Array(n).fill(0);
    for (const [i, j] of map) { A.getElement(i, e); if (sem === 'POSITION' && off) for (let q = 0; q < 3; q++) e[q] -= off[q]; arr.set(e, j * n); }
    out.setAttribute(sem, doc.createAccessor().setType(A.getType()).setArray(arr).setBuffer(A.getBuffer())); }
  out.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(p.getAttribute('POSITION').getBuffer()));
  return out;
}
const side = (v) => (v[2] > 0 ? 'F' : 'R') + (v[0] > 0 ? 'L' : 'R');
const wheelParts = { FL: [], FR: [], RL: [], RR: [] }, caliper = { FL: [], FR: [], RL: [], RR: [] };
for (const n of [...root.listNodes()]) {
  const s = n.getName(), m = n.getMesh(); if (!m) continue;
  const toWheel = isWheelNode(s), toCal = /^hub_/.test(s); if (!toWheel && !toCal) continue;
  for (const p of m.listPrimitives()) { const ix = tri(p), P = p.getAttribute('POSITION'), v = [0, 0, 0], per = { FL: [], FR: [], RL: [], RR: [] };
    for (let t = 0; t < ix.length; t += 3) { P.getElement(ix[t], v); per[side(v)].push(ix[t], ix[t + 1], ix[t + 2]); }
    for (const k in per) if (per[k].length) { const q = sub(p, per[k], W[k].c);
      // the rear pair is modelled 1.8 % larger (scale 1.018 in the FBX); the real car has the same tyre all round
      if (k[0] === 'R') { const f = W.FL.R / W.RL.R, A = q.getAttribute('POSITION'), e = [0, 0, 0]; for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e); A.setElement(i, e.map(x => x * f)); } }
      (toWheel ? wheelParts : caliper)[k].push(q); } }
  n.dispose(); m.dispose();
}
for (const k of ['RL', 'RR']) { W[k].c[1] = W.FL.c[1]; W[k].R = W.FL.R; }
for (const k of ['FL', 'FR', 'RL', 'RR']) { const node = doc.createNode('WHL_' + k).setTranslation(W[k].c); scene.addChild(node);
  wheelParts[k].forEach((p, i) => node.addChild(doc.createNode('whl' + i + '_' + k).setMesh(doc.createMesh('whl' + i + '_' + k).addPrimitive(p))));
  caliper[k].forEach((p, i) => node.addChild(doc.createNode('caliper' + i + '_' + k).setMesh(doc.createMesh('caliper' + i + '_' + k).addPrimitive(p)))); }

// wobble check: tread vertices (r > 0.96 R) of the tyre; x against the angle about the axle (sin/cos fit = tilt of the axle)
for (const k in wheelParts) { let n = 0, sx = 0, sc = 0, ss = 0, cc = 0, sn = 0, cs = 0, xc = 0, xs = 0; const v = [0, 0, 0];
  for (const p of wheelParts[k]) { if (!/tyre/.test(p.getMaterial().getBaseColorTexture()?.getName() || '')) continue; const P = p.getAttribute('POSITION');
    for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); const r = Math.hypot(v[1], v[2]); if (r < 0.96 * W[k].R) continue; const a = Math.atan2(v[1], v[2]), c = Math.cos(a), s = Math.sin(a);
      n++; sx += v[0]; sc += c; ss += s; cc += c * c; sn += s * s; cs += c * s; xc += v[0] * c; xs += v[0] * s; } }
  const mx = sx / n, A = (xc - mx * sc) / (cc - sc * sc / n), B = (xs - mx * ss) / (sn - ss * ss / n);
  console.log('wobble', k, 'tread x amplitude', (Math.hypot(A, B) * 1000).toFixed(2), 'mm', 'tilt', (Math.atan(Math.hypot(A, B) / W[k].R) * 57.3).toFixed(3), 'deg'); }

// 3) materials: FBX2glTF turned every Phong into metal 0.4; flat 32 px colour swatches become plain colours
const SWATCH = { 'black.PNG': 24, 'gray.PNG': 127, 'gray1.PNG': 73 };
const lin = (c) => Math.pow(c / 255, 2.2);
for (const m of root.listMaterials()) {
  const n = m.getName(), tx = m.getBaseColorTexture()?.getName() || '';
  if (SWATCH[tx] != null) { const g = lin(SWATCH[tx]); m.setBaseColorTexture(null).setBaseColorFactor([g, g, g, 1]); }
  if (tx === 'red2.PNG') m.setBaseColorTexture(null).setBaseColorFactor([lin(189), lin(31), lin(32), 1]);
  if (m.getAlphaMode() === 'BLEND' && !/vehiclelights|caliperbadge|tembus|kaca/.test(tx)) m.setAlphaMode('OPAQUE');
  m.setMetallicFactor(0).setRoughnessFactor(0.6);
  if (/^primary/.test(n)) { m.setExtras({ paint: 1 }).setMetallicFactor(0.5).setRoughnessFactor(0.3); if (!tx) m.setBaseColorFactor([1, 1, 1, 1]); }
  else if (/^(movsteer_1\.0\.1|aluminium|back_chrome_light|wheels\.0)/.test(n)) m.setMetallicFactor(1).setRoughnessFactor(/aluminium/.test(n) ? 0.35 : 0.18);   // chrome trim, lamp reflectors, lug nuts
  else if (n === 'wheels.6') m.setMetallicFactor(0.7).setRoughnessFactor(0.3);   // rims
  else if (n === 'wheels.4') m.setMetallicFactor(0.6).setRoughnessFactor(0.4);   // brake discs
  else if (/^wheels\.[23]$/.test(n)) m.setRoughnessFactor(0.9);                     // tyres
  else if (/^hub_/.test(n)) m.setMetallicFactor(0.2).setRoughnessFactor(0.4);       // calipers
  else if (/^(dvorright|JUST_BLACK|black_lights|hitam|Plastic|front_black|door_lf)/.test(n)) m.setRoughnessFactor(0.55);
  else if (/^(Putih|Seat Leather|movsteer_1\.0\.0|Carpet)/.test(n)) m.setRoughnessFactor(/Carpet/.test(n) ? 0.95 : 0.5);
  else if (/^mirror_inside/.test(n)) m.setMetallicFactor(1).setRoughnessFactor(0.05);
  if (/^glass/.test(n)) m.setBaseColorTexture(null).setAlphaMode('BLEND').setAlpha(0.45).setBaseColorFactor([0.02, 0.025, 0.03, 0.45]).setMetallicFactor(0).setRoughnessFactor(0.05);
  if (/vehiclelights/.test(tx)) { m.setRoughnessFactor(0.15); if (!/rear|break|revlight|indicator .r/.test(n)) m.setEmissiveFactor([0, 0, 0]); }
  if (/rear light|breaklight/.test(n)) m.setEmissiveTexture(m.getBaseColorTexture()).setEmissiveFactor([0.3, 0.3, 0.3]);
  if (/^LCDs/.test(n)) m.setEmissiveTexture(m.getBaseColorTexture()).setEmissiveFactor([0.6, 0.6, 0.6]);
  if (/^(pantulans|light_pantulan)/.test(n)) m.setEmissiveFactor([0, 0, 0]);
  if (/^tembus/.test(n)) m.setBaseColorTexture(null).setBaseColorFactor([0.5, 0.02, 0.02, 0.55]).setAlpha(0.55).setMetallicFactor(0).setRoughnessFactor(0.08);
  if (/^platnomor/.test(n)) m.setBaseColorTexture(null).setBaseColorFactor([0.85, 0.85, 0.85, 1]);
}
await doc.transform(dedup());

// cabin parts (hidden in the cockpit view, where the procedural cabin is drawn)
const INT = /^(movsteer|ped_|Plastic$|belt|black(\.00[1-25])?$|satin_red|paint_black|chrome_$|aluminium$|hitam\.00[25]|texture_|aluminium2|Putih|whiteleather|Carpet|chromeBELT|LCDs|Seat Leather|Leather_white|mirror_inside)/;
for (const n of root.listNodes()) { if (!n.getMesh() || /^WHL_|^whl|^caliper/.test(n.getName())) continue; if (INT.test(n.getName())) n.setExtras({ tag: 'int' }); }

// 4) simplify (interior hard, lamps/trim gently, wheels carefully; body paint and glass as modelled)
await doc.transform(weld());
const stat = { before: 0, after: 0 };
for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; const s = n.getName(), isInt = n.getExtras().tag === 'int', isWhl = /^(whl|caliper)/.test(s);
  const paint = m.listPrimitives().some(p => p.getMaterial()?.getExtras().paint);
  for (const p of m.listPrimitives()) { const c0 = p.getIndices().getCount() / 3; stat.before += c0;
    const isPaint = p.getMaterial()?.getExtras().paint, isGlass = p.getMaterial()?.getAlphaMode() === 'BLEND';
    if (!(isPaint || isGlass)) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0, error: isInt ? 0.004 : isWhl ? 0.0012 : 0.0008, lockBorder: !isInt && !isWhl });
    const c1 = p.getIndices().getCount() / 3; stat.after += c1; if (c0 > 4000) console.log('simplify', s.slice(0, 24).padEnd(24), (p.getMaterial()?.getName() || '').slice(0, 18).padEnd(18), c0, '->', c1); } }
console.log('triangles', stat.before, '->', stat.after);

// 5) fewer draw calls: body parts in one mesh, cabin parts in another, each joined per material
for (const tag of ['body', 'int']) { const nodes = root.listNodes().filter(n => n.getMesh() && !/^(WHL_|whl|caliper)/.test(n.getName()) && (n.getExtras().tag === 'int') === (tag === 'int'));
  const mesh = doc.createMesh(tag), node = doc.createNode(tag === 'int' ? 'cabin' : 'body_all').setMesh(mesh); if (tag === 'int') node.setExtras({ tag: 'int' });
  for (const n of nodes) { const m = n.getMesh(); for (const p of m.listPrimitives()) { m.removePrimitive(p); mesh.addPrimitive(p); } n.dispose(); m.dispose(); }
  scene.addChild(node); }
await doc.transform(join({ keepNamed: true }));
for (const m of root.listMeshes()) if (m.getName() === 'body' || m.getName() === 'int') console.log('draws', m.getName(), m.listPrimitives().length);
await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [512, 512] }), quantize({ quantizePosition: 14, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT, doc);
const b = getBounds(scene); console.log('bounds', b.min.map(x => x.toFixed(3)).join(','), '|', b.max.map(x => x.toFixed(3)).join(','));
