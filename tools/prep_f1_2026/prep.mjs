// Prepares the AC-derived F1 2026 GLBs (Cadillac MAC-26, Ferrari SF-26) for the game: Y-up / +Z forward, tyres on y = 0, wheels split into
// WHL_FL/FR/RL/RR, cockpit parts tagged 'int', body simplified (not paint / decals / wheels), paint alpha = recolour weight, webp, quantize + meshopt.
// npm i @gltf-transform/core@4.2.1 @gltf-transform/extensions@4.2.1 @gltf-transform/functions@4.2.1 meshoptimizer@0.25.0 sharp@0.34.3
// node tools/prep_f1_2026/prep.mjs <fuente.glb> assets/sf26.glb "$(cat tools/prep_f1_2026/sf26.json)"
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { clearNodeTransform, weld, simplifyPrimitive, textureCompress, quantize, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
const CFG = JSON.parse(process.argv[4]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const R = doc.getRoot(), buf = R.listBuffers()[0], scene = R.listScenes()[0];
const src = R.listNodes()[0];
clearNodeTransform(src);
if (CFG.scale && CFG.scale !== 1) { // uniform scale baked into the vertices
  for (const p of src.getMesh().listPrimitives()) { const a = p.getAttribute('POSITION'), v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); a.setElement(i, v.map(x => x * CFG.scale)); } } }
{ // lift so the tyres touch y = 0
  let lo = 1e9; const v = []; for (const p of src.getMesh().listPrimitives()) if (p.getMaterial().getName() === CFG.tread) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); lo = Math.min(lo, v[1]); } }
  console.log('lift', (-lo).toFixed(3));
  for (const p of src.getMesh().listPrimitives()) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); v[1] -= lo; a.setElement(i, v); } } }
await doc.transform(weld());
const mesh = src.getMesh();
const prims = mesh.listPrimitives();
const mname = (p) => p.getMaterial().getName();
// sub-primitive with the triangles that pass `keep`, vertices compacted, positions shifted by -off
function sub(p, keep, off = [0, 0, 0]) {
  const idx = p.getIndices().getArray(), pos = p.getAttribute('POSITION'), map = new Map(), out = [], v = [];
  const c = [0, 0, 0];
  for (let t = 0; t < idx.length; t += 3) {
    c[0] = c[1] = c[2] = 0; for (let k = 0; k < 3; k++) { pos.getElement(idx[t + k], v); c[0] += v[0] / 3; c[1] += v[1] / 3; c[2] += v[2] / 3; }
    if (!keep(c)) continue;
    for (let k = 0; k < 3; k++) { const o = idx[t + k]; if (!map.has(o)) map.set(o, map.size); out.push(map.get(o)); }
  }
  if (!out.length) return null;
  const np = doc.createPrimitive().setMaterial(p.getMaterial());
  for (const s of p.listSemantics()) {
    const a = p.getAttribute(s), n = a.getElementSize(), arr = new Float32Array(map.size * n), e = [];
    for (const [o, i] of map) { a.getElement(o, e); for (let k = 0; k < n; k++) arr[i * n + k] = e[k] - (s === 'POSITION' ? off[k] : 0); }
    np.setAttribute(s, doc.createAccessor().setType(a.getType()).setArray(arr).setBuffer(buf));
  }
  np.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(out)).setBuffer(buf));
  return np;
}
const bbox = (p, keep) => { const idx = p.getIndices().getArray(), pos = p.getAttribute('POSITION'), v = [], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let t = 0; t < idx.length; t++) { pos.getElement(idx[t], v); if (keep && !keep(v)) continue; for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } } return [mn, mx]; };
// wheel centres from the tread
const tread = prims.find(p => mname(p) === CFG.tread), [tmn, tmx] = bbox(tread), zMid = (tmn[2] + tmx[2]) / 2;
const Q = { FL: c => c[0] > 0 && c[2] > zMid, FR: c => c[0] < 0 && c[2] > zMid, RL: c => c[0] > 0 && c[2] < zMid, RR: c => c[0] < 0 && c[2] < zMid };
const CTR = {};
for (const [k, f] of Object.entries(Q)) { const [mn, mx] = bbox(tread, f); CTR[k] = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]; console.log(k, 'centre', CTR[k].map(x => x.toFixed(3)).join(','), 'dia', (mx[1] - mn[1]).toFixed(3), 'width', (mx[0] - mn[0]).toFixed(3)); }
console.log('wheelbase', (CTR.FL[2] - CTR.RL[2]).toFixed(3), 'track F', (CTR.FL[0] - CTR.FR[0]).toFixed(3), 'R', (CTR.RL[0] - CTR.RR[0]).toFixed(3));
const [amn, amx] = prims.reduce((a, p) => { const [mn, mx] = bbox(p); return [a[0].map((x, i) => Math.min(x, mn[i])), a[1].map((x, i) => Math.max(x, mx[i]))]; }, [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]]);
console.log('overall', amn.map(x => x.toFixed(3)).join(','), amx.map(x => x.toFixed(3)).join(','), 'len', (amx[2] - amn[2]).toFixed(3), 'wid', (amx[0] - amn[0]).toFixed(3), 'hgt', (amx[1] - amn[1]).toFixed(3));
// build nodes
const whl = {};
for (const k of ['FL', 'FR', 'RL', 'RR']) { whl[k] = doc.createNode('WHL_' + k).setTranslation(CTR[k]); scene.addChild(whl[k]); }
const intMesh = new Map();
const nearWheel = (c) => { for (const k in CTR) { const w = CTR[k]; if (Math.hypot(c[1] - w[1], c[2] - w[2]) < 0.42 && Math.abs(c[0] - w[0]) < 0.3) return k; } return null; };
for (const p of prims) {
  const n = mname(p);
  if (CFG.wheels.includes(n)) {
    for (const k of Object.keys(Q)) { const np = sub(p, c => nearWheel(c) === k, CTR[k]); if (!np) continue;
      const m = doc.createMesh('wpart_' + n + '__' + k).addPrimitive(np); whl[k].addChild(doc.createNode('wpart_' + n + '__' + k).setMesh(m)); }
    const rest = sub(p, c => !nearWheel(c)); if (rest) { console.log('wheel mat outside wheels', n, rest.getIndices().getCount() / 3); mesh.addPrimitive(rest); }
    mesh.removePrimitive(p); p.dispose(); continue;
  }
  if (CFG.int.includes(n)) { mesh.removePrimitive(p); const m = doc.createMesh('sp_' + n).addPrimitive(p); const nd = doc.createNode('sp_' + n).setMesh(m).setExtras({ tag: 'int' }); scene.addChild(nd); continue; }
}
// simplify body (not paint / decals / numbers)
let before = 0, after = 0;
for (const p of mesh.listPrimitives()) { const n = mname(p), t0 = p.getIndices().getCount() / 3; before += t0;
  if (!CFG.keep.some(r => new RegExp(r).test(n)) && t0 > 2000) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0, error: CFG.err, lockBorder: true });
  const t1 = p.getIndices().getCount() / 3; after += t1; if (t1 !== t0) console.log('simplify', n, t0, '->', t1); }
