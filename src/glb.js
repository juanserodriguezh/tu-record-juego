// ============================================================================
//  Real 3D models (GLB, reduced offline): they replace the exterior of selected cars. The procedural
//  car still supplies cockpit / helmet / hands / dash / cameras; if a model fails to load the car keeps
//  its procedural body.
// ============================================================================
const GLBS = {}, GLB_TCAM = {};
// Very smooth (roughness ~0) glossy surfaces such as the F2004 mirrors give a sun glint of >65504 in the half-float HDR target:
// that becomes Inf -> NaN in the bloom blur and shows as a black rectangle that flickers with the view angle. Clamp the minimum roughness.
THREE.ShaderChunk.lights_physical_fragment = THREE.ShaderChunk.lights_physical_fragment.replace(/0\.0525/g, '0.16');
let GLB_PAINT = null;
async function loadGlbs(progress) {
  const EMB = typeof GLB_B64 !== 'undefined' ? GLB_B64 : null, PACKS = typeof GLB_PACKS !== 'undefined' ? GLB_PACKS : null;
  if (!EMB && !PACKS) return;
  // fetch with retries (hosting can throttle / drop a request)
  const getBuf = async (url) => { let err; for (let a = 0; a < 4; a++) { try { const r = await fetch(url, { cache: a ? 'reload' : 'default' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.arrayBuffer(); } catch (e) { err = e; await new Promise(res => setTimeout(res, 600 * (a + 1))); } } throw err; };
  const PB = {}; const URLS = PACKS ? Object.fromEntries(PACKS.flatMap((p, pi) => Object.keys(p.items).map(k => [k, pi]))) : null;
  let GL;
  try { GL = (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader; } catch (e) { console.warn('GLTFLoader unavailable', e); return; }
  const loader = new GL(), ids = Object.keys(EMB || URLS);
  try { loader.setMeshoptDecoder((await import('three/addons/libs/meshopt_decoder.module.js')).MeshoptDecoder); } catch (e) { console.warn('meshopt decoder unavailable', e); }
  let i = 0;
  for (const id of ids) {
    try {
      if (progress) progress(i / ids.length, id);
      let buf;
      if (EMB) { const bin = atob(EMB[id]), u8 = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k); buf = u8.buffer; }
      else { const pi = URLS[id], P = PACKS[pi]; if (!PB[pi]) PB[pi] = getBuf(P.url); const all = await PB[pi]; const [o, l] = P.items[id]; buf = all.slice(o, o + l); }
      const gltf = await new Promise((res, rej) => loader.parse(buf, '', res, rej));
      gltf.scene.traverse(o => { if (o.isMesh) { o.frustumCulled = true; const m = o.material; if (m) { m.envMapIntensity = 1.0; for (const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap']) if (m[k]) m[k].channel = 0; if (m.map) m.map.anisotropy = 4; } } });
      if (id === 'nascar') { // source materials carry a bogus yellow base colour: recolour by name
        const FIX = { 'Carbon Fiber': [0x08080a], 'rubber': [0x050506], 'hood pin': [0x8c8f94], 'Inside_frame_baked': [0x8c8f94], 'Side Pipes': [0x595c61], 'orig_19 - Default': [0x0f0f11], 'MainGlass': [0x0a0d10, .6], 'GLASS side window': [0x0a0d10, .5], 'GlassName2018': [0x0a0d10, .35] };
        gltf.scene.traverse(o => { if (o.isMesh && o.material && FIX[o.material.name]) { const f = FIX[o.material.name]; o.material.color.setHex(f[0]); if (f[1] != null) o.material.opacity = f[1]; } });
      }
      // IndyCar mirrors are modelled as clear glass (empty frames from the cockpit) -> dark reflective faces
      if (id === 'indy23') {
        const MM = new THREE.MeshStandardMaterial({ color: 0x0c1015, metalness: 0.85, roughness: 0.1, envMapIntensity: 0.5 });
        gltf.scene.traverse(o => { if (o.isMesh && /mirror/i.test(o.name)) o.material = MM; });
      }
      // Porsche "Rexy": the windows live in the 'Glass' atlas with their transparency in the texture alpha, but the GLB marks it OPAQUE,
      // so from the cockpit the lower windscreen drew as a dark slab over the bonnet. Blend it (outside view). In the cockpit the whole
      // 'Glass' mesh is hidden: the clip box slices the thick windscreen and its cut edge drew a dark line across the view.
      if (id === 'rexy') gltf.scene.traverse(o => { if (!o.isMesh || !o.material || o.material.name !== 'Glass') return; o.material.transparent = true; o.material.userData.cabHide = 1; });
      // Red Bull AMG: the windscreen sticker sheet lost its texture -> an untextured near-black sheet (alpha 0.56 > mask cutoff 0.4) that
      // covered the windscreen from the inside. Hidden in the cockpit view only (applyGlb collects it, setInterior toggles it).
      if (id === 'gt3rb') gltf.scene.traverse(o => { if (o.isMesh && o.material && o.material.name === 'MI_Vehicle_Windows_Stickers' && !o.material.map) o.material.userData.cabHide = 1; });
      // tinted glass: darker / less mirror-like so windows read as glass and not as flat grey holes; clearer from the cockpit (setInterior)
      gltf.scene.traverse(o => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (m && m.transparent && m.color && m.color.r + m.color.g + m.color.b < 0.35 && m.opacity < 0.75 && !m.userData.isGlass) { m.userData.isGlass = 1; m.userData.hiOp = Math.max(m.opacity, 0.72); m.opacity = m.userData.hiOp; m.envMapIntensity = 0.45; m.roughness = Math.max(m.roughness, 0.15); m.metalness = 0; m.depthWrite = false; m.needsUpdate = true; } } });
      // single-sided scans (919, Valkyrie, Valkyrie LM): shells look see-through from inside the cockpit
      if (['p919', 'valk', 'valklm'].includes(id)) gltf.scene.traverse(o => { if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && !m.transparent) { m.side = THREE.DoubleSide; } });
      if (id !== 'sw') await mergeStatic(gltf.scene);
      glbLodTag(gltf.scene);
      GLBS[id] = gltf.scene;
    } catch (e) { console.warn('GLB failed', id, e); }
    i++;
  }
}
// Scanned cars come as hundreds of tiny meshes: with 20+ of them on the grid that is thousands of draw calls (lag). Everything that never
// moves relative to the body (not the wheel hubs) is welded into one mesh per material / cockpit-tag.
async function mergeStatic(root) {
  let BU; try { BU = await import('three/addons/utils/BufferGeometryUtils.js'); } catch (e) { return; }
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4();
  const groups = new Map();
  const inWheel = (o) => { for (let p = o; p; p = p.parent) if (/^WHL_/.test(p.name)) return true; return false; };
  const tagOf = (o) => { for (let p = o; p; p = p.parent) { if (p.userData && p.userData.tag) return p.userData.tag; if (p === root) break; } return ''; };
  const list = []; root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !Array.isArray(o.material) && o.visible && !inWheel(o)) list.push(o); });
  for (const o of list) {
    const key = o.material.uuid + '|' + tagOf(o) + '|' + o.renderOrder;
    let g = groups.get(key); if (!g) groups.set(key, g = { mat: o.material, tag: tagOf(o), ro: o.renderOrder, geos: [], meshes: [] });
    const og = o.geometry, geo = new THREE.BufferGeometry();
    for (const [k, n] of [['position', 3], ['normal', 3], ['uv', 2]]) { const at = og.attributes[k]; if (!at) continue; const arr = new Float32Array(at.count * n);   // plain copy: meshopt gives interleaved attributes
      for (let i = 0; i < at.count; i++) { arr[i * n] = at.getX(i); arr[i * n + 1] = at.getY(i); if (n > 2) arr[i * n + 2] = at.getZ(i); } geo.setAttribute(k, new THREE.BufferAttribute(arr, n)); }
    if (og.index) geo.setIndex(new THREE.BufferAttribute(new Uint32Array(og.index.array), 1));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.index) { const n = geo.attributes.position.count, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; geo.setIndex(new THREE.BufferAttribute(idx, 1)); }
    M.multiplyMatrices(inv, o.matrixWorld); geo.applyMatrix4(M);
    if (M.determinant() < 0) { const ix = geo.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } }
    g.geos.push(geo); g.meshes.push(o);
  }
  for (const g of groups.values()) {
    if (g.meshes.length < 2) { for (const gg of g.geos) gg.dispose(); continue; }
    const merged = BU.mergeGeometries(g.geos, false); for (const gg of g.geos) gg.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, g.mat); m.name = 'merged'; m.renderOrder = g.ro; m.frustumCulled = true;
    if (g.tag) m.userData.tag = g.tag;
    for (const o of g.meshes) { o.parent.remove(o); o.geometry.dispose(); }
    root.add(m);
  }
}
// Textured liveries (F1 2026): the paint texture's alpha is the recolour weight baked offline (1 = body colour, 0 = stripes / logos).
// The texel moves by (chosen - original) * weight, so the original colour gives the texture back unchanged and shading / edges stay.
function glbPaintMask(mat) {
  const ref = new THREE.Color(mat.userData.paintRef || '#000000'), mode = mat.userData.paintMode || 'alpha';
  // v104: the weight is computed here from the texel (same formulas as tools/prep_f1_2026/prep.mjs, on sRGB values). It used to be
  // the texture alpha, but browsers premultiply alpha on decode, so weight-0 texels (the white of the Cadillac livery) came out black.
  const W = mode === 'ref' ? ' float pd = length( ps - pow( paintRef, vec3( 1.0 / 2.2 ) ) ) * 255.0;\n float pw = clamp( ( 70.0 - pd ) / 40.0, 0.0, 1.0 );\n'
    : mode === 'dark' ? ' float pmx = max( ps.r, max( ps.g, ps.b ) ), pmn = min( ps.r, min( ps.g, ps.b ) ), psat = pmx > 0.0 ? ( pmx - pmn ) / pmx : 0.0;\n float pw = ( 1.0 - dot( ps, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * clamp( ( 0.25 - psat ) / 0.15, 0.0, 1.0 );\n'
    : ' float pw = pt.a;\n';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.paintRef = { value: ref };
    sh.fragmentShader = 'uniform vec3 paintRef;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n vec4 pt = texture2D( map, vMapUv );\n vec3 ps = pow( max( pt.rgb, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) );\n' + W + ' diffuseColor.rgb = clamp( pt.rgb + ( diffuse - paintRef ) * pw, 0.0, 1.0 );\n#endif');
  };
  mat.customProgramCacheKey = () => 'paintMask-' + mode;
}
// Replace the procedural exterior of `out` with the GLB model. cfg: { dz (cockpit shift), int: [regex of nodes hidden from inside] }
function applyGlb(out, spec) {
  const src = GLBS[spec.glb]; if (!src) return;
  const { body, root } = out;
  // 1) remove procedural wheels
  for (const w of out.wheels) if (w.parent) w.parent.remove(w);
  for (const p of out.steerPivots) if (p.parent) p.parent.remove(p);
  out.wheels = []; out.steerPivots = [];
  const g = src.clone(true);
  const hub = {};
  for (const n of [...g.children]) { const m = /^WHL_(F|R)(L|R)$/.exec(n.name); if (m) { hub[n.name.slice(4)] = n; g.remove(n); } }
  const fz = hub.FL.position.z, rz = hub.RL.position.z;
  const dz = out.a - fz, dy = spec.dy || 0; out.glbDz = dz;
  g.position.set(0, dy, dz);
  // livery: materials flagged as paint take the chosen colours (cloned per colour so other cars keep theirs)
  { const cache = GLB_PAINT || (GLB_PAINT = new Map());
    g.traverse(o => { if (!o.isMesh) return; const mats = Array.isArray(o.material) ? o.material : [o.material];
      const nm = mats.map(m => { const pk = m && m.userData && m.userData.paint; if (!pk) return m; const hex = pk === 1 ? out.liv.col : out.liv.col2; if (!hex) return m;
        const fin = out.liv.finish || 'brillo', key = spec.glb + '|' + m.uuid + '|' + hex + '|' + fin; let c = cache.get(key);
        if (!c) { c = m.clone(); c.color.set(hex); if (fin === 'mate') { c.metalness = 0; c.roughness = 0.62; } else if (fin === 'metal') { c.metalness = 0.85; c.roughness = 0.2; } if (m.userData.paintMask) glbPaintMask(c); cache.set(key, c); } return c; });
      o.material = Array.isArray(o.material) ? nm : nm[0]; }); }
  body.add(g); out.glb = g;
  // 2) wheels (order FL, FR, RL, RR as the procedural ones)
  for (const k of ['FL', 'FR', 'RL', 'RR']) {
    const n = hub[k], front = k[0] === 'F';
    if (spec.trueWheels !== false) {   // keep the correction only when it measurably trues the tyre (unstable fits on wide road tyres are rolled back)
      const save = n.children.map(o => [o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
      const tw = spec.trueWheels === 3 ? trueWheel3 : spec.trueWheels === 2 ? trueWheel2 : trueWheel, t0 = tw(n, true);
      if (t0 > 0.006) { tw(n); tw(n); if (tw !== trueWheel) tw(n); const t1 = tw(n, true);
        if (!(t1 < t0 * 0.5)) { for (const [o, p, q, sc] of save) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); } n.userData.trued = 0; }
        else n.userData.trued = [+(t0 * 57.3).toFixed(2), +(t1 * 57.3).toFixed(2)]; } }
    const R = Math.max(...n.children.map(c => { const b = new THREE.Box3().setFromObject(c); return (b.max.y - b.min.y) / 2; }));
    const tyre = n.children.find(c => c.isMesh) || n.children[0];
    const w = n; w.userData.R = R; w.userData.hw = 0.15;
    // damage code reads wheel.geometry for the radius / width
    let big = null, bs = 0; w.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); const s = o.geometry.boundingBox.max.y; if (s > bs) { bs = s; big = o; } } });
    w.geometry = big.geometry;
    // off-axis parts (brake ducts / calipers: 'Carbon' on the 919) must not spin with the wheel: they would swing through the tyre and the bodywork
    for (const o of n.children) { if (!o.isMesh || !/carbon|caliper|duct|brake/i.test(o.name)) continue;
      o.geometry.computeBoundingBox(); const ctr = o.geometry.boundingBox.getCenter(new THREE.Vector3()).add(o.position);
      if (Math.hypot(ctr.y, ctr.z) > 0.03 || (spec.wheelStat && spec.wheelStat.test(o.name + '|' + ((o.material && o.material.name) || '')))) (w.userData.stat || (w.userData.stat = [])).push({ o, p: o.position.clone() }); }
    w.userData.out = n.position.x >= 0 ? 1 : -1;   // which side of the car the outer sidewall faces (+x = left)
    const pos = n.position.clone(); pos.z += dz;
    if (front) { const piv = new THREE.Group(); piv.position.copy(pos); n.position.set(0, 0, 0); piv.add(n); root.add(piv); out.steerPivots.push(piv); }
    else { n.position.copy(pos); root.add(n); }
    n.traverse(o => { if (o.isMesh) o.castShadow = true; });
    out.wheels.push(w);
  }
  // 3) nodes hidden when the interior (cockpit view) is shown
  out.glbInt = [];
  g.traverse(o => { if (o.userData && o.userData.tag === 'int') out.glbInt.push(o); });
  // real cockpit: the model's own dash/trim replace the procedural cabin shell (wheel, hands, cluster and mirror stay procedural)
  if (spec.realCab && out.interior && (out.glbInt.length || spec.realCab === 2)) {
    const hide = new Set([CM.cab, CM.cabLit, CM.cabSatin, CM.cabGloss, CM.windshield]);
    out.interior.traverse(o => { if (o.isMesh && hide.has(o.material)) { o.visible = false; o.userData.procCab = true; } });
    out.glbCab = true;
  }
  // 4) procedural cockpit parts follow the real cockpit position
  const cdz = spec.cdz || 0, cdx = spec.cdx || 0, cdy = spec.cdy || 0;
  if (cdz || cdx || cdy) {
    const cock = new THREE.Group(); cock.position.set(cdx, cdy, cdz); body.add(cock);
    body.remove(out.interior); cock.add(out.interior);
    for (const m of [...(out.helmetParts || []), ...(out.hideInCockpit || [])]) { body.remove(m); cock.add(m); }
    if (out.eye) { out.eye.z += cdz; out.eye.x += cdx; out.eye.y += cdy; }
    if (out.cams && out.cams.onboard && spec.cdzCam !== false) { out.cams.onboard.z += cdz; out.cams.onboard.x += cdx; if (spec.cdyCam) out.cams.onboard.y += cdy; }
    out.cdz = cdz; out.cdx = cdx; out.cdy = cdy;
  }
  out.glbCabHide = []; g.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.cabHide) out.glbCabHide.push(o); });
  out.glbDims = { fz: fz + dz, rz: rz + dz };
  if (spec.noCluster && out.interior && out.dash) out.interior.traverse(o => { if (o.isMesh && o.material && o.material.map === out.dash.tex) o.visible = false; });
  if (spec.onb && out.cams) { out.cams.onboard.set(spec.onb[0], spec.onb[1], spec.onb[2]); if (spec.onb[3] != null) out.cams.onPitch = spec.onb[3]; }
  // single-seaters: put the T-cam on top of the model's own roll hoop / airbox (the procedural one sits
  // inside the scanned bodywork). Highest point of the body within a narrow strip behind the eye.
  if (out.cams && out.cams.onboard && out.eye && ['f1', 'f1h', 'indy', 'fe'].includes(spec.body)) {
    const key = spec.glb + '|' + out.eye.z.toFixed(3);
    const TC = GLB_TCAM[key] || (GLB_TCAM[key] = (() => {
      body.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(body.matrixWorld).invert(), M = new THREE.Matrix4(), v = new THREE.Vector3();
      const z0 = out.eye.z - 1.7, z1 = out.eye.z - 0.12, z2 = out.eye.z + 0.9; let best = null, top = -1e9;
      g.traverse(o => { if (!o.isMesh || !o.visible || (o.userData && o.userData.tag === 'int')) return; const mt = Array.isArray(o.material) ? o.material[0] : o.material; if (mt && mt.transparent && mt.opacity < 0.9) return;
        M.multiplyMatrices(inv, o.matrixWorld); const P = o.geometry.attributes.position;
        for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); if (Math.abs(v.x) > 0.16 || v.z < z0 || v.z > z2) continue; if (v.y > top) top = v.y; if (v.z > z1) continue; if (!best || v.y > best.y) best = v.clone(); } });
      return best ? { y: Math.max(best.y, top - 0.04), z: best.z } : null; })());
    if (TC) { out.cams.onboard.set(0, TC.y + 0.13, Math.min(TC.z + 0.1, out.eye.z - 0.2) + (spec.tcFwd || 0)); out.cams.onPitch = spec.tcPitch != null ? spec.tcPitch : -0.07; }
  }  // put the shared wheel where the scanned car had its own wheel (asset coords [y, z]), so it sits in the tub the model was built around
  if (spec.swAt && out.swModel && out.swModel.parent && out.swModel.parent.parent) { const wg = out.swModel.parent.parent, p0 = wg.position.clone();
    wg.position.set(spec.swAt[2] != null ? spec.swAt[2] - (out.cdx || 0) : 0, spec.swAt[0] + dy - (out.cdy || 0), spec.swAt[1] + dz - (out.cdz || 0));
    if (out.arms) for (const A of out.arms) { A.sh.y += (wg.position.y - p0.y) * 0.6; A.sh.z += (wg.position.z - p0.z) * 0.6; } }
  // single-seaters: the shared wheel + gloves sweep through the scanned tub -> cut a slot around the swept disc out of the bodywork in the
  // cockpit view (clip box used by main.glbCabClip), so nothing ever pierces the wheel or the hands
  if (['f1', 'f1h'].includes(spec.body) && out.swModel && !spec.cabClip && spec.swClip !== false) {
    const wg = out.swModel.parent.parent; out.body.updateMatrixWorld(true);
    const p = wg.getWorldPosition(new THREE.Vector3()); out.body.worldToLocal(p);
    const e = out.eye, R = 0.185;
    out.swClip = [0.2, p.y - R, p.y + R, e.z - (p.z - 0.06), (p.z + 0.075) - e.z]; }
  // 5) distance LODs (glbLod): each mesh with its scale relative to the car, simplified levels built in the background
  out.root.updateMatrixWorld(true); const rinv = new THREE.Matrix4().copy(out.root.matrixWorld).invert(), Ms = new THREE.Matrix4();
  out.lodMeshes = []; out.root.traverse(o => { if (o.isMesh && o.geometry && o.geometry.userData.lodSrc) out.lodMeshes.push({ m: o, g0: o.geometry, s: Ms.multiplyMatrices(rinv, o.matrixWorld).getMaxScaleOnAxis() }); });
  glbLodQueue(src);
}

