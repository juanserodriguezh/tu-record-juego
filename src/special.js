// ============================================================================
//  DEDICATED MODELS: 2020 hybrid-era Formula 1 car (halo) and the Aston Martin
//  Valkyrie family (road car and AMR Pro). Real dimensions and layout; no logos,
//  sponsors or numbers.
// ============================================================================

// ---------------------------------------------------------------------------
//  2020 Formula 1 (Mercedes-AMG F1 W11 EQ Performance)
// ---------------------------------------------------------------------------
function buildF1Hybrid(out, spec, liv) {
  const { kit, hk, a, b } = out;
  const R = 0.335, P = out.col1, S = out.col2, CB = C3(CARBON), DK = C3('#121315'), SIL = C3('#aeb4ba');
  const zN = a + 0.98, zT = -b - 0.5;
  // monocoque: high slender nose up to the front bulkhead; open cockpit; rear chassis / power-unit cover
  kit.put('paint', loft([
    { z: zN, w: .12, y0: .21, y1: .31, n: 2.5 },
    { z: a + .6, w: .2, y0: .27, y1: .43, n: 2.5 },
    { z: a + .15, w: .3, y0: .3, y1: .53, n: 2.8 },
    { z: a - .45, w: .44, y0: .24, y1: .6, n: 3.2 },
    { z: 1.15, w: .58, y0: .1, y1: .65, n: 3.8 },
    { z: .72, w: .66, y0: .07, y1: .67, n: 4 }
  ], 20), P);
  kit.put('paint', loft([
    { z: -.18, w: .76, y0: .05, y1: .64, n: 4 },
    { z: -.6, w: .7, y0: .05, y1: .66, n: 4 },
    { z: -1.2, w: .46, y0: .08, y1: .58, n: 3.5 },
    { z: -1.75, w: .26, y0: .15, y1: .44, n: 3 },
    { z: zT, w: .15, y0: .22, y1: .34, n: 3 }
  ], 20), P);
  openCockpit(out, { z0: -.18, z1: .72, halfIn: .245, out0: .38, out1: .33, yFloor: .09, rim0: .64, rim1: .665, P, DK, CB });
  // airbox + roll hoop, engine cover spine, shark fin
  // (the hoop sits a hand's width behind the helmet, so the T-cam sees over it onto the helmet)
  kit.put('paint', loft([{ z: -.25, w: .22, y0: .62, y1: .93, n: 3 }, { z: -.5, w: .28, y0: .6, y1: .95, n: 3 }, { z: -1.0, w: .2, y0: .58, y1: .8, n: 3 }, { z: -1.7, w: .1, y0: .45, y1: .56, n: 3 }], 14), P);
  kit.box('trim', DK, .15, .1, .03, 0, .86, -.24);
  kit.box('trim', DK, .1, .05, .1, 0, .975, -.44); // T-cam pod (behind the camera position)
  kit.box('paint', P, .012, .14, 1.35, 0, .84, -1.2, .17);
  for (const s of [1, -1]) kit.box('paint', S, .006, .018, 1.2, s * .105, .8, -.75, .1);
  // sidepods (slim, deeply undercut), inlets, bargeboards
  for (const s of [1, -1]) {
    kit.put('paint', loft([
      { z: .95, w: .3, y0: .22, y1: .6, n: 4, x: s * .56 }, { z: .5, w: .42, y0: .16, y1: .6, n: 4, x: s * .57 },
      { z: -.3, w: .38, y0: .12, y1: .52, n: 4, x: s * .53 }, { z: -1.0, w: .24, y0: .1, y1: .36, n: 3.5, x: s * .42 },
      { z: -1.5, w: .12, y0: .1, y1: .24, n: 3, x: s * .3 }], 14), P);
    kit.box('trim', DK, .22, .3, .02, s * .56, .42, .945);
    for (let k = 0; k < 3; k++) kit.box('trim', CB, .01, .28 - k * .04, .45, s * (.44 + k * .06), .22, 1.2 - k * .1);
    kit.box('trim', CB, .01, .14, .6, s * .8, .12, -.2); // floor edge fence
  }
  singleSeaterFloor(kit, CB, { zF: a - .6, zR: -b + .35, w: 1.5, zT });
  kit.put('trim', loft([{ z: -1.2, w: .34, y0: .16, y1: .44, n: 3.5 }, { z: -b, w: .3, y0: .18, y1: .42, n: 3.5 }, { z: zT + .02, w: .16, y0: .24, y1: .36, n: 3 }], 12), CB);
  // front wing: full-width mainplane, three flaps, endplates, nose pillars
  const fz = a + .95;
  kit.box('trim', CB, 2.0, .025, .32, 0, .09, fz, .05);
  for (let k = 0; k < 3; k++) kit.box(k === 2 ? 'paint' : 'trim', k === 2 ? S : CB, 1.9, .02, .18, 0, .12 + k * .045, fz - .16 - k * .09, .35 + k * .22);
  for (const s of [1, -1]) {
    kit.box('paint', P, .02, .28, .55, s * 1.0, .19, fz - .1);
    kit.box('paint', S, .022, .025, .55, s * 1.0, .33, fz - .1);
    kit.bar('trim', CB, [s * .05, .24, a + .75], [s * .1, .11, a + .8], .02);
  }
  // rear wing: mainplane + DRS flap, tall endplates, beam wing, swan-neck pylon
  const rz = -b - .55;
  kit.box('trim', CB, 1.02, .03, .3, 0, .84, rz + .02, -.15);
  kit.box('paint', S, 1.02, .025, .2, 0, .93, rz - .14, -.5);
  for (const s of [1, -1]) { kit.box('paint', P, .02, .68, .78, s * .51, .64, rz - .05); kit.box('paint', S, .022, .02, .78, s * .51, .98, rz - .05); }
  kit.box('trim', CB, .9, .025, .2, 0, .44, rz + .12, -.2);
  kit.box('trim', CB, .04, .46, .12, 0, .6, rz + .08);
  kit.box('brake', null, .08, .05, .03, 0, .33, zT - .02);
  // halo (titanium, painted black) and mirrors
  haloTube(kit, 'trim', DK, [[0, .64, .8], [0, .78, .66], [0, .9, .47]], .021);
  haloTube(kit, 'trim', DK, [[.31, .63, -.3], [.35, .8, -.12], [.32, .89, .12], [.17, .905, .36], [0, .91, .46], [-.17, .905, .36], [-.32, .89, .12], [-.35, .8, -.12], [-.31, .63, -.3]], .023);
  for (const s of [1, -1]) {
    kit.bar('trim', CB, [s * .34, .62, .66], [s * .5, .69, .62], .02);
    kit.box('trim', CB, .14, .06, .05, s * .53, .7, .62);
    kit.box('gloss', C3('#aab8c6'), .125, .045, .006, s * .53, .7, .594);
  }
  // suspension (wishbones, pushrods, uprights, brake ducts)
  const hF = .84, hR = .79;
  singleSeaterSuspension(kit, CB, a, -b, hF, hR, R);
  kit.box('trim', SIL, .5, .01, .3, 0, .655, .95); // silver strip on the nose shoulder
  // driver (hidden in the cockpit view)
  hk.put('paint', new THREE.SphereGeometry(.13, 18, 14), C3(spec.helmet || '#e8e8e8'), hk.xf(0, .755, -.04));
  hk.put('paint', new THREE.TorusGeometry(.128, .012, 6, 28, Math.PI).rotateY(Math.PI / 2).rotateX(-Math.PI / 2), out.col2, hk.xf(0, .76, -.04)); // stripe over the crown
  hk.box('gloss', C3('#1b2530'), .2, .05, .08, 0, .775, .06);
  hk.box('trim', C3('#1c1d20'), .42, .12, .3, 0, .6, -.05);
  addWheels(out, R, .305, .405, hF, hR, true, .55);
  out.eye = new THREE.Vector3(0, .74, -.05);
  if (!out.lite) addWheelAndDash(out, out.eye, 'f1', new THREE.Vector3(0, .625, .36));
  // T-cam: on top of the airbox, right behind and above the helmet (the helmet fills the lower middle of the frame)
  out.cams = { onboard: new THREE.Vector3(0, 1.06, -.34), onPitch: -0.2, chaseDist: 6.4, chaseH: 1.7, inPitch: -0.03 };
}

