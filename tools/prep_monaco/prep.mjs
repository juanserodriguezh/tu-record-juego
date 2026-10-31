// Monaco (Circuit de Monaco) from the Assetto Corsa track "2022 Monaco F1 Grand Prix" (Pyyer): writes src/data_monaco.js.
//   node tools/prep_monaco/prep.mjs <folder monaco_gp22 extracted from the zip> [svg for a top view]
// Everything is measured on the AC model; nothing of it is shipped (no meshes, no textures):
//   - centreline and asphalt widths: fast_lane.ai + the road surface meshes (GRIP / TARMAC / MEDIOG), probed across the lap
//   - barrier offsets: the collision walls of monacophysics.kn5, with the barrier type from the visible meshes
//   - elevation: height of the centreline (sea level = 0)
//   - city: building blocks (footprint, base and roof height) from the building meshes; ground height map; harbour
//   - tunnel (s range), grandstands, garages, yachts, palms
// Frames: AC x / z are the game x / z (the raw centreline uses y = -z, as Monza; checked: clockwise lap, the sea to the south).
import fs from 'node:fs';
import path from 'node:path';
import { readKn5, readAi } from './kn5.mjs';

const DIR = process.argv[2], SVG = process.argv[3];
if (!DIR) { console.error('usage: node tools/prep_monaco/prep.mjs <monaco_gp22 folder> [top.svg]'); process.exit(1); }
const SEA = -19.1;                    // AC height of the sea plane (water meshes): game elevation = y - SEA
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '../../src/data_monaco.js');

// ---------------------------------------------------------------- small helpers
const gauss = (a, sig) => { const n = a.length, r = new Float64Array(n), R = Math.ceil(sig * 3); for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let k = -R; k <= R; k++) { const g = Math.exp(-0.5 * (k / sig) ** 2); s += g * a[(i + k + n) % n]; w += g; } r[i] = s / w; } return r; };
const f1 = (v) => (Math.round(v * 10) / 10).toString();
// rasterise triangles onto a grid (cell size c): calls put(ix, iz, y) for every cell whose centre is inside a triangle (y interpolated),
// plus the cells along the edges (thin or vertical triangles) with the edge height
function raster(v, idx, c, put, edges = true) {
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, d = idx[t + 2] * 3;
    const ax = v[a], ay = v[a + 1], az = v[a + 2], bx = v[b], by = v[b + 1], bz = v[b + 2], cx = v[d], cy = v[d + 1], cz = v[d + 2];
    const x0 = Math.floor(Math.min(ax, bx, cx) / c), x1 = Math.floor(Math.max(ax, bx, cx) / c), z0 = Math.floor(Math.min(az, bz, cz) / c), z1 = Math.floor(Math.max(az, bz, cz) / c);
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) > 1e-6 && (x1 - x0 + 1) * (z1 - z0 + 1) < 4e5) {
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const px = (ix + 0.5) * c, pz = (iz + 0.5) * c;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den, l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den, l3 = 1 - l1 - l2;
        if (l1 >= -1e-4 && l2 >= -1e-4 && l3 >= -1e-4) put(ix, iz, l1 * ay + l2 * by + l3 * cy);
      }
    }
    if (!edges) continue;
    for (const [px, py, pz, qx, qy, qz] of [[ax, ay, az, bx, by, bz], [bx, by, bz, cx, cy, cz], [cx, cy, cz, ax, ay, az]]) {
      const L = Math.hypot(qx - px, qz - pz), n = Math.max(1, Math.ceil(L / (c * 0.5)));
      for (let k = 0; k <= n; k++) { const u = k / n; put(Math.floor((px + (qx - px) * u) / c), Math.floor((pz + (qz - pz) * u) / c), py + (qy - py) * u); }
    }
  }
}

// ---------------------------------------------------------------- read the model
console.log('reading kn5…');
const isRoad = (n) => /^\d+(GRIP|TARMAC|MEDIOG|PEN)/i.test(n);
const isGround = (n, m) => /^(objGround|objSurround|Terrain|patchthree|newpatch|\d+(CONCRETE|OFFTRACK|KERB|PITLANE|TARMAC|GRIP|MEDIOG|PEN))/i.test(n) && m !== 'water';
const isBuilding = (n, m) => /^(objBuilding|mon_building|base_pareti|group$)/i.test(n) && !/grandstand|Palazzi_lontani|pitlane|tunnel_a|wall_hairpin/i.test(m);
const isTunnel = (n, m) => /^tunnel_pat/i.test(n);
const isStand = (n, m) => /grandstand/i.test(m);
const isGarage = (n, m) => /^objGarage/i.test(n) && /^garage/.test(m);
const isBoat = (n) => /^objBoat/i.test(n);
const isTree = (n, m) => /^(objTree|palme|pini|pat_pino|pinetti|alberi|pat_gruppo_alberi|pino)/i.test(n) || /palm/i.test(m);
const isBarrierVis = (n, m) => /^(objBarrier|bari|wall\d|rail_|pat_rail|pat_barr|pat_barriera|rail_zona|rail_start|objTyres|objtyres|pat_sponsor_rail|jonny_rail|heinek|ubs_rail|pirelli|rolex|pat_jonny_rail)/i.test(n);
const water = [];
const main = readKn5(path.join(DIR, '07_monaco_gp22.kn5'), (n, m) => {
  if (m === 'water' || /terrain_water/.test(m)) { return true; }
  return isRoad(n) || isGround(n, m) || isBuilding(n, m) || isTunnel(n, m) || isStand(n, m) || isGarage(n, m) || isBoat(n) || isTree(n, m) || isBarrierVis(n, m);
});
const walls = readKn5(path.join(DIR, 'monacophysics.kn5'), (n) => /WALL/i.test(n));
const pick = (f) => main.filter((m) => f(m.name, m.mat));
console.log('meshes', main.length, 'walls', walls.length);

