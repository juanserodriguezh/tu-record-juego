// BYD Seagull: FBX (converted with FBX2glTF -b) -> assets/seagull.glb in the game's convention.
//   node prep_seagull.mjs <in.glb> <out.glb>
// Car frame: +Z forward, +X left, +Y up, metres, y = 0 under the tyres. Wheels split out of the merged meshes into
// WHL_FL/FR/RL/RR (axle on X, hub at the node origin). Body paint flagged { paint: 1 }, cabin parts { tag: 'int' }.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, clearNodeTransform, prune, dedup, weld, simplifyPrimitive, textureCompress, quantize, meshopt, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
const [IN, OUT] = process.argv.slice(2);
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(IN), root = doc.getRoot(), scene = root.getDefaultScene();
const nm = (s) => s.replace(/(model:|Mod_2:)/g, '');

// 1) scale: wheelbase of the asset (2.451 at x100) -> real 2.500 m. Bake every transform into the vertices.
const K = 100 * 2.5 / 2.451;
const top = scene.listChildren()[0]; top.setScale([K, K, K]);
await doc.transform(flatten());
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  if (m.listParents().filter(p => p.propertyType === 'Node').length > 1) n.setMesh(m.clone());
  if (n.getParentNode()) { const w = n.getWorldMatrix(); n.getParentNode().removeChild(n); scene.addChild(n); n.setMatrix(w); }
  clearNodeTransform(n);
}
for (const n of root.listNodes()) if (!n.getMesh()) n.dispose();
// ground under the tyres
let y0 = 1e9; for (const n of root.listNodes()) if (/tires/.test(n.getName())) y0 = Math.min(y0, getBounds(n).min[1]);
for (const p of root.listMeshes().flatMap(m => m.listPrimitives())) { const P = p.getAttribute('POSITION'), v = [0, 0, 0]; for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); v[1] -= y0; P.setElement(i, v); } }

// 2) wheels: triangles fully inside a wheel cylinder (tyre, rim, disc, hub) move to WHL_xx
const tri = (p) => { const I = p.getIndices(); const n = I ? I.getCount() : p.getAttribute('POSITION').getCount(); const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = I ? I.getScalar(i) : i; return a; };
const W = {};
{ const t = root.listNodes().find(n => /tires/.test(n.getName())).getMesh().listPrimitives()[0], P = t.getAttribute('POSITION'), v = [0, 0, 0];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); const k = (v[2] > 0 ? 'F' : 'R') + (v[0] > 0 ? 'L' : 'R'); const b = W[k] || (W[k] = { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] }); for (let j = 0; j < 3; j++) { b.lo[j] = Math.min(b.lo[j], v[j]); b.hi[j] = Math.max(b.hi[j], v[j]); } }
  for (const k in W) { const b = W[k]; b.c = b.lo.map((a, j) => (a + b.hi[j]) / 2); b.R = (b.hi[1] - b.lo[1]) / 2; console.log('wheel', k, b.c.map(x => x.toFixed(3)).join(','), 'R', b.R.toFixed(3), 'width', (b.hi[0] - b.lo[0]).toFixed(3)); } }
const inWheel = (v) => { for (const k in W) { const b = W[k]; if (Math.sign(v[0]) !== Math.sign(b.c[0])) continue; if (Math.hypot(v[1] - b.c[1], v[2] - b.c[2]) < b.R + 0.012 && Math.abs(v[0]) > Math.abs(b.c[0]) - 0.19 && Math.abs(v[0]) < Math.abs(b.c[0]) + 0.12) return k; } return null; };
// copy a subset of triangles of a primitive into a new primitive (vertices compacted, optional offset)
function sub(p, tris, off) {
  const map = new Map(), out = doc.createPrimitive().setMaterial(p.getMaterial()), idx = [];
  for (const i of tris) { if (!map.has(i)) map.set(i, map.size); idx.push(map.get(i)); }
  for (const sem of p.listSemantics()) { const A = p.getAttribute(sem), n = A.getElementSize(), arr = new Float32Array(map.size * n), e = new Array(n).fill(0);
    for (const [i, j] of map) { A.getElement(i, e); if (sem === 'POSITION' && off) for (let q = 0; q < 3; q++) e[q] -= off[q]; arr.set(e, j * n); }
    out.setAttribute(sem, doc.createAccessor().setType(A.getType()).setArray(arr).setBuffer(A.getBuffer())); }
  out.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(p.getAttribute('POSITION').getBuffer()));
  return out;
}
const wheelParts = { FL: [], FR: [], RL: [], RR: [] };
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m || !/tires|Black_Mat|map_2|MAT1/.test(n.getName())) continue;
  for (const p of m.listPrimitives()) {
    const ix = tri(p), P = p.getAttribute('POSITION'), v = [0, 0, 0], keep = [], per = { FL: [], FR: [], RL: [], RR: [] };
    for (let t = 0; t < ix.length; t += 3) { let k0 = undefined, ok = true; for (let j = 0; j < 3; j++) { P.getElement(ix[t + j], v); const k = inWheel(v); if (!k || (k0 && k !== k0)) { ok = false; break; } k0 = k; }
      (ok ? per[k0] : keep).push(ix[t], ix[t + 1], ix[t + 2]); }
    let moved = 0; for (const k in per) if (per[k].length) { wheelParts[k].push(sub(p, per[k], W[k].c)); moved += per[k].length / 3; }
    if (moved) { console.log('wheel tris from', nm(n.getName()), moved, 'kept', keep.length / 3); if (keep.length) m.addPrimitive(sub(p, keep)); m.removePrimitive(p); p.dispose(); }
  }
  if (!m.listPrimitives().length) { n.dispose(); m.dispose(); }
}
for (const k of ['FL', 'FR', 'RL', 'RR']) { const node = doc.createNode('WHL_' + k).setTranslation(W[k].c); scene.addChild(node);
  wheelParts[k].forEach((p, i) => node.addChild(doc.createNode('whl' + i + '_' + k).setMesh(doc.createMesh('whl' + i + '_' + k).addPrimitive(p)))); }

