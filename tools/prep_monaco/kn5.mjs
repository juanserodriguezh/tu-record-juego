// Minimal reader for Assetto Corsa .kn5 track models (v5/v6): mesh nodes with world-space vertices, indices and material names.
// Textures are skipped. Usage: readKn5(path, keep) where keep(name, material) -> true to load that mesh's geometry.
import fs from 'node:fs';
export function readKn5(file, keep = () => true) {
  const fd = fs.openSync(file, 'r');
  let pos = 0;
  const rd = (n) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, pos); pos += n; return b; };
  const I = () => rd(4).readInt32LE(0), F = () => rd(4).readFloatLE(0), B = () => rd(1)[0], S = () => rd(I()).toString('latin1');
  rd(6); const ver = I(); if (ver > 5) I();
  const nt = I(); for (let i = 0; i < nt; i++) { I(); S(); const sz = I(); pos += sz; }
  const mats = [];
  for (let i = 0, nm = I(); i < nm; i++) {
    const name = S(); S(); B(); B(); if (ver > 4) I();
    for (let k = 0, np = I(); k < np; k++) { S(); F(); pos += 36; }
    for (let k = 0, ns = I(); k < ns; k++) { S(); I(); S(); }
    mats.push(name);
  }
  const meshes = [];
  const mul = (a, b) => { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j]; return r; };
  const node = (M) => {
    const type = I(), name = S(), nc = I(); B(); let W = M;
    if (type === 1) { const m = []; for (let i = 0; i < 16; i++) m.push(F()); W = mul(m, M); }
    else if (type === 2 || type === 3) {
      B(); B(); B();
      if (type === 3) for (let k = 0, nb = I(); k < nb; k++) { S(); pos += 64; }
      const nv = I(), stride = type === 2 ? 44 : 76, vstart = pos; pos += nv * stride;
      const ni = I(), istart = pos; pos += ni * 2;
      const mat = mats[I()] || '';
      if (type === 2) { I(); F(); F(); pos += 16; B(); } else { I(); pos += 8; }
      if (keep(name, mat)) {
        const save = pos; pos = vstart; const vb = rd(nv * stride); pos = istart; const ib = rd(ni * 2); pos = save;
        const v = new Float32Array(nv * 3);
        for (let q = 0; q < nv; q++) {
          const x = vb.readFloatLE(q * stride), y = vb.readFloatLE(q * stride + 4), z = vb.readFloatLE(q * stride + 8);
          v[q * 3] = x * W[0] + y * W[4] + z * W[8] + W[12]; v[q * 3 + 1] = x * W[1] + y * W[5] + z * W[9] + W[13]; v[q * 3 + 2] = x * W[2] + y * W[6] + z * W[10] + W[14];
        }
        const idx = new Uint16Array(ni); for (let k = 0; k < ni; k++) idx[k] = ib.readUInt16LE(k * 2);
        meshes.push({ name, mat, v, idx });
      }
    }
    for (let c = 0; c < nc; c++) node(W);
  };
  node([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  fs.closeSync(fd);
  return meshes;
}
// Assetto Corsa AI spline (fast_lane.ai, v7): points with the extra data block (speed, side distances)
export function readAi(file) {
  const b = fs.readFileSync(file); let o = 0;
  const I = () => { const v = b.readInt32LE(o); o += 4; return v; }, F = () => { const v = b.readFloatLE(o); o += 4; return v; };
  I(); const n = I(); I(); I();
  const P = []; for (let i = 0; i < n; i++) P.push({ x: F(), y: F(), z: F(), l: F(), id: I() });
  const ec = I(); for (let i = 0; i < ec; i++) { const e = []; for (let k = 0; k < 18; k++) e.push(F()); P[i].sp = e[0]; P[i].L = e[5]; P[i].R = e[6]; }
  return P;
}