// ---------------------------------------------------------------- road surface grid (0.4 m), with height (several levels)
const RC = 0.4, road = new Map();
for (const m of pick(isRoad)) raster(m.v, m.idx, RC, (ix, iz, y) => { const k = ix * 65536 + iz; const a = road.get(k); if (!a) road.set(k, [y]); else if (!a.some((q) => Math.abs(q - y) < 1.5)) a.push(y); }, false);
const onRoad = (x, z, y) => { const a = road.get(Math.floor(x / RC) * 65536 + Math.floor(z / RC)); return !!a && a.some((q) => Math.abs(q - y) < 1.6); };

// ---------------------------------------------------------------- centreline: AI line points, probed to the asphalt edges
const AI = readAi(path.join(DIR, 'ai/fast_lane.ai')); const NA = AI.length;
const tan = (P, i) => { const n = P.length, a = P[(i - 2 + n) % n], b = P[(i + 2) % n]; const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz); return [tx / l, tz / l]; };
const probe = (x, y, z, nx, nz, max) => { let gap = 0, last = 0; for (let d = 0.2; d <= max; d += 0.2) { if (onRoad(x + nx * d, z + nz * d, y)) { last = d; gap = 0; } else if ((gap += 0.2) > 0.8) break; } return last; };
let C = AI.map((p, i) => {
  const [tx, tz] = tan(AI, i), nx = tz, nz = -tx;        // left normal
  let L = probe(p.x, p.y, p.z, nx, nz, 16), R = probe(p.x, p.y, p.z, -nx, -nz, 16);
  if (L < 0.5 || R < 0.5) { L = Math.max(L, p.L); R = Math.max(R, p.R); }
  const off = (L - R) / 2;
  return { x: p.x + nx * off, y: p.y, z: p.z + nz * off, w: (L + R) / 2, L, R };
});
// smooth (the probe follows every patch line of the asphalt meshes) and resample every 5 m from the timing line (AI point 0)
{ const sx = gauss(C.map((c) => c.x), 3), sz = gauss(C.map((c) => c.z), 3), sw = gauss(C.map((c) => c.w), 4), sy = gauss(C.map((c) => c.y), 3);
  C = C.map((c, i) => ({ x: sx[i], z: sz[i], y: sy[i], w: sw[i] })); }
const cum = [0]; for (let i = 1; i <= NA; i++) cum.push(cum[i - 1] + Math.hypot(C[i % NA].x - C[i - 1].x, C[i % NA].z - C[i - 1].z));
const LAP = cum[NA], NS = Math.round(LAP / 5), DS = LAP / NS;
const at = (s) => { s = ((s % LAP) + LAP) % LAP; let j = 0, lo = 0, hi = NA; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; } j = lo; const t = (s - cum[j]) / (cum[j + 1] - cum[j]); const a = C[j], b = C[(j + 1) % NA]; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t }; };
const S = []; for (let i = 0; i < NS; i++) S.push(at(i * DS));
for (let i = 0; i < NS; i++) { const a = S[(i - 1 + NS) % NS], b = S[(i + 1) % NS]; const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz); S[i].tx = tx / l; S[i].tz = tz / l; S[i].nx = tz / l; S[i].nz = -tx / l; }
console.log('lap', LAP.toFixed(1), 'samples', NS, 'width', Math.min(...S.map((p) => p.w)).toFixed(2), Math.max(...S.map((p) => p.w)).toFixed(2));
let area = 0; for (let i = 0; i < NS; i++) { const a = S[i], b = S[(i + 1) % NS]; area += a.x * -b.z - b.x * -a.z; } console.log('raw (x, -z) area', (area / 2).toFixed(0), area < 0 ? 'clockwise' : 'ANTI-clockwise');


