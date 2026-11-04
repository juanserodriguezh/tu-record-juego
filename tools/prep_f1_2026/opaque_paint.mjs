// v105: the recolour weight used to live in the paint texture's alpha. Browsers premultiply alpha when they decode the image
// (Chrome's ImageBitmap default, Safari's <img>), so every texel with weight 0 lost its colour: the white half of the Cadillac
// livery rendered black. The weight is now computed in the shader from the RGB (glbPaintMask, same formulas as prep.mjs), so the
// texture is stored opaque. This rewrites an existing asset in place: paint texture without alpha + extras.paintMode.
// node tools/prep_f1_2026/opaque_paint.mjs assets/mac26.glb dark   |   assets/sf26.glb ref
// deps as prep.mjs: npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [file, mode] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
let n = 0;
for (const m of doc.getRoot().listMaterials()) {
  const ex = m.getExtras(); if (!ex || !ex.paintMask) continue;
  const t = m.getBaseColorTexture();
  const img = await sharp(Buffer.from(t.getImage())).removeAlpha().webp({ quality: 90 }).toBuffer();
  t.setImage(new Uint8Array(img)).setMimeType('image/webp');
  m.setExtras({ ...ex, paintMode: mode }); n++;
  console.log(m.getName(), 'paint texture now opaque', img.length, 'bytes, mode', mode, 'ref', ex.paintRef);
}
if (!n) throw new Error('no paintMask material');
await io.write(file, doc);
