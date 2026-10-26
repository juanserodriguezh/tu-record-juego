// Rebuild assets/*.glb from a built page and its packs (e.g. files read from the published artifact):
// node tools/unpack.js [dir-with-spa.html-and-models]   (default: dist)
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const html = fs.readFileSync(fs.existsSync(path.join(dir, 'spa.html')) ? path.join(dir, 'spa.html') : path.join(dir, 'index.html'), 'utf8');
const m = /const GLB_PACKS = (\[.*?\]);\n/.exec(html); if (!m) throw new Error('GLB_PACKS not found');
const out = path.join(__dirname, '..', 'assets'); fs.mkdirSync(out, { recursive: true });
for (const p of JSON.parse(m[1])) { const b = fs.readFileSync(path.join(dir, p.url));
  for (const [k, [o, n]] of Object.entries(p.items)) { fs.writeFileSync(path.join(out, k + '.glb'), b.subarray(o, o + n)); console.log(k + '.glb', n); } }