// ---------------------------------------------------------------- barriers: collision walls (monacophysics.kn5), probed across every sample
const segs = [];   // 2D wall segments with their height range
for (const m of walls) for (let t = 0; t < m.idx.length; t += 3) {
  const p = [0, 1, 2].map((q) => m.idx[t + q] * 3), y0 = Math.min(...p.map((a) => m.v[a + 1])), y1 = Math.max(...p.map((a) => m.v[a + 1]));
  for (let e = 0; e < 3; e++) { const a = p[e], b = p[(e + 1) % 3]; if (Math.hypot(m.v[a] - m.v[b], m.v[a + 2] - m.v[b + 2]) > 0.05) segs.push([m.v[a], m.v[a + 2], m.v[b], m.v[b + 2], y0, y1]); }
}
const SG = new Map(); const SGC = 20;
segs.forEach((g, k) => { for (let ix = Math.floor(Math.min(g[0], g[2]) / SGC); ix <= Math.floor(Math.max(g[0], g[2]) / SGC); ix++) for (let iz = Math.floor(Math.min(g[1], g[3]) / SGC); iz <= Math.floor(Math.max(g[1], g[3]) / SGC); iz++) { const key = ix * 4096 + iz; (SG.get(key) || SG.set(key, []).get(key)).push(k); } });
const rayWall = (x, z, y, dx, dz, max) => {
  let best = max; const seen = new Set();
  for (let d = 0; d <= max + SGC; d += SGC / 2) { const key = Math.floor((x + dx * d) / SGC) * 4096 + Math.floor((z + dz * d) / SGC);
    for (const k of SG.get(key) || []) { if (seen.has(k)) continue; seen.add(k); const [ax, az, bx, bz, y0, y1] = segs[k]; if (y1 < y - 0.5 || y0 > y + 3) continue;
      const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - x) * ez - (az - z) * ex) / den, u = ((ax - x) * dz - (az - z) * dx) / den; if (u >= 0 && u <= 1 && t > 0.3 && t < best) best = t; } }
  return best;
};
// visible barrier meshes -> type at a point: 0 armco / rail, 1 concrete wall, 2 tyres / foam
const vis = []; for (const m of pick(isBarrierVis)) { const typ = /Imbottiture|not_skin|tyre/i.test(m.mat + m.name) ? 2 : /armco|rail/i.test(m.mat + m.name) ? 0 : 1; for (let q = 0; q < m.v.length; q += 3) vis.push([m.v[q], m.v[q + 2], typ]); }
const VG = new Map(); vis.forEach((p, k) => { const key = Math.floor(p[0] / 4) * 4096 + Math.floor(p[1] / 4); (VG.get(key) || VG.set(key, []).get(key)).push(k); });
const typeAt = (x, z) => { const cnt = [0, 0, 0]; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const k of VG.get((Math.floor(x / 4) + a) * 4096 + Math.floor(z / 4) + b) || []) { const p = vis[k]; if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < 2.5 * 2.5) cnt[p[2]]++; } return cnt[2] > 6 ? 2 : cnt[1] > cnt[0] ? 1 : 0; };
const OPEN = 14;   // no wall within reach: open run-off (capped)
for (const p of S) for (const sd of [1, -1]) {
  const t = rayWall(p.x, p.z, p.y, p.nx * sd, p.nz * sd, p.w + OPEN);
  const run = Math.max(0.35, t - p.w), x = p.x + p.nx * sd * t, z = p.z + p.nz * sd * t;
  if (sd > 0) { p.runL = run; p.typL = t < p.w + OPEN ? typeAt(x, z) : 0; } else { p.runR = run; p.typR = t < p.w + OPEN ? typeAt(x, z) : 0; }
}
// segments [s0, s1, side] of one barrier type (merged, gaps < 15 m filled, shorter than 10 m dropped)
const segsOf = (typ) => { const out = []; for (const [k, sd] of [['typL', 1], ['typR', -1]]) { let a = -1; for (let i = 0; i <= NS; i++) { const on = i < NS && S[i][k] === typ; if (on && a < 0) a = i; if (!on && a >= 0) { out.push([Math.round(a * DS), Math.round(i * DS), sd]); a = -1; } } }
  out.sort((p, q) => p[2] - q[2] || p[0] - q[0]); const m = []; for (const g of out) { const l = m[m.length - 1]; if (l && l[2] === g[2] && g[0] - l[1] < 15) l[1] = g[1]; else m.push(g); } return m.filter((g) => g[1] - g[0] >= 10); };
const CONC = segsOf(1);
// tyre / foam walls: kept where they stand on the outside of the corner (same test as headless.js tyres); the few on an apex are left as armco
const TYRES = segsOf(2).filter(([a, b, sd]) => { let on = 0, all = 0; for (let j = Math.round(a / DS); j <= Math.round(b / DS); j++) { const i = j % NS, p = S[i], A = S[(i - 2 + NS) % NS], Bq = S[(i + 2) % NS];
  const cr = (p.x - A.x) * (Bq.z - p.z) - (p.z - A.z) * (Bq.x - p.x); all += Math.abs(cr); if (Math.sign(cr) === sd) on += Math.abs(cr); } return all && on / all >= 0.8; });
// elevation: every 10 m (sea level = 0)
const ELEV = []; for (let s = 0; s < LAP; s += 10) { const p = at(s); ELEV.push([Math.round(s), +(p.y - SEA).toFixed(1)]); } ELEV.push([Math.round(LAP), ELEV[0][1]]);
console.log('elevation', Math.min(...ELEV.map((e) => e[1])), Math.max(...ELEV.map((e) => e[1])), 'concrete', CONC.length, 'tyres', TYRES.length);

// ---------------------------------------------------------------- geometry helpers: convex hull + minimum-area rectangle
const hull = (pts) => { pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); };
const obb = (pts, pad) => { const H = hull(pts); if (H.length < 3) { const p = H[0] || pts[0]; return { cx: p[0], cz: p[1], hw: pad, hd: pad, rot: 0 }; } let best = null;
  for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-6) continue; const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const p of H) { const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0); if (!best || A < best.A) { const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2; best = { A, cx: uc * ux - vc * uz, cz: uc * uz + vc * ux, hw: (u1 - u0) / 2 + pad, hd: (v1 - v0) / 2 + pad, rot: Math.atan2(uz, ux) }; } }
  return best; };
// cells (key -> data) of a grid -> connected components (8-neighbourhood), optional similarity test between neighbours
const components = (cells, same = () => true) => { const seen = new Set(), out = [];
  for (const [k] of cells) { if (seen.has(k)) continue; const comp = [], st = [k]; seen.add(k);
    while (st.length) { const c = st.pop(); comp.push(c); const ix = Math.floor(c / 65536), iz = c - ix * 65536;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const n = (ix + a) * 65536 + iz + b; if (!seen.has(n) && cells.has(n) && same(cells.get(c), cells.get(n))) { seen.add(n); st.push(n); } } }
    out.push(comp); }
  return out; };
const K = (ix, iz) => ix * 65536 + iz, OFS = 2000;   // grid keys stay positive (|x|, |z| < 2000 cells)
// track corridor test: the nearest sample, lateral offset, and whether a point at height y is in the road / run-off volume
const SH = new Map(); S.forEach((p, i) => { const k = Math.floor(p.x / 25) * 4096 + Math.floor(p.z / 25); (SH.get(k) || SH.set(k, []).get(k)).push(i); });
const near = (x, z, y) => { let b = 1e18, bi = -1; const cx = Math.floor(x / 25), cz = Math.floor(z / 25);
  for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) for (const i of SH.get((cx + a) * 4096 + cz + c) || []) { const p = S[i]; const d = (p.x - x) ** 2 + (p.z - z) ** 2 + (y === undefined ? 0 : (Math.max(0, Math.abs(p.y - y) - 3) * 4) ** 2); if (d < b) { b = d; bi = i; } }
  if (bi < 0) return null; const p = S[bi]; return { i: bi, d: (x - p.x) * p.nx + (z - p.z) * p.nz, dist: Math.sqrt(b), p }; };