// ---------------------------------------------------------------------------
//  Aston Martin Valkyrie (road) and Valkyrie AMR Pro (track)
//  Teardrop cockpit pod, separate front fender pods with tunnels underneath,
//  rear fenders over wide sidepods, venturi floor; AMR Pro: long tail, big wing and fins.
// ---------------------------------------------------------------------------
function buildValkyrie(out, spec, liv) {
  const { kit, hk, a, b, W } = out;
  const amr = !!spec.amr;
  const R = 0.35, P = out.col1, S = out.col2, CB = C3(CARBON), DK = C3('#101113'), G = C3(GLASS);
  const over = spec.len - spec.wb, zF = a + over * 0.5, zR = -b - over * 0.5;
  const hw = W / 2;
  // central fuselage: nose between the pods, cockpit (open tub under the canopy), engine bay
  kit.put('paint', loft([
    { z: zF - .02, w: .34, y0: .12, y1: .28, n: 3 },
    { z: a + .15, w: .56, y0: .1, y1: .44, n: 3.2 },
    { z: a - .3, w: .78, y0: .08, y1: .6, n: 3.6 },
    { z: a - .55, w: .86, y0: .08, y1: .63, n: 3.8 }
  ], 20), P);
  const z1 = a - .55, z0 = -.72;
  kit.put('paint', loft([
    { z: z0, w: 1.0, y0: .08, y1: .68, n: 4 },
    { z: -1.3, w: .86, y0: .09, y1: .7, n: 4 },
    { z: zR + .35, w: .6, y0: .14, y1: .6, n: 3.5 },
    { z: zR + .05, w: .42, y0: .2, y1: .5, n: 3 }
  ], 20), P);
  openCockpit(out, { z0, z1, halfIn: .38, out0: .5, out1: .43, yFloor: .1, rim0: .68, rim1: .63, P, DK, CB });
  // canopy: glass bubble with a painted roof spine
  const canopy = [
    { z: z1 + .02, w: .8, y0: .6, y1: .66, n: 3 }, { z: .45, w: .96, y0: .6, y1: .96, n: 3.2 }, { z: .05, w: 1.0, y0: .62, y1: 1.06, n: 3.4 },
    { z: -.4, w: .96, y0: .64, y1: 1.04, n: 3.4 }, { z: z0 - .05, w: .8, y0: .66, y1: .93, n: 3.2 }, { z: -1.25, w: .5, y0: .68, y1: .8, n: 3 }];
  kit.put('gloss', loft(canopy, 20), G);
  kit.put('paint', loft([{ z: .5, w: .2, y0: .9, y1: .975, n: 3 }, { z: .05, w: .34, y0: 1.0, y1: 1.075, n: 3 }, { z: -.45, w: .34, y0: .98, y1: 1.055, n: 3 }, { z: -1.2, w: .2, y0: .76, y1: .83, n: 3 }], 12), P);
  // front fender pods (wheel covers) with round lamp clusters, tunnels between pods and nose
  const px = hw - .23;
  for (const s of [1, -1]) {
    kit.put('paint', loft([
      { z: zF - .04, w: .3, y0: .25, y1: .44, n: 2.8, x: s * px }, { z: a + .5, w: .44, y0: .2, y1: .62, n: 3.2, x: s * px },
      { z: a + .12, w: .48, y0: .42, y1: .76, n: 3.6, x: s * px }, { z: a - .32, w: .46, y0: .44, y1: .74, n: 3.6, x: s * px },
      { z: a - .7, w: .28, y0: .52, y1: .63, n: 3, x: s * px }], 16), P);
    kit.put('gloss', new THREE.CylinderGeometry(.085, .085, .03, 20).rotateX(Math.PI / 2), C3('#161c23'), kit.xf(s * px, .44, a + .5, -.35, 0, 0));
    for (let k = 0; k < 7; k++) { const t = k / 7 * Math.PI * 2; kit.put('light', new THREE.SphereGeometry(.012, 6, 4), C3('#f2f7ff'), kit.xf(s * px + Math.cos(t) * .045, .44 + Math.sin(t) * .045 * .94, a + .517)); }
    kit.put('light', new THREE.SphereGeometry(.014, 6, 4), C3('#f2f7ff'), kit.xf(s * px, .44, a + .518));
    kit.box('trim', DK, .3, .12, .02, s * (hw - .28), .2, a + .52); // pod intake below the lamp
    // doors / flanks sweeping in behind the front wheel, then the rear fender over the sidepod
    kit.put('paint', loft([
      { z: a - .6, w: .16, y0: .2, y1: .55, n: 3, x: s * (hw - .42) }, { z: .1, w: .32, y0: .14, y1: .62, n: 3.6, x: s * (hw - .36) },
      { z: -b + .45, w: .52, y0: .14, y1: .72, n: 4.5, x: s * (hw - .27) }, { z: -b, w: .52, y0: .44, y1: .78, n: 4.5, x: s * (hw - .26) },
      { z: -b - .45, w: .5, y0: .38, y1: .75, n: 4.5, x: s * (hw - .26) }, { z: zR + .02, w: .48, y0: .34, y1: .72, n: 4.5, x: s * (hw - .27) }], 16), P);
    kit.box('trim', DK, .02, .24, .34, s * (hw - .2), .4, -b + .55); // side radiator intake
    kit.box('brake', null, .36, .018, .012, s * (hw - .27), .66, zR + .018);
    kit.box('trim', DK, .38, .2, .01, s * (hw - .27), .48, zR + .02);
    // rear-view camera pods: small teardrops sitting on the fuselage shoulder beside the canopy
    kit.put('paint', loft([{ z: a - .42, w: .03, y0: .655, y1: .675, n: 2.4, x: s * .47 }, { z: a - .5, w: .07, y0: .64, y1: .7, n: 2.6, x: s * .475 }, { z: a - .6, w: .06, y0: .64, y1: .69, n: 2.6, x: s * .47 }], 10), P);
    kit.box('trim', DK, .04, .03, .01, s * .475, .67, a - .607);
  }
  // floor, splitter between the pods, venturi diffuser
  kit.box('trim', CB, W * .7, .03, zF - zR - .5, 0, .05, (zF + zR) / 2);
  kit.box('trim', CB, W * .5, .025, .45, 0, .08, zF - .2);
  kit.box('trim', CB, W * .78, .03, .62, 0, .17, zR + .28, -.35);
  for (const s of [.2, -.2, .45, -.45]) kit.box('trim', CB, .012, .2, .6, s, .2, zR + .28, -.35);
  // rear wing (road: active blade on the tail; AMR Pro: big wing on swan necks, tall fins, dorsal fin)
  if (amr) {
    const wz = zR + .2;
    kit.box('trim', CB, 1.72, .035, .38, 0, 1.12, wz, -.12);
    kit.box('paint', S, 1.72, .012, .06, 0, 1.15, wz - .18, -.4);
    for (const s of [1, -1]) {
      kit.bar('trim', CB, [s * .3, .7, wz + .35], [s * .3, 1.1, wz + .08], .03);
      kit.box('paint', P, .025, .62, 1.05, s * .86, .95, wz + .2);
      kit.box('paint', S, .027, .015, 1.0, s * .86, 1.26, wz + .2);
    }
    kit.box('paint', P, .014, .3, 1.5, 0, .98, -1.05, .12);
    kit.box('trim', DK, .1, .06, .16, 0, 1.1, -.1); // roof intake
  } else {
    kit.box('paint', P, 1.3, .03, .28, 0, .82, zR + .38, -.08);
    for (const s of [1, -1]) kit.box('trim', CB, .02, .14, .2, s * .5, .74, zR + .4);
  }
  // wheels (gold calipers)
  out.caliper = '#d9a300';
  addWheels(out, R, amr ? .3 : .27, amr ? .345 : .33, hw - (amr ? .3 : .27) / 2 - .035, hw - (amr ? .345 : .33) / 2 - .035, amr, .72);
  // driver (seen from outside only)
  const dx = .2;
  hk.put('paint', new THREE.SphereGeometry(.125, 14, 10), C3(spec.helmet || '#d9dde1'), hk.xf(dx, .83, -.12));
  hk.box('trim', C3('#1c1d20'), .4, .12, .3, dx, .66, -.1);
  // cameras + cockpit
  const eye = new THREE.Vector3(dx, .855, -.05);
  out.eye = eye;
  out.cams = { onboard: new THREE.Vector3(0, 1.2, -.2), onPitch: -0.07, onLabel: 'techo', chaseDist: 3.8 + spec.len * 0.62, chaseH: 1.25 + spec.hgt * 0.45, inPitch: -0.05 };
  if (out.lite) return;
  valkyrieCabin(out, { E: eye, z0, z1, a, amr });
}
// Valkyrie cockpit: carbon everywhere, a rectangular wheel with its own screen, camera "mirror" screens
// on the pillars, a small centre display, canopy frame overhead
function valkyrieCabin(out, o) {
  carMaterials(); cabinMaterials();
  const { E, z1 } = o, I = out.interior, ik = new Kit(), col = (h) => C3(h);
  const cCarb = col('#1d1e21'), cAlc = col('#2a2b2e'), cStitch = col('#b8c94a');
  const yD = .66, zDr = E.z + .6;
  // dash shelf (carbon) from the windshield base back towards the driver, with an alcantara edge
  ik.box('cab', cCarb, .9, .08, z1 - zDr + .04, 0, yD, (z1 + zDr) / 2);
  ik.box('cab', cAlc, .9, .05, .06, 0, yD + .02, zDr + .02);
  ik.box('cab', cStitch, .86, .003, .004, 0, yD + .046, zDr + .005);
  // camera mirror screens on the A-pillars and a centre display
  for (const s of [1, -1]) {
    const x = s * .43 + (s > 0 ? .02 : 0), y = yD + .14, z = zDr + .12;
    ik.box('cab', cCarb, .15, .1, .03, x, y, z);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.135, .085), CM.mirrorGlass); m.position.set(x, y, z - .017); m.rotation.y = Math.PI; I.add(m);
    ik.bar('cab', cCarb, [x, y - .05, z + .02], [s * .38, yD, z + .06], .02);
  }
  ik.box('cab', cCarb, .2, .13, .025, -.08, yD + .12, zDr + .2);
  { const nv = new THREE.Mesh(new THREE.PlaneGeometry(.185, .115), CM.navScreen || CM.mirrorGlass); nv.position.set(-.08, yD + .12, zDr + .185); nv.rotation.y = Math.PI; I.add(nv); }
  // canopy frame and roof spine overhead, rear-view mirror
  for (const s of [1, -1]) {
    const pts = [[s * .4, .63, z1 + .02], [s * .48, .8, .5], [s * .48, .95, .1], [s * .45, .97, -.4]];
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    ik.put('lit', new THREE.TubeGeometry(curve, 24, .017, 8, false), col('#222326'));
  }
  // headliner: a dark copy of the roof spine just under it
  ik.put('lit', loft([{ z: .5, w: .19, y0: .885, y1: .96, n: 3 }, { z: .05, w: .33, y0: .985, y1: 1.06, n: 3 }, { z: -.45, w: .33, y0: .965, y1: 1.04, n: 3 }, { z: -1.2, w: .19, y0: .745, y1: .815, n: 3 }], 12), col('#232427'));
  ik.box('cab', cCarb, .2, .055, .025, 0, .95, .38);
  { const mg = new THREE.Mesh(new THREE.PlaneGeometry(.185, .045), CM.mirrorGlass); mg.position.set(0, .95, .366); mg.rotation.y = Math.PI; I.add(mg); }
  // centre tunnel with switches, seat edges
  ik.box('cab', cCarb, .2, .22, zDr - E.z + .2, 0, .3, (zDr + E.z) / 2);
  for (let k = 0; k < 4; k++) ik.box('gloss', col(k === 1 ? '#c8283a' : '#8d9197'), .02, .012, .02, -.05 + k * .033, .415, zDr - .12);
  cabinAdd(ik, I);
  // cluster canvas (drawn live) shown on the wheel
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  out.dash = { cv, ctx: cv.getContext('2d'), tex, last: 0, style: 'race', W: 512, H: 160 };
  wheelRig(out, { pos: new THREE.Vector3(E.x, E.y - .24, E.z + .47), tilt: 0.28, race: true, round: false, f1: true, tex,
    sleeve: new THREE.Color('#2a2f38'), elbowX: .25, elbowY: E.y - .44, elbowZ: E.z + .12 });
}

