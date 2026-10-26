// ============================================================================
//  WORLD: track surfaces, terrain, forest, landmarks, sky and weather
// ============================================================================
const hash2 = (x, z) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < (oct || 4); i++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
// periodic (tileable) value noise: lattice wraps every P cells
function pnoise(x, y, P, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => hash2((((a % P) + P) % P) + seed * 17.31, (((b % P) + P) % P) + seed * 5.13);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pfbm(x, y, P, oct, seed) { let s = 0, a = 0.5, n = 0, f = 1; for (let i = 0; i < oct; i++) { s += a * pnoise(x * f, y * f, P * f, seed + i * 3); n += a; a *= 0.5; f *= 2; } return s / n; }
let RSEED = 12345;
const rand = () => { RSEED = (RSEED * 16807) % 2147483647; return (RSEED - 1) / 2147483646; };
const col3 = (hex) => new THREE.Color(hex);

// Accumulates coloured triangles (non-indexed) and emits one BufferGeometry
class GeoBuilder {
  constructor(withUV) { this.p = []; this.n = []; this.c = []; this.uv = withUV ? [] : null; }
  tri(a, b, c, col, ua, ub, uc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) { this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); }
    if (this.uv) this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }
  triC(a, b, c, ca, cb, cc, ua, ub, uc) { const n0 = this.c.length; this.tri(a, b, c, ca, ua, ub, uc); this.c[n0 + 3] = cb.r; this.c[n0 + 4] = cb.g; this.c[n0 + 5] = cb.b; this.c[n0 + 6] = cc.r; this.c[n0 + 7] = cc.g; this.c[n0 + 8] = cc.b; }
  quadC(a, b, c, d, ca, cb, cc, cd, uvs) { this.triC(a, b, c, ca, cb, cc, uvs && uvs[0], uvs && uvs[1], uvs && uvs[2]); this.triC(a, c, d, ca, cc, cd, uvs && uvs[0], uvs && uvs[2], uvs && uvs[3]); }
  quad(a, b, c, d, col, uvs) {
    this.tri(a, b, c, col, uvs && uvs[0], uvs && uvs[1], uvs && uvs[2]);
    this.tri(a, c, d, col, uvs && uvs[0], uvs && uvs[2], uvs && uvs[3]);
  }
  box(cx, cy, cz, sx, sy, sz, rot, col, colTop) {
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0), hx = sx / 2, hz = sz / 2;
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const y0 = 0, y1 = sy;
    const c000 = P(-hx, y0, -hz), c100 = P(hx, y0, -hz), c110 = P(hx, y1, -hz), c010 = P(-hx, y1, -hz);
    const c001 = P(-hx, y0, hz), c101 = P(hx, y0, hz), c111 = P(hx, y1, hz), c011 = P(-hx, y1, hz);
    this.quad(c001, c101, c111, c011, col); this.quad(c100, c000, c010, c110, col);
    this.quad(c101, c100, c110, c111, col); this.quad(c000, c001, c011, c010, col);
    this.quad(c011, c111, c110, c010, colTop || col); this.quad(c000, c100, c101, c001, col);
  }
  gable(cx, cy, cz, sx, h, sz, rot, col, colEnd) { // roof ridge along local x
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0), hx = sx / 2, hz = sz / 2;
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const a = P(-hx, 0, -hz), b = P(hx, 0, -hz), d = P(-hx, 0, hz), e = P(hx, 0, hz), r0 = P(-hx, h, 0), r1 = P(hx, h, 0);
    this.quad(d, e, r1, r0, col); this.quad(b, a, r0, r1, col);
    this.tri(a, d, r0, colEnd || col); this.tri(e, b, r1, colEnd || col);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

function mergeGeos(list) { // non-indexed geometries with identical attribute sets
  const names = Object.keys(list[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const nm of names) {
    const item = list[0].attributes[nm].itemSize;
    let len = 0; for (const g of list) len += g.attributes[nm].array.length;
    const arr = new Float32Array(len); let o = 0;
    for (const g of list) { arr.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, item));
  }
  out.computeBoundingSphere();
  return out;
}
function colorize(geo, hex) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const n = geo.attributes.position.count, c = new THREE.Color(hex), arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

// ---------------------------------------------------------------------------
//  Canvas textures
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
const TEX = {};
function makeTextures() {
  // asphalt: fine aggregate, darker binder, faint large-scale blotches and a few sealed cracks (tileable)
  TEX.asphalt = canvasTex(512, 512, (g, w, h) => {
    const img = g.createImageData(w, h), D = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = pfbm(x / w * 5, y / h * 5, 5, 4, 1), m = pfbm(x / w * 24, y / h * 24, 24, 2, 7);
      let v = 80 + (n - 0.5) * 22 + (m - 0.5) * 12 + (hash2(x * 1.73, y * 2.31) - 0.5) * 30;
      const st = hash2(x * 3.11 + 7.7, y * 1.37);
      if (st > 0.94) v += 30 + 30 * hash2(x, y * 5.3); else if (st < 0.05) v -= 26;
      const o = (y * w + x) * 4; D[o] = v; D[o + 1] = v + 1; D[o + 2] = v + 4; D[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    for (let k = 0; k < 2; k++) { // sealed cracks
      let x = rand() * w, y = rand() * h, a = rand() * 6.28; g.strokeStyle = `rgba(22,23,25,${0.12 + rand() * 0.1})`; g.lineWidth = 1.2 + rand() * 1.2;
      g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 12; j++) { a += (rand() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); } g.stroke();
    }
  }, true);
  TEX.asphalt.anisotropy = 8;
  TEX.gravel = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h), D = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = pfbm(x / w * 8, y / h * 8, 8, 3, 11); const v = 150 + (n - 0.5) * 50 + (hash2(x, y) - 0.5) * 40; const o = (y * w + x) * 4; D[o] = v * 1.05; D[o + 1] = v * 0.97; D[o + 2] = v * 0.82; D[o + 3] = 255; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 2600; i++) { const x = rand() * w, y = rand() * h, r = 0.8 + rand() * 2.2, c = 110 + rand() * 120; g.fillStyle = `rgba(${c * 1.04 | 0},${c * 0.98 | 0},${c * 0.86 | 0},0.9)`; g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rand() * 0.4), rand() * 3, 0, 7); g.fill(); g.fillStyle = 'rgba(40,34,25,0.35)'; g.beginPath(); g.ellipse(x + r * 0.35, y + r * 0.4, r * 0.8, r * 0.4, 0, 0, 7); g.fill(); }
  }, true);
  // tileable noise for the sky (R: base, G: detail), stored as linear data
  TEX.noise = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h), D = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; D[o] = 255 * pfbm(x / w * 4, y / h * 4, 4, 5, 21); D[o + 1] = 255 * pfbm(x / w * 8, y / h * 8, 8, 4, 33); D[o + 2] = 255 * pnoise(x / w * 16, y / h * 16, 16, 45); D[o + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, true);
  TEX.noise.colorSpace = THREE.NoColorSpace; TEX.noise.anisotropy = 1;
  // conifer skirt: dense needles, jagged hanging bottom edge (alpha), bark swatch in the top-left corner
  TEX.needles = canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0);
    for (let x = w; x >= 0; x -= 4) { const t = x / w * 14 * Math.PI; g.lineTo(x, h - 3 - 22 * Math.pow(Math.abs(Math.sin(t)), 0.7) - 10 * hash2(x, 3)); }
    g.closePath(); g.clip();
    g.fillStyle = '#1f3a22'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const x = rand() * w, y = rand() * h, l = 3 + rand() * 6, a = Math.PI / 2 + (rand() - 0.5) * 1.3;
      const lum = rand(); g.strokeStyle = lum < 0.45 ? `rgba(14,30,16,0.8)` : lum < 0.85 ? `rgba(${45 + rand() * 25 | 0},${80 + rand() * 30 | 0},${40 + rand() * 18 | 0},0.85)` : `rgba(${95 + rand() * 30 | 0},${125 + rand() * 25 | 0},${60 + rand() * 20 | 0},0.8)`;
      g.lineWidth = 1 + rand() * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    g.restore();
    g.fillStyle = '#4a3a2c'; g.fillRect(0, 0, 10, 10);
  }, true);
  // broadleaf crown: clusters of leaves with gaps (alpha), bark swatch top-left
  TEX.leaves = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      const x = rand() * w, y = rand() * h, r = 1.6 + rand() * 2.6, lum = rand();
      g.fillStyle = lum < 0.35 ? `rgb(${30 + rand() * 12 | 0},${56 + rand() * 16 | 0},${24 + rand() * 10 | 0})` : lum < 0.85 ? `rgb(${55 + rand() * 25 | 0},${95 + rand() * 30 | 0},${38 + rand() * 16 | 0})` : `rgb(${110 + rand() * 30 | 0},${150 + rand() * 25 | 0},${60 + rand() * 20 | 0})`;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.beginPath(); g.ellipse(x + ox, y + oy, r, r * 0.62, rand() * 3, 0, 7); g.fill(); }
    }
    g.fillStyle = '#4d3b2b'; g.fillRect(0, 0, 8, 8);
  }, true);
  TEX.kerb = canvasTex(8, 64, (g, w, h) => { g.fillStyle = '#d6221b'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f2f2f2'; g.fillRect(0, h / 2, w, h / 2); }, true);
  TEX.kerb.magFilter = THREE.NearestFilter;
  TEX.armco = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    const st = [[0, '#6d7479'], [0.06, '#dfe4e8'], [0.14, '#aab1b7'], [0.22, '#5d6469'], [0.3, '#cfd5da'], [0.38, '#e8ecef'], [0.46, '#9aa1a7'], [0.54, '#555c61'], [0.62, '#c8ced3'], [0.7, '#e4e8eb'], [0.78, '#a2a9ae'], [0.86, '#5a6166'], [0.93, '#8d9499'], [1, '#474d52']];
    for (const [t, c] of st) gr.addColorStop(t, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '40,40,40'},${0.04 + rand() * 0.05})`; g.fillRect(rand() * w, rand() * h, 3 + rand() * 10, 1); }
    g.fillStyle = 'rgba(40,44,48,0.8)'; g.fillRect(30, 0, 3, h); g.fillStyle = '#b9c0c5'; g.fillRect(29, 20, 5, 3); g.fillRect(29, 44, 5, 3);
  }, true);
  TEX.fence = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(200,205,210,0.9)'; g.lineWidth = 1.2;
    for (let i = -64; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
    g.fillStyle = 'rgba(120,125,130,1)'; g.fillRect(0, 0, 3, h);
  }, true);
  TEX.crowd = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#3b3f46'; g.fillRect(0, 0, w, h);
    const pal = ['#d7263d', '#f2c230', '#f4f4f4', '#1b998b', '#2e86de', '#ff7f11', '#222', '#e0e0e0', '#c0392b', '#f5d76e'];
    for (let y = 2; y < h; y += 6) for (let x = 1; x < w; x += 3.2) { if (rand() < 0.82) { g.fillStyle = pal[Math.floor(rand() * pal.length)]; g.fillRect(x + rand(), y + rand() * 1.5, 2, 3); } }
  }, true);
  TEX.checker = canvasTex(64, 16, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * 4, y * 4, 4, 4); } }, true);
  TEX.checker.magFilter = THREE.NearestFilter;
  TEX.cloud = canvasTex(128, 64, (g, w, h) => {
    for (let i = 0; i < 18; i++) {
      const x = 20 + rand() * (w - 40), y = 22 + rand() * 20, r = 10 + rand() * 18;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  // grass detail: tileable noise + blades with hue variation, mean ~0.86 (vertex colours carry the hue)
  TEX.grass = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h), D = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = pfbm(x / w * 6, y / h * 6, 6, 4, 3), dry = pfbm(x / w * 3, y / h * 3, 3, 3, 9);
      const v = 255 * (0.7 + 0.26 * n + 0.1 * (hash2(x, y) - 0.5));
      const o = (y * w + x) * 4; D[o] = v * (0.92 + 0.16 * dry); D[o + 1] = v; D[o + 2] = v * (0.86 - 0.06 * dry); D[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 4200; i++) {
      const x = rand() * w, y = rand() * h, l = 2 + rand() * 4.5, a = -Math.PI / 2 + (rand() - 0.5) * 0.9, c = rand();
      g.strokeStyle = c < 0.45 ? `rgba(255,255,225,${0.1 + rand() * 0.12})` : c < 0.8 ? `rgba(30,48,14,${0.12 + rand() * 0.14})` : `rgba(235,225,150,${0.08 + rand() * 0.1})`;
      g.lineWidth = 0.9;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke(); }
    }
  }, true);
  TEX.grass.anisotropy = 8;
  // tall grass / weeds (alpha blades) for the verges outside the barriers
  TEX.blades = canvasTex(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const x = 2 + rand() * (w - 4), l = h * (0.35 + 0.62 * rand()), bend = (rand() - 0.5) * 14, c = rand();
      g.strokeStyle = c < 0.5 ? `rgb(${60 + rand() * 30 | 0},${95 + rand() * 30 | 0},${35 + rand() * 15 | 0})` : c < 0.85 ? `rgb(${40 + rand() * 20 | 0},${70 + rand() * 20 | 0},${25 + rand() * 10 | 0})` : `rgb(${140 + rand() * 30 | 0},${140 + rand() * 25 | 0},${80 + rand() * 20 | 0})`;
      g.lineWidth = 1 + rand() * 1.3; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + bend * 0.3, h - l * 0.6, x + bend, h - l); g.stroke();
    }
  }, false);
  // chain-link catch fence (alpha)
  TEX.catch = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(165,172,178,1)'; g.lineWidth = 1.3;
    for (let i = -64; i < 128; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  }, true);
  TEX.blob = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
function textTex(text, opt) {
  opt = opt || {};
  const w = opt.w || 256, h = opt.h || 64;
  return canvasTex(w, h, (g) => {
    g.fillStyle = opt.bg || '#f4f4f4'; g.fillRect(0, 0, w, h);
    if (opt.border) { g.strokeStyle = opt.border; g.lineWidth = opt.bw || 6; g.strokeRect(3, 3, w - 6, h - 6); }
    g.fillStyle = opt.fg || '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${opt.weight || 800} ${opt.size || 40}px ${opt.font || "'Saira Condensed', 'Arial Narrow', sans-serif"}`;
    g.fillText(text, w / 2, h / 2 + (opt.dy || 2));
  });
}