// ---------------------------------------------------------------- tunnel: samples covered by the tunnel shell (Portier -> chicane)
const tun = new Map(); for (const m of pick(isTunnel)) raster(m.v, m.idx, 2, (ix, iz, y) => { const k = K(ix + OFS, iz + OFS); tun.set(k, Math.max(tun.get(k) ?? -1e9, y)); });
const cov = S.map((p) => { const y = tun.get(K(Math.floor(p.x / 2) + OFS, Math.floor(p.z / 2) + OFS)); return y !== undefined && y > p.y + 4; });
let TUNNEL = null; { let best = [0, 0]; for (let i = 0; i < NS; i++) if (cov[i] && !cov[(i - 1 + NS) % NS]) { let j = i; while (cov[(j + 1) % NS] || cov[(j + 2) % NS] || cov[(j + 3) % NS]) j++; if (j - i > best[1] - best[0]) best = [i, j]; } TUNNEL = [Math.round(best[0] * DS), Math.round(best[1] * DS)]; }
console.log('tunnel', TUNNEL);

// ---------------------------------------------------------------- kerbs (AC kerb meshes beside the asphalt edge)
const kerb = new Map(); for (const m of main.filter((m) => /^\d*KERB/i.test(m.name) || /^1KERB/.test(m.name))) raster(m.v, m.idx, 0.5, (ix, iz, y) => kerb.set(K(ix + 8000, iz + 8000), y), true);
const kerbAt = (p, sd) => { for (let d = p.w - 1.2; d <= p.w + 1.6; d += 0.4) { const x = p.x + p.nx * sd * d, z = p.z + p.nz * sd * d, y = kerb.get(K(Math.floor(x / 0.5) + 8000, Math.floor(z / 0.5) + 8000)); if (y !== undefined && Math.abs(y - p.y) < 1.5) return true; } return false; };
const KERBS = []; for (const sd of [1, -1]) { let a = -1; for (let i = 0; i <= NS; i++) { const on = i < NS && kerbAt(S[i], sd); if (on && a < 0) a = i; if (!on && a >= 0) { if (i - a >= 2) KERBS.push([Math.round(a * DS) - 2, Math.round(i * DS) + 2, sd]); a = -1; } } }
console.log('kerbs', KERBS.length);

// ---------------------------------------------------------------- buildings: roof grid (2 m), split by roof height, minimum-area boxes
const BC = 2, roof = new Map();
for (const m of pick(isBuilding)) raster(m.v, m.idx, BC, (ix, iz, y) => { const k = K(ix + OFS, iz + OFS), r = roof.get(k); if (!r) roof.set(k, [y, y]); else { r[0] = Math.min(r[0], y); r[1] = Math.max(r[1], y); } });
// drop cells in the circuit volume (a block over the tunnel stays: its base is above the roof of the cars)
for (const [k, r] of roof) { const ix = Math.floor(k / 65536) - OFS, iz = k - (ix + OFS) * 65536 - OFS, x = (ix + 0.5) * BC, z = (iz + 0.5) * BC, q = near(x, z, r[0]);
  if (q && Math.abs(q.d) < q.p.w + (q.d > 0 ? q.p.runL : q.p.runR) + 1.0 && r[0] < q.p.y + 6) roof.delete(k); }
const BLD = [];
// the rectangle of a block covers more than its cells: an L-shaped or slanted block next to the road would reach over the asphalt
// and the barriers. A box that comes within 1 m of the barrier line (and not above the cars) is split again (v80)
let dropped = 0;
// Only the Fairmont over the tunnel may stand above the road; any other block hanging over it is a balcony or a bridge in the model.
const overTunnel = (i) => i * DS >= TUNNEL[0] - 10 && i * DS <= TUNNEL[1] + 10;
// (checked against the nearest sample in plan and the nearest at the block's height: on the hillside a road can pass right above or below)
const intrudes = (o, base, top) => { const c = Math.cos(o.rot), s = Math.sin(o.rot), nu = Math.max(2, Math.ceil(o.hw)), nv = Math.max(2, Math.ceil(o.hd));
  for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) { const u = (2 * a / nu - 1) * o.hw, v = (2 * b / nv - 1) * o.hd, x = o.cx + u * c - v * s, z = o.cz + u * s + v * c;
    for (const q of [near(x, z, base), near(x, z)]) if (q && Math.abs(q.d) < q.p.w + (q.d > 0 ? q.p.runL : q.p.runR) + 1.0 && (base < q.p.y + 6 || !overTunnel(q.i)) && top > q.p.y - 0.5) return true; }
  return false; };
