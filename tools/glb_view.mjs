// Fast look at one assets/*.glb without the game (no track, no post): cameras in asset coords (+Z forward, +X left, +Y up).
// node tools/glb_view.mjs <out prefix> <asset id> "px,py,pz,tx,ty,tz,fov;..." [js run in the page first: scene `S`, `THREE`]
//   needs THREE_DIR (npm pack three@0.160.0). Used to find the driver's eye / steering wheel of a scanned cabin.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..'), TD = process.env.THREE_DIR;
const [pre = 'shots/view', id = 'gt3', cams = '2.6,1.5,3.6,0,0.5,0.2,38', js = ''] = process.argv.slice(2);
const HTML = `<!doctype html><body style="margin:0;background:#789"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement); r.localClippingEnabled = true;
const S = new THREE.Scene(); S.background = new THREE.Color(0x8fa3b8); S.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1)); const d = new THREE.DirectionalLight(0xffffff, 1.2); d.position.set(3, 6, 4); S.add(d);
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.02, 100);
const g = await new Promise((ok, no) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('/asset.glb', ok, null, no)); S.add(g.scene);
window.V = { THREE, S, g: g.scene, shot(c) { cam.position.set(c[0], c[1], c[2]); cam.lookAt(c[3], c[4], c[5]); cam.fov = c[6] || 40; cam.updateProjectionMatrix(); r.render(S, cam); },
  pick(px, py) { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(px / innerWidth * 2 - 1, 1 - py / innerHeight * 2), cam); const h = rc.intersectObject(S, true).filter(h => h.object.visible)[0]; return h ? [...h.point.toArray().map(x => +x.toFixed(3)), h.object.name, h.object.material.name] : null; },
  ball(x, y, z, rr, col) { const m = new THREE.Mesh(new THREE.SphereGeometry(rr || 0.02), new THREE.MeshBasicMaterial({ color: col || 0xff00ff })); m.position.set(x, y, z); S.add(m); } };
</script></body>`;
const srv = http.createServer((q, s) => { const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') { s.writeHead(200, { 'content-type': 'text/html' }); return s.end(HTML); }
  const f = u === '/asset.glb' ? (process.env.GLB || path.join(root, 'assets', id + '.glb')) : u.startsWith('/three/') ? path.join(TD, u.slice(7)) : null;
  if (!f || !fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(0);
const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: +(process.env.W || 900), height: +(process.env.H || 520) } }); pg.on('pageerror', e => console.log('ERR', String(e)));
await pg.goto(`http://localhost:${srv.address().port}/`); await pg.waitForFunction(() => window.V, null, { timeout: 120000 });
if (js) console.log(JSON.stringify(await pg.evaluate(`(()=>{const {THREE,S,g}=V;${js}})()`)));
fs.mkdirSync(path.dirname(path.resolve(pre)), { recursive: true });
let i = 0; for (const c of cams.split(';')) { await pg.evaluate(c => V.shot(c), c.split(',').map(Number)); await pg.screenshot({ path: `${pre}_${i++}.png` }); }
// PICK="x,y;x,y": world point under those pixels of the LAST camera
if (process.env.PICK) for (const q of process.env.PICK.split(';')) console.log('pick', q, JSON.stringify(await pg.evaluate(([x, y]) => V.pick(x, y), q.split(',').map(Number))));
await b.close(); srv.close();