// breaks up texture tiling: the map is also sampled at two much larger scales and modulates itself
function macroVariation(mat, k) {
  k = k || 1;
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float mA = texture2D( map, vMapUv * 0.1173 + vec2(0.37, 0.71) ).g;
  float mB = texture2D( map, vMapUv * 0.0291 + vec2(0.13, 0.29) ).g;
  sampledDiffuseColor.rgb *= mix(1.0, (0.45 + 0.62 * mA) * (0.62 + 0.45 * mB), ${k.toFixed(2)});
  diffuseColor *= sampledDiffuseColor;
#endif`);
  };
  mat.customProgramCacheKey = () => 'macro' + k;
  return mat;
}

// ---------------------------------------------------------------------------
//  World builder
// ---------------------------------------------------------------------------
class World {
  constructor(scene, T, line, quality) {
    this.scene = scene; this.T = T; this.line = line; this.q = quality;
    this.group = new THREE.Group(); scene.add(this.group);
    this.footprints = []; // [x, z, r] areas kept free of trees
    this.sc = T.L / T.nom; // nominal metres -> track metres
    this.D = T.def; this.SC = T.def.scenery;
  }
  P(i, d, dy) { const T = this.T; i = ((i % T.N) + T.N) % T.N; return [T.x[i] + T.nx[i] * d, T.e[i] + (dy || 0), T.z[i] + T.nz[i] * d]; }
  idx(sNom) { const N = this.T.N; return ((Math.round(sNom * this.sc / this.T.ds) % N) + N) % N; }
  at(sNom, d) { const p = trackPoint(this.T, sNom * this.sc, d); return p; }