// ---- Distance LODs of the scanned cars. A GT3 scan is ~250k triangles and the grid draws a dozen of them (and again in the shadow map)
// even 60 m away, where the car is 40 px tall. Every mesh gets coarser index buffers over the same vertices (meshoptimizer), so
// materials, UVs and paint are untouched, and each frame a car's mesh takes the coarsest level whose geometric error projects to
// under a third of a pixel on screen at that distance: the image does not change, the triangles do.
const LOD_STEPS = [[0.3, 0.003], [0.1, 0.01], [0.03, 0.03]];   // [target share of triangles, max error relative to the mesh size]
const LOD_PX = 0.3;   // largest error allowed on screen, in pixels
const LOD_ATTW = [1, 1, 1, 2, 2];   // the simplifier also keeps normals (shading, reflections) and UVs (liveries): their error counts too
const LOD_JOBS = []; let LOD_BUSY = false, LOD_ON = true, LOD_MS = 0, LOD_W = null, LOD_LIB = null;
function glbLodTag(root) { root.traverse(o => { const g = o.geometry; if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && g && g.index && g.index.count >= 1500 && !g.groups.length && !g.morphAttributes.position && !Array.isArray(o.material)) g.userData.lodSrc = 1; }); }
function glbLodQueue(src) {
  if (src.userData.lodQ) return; src.userData.lodQ = 1;
  src.traverse(o => { if (o.isMesh && o.geometry.userData.lodSrc && !o.geometry.userData.lod) LOD_JOBS.push(o.geometry); });
  glbLodRun();
}
// simplified index buffers of one mesh (pure: it also runs inside the worker). Returns [{ ix, err (mesh units) }], fine to coarse.
function lodLevels(MS, idx, pos, att, steps) {
  const scale = MS.getScale(pos, 3), out = []; let prev = idx.length;
  for (const [f, e] of steps) {
    const r = MS.simplifyWithAttributes(idx, pos, 3, att, 5, LOD_ATTW, null, Math.floor(idx.length * f / 3) * 3, e, ['LockBorder']), ix = r[0];
    if (!ix.length || ix.length > prev * 0.6) continue;   // not worth a level
    out.push({ ix, err: Math.max(r[1], 1e-6) * scale }); prev = ix.length;
  }
  return out;
}
function lodInput(g) {
  const P = g.attributes.position, n = P.count, pos = new Float32Array(n * 3);
  const N = g.attributes.normal, U = g.attributes.uv, att = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) { pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i);
    if (N) { att[i * 5] = N.getX(i); att[i * 5 + 1] = N.getY(i); att[i * 5 + 2] = N.getZ(i); } if (U) { att[i * 5 + 3] = U.getX(i); att[i * 5 + 4] = U.getY(i); } }
  return { idx: g.index.array.slice(), pos, att };
}
function lodApply(g, levels) {
  if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingBox) g.computeBoundingBox();
  g.userData.lod = levels.map(l => { const lg = new THREE.BufferGeometry();
    for (const k in g.attributes) lg.setAttribute(k, g.attributes[k]);
    lg.setIndex(new THREE.BufferAttribute(l.ix, 1)); lg.boundingSphere = g.boundingSphere; lg.boundingBox = g.boundingBox;
    return { g: lg, err: l.err }; });
}
// the simplifier runs in a worker made from its own source, so the main thread never stalls; inline (one mesh per task) if workers are blocked
function lodWorker() {
  if (LOD_W !== null) return LOD_W;
  try {
    const src = meshoptSimplifierLib.toString() + '\n' + lodLevels.toString() + '\nconst LOD_ATTW = ' + JSON.stringify(LOD_ATTW) + ';' + '\nconst MS = meshoptSimplifierLib();\n' +
      'onmessage = async (ev) => { await MS.ready; const d = ev.data, t = performance.now(); let out = [];' +
      ' try { out = lodLevels(MS, d.idx, d.pos, d.att, d.steps); } catch (e) { } postMessage({ id: d.id, out, ms: performance.now() - t }, out.map(l => l.ix.buffer)); };';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.pend = new Map(); w.seq = 0;
    w.onmessage = (ev) => { const g = w.pend.get(ev.data.id); w.pend.delete(ev.data.id); LOD_MS += ev.data.ms; if (g) lodApply(g, ev.data.out); };
    w.onerror = () => { LOD_W = false; for (const g of w.pend.values()) LOD_JOBS.push(g); w.pend.clear(); w.terminate(); glbLodRun(); };
    LOD_W = w;
  } catch (e) { LOD_W = false; }
  return LOD_W;
}
async function glbLodRun() {
  if (LOD_BUSY) return; LOD_BUSY = true;
  try {
    while (LOD_JOBS.length) {
      const g = LOD_JOBS.shift(); if (g.userData.lod) continue;
      const w = lodWorker(), inp = lodInput(g);
      if (w) { const id = ++w.seq; w.pend.set(id, g); w.postMessage({ id, idx: inp.idx, pos: inp.pos, att: inp.att, steps: LOD_STEPS }, [inp.idx.buffer, inp.pos.buffer, inp.att.buffer]); }
      else {
        if (!LOD_LIB) { LOD_LIB = meshoptSimplifierLib(); await LOD_LIB.ready; }
        const t0 = performance.now();
        try { lodApply(g, lodLevels(LOD_LIB, inp.idx, inp.pos, inp.att, LOD_STEPS)); } catch (e) { g.userData.lod = []; }
        LOD_MS += performance.now() - t0;
      }
      await new Promise(r => setTimeout(r, 0));   // one mesh per task
    }
  } catch (e) { console.warn('LOD', e); }
  LOD_BUSY = false;
}
// pxPerM: pixels per metre at 1 m (drawing-buffer height / (2 tan(fov/2)))
function glbLodUpdate(model, cam, pxPerM) {
  const L = model && model.lodMeshes; if (!L || !L.length) return;
  const k = LOD_ON ? pxPerM / Math.max(0.5, model.root.position.distanceTo(cam.position)) : 0;
  for (const e of L) {
    const lod = e.g0.userData.lod; let g = e.g0;
    if (lod && k) for (const l of lod) { if (l.err * e.s * k < LOD_PX) g = l.g; else break; }
    if (e.m.geometry !== g) e.m.geometry = g;
  }
}