// ---------------------------------------------------------------------------
//  Bugatti Bolide (track hypercar): shrink-wrapped carbon body, tall front fender pods with air channels
//  beside the nose, narrow teardrop canopy with a roof scoop feeding the engine, high rear fenders,
//  big wing on swan necks with tall endplates, huge diffuser. Blue alcantara cockpit, yoke + display.
//  Proportions and layout only: no badges, logos or signature light graphics.
// ---------------------------------------------------------------------------
function buildBolide(out, spec, liv) {
  const { kit, hk, a, b, W } = out;
  const P = out.col1, S = out.col2, CB = C3(CARBON), DK = C3('#0c0d0f'), G = C3(GLASS);
  const R = 0.345, wF = 0.3, wR = 0.34, hw = W / 2;
  const halfF = hw - wF / 2 - 0.035, halfR = hw - wR / 2 - 0.035;
  const zF = a + 0.95, zR = -b - 1.02;
  // floor, splitter, channel floors
  kit.box('trim', CB, W * 0.9, 0.035, zF - zR - 0.35, 0, 0.06, (zF + zR) / 2 - 0.05);
  kit.box('trim', CB, W * 0.9, 0.025, 0.4, 0, 0.05, zF - 0.2);
  // central fuselage: nose -> cockpit -> engine bay -> tail
  // (split around the open cockpit tub so the driver, wheel and dash are not buried inside the shell)
  const z1 = a - .55, z0 = -.78;
  kit.put('paint', loft([
    { z: zF, w: .44, y0: .1, y1: .25, n: 2.8 }, { z: a + .55, w: .6, y0: .08, y1: .4, n: 3.2 }, { z: a, w: .74, y0: .08, y1: .48, n: 3.6 },
    { z: z1, w: .92, y0: .08, y1: .56, n: 4 }], 22), P);
  kit.put('paint', loft([
    { z: z0, w: 1.1, y0: .08, y1: .62, n: 4.2 }, { z: -b + .2, w: 1.08, y0: .09, y1: .63, n: 4 }, { z: -b - .4, w: 1.0, y0: .14, y1: .6, n: 3.6 },
    { z: zR + .12, w: .86, y0: .2, y1: .52, n: 3.2 }, { z: zR, w: .78, y0: .24, y1: .47, n: 2.8 }], 22), P);
  openCockpit(out, { z0, z1, halfIn: .4, out0: .55, out1: .46, yFloor: .1, rim0: .62, rim1: .56, P, DK, CB });
  for (const s of [1, -1]) {
    // front fender pods over the wheels (upper half: the tyre shows below), cheek joining them to the nose
    kit.put('paint', loft([
      { z: zF - .06, w: .38, y0: .16, y1: .34, n: 3.4, x: s * (halfF - .05) }, { z: a + .5, w: .5, y0: .24, y1: .6, n: 4, x: s * halfF },
      { z: a + .1, w: .54, y0: .43, y1: .77, n: 4.4, x: s * halfF }, { z: a - .3, w: .52, y0: .45, y1: .75, n: 4.4, x: s * halfF },
      { z: a - .78, w: .36, y0: .49, y1: .62, n: 3.6, x: s * (halfF - .03) }], 16), P);
    kit.put('paint', loft([{ z: zF - .08, w: .46, y0: .1, y1: .3, n: 3, x: s * .44 }, { z: a + .55, w: .5, y0: .12, y1: .42, n: 3.2, x: s * .5 }, { z: a + .2, w: .36, y0: .16, y1: .4, n: 3, x: s * .56 }], 12), P);
    kit.box('trim', CB, .36, .03, 1.1, s * .56, .21, a - .3); // air-channel floor between pod and fuselage
    // accent stripe on the crown of each pod (same stations -> follows the surface)
    kit.put('paint', loft([{ z: a + .5, w: .05, y0: .589, y1: .604, n: 2.2, x: s * halfF }, { z: a + .1, w: .05, y0: .76, y1: .775, n: 2.2, x: s * halfF }, { z: a - .3, w: .05, y0: .74, y1: .755, n: 2.2, x: s * halfF }], 8), S);
    // front: slim LED bar on each pod nose, big lower intakes
    kit.box('light', C3('#f2f7ff'), .17, .018, .02, s * (halfF - .03), .4, zF - .1, 0, 0, s * .35);
    kit.box('trim', DK, .34, .14, .02, s * .62, .2, zF - .22);
    // sidepods between the wheels with a deep intake behind the front wheel
    kit.put('paint', loft([{ z: a - .6, w: .32, y0: .12, y1: .42, n: 3, x: s * .72 }, { z: .0, w: .48, y0: .1, y1: .54, n: 3.6, x: s * .74 }, { z: -b + .5, w: .5, y0: .1, y1: .6, n: 3.8, x: s * .74 }], 14), P);
    kit.box('trim', DK, .3, .28, .03, s * .74, .3, a - .6);
    kit.box('trim', CB, .05, .06, a + b - 1.3, s * (hw - .06), .1, (a - b) / 2); // side skirt
    // rear fenders, tall over the wheels
    kit.put('paint', loft([
      { z: -b + .78, w: .4, y0: .3, y1: .56, n: 3, x: s * (halfR - .04) }, { z: -b + .3, w: .54, y0: .42, y1: .8, n: 3.8, x: s * halfR },
      { z: -b - .2, w: .54, y0: .44, y1: .8, n: 3.8, x: s * halfR }, { z: -b - .7, w: .48, y0: .36, y1: .66, n: 3.4, x: s * halfR },
      { z: zR + .05, w: .42, y0: .3, y1: .56, n: 3, x: s * (halfR - .02) }], 16), P);
    kit.box('trim', DK, .02, .2, .36, s * (hw - .03), .56, -b + .72); // fender intake
    // tail lights on the fender backs + mirrors (camera pods beside the canopy)
    kit.box('brake', null, .3, .035, .02, s * (halfR - .02), .5, zR + .06);
    kit.put('paint', loft([{ z: a - .5, w: .03, y0: .6, y1: .62, n: 2.4, x: s * .5 }, { z: a - .58, w: .07, y0: .585, y1: .645, n: 2.6, x: s * .505 }, { z: a - .68, w: .06, y0: .585, y1: .635, n: 2.6, x: s * .5 }], 10), P);
  }
  // canopy: narrow teardrop with a painted spine and the roof scoop that runs down onto the engine cover
  kit.put('gloss', loft([
    { z: a - .55, w: .66, y0: .54, y1: .6, n: 3 }, { z: a - .9, w: .88, y0: .54, y1: .8, n: 3.2 }, { z: .1, w: .94, y0: .56, y1: .9, n: 3.4 },
    { z: -.35, w: .88, y0: .58, y1: .89, n: 3.4 }, { z: -.8, w: .7, y0: .6, y1: .8, n: 3.2 }, { z: -1.25, w: .44, y0: .61, y1: .68, n: 3 }], 20), G);
  kit.put('paint', loft([{ z: .02, w: .28, y0: .86, y1: .94, n: 3 }, { z: -.35, w: .36, y0: .85, y1: .99, n: 3.2 }, { z: -1.0, w: .3, y0: .66, y1: .88, n: 3 }, { z: -1.65, w: .2, y0: .56, y1: .68, n: 2.8 }], 16), P);
  kit.box('trim', DK, .24, .07, .02, 0, .905, .025); // scoop mouth
  for (let k = 0; k < 4; k++) for (const s of [1, -1]) kit.box('trim', DK, .22, .01, .05, s * .28, .63 - k * .015, -1.3 - k * .12, -.12); // engine cover louvres
  // rear wing on swan necks, endplates reaching down to the fenders, gurney in the accent colour
  const wy = 1.16, wz = zR + .3;
  kit.box('trim', CB, W * .96, .04, .42, 0, wy, wz, -.08);
  kit.box('trim', CB, W * .96, .03, .16, 0, wy + .07, wz - .25, -.45);
  kit.box('paint', S, W * .96, .012, .02, 0, wy + .115, wz - .33);
  for (const s of [1, -1]) {
    kit.bar('trim', CB, [s * .28, .56, wz + .5], [s * .28, wy + .05, wz + .12], .035);
    kit.box('trim', CB, .025, .62, .7, s * W * .48, wy - .2, wz - .02);
  }
  // tail: bar light, diffuser, twin central exhausts
  kit.box('brake', null, W * .5, .025, .02, 0, .46, zR + .005);
  kit.box('trim', CB, W * .84, .2, .55, 0, .17, zR + .25, .32);
  for (const x of [-.36, -.18, 0, .18, .36]) kit.box('trim', CB, .012, .2, .5, x, .2, zR + .26, .32);
  for (const s of [1, -1]) kit.cyl('gloss', C3('#3a3b3e'), .06, .065, .12, 14, s * .11, .36, zR + .02, Math.PI / 2, 0, 0);
  // wheels (blue calipers)
  out.caliper = '#2a62d8';
  addWheels(out, R, wF, wR, halfF, halfR, true, .72);
  // driver (seen from outside)
  const dx = .2;
  hk.put('paint', new THREE.SphereGeometry(.125, 14, 10), C3(spec.helmet || '#1d2b4a'), hk.xf(dx, .71, -.16));
  hk.box('trim', C3('#1c1d20'), .4, .12, .3, dx, .6, -.1);
  const eye = new THREE.Vector3(dx, .73, -.1);
  out.eye = eye;
  out.cams = { onboard: new THREE.Vector3(0, 1.08, -.45), onPitch: -0.06, onLabel: 'techo', chaseDist: 3.8 + spec.len * 0.62, chaseH: 1.2 + spec.hgt * 0.45, inPitch: -0.05 };
  if (out.lite) return;
  bolideCabin(out, { E: eye, a });
}
// Bolide cockpit: bare carbon tub with blue alcantara, yoke wheel, wide display on the column,
// centre console with a button pad, canopy frame overhead
function bolideCabin(out, o) {
  carMaterials(); cabinMaterials();
  const { E, a } = o, I = out.interior, ik = new Kit(), col = (h) => C3(h);
  const cCarb = col('#1b1c1f'), cBlue = col('#2553c7'), cDark = col('#26282c');
  const z1 = a - .55, yD = .55, zDr = E.z + .6;
  // dash shelf in carbon with a blue alcantara brow, flanks of the tub in blue
  ik.box('cab', cCarb, .86, .07, z1 - zDr + .04, 0, yD, (z1 + zDr) / 2);
  ik.box('cab', cBlue, .86, .045, .07, 0, yD + .02, zDr + .02);
  for (const s of [1, -1]) {
    ik.box('cab', cBlue, .06, .2, .9, s * .43, .48, E.z + .2);
    ik.box('cab', cCarb, .08, .05, 1.0, s * .44, .6, E.z + .25);
  }
  // seat back + headrest in blue with carbon shell
  ik.box('cab', cBlue, .42, .5, .08, E.x, .5, E.z - .28, -.2, 0, 0);
  ik.box('cab', cCarb, .46, .54, .04, E.x, .5, E.z - .33, -.2, 0, 0);
  // centre console: carbon spine with a button pad, twin air ducts
  ik.box('cab', cCarb, .2, .24, zDr - E.z + .25, 0, .3, (zDr + E.z) / 2 + .05);
  ik.box('cab', cDark, .14, .01, .22, 0, .425, zDr - .2);
  const bc = ['#d23a2a', '#2f7de1', '#e6e6e6', '#e8b400'];
  for (let k = 0; k < 8; k++) ik.box('gloss', col(bc[k % 4]), .022, .01, .022, -.04 + (k % 2) * .08, .432, zDr - .28 + Math.floor(k / 2) * .045);
  // canopy frame overhead + roof spine lining
  for (const s of [1, -1]) {
    const pts = [[s * .33, .58, z1 + .02], [s * .42, .74, a - .9], [s * .44, .86, .1], [s * .42, .86, -.35]];
    ik.put('lit', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 24, .016, 8, false), col('#222326'));
  }
  ik.put('lit', loft([{ z: .05, w: .24, y0: .835, y1: .86, n: 3 }, { z: -.35, w: .3, y0: .84, y1: .88, n: 3 }, { z: -.75, w: .24, y0: .76, y1: .8, n: 3 }], 12), col('#1f2023'));
  cabinAdd(ik, I);
  // wide display on the column above the yoke (live cluster)
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  out.dash = { cv, ctx: cv.getContext('2d'), tex, last: 0, style: 'race', W: 512, H: 160 };
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(.25, .078), new THREE.MeshBasicMaterial({ map: tex }));
  scr.position.set(E.x, E.y - .1, E.z + .6); scr.lookAt(E.x, E.y, E.z); scr.renderOrder = 2; I.add(scr);
  { const hb = new Kit(), h = new THREE.Object3D(); h.position.set(E.x, E.y - .1, E.z + .6); h.lookAt(E.x, E.y, E.z); h.translateZ(-.022); h.updateMatrix();
    hb.put('cab', new THREE.BoxGeometry(.27, .09, .03), cCarb, h.matrix); cabinAdd(hb, I); }
  wheelRig(out, { pos: new THREE.Vector3(E.x, E.y - .23, E.z + .48), tilt: 0.3, race: true, round: false, f1: true,
    sleeve: new THREE.Color('#1d2b4a'), elbowX: .25, elbowY: E.y - .46, elbowZ: E.z + .12 });
}