  buildTrack() {
    const T = this.T, N = T.N, line = this.line;
    // ---- asphalt with rubbered racing line
    const M = 9;
    const pos = new Float32Array((N + 1) * M * 3), uv = new Float32Array((N + 1) * M * 2), colr = new Float32Array((N + 1) * M * 3);
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      for (let j = 0; j < M; j++) {
        const d = lerp(-T.wr[k], T.wl[k], j / (M - 1));
        const p = this.P(k, d, 0.0);
        const o = (i * M + j);
        pos.set(p, o * 3);
        uv[o * 2] = d / 5; uv[o * 2 + 1] = (i * T.ds) / 5;
        const rub = Math.exp(-((d - line.off[k]) ** 2) / (2 * 1.1 * 1.1));
        const patch = 0.92 + 0.12 * vnoise(i * 0.05, j * 0.7);
        const v = patch * (1 - 0.32 * rub);
        colr[o * 3] = v; colr[o * 3 + 1] = v; colr[o * 3 + 2] = v;
      }
    }
    const ind = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < M - 1; j++) {
      const a = i * M + j, b = (i + 1) * M + j, c = (i + 1) * M + j + 1, d = i * M + j + 1;
      ind.push(a, b, d, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    g.setIndex(ind); g.computeVertexNormals();
    this.asphaltMat = this.q === 'bajo' ? new THREE.MeshPhongMaterial({ map: TEX.asphalt, vertexColors: true, shininess: 8, specular: 0x111111 })
      : new THREE.MeshStandardMaterial({ map: TEX.asphalt, vertexColors: true, roughness: 0.86, metalness: 0, bumpMap: TEX.asphalt, bumpScale: 1.0, envMapIntensity: 0.35 });
    const asphalt = new THREE.Mesh(g, this.asphaltMat); asphalt.receiveShadow = true;
    this.group.add(asphalt);

    // ---- generic ribbon helper
    const ribbon = (from, to, dIn, dOut, dyIn, dyOut, colFn, uvScale, mat) => {
      const b = new GeoBuilder(!!uvScale);
      for (let i = from; i < to; i++) {
        const i2 = i + 1;
        const a0 = this.P(i, dIn(i), dyIn), a1 = this.P(i, dOut(i), dyOut), b0 = this.P(i2, dIn(i2), dyIn), b1 = this.P(i2, dOut(i2), dyOut);
        const cc = colFn(i);
        // ensure upward facing regardless of side
        const leftSide = dOut(i) > dIn(i);
        const uvs = uvScale ? [[0, i * T.ds / uvScale], [1, i * T.ds / uvScale], [1, i2 * T.ds / uvScale], [0, i2 * T.ds / uvScale]] : null;
        if (leftSide) b.quad(a0, b0, b1, a1, cc, uvs ? [uvs[0], uvs[3], uvs[2], uvs[1]] : null);
        else b.quad(a0, a1, b1, b0, cc, uvs);
      }
      return new THREE.Mesh(b.build(), mat);
    };
    const white = col3('#eeeeee');
    const lineMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.group.add(ribbon(0, N, i => T.wl[i % N] - 0.32, i => T.wl[i % N] - 0.05, 0.005, 0.005, () => white, 0, lineMat));
    this.group.add(ribbon(0, N, i => -T.wr[i % N] + 0.32, i => -T.wr[i % N] + 0.05, 0.005, 0.005, () => white, 0, lineMat));

    // ---- kerbs (runs)
    const kerbMat = new THREE.MeshLambertMaterial({ map: TEX.kerb, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const runs = (arr) => { const r = []; let st = -1; for (let i = 0; i <= N; i++) { const on = i < N && arr[i]; if (on && st < 0) st = i; if (!on && st >= 0) { r.push([st, i]); st = -1; } } return r; };
    const kg = [];
    for (const [a, b] of runs(T.kerbL)) kg.push(ribbon(a, b, i => T.wl[i % N] - 0.05, i => T.wl[i % N] + 1.3, 0.01, 0.07, () => white, 2.0, kerbMat).geometry);
    for (const [a, b] of runs(T.kerbR)) kg.push(ribbon(a, b, i => -T.wr[i % N] + 0.05, i => -T.wr[i % N] - 1.3, 0.01, 0.07, () => white, 2.0, kerbMat).geometry);
    if (kg.length) this.group.add(new THREE.Mesh(mergeGeos(kg), kerbMat));
    // ---- Bus Stop "sausage" kerbs: raised yellow humps beyond the inside kerbs (physics: SAUS_IN..SAUS_OUT)
    {
      const sb = new GeoBuilder(false), yel = col3('#f1c21b'), yelD = col3('#c99a12');
      const prof = [[0, 0], [0.07, 0.07], [0.18, 0.13], [0.42, 0.13], [0.53, 0.07], [SAUS_OUT - SAUS_IN, 0]];
      const up = (a, b, c, d, col) => { const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]); if (ny >= 0) sb.quad(a, b, c, d, col); else sb.quad(a, d, c, b, col); };
      for (const [arr, side] of [[T.sausL, 1], [T.sausR, -1]]) for (const [a, b] of runs(arr)) {
        const ramp = (i) => clamp(Math.min(i - a, b - i) / 1.2, 0, 1); // tapered ends
        for (let i = a; i < b; i++) for (let j = 0; j < prof.length - 1; j++) {
          const pt = (ii, jj) => { const k = ii % N, dd = side > 0 ? T.wl[k] + SAUS_IN + prof[jj][0] : -(T.wr[k] + SAUS_IN + prof[jj][0]); return this.P(k, dd, 0.02 + prof[jj][1] * ramp(ii)); };
          up(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1), (j === 0 || j === prof.length - 2) ? yelD : yel);
        }
      }
      if (sb.p.length) this.group.add(new THREE.Mesh(sb.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    }

    // ---- run-off up to the barriers: mown grass (stripes), tarmac with a painted band beyond the kerbs, gravel
    {
      const RB = { grass: new GeoBuilder(true), tarmac: new GeoBuilder(true), gravel: new GeoBuilder(true), paint: new GeoBuilder(true) };
      const cG = col3('#627d43'), cT = new THREE.Color(1.45, 1.45, 1.5), cP = col3('#3c7a48'), cV = col3('#ffffff');
      const wuv = (p) => [p[0] / 9, p[2] / 9];
      for (const side of [1, -1]) {
        const typ = side > 0 ? T.typL : T.typR, kerb = side > 0 ? T.kerbL : T.kerbR;
        const ed = (i) => { const k = i % N; return side > 0 ? T.wl[k] + (kerb[k] ? 1.3 : 0) : -T.wr[k] - (kerb[k] ? 1.3 : 0); };
        const bd = (i) => { const k = i % N; return side > 0 ? T.barL[k] + 1.5 : -T.barR[k] - 1.5; };
        const quad = (bld, i, dA, dB, yA, yB, col, colB) => {
          const a0 = this.P(i, dA(i), yA), a1 = this.P(i, dB(i), yB), b0 = this.P(i + 1, dA(i + 1), yA), b1 = this.P(i + 1, dB(i + 1), yB);
          const cB = colB || col;
          if (side > 0) bld.quadC(a0, b0, b1, a1, col, col, cB, cB, [wuv(a0), wuv(b0), wuv(b1), wuv(a1)]);
          else bld.quadC(a0, a1, b1, b0, col, cB, cB, col, [wuv(a0), wuv(a1), wuv(b1), wuv(b0)]);
        };
        // last 1.6 m before the barrier: darker (dirt + contact shadow at the rail foot)
        const ao = (j) => side > 0 ? Math.max(ed(j) + 0.3, bd(j) - 3.1) : Math.min(ed(j) - 0.3, bd(j) + 3.1), aoEnd = (j) => bd(j);
        for (let i = 0; i < N; i++) {
          const t = typ[i], bld = RB[t] || RB.gravel;
          let c;
          if (t === 'grass') {
            const stripe = (Math.floor(i * T.ds / 9) % 2) ? 1.1 : 0.88;
            c = cG.clone().multiplyScalar(stripe * (0.94 + 0.12 * vnoise(i * 0.1, side > 0 ? 3 : 7)));
            quad(bld, i, ed, ao, -0.03, -0.05, c);
          } else if (t === 'tarmac') {
            const np = this.D.noPaint, pe = (j) => np ? ed(j) : ed(j) + side * 2.2;
            if (!np) quad(RB.paint, i, ed, pe, -0.02, -0.025, cP.clone().multiplyScalar(0.94 + 0.12 * vnoise(i * 0.3, side)));
            c = cT.clone().multiplyScalar(0.95 + 0.1 * vnoise(i * 0.05, side));
            quad(bld, i, pe, ao, -0.025, -0.045, c);
          } else if ((side > 0 ? T.tarL : T.tarR)[i] > 0) {   // tarmac band beside the track, gravel beyond (Parabolica, Lesmo, Ascari...)
            const tw = (side > 0 ? T.tarL : T.tarR)[i], pe = (j) => ed(j) + side * Math.min(tw, Math.abs(ao(j) - ed(j)));
            quad(RB.tarmac, i, ed, pe, -0.025, -0.045, cT.clone().multiplyScalar(0.95 + 0.1 * vnoise(i * 0.05, side)));
            c = cV; quad(bld, i, pe, ao, -0.03, -0.05, c);
          } else { c = cV; quad(bld, i, ed, ao, -0.03, -0.05, c); }
          quad(bld, i, ao, aoEnd, -0.05, -0.06, c, c.clone().multiplyScalar(0.5));
        }
      }
      const gm = macroVariation(new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.grass }));
      const tm = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.asphalt });
      const vm = macroVariation(new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.gravel }), 0.6);
      const pm = new THREE.MeshLambertMaterial({ vertexColors: true });
      for (const [k, m] of [['grass', gm], ['tarmac', tm], ['gravel', vm], ['paint', pm]]) if (RB[k].p.length) { const mesh = new THREE.Mesh(RB[k].build(), m); mesh.receiveShadow = true; this.group.add(mesh); }
      this.runMats = [gm, tm, vm];
    }

    if (T.esc) this.buildEscape(white);
    // ---- barriers: armco everywhere, concrete walls on the main straight.
    // Right side near the pits: the outer edge of (circuit U pit-lane band); where the pit lane is
    // separated from the circuit a concrete pit wall with debris fence stands at the circuit barrier.
    const armcoMat = this.q === 'bajo' ? new THREE.MeshLambertMaterial({ map: TEX.armco, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map: TEX.armco, side: THREE.DoubleSide, metalness: 0.45, roughness: 0.4, envMapIntensity: 0.9 });
    // thin square beam between two points (fence arms)
    const beam = (bld, a, b, w, col) => {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(w / 2);
      const v = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(w / 2);
      const c = (p, su, sv) => [p[0] + u.x * su + v.x * sv, p[1] + u.y * su + v.y * sv, p[2] + u.z * su + v.z * sv];
      const sq = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (let k = 0; k < 4; k++) { const [s0, t0] = sq[k], [s1, t1] = sq[(k + 1) % 4]; bld.quad(c(a, s0, t0), c(a, s1, t1), c(b, s1, t1), c(b, s0, t0), col); }
    };
    const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const ag = [], wb = new GeoBuilder(false), pwFence = new GeoBuilder(true), catchB = new GeoBuilder(true), topWire = new GeoBuilder(false);
    const postC = col3('#7d848a'), postD = col3('#4a5056');
    const sNom = (i) => ((i % N) + N) % N * T.ds / this.sc;
    const isStraight = (i) => T.isStraightN(sNom(i));
    const hasBand = (i) => T.pitC[((i % N) + N) % N] === T.pitC[((i % N) + N) % N];
    const barD = (side, i) => {
      const k = ((i % N) + N) % N;
      if (side > 0) return T.barL[k];
      return hasBand(k) ? Math.min(-T.barR[k], T.pitC[k] - T.pitHW) : -T.barR[k];
    };
    this.armco = {}; this.barDf = barD;
    for (const side of [1, -1]) {
      const b = new GeoBuilder(true), st = new Int32Array(N).fill(-1);
      for (let i = 0; i < N; i++) {
        const i2 = i + 1;
        const d0 = barD(side, i), d1 = barD(side, i2);
        const bot0 = this.P(i, d0, -0.3), bot1 = this.P(i2, d1, -0.3);
        if (T.inEscape && (T.inEscape(bot0[0], bot0[2]) || T.inEscape(bot1[0], bot1[2]))) continue; // opening for the escape road
        if (isStraight(i)) {
          const top0 = this.P(i, d0, 1.15), top1 = this.P(i2, d1, 1.15);
          const c = (Math.floor(i / 4) % 2) ? col3('#d8dadc') : col3(side > 0 ? '#2f63b8' : '#d8dadc');
          wb.quad(bot0, bot1, top1, top0, c);
          const t0 = this.P(i, d0 + side * 0.3, 1.15), t1 = this.P(i2, d1 + side * 0.3, 1.15);
          wb.quad(top0, top1, t1, t0, col3('#bfc2c5'));
        } else {
          const top0 = this.P(i, d0, 0.78), top1 = this.P(i2, d1, 0.78);
          const u0 = i * T.ds / 4, u1 = i2 * T.ds / 4;
          st[i] = b.p.length / 3;
          b.quad(bot0, bot1, top1, top0, white, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
          // posts behind the rail
          const pp = this.P(i, d0 + side * 0.2, -0.3);
          wb.box(pp[0], pp[1], pp[2], 0.13, 1.0, 0.13, T.hd[i % N], postC);
          // catch fence behind corners with tarmac / gravel run-off
          const k = i % N, typ = side > 0 ? T.typL[k] : T.typR[k], typ2 = side > 0 ? T.typL[(i2) % N] : T.typR[(i2) % N];
          if (typ !== 'grass' && typ2 !== 'grass' && !hasBand(i) && !hasBand(i2)) {
            const e0 = this.P(i, d0 + side * 0.7, -0.3), e1 = this.P(i2, d1 + side * 0.7, -0.3);
            const f0 = this.P(i, d0 + side * 0.7, 3.3), f1 = this.P(i2, d1 + side * 0.7, 3.3);
            const g0 = this.P(i, d0 + side * 0.15, 4.05), g1 = this.P(i2, d1 + side * 0.15, 4.05);
            const v0 = i * T.ds / 1.2, v1 = i2 * T.ds / 1.2;
            catchB.quad(e0, e1, f1, f0, white, [[v0, 0], [v1, 0], [v1, 3.0], [v0, 3.0]]);
            catchB.quad(f0, f1, g1, g0, white, [[v0, 3.0], [v1, 3.0], [v1, 3.78], [v0, 3.78]]);
            if (i % 2 === 0) { wb.box(e0[0], e0[1], e0[2], 0.1, 3.62, 0.1, T.hd[k], postD); beam(topWire, [f0[0], f0[1] - 0.02, f0[2]], g0, 0.08, postD); }
            beam(topWire, g0, g1, 0.03, postD); beam(topWire, f0, f1, 0.025, postD);
          }
        }
      }
      { const geo = b.build(); ag.push(geo); this.armco[side > 0 ? 'L' : 'R'] = { geo, st, side }; }
    }
    this.group.add(new THREE.Mesh(topWire.build(), wallMat));
    { const cm = new THREE.MeshLambertMaterial({ map: TEX.catch, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide }); cm.alphaToCoverage = this.q !== 'bajo'; this.catchMat = cm;
      this.group.add(new THREE.Mesh(catchB.build(), cm)); }
    // pit wall (only where the pit lane is separated from the circuit)
    for (let i = 0; i < N; i++) {
      if (!T.pitSep[i] || !T.pitSep[(i + 1) % N]) continue;
      const i2 = i + 1, d0 = -T.barR[i], d1 = -T.barR[i2 % N];
      const a0 = this.P(i, d0, -0.3), a1 = this.P(i2, d1, -0.3), b0 = this.P(i, d0, 1.1), b1 = this.P(i2, d1, 1.1);
      const c0 = this.P(i, d0 - 0.45, 1.1), c1 = this.P(i2, d1 - 0.45, 1.1), e0 = this.P(i, d0 - 0.45, -0.3), e1 = this.P(i2, d1 - 0.45, -0.3);
      const cc = (Math.floor(i / 6) % 2) ? col3('#e9ebed') : col3('#c8201a');
      wb.quad(a0, a1, b1, b0, cc); wb.quad(b0, b1, c1, c0, col3('#bfc2c5')); wb.quad(e1, e0, c0, c1, col3('#d8dadc'));
      const f0 = this.P(i, d0 - 0.2, 1.1), f1 = this.P(i2, d1 - 0.2, 1.1);
      const u0 = i * T.ds / 3, u1 = i2 * T.ds / 3;
      pwFence.quad(f0, f1, [f1[0], f1[1] + 2.6, f1[2]], [f0[0], f0[1] + 2.6, f0[2]], white, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    }
    // pit wall noses (impact absorbers) at both ends
    for (const iN of [T.pitSepFrom, T.pitSepTo]) {
      if (iN < 0) continue;
      const p = this.P(iN, -T.barR[iN] - 0.25, 0);
      wb.box(p[0], T.e[iN] - 0.3, p[2], 1.6, 1.3, 2.4, T.hd[iN], col3('#f2c230'));
    }
    for (const g of ag) { const am = new THREE.Mesh(g, armcoMat); am.frustumCulled = true; this.group.add(am); }
    this.group.add(new THREE.Mesh(wb.build(), wallMat));
    this.fenceMat = this.fenceMat || new THREE.MeshLambertMaterial({ map: TEX.fence, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
    this.group.add(new THREE.Mesh(pwFence.build(), this.fenceMat));

    // ---- pit lane (band right of the main straight): surface, lane lines, entry/exit lines, boxes
    const bandIdx = []; for (let i = 0; i < N; i++) if (hasBand(i)) bandIdx.push(i);
    // contiguous run across the lap wrap: find the start (a band sample whose predecessor has none)
    let pitA = bandIdx.find(i => !hasBand(i - 1)), pitLen = 0;
    while (hasBand(pitA + pitLen)) pitLen++;
    const pitB = pitA + pitLen - 1;
    this.pitRange = [pitA, pitB];
    const pitMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const pIn = (i) => { const k = i % N; return Math.min(T.pitC[k] + T.pitHW, -T.wr[k] - 0.05); };
    const pOut = (i) => { const k = i % N; return Math.min(T.pitC[k] - T.pitHW, pIn(i) - 0.01); };
    this.group.add(ribbon(pitA, pitB, pIn, pOut, -0.015, -0.015, (i) => col3((Math.floor(i / 3) % 7 === 0) ? '#5d6166' : '#53575c').multiplyScalar(0.95 + 0.1 * vnoise(i * 0.2, 1)), 0, pitMat));
    const plb = new GeoBuilder(false), yel = col3('#f2c230');
    const lineAt = (i, d, w, col) => { const a0 = this.P(i, d - w, 0.004), a1 = this.P(i, d + w, 0.004), b0 = this.P(i + 1, d - w, 0.004), b1 = this.P(i + 1, d + w, 0.004); plb.quad(a0, a1, b1, b0, col); };
    for (let i = pitA; i < pitB; i++) {
      const k = i % N;
      if (T.pitSep[k]) lineAt(i, T.pitC[k] - 0.5, 0.1, white);              // fast lane / working lane
      else if (T.pitC[k] - T.pitHW < -T.wr[k] - 0.4) lineAt(i, -T.wr[k] - 0.35, 0.12, white); // pit entry / exit line
    }
    // speed-limit lines across the lane
    for (const iN of [T.pitSepFrom, T.pitSepTo]) {
      if (iN < 0) continue;
      const pc = T.pitC[iN], s0 = iN * T.ds;
      const q = (ss, dd) => { const p = trackPoint(T, ss, dd); return [p.x, p.e + 0.006, p.z]; };
      plb.quad(q(s0, pc + T.pitHW), q(s0, pc - T.pitHW), q(s0 + 0.4, pc - T.pitHW), q(s0 + 0.4, pc + T.pitHW), white);
    }
    // pit boxes (working lane, in front of the garages)
    this.pitBoxes = [];
    const boxS0 = T.pitSepFrom * T.ds + 30, boxGap = 11.5;
    const boxEnd = (T.pitSepTo < T.pitSepFrom ? T.pitSepTo + N : T.pitSepTo) * T.ds - 25;
    for (let s = boxS0; s < boxEnd && this.pitBoxes.length < 24; s += boxGap) {
      const sw = s % T.L, k = Math.floor(sw / T.ds) % N;
      const d = T.pitC[k] - T.pitHW + 2.6;
      this.pitBoxes.push({ s: sw, d });
      const mk = (ss, dd) => { const p = trackPoint(T, ss, dd); return [p.x, p.e + 0.006, p.z]; };
      const hw = 1.3, hl = 2.8, w = 0.12;
      plb.quad(mk(sw - hl, d - hw), mk(sw - hl, d + hw), mk(sw - hl + w, d + hw), mk(sw - hl + w, d - hw), yel);
      plb.quad(mk(sw + hl - w, d - hw), mk(sw + hl - w, d + hw), mk(sw + hl, d + hw), mk(sw + hl, d - hw), yel);
      plb.quad(mk(sw - hl, d - hw), mk(sw - hl, d - hw + w), mk(sw + hl, d - hw + w), mk(sw + hl, d - hw), yel);
      plb.quad(mk(sw - hl, d + hw - w), mk(sw - hl, d + hw), mk(sw + hl, d + hw), mk(sw + hl, d + hw - w), yel);
    }
    this.group.add(new THREE.Mesh(plb.build(), lineMat));

    // ---- finish line (timing line, s = 0) and start line + grid (ahead of the finish line)
    const sb = new GeoBuilder(true);
    {
      const pA = trackPoint(T, 0, -T.wr[0]), pB = trackPoint(T, 0, T.wl[0]), pC = trackPoint(T, 1.2, T.wl[0]), pD = trackPoint(T, 1.2, -T.wr[0]);
      sb.quad([pA.x, pA.e + 0.012, pA.z], [pD.x, pD.e + 0.012, pD.z], [pC.x, pC.e + 0.012, pC.z], [pB.x, pB.e + 0.012, pB.z], white, [[0, 0], [0, 1], [8, 1], [8, 0]]);
    }
    this.group.add(new THREE.Mesh(sb.build(), new THREE.MeshLambertMaterial({ map: TEX.checker, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
    const gb = new GeoBuilder(false);
    const mk = (ss, d) => { const p = trackPoint(T, ss, d); return [p.x, p.e + 0.012, p.z]; };
    const SN = this.D.startS, S0 = this.startS = SN * this.sc;
    gb.quad(mk(S0, -T.wr[this.idx(SN)] + 0.3), mk(S0, T.wl[this.idx(SN)] - 0.3), mk(S0 + 0.5, T.wl[this.idx(SN)] - 0.3), mk(S0 + 0.5, -T.wr[this.idx(SN)] + 0.3), white);
    this.gridSlots = [];
    for (let k = 0; k < 23; k++) {
      const s = S0 - 7 - 8 * k, dC = (k % 2 ? -1 : 1) * 2.8;
      this.gridSlots.push({ s, d: dC });
      const f = s + 2.2; // slot front line (car centre 2.2 m behind)
      gb.quad(mk(f, dC - 1.5), mk(f, dC + 1.5), mk(f + 0.3, dC + 1.5), mk(f + 0.3, dC - 1.5), white);
      gb.quad(mk(f - 1.6, dC - 1.5), mk(f, dC - 1.5), mk(f, dC - 1.2), mk(f - 1.6, dC - 1.2), white);
      gb.quad(mk(f - 1.6, dC + 1.2), mk(f, dC + 1.2), mk(f, dC + 1.5), mk(f - 1.6, dC + 1.5), white);
    }
    // Bus Stop braking reference: a solid white line across the track under the banner bridge
    if (this.D.brakeBanner) { const sB = this.busBrakeS = this.D.brakeBanner.s * this.sc, k = Math.round(sB / T.ds) % N;
      gb.quad(mk(sB, -T.wr[k] + 0.05), mk(sB, T.wl[k] - 0.05), mk(sB + 0.45, T.wl[k] - 0.05), mk(sB + 0.45, -T.wr[k] + 0.05), white); }
    const gridMesh = new THREE.Mesh(gb.build(), lineMat); this.group.add(gridMesh);
  }

  // escape road lane (tarmac with edge lines) + foam blocks; the blocks are separate meshes so they can be knocked
  buildEscape(white) {
    const T = this.T, E = T.esc, pts = E.pts, hw = E.hw;
    const b = new GeoBuilder(true), sk = new GeoBuilder(false), ln = new GeoBuilder(false);
    const cT = new THREE.Color(1.35, 1.35, 1.4), cS = col3('#3d4a33');
    const side = (j, o, dy) => { const p = pts[j], q = pts[Math.min(j + 1, pts.length - 1)], r = pts[Math.max(j - 1, 0)]; let tx = q[0] - r[0], tz = q[1] - r[1]; const l = Math.hypot(tx, tz); tx /= l; tz /= l; return [p[0] + tz * o, p[2] + (dy || 0), p[1] - tx * o]; };
    for (let j = 0; j < pts.length - 1; j++) {
      const a0 = side(j, hw, 0.035), a1 = side(j, -hw, 0.035), b0 = side(j + 1, hw, 0.035), b1 = side(j + 1, -hw, 0.035);
      const uv = (p) => [p[0] / 9, p[2] / 9];
      b.quad(a0, b0, b1, a1, cT, [uv(a0), uv(b0), uv(b1), uv(a1)]);
      for (const o of [hw, -hw]) { const c0 = side(j, o, 0.035), c1 = side(j + 1, o, 0.035), d0 = side(j, o * 1.04, -1.2), d1 = side(j + 1, o * 1.04, -1.2); sk.quad(c0, c1, d1, d0, cS); sk.quad(c0, d0, d1, c1, cS); }
      for (const o of [hw - 0.3, -hw + 0.3]) { const e0 = side(j, o + 0.12, 0.045), e1 = side(j, o - 0.12, 0.045), f0 = side(j + 1, o + 0.12, 0.045), f1 = side(j + 1, o - 0.12, 0.045); ln.quad(e0, f0, f1, e1, white); ln.quad(e0, e1, f1, f0, white); }
      if (j % 3 === 0) this.footprints.push([pts[j][0], pts[j][1], hw + 4]);
    }
    const lane = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.asphalt, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    lane.receiveShadow = true; this.group.add(lane);
    this.group.add(new THREE.Mesh(sk.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.group.add(new THREE.Mesh(ln.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
    // rails along both edges of the lane (the physics holds the car at hw)
    { const rl = new GeoBuilder(false), pb = new GeoBuilder(false), cR = col3('#d6d9dc'), cP = col3('#7d848a');
      for (let j = 0; j < pts.length - 1; j++) for (const o of [hw + 0.05, -hw - 0.05]) {
        { const m = side(j, o, 0), q = T.project(m[0], m[2], -1); if (q.d < q.wl + 0.8 && q.d > -(q.wr + 0.8)) continue; }   // no rail across the circuit itself
        const a = side(j, o, -0.2), b = side(j + 1, o, -0.2), a2 = side(j, o, 0.78), b2 = side(j + 1, o, 0.78);
        rl.quad(a, b, b2, a2, cR); rl.quad(b, a, a2, b2, cR);
        if (j % 3 === 0) { const pp = side(j, o + Math.sign(o) * 0.2, -0.3); pb.box(pp[0], pp[1], pp[2], 0.13, 1.0, 0.13, 0, cP); }
      }
      const rm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      this.group.add(new THREE.Mesh(rl.build(), rm)); this.group.add(new THREE.Mesh(pb.build(), rm)); }
    // foam blocks: white with red bands, each its own mesh
    const tex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#d12a1f'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(k * 32 + 8, 0); g.lineTo(k * 32 + 24, 0); g.lineTo(k * 32 + 16, 32); g.lineTo(k * 32, 32); g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.escBlocks = E.blocks.map(bl => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bl.hx * 2, 1.0, bl.hz * 2), mat); m.castShadow = true;
      this.group.add(m); return m;
    });
    this.updateEscape(0);
  }
  updateEscape(dt) {
    const E = this.T.esc; if (!E || !this.escBlocks) return;
    if (dt) E.update(dt);
    E.blocks.forEach((bl, k) => { const m = this.escBlocks[k]; m.position.set(bl.x, bl.e + 0.5 + bl.y, bl.z); m.rotation.set(bl.tilt || 0, bl.h, 0, 'YXZ'); });
  }

  // ---------------------------------------------------------------------
  buildTerrain() {
    const T = this.T, N = T.N;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < N; i++) { minX = Math.min(minX, T.x[i]); maxX = Math.max(maxX, T.x[i]); minZ = Math.min(minZ, T.z[i]); maxZ = Math.max(maxZ, T.z[i]); }
    const pad = 800;
    const x0 = minX - pad, x1 = maxX + pad, z0 = minZ - pad, z1 = maxZ + pad;
    const step = this.q === 'bajo' ? 20 : 14;
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
    const cnt = nx * nz;
    const dist = new Float32Array(cnt).fill(1e9), eNear = new Float32Array(cnt), barNear = new Float32Array(cnt), iNear = new Int32Array(cnt);
    const R = 170, rc = Math.ceil(R / step);
    // flat ground under the grandstands (depth measured from the barrier)
    const standDepthL = new Float32Array(N), standDepthR = new Float32Array(N);
    for (const [sA, sB, side, gap, tiers] of this.D.stands) {
      const iA = this.idx(sA) - 6, iB = this.idx(sB) + (sB < sA ? N : 0) + 6;
      for (let i = iA; i <= iB; i++) { const k = ((i % N) + N) % N, arr = side > 0 ? standDepthL : standDepthR; arr[k] = Math.max(arr[k], gap + tiers * 0.95 + 5); }
    }
    for (let i = 0; i < N; i += 2) {
      const cx = Math.round((T.x[i] - x0) / step), cz = Math.round((T.z[i] - z0) / step);
      for (let a = -rc; a <= rc; a++) for (let b = -rc; b <= rc; b++) {
        const gx = cx + a, gz = cz + b; if (gx < 0 || gz < 0 || gx >= nx || gz >= nz) continue;
        const k = gz * nx + gx, px = x0 + gx * step, pz = z0 + gz * step;
        const d = Math.hypot(px - T.x[i], pz - T.z[i]);
        if (d < dist[k]) {
          dist[k] = d; eNear[k] = T.e[i]; iNear[k] = i;
          const side = (px - T.x[i]) * T.nx[i] + (pz - T.z[i]) * T.nz[i];
          barNear[k] = side >= 0 ? T.barL[i] + standDepthL[i] : Math.max(T.barR[i] + standDepthR[i], T.pitC[i] === T.pitC[i] ? -(T.pitC[i] - T.pitHW) + 55 : 0);
        }
      }
    }
    // regional base elevation (inverse distance weighting over the circuit)
    const samp = []; for (let i = 0; i < N; i += 12) samp.push(i);
    const spa = this.D.id === 'spa', hillAmp = this.SC.hills;
    const creekI = this.idx(spa ? 1065 : 0), creekP = [T.x[creekI], T.z[creekI]], creekDir = [T.tx[creekI] * 0.25 + T.nx[creekI], T.tz[creekI] * 0.25 + T.nz[creekI]];
    const cl = Math.hypot(creekDir[0], creekDir[1]); creekDir[0] /= cl; creekDir[1] /= cl;
    this.creek = { p: creekP, dir: creekDir, e: T.e[creekI] };
    const H = new Float32Array(cnt), C = new Float32Array(cnt * 3);
    // optional lake: signed distance to the outline (>0 inside); the water plane sits just under the surrounding ground
    let lake = null, lakeEdge = null;
    if (this.SC.lake) {
      const poly = this.SC.lake; let eMin = 1e9; for (let i = 0; i < N; i++) eMin = Math.min(eMin, T.e[i]);
      lake = this.lake = { y: eMin - 3.4, poly };
      lakeEdge = (x, z) => {
        let inside = false, dm = 1e9;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, zi] = poly[i], [xj, zj] = poly[j];
          if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
          const ex = xj - xi, ez = zj - zi, t = clamp(((x - xi) * ex + (z - zi) * ez) / (ex * ex + ez * ez), 0, 1);
          dm = Math.min(dm, Math.hypot(x - xi - ex * t, z - zi - ez * t));
        }
        return inside ? dm : -dm;
      };
    }
    const grass = col3('#577542'), grassDark = col3('#405a30'), field = col3('#8a9a5a'), mown = col3('#627d43'), forest = col3('#2f3f25');
    for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
      const k = gz * nx + gx, px = x0 + gx * step, pz = z0 + gz * step;
      let base;
      { let ws = 0, es = 0; for (const i of samp) { const d2 = (px - T.x[i]) ** 2 + (pz - T.z[i]) ** 2 + 90 * 90; const w = 1 / (d2 * d2); ws += w; es += w * T.e[i]; } base = es / ws; }
      const dN = dist[k];
      const hills = (fbm(px / 520, pz / 520, 4) - 0.45) * hillAmp + (fbm(px / 140 + 10, pz / 140, 3) - 0.5) * 14 * hillAmp / 95;
      const amp = smoothstep(40, 700, Math.min(dN, 1e4));
      const natural = base + hills * amp - 2;
      let h;
      if (dN > 1e8) h = natural;
      else {
        const nearH = eNear[k] - (dN < barNear[k] + 0.5 ? 1.6 : 0.4);
        const t = smoothstep(barNear[k] + 3, barNear[k] + 70, dN);
        const bank = (dN - barNear[k]) * 0.04 * (fbm(px / 60, pz / 60, 2) - 0.5);
        h = lerp(nearH, lerp(eNear[k] - 0.4 + bank, natural, smoothstep(barNear[k] + 25, barNear[k] + 220, dN)), t);
      }
      // lake (Albert Park): carve a basin where the point is well inside the outline and away from the track
      if (lake) {
        const ed = lakeEdge(px, pz);
        if (ed > 0 && dN > 24) { const w = smoothstep(0, 34, ed) * smoothstep(24, 50, Math.min(dN, 1e4)); h = lerp(h, lake.y - 2.6, w); }
      }
      // Eau Rouge creek carving
      const rx = px - creekP[0], rz = pz - creekP[1];
      const along = rx * creekDir[0] + rz * creekDir[1], perp = Math.abs(-rx * creekDir[1] + rz * creekDir[0]);
      if (spa && Math.abs(along) < 520 && dN > 12) {
        const bed = this.creek.e - 2.2 + Math.abs(along) * 0.02;
        h = Math.min(h, bed + perp * 0.18);
      }
      // escape road (Monza T1): the ground under and beside the flat lane never pokes through it
      if (T.esc && T.inEscape) { const E = T.esc; if (px > E.box[0] - 6 && px < E.box[1] + 6 && pz > E.box[2] - 6 && pz < E.box[3] + 6) { const nr = E.near(px, pz);
        if (nr[0] < E.hw + 6) { const ly = E.yAt(px, pz); h = Math.min(h, ly - 0.25 - Math.max(0, nr[0] - E.hw) * 0.15); } } }
      H[k] = h;
      // colours
      const f = fbm(px / 300 + 50, pz / 300, 3);
      let c;
      if (dN < 45) c = mown.clone().multiplyScalar(0.92 + 0.14 * vnoise(px / 9, pz / 9));
      else if (f < 0.4) c = field.clone().lerp(grass, vnoise(px / 80, pz / 80) * 0.6);
      else c = grass.clone().lerp(grassDark, smoothstep(0.45, 0.62, f)).multiplyScalar(0.9 + 0.15 * vnoise(px / 25, pz / 25));
      // forest floor (same density field the trees use): darker, browner under the canopy
      const dens = fbm(px / 330, pz / 330, 3) + (dN < 140 ? 0.08 : 0);
      if (dN > 30) c.lerp(forest, smoothstep(this.SC.dens - 0.02, this.SC.dens + 0.09, dens) * smoothstep(30, 60, dN) * 0.85);
      C[k * 3] = c.r; C[k * 3 + 1] = c.g; C[k * 3 + 2] = c.b;
    }
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx - 1, nz - 1);
    geo.rotateX(-Math.PI / 2);
    const pa = geo.attributes.position;
    // PlaneGeometry after rotation: rows along +z? vertex order: iy (0..nz-1) from top (z min after rot) to bottom
    for (let iy = 0; iy < nz; iy++) for (let ix = 0; ix < nx; ix++) {
      const v = iy * nx + ix; const k = iy * nx + ix;
      pa.setXYZ(v, x0 + ix * step, H[k], z0 + iy * step);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.computeVertexNormals();
    { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / 9, uv.getY(i) * (z1 - z0) / 9); }
    for (let i = 0; i < C.length; i++) C[i] = Math.min(1, C[i] * 1.13);
    const mesh = new THREE.Mesh(geo, macroVariation(new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.grass })));
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.terrain = { x0, z0, step, nx, nz, H, dist, x1, z1 };
    if (lake) {
      let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, z] of lake.poly) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, z); d = Math.max(d, z); }
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(c - a + 80, d - b + 80).rotateX(-Math.PI / 2).translate((a + c) / 2, lake.y, (b + d) / 2),
        new THREE.MeshPhongMaterial({ color: 0x2f6a7d, shininess: 120, specular: 0x6f8f9a, transparent: true, opacity: 0.93 }));
      wm.renderOrder = 1; this.group.add(wm);
    }

    // creek water
    if (!spa) return;
    const wb = new GeoBuilder(false), wc = col3('#3d6a7a');
    for (let t = -500; t < 500; t += 10) {
      const p0 = [creekP[0] + creekDir[0] * t, creekP[1] + creekDir[1] * t], p1 = [creekP[0] + creekDir[0] * (t + 10), creekP[1] + creekDir[1] * (t + 10)];
      const nxw = -creekDir[1] * 1.6, nzw = creekDir[0] * 1.6;
      const y0 = this.creek.e - 1.6 + Math.abs(t) * 0.02, y1 = this.creek.e - 1.6 + Math.abs(t + 10) * 0.02;
      wb.quad([p0[0] - nxw, y0, p0[1] - nzw], [p0[0] + nxw, y0, p0[1] + nzw], [p1[0] + nxw, y1, p1[1] + nzw], [p1[0] - nxw, y1, p1[1] - nzw], wc);
    }
    const water = new THREE.Mesh(wb.build(), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80, specular: 0x557788, side: THREE.DoubleSide }));
    this.group.add(water);
  }
  heightAt(x, z) {
    const t = this.terrain; if (!t) return 0;
    const fx = (x - t.x0) / t.step, fz = (z - t.z0) / t.step;
    const ix = clamp(Math.floor(fx), 0, t.nx - 2), iz = clamp(Math.floor(fz), 0, t.nz - 2);
    const ax = clamp(fx - ix, 0, 1), az = clamp(fz - iz, 0, 1);
    const h00 = t.H[iz * t.nx + ix], h10 = t.H[iz * t.nx + ix + 1], h01 = t.H[(iz + 1) * t.nx + ix], h11 = t.H[(iz + 1) * t.nx + ix + 1];
    return lerp(lerp(h00, h10, ax), lerp(h01, h11, ax), az);
  }
  distAt(x, z) {
    const t = this.terrain; const ix = Math.round((x - t.x0) / t.step), iz = Math.round((z - t.z0) / t.step);
    if (ix < 0 || iz < 0 || ix >= t.nx || iz >= t.nz) return 1e9; return t.dist[iz * t.nx + ix];
  }

  // ---------------------------------------------------------------------
  buildLandmarks() {
    const T = this.T, N = T.N;
    const B = new GeoBuilder(false);
    const crowdB = new GeoBuilder(true);
    const fenceB = new GeoBuilder(true);
    const C = {
      concrete: col3('#9ea3a8'), dark: col3('#2b2f35'), white: col3('#e9ebed'), glass: col3('#2c3e50'), roof: col3('#d0d3d6'),
      steel: col3('#6f767d'), red: col3('#c0392b'), yellow: col3('#f2c230'), blue: col3('#2f63b8'), wall: col3('#ece6da'), tile: col3('#7b3a2a'), slate: col3('#4a4f57')
    };
    const addFP = (x, z, r) => this.footprints.push([x, z, r]);

    // grandstand along the track
    const grandstand = (sA, sB, side, gap, tiers, roof) => {
      const iA = this.idx(sA), iB = this.idx(sB) + (sB < sA ? N : 0);
      for (let i = iA; i < iB; i += 4) {
        const k = i % N, k2 = (i + 4) % N;
        const bar = side > 0 ? T.barL[k] : T.barR[k];
        const d0 = side * (bar + gap);
        const h = T.hd[k];
        const segLen = T.ds * 4 + 0.3;
        const base = T.e[k] - 0.2;
        for (let t = 0; t < tiers; t++) {
          const d = d0 + side * (t * 0.95 + 0.5);
          const p = this.P(k + 2, d, 0);
          B.box(p[0], base - 5, p[2], 0.95, 5 + 0.45 * (t + 1), segLen, h, t % 2 ? C.concrete : col3('#8c9196'));
        }
        // crowd surface (sloped)
        const a0 = this.P(k, d0 + side * 0.05, 0.5), a1 = this.P(k, d0 + side * (tiers * 0.95), 0.5 + tiers * 0.45);
        const b0 = this.P(k2, d0 + side * 0.05, 0.5), b1 = this.P(k2, d0 + side * (tiers * 0.95), 0.5 + tiers * 0.45);
        for (const q of [a0, a1, b0, b1]) q[1] = base + (q[1] - T.e[k]) + 0.02;
        const u0 = (i - iA) * 0.12, u1 = u0 + 0.48;
        if (side > 0) crowdB.quad(a0, b0, b1, a1, C.white, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
        else crowdB.quad(a0, a1, b1, b0, C.white, [[u0, 0], [u0, 1], [u1, 1], [u1, 0]]);
        // back wall + roof
        const pb = this.P(k + 2, d0 + side * (tiers * 0.95 + 0.3), 0);
        B.box(pb[0], base, pb[2], 0.4, 1.2 + tiers * 0.45 + (roof ? 3.2 : 1), segLen, h, C.concrete);
        if (roof) {
          const pr = this.P(k + 2, d0 + side * (tiers * 0.95 * 0.5), 0);
          B.box(pr[0], base + tiers * 0.45 + 3.6, pr[2], tiers * 0.95 + 1.4, 0.25, segLen, h, C.roof);
        }
        const pc = this.P(k + 2, d0 + side * tiers * 0.5, 0); addFP(pc[0], pc[2], tiers * 0.6 + 8);
        // catch fence in front of the stand
        const f0 = this.P(k, side * (bar + 0.1), 0.75), f1 = this.P(k2, side * ((side > 0 ? T.barL[k2] : T.barR[k2]) + 0.1), 0.75);
        const g0 = [f0[0], f0[1] + 3.2, f0[2]], g1 = [f1[0], f1[1] + 3.2, f1[2]];
        fenceB.quad(f0, f1, g1, g0, C.white, [[0, 0], [2, 0], [2, 1], [0, 1]]);
      }
    };
    for (const g of this.D.stands) grandstand(...g);

    // ---- pit building + paddock (right of main straight)
    // a footprint must stay clear of every OTHER part of the circuit (tight venues such as Tocancipa run a section right behind the pits)
    const farTrack = (x, z, kSelf, pad) => { const skip = Math.ceil(70 / T.ds);
      for (let i = 0; i < N; i++) { let di = Math.abs(i - (kSelf % N)) % N; di = Math.min(di, N - di); if (di < skip) continue;
        const dx = x - T.x[i], dz = z - T.z[i], lim = Math.max(T.wl[i], T.wr[i]) + pad; if (dx * dx + dz * dz < lim * lim) return true; } return false; };
    const footHits = (k, i0, i1, dA, dB, pad) => { for (let u = i0; u <= i1; u++) for (let d = dA; d >= dB - 0.01; d -= Math.max(1.5, (dA - dB) / 6)) { const p = this.P((k + u + N) % N, d, 0); if (farTrack(p[0], p[2], k, pad)) return true; } return false; };
    let iF = T.pitSepFrom, iT = T.pitSepTo; if (iT < iF) iT += N;
    const TEAM = ['#c8120c', '#1b3a6b', '#f28c28', '#0f5c4a', '#2f63b8', '#f4f4f4', '#5b1a8f', '#1f9a3a', '#f6c21c', '#2a2d31'];
    for (let i = iF + 2; i < iT - 2; i += 4) {
      const k = i % N, h = T.hd[k];
      const dOut = T.pitC[k] - T.pitHW - 0.4;
      const p = this.P(k + 2, dOut - 9, 0), len = T.ds * 4 + 0.2;
      const base = T.e[k] - 0.3;
      if (!footHits(k, 0, 4, dOut, dOut - 19.5, 3)) {
        B.box(p[0], base, p[2], 18, 4.6, len, h, C.white);
        B.box(p[0], base + 4.6, p[2], 18, 3.2, len, h, C.glass);
        B.box(p[0], base + 7.8, p[2], 20.5, 0.5, len + 0.1, h, C.roof);
        addFP(p[0], p[2], 20); }
      const pd = this.P(k + 2, dOut - 42, 0);
      if (i % 12 === 0 && !footHits(k, 1, 3, dOut - 35, dOut - 49, 3)) { B.box(pd[0], base, pd[2], 14, 4 + (i % 2), 11, h + 0.1, (i % 24 === 0) ? C.white : col3('#c9ccd0')); addFP(pd[0], pd[2], 26); }
    }
    // garage openings behind each pit box (team colour header)
    (this.pitBoxes || []).forEach((bx, n) => {
      const k = Math.floor(bx.s / T.ds) % N, h = T.hd[k];
      const dOut = T.pitC[k] - T.pitHW - 0.4;
      const p = trackPoint(T, bx.s, dOut + 0.05), base = T.e[k] - 0.3;
      B.box(p.x, base, p.z, 0.2, 3.9, 8.5, h, C.dark);
      const p2 = trackPoint(T, bx.s, dOut + 0.12);
      B.box(p2.x, base + 3.95, p2.z, 0.2, 0.55, 9.5, h, col3(TEAM[Math.floor(n / 2) % TEAM.length]));
    });
    // race control tower
    { const k = this.idx(60); const p = this.P(k, T.pitC[k] - T.pitHW - 12, 0); if (!footHits(k, -2, 2, T.pitC[k] - T.pitHW - 4, T.pitC[k] - T.pitHW - 20, 3)) { B.box(p[0], T.e[k] - 0.3, p[2], 16, 17, 22, T.hd[k], C.white); B.box(p[0], T.e[k] + 12, p[2], 16.4, 3.5, 22.4, T.hd[k], C.glass); } }
    // pit exit traffic light
    {
      const k = T.pitSepTo, p = this.P(k, -T.barR[k] - 0.3, 0);
      B.box(p[0], T.e[k] - 0.3, p[2], 0.3, 3.2, 0.3, T.hd[k], C.steel);
      this.pitLightMat = new THREE.MeshBasicMaterial({ color: 0x18c040 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.3), this.pitLightMat);
      const q = this.P(k, -T.barR[k] - 0.3, 3.3); m.position.set(q[0], q[1], q[2]); m.rotation.y = T.hd[k];
      this.group.add(m);
    }
    // ---- start gantry with lights (over the start line, ahead of the finish line)
    const SG = (this.startS || 0) + 0.8;
    {
      const p = trackPoint(T, SG, 0), h = p.h, i0 = Math.round(SG / T.ds) % N;
      const wl = T.wl[i0] + 1.8, wr = T.wr[i0] + 1.8;
      const pl = trackPoint(T, SG, wl), pr = trackPoint(T, SG, -wr);
      B.box(pl.x, pl.e, pl.z, 0.8, 8.4, 0.8, h, C.steel);
      B.box(pr.x, pr.e, pr.z, 0.8, 8.4, 0.8, h, C.steel);
      this.lightMats = [];
      for (let j = 0; j < 5; j++) {
        const m = new THREE.MeshBasicMaterial({ color: 0x2a0606 });
        this.lightMats.push(m);
        for (const dd of [-1, 1]) {
          const q = trackPoint(T, SG - 0.6, (2 - j) * 1.1);
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.12), m);
          mesh.position.set(q.x, q.e + (dd > 0 ? 7.45 : 6.85), q.z); mesh.rotation.y = h;
          this.group.add(mesh);
        }
      }
      const p0 = pl, p1 = pr;
      const mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2, len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const ang = Math.atan2(p1.x - p0.x, p1.z - p0.z);
      B.box(mx, p0.e + 7.9, mz, 0.9, 0.6, len + 0.8, ang, C.dark);
      B.box(mx, p0.e + 6.5, mz, 0.5, 0.25, len, ang, C.steel);
    }

    // ---- Bus Stop: banner bridge over the braking zone (the white line is painted under it)
    if (this.D.brakeBanner) {
      const sB = this.busBrakeS, k = Math.round(sB / T.ds) % N;
      const pl = trackPoint(T, sB, T.barL[k] + 1.2), pr = trackPoint(T, sB, -(T.barR[k] + 1.2)), y0 = T.e[k];
      for (const pp of [pl, pr]) { B.box(pp.x, y0 - 1, pp.z, 0.7, 8.2, 0.7, pp.h, C.steel); B.box(pp.x, y0 - 1, pp.z, 1.4, 0.9, 1.4, pp.h, C.concrete); }
      const mx = (pl.x + pr.x) / 2, mz = (pl.z + pr.z) / 2, len = Math.hypot(pr.x - pl.x, pr.z - pl.z), ang = Math.atan2(pr.x - pl.x, pr.z - pl.z);
      B.box(mx, y0 + 7.0, mz, 0.35, 0.3, len + 0.7, ang, C.steel); B.box(mx, y0 + 4.9, mz, 0.35, 0.3, len + 0.7, ang, C.steel);
      const tex = textTex(this.D.brakeBanner.text, { w: 1024, h: 96, bg: '#173a7a', fg: '#ffffff', size: 70, border: '#f2c230', bw: 5 });
      tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = Math.max(1, Math.round(len / 13));
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.75), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      ban.position.set(mx, y0 + 5.95, mz); ban.rotation.y = pl.h + Math.PI; this.group.add(ban);
      addFP(pl.x, pl.z, 5); addFP(pr.x, pr.z, 5);
    }
    // ---- Kemmel footbridge
    for (const [sN, bcol] of this.D.bridges) {
      const k = this.idx(sN), h = T.hd[k];
      const dl = T.barL[k] + 2, dr = -(T.barR[k] + 2);
      const pl = this.P(k, dl, 0), pr = this.P(k, dr, 0), pm = this.P(k, (dl + dr) / 2, 0);
      B.box(pl[0], T.e[k] - 1, pl[2], 3, 8.2, 3, h, C.concrete);
      B.box(pr[0], T.e[k] - 1, pr[2], 3, 8.2, 3, h, C.concrete);
      B.box(pm[0], T.e[k] + 6.6, pm[2], dl - dr + 3, 0.5, 3, h + Math.PI / 2 * 0, C.concrete);
      const ang = h + Math.PI / 2;
      B.box(pm[0], T.e[k] + 6.6, pm[2], 3, 0.5, dl - dr + 3, ang, C.concrete);
      B.box(pm[0], T.e[k] + 7.1, pm[2], 0.3, 1.6, dl - dr + 3, ang, col3(bcol));
      addFP(pl[0], pl[2], 6); addFP(pr[0], pr[2], 6);
    }

    // ---- La Source hotel/restaurant (outside of the hairpin)
    if (this.D.id === 'spa') {
      const k = this.idx(405); const p = this.P(k, T.barL[k] + 26, 0), h = T.hd[k];
      const y = this.heightAt(p[0], p[2]);
      B.box(p[0], y - 2, p[2], 13, 9, 30, h + 0.4, C.wall);
      B.gable(p[0], y + 7, p[2], 30, 4, 13.5, h + 0.4 + Math.PI / 2, C.slate, C.wall);
      addFP(p[0], p[2], 24);
    }
    // ---- marshal posts
    for (let s = 150; s < T.nom; s += 330) {
      const k = this.idx(s), side = (Math.floor(s / 330) % 2) ? 1 : -1;
      const bar = side > 0 ? T.barL[k] : T.barR[k];
      const p = this.P(k, side * (bar + 2.2), 0);
      B.box(p[0], T.e[k] - 0.3, p[2], 2.2, 2.6, 2.2, T.hd[k], C.white, col3('#e67e22'));
    }
    // ---- Francorchamps village (north of La Source)
    if (this.D.id === 'spa') {
      const k = this.idx(400), cx = T.x[k] - 60, cz = T.z[k] - 330;
      let placed = 0;
      for (let n = 0; n < 400 && placed < (this.q === 'bajo' ? 25 : 55); n++) {
        const x = cx + (rand() - 0.5) * 520, z = cz + (rand() - 0.5) * 360;
        if (this.distAt(x, z) < 70) continue;
        const y = this.heightAt(x, z);
        const w = 7 + rand() * 6, d = 8 + rand() * 7, hh = 5 + rand() * 2.5, rot = rand() * Math.PI;
        B.box(x, y - 1.5, z, w, hh + 1.5, d, rot, rand() < 0.5 ? C.wall : col3('#d8d2c4'));
        B.gable(x, y + hh, z, w + 0.6, 3 + rand(), d + 0.6, rot, rand() < 0.55 ? C.slate : C.tile, C.wall);
        addFP(x, z, Math.max(w, d) * 0.9 + 4);
        placed++;
      }
      addFP(cx, cz, 60);
    }
    // ---- paddock car park / hospitality cluster near Eau Rouge exit (inside)
    for (let n = 0; n < (this.D.id === 'spa' ? 10 : 0); n++) {
      const k = this.idx(700 + n * 25), p = this.P(k, -(T.barR[k] + 38 + (n % 3) * 16), 0);
      const y = this.heightAt(p[0], p[2]);
      B.box(p[0], y - 1, p[2], 12, 4, 14, T.hd[k], n % 2 ? C.white : col3('#c7cbd0'));
      addFP(p[0], p[2], 12);
    }

    if (this.SC.oval) this.buildOval(B, C, addFP);
    if (this.SC.skyline) this.buildSkyline();
    if (this.SC.podium) {
      // Monza podium: platform cantilevered from the pit building over the pit lane and the edge of the track
      const k = this.idx(T.nom - 70), h = T.hd[k], y0 = T.e[k];
      const dIn = -T.wr[k] + 4.5, dOut = T.pitC[k] - T.pitHW - 9, w = dIn - dOut;
      const pm = this.P(k, (dIn + dOut) / 2, 0), pb = this.P(k, dOut - 2, 0);
      B.box(pm[0], y0 + 9.2, pm[2], w, 0.9, 14, h, C.white, C.roof);
      B.box(pm[0], y0 + 10.1, pm[2], w, 1.1, 14, h, C.glass);
      const pe = this.P(k, dIn - 0.3, 0); B.box(pe[0], y0 + 8.6, pe[2], 0.6, 0.6, 14.4, h, col3('#c0392b'));
      B.box(pb[0], y0 - 0.3, pb[2], 6, 13, 16, h, C.white);
      const tex = textTex('MONZA', { w: 512, h: 96, bg: '#c0392b', fg: '#ffffff', size: 70 });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.5), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      const ps = this.P(k, dIn - 0.62, 0); sign.position.set(ps[0], y0 + 8.75, ps[2]); sign.rotation.y = h + Math.PI / 2; this.group.add(sign);
      addFP(pb[0], pb[2], 12);
    }
    const bm = new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    bm.castShadow = false; bm.receiveShadow = true;
    this.group.add(bm);
    this.group.add(new THREE.Mesh(crowdB.build(), new THREE.MeshLambertMaterial({ map: TEX.crowd, side: THREE.DoubleSide })));
    this.group.add(new THREE.Mesh(fenceB.build(), new THREE.MeshLambertMaterial({ map: TEX.fence, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide })));

    // ---- corner name boards and braking boards
    const signMat = {};
    for (const c of T.corners) {
      if (!c.name || c.noBoard) continue;
      const k = this.idx(c.s - 60);
      const side = T.k[this.idx(c.s)] > 0 ? -1 : 1; // outside of the corner
      const bar = side > 0 ? T.barL[k] : T.barR[k];
      const p = this.P(k, side * (bar + 3.5), 0);
      const tex = textTex(c.name.toUpperCase(), { w: 512, h: 96, bg: '#14171b', fg: '#f6c21c', size: Math.min(62, Math.floor(820 / Math.max(1, c.name.length))), border: '#f6c21c', bw: 5 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.7), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: true }));
      const y = Math.max(T.e[k], this.heightAt(p[0], p[2]));
      m.position.set(p[0], y + 3.6, p[2]);
      m.rotation.y = T.hd[k] + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (side > 0 ? 0.55 : -0.55);
      this.group.add(m);
      B.box(p[0], y - 1, p[2], 0.25, 4, 0.25, 0, C.steel);
      addFP(p[0], p[2], 6);
    }
    const boardTex = { 150: textTex('150', { w: 128, h: 128, size: 70 }), 100: textTex('100', { w: 128, h: 128, size: 70 }), 50: textTex('50', { w: 128, h: 128, size: 80 }) };
    const boardGeo = new THREE.PlaneGeometry(1.4, 1.4);
    for (const turnIn of this.D.boards) {
      for (const dist of [150, 100, 50]) {
        const k = this.idx(turnIn - dist);
        // beside the edge of the track, on the outside of the braking zone's corner (the side the driver looks at): inside the run-off, in front of the barrier
        const kc = this.idx(turnIn + 14), side = T.k[kc] > 0 ? -1 : 1;
        const lim = (side > 0 ? T.barL[k] : T.barR[k]) - 1.2, edge = (side > 0 ? T.wl[k] : T.wr[k]);
        const p = this.P(k, side * Math.min(edge + 4.2, Math.max(edge + 1.5, lim)), 0);
        const m = new THREE.Mesh(boardGeo, new THREE.MeshBasicMaterial({ map: boardTex[dist], side: THREE.DoubleSide }));
        m.position.set(p[0], T.e[k] + 1.9, p[2]); m.rotation.y = T.hd[k] + Math.PI;
        B.box(p[0], T.e[k] - 0.1, p[2], 0.08, 1.2, 0.08, 0, C.steel);
        this.group.add(m);
      }
    }
    // re-build the post boxes added after the first build
    const extra = new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.remove(bm); bm.geometry.dispose();
    this.group.add(extra);
  }

  // ---------------------------------------------------------------------
  // Monza's old banked oval (Sopraelevata, 1955): two straights and two steep concrete bankings.
  // The home straight is the circuit's own main straight; the north banking starts where the
  // Rettifilo escape road runs straight on, the back straight passes under the Serraglio and the
  // south banking wraps around the outside of the Parabolica. Disused: drawn only clear of the circuit.
  buildOval(B, C, addFP) {
    const T = this.T, N = T.N;
    const iA = this.idx(150), iB = this.idx(750);
    let dx = T.x[iB] - T.x[iA], dz = T.z[iB] - T.z[iA]; const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
    const rx = -dz, rz = dx; // right of the main straight (inside of the clockwise lap)
    const ox = T.x[iA] - dx * 150 * this.sc, oz = T.z[iA] - dz * 150 * this.sc; // ~ timing line on the straight axis
    const W = 670, Rb = W / 2, U1 = 875, U0 = -525, DN = 230, DS = 190, HW = 7.5; // bankings: flattened half-ellipses (depth DN / DS)
    const pts = []; // centreline samples [u, v, bankSide]
    for (let u = 760; u < U1; u += 6) pts.push([u, 0, 0]);
    for (let a = 0; a <= Math.PI; a += 6 / Rb) pts.push([U1 + Math.sin(a) * DN, Rb - Math.cos(a) * Rb, 1]);
    for (let u = U1; u > U0; u -= 6) pts.push([u, W, 0]);
    for (let a = 0; a <= Math.PI; a += 6 / Rb) pts.push([U0 - Math.sin(a) * DS, Rb + Math.cos(a) * Rb, 1]);
    const toW = (u, v) => [ox + dx * u + rx * v, oz + dz * u + rz * v];
    this.ovalW = toW;
    const ob = new GeoBuilder(true), ouv = (p) => [p[0] / 7 + p[1] / 7, p[2] / 7], con = new THREE.Color(2.15, 2.12, 2.02), conD = new THREE.Color(1.6, 1.58, 1.5), grassC = col3('#6b7a4c');
    const prof = [[-HW, 0], [-HW * 0.4, 0.5], [0, 1.6], [HW * 0.5, 4.2], [HW * 0.85, 7.6], [HW, 9.6], [HW + 0.35, 10.6]];
    const flat = [[-HW, 0.3], [HW, 0.3]];
    let prev = null;
    const keepOff = (x, z) => this.distAt(x, z) > 46;
    for (let n = 0; n < pts.length; n++) {
      const [u, v, bank] = pts[n], m = pts[(n + 1) % pts.length];
      const [x0, z0] = toW(u, v), [x1, z1] = toW(m[0], m[1]);
      if (!keepOff(x0, z0) || !keepOff(x1, z1) || Math.hypot(x1 - x0, z1 - z0) > 12) { prev = null; continue; }
      // outward normal: away from the oval centre (banking rises outward)
      const cu = bank ? (u > 0 ? U1 : U0) : u, D = u > 0 ? DN : DS;
      const gu = (u - cu) / (D * D), gv = (v - Rb) / (Rb * Rb);
      let nx = dx * gu + rx * gv, nz = dz * gu + rz * gv; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      if (!bank) { nx = v > 0 ? rx : -rx; nz = v > 0 ? rz : -rz; }
      const pr = bank ? prof : flat;
      const ring = pr.map(([o, hh]) => { const x = x0 + nx * o, z = z0 + nz * o; return [x, this.heightAt(x0, z0) - 0.15 + hh, z]; });
      if (prev && prev.length === ring.length) {
        for (let j = 0; j < ring.length - 1; j++) {
          const c = j === ring.length - 2 && bank ? conD : (j % 2 ? con : con.clone().multiplyScalar(0.94 + 0.08 * hash2(n, j)));
          ob.quad(prev[j], ring[j], ring[j + 1], prev[j + 1], c, [ouv(prev[j]), ouv(ring[j]), ouv(ring[j + 1]), ouv(prev[j + 1])]);
        }
        if (bank) { // outer retaining wall down to the ground + pillars every ~18 m
          // elevated slab: outer parapet, slab edge and rows of columns underneath (it is a 'sopraelevata')
          const a = prev[ring.length - 1], b = ring[ring.length - 1];
          const a2 = [a[0], a[1] - 0.9, a[2]], b2 = [b[0], b[1] - 0.9, b[2]]; ob.quad(a, b, b2, a2, conD, [ouv(a), ouv(b), ouv(b2), ouv(a2)]);
          if (n % 2 === 0) for (const o of [HW * 0.5, HW * 0.85]) {
            const px = x0 + nx * o, pz = z0 + nz * o, g = this.heightAt(px, pz), top = g - 0.15 + (o > HW * 0.6 ? 7.4 : 4.0);
            B.box(px, g - 0.5, pz, 0.7, top - g + 0.5, 0.7, Math.atan2(nx, nz), C.concrete);
          }
        }
        if (n % 2 === 0) addFP(x0, z0, HW + 9);
      }
      prev = ring;
    }
    const mesh = new THREE.Mesh(ob.build(), macroVariation(new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.asphalt, side: THREE.DoubleSide }), 0.5));
    mesh.receiveShadow = true; this.group.add(mesh);
  }

  // ---------------------------------------------------------------------
  // Melbourne CBD seen from Albert Park (north, ~3 km): simple lit towers with window textures, fogged by distance
  buildSkyline() {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d');
    g.fillStyle = '#7d8b99'; g.fillRect(0, 0, 64, 128);
    for (let y = 2; y < 128; y += 6) for (let x = 3; x < 64; x += 8) { g.fillStyle = hash2(x, y) < 0.18 ? '#e9e2b8' : '#34475a'; g.fillRect(x, y, 5, 3.5); }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const mats = ['#aab4be', '#8f9ca8', '#b8bec4', '#7f8d99'].map(c => new THREE.MeshLambertMaterial({ color: c, map: tex }));
    const roof = new THREE.MeshLambertMaterial({ color: 0x6b7480 }), gold = new THREE.MeshLambertMaterial({ color: 0xc9a23a, emissive: 0x3a2c08 });
    const grp = new THREE.Group(), cx = 130, cz = -(560 + 2700);
    const add = (x, z, w, d, h, m, top) => {
      const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 14, uv.getY(i) * h / 16);
      const mesh = new THREE.Mesh(geo, [m, m, roof, roof, m, m]); mesh.position.set(x, h / 2 - 20, z); grp.add(mesh);
      if (top) { const t = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 0.12, d * 0.9), gold); t.position.set(x, h - 20 + h * 0.06, z); grp.add(t); }
    };
    for (let i = 0; i < 46; i++) {
      const a = hash2(i, 3), b = hash2(i, 7), c = hash2(i, 11);
      const x = cx - 650 + a * 1500, z = cz - b * 380 + (a - 0.5) * 120;
      const core = 1 - Math.min(1, Math.abs(x - cx) / 800);
      const h = 55 + core * 150 * c + c * 40;
      add(x, z, 28 + hash2(i, 5) * 36, 28 + hash2(i, 9) * 30, h, mats[i % 4], false);
    }
    add(cx - 170, cz + 40, 38, 38, 255, mats[1], true);   // Eureka-style gold-capped tower
    add(cx + 140, cz - 70, 44, 40, 235, mats[2], false);
    add(cx - 20, cz - 110, 40, 44, 215, mats[0], false);
    this.group.add(grp); this.skyline = grp;
  }
  buildTrees() {
    if (this.trees) { for (const m of this.trees) { this.group.remove(m); m.dispose && m.dispose(); } }
    const T = this.T, t = this.terrain;
    const maxTrees = { bajo: 5000, medio: 11000, alto: 18000 }[this.q] || 11000;
    // textured, alpha-cut vegetation: conifers = stacked needle skirts, broadleaf = leaf clumps.
    // Two levels of detail per 350 m tile (near: full, far: 2 skirts / 1 clump).
    const shadeY = (g, y0, y1, lo, hi) => { const p = g.attributes.position, c = g.attributes.color; for (let i = 0; i < p.count; i++) { const f = lo + (hi - lo) * clamp((p.getY(i) - y0) / (y1 - y0), 0, 1); c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f); } return g; };
    const withUV = (g, fn) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const r = fn(uv.getX(i), uv.getY(i)); uv.setXY(i, r[0], r[1]); } return g; };
    const prep = (g, hex) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const bark = (g) => withUV(g, () => [0.02, 0.97]);
    // foliage normals point out of the crown (not the facets): soft, rounded shading instead of faceted blobs
    const crownN = (g, cx, cy, cz, up) => { const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.set(p.getX(i) - cx, (p.getY(i) - cy) * (up || 1) + (up ? 0.35 : 0), p.getZ(i) - cz).normalize(); n.setXYZ(i, v.x, v.y, v.z); } return g; };
    const skirt = (r, h, y0, seg, rot) => crownN(withUV(prep(new THREE.ConeGeometry(r, h, seg, 1, true).rotateY(rot).translate(0, y0 + h / 2, 0), '#ffffff'), (u, v) => [u * 2.0, v * 0.97]), 0, y0 + h * 0.35, 0, 0.6);
    const conHi = mergeGeos([
      bark(prep(new THREE.CylinderGeometry(0.16, 0.3, 4.5, 5, 1, true).translate(0, 2.2, 0), '#8a7a6a')),
      shadeY(skirt(3.1, 4.4, 1.3, 8, 0), 1.3, 5.7, 0.55, 0.95), shadeY(skirt(2.5, 3.9, 3.5, 8, 0.4), 3.5, 7.4, 0.62, 1.02),
      shadeY(skirt(1.9, 3.5, 5.6, 7, 0.8), 5.6, 9.1, 0.7, 1.08), shadeY(skirt(1.25, 3.2, 7.6, 6, 1.2), 7.6, 10.8, 0.78, 1.15)
    ]);
    const conLo = mergeGeos([
      bark(prep(new THREE.CylinderGeometry(0.2, 0.3, 3, 4, 1, true).translate(0, 1.5, 0), '#8a7a6a')),
      shadeY(skirt(2.9, 6.2, 1.4, 6, 0), 1.4, 7.6, 0.55, 1.0), shadeY(skirt(1.9, 5.0, 5.8, 6, 0.5), 5.8, 10.8, 0.7, 1.15)
    ]);
    const clump = (r, x, y, z, det) => crownN(withUV(prep(new THREE.IcosahedronGeometry(r, det).scale(1, 0.85, 1).translate(x, y, z), '#ffffff'), (u, v) => [u * 3, v * 2]), x * 0.4, y - r * 0.2, z * 0.4);
    const lfHi = mergeGeos([
      bark(prep(new THREE.CylinderGeometry(0.2, 0.34, 5, 5, 1, true).translate(0, 2.5, 0), '#8a7a6a')),
      shadeY(clump(3.0, 0, 6.6, 0, 1), 3.8, 9.3, 0.6, 1.12), shadeY(clump(2.2, 1.7, 5.2, 0.7, 0), 3.3, 7.2, 0.55, 1.0),
      shadeY(clump(2.3, -1.5, 5.6, -0.9, 0), 3.6, 7.6, 0.55, 1.0), shadeY(clump(2.0, 0.4, 8.3, -1.1, 0), 6.5, 10.2, 0.8, 1.2)
    ]);
    const lfLo = mergeGeos([
      bark(prep(new THREE.CylinderGeometry(0.25, 0.35, 4, 4, 1, true).translate(0, 2, 0), '#8a7a6a')),
      shadeY(clump(3.6, 0, 6.5, 0, 0), 3.4, 9.6, 0.58, 1.15)
    ]);
    const a2c = this.q !== 'bajo';
    const conMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.needles, alphaTest: 0.5, side: THREE.DoubleSide }); conMat.alphaToCoverage = a2c;
    const lfMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.leaves, alphaTest: 0.5, side: THREE.DoubleSide }); lfMat.alphaToCoverage = a2c;
    const fpHash = new Map();
    for (const f of this.footprints) { const key = Math.floor(f[0] / 50) + ',' + Math.floor(f[1] / 50); (fpHash.get(key) || fpHash.set(key, []).get(key)).push(f); }
    const blocked = (x, z) => {
      const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const arr = fpHash.get((cx + a) + ',' + (cz + b)); if (!arr) continue; for (const f of arr) if ((x - f[0]) ** 2 + (z - f[1]) ** 2 < f[2] * f[2]) return true; }
      return false;
    };
    const cand = [];
    const sp = 7.5;
    for (let z = t.z0 + 20; z < t.z1 - 20; z += sp) for (let x = t.x0 + 20; x < t.x1 - 20; x += sp) {
      const jx = x + (hash2(x, z) - 0.5) * sp * 0.9, jz = z + (hash2(z, x) - 0.5) * sp * 0.9;
      const d = this.distAt(jx, jz);
      if (d < 26) continue;
      if (this.lake && this.heightAt(jx, jz) < this.lake.y + 0.9) continue;
      const dens = fbm(jx / 330, jz / 330, 3);
      const nearBonus = d < 140 ? 0.08 : 0;
      if (dens + nearBonus < this.SC.dens) continue;
      const pKeep = d < 180 ? 1 : d < 450 ? 0.55 : 0.22;
      if (hash2(jx * 1.3, jz * 0.7) > pKeep) continue;
      cand.push([jx, jz, d]);
    }
    cand.sort((a, b) => a[2] - b[2]);
    // collect accepted trees into 350 m tiles so each tile can be frustum-culled
    const TILE = 350, tiles = new Map();
    let n = 0;
    for (const [x, z, d] of cand) {
      if (n >= maxTrees) break;
      if (d < 90) { const pr = T.project(x, z, -1); const bar = pr.d >= 0 ? pr.bl : pr.br; if (Math.abs(pr.d) < bar + 9) continue; }
      if (blocked(x, z)) continue;
      const key = Math.floor(x / TILE) + ',' + Math.floor(z / TILE);
      let tl = tiles.get(key); if (!tl) { tl = { c: [], l: [] }; tiles.set(key, tl); }
      (hash2(x * 0.3, z * 0.9) < this.SC.conifer ? tl.c : tl.l).push([x, z]);
      n++;
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), cc = new THREE.Color();
    this.trees = []; this.treeTiles = [];
    for (const tl of tiles.values()) {
      const tile = { x: 0, z: 0, hi: [], lo: [] }; let tn = 0;
      for (const [list, geo, con, lod, mat] of [[tl.c, conHi, true, 'hi', conMat], [tl.l, lfHi, false, 'hi', lfMat], [tl.c, conLo, true, 'lo', conMat], [tl.l, lfLo, false, 'lo', lfMat]]) {
        if (!list.length) continue;
        if (lod === 'hi') for (const [x, z] of list) { tile.x += x; tile.z += z; tn++; }
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach(([x, z], k) => {
          const y = this.heightAt(x, z) - 0.3;
          const s = 0.85 + hash2(z * 0.7, x) * 0.95;
          q.setFromAxisAngle(yAxis, hash2(x, z * 3) * 6.28);
          sv.set(s * (0.85 + 0.3 * hash2(x * 2, z)), s * (con ? 1.25 : 1), s);
          pv.set(x, y, z); m4.compose(pv, q, sv); im.setMatrixAt(k, m4);
          const tint = 0.78 + 0.35 * hash2(x * 5.1, z * 2.3);
          cc.setRGB(tint, tint * (0.95 + 0.1 * hash2(x, z)), tint * 0.92); im.setColorAt(k, cc);
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        this.group.add(im); this.trees.push(im); tile[lod].push(im); im.visible = lod === 'lo';
      }
      if (tn) { tile.x /= tn; tile.z /= tn; this.treeTiles.push(tile); }
    }
    this.treeCount = n; this.lodT = 0;
    this.buildVerges();
  }

  // tufts of tall grass along the foot of the barriers (outside), where the ground is grass
  buildVerges() {
    if (this.verges) { for (const m of this.verges) { this.group.remove(m); m.dispose && m.dispose(); } }
    this.verges = [];
    if (this.q === 'bajo') return;
    const T = this.T, N = T.N;
    const cross = mergeGeos([new THREE.PlaneGeometry(1.6, 0.8).translate(0, 0.38, 0), new THREE.PlaneGeometry(1.6, 0.8).translate(0, 0.38, 0).rotateY(Math.PI / 2)].map(g => { g = g.toNonIndexed(); const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return g; }));
    const mat = new THREE.MeshLambertMaterial({ map: TEX.blades, alphaTest: 0.5, side: THREE.DoubleSide }); mat.alphaToCoverage = true;
    const pts = [];
    for (let i = 0; i < N; i++) for (const side of [1, -1]) {
      const k = i, sN = k * T.ds / this.sc;
      if (sN > this.D.vergeSkip[0] || sN < this.D.vergeSkip[1]) continue; // pit straight: walls and paddock
      const typ = side > 0 ? T.typL[k] : T.typR[k];
      if (typ !== 'grass' && hash2(i, side) > 0.3) continue;
      const bar = side > 0 ? T.barL[k] : T.barR[k];
      for (let j = 0; j < 3; j++) {
        const h = hash2(i * 1.7 + j, side * 3.1 + j);
        const dd = side * (bar + 0.5 + j * 1.9 + h * 1.2), ss = k + hash2(i + j * 7, side) * 0.9;
        const p = this.P(Math.floor(ss), dd, 0); const y = this.heightAt(p[0], p[2]);
        if (Math.abs(y - T.e[k]) > 2.5) continue;
        if (T.inEscape && T.inEscape(p[0], p[2])) continue;
        pts.push([p[0], Math.min(y, T.e[k] + 0.3) - 0.08, p[2], h]);
      }
    }
    const TILE = 350, tiles = new Map();
    for (const p of pts) { const key = Math.floor(p[0] / TILE) + ',' + Math.floor(p[2] / TILE); (tiles.get(key) || tiles.set(key, []).get(key)).push(p); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), yA = new THREE.Vector3(0, 1, 0), cc = new THREE.Color();
    for (const list of tiles.values()) {
      const im = new THREE.InstancedMesh(cross, mat, list.length);
      list.forEach((p, k) => { q.setFromAxisAngle(yA, p[3] * 6.28); const sc = 0.7 + 0.8 * hash2(p[0], p[2]); sv.set(sc, sc * (0.8 + 0.6 * p[3]), sc); pv.set(p[0], p[1], p[2]); m4.compose(pv, q, sv); im.setMatrixAt(k, m4); const t = 0.8 + 0.4 * hash2(p[2], p[0]); cc.setRGB(t, t, t * 0.95); im.setColorAt(k, cc); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); this.group.add(im); this.verges.push(im);
    }
  }
  // near tiles use the detailed trees, far ones the light version
  updateLOD(cam, dt) {
    if (!this.treeTiles) return;
    this.lodT -= dt || 0.016; if (this.lodT > 0) return; this.lodT = 0.25;
    const R = this.q === 'bajo' ? 260 : this.q === 'alto' ? 560 : 420;
    for (const t of this.treeTiles) {
      const near = (t.x - cam.x) ** 2 + (t.z - cam.z) ** 2 < R * R;
      for (const m of t.hi) m.visible = near; for (const m of t.lo) m.visible = !near;
    }
  }
  // ---------------------------------------------------------------------
  // reflective puddles (fade in with the water level)
  buildPuddles() {
    const T = this.T;
    if (this.puddles) { this.group.remove(this.puddles); this.puddles.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.puddles = null; }
    this.puddleMat = new THREE.MeshStandardMaterial({ color: 0x080c10, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.6, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const grp = new THREE.Group(); this.puddles = grp; grp.visible = false;
    for (const p of T.puddles || []) {
      const pos = [], idx = [], K = 6;
      for (let m = 0; m <= p.n; m++) {
        const t = m / p.n, wv = Math.pow(Math.sin(Math.PI * t), 0.55), c = (p.d0 + p.d1) / 2, hw = (p.d1 - p.d0) / 2 * wv;
        for (let k = 0; k <= K; k++) { const d = c + hw * (k / K * 2 - 1); pos.push(...this.P(p.i0 + m, d, 0.035)); }
      }
      for (let m = 0; m < p.n; m++) for (let k = 0; k < K; k++) { const a = m * (K + 1) + k, b = a + 1, c2 = a + K + 1, d2 = c2 + 1; idx.push(a, c2, b, b, c2, d2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      for (let n = 1; n < g.attributes.normal.count; n++) { /* keep computed normals: they follow the road */ }
      const mesh = new THREE.Mesh(g, this.puddleMat); mesh.renderOrder = 2; mesh.frustumCulled = true; grp.add(mesh);
    }
    this.group.add(grp);
  }
  buildIdealLine(vel) {
    if (this.ideal) { this.group.remove(this.ideal); this.ideal.geometry.dispose(); }
    const T = this.T, N = T.N, L = this.line;
    const b = new GeoBuilder(false);
    const g = col3('#2fd27a'), y = col3('#f6c21c'), r = col3('#e3342c');
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      const dv = vel[(i + 3) % N] - vel[i];
      const c = dv < -0.35 ? r : dv < -0.05 ? y : g;
      const a0 = this.P(i, L.off[i] - 0.28, 0.02), a1 = this.P(i, L.off[i] + 0.28, 0.02);
      const b0 = this.P(i2, L.off[i2] - 0.28, 0.02), b1 = this.P(i2, L.off[i2] + 0.28, 0.02);
      if (i % 3 === 2) continue; // dashed
      b.quad(a0, b0, b1, a1, c);
    }
    this.ideal = new THREE.Mesh(b.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false }));
    this.group.add(this.ideal);
  }
}

// ---------------------------------------------------------------------------
//  Sky, lights and weather
// ---------------------------------------------------------------------------
const WEATHER = {
  soleado:   { name: 'Soleado', top: '#3d78c8', hor: '#c3d6e6', bot: '#a9b9c6', fog: '#bccbd8', dens: 0.00040, sunDir: [-0.42, 0.72, 0.55], sunCol: '#fff1d8', sunI: 3.1, hemiSky: '#cfe0f5', hemiGnd: '#5a6b40', hemiI: 1.05, grip: 1, rain: 0, cover: 0.36, cloudCol: '#ffffff', cloudDark: '#8f9aa8', sunDisk: 1, exposure: 1.0 },
  nublado:   { name: 'Nublado', top: '#7d8894', hor: '#b9c0c6', bot: '#949ba1', fog: '#aab1b7', dens: 0.00075, sunDir: [-0.3, 0.8, 0.5], sunCol: '#e9edf1', sunI: 0.9, hemiSky: '#d6dde3', hemiGnd: '#4d5a45', hemiI: 1.7, grip: 1, rain: 0, cover: 0.82, cloudCol: '#dfe3e7', cloudDark: '#7d858d', sunDisk: 0, exposure: 1.05 },
  atardecer: { name: 'Atardecer', top: '#2a3c70', hor: '#f0a070', bot: '#6a5358', fog: '#c99478', dens: 0.00055, sunDir: [0.85, 0.13, -0.3], sunCol: '#ffae66', sunI: 2.4, hemiSky: '#ffc59e', hemiGnd: '#3a3346', hemiI: 0.8, grip: 1, rain: 0, cover: 0.45, cloudCol: '#ffd0a8', cloudDark: '#6a4f5c', sunDisk: 1, exposure: 1.0 },
  llovizna:  { name: 'Llovizna', top: '#66717b', hor: '#a7afb6', bot: '#868e94', fog: '#98a0a7', dens: 0.0012, sunDir: [-0.3, 0.8, 0.5], sunCol: '#dfe4e8', sunI: 0.55, hemiSky: '#b9c1c8', hemiGnd: '#454f42', hemiI: 1.5, grip: 1, rain: 0.35, water: 0.22, cover: 0.92, cloudCol: '#a6adb3', cloudDark: '#5f666c', sunDisk: 0, exposure: 1.03 },
  lluvia:    { name: 'Lluvia', top: '#4c545c', hor: '#838b92', bot: '#6a7177', fog: '#7c848b', dens: 0.0021, sunDir: [-0.3, 0.8, 0.5], sunCol: '#cfd6dc', sunI: 0.5, hemiSky: '#aab3bb', hemiGnd: '#3d463a', hemiI: 1.35, grip: 1, rain: 0.7, water: 0.62, cover: 1.0, cloudCol: '#8a9197', cloudDark: '#4d545a', sunDisk: 0, exposure: 1.0 },
  tormenta:  { name: 'Tormenta', top: '#4b545c', hor: '#8a949b', bot: '#6c747a', fog: '#7f888f', dens: 0.0024, sunDir: [-0.3, 0.8, 0.5], sunCol: '#c8d0d6', sunI: 0.5, hemiSky: '#aab4bc', hemiGnd: '#3a4338', hemiI: 1.5, grip: 1, rain: 1, water: 1, storm: 1, cover: 1.0, cloudCol: '#7b838a', cloudDark: '#40474d', sunDisk: 0, exposure: 1.12 },
  secando:   { name: 'Secándose', top: '#76818c', hor: '#b2bac0', bot: '#8d949a', fog: '#a3abb1', dens: 0.0009, sunDir: [-0.35, 0.65, 0.5], sunCol: '#f0ede4', sunI: 1.3, hemiSky: '#cdd5db', hemiGnd: '#4f5b45', hemiI: 1.55, grip: 1, rain: 0, water: 0, water0: 0.5, dry: 520, cover: 0.7, cloudCol: '#d3d8dc', cloudDark: '#7a838b', sunDisk: 0, exposure: 1.04 }
};

const _wetCol = new THREE.Color('#7d8287'), _wetCol2 = new THREE.Color('#8a8f94'), _wetSpec = new THREE.Color('#7a8086');
class Sky {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.uniforms = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, disk: { value: 1 },
      noiseTex: { value: TEX.noise }, cover: { value: 0.4 }, time: { value: 0 }, cloudCol: { value: new THREE.Color() }, cloudDark: { value: new THREE.Color() } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float disk;
        uniform sampler2D noiseTex; uniform float cover; uniform float time; uniform vec3 cloudCol; uniform vec3 cloudDark; varying vec3 vDir;
        float cl(vec2 uv){ return texture2D(noiseTex, uv * 0.23).r * 0.62 + texture2D(noiseTex, uv * 0.61 + 0.37).g * 0.28 + texture2D(noiseTex, uv * 1.9 + 0.71).b * 0.10; }
        void main(){ vec3 d = normalize(vDir); float h = d.y; vec3 sd = normalize(sunDir);
          vec3 c = mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.5));
          c = mix(c, bot, clamp(-h * 6.0, 0.0, 1.0));
          float s = max(dot(d, sd), 0.0);
          c += sunCol * (pow(s, 8.0) * 0.22 + pow(s, 2.5) * 0.07) * (0.4 + 0.6 * disk);
          if (h > 0.0) {
            // cloud deck: planar projection, drifting; lit from the sun side, darker cores
            vec2 uv = d.xz / (h + 0.1) * 1.5 + vec2(time * 0.006, time * 0.002);
            float n = cl(uv);
            float th = mix(0.64, 0.36, cover);
            float a = smoothstep(th, th + 0.1 + 0.12 * cover, n);
            float n2 = cl(uv + sd.xz * 0.12);
            float lit = clamp(0.6 + (n - n2) * 6.0, 0.0, 1.0);
            float dens = smoothstep(th, th + 0.32, n);
            vec3 cc = mix(cloudCol, cloudDark, clamp(dens * 0.75 + (1.0 - lit) * 0.55, 0.0, 1.0));
            cc += sunCol * pow(s, 6.0) * 0.35 * (1.0 - dens) * disk; // silver lining
            float fade = smoothstep(0.0, 0.2, h);
            c = mix(c, mix(hor, cc, 0.35 + 0.65 * fade), a * (0.25 + 0.75 * fade));
          }
          c += sunCol * pow(s, 1600.0) * 7.0 * disk;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat);
    this.mesh.renderOrder = -2; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    // distant forested hills all around the horizon (they fade into the haze)
    {
      const seg = 180, R = 2750, pos = [], col = [], idx = [];
      const cA = new THREE.Color('#2f4a2c'), cB = new THREE.Color('#40603a');
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
        const hN = 45 + 120 * pfbm(i / seg * 9, 0.5, 9, 4, 61) + 60 * pfbm(i / seg * 3, 2.5, 3, 2, 63);
        pos.push(x * R, -60, z * R, x * R, hN, z * R);
        const c = cA.clone().lerp(cB, pnoise(i / seg * 20, 1.5, 20, 71));
        col.push(c.r, c.g, c.b, c.r * 1.1, c.g * 1.1, c.b * 1.05);
        if (i < seg) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      this.hills = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
      this.hills.frustumCulled = false; this.hills.renderOrder = -1; scene.add(this.hills);
    }
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5); scene.add(this.sun); scene.add(this.sun.target);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.clouds = new THREE.Group(); scene.add(this.clouds);
    // rain
    const RN = 3500;
    const rg = new THREE.BufferGeometry(); const rp = new Float32Array(RN * 6);
    for (let i = 0; i < RN; i++) { const x = (rand() - 0.5) * 70, y = rand() * 40 - 10, z = (rand() - 0.5) * 70; rp.set([x, y, z, x + 0.05, y + 0.9, z], i * 6); }
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb5c0ca, transparent: true, opacity: 0.45, fog: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    this.rainN = RN; this.t = 0;
  }
  apply(key, drawMul, world) {
    const w = WEATHER[key]; this.w = w;
    const U = this.uniforms;
    U.top.value.set(w.top); U.hor.value.set(w.hor); U.bot.value.set(w.bot); U.sunCol.value.set(w.sunCol); U.disk.value = w.sunDisk;
    U.sunDir.value.set(...w.sunDir).normalize();
    U.cover.value = w.cover; U.cloudCol.value.set(w.cloudCol); U.cloudDark.value.set(w.cloudDark);
    this.scene.fog = new THREE.FogExp2(w.fog, w.dens / drawMul);
    this.hills.visible = !w.rain && !(world && world.SC && world.SC.noHills);
    if (world && world.SC) this.hills.scale.y = world.SC.flat ? 0.3 : 1;
    this.hemi.color.set(w.hemiSky); this.hemi.groundColor.set(w.hemiGnd); this.hemi.intensity = w.hemiI;
    this.sun.color.set(w.sunCol); this.sun.intensity = w.sunI;
    this.rainI = w.rain || 0;
    this.rain.visible = this.rainI > 0;
    this.rain.geometry.setDrawRange(0, Math.max(2, Math.floor(this.rainN * (0.15 + 0.85 * this.rainI))) * 2);
    this.rain.material.opacity = 0.26 + 0.16 * this.rainI;   // heavy rain is shown by density, not by a wall of streaks
    this.flash = 0; this.flashT = 4 + Math.random() * 8; this.hemiI0 = w.hemiI; this.sunI0 = w.sunI;
    this.updateEnv(w);
    this.setWet(world, w.water0 != null ? w.water0 : (w.water || 0));
  }
  // surface wetness 0..1 (water on the asphalt): darker, glossier, reflective puddles
  setWet(world, wl) {
    this.wetLvl = wl;
    if (!world) return;
    const k = smoothstep(0.02, 0.5, wl);
    if (world.asphaltMat) {
      const m = world.asphaltMat;
      if (m.isMeshStandardMaterial) { m.color.set('#ffffff').lerp(_wetCol, k * 0.9); m.roughness = lerp(0.86, 0.26, k); m.envMapIntensity = lerp(0.35, 1.05, k); }
      else { m.color.set('#ffffff').lerp(_wetCol2, k * 0.9); m.specular.set('#111111').lerp(_wetSpec, k); m.shininess = lerp(8, 70, k); }
    }
    if (world.puddleMat) { world.puddleMat.opacity = 0.9 * smoothstep(0.05, 0.4, wl); world.puddles.visible = world.puddleMat.opacity > 0.02; }
  }
  // reflection environment for the car paint (PMREM of the sky dome over a ground disc)
  updateEnv(w) {
    const r = this.renderer; if (!r) return;
    if (!this.pmrem) { this.pmrem = new THREE.PMREMGenerator(r); }
    const es = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.mesh.material);
    es.add(sky);
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(49, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(w.hemiGnd).lerp(new THREE.Color('#5a5f63'), 0.45) }));
    gnd.position.y = -1.2; es.add(gnd);
    // a few dark tree-line silhouettes on the horizon so reflections read as "outdoors"
    const tl = new THREE.Mesh(new THREE.CylinderGeometry(48, 48, 5, 32, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(w.hemiGnd).multiplyScalar(0.55), side: THREE.BackSide }));
    tl.position.y = 1.2; es.add(tl);
    const rt = this.pmrem.fromScene(es, 0.02, 0.1, 200);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt; this.scene.environment = rt.texture;
    sky.geometry.dispose(); gnd.geometry.dispose(); gnd.material.dispose(); tl.geometry.dispose(); tl.material.dispose();
  }
  update(dt, cam, carPos) {
    this.mesh.position.copy(cam.position);
    this.hills.position.set(cam.position.x, cam.position.y - 25, cam.position.z);
    this.t += dt || 0; this.uniforms.time.value = this.t;
    const sd = this.uniforms.sunDir.value;
    if (carPos) {
      this.sun.position.set(carPos.x + sd.x * 60, carPos.y + sd.y * 60, carPos.z + sd.z * 60);
      this.sun.target.position.copy(carPos);
    }
    if (this.w && this.w.storm) {
      this.flashT -= dt || 0;
      if (this.flashT <= 0) { this.flash = 1; this.flashT = 6 + Math.random() * 14; if (this.onThunder) this.onThunder(); }
      this.flash = Math.max(0, this.flash - (dt || 0) * 5);
      const f = this.flash * (Math.random() < 0.5 ? 1 : 0.55);
      this.hemi.intensity = this.hemiI0 + f * 1.6; this.sun.intensity = this.sunI0 + f * 1.4;
    }
    if (this.rain.visible) {
      const a = this.rain.geometry.attributes.position.array;
      this.rain.position.copy(cam.position);
      const fall = 22 * dt;
      for (let i = 0; i < this.rainN; i++) {
        const o = i * 6;
        a[o + 1] -= fall; a[o + 4] -= fall;
        if (a[o + 1] < -14) { a[o + 1] += 44; a[o + 4] += 44; }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
}