// The shared steering wheel (+ gloves) must sweep freely inside the scanned cockpit: every car's tub is a different shape, so measure the
// bodywork inside the wheel's swept disc (radius covers grips + hands at full lock) and move the wheel back / up until nothing is inside.
const GLB_SWFIT = {};
function fitSteeringWheel(out, spec, g) {
  const sw = out.swModel.parent, wg = sw && sw.parent; if (!wg) return;
  const key = spec.glb + '|' + out.eye.z.toFixed(3) + '|' + out.eye.y.toFixed(3);
  const body = out.body; body.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
  const RS = 0.175, HT = 0.045;
  const tris = []; { const M = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = out.eye;
    g.traverse(o => { if (!o.isMesh || (o.userData && o.userData.tag === 'int') || /INTERIOR/i.test(o.name)) return; const mt = Array.isArray(o.material) ? o.material[0] : o.material; if (mt && mt.transparent && mt.opacity < 0.5) return;
      M.multiplyMatrices(inv, o.matrixWorld); const P = o.geometry.attributes.position, I = o.geometry.index, n = I ? I.count : P.count;
      for (let t = 0; t < n; t += 3) { const i0 = I ? I.getX(t) : t, i1 = I ? I.getX(t + 1) : t + 1, i2 = I ? I.getX(t + 2) : t + 2;
        a.fromBufferAttribute(P, i0).applyMatrix4(M); b.fromBufferAttribute(P, i1).applyMatrix4(M); c.fromBufferAttribute(P, i2).applyMatrix4(M);
        if (Math.max(a.x, b.x, c.x) < -0.35 || Math.min(a.x, b.x, c.x) > 0.35 || Math.max(a.z, b.z, c.z) < e.z - 0.1 || Math.min(a.z, b.z, c.z) > e.z + 1.1 || Math.max(a.y, b.y, c.y) < e.y - 0.75 || Math.min(a.y, b.y, c.y) > e.y + 0.25) continue;
        tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); } }); }
  const ax = new THREE.Vector3(0, 0, 1).applyQuaternion(wg.quaternion);   // wheel axis (interior space has the body orientation)
  const cdz = out.interior.parent && out.interior.parent !== body ? out.interior.parent.position : new THREE.Vector3();
  const base = wg.position.clone();
  const hits = (dz, dy) => { const C = new THREE.Vector3(base.x + cdz.x, base.y + cdz.y + dy, base.z + cdz.z + dz); let h = 0; const p = new THREE.Vector3(), d = new THREE.Vector3();
    for (let i = 0; i < tris.length; i += 9) {
      // sample the triangle on a grid fine enough for the swept volume
      const ex = Math.max(Math.hypot(tris[i + 3] - tris[i], tris[i + 4] - tris[i + 1], tris[i + 5] - tris[i + 2]), Math.hypot(tris[i + 6] - tris[i], tris[i + 7] - tris[i + 1], tris[i + 8] - tris[i + 2]));
      const N = Math.min(12, Math.max(1, Math.ceil(ex / 0.02)));
      for (let u = 0; u <= N; u++) for (let v = 0; v <= N - u; v++) { const w = N - u - v;
        p.set((tris[i] * w + tris[i + 3] * u + tris[i + 6] * v) / N, (tris[i + 1] * w + tris[i + 4] * u + tris[i + 7] * v) / N, (tris[i + 2] * w + tris[i + 5] * u + tris[i + 8] * v) / N);
        d.subVectors(p, C); const hh = d.dot(ax); if (Math.abs(hh) > HT) continue; d.addScaledVector(ax, -hh); if (d.length() < RS) { h++; if (hits.dbg) { const k = Math.round(Math.atan2(d.y, d.x) * 57.3 / 30) * 30 + ':' + (d.length() * 100 | 0); hits.dbg[k] = (hits.dbg[k] || 0) + 1; } break; } } }
    return h; };
  out._swHits = (dz, dy) => { hits.dbg = {}; const h = hits(dz, dy); const r = hits.dbg; hits.dbg = null; return { h, r }; };
  const F = GLB_SWFIT[key] || (GLB_SWFIT[key] = (() => {
    const h0 = hits(0, 0);
    if (spec.swAt) { // wheel sits where the model's own was: raise it / pull it towards the driver as far as the tub stays clear (more of it in view)
      let b = { dz: 0, dy: 0, h: h0, s: -1 };
      for (let dz = 0; dz >= -0.1; dz -= 0.02) for (let dy = 0; dy <= 0.08; dy += 0.01) { const h = hits(dz, dy); const sc = dy - dz * 0.5; if (h === 0 && sc > b.s) b = { dz, dy, h, s: sc }; }
      return { dz: b.dz, dy: b.dy, h0, h: b.s >= 0 ? 0 : h0 }; }
    if (!h0) return { dz: 0, dy: 0, h0, h: 0 };
    let best = { dz: 0, dy: 0, h: h0, cost: 1e9 };
    for (let dz = 0; dz >= -0.2; dz -= 0.02) for (let dy = 0; dy <= 0.1; dy += 0.02) { const h = hits(dz, dy), cost = h * 10 - dz + dy * 1.5;
      if (h === 0 && (best.h > 0 || cost < best.cost)) best = { dz, dy, h, cost }; else if (best.h > 0 && h < best.h) best = { dz, dy, h, cost }; }
    return { dz: best.dz, dy: best.dy, h0, h: best.h }; })());
  wg.position.z = base.z + F.dz; wg.position.y = base.y + F.dy; out.swFit = F;
  if (out.arms) for (const A of out.arms) { A.sh.z += F.dz * 0.5; A.sh.y += F.dy * 0.5; }
}