console.log('body tris', before, '->', after);
// materials: decals / numbers alpha-tested, glass blended, useless flat normal maps dropped
for (const m of R.listMaterials()) { const n = m.getName();
  if (m.getNormalTexture() && /flat_nm/.test(m.getNormalTexture().getName())) m.setNormalTexture(null);
  if (CFG.mask.some(r => new RegExp(r).test(n))) m.setAlphaMode('MASK').setAlphaCutoff(0.5);
  if (CFG.glass && CFG.glass.includes(n)) m.setAlphaMode('BLEND').setBaseColorFactor([0.03, 0.04, 0.05, 0.4]).setBaseColorTexture(null).setRoughnessFactor(0.05).setMetallicFactor(0.1);
}
// paint: alpha = recolour weight. 'ref' mode: closeness to the base colour; 'dark' mode: darkness of unsaturated pixels (black body -> colour, white stays)
const paint = R.listMaterials().find(m => m.getName() === CFG.paint), ptex = paint.getBaseColorTexture();
{ const { data, info } = await sharp(Buffer.from(ptex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let ref = CFG.ref;
  if (CFG.mode === 'ref') { // refine the reference to the mean of pixels near the hint
    let s = [0, 0, 0], n = 0; for (let i = 0; i < data.length; i += 3) { const d = Math.hypot(data[i] - ref[0], data[i + 1] - ref[1], data[i + 2] - ref[2]); if (d < 30) { s[0] += data[i]; s[1] += data[i + 1]; s[2] += data[i + 2]; n++; } }
    ref = s.map(x => Math.round(x / n)); }
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]; let w;
    if (CFG.mode === 'ref') { const d = Math.hypot(r - ref[0], g - ref[1], b - ref[2]); w = Math.min(1, Math.max(0, (70 - d) / 40)); }
    else { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0; w = (1 - (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * Math.min(1, Math.max(0, (0.25 - sat) / 0.15)); }
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = Math.round(w * 255);
  }
  const hex = '#' + ref.map(x => x.toString(16).padStart(2, '0')).join('');
  console.log('paint ref', hex);
  var PAINT_WEBP = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(CFG.paintSize, CFG.paintSize).webp({ quality: 90, alphaQuality: 90, exact: true }).toBuffer();
  ptex.setName('PAINTMASK_' + ptex.getName());
  paint.setExtras({ paint: 1, paintMask: 1, paintRef: hex });
}
await doc.transform(prune(), dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 85 }));
ptex.setImage(new Uint8Array(PAINT_WEBP)).setMimeType('image/webp');
await doc.transform(
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(process.argv[3], doc);
let tri = 0; for (const m of R.listMeshes()) for (const p of m.listPrimitives()) tri += p.getIndices().getCount() / 3;
console.log('total tris', tri);