// a block becomes one box only if it fills most of its rectangle; otherwise it is cut in two across its long side (and each half
// re-split into connected parts), down to blocks that are box-like (fill > 62 %) or small
const cellXY = (k) => { const ix = Math.floor(k / 65536) - OFS, iz = k - (ix + OFS) * 65536 - OFS; return [(ix + 0.5) * BC, (iz + 0.5) * BC]; };
const addBlock = (keys, depth) => {
  if (keys.length < 6) return;
  const pts = keys.map(cellXY), o = obb(pts, BC / 2), fill = keys.length * BC * BC / (4 * o.hw * o.hd);
  const base0 = Math.min(...keys.map((k) => roof.get(k)[0])), hit = intrudes(o, base0, Math.max(...keys.map((k) => roof.get(k)[1])));
  if (hit && (keys.length <= 6 || depth >= 16)) { dropped++; return; }   // a box that still reaches over the circuit is left out
  if ((fill < 0.62 && depth < 9 && keys.length > 12) || hit) {
    const ux = Math.cos(o.rot), uz = Math.sin(o.rot), lw = o.hw >= o.hd, key = (p) => lw ? (p[0] - o.cx) * ux + (p[1] - o.cz) * uz : -(p[0] - o.cx) * uz + (p[1] - o.cz) * ux;
    for (const half of [keys.filter((k, j) => key(pts[j]) < 0), keys.filter((k, j) => key(pts[j]) >= 0)]) { const sub = new Map(half.map((k) => [k, roof.get(k)])); for (const c of components(sub)) addBlock(c, depth + 1); }
    return;
  }
  const tops = keys.map((k) => roof.get(k)[1]).sort((a, b) => a - b), base = Math.min(...keys.map((k) => roof.get(k)[0])), top = tops[Math.floor(tops.length * 0.8)];
  if (top - base >= 2.5) BLD.push({ ...o, base, top });
};
for (const comp of components(roof, (a, b) => Math.abs(a[1] - b[1]) < 3.5)) addBlock(comp, 0);
console.log('buildings', BLD.length, 'dropped over the circuit', dropped);

// ---------------------------------------------------------------- ground height map (8 m) and surface class: 0 sea, 1 paved, 2 green
const GC = 8, gnd = new Map(), grn = new Map(), wat = new Set();
for (const m of pick(isGround)) { const green = /landscape|grass|mountain|terrain|tree|bush/i.test(m.mat); raster(m.v, m.idx, GC, (ix, iz, y) => { const k = K(ix + OFS, iz + OFS); if (y > (gnd.get(k) ?? -1e9)) { gnd.set(k, y); grn.set(k, green); } }, false); }
for (const m of main.filter((m) => m.mat === 'water' || /terrain_water/.test(m.mat))) raster(m.v, m.idx, GC, (ix, iz) => wat.add(K(ix + OFS, iz + OFS)), false);
let gx0 = 1e9, gx1 = -1e9, gz0 = 1e9, gz1 = -1e9; for (const p of S) { gx0 = Math.min(gx0, p.x); gx1 = Math.max(gx1, p.x); gz0 = Math.min(gz0, p.z); gz1 = Math.max(gz1, p.z); }
const GPAD = 420; gx0 = Math.floor((gx0 - GPAD) / GC); gx1 = Math.ceil((gx1 + GPAD) / GC); gz0 = Math.floor((gz0 - GPAD) / GC); gz1 = Math.ceil((gz1 + GPAD) / GC);
const GNX = gx1 - gx0 + 1, GNZ = gz1 - gz0 + 1, GH = new Float32Array(GNX * GNZ).fill(NaN), GK = new Uint8Array(GNX * GNZ);
for (let a = 0; a < GNX; a++) for (let b = 0; b < GNZ; b++) { const k = K(gx0 + a + OFS, gz0 + b + OFS), y = gnd.get(k), o = b * GNX + a;
  if (y !== undefined && y > SEA + 0.3) { GH[o] = y - SEA; GK[o] = grn.get(k) ? 2 : 1; } else if (wat.has(k) || y !== undefined) { GH[o] = -3; GK[o] = 0; } }
// holes (no mesh): fill from the neighbours, several passes; anything left is sea
for (let pass = 0; pass < 40; pass++) { let left = 0; const nh = GH.slice();
  for (let b = 0; b < GNZ; b++) for (let a = 0; a < GNX; a++) { const o = b * GNX + a; if (GH[o] === GH[o]) continue; let s = 0, n = 0, kk = 1;
    for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a2 = a + da, b2 = b + db; if (a2 < 0 || b2 < 0 || a2 >= GNX || b2 >= GNZ) continue; const v = GH[b2 * GNX + a2]; if (v === v) { s += v; n++; kk = Math.max(kk, GK[b2 * GNX + a2]); } }
    if (n) { nh[o] = s / n; GK[o] = kk; } else left++; }
  GH.set(nh); if (!left) break; }
for (let o = 0; o < GH.length; o++) if (GH[o] !== GH[o]) { GH[o] = -3; GK[o] = 0; }
console.log('ground', GNX, 'x', GNZ, 'sea cells', GK.filter((v) => v === 0).length);

// ---------------------------------------------------------------- small things: grandstands, yachts, palms (components of a 1-2 m grid)
// split: a blob whose rectangle reaches over the circuit (several grandstands joined into one long box) is cut across its long side (v80)
const blobs = (meshes, c, minCells, split) => { const g = new Map(); for (const m of meshes) raster(m.v, m.idx, c, (ix, iz, y) => { const k = K(ix + OFS * 2, iz + OFS * 2), r = g.get(k); if (!r) g.set(k, [y, y]); else { r[0] = Math.min(r[0], y); r[1] = Math.max(r[1], y); } });
  const xy = (k) => { const ix = Math.floor(k / 65536) - OFS * 2, iz = k - (ix + OFS * 2) * 65536 - OFS * 2; return [(ix + 0.5) * c, (iz + 0.5) * c]; }, out = [];
  const add = (cp, depth) => { if (cp.length < minCells) return; const pts = cp.map(xy), o = obb(pts, c / 2), b = { ...o, base: Math.min(...cp.map((k) => g.get(k)[0])), top: Math.max(...cp.map((k) => g.get(k)[1])) };
    if (split && intrudes(o, b.base, b.top)) { if (depth >= 14) { dropped++; return; }
      const ux = Math.cos(o.rot), uz = Math.sin(o.rot), lw = o.hw >= o.hd, key = (p) => lw ? (p[0] - o.cx) * ux + (p[1] - o.cz) * uz : -(p[0] - o.cx) * uz + (p[1] - o.cz) * ux;
      for (const half of [cp.filter((k, j) => key(pts[j]) < 0), cp.filter((k, j) => key(pts[j]) >= 0)]) { const sub = new Map(half.map((k) => [k, g.get(k)])); for (const cc of components(sub)) add(cc, depth + 1); }
      return; }
    out.push(b); };
  for (const cp of components(g)) add(cp, 0);
  return out; };