// ---------------------------------------------------------------------------
//  Bugatti Chiron: sculpted W16 hypercar body. Muscular front fenders standing above a short hood that
//  drops to a tall central intake, slim lamps on the fender faces, large lower intakes, a sweeping side
//  intake behind the door (the two-tone split follows its front edge), bubble roof with a central spine,
//  long engine deck, tall rounded tail with a full-width light bar, big diffuser, large wheels.
//  Proportions and layout only: no badges, lettering or logos.
// ---------------------------------------------------------------------------
function buildChiron(out, spec, liv) {
  const { kit, a, b, L, W, H } = out;
  const P1 = out.col1, P2 = liv.pattern === 'solido' || !liv.pattern ? out.col2 : out.col2, BK = C3(BLACK), CB = C3(CARBON), DK = C3('#0c0d0f'), UB = C3('#0e0f10'), G = C3(GLASS);
  const two = liv.pattern !== 'banda'; // default livery: light front / dark rear
  const R = 0.37, Ra = R + 0.04, wF = 0.29, wR = 0.36, clr = 0.1;
  const zF = a + 1.0, zR = zF - L;
  const cv = (pts) => (z) => curveAt(pts, z);
  // ---- key curves along the body (z -> value)
  const yb = cv([[zR, .3], [zR + .35, .16], [-.9, .1], [a - .3, .1], [zF - .4, .12], [zF, .2]]);
  const hwB = cv([[zR, .8], [zR + .12, .9], [zR + .45, .985], [-b, 1.0], [-b + .6, .975], [-.2, .945], [.4, .945], [a - .35, .975], [a, .985], [a + .45, .96], [zF - .3, .9], [zF - .1, .78], [zF, .6]]);
  const yMid = cv([[zR, .6], [-b, .56], [0, .5], [a, .46], [zF, .38]]);
  const ySh = cv([[zR, .86], [zR + .3, .92], [-b, .96], [-b + .55, .88], [-.2, .78], [.5, .74], [a - .2, .79], [a + .1, .8], [a + .5, .74], [zF - .22, .64], [zF, .55]]);
  const yFt = cv([[zR, .9], [zR + .3, .96], [-b, 1.0], [-b + .6, .92], [-.2, .82], [.5, .78], [a - .15, .845], [a + .15, .85], [a + .55, .77], [zF - .2, .66], [zF, .56]]);
  const yH = cv([[zR, .88], [zR + .25, .96], [zR + .6, .99], [-1.2, 1.0], [-.6, .97], [.95, .8], [a, .74], [a + .45, .68], [zF - .25, .62], [zF - .06, .57], [zF, .53]]);
  const archY = (z) => { let best = null; for (const za of [a, -b]) { const d = (z - za) / Ra; if (Math.abs(d) < 1) { const y = clr + (R + Ra - clr) * Math.sqrt(1 - d * d); if (best == null || y > best) best = y; } } return best; };
  const zA = .95, zB = .33, zC = -.38, zD = -1.32; // windshield base, roof front / rear, rear-glass base
  const cabF = (z) => smoothstep(zC - .3, zC - .14, z) * (1 - smoothstep(zA - .3, zA - .15, z));
  // the C-line: from the A-pillar base back along the beltline, round behind the door and forward under it.
  // Inside the C (door) and the whole nose: front colour; shoulders, roof and the rear: rear colour.
  const zT0 = .66, zCc = -.44, yCb = .25, yCt = (z) => ySh(z) - .045, rC = (yCt(zCc) - yCb) / 2, yCc = yCb + rC;
  // ---- cross-section: 13 points on the left half (bottom centre -> side -> top centre)
  const sec = (z) => {
    const y0 = yb(z), hw = hwB(z), ay = archY(z), fy = ay != null ? Math.max(ay, y0) : y0;
    const sh = Math.max(ySh(z), fy + .12), ft = Math.max(yFt(z), sh + .02), yh = Math.min(yH(z), ft - .005);
    const ym = clamp(yMid(z), fy + .06, sh - .08), xin = hw - .3;
    const r = [[0, y0], [xin, y0], [xin + .003, fy], [hw - .06, fy], [hw - .015, fy + .045], [hw, lerp(fy + .06, ym, .5)], [hw + .03, ym], [hw + .005, lerp(ym, sh, .6)],
      [hw - .055, sh], [hw - .17, ft], [hw - .34, lerp(ft, yh, .55)], [.24, yh + .012], [0, yh]];
    const cf = cabF(z); if (cf > 0) { const yT = y0 + .32; for (let k = 10; k <= 12; k++) r[k][1] = lerp(r[k][1], yT, cf); }
    return r;
  };
  const ring = (z) => { const Lh = sec(z), r = Lh.slice(); for (let k = 11; k >= 1; k--) r.push([-Lh[k][0], Lh[k][1]]); return r; };
  const zs = []; for (let z = zR; z < zF - 1e-6;) { zs.push(z); const near = Math.min(Math.abs(z - a), Math.abs(z + b)) < Ra + .06, end = z < zR + .25 || z > zF - .3; z += near ? .04 : end ? .035 : .1; }
  for (let zz = zCc - rC - .06; zz < zT0 + .06; zz += .04) if (!zs.some(v => Math.abs(v - zz) < .012)) zs.push(zz);
  for (const zz of [zT0]) if (!zs.some(v => Math.abs(v - zz) < .005)) zs.push(zz);
  zs.sort((p, q) => p - q); zs.push(zF);
  // the side intake behind the door sweeps forward in the middle of its height; the paint split follows it
  const scoopEdge = (s) => .24, scoopBack = -b + Ra + .06;
  const tag = (s, z) => {
    const inArch = archY(z) != null;
    if (s >= 10 && cabF(z) > .001) return ['cabin', C3('#1c1d20')];
    if (s === 0) return ['trim', UB];
    if (s <= 2) return ['trim', BK];
    if (s === 3) return inArch ? ['trim', BK] : ['trim', C3('#17181b')];
    return ['paint', two && z < zT0 ? P2 : P1];
  };
  const face0 = yb(zF), face1 = yH(zF);
  loftShell(kit, zs, ring, 24, (k) => (k <= 12 ? k : 24 - k), tag,
    { outer: ['paint', P1], inner: ['paint', P1], center: [0, face0 + (face1 - face0) * .45], scale: .55, bulge: .03 },
    { outer: ['paint', two ? P2 : P1], inner: ['paint', two ? P2 : P1], center: [0, .6], scale: .5, bulge: .02 });
  // ---- C-line overlay: the door area inside the C in the front colour, the side intake recessed in the C's
  // rear curve, and the polished C strip on top (a thin shell just off the side surface, both sides)
  const sideX = (z, y) => { const S = sec(z); if (y <= S[3][1]) return S[3][0]; for (let k = 3; k < 9; k++) { const p0 = S[k], p1 = S[k + 1]; if (y >= p0[1] && y <= p1[1]) return lerp(p0[0], p1[0], (y - p0[1]) / Math.max(1e-6, p1[1] - p0[1])); } return S[9][0]; };
  const inC = (z, y) => (z >= zCc && z <= zT0 + .001 && y <= yCt(z) && y >= yCb - .14) || (z < zCc && Math.hypot(z - zCc, y - yCc) <= rC);
  const inIntake = (z, y) => { if (z > zCc + .02) return false; const d = Math.hypot(z - zCc, y - yCc); return d < rC - .045 && d > rC - .2 && y > yCc - .11; };
  if (two || true) {
    const ov = new GeoBuilder(false), ik = new GeoBuilder(false), yLo = yCb - .14;
    const quadS = (g, P4, col, off) => { for (const sd of [1, -1]) { const q = ([zz, yy]) => [sd * (sideX(zz, yy) + off), yy, zz]; const [A, B, Cc, D] = P4.map(q); if (sd > 0) g.quad(A, D, Cc, B, col); else g.quad(A, B, Cc, D, col); } };
    // door panel: columns from the sill up to the C's top run
    const NZ = Math.ceil((zT0 - zCc) / .03), NY = 14;
    for (let i = 0; i < NZ; i++) { const za = lerp(zCc, zT0, i / NZ), zb2 = lerp(zCc, zT0, (i + 1) / NZ);
      for (let j = 0; j < NY; j++) { const ya = (z) => lerp(yLo, yCt(z), j / NY), yb3 = (z) => lerp(yLo, yCt(z), (j + 1) / NY);
        quadS(ov, [[za, ya(za)], [zb2, ya(zb2)], [zb2, yb3(zb2)], [za, yb3(za)]], P1, .007); } }
    // rear of the C: half disc (front colour) with the intake recessed in a ring inside it
    const NA = 24, rI0 = rC - .2, rI1 = rC - .045;
    const pol = (th, rr) => [zCc + Math.cos(th) * rr, yCc + Math.sin(th) * rr];
    for (let k = 0; k < NA; k++) { const t0 = Math.PI / 2 + k / NA * Math.PI, t1 = Math.PI / 2 + (k + 1) / NA * Math.PI;
      const rings = [0, rI0, rI1, rC];
      for (let m = 0; m < 3; m++) { const ra = rings[m], rb = rings[m + 1];
        const intake = m === 1 && Math.min(pol(t0, rI0)[1], pol(t1, rI0)[1]) > yCc - .13;
        quadS(intake ? ik : ov, [pol(t0, ra), pol(t1, ra), pol(t1, rb), pol(t0, rb)].reverse(), intake ? DK : P1, intake ? -.004 : .007); } }
    // below the half disc down to the sill line
    for (let k = 0; k < 4; k++) { const za = zCc - rC * (1 - k / 4), zb2 = zCc - rC * (1 - (k + 1) / 4); const yA = yCc - Math.sqrt(Math.max(0, rC * rC - (za - zCc) ** 2)), yB = yCc - Math.sqrt(Math.max(0, rC * rC - (zb2 - zCc) ** 2)); if (yA > yLo + .01) quadS(ov, [[za, yLo], [zb2, yLo], [zb2, yB], [za, yA]], P1, .007); }
    if (two) kit.put('paint', ov.build(), null);
    kit.put('trim', ik.build(), null);
    // intake slats
    for (const sd of [1, -1]) for (let k = 0; k < 4; k++) { const ang = Math.PI * (.62 + k * .1), zz = zCc + Math.cos(ang) * (rC - .12), yy = yCc + Math.sin(ang) * (rC - .12) - .02; kit.box('trim', C3('#2a2d31'), .01, .12, .015, sd * (sideX(zz, yy) - .01), yy, zz, 0, 0, 0); }
    // polished C strip
    const path = [];
    for (let z = zT0 + .04; z > zCc; z -= .06) path.push([z, yCt(z) + .01]);
    for (let k = 0; k <= 14; k++) { const th = Math.PI / 2 + k / 14 * Math.PI; path.push([zCc + Math.cos(th) * (rC + .01), yCc + Math.sin(th) * (rC + .01)]); }
    for (let z = zCc + .06; z < .5; z += .08) path.push([z, yCb - .01]);
    for (const sd of [1, -1]) haloTube(kit, 'gloss', C3('#c3c8cd'), path.map(([z, y]) => [sd * (sideX(z, y) + .012), y, z]), .016);
  }
  // ---- greenhouse: bubble roof on the beltline, rear glass then louvred engine cover
  const roofAt = (z) => {
    if (z >= zB) { const u = (z - zB) / (zA - zB); return lerp(H, .845, u) + .04 * Math.sin(u * Math.PI) * (1 - u * .5); }
    if (z <= zC) { const u = clamp((zC - z) / (zC - zD), 0, 1); return lerp(H - .01, .99, Math.pow(u, .85)) + .04 * Math.sin(u * Math.PI); }
    const m = (z - (zB + zC) / 2) / ((zB - zC) / 2); return H - .012 * m * m;
  };
  const cabHW = (z) => clamp(ySh(z) > 0 ? hwB(z) - .2 : .7, .5, .8);
  const ringCab = (z) => {
    const y0 = Math.min(ySh(z), yFt(z)) - .02, yr = Math.max(roofAt(z), y0 + .03), hb = cabHW(z), ht = hb * .7;
    const Lh = [[0, y0], [hb, y0], [hb * .97, y0 + (yr - y0) * .5], [ht + .04, Math.max(y0 + .01, yr - .05)], [ht - .02, yr], [ht * .45, yr + .012], [0, yr + .016]];
    const r = Lh.slice(); for (let k = 5; k >= 1; k--) r.push([-Lh[k][0], Lh[k][1]]); return r;
  };
  const zc = []; for (let z = zD; z < zA; z += .06) zc.push(z); zc.push(zA);
  const zBp = zB - (zB - zC) * .6;
  const tagCab = (s, z) => {
    if (s === 0) return [null, null];
    if (z > zB + .01) return s === 3 ? ['paint', BK] : ['gloss', G];
    if (z >= zC - .01) { if (s >= 3) return ['paint', two ? P2 : P1]; return Math.abs(z - zBp) < .045 ? ['trim', BK] : ['gloss', G]; }
    if (z < zC - .5) return s >= 4 ? ['trim', C3('#15171a')] : ['paint', two ? P2 : P1];
    return s >= 4 ? ['gloss', G] : ['paint', two ? P2 : P1];
  };
  loftShell(kit, zc, ringCab, 12, (k) => (k <= 5 ? k : 11 - k), tagCab, null, null);
  for (let k = 0; k < 5; k++) { const zz = zC - .58 - k * .09; kit.box('trim', C3('#0b0c0e'), cabHW(zz) * .95, .008, .022, 0, roofAt(zz) + .014, zz, -.18); }
  // roof spine running from the windshield header down the engine cover
  { const fb = new GeoBuilder(false), n = 22, t = .02, z0 = zB + .05, z1 = zR + .25;
    const base = (z) => (z >= zD ? roofAt(z) + .01 : yH(z)) - .012;
    for (let i = 0; i < n; i++) { const za = lerp(z0, z1, i / n), zb2 = lerp(z0, z1, (i + 1) / n), A0 = base(za), B0 = base(zb2), hA = .035 + .02 * (i / n), hB = .035 + .02 * ((i + 1) / n);
      fb.quad([t, A0, za], [t, B0, zb2], [t, B0 + hB, zb2], [t, A0 + hA, za], P2); fb.quad([-t, A0, za], [-t, A0 + hA, za], [-t, B0 + hB, zb2], [-t, B0, zb2], P2);
      fb.quad([t, A0 + hA, za], [t, B0 + hB, zb2], [-t, B0 + hB, zb2], [-t, A0 + hA, za], P2); }
    kit.put('paint', fb.build(), null); }
  // ---- front: tall central intake with satin surround, slim lamps on the fender faces, big lower intakes, splitter
  { const g = new GeoBuilder(false), zg = zF + .035, y0 = face0 + .04, hgt = Math.min(.36, face1 - face0 - .02);
    const outline = (grow) => { const P = [], hw0 = .155 + grow, r = hw0, yt = y0 + hgt - r * .85 + grow; P.push([hw0, y0 - grow]);
      for (let k = 0; k <= 16; k++) { const th = k / 16 * Math.PI; P.push([Math.cos(th) * r, yt + Math.sin(th) * r * .85]); } P.push([-hw0, y0 - grow]); return P; };
    const fan = (Pp, zz, c) => { const cy = Pp.reduce((q, p) => q + p[1], 0) / Pp.length; for (let k = 0; k < Pp.length; k++) { const p0 = Pp[k], p1 = Pp[(k + 1) % Pp.length]; g.tri([0, cy, zz], [p0[0], p0[1], zz], [p1[0], p1[1], zz], c); } };
    fan(outline(.025), zg - .006, C3('#c8cdd2')); fan(outline(0), zg, DK);
    for (let k = 1; k < 8; k++) { const yy = y0 + k * hgt / 8.4; g.quad([-.145, yy, zg + .002], [.145, yy, zg + .002], [.145, yy + .007, zg + .002], [-.145, yy + .007, zg + .002], C3('#30343a')); }
    kit.put('trim', g.build(), null); }
  // surface height of the upper body at (z, x) from the section polyline (shoulder -> centre)
  const topAt = (z, x) => { const S = sec(z); for (let k = 8; k < 12; k++) { const p0 = S[k], p1 = S[k + 1]; if (x <= p0[0] && x >= p1[0]) return lerp(p1[1], p0[1], (x - p1[0]) / Math.max(1e-6, p0[0] - p1[0])); } return S[12][1]; };
  const onTop = (key, col, z0, z1, xo, xi, off) => { const gb = new GeoBuilder(false), n = 6;
    for (const s of [1, -1]) for (let i = 0; i < n; i++) { const za = lerp(z0, z1, i / n), zb2 = lerp(z0, z1, (i + 1) / n);
      const xoA = hwB(za) - xo, xiA = hwB(za) - xi, xoB = hwB(zb2) - xo, xiB = hwB(zb2) - xi;
      const q = (x, z) => [s * x, topAt(z, x) + off, z];
      if (s < 0) gb.quad(q(xiA, za), q(xoA, za), q(xoB, zb2), q(xiB, zb2), col); else gb.quad(q(xiA, za), q(xiB, zb2), q(xoB, zb2), q(xoA, za), col); }
    kit.put(key, gb.build(), null); };
  onTop('gloss', C3('#11151a'), zF - .26, zF - .06, .1, .42, .006);  // narrow dark lamp slot on each fender face
  for (const sd of [1, -1]) for (let k = 0; k < 4; k++) { // four small LED projectors in a row
    const x = hwB(zF - .2) - .14 - k * .072, z = zF - .17 + k * .022, y = topAt(z, x) + .016;
    kit.box('light', C3('#f4f8ff'), .05, .022, .05, sd * x, y, z, -.35, 0, 0);
    kit.box('trim', C3('#2b3036'), .06, .006, .06, sd * x, y - .012, z, -.35, 0, 0);
  }
  { const gi = new GeoBuilder(false), zi = zF + .012; // lower intakes on the front face, either side of the central intake
    for (const s of [1, -1]) { const x0 = s * .24, x1 = s * .5, ya = face0 + .03, yb2 = face0 + .2;
      if (s > 0) gi.quad([x0, ya, zi], [x1, ya, zi], [x1 - s * .04, yb2, zi], [x0, yb2, zi], DK); else gi.quad([x0, ya, zi], [x0, yb2, zi], [x1 - s * .04, yb2, zi], [x1, ya, zi], DK); }
    kit.put('trim', gi.build(), null); }
  kit.box('trim', CB, W * .78, .02, .2, 0, face0 - .01, zF - .14);
  // ---- rear: full-width light bar, dark tail panel, diffuser, central exhaust
  // tail: full-width light bar over a dark mesh panel, framed by the rear colour
  kit.box('brake', null, W * .82, .03, .014, 0, .83, zR - .008);
  kit.box('trim', C3('#0d0e10'), W * .8, .44, .01, 0, .585, zR - .004);
  for (let k = 0; k < 9; k++) kit.box('trim', C3('#1d1f23'), W * .78, .006, .012, 0, .39 + k * .045, zR - .007);
  for (const sd of [1, -1]) kit.box('gloss', C3('#c3c8cd'), .02, .46, .016, sd * W * .405, .6, zR - .006);
  kit.box('trim', CB, W * .72, .12, .42, 0, .22, zR + .18, .3);
  for (const x of [-.3, -.15, 0, .15, .3]) kit.box('trim', CB, .012, .15, .38, x, .24, zR + .18, .3);
  kit.box('gloss', C3('#9aa0a6'), .5, .17, .03, 0, .4, zR - .006);
  kit.box('trim', C3('#0a0a0b'), .46, .13, .035, 0, .4, zR - .012);
  for (const x of [-.165, -.055, .055, .165]) { kit.cyl('gloss', C3('#b9bec4'), .048, .048, .04, 16, x, .4, zR - .02, Math.PI / 2, 0, 0); kit.cyl('trim', C3('#050506'), .036, .036, .045, 14, x, .4, zR - .024, Math.PI / 2, 0, 0); }
  // active wing laid flush on the deck
  kit.box('paint', two ? P2 : P1, W * .7, .014, .3, 0, yH(zR + .3) + .004, zR + .3, -.04);
  // ---- mirrors on short stalks from the doors
  for (const s of [1, -1]) {
    const mz = zA - .15, my = ySh(mz) + .12, mx = cabHW(mz) + .17;
    kit.put('paint', loft([{ z: mz + .07, w: .03, y0: my - .01, y1: my + .012, x: s * (mx - .02), n: 2.4 }, { z: mz, w: .15, y0: my - .04, y1: my + .04, x: s * mx, n: 3 }, { z: mz - .05, w: .16, y0: my - .042, y1: my + .042, x: s * mx, n: 3.5 }], 12), P1);
    kit.box('gloss', C3('#7f93a6'), .13, .065, .006, s * mx, my, mz - .053);
    kit.bar('trim', BK, [s * (mx - .06), my - .03, mz - .01], [s * (cabHW(mz) + .01), ySh(mz) + .005, mz + .03], .022);
  }
  // ---- wheels: large turbine-style rims, blue calipers on the default car
  out.caliper = '#1d4fb8';
  addWheels(out, R, wF, wR, W / 2 - wF / 2 - .035, W / 2 - wR / 2 - .035, false, .8);
  // ---- cameras / cockpit
  const dx = W * .2, eye = new THREE.Vector3(dx, H - .21, zB - .45);
  out.eye = eye;
  const hz = Math.min(zA + .45, zF - .55);
  out.cams = { onboard: new THREE.Vector3(0, yFt(hz) + .2, hz), onPitch: -0.06, onLabel: 'capó', chaseDist: 3.8 + L * .62, chaseH: 1.25 + H * .45 };
  if (out.lite) return;
  const halfW = (z) => hwB(z);
  buildCabin(out, { E: eye, dx, yA: .845, zA, zB, zC, zBp, roofY: H, clr, race: false, track: false, sporty: true, W, halfW, hb: cabHW(zA - .1), hr: cabHW(zB) * .7, cabHW, yF: clr + .3,
    pal: { top: '#15171b', face: '#1d2230', low: '#171a22', head: '#262c3a', pil: '#1c2029', acc: '#3d7be0', rim: '#15171b', grip: '#1a1d24' }, spine: true, roundWheel: true });
}

