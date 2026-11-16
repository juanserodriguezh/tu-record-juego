// v117: adds the cabin parts that the optimised assets had dropped, taken from the original models
// (Juanse's Mac: ~/Documents/juego-carreras/fuentes/). The existing asset is kept as is (same meshes, same compression);
// the chosen source nodes are appended with their world transform baked, tagged `int` (cabin) or `swown` (the model's own
// steering wheel: shown from outside, hidden in the cockpit where the game's wheel and hands are drawn).
//   node tools/prep_cabins.mjs nascar <2018_Camaro.glb> <texture dir>     (FBX -> GLB first: FBX2glTF -b -i 2018_Camaro.FBX -o nascar)
//   node tools/prep_cabins.mjs bmw "<bmw_m_hybrid_v8 (1).glb>"
// deps (not in package.json): @gltf-transform/core, /extensions, /functions, meshoptimizer, sharp
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplifyPrimitive, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const [car, SRC, TEX = ''] = process.argv.slice(2);
const CFG = {
  // source: nose at -Z, same scale and origin as the asset -> half a turn about Y
  nascar: { T: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1], err: 0.002,
    pick: (n) => /^CAMARO_(GaugeCluster|NewSeat|WindowNet)$/.test(n) ? 'int' : n === 'CAMARO_SteeringWheel' ? 'swown' : '',
    mats: { 'Material #4096': { tex: 'Chevy_18_Dash.jpg', r: 0.75, m: 0 }, 'Material #4084': { tex: 'Chevy_18_Fabric.png', r: 0.95, m: 0 }, 'Carbon Fiber': { use: 'Carbon Fiber' },
      'inside_frame_details': { tex: 'inside_frame_details.png', r: 0.8, m: 0, ds: 1, mask: 1 }, 'black trim': { use: 'black trim' }, 'red tape': { col: [0.26, 0.07, 0.07], r: 0.7, m: 0 } } },
  // source sits 0.07 m lower than the asset (the asset was lifted to its ride height)
  bmw: { T: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.07, 0, 1], err: 0.001,
    pickMat: (m) => /^(INT_ButtonBox|DISPLAY2|dials_alpha|shift_lights)$/.test(m) ? 'int' : /^(sw_|963_sw_carbon|DISPLAY$|logo_cos)/.test(m) ? 'swown' : '',
    mats: { DISPLAY2: { emis: 0.7 }, DISPLAY: { emis: 0.7 }, dials_alpha: { emis: 0.5 }, shift_lights: { emis: 0.4 } }, swErr: 0.004 },
};
const C = CFG[car]; if (!C || !SRC) { console.log('usage: prep_cabins.mjs nascar|bmw <source.glb> [texture dir]'); process.exit(1); }
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const OUT = path.join(root, 'assets', car + '.glb');
const dst = await io.read(OUT), src = await io.read(SRC);
const dr = dst.getRoot(), buf = dr.listBuffers()[0], scene = dr.listScenes()[0];
if (dr.listNodes().some(n => n.getName().startsWith('CAB_'))) { console.log('already has CAB_ nodes: start from the asset in git'); process.exit(1); }
await src.transform(weld());
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const matCache = new Map(), texCache = new Map();
async function webp(bytes, size = 512) { return new Uint8Array(await sharp(bytes).resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer()); }
async function material(sm) {
  const name = sm ? sm.getName() : 'none', c = (C.mats || {})[name] || {};
  if (matCache.has(name)) return matCache.get(name);
  let m;
  if (c.use) m = dr.listMaterials().find(x => x.getName() === c.use);
  if (!m) {
    m = dst.createMaterial('cab_' + name).setRoughnessFactor(c.r ?? Math.max(0.5, sm.getRoughnessFactor())).setMetallicFactor(c.m ?? 0).setDoubleSided(true);
    m.setBaseColorFactor(c.col ? [...c.col, 1] : sm.getBaseColorFactor());
    let bytes = null, key = '';
    if (c.tex) { key = c.tex; bytes = fs.readFileSync(path.join(TEX, c.tex)); } else { const t = sm.getBaseColorTexture(); if (t && t.getSize() && t.getSize()[0] > 4) { key = name; bytes = t.getImage(); } }
    if (bytes) { let t = texCache.get(key); if (!t) { t = dst.createTexture('cab_' + key).setImage(await webp(bytes)).setMimeType('image/webp'); texCache.set(key, t); }
      m.setBaseColorTexture(t); m.setBaseColorFactor([1, 1, 1, 1]); if (c.emis) m.setEmissiveTexture(t).setEmissiveFactor([c.emis, c.emis, c.emis]); if (c.mask) m.setAlphaMode('MASK').setAlphaCutoff(0.5); }
  }
  matCache.set(name, m); return m;
}
let tris = 0, n0 = 0;
for (const n of src.getRoot().listNodes()) { const mesh = n.getMesh(); if (!mesh) continue;
  const W = mul(C.T, n.getWorldMatrix()), det = W[0] * (W[5] * W[10] - W[6] * W[9]) - W[4] * (W[1] * W[10] - W[2] * W[9]) + W[8] * (W[1] * W[6] - W[2] * W[5]);
  for (const p of mesh.listPrimitives()) { const mn = p.getMaterial() ? p.getMaterial().getName() : '';
    const tag = C.pick ? C.pick(n.getName()) : C.pickMat(mn); if (!tag) continue;
    if (p.getIndices().getCount() > 600) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0, error: tag === 'swown' && C.swErr ? C.swErr : C.err, lockBorder: false });
    const P = p.getAttribute('POSITION'), N = p.getAttribute('NORMAL'), U = p.getAttribute('TEXCOORD_0'), I = p.getIndices(), cnt = P.getCount();
    const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2), v = [0, 0, 0];
    for (let i = 0; i < cnt; i++) { P.getElement(i, v); const [x, y, z] = v;
      pos[i * 3] = W[0] * x + W[4] * y + W[8] * z + W[12]; pos[i * 3 + 1] = W[1] * x + W[5] * y + W[9] * z + W[13]; pos[i * 3 + 2] = W[2] * x + W[6] * y + W[10] * z + W[14];
      if (N) { N.getElement(i, v); const a = W[0] * v[0] + W[4] * v[1] + W[8] * v[2], b = W[1] * v[0] + W[5] * v[1] + W[9] * v[2], c = W[2] * v[0] + W[6] * v[1] + W[10] * v[2], l = Math.hypot(a, b, c) || 1; nor[i * 3] = a / l; nor[i * 3 + 1] = b / l; nor[i * 3 + 2] = c / l; }
      if (U) { U.getElement(i, v); uv[i * 2] = v[0]; uv[i * 2 + 1] = v[1]; } }
    const idx = new Uint32Array(I.getArray()); if (det < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t; }
    const prim = dst.createPrimitive().setMaterial(await material(p.getMaterial()))
      .setAttribute('POSITION', dst.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf))
      .setAttribute('NORMAL', dst.createAccessor().setType('VEC3').setArray(nor).setBuffer(buf))
      .setAttribute('TEXCOORD_0', dst.createAccessor().setType('VEC2').setArray(uv).setBuffer(buf))
      .setIndices(dst.createAccessor().setType('SCALAR').setArray(cnt < 65536 ? new Uint16Array(idx) : idx).setBuffer(buf));
    const nn = dst.createNode('CAB_' + (n0++) + '_' + (C.pick ? n.getName() : mn)).setMesh(dst.createMesh().addPrimitive(prim)).setExtras({ tag });
    scene.addChild(nn);
    tris += idx.length / 3; console.log(tag.padEnd(5), nn.getName().slice(0, 40).padEnd(40), idx.length / 3);
  } }
await dst.transform(prune());
await io.write(OUT, dst);
console.log(car, 'added', n0, 'pieces,', tris, 'triangles ->', OUT, (fs.statSync(OUT).size / 1024).toFixed(0), 'KB');