// Scanned wheels are often modelled with camber / toe or with the hub off the tyre centre; spinning them about the hub x axis then makes
// the tyre wobble. Measure the tyre's real axle (smallest-variance axis of its tread ring) and centre, and re-seat every wheel child so
// that axle is the node's x axis through its origin (the wheel node moves by the centre offset, so nothing shifts at rest).
function trueWheel(n, measure) {
  n.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(n.matrixWorld).invert(), M = new THREE.Matrix4(), v = new THREE.Vector3();
  let tyre = null, tr = 0;
  for (const o of n.children) { if (!o.isMesh) continue; M.multiplyMatrices(inv, o.matrixWorld); const P = o.geometry.attributes.position; let r = 0, cy = 0, cz = 0, k = 0;
    for (let i = 0; i < P.count; i += 3) { v.fromBufferAttribute(P, i).applyMatrix4(M); r = Math.max(r, Math.hypot(v.y, v.z)); cy += v.y; cz += v.z; k++; }
    if (Math.hypot(cy / k, cz / k) > 0.04 * r) continue;   // off-axis parts (brake ducts) are not the tyre
    if (r > tr) { tr = r; tyre = o; } }
  if (!tyre) return 0;
  M.multiplyMatrices(inv, tyre.matrixWorld); const P = tyre.geometry.attributes.position, pts = [];
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); if (Math.hypot(v.y, v.z) > 0.88 * tr) pts.push(v.x, v.y, v.z); }
  const N = pts.length / 3; if (N < 60) return 0;
  // tread x-centre per angular bin (bins remove the vertex-density bias), then fit x = c + A cos(phi) + B sin(phi): A, B = camber / toe tilt
  const NB = 36, sx = new Float64Array(NB), sr = new Float64Array(NB), cnt = new Float64Array(NB);
  for (let i = 0; i < N; i++) { const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2], ph = Math.atan2(z, y); const k = Math.min(NB - 1, Math.floor((ph + Math.PI) / (2 * Math.PI) * NB)); sx[k] += x; sr[k] += Math.hypot(y, z); cnt[k]++; }
  let S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], R = [0, 0, 0], used = 0, rm = 0;
  for (let k = 0; k < NB; k++) { if (!cnt[k]) continue; used++; const ph = -Math.PI + (k + 0.5) * 2 * Math.PI / NB, f = [1, Math.cos(ph), Math.sin(ph)], x = sx[k] / cnt[k]; rm += sr[k] / cnt[k];
    for (let i = 0; i < 3; i++) { R[i] += f[i] * x; for (let j = 0; j < 3; j++) S[i][j] += f[i] * f[j]; } }
  if (used < 24) return 0; rm /= used;
  const sol = new THREE.Matrix3().set(S[0][0], S[0][1], S[0][2], S[1][0], S[1][1], S[1][2], S[2][0], S[2][1], S[2][2]).invert(), r3 = new THREE.Vector3(R[0], R[1], R[2]).applyMatrix3(sol);
  const A = r3.y, B = r3.z;
  const ax = new THREE.Vector3(1, -A / rm, -B / rm).normalize(), tilt = Math.acos(ax.x);
  if (measure) return tilt;
  if (tilt < 0.003 || tilt > 0.2) return tilt;   // already true, or a fit we do not trust
  const q = new THREE.Quaternion().setFromUnitVectors(ax, new THREE.Vector3(1, 0, 0)), xc = r3.x;
  // rotate about the tyre centre (on the axle), not the node origin, so the tyre does not move off the axle
  const F = new THREE.Matrix4().makeTranslation(xc, 0, 0).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-xc, 0, 0));
  for (const o of n.children) { o.updateMatrix(); o.matrix.premultiply(F); o.matrix.decompose(o.position, o.quaternion, o.scale); }
  return tilt;
}
// v98 (trueWheels: 2): stricter wheel truing for cars whose tyres still wobbled after trueWheel (SF-26, MAC-26, Formula E). The axle is fitted on the centre of the x extent per angular bin ((min + max) / 2), not on the mean x: the mean followed the vertex
// density (tread blocks, lettering on one sidewall) and left 2-4 deg of camber on the Formula E. Round parts (rim, sidewall) whose own axle
// still leans after the tyre is trued (the Formula E rim sat 3 deg off its tyre) are trued on their own.
function wheelAxle(n, o, M, rmin) {
  const P = o.geometry.attributes.position, v = new THREE.Vector3(), NB = 36, lo = new Float64Array(NB).fill(1e9), hi = new Float64Array(NB).fill(-1e9);
  let tr = 0, cy = 0, cz = 0, k = 0;
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); tr = Math.max(tr, Math.hypot(v.y, v.z)); cy += v.y; cz += v.z; k++; }
  if (!k || Math.hypot(cy / k, cz / k) > 0.04 * tr) return null;   // off-axis parts (brake ducts, calipers) are not round
  let rs = 0, rn = 0;
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); const r = Math.hypot(v.y, v.z); if (r < rmin * tr) continue;
    const b = Math.min(NB - 1, Math.floor((Math.atan2(v.z, v.y) + Math.PI) / (2 * Math.PI) * NB)); lo[b] = Math.min(lo[b], v.x); hi[b] = Math.max(hi[b], v.x); rs += r; rn++; }
  let S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], R = [0, 0, 0], used = 0;
  for (let b = 0; b < NB; b++) { if (hi[b] < lo[b]) continue; used++; const ph = -Math.PI + (b + 0.5) * 2 * Math.PI / NB, f = [1, Math.cos(ph), Math.sin(ph)], x = (lo[b] + hi[b]) / 2;
    for (let i = 0; i < 3; i++) { R[i] += f[i] * x; for (let j = 0; j < 3; j++) S[i][j] += f[i] * f[j]; } }
  if (used < 30) return null;   // not a full ring
  const rm = rs / rn, sol = new THREE.Matrix3().set(S[0][0], S[0][1], S[0][2], S[1][0], S[1][1], S[1][2], S[2][0], S[2][1], S[2][2]).invert(), r3 = new THREE.Vector3(R[0], R[1], R[2]).applyMatrix3(sol);
  const ax = new THREE.Vector3(1, -r3.y / rm, -r3.z / rm).normalize();
  return { ax, xc: r3.x, tilt: Math.acos(Math.min(1, ax.x)), tr };
}
// v101 (trueWheels: 3): low-poly tyres (BMW M Hybrid ~300 vertices, Valkyrie LM) leave empty angular bins, so the per-bin fits above
// cannot see their tilt. Each round part is trued on its own principal axes instead: for a body of revolution the axle is the axis of
// least spread and the two radial spreads are equal. Parts that are not clearly round (flat static rims, calipers) are left alone.
function partAxle(o, M) {
  const P = o.geometry.attributes.position, v = new THREE.Vector3(), k = P.count; if (k < 24) return null;
  const m = [0, 0, 0]; for (let i = 0; i < k; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); m[0] += v.x; m[1] += v.y; m[2] += v.z; }
  for (let a = 0; a < 3; a++) m[a] /= k;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < k; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); const d = [v.x - m[0], v.y - m[1], v.z - m[2]];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b] / k; }
  // Jacobi eigen-decomposition of the 3x3 covariance
  const A = C.map(r => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
    if (Math.abs(A[p][q]) < 1e-14) continue;
    const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let r = 0; r < 3; r++) { const ap = A[r][p], aq = A[r][q]; A[r][p] = c * ap - s * aq; A[r][q] = s * ap + c * aq; }
    for (let r = 0; r < 3; r++) { const ap = A[p][r], aq = A[q][r]; A[p][r] = c * ap - s * aq; A[q][r] = s * ap + c * aq; }
    for (let r = 0; r < 3; r++) { const vp = V[r][p], vq = V[r][q]; V[r][p] = c * vp - s * vq; V[r][q] = s * vp + c * vq; } }
  const ev = [0, 1, 2].map(i => [A[i][i], i]).sort((a, b) => a[0] - b[0]);
  const [l1, i1] = ev[0], l2 = ev[1][0], l3 = ev[2][0];
  if (!(l1 < 0.75 * l2) || !(l2 > 0.85 * l3)) return null;   // not a body of revolution about one clear axis
  const ax = new THREE.Vector3(V[0][i1], V[1][i1], V[2][i1]); if (ax.x < 0) ax.negate();
  const tilt = Math.acos(Math.min(1, ax.x)); if (tilt > 0.26) return null;   // more than 15 deg: not the wheel axle
  return { ax, xc: m[0], tilt };
}
function trueWheel3(n, measure) {
  n.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(n.matrixWorld).invert(), M = new THREE.Matrix4();
  const fit = (o) => { M.multiplyMatrices(inv, o.matrixWorld); return partAxle(o, M); };
  let worst = 0; const parts = [];
  // deep rims spread almost as much along the axle as across it: fall back to the ring fit on their outer lip (r >= 0.85 R)
  const ring = (o) => { M.multiplyMatrices(inv, o.matrixWorld); const f = wheelAxle(n, o, M, 0.85); return f && f.tilt <= 0.2 ? f : null; };
  for (const o of n.children) { if (!o.isMesh) continue; let f = fit(o), how = 'pca'; if (!f) { f = ring(o); how = 'ring'; } if (f) { parts.push([o, f, how]); worst = Math.max(worst, f.tilt); } }
  if (measure) return worst;
  for (const [o, f, how] of parts) { if (f.tilt < 0.0015) continue;
    const p0 = o.position.clone(), q0 = o.quaternion.clone(), s0 = o.scale.clone();
    const q = new THREE.Quaternion().setFromUnitVectors(f.ax, new THREE.Vector3(1, 0, 0));
    const F = new THREE.Matrix4().makeTranslation(f.xc, 0, 0).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-f.xc, 0, 0));
    o.updateMatrix(); o.matrix.premultiply(F); o.matrix.decompose(o.position, o.quaternion, o.scale); o.updateMatrixWorld(true);
    if (how === 'ring') { const g = ring(o); if (!g || g.tilt > f.tilt * 0.5) { o.position.copy(p0); o.quaternion.copy(q0); o.scale.copy(s0); o.updateMatrixWorld(true); } } }
  return worst;
}
function trueWheel2(n, measure) {
  n.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(n.matrixWorld).invert(), M = new THREE.Matrix4();
  const fit = (o) => { M.multiplyMatrices(inv, o.matrixWorld); return wheelAxle(n, o, M, 0.85); };
  let tyre = null, tf = null;
  for (const o of n.children) { if (!o.isMesh) continue; const f = fit(o); if (f && (!tf || f.tr > tf.tr)) { tyre = o; tf = f; } }
  if (!tyre) return 0;
  const parts = []; for (const o of n.children) if (o.isMesh && o !== tyre) { const f = fit(o); if (f && f.tr > 0.45 * tf.tr) parts.push([o, f]); }
  const worst = Math.max(tf.tilt, ...parts.map(p => p[1].tilt).filter(t => t <= 0.2));
  if (measure) return worst;
  const turn = (f, list) => { if (f.tilt < 0.002 || f.tilt > 0.2) return;   // already true, or a fit we do not trust
    const q = new THREE.Quaternion().setFromUnitVectors(f.ax, new THREE.Vector3(1, 0, 0));
    // rotate about the part centre (on the axle), not the node origin, so it does not move off the axle
    const F = new THREE.Matrix4().makeTranslation(f.xc, 0, 0).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-f.xc, 0, 0));
    for (const o of list) { o.updateMatrix(); o.matrix.premultiply(F); o.matrix.decompose(o.position, o.quaternion, o.scale); o.updateMatrixWorld(true); } };
  turn(tf, n.children);
  // a part keeps its own correction only if that measurably trues it (spoked hubs and calipers give fits we cannot trust)
  for (const [o] of parts) { const f = fit(o); if (!f) continue; const p0 = o.position.clone(), q0 = o.quaternion.clone(), s0 = o.scale.clone(); turn(f, [o]);
    const g = fit(o); if (!g || g.tilt > f.tilt * 0.5) { o.position.copy(p0); o.quaternion.copy(q0); o.scale.copy(s0); o.updateMatrixWorld(true); } }
  return worst;
}