// ---------------------------------------------------------------------------
//  Formula E Gen3 Evo: 5.02 m long, 1.70 m wide, 2.97 m wheelbase. Low wide nose with swept
//  "bumper" wings in front of the front wheels, slim sidepods, bodywork wrapping the back of the
//  rear wheels, halo, roll-hoop camera pod and a high narrow rear wing on curved pylons.
//  Two-tone livery (no logos, sponsors or line art).
// ---------------------------------------------------------------------------
function feStrip(kit, key, col, pts, chord, th) {
  // flat wing element along a path: chord runs rearward (-z) and slightly down, thickness th
  const pos = [];
  const P = pts.map(p => new THREE.Vector3(...p)), cv = new THREE.Vector3(0, -chord * 0.18, -chord);
  const rings = P.map((p, i) => {
    const t = P[Math.min(i + 1, P.length - 1)].clone().sub(P[Math.max(i - 1, 0)]).normalize();
    const up = new THREE.Vector3().crossVectors(cv.clone().normalize(), t).normalize().multiplyScalar(th / 2);
    if (up.y < 0) up.negate();
    const f = p.clone(), r = p.clone().add(cv);
    return [f.clone().add(up), r.clone().add(up), r.clone().sub(up), f.clone().sub(up)];
  });
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < 4; k++) {
    const a = rings[i][k], b = rings[i][(k + 1) % 4], c = rings[i + 1][(k + 1) % 4], d = rings[i + 1][k];
    for (const q of [[a, b, c], [a, c, d], [a, c, b], [a, d, c]]) for (const v of q) pos.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  kit.put(key, g, col);
}
function buildFormulaE(out, spec, liv) {
  const { kit, hk, a, b } = out;
  const R = 0.345, P = out.col1, S = out.col2, PALE = out.col3, CB = C3(CARBON), DK = C3('#121315');
  const zN = a + .93, zT = -b - .72, hF = .72, hR = .7;
  // nose (dark) and monocoque
  kit.put('paint', loft([
    { z: zN, w: .24, y0: .1, y1: .26, n: 2.6 }, { z: a + .6, w: .3, y0: .12, y1: .38, n: 2.8 },
    { z: a + .1, w: .34, y0: .14, y1: .49, n: 3 }, { z: a - .35, w: .42, y0: .12, y1: .56, n: 3.4 }
  ], 18), S);
  kit.put('paint', loft([
    { z: a - .35, w: .42, y0: .12, y1: .56, n: 3.4 }, { z: .9, w: .6, y0: .08, y1: .61, n: 3.8 }, { z: .42, w: .7, y0: .06, y1: .63, n: 4 }
  ], 18), P);
  kit.put('paint', loft([
    { z: -.32, w: .74, y0: .06, y1: .65, n: 4 }, { z: -.7, w: .66, y0: .06, y1: .63, n: 4 }, { z: -1.1, w: .44, y0: .1, y1: .54, n: 3.6 },
    { z: -1.6, w: .3, y0: .17, y1: .42, n: 3.2 }, { z: zT + .12, w: .2, y0: .22, y1: .35, n: 3 }
  ], 18), P);
  openCockpit(out, { z0: -.32, z1: .42, halfIn: .245, out0: .37, out1: .35, yFloor: .08, rim0: .63, rim1: .62, P, DK, CB });
  // roll hoop / spine with the camera pod on top
  kit.put('paint', loft([{ z: -.32, w: .24, y0: .6, y1: .9, n: 3 }, { z: -.48, w: .28, y0: .58, y1: .94, n: 3 }, { z: -.95, w: .16, y0: .55, y1: .74, n: 3 }, { z: -1.55, w: .09, y0: .4, y1: .5, n: 3 }], 14), PALE);
  kit.box('trim', DK, .14, .1, .16, 0, .99, -.5);
  kit.cyl('gloss', C3('#26313d'), .028, .028, .02, 12, 0, .99, -.415, Math.PI / 2, 0, 0);
  kit.box('trim', DK, .04, .06, .04, 0, .92, -.48);
  // sidepods: long and slim; a pale lip closes them in front of the rear wheels
  for (const s of [1, -1]) {
    kit.put('paint', loft([
      { z: 1.08, w: .24, y0: .15, y1: .48, n: 4, x: s * .49 }, { z: .5, w: .36, y0: .1, y1: .55, n: 4, x: s * .52 },
      { z: -.35, w: .34, y0: .1, y1: .5, n: 4, x: s * .5 }, { z: -.82, w: .28, y0: .12, y1: .4, n: 3.6, x: s * .47 }], 14), P);
    kit.box('trim', DK, .2, .26, .02, s * .49, .32, 1.085);
    kit.box('paint', PALE, .035, .4, .1, s * .63, .3, -b + R + .1);
    kit.box('paint', PALE, .16, .035, .1, s * .56, .48, -b + R + .1);
    // rear wheel guard: panel behind the tyre + top quarter cover, tied to the crash structure
    kit.box('paint', P, .34, .5, .1, s * hR, .32, -b - R - .1);
    kit.box('paint', PALE, .34, .045, .32, s * hR, .64, -b - .26, -.5);
    kit.box('paint', S, .36, .045, .1, s * hR, .07, -b - R - .1);
    // mirrors on stalks ahead of the cockpit
    kit.bar('trim', CB, [s * .33, .6, .55], [s * .47, .7, .53], .02);
    kit.box('paint', P, .14, .07, .055, s * .5, .71, .52);
    kit.box('gloss', C3('#aab8c6'), .125, .055, .006, s * .5, .71, .49);
  }
  kit.box('trim', CB, 1.1, .05, .08, 0, .2, -b - R - .1);
  singleSeaterFloor(kit, CB, { zF: a - .5, zR: -b + .3, w: 1.3, zT });
  // front wing: low pale mainplane, carbon flap, endplates and the swept bumper wings in front of the wheels
  const fz = a + .62;
  kit.box('paint', PALE, 1.66, .03, .36, 0, .09, fz, .04);
  kit.box('trim', CB, 1.5, .022, .15, 0, .14, fz - .2, .3);
  for (const s of [1, -1]) {
    // endplate: tall at the front, swept down towards the tyre
    kit.box('paint', S, .028, .3, .3, s * .83, .24, fz + .06);
    kit.box('paint', S, .028, .18, .26, s * .83, .17, fz - .2, -.35);
    // swept bumper wing: broad element from the nose up and out over the front of the tyre
    feStrip(kit, 'paint', S, [[s * .13, .3, zN - .16], [s * .3, .36, a + .8], [s * .5, .44, a + .72], [s * .68, .5, a + .63], [s * .8, .49, a + .58], [s * .845, .42, a + .55]], .36, .04);
    feStrip(kit, 'paint', PALE, [[s * .14, .19, zN - .1], [s * .45, .22, a + .72], [s * .72, .25, a + .63], [s * .82, .26, a + .6]], .14, .02);
  }
  // rear wing: narrow plank high above the gearbox on two curved pylons, tips bent down
  const rz = -b - .58;
  kit.box('paint', S, 1.06, .03, .26, 0, 1.0, rz, -.12);
  kit.box('paint', PALE, 1.06, .012, .24, 0, 1.018, rz + .005, -.12);
  for (const s of [1, -1]) {
    kit.box('paint', S, .2, .03, .26, s * .6, .95, rz, -.12, 0, s * .55);
    haloTube(kit, 'paint', PALE, [[s * .14, .44, -1.45], [s * .2, .62, -1.68], [s * .26, .86, -b - .62], [s * .3, .99, rz + .02]], .03);
  }
  kit.box('brake', null, .1, .05, .03, 0, .31, zT + .1);
  // halo in body colour
  haloTube(kit, 'paint', PALE, [[0, .6, .7], [0, .75, .56], [0, .87, .38]], .022);
  haloTube(kit, 'paint', PALE, [[.31, .63, -.32], [.34, .79, -.14], [.31, .87, .08], [.16, .885, .3], [0, .89, .38], [-.16, .885, .3], [-.31, .87, .08], [-.34, .79, -.14], [-.31, .63, -.32]], .024);
  singleSeaterSuspension(kit, CB, a, -b, hF, hR, R);
  // driver
  hk.put('paint', new THREE.SphereGeometry(.13, 18, 14), C3(spec.helmet || '#e8e8e8'), hk.xf(0, .75, -.18));
  hk.put('paint', new THREE.TorusGeometry(.128, .012, 6, 28, Math.PI).rotateY(Math.PI / 2).rotateX(-Math.PI / 2), out.col2, hk.xf(0, .755, -.18));
  hk.box('gloss', C3('#1b2530'), .2, .05, .08, 0, .77, -.08);
  hk.box('trim', C3('#1c1d20'), .42, .12, .3, 0, .6, -.18);
  addWheels(out, R, .26, .3, hF, hR, true, .66);
  // aero wheel covers (pale disc with a dark centre), they spin with the wheels
  { const disc = new THREE.CylinderGeometry(R * .64, R * .64, .012, 28).rotateZ(Math.PI / 2), hub = new THREE.CylinderGeometry(R * .2, R * .2, .016, 16).rotateZ(Math.PI / 2);
    const mC = new THREE.MeshStandardMaterial({ color: liv.col3 || '#e4eef9', roughness: .35, metalness: .2 }), mH = new THREE.MeshStandardMaterial({ color: '#141821', roughness: .5 });
    out.wheels.forEach((w, k) => { const ww = k < 2 ? .26 : .3; const d = new THREE.Mesh(disc, mC); d.position.x = ww / 2 - .012; w.add(d); const h = new THREE.Mesh(hub, mH); h.position.x = ww / 2 - .004; w.add(h); }); }
  out.eye = new THREE.Vector3(0, .86, -.18);
  if (!out.lite) addWheelAndDash(out, out.eye, 'f1', new THREE.Vector3(0, .62, .3));
  out.cams = { onboard: new THREE.Vector3(0, 1.07, -.34), onPitch: -0.2, chaseDist: 5.9, chaseH: 1.6, inPitch: -0.03 };
}