// 3) materials: FBX2glTF turned the Phong set into shiny metal (0.4 / roughness 0.05) and 'TransparentColor' into alpha 0
const PBR = [ // [regex on material name, metallic, roughness]
  [/^CP$/, 0.5, 0.32], [/tire/, 0, 0.88], [/Black_C|c616676|plastic_skin|PLASTICO|Carro_Plastico/, 0.05, 0.62], [/leather|Blur|bluer/, 0, 0.6],
  [/e14c6ff|c8fcc3/, 0, 0.9], [/^CH$/, 1, 0.22], [/brake_discs/, 0.55, 0.38], [/^MAT$|center_console|MAPS/, 0.15, 0.5], [/Farol|Laranja/, 0.8, 0.2], [/Light_Mat|phong4/, 0.1, 0.15]];
for (const m of root.listMaterials()) {
  const n = nm(m.getName()); m.setExtras({}); m.setName(n);
  if (m.getAlpha() < 0.05 && m.getBaseColorTexture()) m.setAlpha(1);                     // alpha 0 = lost TransparentColor
  if (m.getAlphaMode() === 'BLEND' && m.getAlpha() > 0.99) m.setAlphaMode('OPAQUE');      // all textures are opaque
  const r = PBR.find(([re]) => re.test(n)); if (r) { m.setMetallicFactor(r[1]); m.setRoughnessFactor(r[2]); }
  if (/^(b35d3f|fa16db)/.test(n)) { m.setAlphaMode('BLEND').setAlpha(0.42).setBaseColorFactor([0.02, 0.025, 0.03, 0.42]).setMetallicFactor(0).setRoughnessFactor(0.05); }  // window glass
  if (/^phong4$/.test(n)) m.setAlpha(0.6);                                                    // head-lamp lens over the lamp internals
  if (n === 'CP') { m.setExtras({ paint: 1 }); }
}
// tail-lamp strip and lamps: the texture is a photo of the lit lamp -> a little emissive so they read red
for (const m of root.listMaterials()) if (m.getName() === 'Light_Mat') { m.setEmissiveTexture(m.getBaseColorTexture()).setEmissiveFactor([0.35, 0.35, 0.35]); }
// fewer draw calls: the near-black untextured plastics (7 materials), the two lamp chromes and the two glass materials become one each
const GROUP = [/^(Black_C|c616676|mk_plastic_skin|PLASTICO_INT|Carro_Plastico|mk_leather_black_static|e14c6ff)/, /^Carro_Metal_Farol/, /^(b35d3f|fa16db)/];
for (const re of GROUP) { const ms = root.listMaterials().filter(m => re.test(m.getName())), keep = ms[0];
  for (const m of ms.slice(1)) { for (const p of m.listParents()) if (p.propertyType === 'Primitive') p.setMaterial(keep); m.dispose(); } }
// cabin parts (hidden in the cockpit view, where the procedural cabin is drawn)
const INT = /leather|ceiling|steering|stitches|buttons|metallic_plastic|carpet|Map_1|^Plastic$|^[0-9a-f]{20,}$/;
for (const n of root.listNodes()) { if (!n.getMesh() || /^WHL_|^whl/.test(n.getName())) continue; const s = nm(n.getName()); n.setName(s); if (INT.test(s) && !/blackout/.test(s)) n.setExtras({ tag: 'int' }); }

// 4) simplify: interior hard (only seen through the glass), body and lamps gently, wheels carefully (they must stay round)
await doc.transform(weld());
const stat = { before: 0, after: 0 };
for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; const s = n.getName(), isInt = n.getExtras().tag === 'int', isWhl = /^whl/.test(s);
  const err = isInt ? 0.004 : isWhl ? (/^whl0_/.test(s) ? 0.012 : 0.0015) : 0.0008;
  if (/Cap_Paint|Glass/.test(s)) continue;   // body paint stays as modelled: even a 0.012 % error ripples the reflections on the doors
  for (const p of m.listPrimitives()) { const c0 = p.getIndices().getCount() / 3; simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0, error: err, lockBorder: !isInt && !isWhl }); const c1 = p.getIndices().getCount() / 3; stat.before += c0; stat.after += c1;
    if (c0 > 3000) console.log('simplify', s.slice(0, 30).padEnd(30), c0, '->', c1); } }
console.log('triangles', stat.before, '->', stat.after);
await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88, resize: [512, 512] }), quantize({ quantizePosition: 14, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT, doc);
