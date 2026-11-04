// Build: regenerates the racing lines and the model packs, then inlines everything into dist/spa.html
// (one self-contained page + dist/models/packN.wasm). Usage: node build.js  [--lines: recompute the racing lines]  [--single]
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'src'), DIST = path.join(__dirname, 'dist');
const rd = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const stripMod = (s) => s.replace(/if \(typeof module[^\n]*\n/, '');

// order matters: later files use globals from earlier ones
const DATA = ['data_spa.js', 'data_monza.js', 'data_albertpark.js', 'data_toca.js', 'data_monaco.js'];
const CORE = ['tracks.js', 'cars.js', 'physics.js', 'damage.js', 'barrels.js'];
const GAME = ['ai.js', 'world.js', 'coach.js', 'rewind.js', 'carmodel.js', 'body.js', 'hands.js', 'special.js', 'meshopt_simplifier.js', 'glb.js', 'audio.js', 'main.js', 'net.js', 'lobby.js'];

// 1) racing lines (precomputed so the page does not solve them on load)
let lineOffs = rd('line_offs.js');
if (process.argv.includes('--lines')) {   // only when a track changed: float noise differs between machines
  try {
    const M = new Function([...DATA, ...CORE].map(f => stripMod(rd(f))).join('\n') + '\nreturn { TRACK_DEFS, buildTrack, computeRacingLine };')();
    const out = {};
    for (const id of Object.keys(M.TRACK_DEFS)) { const T = M.buildTrack(id); const line = M.computeRacingLine(T, M.TRACK_DEFS[id].lineMargin || 1.3); out[id] = Array.from(line.off, v => Math.round(v * 100)).join(','); }
    lineOffs = 'const LINE_OFFS = ' + JSON.stringify(out) + ';';
    fs.writeFileSync(path.join(SRC, 'line_offs.js'), lineOffs);
  } catch (e) { console.warn('racing lines: kept src/line_offs.js (' + e.message + ')'); }
}

// 2) GLB models -> packs of <= 8 MB (served as .wasm so every host returns them as binary)
fs.mkdirSync(path.join(DIST, 'models'), { recursive: true });
const glbs = fs.readdirSync(path.join(__dirname, 'assets')).filter(f => f.endsWith('.glb')).sort();
const packs = []; let cur = null, bufs = [];
const flush = () => { if (cur) { fs.writeFileSync(path.join(DIST, cur.url), Buffer.concat(bufs)); packs.push(cur); } };
for (const f of glbs) {
  const b = fs.readFileSync(path.join(__dirname, 'assets', f)), name = f.replace(/\.glb$/, '');
  const size = bufs.reduce((s, x) => s + x.length, 0);
  if (!cur || size + b.length > 8e6) { flush(); cur = { url: 'models/pack' + packs.length + '.wasm', items: {} }; bufs = []; }
  cur.items[name] = [bufs.reduce((s, x) => s + x.length, 0), b.length]; bufs.push(b);
}
flush();
for (const f of fs.readdirSync(path.join(DIST, 'models'))) { const m = /^pack(\d+)\.wasm$/.exec(f); if (m && +m[1] >= packs.length) try { fs.unlinkSync(path.join(DIST, 'models', f)); } catch (e) { console.warn('stale pack left:', f); } }

// 3) page
const js = ["import * as THREE from 'three';", 'const GLB_PACKS = ' + JSON.stringify(packs) + ';',
  ...DATA.map(rd), ...CORE.map(f => stripMod(rd(f))), lineOffs, ...GAME.map(rd)].join('\n');
const html = [rd('head.html'), '<style>', rd('style.css'), '</style>', rd('body.html'),
  '<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/" } }</script>',
  '<script type="module">', js, '</script>', rd('tail.html')].join('\n');
fs.writeFileSync(path.join(DIST, 'spa.html'), html);
// optional single-file build (models inlined as base64 data URLs): node build.js --single  ->  dist/online/index.html
if (process.argv.includes('--single')) {
  const inl = packs.map(p => ({ url: 'data:application/octet-stream;base64,' + fs.readFileSync(path.join(DIST, p.url)).toString('base64'), items: p.items }));
  fs.mkdirSync(path.join(DIST, 'online'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'online', 'index.html'), html.replace('const GLB_PACKS = ' + JSON.stringify(packs) + ';', 'const GLB_PACKS = ' + JSON.stringify(inl) + ';'));
  console.log('built dist/online/index.html (single file)');
}
console.log('built dist/spa.html', (html.length / 1024).toFixed(1) + ' KB |', packs.map(p => p.url.split('/')[1] + ' ' + Object.keys(p.items).join(',')).join(' | '));