// ---------------------------------------------------------------------------
//  Mercedes-AMG ONE (road-legal F1 hybrid, 2022)
// ---------------------------------------------------------------------------
function buildAmgOne(out, spec, liv) {
  const { kit, a, b, L, W, H } = out;
  const P1 = out.col1, P2 = liv.pattern === 'solido' || !liv.pattern ? out.col2 : out.col2, BK = C3(BLACK), CB = C3(CARBON), DK = C3('#0c0d0f'), UB = C3('#0e0f10'), G = C3(GLASS);
  const two = false; const TEAL = C3(liv.col2 || '#00a19c');
  const R = 0.37, Ra = R + 0.04, wF = 0.29, wR = 0.36, clr = 0.1;
  const zF = a + 1.0, zR = zF - L;
  const cv = (pts) => (z) => curveAt(pts, z);
  // ---- key curves along the body (z -> value)
  const yb = cv([[zR, .3], [zR + .35, .16], [-.9, .1], [a - .3, .1], [zF - .4, .12], [zF, .2]]);
  const hwB = cv([[zR, .8], [zR + .12, .9], [zR + .45, .985], [-b, 1.0], [-b + .6, .975], [-.2, .945], [.4, .945], [a - .35, .975], [a, .985], [a + .45, .96], [zF - .3, .9], [zF - .1, .78], [zF, .6]]);
  const yMid = cv([[zR, .6], [-b, .56], [0, .5], [a, .46], [zF, .38]]);
  const ySh = cv([[zR, .86], [zR + .3, .92], [-b, .96], [-b + .55, .88], [-.2, .78], [.5, .74], [a - .2, .79], [a + .1, .8], [a + .5, .74], [zF - .22, .64], [zF, .55]]);
  const yFt = cv([[zR, .9], [zR + .3, .96], [-b, 1.0], [-b + .6, .92], [-.2, .82], [.5, .78], [a - .15, .845], [a + .15, .85], [a + .55, .77], [zF - .2, .66], [zF, .56]]);
  const yH = cv([[zR, .88], [zR + .25, .96], [zR + .6, .99], [-1.2, 1.0], [-.6, .97], [.95, .8], [a, .7], [a + .45, .6], [zF - .25, .55], [zF - .06, .5], [zF, .47]]);
  const archY = (z) => { let best = null; for (const za of [a, -b]) { const d = (z - za) / Ra; if (Math.abs(d) < 1) { const y = clr + (R + Ra - clr) * Math.sqrt(1 - d * d); if (best == null || y > best) best = y; } } return best; };
  const zA = .95, zB = .33, zC = -.38, zD = -1.32; // windshield base, roof front / rear, rear-glass base
  const cabF = (z) => smoothstep(zC - .3, zC - .14, z) * (1 - smoothstep(zA - .3, zA - .15, z));
  // the C-line: from the A-pillar base back along the beltline, round behind the door and forward under it.
  // Inside the C (door) and the whole nose: front colour; shoulders, roof and the rear: rear colour.
  const zT0 = .66, zCc = -.44, yCb = .25, yCt = (z) => ySh(z) - .045, rC = (yCt(zCc) - yCb) / 2, yCc = yCb + rC;
  // ---- cross-section: 13 points on the left half (bottom centre -> side -> top centre)
  const sec = (z) => {
    const y0 = yb(z), hw = hwB(z), ay = archY(z), fy = ay != null ? Math.max(ay, y0) : y0;
    const sh = Math.max(ySh(z), fy + .12), ft = Math.max(yFt(z), sh + .02), yh = Math.min(yH(z), ft - .005);
    const ym = clamp(yMid(z), fy + .06, sh - .08), xin = hw - .3;
    const r = [[0, y0], [xin, y0], [xin + .003, fy], [hw - .06, fy], [hw - .015, fy + .045], [hw, lerp(fy + .06, ym, .5)], [hw + .03, ym], [hw + .005, lerp(ym, sh, .6)],
      [hw - .055, sh], [hw - .17, ft], [hw - .34, lerp(ft, yh, .55)], [.24, yh + .012], [0, yh]];
    const cf = cabF(z); if (cf > 0) { const yT = y0 + .32; for (let k = 10; k <= 12; k++) r[k][1] = lerp(r[k][1], yT, cf); }
    return r;
  };
  const ring = (z) => { const Lh = sec(z), r = Lh.slice(); for (let k = 11; k >= 1; k--) r.push([-Lh[k][0], Lh[k][1]]); return r; };
  const zs = []; for (let z = zR; z < zF - 1e-6;) { zs.push(z); const near = Math.min(Math.abs(z - a), Math.abs(z + b)) < Ra + .06, end = z < zR + .25 || z > zF - .3; z += near ? .04 : end ? .035 : .1; }
  for (let zz = zCc - rC - .06; zz < zT0 + .06; zz += .04) if (!zs.some(v => Math.abs(v - zz) < .012)) zs.push(zz);
  for (const zz of [zT0]) if (!zs.some(v => Math.abs(v - zz) < .005)) zs.push(zz);
  zs.sort((p, q) => p - q); zs.push(zF);
  // the side intake behind the door sweeps forward in the middle of its height; the paint split follows it
  const scoopEdge = (s) => .24, scoopBack = -b + Ra + .06;
  const tag = (s, z) => {
    const inArch = archY(z) != null;
    if (s >= 10 && cabF(z) > .001) return ['cabin', C3('#1c1d20')];
    if (s === 0) return ['trim', UB];
    if (s <= 2) return ['trim', BK];
    if (s === 3) return inArch ? ['trim', BK] : ['trim', C3('#17181b')];
    return ['paint', P1];
  };
  const sideX = (z, y) => { const S = sec(z); if (y <= S[3][1]) return S[3][0]; for (let k = 3; k < 9; k++) { const p0 = S[k], p1 = S[k + 1]; if (y >= p0[1] && y <= p1[1]) return lerp(p0[0], p1[0], (y - p0[1]) / Math.max(1e-6, p1[1] - p0[1])); } return S[9][0]; };
  const face0 = yb(zF), face1 = yH(zF);
  loftShell(kit, zs, ring, 24, (k) => (k <= 12 ? k : 24 - k), tag,
    { outer: ['paint', P1], inner: ['paint', P1], center: [0, face0 + (face1 - face0) * .45], scale: .55, bulge: .03 },
    { outer: ['paint', two ? P2 : P1], inner: ['paint', two ? P2 : P1], center: [0, .6], scale: .5, bulge: .02 });
  // ---- greenhouse: bubble roof on the beltline, rear glass then louvred engine cover
  const roofAt = (z) => {
    if (z >= zB) { const u = (z - zB) / (zA - zB); return lerp(H, .845, u) + .04 * Math.sin(u * Math.PI) * (1 - u * .5); }
    if (z <= zC) { const u = clamp((zC - z) / (zC - zD), 0, 1); return lerp(H - .01, .99, Math.pow(u, .85)) + .04 * Math.sin(u * Math.PI); }
    const m = (z - (zB + zC) / 2) / ((zB - zC) / 2); return H - .012 * m * m;
  };
  const cabHW = (z) => clamp(ySh(z) > 0 ? hwB(z) - .2 : .7, .5, .8);
  const ringCab = (z) => {
    const y0 = Math.min(ySh(z), yFt(z)) - .02, yr = Math.max(roofAt(z), y0 + .03), hb = cabHW(z), ht = hb * .7;
    const Lh = [[0, y0], [hb, y0], [hb * .97, y0 + (yr - y0) * .5], [ht + .04, Math.max(y0 + .01, yr - .05)], [ht - .02, yr], [ht * .45, yr + .012], [0, yr + .016]];
    const r = Lh.slice(); for (let k = 5; k >= 1; k--) r.push([-Lh[k][0], Lh[k][1]]); return r;
  };
  const zc = []; for (let z = zD; z < zA; z += .06) zc.push(z); zc.push(zA);
  const zBp = zB - (zB - zC) * .6;
  const tagCab = (s, z) => {
    if (s === 0) return [null, null];
    if (z > zB + .01) return s === 3 ? ['paint', BK] : ['gloss', G];
    if (z >= zC - .01) { if (s >= 3) return ['paint', two ? P2 : P1]; return Math.abs(z - zBp) < .045 ? ['trim', BK] : ['gloss', G]; }
    if (z < zC - .5) return s >= 4 ? ['trim', C3('#15171a')] : ['paint', two ? P2 : P1];
    return s >= 4 ? ['gloss', G] : ['paint', two ? P2 : P1];
  };
  loftShell(kit, zc, ringCab, 12, (k) => (k <= 5 ? k : 11 - k), tagCab, null, null);
  for (let k = 0; k < 5; k++) { const zz = zC - .58 - k * .09; kit.box('trim', C3('#0b0c0e'), cabHW(zz) * .95, .008, .022, 0, roofAt(zz) + .014, zz, -.18); }
  // ---- roof airscoop, then a tall central fin sweeping back to the rear wing
  kit.put('paint', loft([{ z: zB + .12, w: .2, y0: H - .12, y1: H - .02, n: 2.4 }, { z: zB, w: .26, y0: H - .06, y1: H + .24, n: 2.6 }, { z: zB - .4, w: .24, y0: H - .03, y1: H + .24, n: 2.6 }, { z: zB - .85, w: .1, y0: H - .02, y1: H + .12, n: 2.4 }], 12), P1);
  kit.box('trim', DK, .42, .22, .02, 0, H + .09, zB + .1, -.25);
  for (let k = 0; k < 3; k++) kit.box('trim', C3('#2a2d31'), .38, .008, .02, 0, H + .0 + k * .07, zB + .105, -.25);
  { const fb = new GeoBuilder(false), n = 26, t = .014, z0 = zB - .8, z1 = zR + .5, zW = zR + .5;
    const base = (z) => (z >= zD ? roofAt(z) + .01 : yH(z)) - .012;
    const top = (u) => lerp(H + .09, 1.17, Math.pow(u, .8));
    for (let i = 0; i < n; i++) { const ua = i / n, ub = (i + 1) / n, za = lerp(z0, z1, ua), zb2 = lerp(z0, z1, ub), A0 = base(za), B0 = base(zb2), A1 = Math.max(A0 + .02, top(ua)), B1 = Math.max(B0 + .02, top(ub));
      fb.quad([t, A0, za], [t, B0, zb2], [t, B1, zb2], [t, A1, za], P1); fb.quad([-t, A0, za], [-t, A1, za], [-t, B1, zb2], [-t, B0, zb2], P1);
      fb.quad([t, A1, za], [t, B1, zb2], [-t, B1, zb2], [-t, A1, za], P1); }
    kit.put('paint', fb.build(), null); }
  // roof / engine-cover louvres
  for (let k = 0; k < 6; k++) for (const s of [1, -1]) { const zz = zD - .1 - k * .1; kit.box('trim', C3('#0b0c0e'), .2, .008, .035, s * .32, yH(zz) + .004, zz, -.05); }
  // ---- front: low wide mouth with horizontal slats, carbon splitter, slim LED lamps
  { const g = new GeoBuilder(false), zg = zF + .03, y0 = face0 + .035, hgt = Math.min(.2, face1 - face0 - .08), hw = .56;
    const quadF = (x0, x1, ya, yb2, c, zz) => g.quad([x0, ya, zz], [x1, ya, zz], [x1, yb2, zz], [x0, yb2, zz], c);
    quadF(-hw - .02, hw + .02, y0 - .015, y0 + hgt + .015, C3('#2a2d31'), zg - .004); quadF(-hw, hw, y0, y0 + hgt, DK, zg);
    for (let k = 1; k < 6; k++) quadF(-hw + .02, hw - .02, y0 + k * hgt / 6, y0 + k * hgt / 6 + .008, C3('#3a3f46'), zg + .002);
    for (let k = -8; k <= 8; k++) quadF(k * hw / 8.4 - .004, k * hw / 8.4 + .004, y0, y0 + hgt, C3('#262a2f'), zg + .003);
    kit.put('trim', g.build(), null); }
  // surface height of the upper body at (z, x) from the section polyline (shoulder -> centre)
  const topAt = (z, x) => { const S = sec(z); for (let k = 8; k < 12; k++) { const p0 = S[k], p1 = S[k + 1]; if (x <= p0[0] && x >= p1[0]) return lerp(p1[1], p0[1], (x - p1[0]) / Math.max(1e-6, p0[0] - p1[0])); } return S[12][1]; };
  const onTop = (key, col, z0, z1, xo, xi, off) => { const gb = new GeoBuilder(false), n = 6;
    for (const s of [1, -1]) for (let i = 0; i < n; i++) { const za = lerp(z0, z1, i / n), zb2 = lerp(z0, z1, (i + 1) / n);
      const xoA = hwB(za) - xo, xiA = hwB(za) - xi, xoB = hwB(zb2) - xo, xiB = hwB(zb2) - xi;
      const q = (x, z) => [s * x, topAt(z, x) + off, z];
      if (s < 0) gb.quad(q(xiA, za), q(xoA, za), q(xoB, zb2), q(xiB, zb2), col); else gb.quad(q(xiA, za), q(xiB, zb2), q(xoB, zb2), q(xoA, za), col); }
    kit.put(key, gb.build(), null); };
  onTop('gloss', C3('#11151a'), zF - .26, zF - .06, .1, .42, .006);  // narrow dark lamp slot on each fender face
  for (const sd of [1, -1]) { // slim LED lamp on each fender nose
    const x = hwB(zF - .2) - .3, z = zF - .17, y = topAt(z, x) + .012;
    kit.box('light', C3('#f4f8ff'), .34, .014, .035, sd * x, y, z, -.3, sd * -.35, 0);
    kit.box('trim', C3('#2b3036'), .4, .006, .07, sd * x, y - .008, z, -.3, sd * -.35, 0);
  }
  { const gi = new GeoBuilder(false), zi = zF + .012; // vertical side intakes at the nose corners
    for (const s of [1, -1]) { const x0 = s * .6, x1 = s * .82, ya = face0 + .04, yb2 = face0 + .2;
      if (s > 0) gi.quad([x0, ya, zi], [x1, ya, zi], [x1 - s * .03, yb2, zi], [x0, yb2, zi], DK); else gi.quad([x0, ya, zi], [x0, yb2, zi], [x1 - s * .03, yb2, zi], [x1, ya, zi], DK); }
    kit.put('trim', gi.build(), null); }
  // hood: louvre blocks and the black "flick" vents on the fender crests
  for (const s of [1, -1]) { for (let k = 0; k < 5; k++) { const zz = a + .22 + k * .1, xx = .3 - k * .01; kit.box('trim', C3('#0b0c0e'), .2, .008, .045, s * xx, topAt(zz, xx) + .006, zz, -.2, 0, s * .03); }
    for (let k = 0; k < 4; k++) { const zz = a + .02 + k * .08, xx = hwB(zz) - .2; kit.box('trim', C3('#0b0c0e'), .12, .01, .04, s * xx, topAt(zz, xx) + .008, zz, -.1, 0, 0); } }
  // fender gills behind the front arches
  for (const s of [1, -1]) for (let k = 0; k < 4; k++) { const zz = a - .52 - k * .06, yy = .52; kit.box('trim', C3('#0b0c0e'), .012, .15, .03, s * (sideX(zz, yy) + .004), yy, zz); }
  // teal sill stripe
  for (const s of [1, -1]) for (let i = 0; i < 18; i++) { const z0 = a - .5, z1 = -b + .45, zz = lerp(z0, z1, (i + .5) / 18), ys = .29; kit.box('gloss', TEAL, .012, .05, Math.abs(z1 - z0) / 18 + .01, s * (sideX(zz, ys) + .004), ys, zz); }
  // star graphic on the rear haunches (small white five-point stars)
  { const gb = new GeoBuilder(false), WH = C3('#e6eaee'), spots = [[-.9, .72, .09], [-1.1, .8, .07], [-1.3, .66, .1], [-1.55, .78, .075], [-1.75, .7, .085], [-1.0, .58, .06], [-1.4, .56, .06], [-1.2, .9, .055], [-1.65, .9, .05], [-.78, .86, .05]];
    for (const [zc2, yc, r0] of spots) for (const s of [1, -1]) { const x = sideX(zc2, yc) + .006, rot = zc2 * 3 + yc;
      const P = []; for (let k = 0; k < 10; k++) { const ang = rot + k * Math.PI / 5, rr = k % 2 ? r0 * .42 : r0; P.push([zc2 + Math.cos(ang) * rr, yc + Math.sin(ang) * rr]); }
      for (let k = 0; k < 10; k++) { const p0 = P[k], p1 = P[(k + 1) % 10], c = [s * x, yc, zc2]; const A = [s * x, p0[1], p0[0]], B = [s * x, p1[1], p1[0]]; if (s > 0) gb.tri(c, B, A, WH); else gb.tri(c, A, B, WH); } }
    kit.put('gloss', gb.build(), null); }
  kit.box('trim', CB, W * .78, .02, .2, 0, face0 - .01, zF - .14);
  // ---- rear: full-width light bar, dark tail panel, diffuser, central exhaust
  // tail: full-width light bar over a dark mesh panel, framed by the rear colour
  kit.box('brake', null, W * .82, .03, .014, 0, .83, zR - .008);
  kit.box('trim', C3('#0d0e10'), W * .8, .44, .01, 0, .585, zR - .004);
  for (let k = 0; k < 9; k++) kit.box('trim', C3('#1d1f23'), W * .78, .006, .012, 0, .39 + k * .045, zR - .007);
  for (const sd of [1, -1]) kit.box('gloss', C3('#c3c8cd'), .02, .46, .016, sd * W * .405, .6, zR - .006);
  kit.box('trim', CB, W * .72, .12, .42, 0, .22, zR + .18, .3);
  for (const x of [-.3, -.15, 0, .15, .3]) kit.box('trim', CB, .012, .15, .38, x, .24, zR + .18, .3);
  kit.box('gloss', C3('#9aa0a6'), .5, .17, .03, 0, .4, zR - .006);
  kit.box('trim', C3('#0a0a0b'), .46, .13, .035, 0, .4, zR - .012);
  kit.cyl('gloss', C3('#b9bec4'), .075, .075, .05, 20, 0, .36, zR - .024, Math.PI / 2, 0, 0); kit.cyl('trim', C3('#050506'), .058, .058, .055, 18, 0, .36, zR - .03, Math.PI / 2, 0, 0);
  // ---- big rear wing on pylons, with endplates and a second flap
  { const zW = zR + .5, yW = yH(zR + .5) + .3, sp = W * .86;
    kit.box('paint', P1, sp, .025, .4, 0, yW, zW, -.07);
    kit.box('paint', P1, sp * .94, .018, .17, 0, yW + .085, zW - .2, -.25);
    for (const s of [1, -1]) { kit.box('paint', P1, .016, .26, .62, s * sp / 2, yW + .03, zW - .04, 0); kit.box('trim', TEAL, .018, .02, .3, s * sp / 2, yW + .1, zW - .05); kit.box('paint', P1, .03, yW - yH(zW) + .05, .08, s * (sp * .31), (yW + yH(zW)) / 2, zW + .05); }
    kit.box('paint', P1, .03, .05, .5, 0, yW - .04, zW + .02, -.04); }
  // ---- mirrors on short stalks from the doors
  for (const s of [1, -1]) {
    const mz = zA - .15, my = ySh(mz) + .12, mx = cabHW(mz) + .17;
    kit.put('paint', loft([{ z: mz + .07, w: .03, y0: my - .01, y1: my + .012, x: s * (mx - .02), n: 2.4 }, { z: mz, w: .15, y0: my - .04, y1: my + .04, x: s * mx, n: 3 }, { z: mz - .05, w: .16, y0: my - .042, y1: my + .042, x: s * mx, n: 3.5 }], 12), P1);
    kit.box('gloss', C3('#7f93a6'), .13, .065, .006, s * mx, my, mz - .053);
    kit.bar('trim', BK, [s * (mx - .06), my - .03, mz - .01], [s * (cabHW(mz) + .01), ySh(mz) + .005, mz + .03], .022);
  }
  // ---- wheels: large turbine-style rims, blue calipers on the default car
  out.caliper = '#e8731c';
  addWheels(out, R, wF, wR, W / 2 - wF / 2 - .035, W / 2 - wR / 2 - .035, false, .8);
  // ---- cameras / cockpit
  const dx = W * .2, eye = new THREE.Vector3(dx, H - .21, zB - .45);
  out.eye = eye;
  const hz = Math.min(zA + .45, zF - .55);
  out.cams = { onboard: new THREE.Vector3(0, yFt(hz) + .2, hz), onPitch: -0.06, onLabel: 'capó', chaseDist: 3.8 + L * .62, chaseH: 1.25 + H * .45 };
  if (out.lite) return;
  const halfW = (z) => hwB(z);
  buildCabin(out, { E: eye, dx, yA: .845, zA, zB, zC, zBp, roofY: H, clr, race: false, track: false, sporty: true, W, halfW, hb: cabHW(zA - .1), hr: cabHW(zB) * .7, cabHW, yF: clr + .3,
    pal: { top: '#1c1e22', face: '#2a2d33', low: '#222428', head: '#32353b', pil: '#26282c', acc: '#00a19c', rim: '#1a1b1e', grip: '#26282c' }, spine: true, roundWheel: true });
}