const STANDS = blobs(pick(isStand), 1, 20, true).map((b) => { const q = near(b.cx, b.cz); const along = Math.max(b.hw, b.hd); return { ...b, s: q.i * DS, d: q.d, len: along * 2 }; });
const BOATS = blobs(pick((n) => isBoat(n)), 1, 8);
const PALMS = blobs(pick(isTree), 1, 1).filter((t) => t.hw < 8 && t.hd < 8);
console.log('stands', STANDS.length, 'boats', BOATS.length, 'trees', PALMS.length);

// ---------------------------------------------------------------- far terrain (mountains around the bay), 40 m: only the AC background mountain meshes
const FC = 40, far = new Map(); for (const m of main.filter((m) => /^Terrain/.test(m.name) && /mountain/.test(m.mat))) raster(m.v, m.idx, FC, (ix, iz, y) => { const k = K(ix + OFS, iz + OFS); far.set(k, Math.max(far.get(k) ?? -1e9, y)); }, false);
let fx0 = 1e9, fx1 = -1e9, fz0 = 1e9, fz1 = -1e9; for (const k of far.keys()) { const ix = Math.floor(k / 65536) - OFS, iz = k - (ix + OFS) * 65536 - OFS; fx0 = Math.min(fx0, ix); fx1 = Math.max(fx1, ix); fz0 = Math.min(fz0, iz); fz1 = Math.max(fz1, iz); }
const FNX = fx1 - fx0 + 1, FNZ = fz1 - fz0 + 1, FH = new Int16Array(FNX * FNZ);
for (let a = 0; a < FNX; a++) for (let b = 0; b < FNZ; b++) { const y = far.get(K(fx0 + a + OFS, fz0 + b + OFS)); FH[b * FNX + a] = y === undefined ? -30 : Math.round(y - SEA); }
console.log('far terrain', FNX, 'x', FNZ);
// grandstands -> the game's stand rows [sFrom, sTo, side, gap from the barrier, tiers, roof]
const STAND_DEFS = [];
for (const b of STANDS) { const c = Math.cos(b.rot), sn = Math.sin(b.rot); const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => near(b.cx + u * b.hw * c - v * b.hd * sn, b.cz + u * b.hw * sn + v * b.hd * c)).filter(Boolean);
  if (q.length < 4) continue; const side = Math.sign(q.reduce((a, x) => a + x.d, 0)); if (q.some((x) => Math.sign(x.d) !== side)) continue;
  let s0 = Math.min(...q.map((x) => x.i)) * DS, s1 = Math.max(...q.map((x) => x.i)) * DS; if (s1 - s0 > LAP / 2) [s0, s1] = [s1, s0 + LAP];
  const p = S[q[0].i], bar = p.w + (side > 0 ? p.runL : p.runR), dmin = Math.min(...q.map((x) => Math.abs(x.d))), dmax = Math.max(...q.map((x) => Math.abs(x.d)));
  if (s1 - s0 < 15) continue;
  STAND_DEFS.push([Math.round(s0) % Math.round(LAP), Math.round(s1) % Math.round(LAP), side, Math.max(2, Math.round(dmin - bar)), Math.max(4, Math.min(16, Math.round((dmax - dmin) / 1.3))), b.top - b.base > 9]);
}
console.log('stand rows', JSON.stringify(STAND_DEFS));
// corners: apex = sharpest point of each AC section (sections.ini, fractions of the lap)
const SECT = []; { const txt = fs.readFileSync(path.join(DIR, 'data/sections.ini'), 'latin1'); for (const m of txt.matchAll(/IN=([\d.]+)\s+OUT=([\d.]+)\s+TEXT=([^\r\n]+)/g)) SECT.push([+m[1], +m[2], m[3].trim()]); }
const kk = new Float64Array(NS); for (let i = 0; i < NS; i++) { const a = S[(i - 1 + NS) % NS], b = S[(i + 1) % NS]; kk[i] = (Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz)); kk[i] = Math.atan2(Math.sin(kk[i]), Math.cos(kk[i])) / (2 * DS); }
const CORN = SECT.map(([a, b, name]) => { let bi = Math.round(a * NS); for (let i = Math.round(a * NS); i <= Math.round(b * NS); i++) if (Math.abs(kk[i % NS]) > Math.abs(kk[bi % NS])) bi = i; return [Math.round(bi * DS), name, Math.round(1 / Math.abs(kk[bi % NS]))]; });
console.log('corners', JSON.stringify(CORN));
// ---------------------------------------------------------------- write src/data_monaco.js
{
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  // asphalt edge: the AC road mesh runs to the foot of the barriers; the white line goes 0.5 m inside where the wall is that close
  const raw = S.map((p) => { const cut = Math.max(0, 0.85 - Math.min(p.runL, p.runR)) * 0.6; const w = p.w - cut; p.runL += cut; p.runR += cut; return [r1(p.x), r1(-p.z), r2(w), r2(w)].join(','); }).join(';');
  const bar = S.map((p) => r1(p.runL) + ',' + r1(p.runR)).join(';');
  const h16 = Buffer.alloc(GH.length * 2); for (let o = 0; o < GH.length; o++) h16.writeInt16LE(Math.round(GH[o] * 10) * 4 + GK[o], o * 2);
  const bl = BLD.map((b) => [r1(b.cx), r1(b.cz), r1(b.hw), r1(b.hd), r2(b.rot), r1(b.base - SEA), r1(b.top - SEA)].join(',')).join(';');
  const bo = BOATS.map((b) => [r1(b.cx), r1(b.cz), r1(b.hw), r1(b.hd), r2(b.rot), r1(b.top - b.base)].join(',')).join(';');
  const pa = PALMS.map((b) => [r1(b.cx), r1(b.cz), r1(b.top - SEA)].join(',')).join(';');
  const js = `// Circuit de Monaco: everything measured on the Assetto Corsa track "2022 Monaco F1 Grand Prix" (Pyyer) by tools/prep_monaco/prep.mjs.
// MONACO_RAW: centreline + asphalt half-widths (x, y = -z, right, left), every ${DS.toFixed(3)} m from the timing line. MONACO_BAR: barrier
// distance beyond the asphalt edge (left, right) at the same samples, from the collision walls. Heights: metres above the sea.
const MONACO_DS = ${DS.toFixed(5)}, MONACO_NOM = ${Math.round(LAP)};
const MONACO_RAW = "${raw}";
const MONACO_BAR = "${bar}";
const MONACO_ELEV = ${JSON.stringify(ELEV)};
// city: buildings [cx, cz, half width, half depth, rotation, base, roof]; ground: height map (int16 = round(h * 10) * 4 + class 0 sea / 1 paved / 2 green)
const MONACO_CITY = {
  tunnel: ${JSON.stringify(TUNNEL)}, kerbs: ${JSON.stringify(KERBS)}, conc: ${JSON.stringify(CONC)}, tyres: ${JSON.stringify(TYRES)},
  stands: ${JSON.stringify(STANDS.map((b) => [Math.round(b.s), r1(b.d), r1(b.cx), r1(b.cz), r1(b.hw), r1(b.hd), r2(b.rot), r1(b.base - SEA), r1(b.top - SEA)]))},
  far: { x0: ${fx0 * FC}, z0: ${fz0 * FC}, step: ${FC}, nx: ${FNX}, nz: ${FNZ}, h: "${Buffer.from(FH.buffer).toString('base64')}" },
  standRows: ${JSON.stringify(STAND_DEFS)},
  ground: { x0: ${gx0 * GC}, z0: ${gz0 * GC}, step: ${GC}, nx: ${GNX}, nz: ${GNZ}, h: "${h16.toString('base64')}" },
  buildings: "${bl}",
  boats: "${bo}",
  palms: "${pa}"
};
`;
  fs.writeFileSync(OUT, js); console.log('wrote', OUT, (js.length / 1024).toFixed(0), 'KB');
}
// full top view: ground classes, buildings, track
if (SVG) {
  const W = 1400, sc = W / (GNX * GC), X = (x) => ((x - gx0 * GC) * sc).toFixed(1), Z = (z) => ((z - gz0 * GC) * sc).toFixed(1);
  let o = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${(GNZ * GC * sc).toFixed(0)}" style="background:#fff">`;
  for (let b = 0; b < GNZ; b++) for (let a = 0; a < GNX; a++) { const v = GH[b * GNX + a], k = GK[b * GNX + a]; const c = k === 0 ? '#3b78a8' : k === 2 ? `hsl(100,35%,${30 + Math.min(40, v)}%)` : `hsl(30,10%,${45 + Math.min(45, v)}%)`; o += `<rect x="${(a * GC * sc).toFixed(1)}" y="${(b * GC * sc).toFixed(1)}" width="${(GC * sc + 0.6).toFixed(1)}" height="${(GC * sc + 0.6).toFixed(1)}" fill="${c}"/>`; }
  for (const b of BLD) { const c = Math.cos(b.rot), s2 = Math.sin(b.rot); const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => X(b.cx + u * b.hw * c - v * b.hd * s2) + ',' + Z(b.cz + u * b.hw * s2 + v * b.hd * c)).join(' ');
    o += `<polygon points="${pts}" fill="hsl(${20 + (b.top - b.base) * 2},40%,60%)" stroke="#333" stroke-width="0.5"/>`; }
  for (const b of BOATS) { const c = Math.cos(b.rot), s2 = Math.sin(b.rot); o += `<polygon points="${[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => X(b.cx + u * b.hw * c - v * b.hd * s2) + ',' + Z(b.cz + u * b.hw * s2 + v * b.hd * c)).join(' ')}" fill="#fff" stroke="#000" stroke-width="0.4"/>`; }
  for (const st of STANDS) { const c = Math.cos(st.rot), s2 = Math.sin(st.rot); o += `<polygon points="${[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => X(st.cx + u * st.hw * c - v * st.hd * s2) + ',' + Z(st.cz + u * st.hw * s2 + v * st.hd * c)).join(' ')}" fill="#c33" opacity="0.8"/>`; }
  for (const t of PALMS) o += `<circle cx="${X(t.cx)}" cy="${Z(t.cz)}" r="2" fill="#070"/>`;
  o += `<polyline fill="none" stroke="#111" stroke-width="${(8 * sc).toFixed(1)}" points="${S.map((p) => X(p.x) + ',' + Z(p.z)).join(' ')}"/>`;
  o += `<polyline fill="none" stroke="#fd0" stroke-width="${(8 * sc).toFixed(1)}" points="${S.filter((p, i) => i * DS >= TUNNEL[0] && i * DS <= TUNNEL[1]).map((p) => X(p.x) + ',' + Z(p.z)).join(' ')}"/>`;
  for (let s2 = 0; s2 < LAP; s2 += 250) { const p = S[Math.round(s2 / DS) % NS]; o += `<text x="${X(p.x)}" y="${Z(p.z)}" font-size="14" fill="#f00" font-family="sans-serif">${s2}</text>`; }
  fs.writeFileSync(SVG, o + '</svg>');
}
if (process.env.DBG === 'w') { const b = {}; S.forEach((p, i) => { const k = Math.floor(i * DS / 50) * 50; b[k] = Math.min(b[k] ?? 99, p.w * 2); }); console.log(Object.entries(b).map(([k, v]) => k + ':' + v.toFixed(1)).join(' ')); }
// debug: top view of one window [x0, z0, size] -> SVG (road cells by mesh, walls, AI line, centreline + edges)
if (process.env.WIN) {
  const [wx, wz, ws] = process.env.WIN.split(',').map(Number), sc = 1000 / ws, X = (x) => ((x - wx) * sc).toFixed(1), Z = (z) => ((z - wz) * sc).toFixed(1);
  let o = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" style="background:#fff">`;
  const cols = {}; const pal = ['#9ad', '#d9a', '#ad9', '#dd9', '#9dd', '#c9f', '#fc9', '#aaa'];
  for (const m of main) {
    const kind = isRoad(m.name) ? 'road' : (/^\d+CONCRETE/.test(m.name) ? 'conc' : (/KERB/.test(m.name) ? 'kerb' : null)); if (!kind) continue;
    const col = kind === 'road' ? (cols[m.name] ||= pal[Object.keys(cols).length % 7]) : kind === 'kerb' ? '#e33' : '#ddd';
    for (let t = 0; t < m.idx.length; t += 3) { const p = [0, 1, 2].map((q) => m.idx[t + q] * 3); if (p.some((a) => Math.abs(m.v[a] - wx - ws / 2) > ws || Math.abs(m.v[a + 2] - wz - ws / 2) > ws)) continue;
      o += `<polygon points="${p.map((a) => X(m.v[a]) + ',' + Z(m.v[a + 2])).join(' ')}" fill="${col}" stroke="none" opacity="0.8"/>`; }
  }
  for (const m of walls) for (let t = 0; t < m.idx.length; t += 3) { const p = [0, 1, 2].map((q) => m.idx[t + q] * 3); o += `<polygon points="${p.map((a) => X(m.v[a]) + ',' + Z(m.v[a + 2])).join(' ')}" fill="none" stroke="#000" stroke-width="2"/>`; }
  o += `<polyline fill="none" stroke="#06f" stroke-width="1.5" points="${AI.map((p) => X(p.x) + ',' + Z(p.z)).join(' ')}"/>`;
  for (const sgn of [1, 0, -1]) o += `<polyline fill="none" stroke="${sgn ? '#f0f' : '#0a0'}" stroke-width="1.5" points="${S.map((p) => X(p.x + p.nx * p.w * sgn) + ',' + Z(p.z + p.nz * p.w * sgn)).join(' ')}"/>`;
  { const PA = readAi(path.join(DIR, 'ai/pit_lane.ai')); o += `<polyline fill="none" stroke="#f80" stroke-width="2" points="${PA.map((p) => X(p.x) + ',' + Z(p.z)).join(' ')}"/>`; }
  for (const m of pick(isGarage)) for (let t = 0; t < m.idx.length; t += 9) { const p = [0, 1, 2].map((q) => m.idx[t + q] * 3); o += `<polygon points="${p.map((a) => X(m.v[a]) + ',' + Z(m.v[a + 2])).join(' ')}" fill="#0c0" opacity="0.3"/>`; }
  for (const m of main.filter((m) => /PITLANE/.test(m.name))) for (let t = 0; t < m.idx.length; t += 3) { const p = [0, 1, 2].map((q) => m.idx[t + q] * 3); o += `<polygon points="${p.map((a) => X(m.v[a]) + ',' + Z(m.v[a + 2])).join(' ')}" fill="#fd0" opacity="0.5"/>`; }
  fs.writeFileSync(process.env.OUTSVG || '/tmp/top.svg', o + '</svg>');
}
if (process.env.DBG === 'r') { for (let i = 0; i < NS; i += 4) process.stdout.write(Math.round(i * DS) + ':' + S[i].runL.toFixed(1) + '/' + S[i].runR.toFixed(1) + '[' + S[i].typL + S[i].typR + '] '); console.log(); console.log('conc', JSON.stringify(CONC), 'tyres', JSON.stringify(TYRES)); }
const proj = (x, z, y) => { let b = 1e18, bi = 0; for (let i = 0; i < NS; i++) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2 + (y === undefined ? 0 : ((S[i].y - y) * 3) ** 2); if (d < b) { b = d; bi = i; } } const p = S[bi]; const along = (x - p.x) * p.tx + (z - p.z) * p.tz; return { s: (bi * DS + along + LAP) % LAP, d: (x - p.x) * p.nx + (z - p.z) * p.nz, i: bi }; };
if (process.env.DBG === 'p') { const PA = readAi(path.join(DIR, 'ai/pit_lane.ai')); for (let k = 0; k < PA.length; k += 15) { const q = proj(PA[k].x, PA[k].z, PA[k].y); process.stdout.write(k + ':' + q.s.toFixed(0) + '/' + q.d.toFixed(1) + ' '); } console.log();
  for (const m of pick(isGarage)) { let x = 0, z = 0, n = m.v.length / 3; for (let q = 0; q < m.v.length; q += 3) { x += m.v[q]; z += m.v[q + 2]; } const g = proj(x / n, z / n); console.log('garage', g.s.toFixed(0), g.d.toFixed(1)); } }
