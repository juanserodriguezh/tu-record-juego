// Local server for dist/ (the page fetches models/packN.wasm, so file:// does not work): node tools/serve.mjs [port]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const DIST = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'dist'), port = +(process.argv[2] || 8000);
const MIME = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript', '.png': 'image/png' };
http.createServer((q, r) => { const f = path.join(DIST, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/spa.html'));
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
}).listen(port, () => console.log(`Juego en http://localhost:${port}/  (Ctrl+C para parar)`));
