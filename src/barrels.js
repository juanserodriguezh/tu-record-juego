// ============================================================================
//  TRACK OBJECTS: barrels as full 3D rigid bodies + the barrier materials table
//
//  The car physics is planar (x, z, yaw at 240 Hz); a barrel is a real 3D rigid body (position, unit quaternion, linear
//  and angular velocity, a composite inertia tensor: shell + caps + ballast). One sequential-impulse solver at the car
//  step (1/240 s): accumulated normal impulses with restitution bias, Coulomb friction on a circle (2 tangents),
//  warm start from the previous step (cached by contact feature), split-impulse position correction (no energy is added
//  to fix an overlap), rolling and spinning resistance, air drag with the projected area of a cylinder.
//  Contacts: barrel-ground (support points of each cap), barrel-barrier (the same barrier faces the car uses, with the
//  dents the cars left), barrel-barrel (rim samples + the support point towards the other barrel, both ways) and
//  car-barrel (barrel samples against the car hull: a box with a raked nose; the car's corners against the barrel).
//  The car takes the horizontal part of every impulse at the exact contact point (speed and yaw rate change: a barrel
//  hit with a front corner turns the car), plus a damage hit scaled by the barrel mass.
//  Deterministic: no random numbers, fixed iteration counts and a fixed processing order, so the same impulse gives the
//  same result bit for bit, and a rewind snapshot (state()) replays exactly. Sleeping islands cost nothing.
// ============================================================================

// car <-> barrier (used by Vehicle.collide in damage.js). e: restitution of the rigid hit; mu: sliding friction.
// The car body (crumple zone) takes most of the energy, so concrete is nearly dead. Friction is that of a car body
// sliding on the barrier, not of rubber: higher values grab the car and spin it like a pin.
const BARRIER_MAT = {
  concrete: { e: 0.10, mu: 0.40 },             // concrete wall, pit wall
  armco:    { e: 0.18, mu: 0.38, scrape: 0.40 }, // steel rail: bends (soft branch, scrape = sliding friction while it gives way), rigid once out of travel
  tyres:    { e: 0.06, mu: 0.75, scrape: 0.72 }  // tyre wall: crushes; its belted face still grabs more than steel
};

// barrel types: r, h (m); shell (kg: side wall + both ends), ballast (kg, a solid layer of hb metres at the bottom)
// mat: surface material; cd: drag coefficient side-on / end-on; crr: rolling resistance on asphalt
const BARREL_TYPES = {
  // 220 L HDPE drum (Ø 0.58 × 0.93 m, 9.5 kg) with 6 kg of sand in the base: the usual black track barrel. Rolling resistance:
  // the ribs and the loose sand that the drum keeps rolling over (water barrels: the slosh) stop a rolling drum in tens of metres
  plastic: { r: 0.29, h: 0.93, shell: 9.5, ballast: 6, hb: 0.03, mat: 'plastic', cd: [0.9, 1.0], crr: 0.15, color: 0x161618, band: 0xf2f2f2 },
  // the same drum one third full of water (impact attenuator in front of a wall nose)
  water:   { r: 0.29, h: 0.93, shell: 9.5, ballast: 70, hb: 0.27, mat: 'water', cd: [0.9, 1.0], crr: 0.25, color: 0xf0c418, band: 0x161618 },
  // 200 L steel drum (Ø 0.572 × 0.88 m, 19 kg) with 3 kg of residue in the base
  steel:   { r: 0.286, h: 0.88, shell: 19, ballast: 3, hb: 0.01, mat: 'steel', cd: [0.9, 1.0], crr: 0.05, color: 0x1f3f8f, band: 0xd8dade },
  // (v103) a car tyre knocked out of a tyre wall (Ø 0.62 × 0.24 m, 9 kg, no rim): drawn as a tyre, rubber against everything
  tyre:    { r: 0.31, h: 0.24, shell: 9, ballast: 0, hb: 0, mat: 'rubber', cd: [1.0, 1.1], crr: 0.06, color: 0x2a2a2d, band: 0x2a2a2d, tyre: true }
};
const TYRE_POOL = 30;     // loose tyres per session (recycled oldest first)
const TYRE_QUANT = 0.5;   // metres of tyre wall crushed per tyre knocked loose

// pair materials: mu = sliding friction, e = restitution (the barrel deforms: its own material decides)
const BMAT = {
  plastic: { asphalt: [0.62, 0.35], grass: [0.45, 0.2], gravel: [0.65, 0.05], plastic: [0.5, 0.4], water: [0.5, 0.25], steel: [0.48, 0.3], car: [0.45, 0.3], concrete: [0.6, 0.3], armco: [0.45, 0.3], tyres: [0.8, 0.1], rubber: [0.75, 0.3] },
  water:   { asphalt: [0.62, 0.15], grass: [0.45, 0.1], gravel: [0.65, 0.03], plastic: [0.5, 0.25], water: [0.5, 0.15], steel: [0.48, 0.18], car: [0.45, 0.15], concrete: [0.6, 0.15], armco: [0.45, 0.15], tyres: [0.8, 0.05], rubber: [0.75, 0.15] },
  steel:   { asphalt: [0.55, 0.22], grass: [0.42, 0.12], gravel: [0.6, 0.04], plastic: [0.48, 0.3], water: [0.48, 0.18], steel: [0.45, 0.25], car: [0.4, 0.2], concrete: [0.55, 0.2], armco: [0.42, 0.25], tyres: [0.8, 0.08], rubber: [0.7, 0.25] },
  rubber:  { asphalt: [0.85, 0.3], grass: [0.6, 0.15], gravel: [0.7, 0.05], plastic: [0.75, 0.3], water: [0.75, 0.15], steel: [0.7, 0.25], car: [0.6, 0.3], concrete: [0.75, 0.3], armco: [0.6, 0.3], tyres: [0.9, 0.1], rubber: [0.9, 0.35] }
};
const BCRR = { asphalt: 1, grass: 3.5, gravel: 9 };   // rolling resistance multiplier by surface

// solver and limits
const BAR = {
  velIt: 10, posIt: 4, beta: 0.25, slop: 0.004, maxCorr: 2.5,   // split impulse: fraction of the overlap fixed per step, max push-out speed
  bounceMin: 0.8,                       // below this closing speed (m/s) there is no bounce (resting contacts stay still)
  vMax: 70, wMax: 45,                   // impulse clamp: no barrel leaves faster than this (m/s, rad/s)
  flyVy: 7, flyW: 18, flyDrag: 1.8, flyE: 0.75, // a barrel in the air faster than this: more drag, less bounce
  sleepV: 0.1, sleepW: 0.25, sleepT: 0.8, // asleep when the whole island stays below these for sleepT seconds
  maxAwake: 64,                         // physics LOD: beyond this many awake barrels, the farthest from the player freeze
  wallH: 1.0,                           // barrier height: a barrel flying above it goes over
  rhoAir: 1.2, angDamp: 0.05, spinMu: 0.06,
  rim: 8,                               // rim samples per cap
  rc: 0.012                             // rim rounding (m)
};

// mass properties of a barrel type (composite: thin side wall + two end discs + a solid ballast layer at the bottom)
function barrelMass(B) {
  if (B._m) return B._m;
  const r = B.r, h = B.h, aS = 2 * Math.PI * r * h, aC = Math.PI * r * r, ms = B.shell * aS / (aS + 2 * aC), mc = B.shell * aC / (aS + 2 * aC), mb = B.ballast;
  const yb = -h / 2 + B.hb / 2, m = B.shell + mb;
  const ycom = mb * yb / m;                               // the shell is symmetric; only the ballast moves the centre of mass down
  const Ia = ms * r * r + 2 * mc * r * r / 2 + mb * r * r / 2;
  const It0 = ms * (r * r / 2 + h * h / 12) + 2 * (mc * r * r / 4 + mc * h * h / 4) + mb * (r * r / 4 + B.hb * B.hb / 12) + mb * yb * yb;   // about the geometric centre
  const It = It0 - m * ycom * ycom;                       // parallel axis: about the centre of mass
  B._m = { m, iM: 1 / m, Ia, It, iA: 1 / Ia, iT: 1 / It, g: -ycom, R: Math.hypot(r, h / 2) - ycom };   // g: COM -> geometric centre along the axis
  return B._m;
}

// ---- small vector helpers (plain numbers, no allocation in the hot loops)
const _bv = { x: 0, y: 0, z: 0 };
function bqRot(b, x, y, z, o) {          // rotate the local vector (x, y, z) by the barrel's quaternion
  const qw = b.qw, qx = b.qx, qy = b.qy, qz = b.qz;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  o.x = x + qw * tx + (qy * tz - qz * ty); o.y = y + qw * ty + (qz * tx - qx * tz); o.z = z + qw * tz + (qx * ty - qy * tx);
  return o;
}

class BarrelWorld {
  constructor(T) {
    this.T = T; this.list = []; this.cache = {}; this.ev = []; this.ver = 0; this.t = 0; this._netQuiet = 99;
    this.contacts = []; this._pool = []; this._cars = []; this._q = newQ();
    this.stats = { awake: 0, contacts: 0, ms: 0 };
  }
  // ---------------------------------------------------------------- layouts
  clear() { this.list.length = 0; this.cache = {}; this.ev.length = 0; this.ver++; this._netQuiet = 99; this.tyres = null; this.tyreNext = 0; }
  add(type, x, y, z, ax, ay, az, spin) {   // a barrel whose geometric centre is at (x, y, z), axis (ax, ay, az)
    const B = BARREL_TYPES[type], M = barrelMass(B);
    const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
    // quaternion that takes local +Y to the axis, then a turn of `spin` about it
    let qw = 1 + ay, qx = az, qy = 0, qz = -ax;
    if (qw < 1e-6) { qw = 0; qx = 1; qy = 0; qz = 0; }
    const ql = Math.hypot(qw, qx, qy, qz); qw /= ql; qx /= ql; qz /= ql;
    const s = Math.sin((spin || 0) / 2), c = Math.cos((spin || 0) / 2);   // q * (spin about local Y)
    const b = { id: this.list.length, type, x: 0, y: 0, z: 0, qw: qw * c - qy * s, qx: qx * c - qz * s, qy: qw * s + qy * c, qz: qz * c + qx * s,
      vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, sleep: true, slowT: BAR.sleepT, air: false, fly: false, dent: 0, dentA: 0, hint: -1, gE: 0, gSurf: 'asphalt', hitV: 0 };
    bqRot(b, 0, -M.g, 0, _bv); b.x = x + _bv.x; b.y = y + _bv.y; b.z = z + _bv.z;   // store the centre of mass
    this.list.push(b); this.ver++;
    return b;
  }
  // (v103) loose tyres: a fixed pool parked out of the world (ids and list length never change: rewind and the network keep working);
  // a hit on a tyre wall takes the oldest one and drops it where the wall gave way
  tyrePool(n) {
    this.tyres = []; this.tyreNext = 0;
    for (let k = 0; k < n; k++) { const b = this.add('tyre', 0, 0, 0, 0, 1, 0, 0); this.park(b); this.tyres.push(b.id); }
  }
  park(b) { b.park = true; b.x = 1e6 + b.id * 10; b.y = -500; b.z = 1e6; b.dent = 0; this.freeze(b); this.ver++; }
  spawnTyre(x, y, z, vx, vy, vz, wx, wy, wz, tilt, spin) {
    if (!this.tyres || !this.tyres.length) return null;
    // never inside another body (overlapping spawns explode apart) and never recycle a tyre that is still flying about
    for (const o of this.list) if (!o.park && (o.x - x) ** 2 + (o.z - z) ** 2 < 0.66 * 0.66 && Math.abs(o.y - y) < 0.5) return null;
    const b = this.list[this.tyres[this.tyreNext % this.tyres.length]];
    if (!b.park && (!b.sleep || this.t - (b.spawnT || 0) < 3)) return null;
    this.tyreNext++; b.spawnT = this.t;
    // flat (axis up), tipped by `tilt` about the local x axis, turned `spin` about the vertical
    const ht = tilt / 2, hs = spin / 2, cs = Math.cos(hs), ss = Math.sin(hs), ct = Math.cos(ht), st = Math.sin(ht);
    b.qw = cs * ct; b.qx = cs * st; b.qy = ss * ct; b.qz = -ss * st;
    b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz; b.wx = wx; b.wy = wy; b.wz = wz;
    b.park = false; b.dent = 0; b.air = true; b.fly = false; b.hitV = 0; b.ownT = this.t;
    b.sleep = false; b.slowT = 0; this.ver++;
    return b;
  }
  // the ground height under (x, z) and the surface there
  ground(x, z, b) {
    const T = this.T, q = T.project(x, z, b ? b.hint : -1, this._q); if (b) b.hint = q.i;
    const d = q.d, band = q.pc === q.pc && d <= q.pc + q.phw && d >= q.pc - q.phw;
    let surf = 'asphalt';
    if (!band && (d > q.wl + 1.2 || d < -q.wr - 1.2)) { const typ = d > 0 ? T.typL && T.typL[q.i] : T.typR && T.typR[q.i]; surf = typ === 'gravel' ? 'gravel' : typ === 'tarmac' ? 'asphalt' : 'grass'; }
    if (T.inEscape && T.inEscape(x, z)) surf = 'asphalt';
    let e = q.e;
    if (T.esc && T.esc.yAt && T.inEscape && T.inEscape(x, z)) e = T.esc.yAt(x, z);
    return { q, e, surf };
  }
  // n barrels stacked upright (a tower)
  tower(type, x, z, n, spin) {
    const B = BARREL_TYPES[type], g = this.ground(x, z), out = [];
    for (let k = 0; k < n; k++) out.push(this.add(type, x, g.e + B.h / 2 + k * (B.h + 0.002), z, 0, 1, 0, (spin || 0) + k * 0.7));
    return out;
  }
  // a pyramid: rows of upright barrels side by side (n at the bottom), across the heading h
  pyramid(type, x, z, h, n) {
    const B = BARREL_TYPES[type], lx = Math.cos(h), lz = -Math.sin(h), g = this.ground(x, z), sp = 2 * B.r + 0.004, out = [];
    for (let row = 0; row < n; row++) for (let k = 0; k < n - row; k++) {
      const o = (k - (n - row - 1) / 2) * sp;
      out.push(this.add(type, x + lx * o, g.e + B.h / 2 + row * (B.h + 0.002), z + lz * o, 0, 1, 0, row * 1.3 + k * 0.4));
    }
    return out;
  }
  // a row of n upright barrels along the heading h, gap metres apart
  row(type, x, z, h, n, gap) {
    const B = BARREL_TYPES[type], fx = Math.sin(h), fz = Math.cos(h), sp = 2 * B.r + (gap || 0), out = [];
    for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * sp, g = this.ground(x + fx * o, z + fz * o); out.push(this.add(type, x + fx * o, g.e + B.h / 2, z + fz * o, 0, 1, 0, k * 0.9)); }
    return out;
  }
  // a block of rows × cols upright barrels (attenuator in front of a wall nose), centred at (x, z), rows along h
  grid(type, x, z, h, rows, cols) {
    const B = BARREL_TYPES[type], fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h), sp = 2 * B.r + 0.01, out = [];
    for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) {
      const a = (i - (rows - 1) / 2) * sp, c = (k - (cols - 1) / 2) * sp, px = x + fx * a + lx * c, pz = z + fz * a + lz * c, g = this.ground(px, pz);
      out.push(this.add(type, px, g.e + B.h / 2, pz, 0, 1, 0, i * 0.5 + k));
    }
    return out;
  }
  // ---------------------------------------------------------------- state (rewind / tests)
  state() { return this.list.map(b => Object.assign({}, b)); }
  setState(st) {
    for (let k = 0; k < st.length && k < this.list.length; k++) Object.assign(this.list[k], st[k]);
    this.cache = {}; this.ver++;
  }
  // snapshot including the warm-start cache (exact replay); plain data for rwCopy
  snap() { return { b: this.state(), c: Object.assign({}, this.cache), t: this.t, tn: this.tyreNext || 0 }; }
  restore(s) { this.setState(s.b); this.cache = Object.assign({}, s.c); this.t = s.t; if (s.tn != null) this.tyreNext = s.tn; }
  wake(b) { if (b.sleep) { b.sleep = false; b.slowT = 0; } }
  // ---------------------------------------------------------------- multiplayer (host authoritative, guests predict)
  // The host packs the barrels while any is awake (and once more when they all sleep); null when nothing changed.
  // Per barrel: [id, x, y, z, qx, qy, qz, qw, vx, vy, vz, wx, wy, wz, sleep, dent], mm / mrad precision.
  netPack() {
    const L = this.list; if (!L.length) return null;
    const aw = L.some(b => !b.sleep);
    // after everything sleeps, keep sending 1 s more (20 packets): guests blend in steps and need several to land exactly
    if (aw) this._netQuiet = 0; else if (++this._netQuiet > 20) return null;
    const r3 = (v) => Math.round(v * 1000) / 1000, r4 = (v) => Math.round(v * 10000) / 10000;
    return L.map(b => [b.id, r3(b.x), r3(b.y), r3(b.z), r4(b.qx), r4(b.qy), r4(b.qz), r4(b.qw), r3(b.vx), r3(b.vy), r3(b.vz), r3(b.wx), r3(b.wy), r3(b.wz), b.sleep ? 1 : 0, r3(b.dent || 0)]);
  }
  // A guest blends its own (predicted) barrels toward the host's state, age seconds old. A barrel its own car touched in
  // the last second keeps the local result (the player feels the hit at once; the host catches up from the car it sees).
  netApply(arr, age) {
    if (!Array.isArray(arr)) return 0;
    let n = 0; age = Math.max(0, Math.min(0.3, +age || 0));
    for (const e of arr) {
      if (!Array.isArray(e) || e.length < 16 || !e.every(v => typeof v === 'number' && isFinite(v))) continue;
      const b = this.list.find(x => x.id === e[0]); if (!b) continue;
      if (b.ownT != null && this.t - b.ownT < 1) continue;
      const sl = e[14] === 1, k = sl ? 0 : age;
      const tx = e[1] + e[8] * k, ty = e[2] + e[9] * k, tz = e[3] + e[10] * k, err = Math.hypot(tx - b.x, ty - b.y, tz - b.z);
      let qx = e[4], qy = e[5], qz = e[6], qw = e[7];
      if (sl && err < 0.05 || err > 6) { b.x = tx; b.y = ty; b.z = tz; }   // far off (lost packets, joined late): take it
      else { const f = 0.35, g = Math.min(f, 0.25 / Math.max(1e-6, err)); b.x += (tx - b.x) * g; b.y += (ty - b.y) * g; b.z += (tz - b.z) * g;   // glide, at most 0.25 m per packet
        if (qx * b.qx + qy * b.qy + qz * b.qz + qw * b.qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
        qx = b.qx + (qx - b.qx) * f; qy = b.qy + (qy - b.qy) * f; qz = b.qz + (qz - b.qz) * f; qw = b.qw + (qw - b.qw) * f; }
      const ql = Math.hypot(qx, qy, qz, qw) || 1; b.qx = qx / ql; b.qy = qy / ql; b.qz = qz / ql; b.qw = qw / ql;
      b.vx = e[8]; b.vy = e[9]; b.vz = e[10]; b.wx = e[11]; b.wy = e[12]; b.wz = e[13];
      b.dent = Math.max(b.dent || 0, e[15]);
      if (sl && err < 0.05) this.freeze(b); else this.wake(b);
      n++;
    }
    if (n) this.ver++;
    return n;
  }
  // ---------------------------------------------------------------- simulation
  // cars: Vehicle objects (planar rigid bodies) that can touch the barrels this step
  step(dt, cars) {
    const L = this.list; if (!L.length) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.t += dt;
    // physics LOD: too many awake barrels -> the farthest from the first car (the player) freeze where they are
    let nAw = 0; for (const b of L) if (!b.sleep) nAw++;
    if (nAw > BAR.maxAwake && cars.length) {
      const c0 = cars[0], aw = L.filter(b => !b.sleep).sort((a, b) => ((b.x - c0.x) ** 2 + (b.z - c0.z) ** 2) - ((a.x - c0.x) ** 2 + (a.z - c0.z) ** 2) || a.id - b.id);
      for (let k = 0; k < nAw - BAR.maxAwake; k++) this.freeze(aw[k]);
    }
    // 1) forces: gravity, air drag (projected area of a cylinder), angular damping
    for (const b of L) {
      if (b.sleep) continue;
      const B = BARREL_TYPES[b.type], M = barrelMass(B);
      b.vy -= G * dt;
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      if (sp > 0.5) {
        const a = bqRot(b, 0, 1, 0, _bv), ca = Math.abs(a.x * b.vx + a.y * b.vy + a.z * b.vz) / sp, sa = Math.sqrt(Math.max(0, 1 - ca * ca));
        const cdA = B.cd[0] * 2 * B.r * B.h * sa + B.cd[1] * Math.PI * B.r * B.r * ca;
        const k = Math.min(0.5, 0.5 * BAR.rhoAir * cdA * sp * M.iM * dt * (b.fly ? BAR.flyDrag : 1));
        b.vx -= b.vx * k; b.vy -= b.vy * k; b.vz -= b.vz * k;
      }
      const w = Math.hypot(b.wx, b.wy, b.wz);
      if (w > 1e-6) {   // air on a tumbling cylinder: tau = c w^2 (c from integrating the side area), plus a little damping
        const c = 0.5 * BAR.rhoAir * B.cd[0] * 2 * B.r * 2 * Math.pow(B.h / 2, 4) / 4;
        const f = Math.max(0, 1 - (c * w * M.iT * (b.fly ? BAR.flyDrag : 1) + BAR.angDamp) * dt);
        b.wx *= f; b.wy *= f; b.wz *= f;
      }
    }
    // 2) contacts
    const C = this.contacts; this.freeContacts();
    for (const b of L) {
      // a sleeping barrel touches nothing new until something awake reaches it (cars and awake barrels test against it)
      if (b.sleep) continue;
      this.groundAndWalls(b);
    }
    for (let i = 0; i < L.length; i++) {
      const A = L[i], MA = barrelMass(BARREL_TYPES[A.type]);
      for (let j = i + 1; j < L.length; j++) {
        const Bb = L[j]; if (A.sleep && Bb.sleep) continue;
        const MB = barrelMass(BARREL_TYPES[Bb.type]), dx = Bb.x - A.x, dy = Bb.y - A.y, dz = Bb.z - A.z, rr = MA.R + MB.R + 0.02;
        if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
        const n0 = C.length;
        this.pairBB(A, Bb);
        if (C.length > n0) { if (A.sleep) { this.wake(A); this.groundAndWalls(A); } if (Bb.sleep) { this.wake(Bb); this.groundAndWalls(Bb); } }
      }
    }
    const cb = this._cars; cb.length = 0;
    for (let ci = 0; ci < cars.length; ci++) {
      const V = cars[ci]; if (!V) continue;
      const hl = (V.spec.len || 4.5) / 2, hw = (V.spec.wid || 1.9) / 2, rc = Math.hypot(hl, hw) + 0.1;
      let body = null;
      for (const b of L) {
        if (b.park) continue;
        const M = barrelMass(BARREL_TYPES[b.type]), dx = b.x - V.x, dz = b.z - V.z, rr = rc + M.R;
        if (dx * dx + dz * dz > rr * rr || b.y - M.R > V.y + 1.6) continue;
        if (!body) { body = this.carBody(V, hl, hw); body.idx = ci; }
        const n0 = C.length;
        this.pairCar(b, body);
        if (C.length > n0) { if (b.sleep) { this.wake(b); this.groundAndWalls(b); } body.hit = true; }
      }
      if (body && body.hit) cb.push(body);
    }
    // contacts with barrels that were asleep when the pass started and were woken by a car / barrel later on are complete:
    // groundAndWalls ran for them when they woke. A sleeping body in a contact acts as static ground.
    this.stats.contacts = C.length;
    // 3) pre-step: effective masses, bounce targets, warm start
    const cache = this.cache, next = {};
    for (const c of C) this.preStep(c, cache);
    // 4) velocity iterations
    for (const b of L) b.v0 = Math.hypot(b.vx, b.vy, b.vz);
    for (let it = 0; it < BAR.velIt; it++) for (const c of C) this.solveVel(c);
    // impulse clamp: a car can give a barrel at most (1 + e) times its own speed (plus what the barrel already had); a barrel
    // wedged against the car by others must not be squeezed out faster than that (the classic 'explosion' of stacked contacts)
    for (const body of cb) { const vc = Math.hypot(body.vx0, body.vz0);
      for (const c of C) if (c.B === body && !c.A.sleep) { const b = c.A, cap = Math.max(b.v0, 1.4 * vc + 2), v = Math.hypot(b.vx, b.vy, b.vz);
        if (v > cap) { const k = cap / v; b.vx *= k; b.vy *= k; b.vz *= k; }
        const w = Math.hypot(b.wx, b.wy, b.wz), wc = Math.max(8, (1.4 * vc + 2) / BARREL_TYPES[b.type].r); if (w > wc) { const k = wc / w; b.wx *= k; b.wy *= k; b.wz *= k; } } }
    // rolling / spinning resistance on the ground (after friction has settled the contact)
    for (const c of C) if (c.ground && c.jn > 0) this.rollRes(c, dt);
    // 5) position correction with pseudo-velocities (the car does not move: it is far heavier and its own solver owns it)
    for (const b of L) { b.pvx = 0; b.pvy = 0; b.pvz = 0; b.pwx = 0; b.pwy = 0; b.pwz = 0; }
    for (let it = 0; it < BAR.posIt; it++) for (const c of C) this.solvePos(c, dt);
    // keep the impulses for the next step
    for (const c of C) if (c.jn > 0 || c.jt1 || c.jt2) next[c.key] = [c.jn, c.jt1, c.jt2];
    this.cache = next;
    // cars take the horizontal impulse: back to their own velocities
    for (const body of cb) this.carDone(body);
    // ownership spreads through barrel-barrel contacts: what the local car knocked into is also predicted locally (netApply)
    for (const c of C) if (c.B && c.B.type) { const a = c.A.ownT, b = c.B.ownT;
      if (a != null && this.t - a < 0.05 && (b == null || b < a)) c.B.ownT = a; else if (b != null && this.t - b < 0.05 && (a == null || a < b)) c.A.ownT = b; }
    // 6) integrate, clamp, sleep
    for (const b of L) {
      if (b.sleep) continue;
      let sp = Math.hypot(b.vx, b.vy, b.vz); if (sp > BAR.vMax) { const k = BAR.vMax / sp; b.vx *= k; b.vy *= k; b.vz *= k; }
      let w = Math.hypot(b.wx, b.wy, b.wz); if (w > BAR.wMax) { const k = BAR.wMax / w; b.wx *= k; b.wy *= k; b.wz *= k; }
      b.x += (b.vx + b.pvx) * dt; b.y += (b.vy + b.pvy) * dt; b.z += (b.vz + b.pvz) * dt;
      const ox = (b.wx + b.pwx) * dt * 0.5, oy = (b.wy + b.pwy) * dt * 0.5, oz = (b.wz + b.pwz) * dt * 0.5;
      const qw = b.qw, qx = b.qx, qy = b.qy, qz = b.qz;
      b.qw = qw - ox * qx - oy * qy - oz * qz; b.qx = qx + ox * qw + oy * qz - oz * qy; b.qy = qy + oy * qw + oz * qx - ox * qz; b.qz = qz + oz * qw + ox * qy - oy * qx;
      const ql = Math.hypot(b.qw, b.qx, b.qy, b.qz); b.qw /= ql; b.qx /= ql; b.qy /= ql; b.qz /= ql;
      b.fly = !b.touch && (Math.abs(b.vy) > BAR.flyVy || w > BAR.flyW);
      if (b.y < -200) this.freeze(b);
    }
    this.sleepIslands(dt);
    let aw = 0; for (const b of L) if (!b.sleep) aw++;
    this.stats.awake = aw;
    if (aw || cb.length) this.ver++;
    if (t0) this.stats.ms = performance.now() - t0;
  }
  freeze(b) { b.sleep = true; b.slowT = BAR.sleepT; b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0; }
  // islands of touching awake barrels go to sleep together
  sleepIslands(dt) {
    const L = this.list, par = this._par || (this._par = []);
    par.length = L.length; for (let k = 0; k < L.length; k++) par[k] = k;
    const root = (k) => { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; };
    for (const c of this.contacts) if (c.B && c.B.qw !== undefined && !c.A.sleep && !c.B.sleep) { const a = root(c.A.id), b = root(c.B.id); if (a !== b) par[Math.max(a, b)] = Math.min(a, b); }
    const minT = this._minT || (this._minT = []); minT.length = L.length; minT.fill(Infinity);
    for (const b of L) {
      if (b.sleep) continue;
      const slow = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz < BAR.sleepV * BAR.sleepV && b.wx * b.wx + b.wy * b.wy + b.wz * b.wz < BAR.sleepW * BAR.sleepW && !b.carT;
      b.slowT = slow && b.touch ? b.slowT + dt : 0;
      const r = root(b.id); minT[r] = Math.min(minT[r], b.slowT);
    }
    for (const b of L) if (!b.sleep && minT[root(b.id)] >= BAR.sleepT) this.freeze(b);
  }
  // ---------------------------------------------------------------- contact generation
  newContact(A, B, px, py, pz, nx, ny, nz, pen, key, mat) {
    const c = this._pool.pop() || {};
    c.A = A; c.B = B; c.px = px; c.py = py; c.pz = pz; c.nx = nx; c.ny = ny; c.nz = nz; c.pen = pen; c.key = key;
    const mt = BMAT[BARREL_TYPES[A.type].mat][mat]; c.mu = mt[0]; c.e = mt[1] * (A.fly ? BAR.flyE : 1); c.ground = mat === 'asphalt' || mat === 'grass' || mat === 'gravel'; c.surf = c.ground ? mat : '';
    c.jn = 0; c.jt1 = 0; c.jt2 = 0; c.jp = 0;
    this.contacts.push(c); return c;
  }
  freeContacts() { const C = this.contacts; for (const c of C) { c.A = c.B = null; this._pool.push(c); } C.length = 0; for (const b of this.list) { b.touch = false; b.carT = false; } }
  // support point of cap `cap` (+1 top, -1 bottom) in the world direction (dx, dy, dz); returns false if the direction is along the axis
  capSupport(b, M, B, cap, dx, dy, dz, o) {
    const a = bqRot(b, 0, 1, 0, _bv), ax = a.x, ay = a.y, az = a.z, da = dx * ax + dy * ay + dz * az;
    let px = dx - ax * da, py = dy - ay * da, pz = dz - az * da; const pl = Math.hypot(px, py, pz);
    const cy = M.g + cap * B.h / 2;
    o.cx = b.x + ax * cy; o.cy = b.y + ay * cy; o.cz = b.z + az * cy; o.pl = pl;
    if (pl < 1e-6) { o.x = o.cx; o.y = o.cy; o.z = o.cz; return false; }
    px /= pl; py /= pl; pz /= pl;
    o.x = o.cx + px * B.r; o.y = o.cy + py * B.r; o.z = o.cz + pz * B.r; o.ux = px; o.uy = py; o.uz = pz; o.ax = ax; o.ay = ay; o.az = az;
    return true;
  }
  groundAndWalls(b) {
    const B = BARREL_TYPES[b.type], M = barrelMass(B), g = this.ground(b.x, b.z, b), q = g.q, T = this.T;
    b.gE = g.e; b.gSurf = g.surf;
    const o = this._so || (this._so = {});
    // ground: the lowest point of each cap; nearly upright -> a square of rim points (a stable base)
    for (const cap of [-1, 1]) {
      const ok = this.capSupport(b, M, B, cap, 0, -1, 0, o);
      const pts = this._gp || (this._gp = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
      let n = 1;
      if (ok) {
        pts[0][0] = o.x; pts[0][1] = o.y; pts[0][2] = o.z;
        if (o.pl < 0.35) {   // a square: the support point, the opposite one and the two at 90°
          const sx = o.ay * o.uz - o.az * o.uy, sy = o.az * o.ux - o.ax * o.uz, sz = o.ax * o.uy - o.ay * o.ux;
          pts[1][0] = o.cx - o.ux * B.r; pts[1][1] = o.cy - o.uy * B.r; pts[1][2] = o.cz - o.uz * B.r;
          pts[2][0] = o.cx + sx * B.r; pts[2][1] = o.cy + sy * B.r; pts[2][2] = o.cz + sz * B.r;
          pts[3][0] = o.cx - sx * B.r; pts[3][1] = o.cy - sy * B.r; pts[3][2] = o.cz - sz * B.r; n = 4;
        }
      } else {
        const u = bqRot(b, 1, 0, 0, { x: 0, y: 0, z: 0 }), w = bqRot(b, 0, 0, 1, { x: 0, y: 0, z: 0 });
        pts[0][0] = o.cx + u.x * B.r; pts[0][1] = o.cy + u.y * B.r; pts[0][2] = o.cz + u.z * B.r;
        pts[1][0] = o.cx - u.x * B.r; pts[1][1] = o.cy - u.y * B.r; pts[1][2] = o.cz - u.z * B.r;
        pts[2][0] = o.cx + w.x * B.r; pts[2][1] = o.cy + w.y * B.r; pts[2][2] = o.cz + w.z * B.r;
        pts[3][0] = o.cx - w.x * B.r; pts[3][1] = o.cy - w.y * B.r; pts[3][2] = o.cz - w.z * B.r; n = 4;
      }
      for (let k = 0; k < n; k++) {
        const pen = g.e - pts[k][1];
        if (pen > -0.002) { this.newContact(b, null, pts[k][0], pts[k][1], pts[k][2], 0, 1, 0, Math.max(0, pen), 'g' + b.id + (cap > 0 ? 'T' : 'B') + k, g.surf); b.touch = true; }
      }
    }
    // barriers: the same faces the car meets (dented by earlier hits); only while the barrel is inside them and below their top
    const BLf = q.bl + (T.dentL ? T.dentL[q.i] - T.twL[q.i] : 0), BRf = q.br + (T.dentR ? T.dentR[q.i] - T.twR[q.i] : 0);
    const band = q.pc === q.pc, E = T.esc;
    const allowed = (d, wx, wz) => (d <= BLf && d >= -BRf) || (band && d <= q.pc + q.phw && d >= q.pc - q.phw) || (E && E.near(wx, wz)[0] < E.hw);
    if (!allowed(q.d, b.x, b.z)) return;          // flew over the barrier: nothing holds it any more
    const nx = q.nx, nz = q.nz;
    for (const dir of [1, -1]) for (const cap of [-1, 1]) {
      if (!this.capSupport(b, M, B, cap, nx * dir, 0, nz * dir, o)) continue;
      if (o.y > g.e + BAR.wallH) continue;
      const d = q.d + (o.x - b.x) * nx + (o.z - b.z) * nz;
      if (allowed(d, o.x, o.z)) continue;
      // nearest face, like the car: circuit barrier or pit-lane band edge
      let c = d > BLf ? BLf - d : -BRf - d, mat = (d > 0 ? T.btL : T.btR) ? ['armco', 'concrete', 'tyres'][(d > 0 ? T.btL : T.btR)[q.i]] : 'concrete';
      if (band) { const c2 = d > q.pc + q.phw ? q.pc + q.phw - d : q.pc - q.phw - d; if (Math.abs(c2) < Math.abs(c)) { c = c2; mat = 'concrete'; } }
      if (Math.abs(c) > 0.6) continue;              // deeper than any real overlap: it is the far side of a gap, not this wall
      const sg = c > 0 ? 1 : -1;
      this.newContact(b, null, o.x, o.y, o.z, nx * sg, 0, nz * sg, Math.abs(c), 'w' + b.id + (dir > 0 ? 'L' : 'R') + (cap > 0 ? 'T' : 'B'), mat || 'concrete');
      b.touch = true;
    }
  }
  // point p inside barrel b? returns the penetration and writes the outward normal at p into o
  inside(b, B, M, px, py, pz, o) {
    const a = bqRot(b, 0, 1, 0, _bv), ax = a.x, ay = a.y, az = a.z;
    const cx = b.x + ax * M.g, cy = b.y + ay * M.g, cz = b.z + az * M.g;
    const rx = px - cx, ry = py - cy, rz = pz - cz, t = rx * ax + ry * ay + rz * az;
    const hh = B.h / 2; if (t > hh || t < -hh) return -1;
    const qx = rx - ax * t, qy = ry - ay * t, qz = rz - az * t, ql = Math.hypot(qx, qy, qz);
    if (ql >= B.r) return -1;
    const pa = hh - Math.abs(t), pr = B.r - ql;
    if (pa < pr || ql < 1e-9) { const s = t >= 0 ? 1 : -1; o.x = ax * s; o.y = ay * s; o.z = az * s; return pa; }
    o.x = qx / ql; o.y = qy / ql; o.z = qz / ql; return pr;
  }
  // sample points of a barrel (fills this._sp, returns count). The rim is rounded (RC): the ring sits RC inside the side wall
  // (its contacts are end-face contacts: stacking) and the support point of each cap towards (tx, ty, tz) sits RC inside the end
  // face (its contacts are side-wall contacts: barrels side by side). Sharp rims would put both exactly on the other drum's
  // surface and the contact normal would flip between end face and side wall.
  samples(b, B, M, tx, ty, tz) {
    const sp = this._sp || (this._sp = []), n = BAR.rim, o = this._so2 || (this._so2 = {}), RC = BAR.rc;
    const u = bqRot(b, 1, 0, 0, this._u || (this._u = { x: 0, y: 0, z: 0 })), w = bqRot(b, 0, 0, 1, this._w || (this._w = { x: 0, y: 0, z: 0 })), a = bqRot(b, 0, 1, 0, this._a || (this._a = { x: 0, y: 0, z: 0 }));
    let k = 0;
    for (const cap of [-1, 1]) {
      const cy = M.g + cap * B.h / 2, cx0 = b.x + a.x * cy, cy0 = b.y + a.y * cy, cz0 = b.z + a.z * cy, rr = B.r - RC;
      for (let i = 0; i < n; i++) {
        const th = i * 2 * Math.PI / n, c = Math.cos(th) * rr, s = Math.sin(th) * rr;
        const p = sp[k] || (sp[k] = [0, 0, 0, '']); p[0] = cx0 + u.x * c + w.x * s; p[1] = cy0 + u.y * c + w.y * s; p[2] = cz0 + u.z * c + w.z * s; p[3] = (cap > 0 ? 'T' : 'B') + i; k++;
      }
      if (this.capSupport(b, M, B, cap, tx - b.x, ty - b.y, tz - b.z, o)) {
        const p = sp[k] || (sp[k] = [0, 0, 0, '']); p[0] = o.x - o.ax * cap * RC; p[1] = o.y - o.ay * cap * RC; p[2] = o.z - o.az * cap * RC; p[3] = (cap > 0 ? 'T' : 'B') + 's'; k++;
      }
    }
    return k;
  }
  pairBB(A, Bb) {
    const TA = BARREL_TYPES[A.type], TB = BARREL_TYPES[Bb.type], MA = barrelMass(TA), MB = barrelMass(TB), o = this._no || (this._no = {});
    // A's points inside B: normal = B's outward normal (pushes A away from B)
    let n = this.samples(A, TA, MA, Bb.x, Bb.y, Bb.z);
    for (let k = 0; k < n; k++) { const p = this._sp[k], pen = this.inside(Bb, TB, MB, p[0], p[1], p[2], o); if (pen >= 0) { this.newContact(A, Bb, p[0] - o.x * pen / 2, p[1] - o.y * pen / 2, p[2] - o.z * pen / 2, o.x, o.y, o.z, pen, 'b' + A.id + '-' + Bb.id + 'a' + p[3], TB.mat); A.touch = Bb.touch = true; } }
    n = this.samples(Bb, TB, MB, A.x, A.y, A.z);
    for (let k = 0; k < n; k++) { const p = this._sp[k], pen = this.inside(A, TA, MA, p[0], p[1], p[2], o); if (pen >= 0) { this.newContact(A, Bb, p[0] - o.x * pen / 2, p[1] - o.y * pen / 2, p[2] - o.z * pen / 2, -o.x, -o.y, -o.z, pen, 'b' + A.id + '-' + Bb.id + 'b' + p[3], TB.mat); A.touch = Bb.touch = true; } }
  }
  // the car as a solver body: planar (x, z, yaw), its hull in its own frame
  carBody(V, hl, hw) {
    const b = { car: V, m: V.P.m, iM: V.kin ? 0 : 1 / V.P.m, iI: V.kin ? 0 : 1 / V.P.Iz, x: V.x, y: V.y, z: V.z, h: V.h, hl, hw, hit: false, jx: 0, jz: 0, peak: 0, pa: 0, pb: 0, pnx: 0, pnz: 0, rel: 0, bm: 0 };
    const fx = Math.sin(V.h), fz = Math.cos(V.h), lx = Math.cos(V.h), lz = -Math.sin(V.h);
    b.fx = fx; b.fz = fz; b.lx = lx; b.lz = lz;
    b.vx = V.u * fx + V.v * lx; b.vz = V.u * fz + V.v * lz; b.r = V.r;
    b.vx0 = b.vx; b.vz0 = b.vz; b.r0 = b.r;
    const body = V.spec.body, open = ['f1', 'f1h', 'indy', 'fe', 'lmp'].includes(body), race = V.P.race;
    b.ht = V.spec.hgt || BODY_DEF[body] && BODY_DEF[body].hgt || 1.25;
    b.yb = open ? 0.05 : 0.09;                                     // floor height
    b.yl = open ? 0.22 : race ? 0.32 : 0.45;                       // top of the vertical nose face (front wing / splitter / bumper)
    const rake = (open ? 38 : race ? 24 : 14) * Math.PI / 180;     // rake of the nose above it
    b.sa = Math.sin(rake); b.ca = Math.cos(rake);
    return b;
  }
  // signed distances of a local point to the hull planes; returns penetration (>= 0 inside) and the chosen local normal in o
  hull(cb, X, Y, Z, vX, vY, vZ, o) {
    // planes: front, nose rake, rear, left, right, top (the floor is never a push direction: the ground holds the barrel)
    const d0 = Z - cb.hl, d1 = (Z - cb.hl) * cb.ca + (Y - cb.yl) * cb.sa, d2 = -Z - cb.hl, d3 = X - cb.hw, d4 = -X - cb.hw, d5 = Y - cb.ht;
    if (d0 >= 0 || d1 >= 0 || d2 >= 0 || d3 >= 0 || d4 >= 0 || d5 >= 0 || Y <= cb.yb) return -1;
    const P = this._hp || (this._hp = [[0, 0, 1], [0, 0, 0], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0]]);
    P[1][1] = cb.sa; P[1][2] = cb.ca;
    const ds = this._hd || (this._hd = [0, 0, 0, 0, 0, 0]); ds[0] = d0; ds[1] = d1; ds[2] = d2; ds[3] = d3; ds[4] = d4; ds[5] = d5;
    // CCD-lite: the face the point crossed most recently (depth / approach speed); at rest, the shallowest face
    let best = -1, bt = Infinity, bp = Infinity, bpi = 0;
    for (let k = 0; k < 6; k++) {
      const pen = -ds[k], vn = vX * P[k][0] + vY * P[k][1] + vZ * P[k][2];
      if (pen < bp) { bp = pen; bpi = k; }
      if (vn < -0.3) { const t = pen / -vn; if (t < bt) { bt = t; best = k; } }
    }
    if (best < 0 || bt > 0.05) best = bpi;
    o.X = P[best][0]; o.Y = P[best][1]; o.Z = P[best][2]; o.k = best;
    return -ds[best];
  }
  pairCar(b, cb) {
    const B = BARREL_TYPES[b.type], M = barrelMass(B), o = this._co || (this._co = {});
    const fx = cb.fx, fz = cb.fz, lx = cb.lx, lz = cb.lz;
    // barrel points inside the hull (the support point aims at the car's centre, raised to the nose height)
    const n = this.samples(b, B, M, cb.x, b.y, cb.z);
    for (let k = 0; k < n; k++) {
      const p = this._sp[k], rx = p[0] - cb.x, ry = p[1] - cb.y, rz = p[2] - cb.z;
      const X = rx * lx + rz * lz, Z = rx * fx + rz * fz, Y = ry;
      // velocity of the barrel point relative to the car point, in the car frame
      const qx = p[0] - b.x, qy = p[1] - b.y, qz = p[2] - b.z;
      const vbx = b.vx + b.wy * qz - b.wz * qy, vby = b.vy + b.wz * qx - b.wx * qz, vbz = b.vz + b.wx * qy - b.wy * qx;
      const vcx = cb.vx + cb.r * rz, vcz = cb.vz - cb.r * rx, dvx = vbx - vcx, dvz = vbz - vcz;
      const pen = this.hull(cb, X, Y, Z, dvx * lx + dvz * lz, vby, dvx * fx + dvz * fz, o);
      if (pen < 0 || pen > 0.9) continue;
      const nx = o.X * lx + o.Z * fx, nz = o.X * lz + o.Z * fz, ny = o.Y;
      this.newContact(b, cb, p[0], p[1], p[2], nx, ny, nz, pen, 'c' + b.id + '-' + cb.idx + p[3], 'car');
      b.touch = true; b.carT = true;
    }
    // the car's corners inside the barrel (a front corner clipping it); normal = the barrel's outward normal, reversed
    const yA = cb.yb + 0.08, yB = Math.min(cb.ht - 0.05, 0.55);
    for (let k = 0; k < 10; k++) {
      const X = k < 8 ? (k & 1 ? cb.hw : -cb.hw) : 0, Z = k < 8 ? ((k >> 1) & 1 ? cb.hl - 0.05 : -cb.hl + 0.05) : (k === 8 ? cb.hl : -cb.hl), Y = k < 8 ? (k >> 2 ? yB : yA) : yA;
      const px = cb.x + lx * X + fx * Z, pz = cb.z + lz * X + fz * Z, py = cb.y + Y;
      const pen = this.inside(b, B, M, px, py, pz, o);
      if (pen < 0) continue;
      this.newContact(b, cb, px + o.x * pen / 2, py + o.y * pen / 2, pz + o.z * pen / 2, -o.x, -o.y, -o.z, pen, 'k' + b.id + '-' + cb.idx + '-' + k, 'car');
      b.touch = true; b.carT = true;
    }
  }
  // ---------------------------------------------------------------- solver
  // velocity of body X at world point p (X: barrel, car body, or null = static)
  velAt(X, px, py, pz, o) {
    if (!X || (X.qw !== undefined && X.sleep)) { o.x = o.y = o.z = 0; return o; }
    if (X.car) { const rx = px - X.x, rz = pz - X.z; o.x = X.vx + X.r * rz; o.y = 0; o.z = X.vz - X.r * rx; return o; }
    const rx = px - X.x, ry = py - X.y, rz = pz - X.z;
    o.x = X.vx + X.wy * rz - X.wz * ry; o.y = X.vy + X.wz * rx - X.wx * rz; o.z = X.vz + X.wx * ry - X.wy * rx; return o;
  }
  // inverse effective mass of body X at p along (nx, ny, nz)
  kAt(X, px, py, pz, nx, ny, nz) {
    if (!X || (X.qw !== undefined && X.sleep)) return 0;
    if (X.car) { const rx = px - X.x, rz = pz - X.z, rn = rz * nx - rx * nz; return (nx * nx + nz * nz) * X.iM + rn * rn * X.iI; }
    const M = barrelMass(BARREL_TYPES[X.type]), rx = px - X.x, ry = py - X.y, rz = pz - X.z;
    const cx = ry * nz - rz * ny, cy = rz * nx - rx * nz, cz = rx * ny - ry * nx;   // r x n
    const a = bqRot(X, 0, 1, 0, _bv), ca = cx * a.x + cy * a.y + cz * a.z;
    // I^-1 (r x n) for a transversely isotropic body: axis part / Ia + the rest / It
    const ix = a.x * ca * M.iA + (cx - a.x * ca) * M.iT, iy = a.y * ca * M.iA + (cy - a.y * ca) * M.iT, iz = a.z * ca * M.iA + (cz - a.z * ca) * M.iT;
    return M.iM + cx * ix + cy * iy + cz * iz;
  }
  // apply impulse (jx, jy, jz) to body X at p (sign already applied)
  impulse(X, px, py, pz, jx, jy, jz) {
    if (!X || (X.qw !== undefined && X.sleep)) return;
    if (X.car) { const rx = px - X.x, rz = pz - X.z; X.vx += jx * X.iM; X.vz += jz * X.iM; X.r += (rz * jx - rx * jz) * X.iI; return; }
    const M = barrelMass(BARREL_TYPES[X.type]), rx = px - X.x, ry = py - X.y, rz = pz - X.z;
    X.vx += jx * M.iM; X.vy += jy * M.iM; X.vz += jz * M.iM;
    const cx = ry * jz - rz * jy, cy = rz * jx - rx * jz, cz = rx * jy - ry * jx, a = bqRot(X, 0, 1, 0, _bv), ca = cx * a.x + cy * a.y + cz * a.z;
    X.wx += a.x * ca * M.iA + (cx - a.x * ca) * M.iT; X.wy += a.y * ca * M.iA + (cy - a.y * ca) * M.iT; X.wz += a.z * ca * M.iA + (cz - a.z * ca) * M.iT;
  }
  pseudo(X, px, py, pz, jx, jy, jz) {   // the same on the pseudo-velocities (position pass, barrels only)
    if (!X || X.car || X.sleep) return;
    const M = barrelMass(BARREL_TYPES[X.type]), rx = px - X.x, ry = py - X.y, rz = pz - X.z;
    X.pvx += jx * M.iM; X.pvy += jy * M.iM; X.pvz += jz * M.iM;
    const cx = ry * jz - rz * jy, cy = rz * jx - rx * jz, cz = rx * jy - ry * jx, a = bqRot(X, 0, 1, 0, _bv), ca = cx * a.x + cy * a.y + cz * a.z;
    X.pwx += a.x * ca * M.iA + (cx - a.x * ca) * M.iT; X.pwy += a.y * ca * M.iA + (cy - a.y * ca) * M.iT; X.pwz += a.z * ca * M.iA + (cz - a.z * ca) * M.iT;
  }
  preStep(c, cache) {
    const nx = c.nx, ny = c.ny, nz = c.nz;
    // tangent basis
    let t1x, t1y, t1z; if (Math.abs(ny) < 0.9) { t1x = nz; t1y = 0; t1z = -nx; } else { t1x = 0; t1y = -nz; t1z = ny; }
    const tl = Math.hypot(t1x, t1y, t1z); t1x /= tl; t1y /= tl; t1z /= tl;
    c.t1x = t1x; c.t1y = t1y; c.t1z = t1z; c.t2x = ny * t1z - nz * t1y; c.t2y = nz * t1x - nx * t1z; c.t2z = nx * t1y - ny * t1x;
    const kA = (x, y, z) => this.kAt(c.A, c.px, c.py, c.pz, x, y, z) + this.kAt(c.B, c.px, c.py, c.pz, x, y, z);
    c.mN = 1 / Math.max(1e-9, kA(nx, ny, nz)); c.mT1 = 1 / Math.max(1e-9, kA(c.t1x, c.t1y, c.t1z)); c.mT2 = 1 / Math.max(1e-9, kA(c.t2x, c.t2y, c.t2z));
    const vn = this.relN(c, nx, ny, nz), w = cache[c.key];
    // bounce only on a NEW contact (one that was not there last step): a resting or pressed contact never re-injects energy
    // from the jitter of its own relative velocity; against a car never more than the car's own speed can give
    let close = -vn; if (c.B && c.B.car) close = Math.min(close, Math.hypot(c.B.vx, c.B.vz) + 3);
    c.bounce = !w && close > BAR.bounceMin ? c.e * close : 0;
    c.vn0 = vn;
    if (w) { c.jn = w[0] * 0.9; c.jt1 = w[1] * 0.9; c.jt2 = w[2] * 0.9; this.applyC(c, c.jn, c.jt1, c.jt2); }
  }
  relN(c, x, y, z) {
    const a = this.velAt(c.A, c.px, c.py, c.pz, this._va || (this._va = {})), b = this.velAt(c.B, c.px, c.py, c.pz, this._vb || (this._vb = {}));
    return (a.x - b.x) * x + (a.y - b.y) * y + (a.z - b.z) * z;
  }
  applyC(c, jn, j1, j2) {
    const jx = c.nx * jn + c.t1x * j1 + c.t2x * j2, jy = c.ny * jn + c.t1y * j1 + c.t2y * j2, jz = c.nz * jn + c.t1z * j1 + c.t2z * j2;
    this.impulse(c.A, c.px, c.py, c.pz, jx, jy, jz);
    this.impulse(c.B, c.px, c.py, c.pz, -jx, -jy, -jz);
    if (c.B && c.B.car) { c.B.jx -= jx; c.B.jz -= jz; }
  }
  solveVel(c) {
    // normal
    const vn = this.relN(c, c.nx, c.ny, c.nz);
    let dj = c.mN * (c.bounce - vn); const j0 = c.jn; c.jn = Math.max(0, j0 + dj); dj = c.jn - j0;
    if (dj) this.applyC(c, dj, 0, 0);
    // friction on a circle of radius mu * jn
    const v1 = this.relN(c, c.t1x, c.t1y, c.t1z), v2 = this.relN(c, c.t2x, c.t2y, c.t2z);
    let a1 = c.jt1 - c.mT1 * v1, a2 = c.jt2 - c.mT2 * v2; const lim = c.mu * c.jn, al = Math.hypot(a1, a2);
    if (al > lim) { a1 *= lim / al; a2 *= lim / al; }
    const d1 = a1 - c.jt1, d2 = a2 - c.jt2; c.jt1 = a1; c.jt2 = a2;
    if (d1 || d2) this.applyC(c, 0, d1, d2);
  }
  solvePos(c, dt) {
    const A = c.A, B = c.B;
    const pa = A.sleep ? null : A, pb = B && B.qw !== undefined && !B.sleep ? B : null;
    if (!pa && !pb) return;
    const pv = (X) => { if (!X) return [0, 0, 0]; const rx = c.px - X.x, ry = c.py - X.y, rz = c.pz - X.z; return [X.pvx + X.pwy * rz - X.pwz * ry, X.pvy + X.pwz * rx - X.pwx * rz, X.pvz + X.pwx * ry - X.pwy * rx]; };
    const va = pv(pa), vb = pv(pb), vn = (va[0] - vb[0]) * c.nx + (va[1] - vb[1]) * c.ny + (va[2] - vb[2]) * c.nz;
    const target = Math.min(BAR.maxCorr, BAR.beta / dt * Math.max(0, c.pen - BAR.slop));
    const k = (pa ? this.kAt(pa, c.px, c.py, c.pz, c.nx, c.ny, c.nz) : 0) + (pb ? this.kAt(pb, c.px, c.py, c.pz, c.nx, c.ny, c.nz) : 0);
    if (k <= 0) return;
    const j0 = c.jp || 0; let jp = Math.max(0, j0 + (target - vn) / k); const dj = jp - j0; c.jp = jp;
    if (!dj) return;
    this.pseudo(pa, c.px, c.py, c.pz, c.nx * dj, c.ny * dj, c.nz * dj);
    this.pseudo(pb, c.px, c.py, c.pz, -c.nx * dj, -c.ny * dj, -c.nz * dj);
  }
  rollRes(c, dt) {
    const b = c.A; if (b.sleep) return;
    const B = BARREL_TYPES[b.type], M = barrelMass(B);
    // rolling: the part of the spin about any horizontal axis; a dented drum rolls worse
    const n = c, wn = b.wx * n.nx + b.wy * n.ny + b.wz * n.nz;
    let px = b.wx - n.nx * wn, py = b.wy - n.ny * wn, pz = b.wz - n.nz * wn; const pl = Math.hypot(px, py, pz);
    const a = bqRot(b, 0, 1, 0, _bv);
    const invI = (x, y, z) => { const ca = x * a.x + y * a.y + z * a.z; return ca * ca * M.iA + (1 - ca * ca) * M.iT; };
    if (pl > 1e-6) {
      const ux = px / pl, uy = py / pl, uz = pz / pl, Ie = 1 / invI(ux, uy, uz);
      const L = Math.min(Ie * pl, B.crr * (BCRR[c.surf] || 1) * (1 + 4 * b.dent) * c.jn * B.r);
      b.wx -= ux * L * invI(ux, uy, uz); b.wy -= uy * L * invI(ux, uy, uz); b.wz -= uz * L * invI(ux, uy, uz);
    }
    if (Math.abs(wn) > 1e-6) {   // spinning on the spot (a barrel standing on its base, twirling)
      const s = wn > 0 ? 1 : -1, iI = invI(n.nx, n.ny, n.nz), L = Math.min(Math.abs(wn) / iI, BAR.spinMu * c.jn * B.r * 0.5);
      b.wx -= n.nx * s * L * iI; b.wy -= n.ny * s * L * iI; b.wz -= n.nz * s * L * iI;
    }
  }
  // the car gets back its new velocity; the hardest barrel hit of this step becomes a damage hit, an impact for the HUD/audio
  carDone(cb) {
    const V = cb.car, fx = cb.fx, fz = cb.fz, lx = cb.lx, lz = cb.lz;
    // a kinematic car (another player's, multiplayer) pushes with infinite mass and takes nothing back: its own client owns it
    if (!V.kin) { V.u = cb.vx * fx + cb.vz * fz; V.v = cb.vx * lx + cb.vz * lz; V.r = clamp(cb.r, -4, 4); }
    for (const c of this.contacts) if (c.B === cb) c.A.ownT = V.kin ? c.A.ownT : this.t;   // last touch by a local car (netApply)
    // strongest single contact (for damage and effects)
    let best = null, bj = 0;
    for (const c of this.contacts) if (c.B === cb && c.jn > bj) { bj = c.jn; best = c; }
    if (!best) return;
    const M = barrelMass(BARREL_TYPES[best.A.type]), close = Math.max(0, -best.vn0);
    const rx = best.px - cb.x, rz = best.pz - cb.z, a = rx * fx + rz * fz, bb = rx * lx + rz * lz;
    const dv = Math.hypot(cb.vx - cb.vx0, cb.vz - cb.vz0);
    best.A.hitV = Math.max(best.A.hitV, close);
    if (!V.kin) { V.barT = 0.5; V.lastBarrel = close; V.barHits = (V.barHits || 0) + (close > 1 ? 1 : 0); }
    // damage: the panel / wing that met the barrel feels a hit that grows with the barrel's mass (a 15 kg drum at
    // 150 km/h takes a front wing, an 80 kg water barrel bends a suspension); the car's own delta-v is tiny
    if (close > 2 && !V.kin && typeof dmgImpact === 'function' && V.dmg) {
      const x = close * Math.min(1, Math.sqrt(M.m / 90)) * 0.3 + dv;
      dmgImpact(V, { x, a, b: bb, nF: -(best.nx * fx + best.nz * fz), nL: -(best.nx * lx + best.nz * lz), soft: 0.4, kind: 'barrel' });
    }
    if (close > 3) this.ev.push({ x: best.px, y: best.py, z: best.pz, v: close, m: M.m, mat: BARREL_TYPES[best.A.type].mat, car: true, player: !!V.isPlayer });
    // dent (visual only): a hard hit squashes the drum across the push
    if (close > 6) {   // direction of the push in the barrel's own frame (inverse rotation), across its axis
      const d = best.A, iq = { qw: d.qw, qx: -d.qx, qy: -d.qy, qz: -d.qz }, l = bqRot(iq, best.nx, best.ny, best.nz, { x: 0, y: 0, z: 0 });
      d.dent = Math.min(0.28, d.dent + (close - 6) * 0.012); d.dentA = Math.atan2(l.z, l.x);
    }
  }
}

// ---------------------------------------------------------------------------
//  Placement on the circuits: impact attenuators (water barrels) in front of the pit-wall nose, and the practice test
//  layouts. Returns plain specs; main.js / the tests turn them into barrels with a BarrelWorld.
// ---------------------------------------------------------------------------
// where the pit wall starts (first sample with the pit wall between track and pit lane), or -1
function pitWallNose(T) {
  if (!T.pitSep) return -1;
  const N = T.N;
  for (let i = 0; i < N; i++) if (T.pitSep[i] && !T.pitSep[(i - 1 + N) % N]) return i;
  return -1;
}
function placeBarrels(W, T, mode) {
  W.clear();
  if (T.twL0 && (T.twL0.some(v => v > 0.05) || T.twR0.some(v => v > 0.05))) W.tyrePool(TYRE_POOL);   // tyre walls shed loose tyres (v103)
  if (mode === 'off' || !mode) return W;
  const N = T.N, at = (i, d) => { const k = ((i % N) + N) % N; return [T.x[k] + T.nx[k] * d, T.z[k] + T.nz[k] * d, Math.atan2(T.tx[k], T.tz[k])]; };
  // attenuator: 3 rows of 2 water barrels against the nose of the pit wall, on the run-off side of it (the pit lane passes on the
  // other side); the last row touches the nose
  const i0 = pitWallNose(T);
  if (i0 >= 0) {
    const ps = T.pitSide, B = BARREL_TYPES.water, sp = 2 * B.r + 0.01, bar = T.pitBar[i0];
    const back = Math.max(1, Math.round(sp / T.ds)), p = at(i0 - back, ps * (bar - sp - 0.02));
    const n0 = W.list.length; W.grid('water', p[0], p[1], p[2], 3, 2);
    // never on the racing surface (Monaco's pit entry has no such nose): drop the block if any barrel would stand on the asphalt
    if (W.list.slice(n0).some(b => { const q = T.project(b.x, b.z, -1); return q.d < q.wl + 0.3 && q.d > -q.wr - 0.3; })) { W.list.length = n0; W.ver++; }
  }
  if (mode === 'test') {
    // practice test area on the main straight after the line: a tower of 4, a pyramid 3-2-1, a row of 6 and a tower of steel drums
    const s2i = (sN) => Math.round(sN * (T.L / T.def.nom) / T.ds);
    const p1 = at(s2i(60), 0), p2 = at(s2i(95), -2.5), p3 = at(s2i(130), 2), p4 = at(s2i(165), -1);
    W.tower('plastic', p1[0], p1[1], 4, 0);
    W.pyramid('plastic', p2[0], p2[1], p2[2], 3);
    W.row('plastic', p3[0], p3[1], p3[2] + Math.PI / 2, 6, 0.05);
    W.tower('steel', p4[0], p4[1], 3, 0.4);
  }
  return W;
}

// ---------------------------------------------------------------------------
//  Rendering: one InstancedMesh per barrel type; a dent squashes the instance across the hit (visual only)
// ---------------------------------------------------------------------------
// (v103) a car tyre lying flat (axis Y): rounded tread, sidewalls and the open bead hole; shared by the tyre walls and loose tyres
function tyreGeometry(ro, ri, h, seg) {
  const a = h / 2, c = Math.min(0.06, h * 0.22), P = [];
  const arc = (cx, cy, r, a0, a1, n) => { for (let k = 0; k <= n; k++) { const t = a0 + (a1 - a0) * k / n; P.push(new THREE.Vector2(cx + r * Math.cos(t), cy + r * Math.sin(t))); } };
  P.push(new THREE.Vector2(ri, -a));
  arc(ro - c, -a + c, c, -Math.PI / 2, 0, 2);       // lower shoulder
  arc(ro - c, a - c, c, 0, Math.PI / 2, 2);          // upper shoulder
  P.push(new THREE.Vector2(ri, a), new THREE.Vector2(ri, -a));   // 7 bands x seg: ~170 triangles at 12 sides
  const g = new THREE.LatheGeometry(P, seg || 14);
  g.computeVertexNormals();
  return g;
}
let _tyreMat = null;
function tyreMaterial() { return _tyreMat || (_tyreMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2d, roughness: 0.88, metalness: 0, side: THREE.DoubleSide })); }
class BarrelView {
  constructor(scene) { this.scene = scene; this.meshes = {}; this.ver = -1; this.n = -1; this.M = null; }
  build(W) {
    for (const k in this.meshes) { this.scene.remove(this.meshes[k]); this.meshes[k].dispose && this.meshes[k].dispose(); }
    this.meshes = {}; this.idx = [];
    const count = {}; for (const b of W.list) count[b.type] = (count[b.type] || 0) + 1;
    for (const type in count) {
      const B = BARREL_TYPES[type], M = barrelMass(B);
      if (B.tyre) {   // (v103) a loose tyre: same shape as the wall's
        const im = new THREE.InstancedMesh(tyreGeometry(B.r, B.r * 0.6, B.h, 16).translate(0, M.g, 0), tyreMaterial(), count[type]);
        im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.meshes[type] = im; this.scene.add(im); im.userData.n = 0; continue;
      }
      const geo = new THREE.CylinderGeometry(B.r, B.r, B.h, 22, 6, false).translate(0, M.g, 0);
      // ribs: the side bulges slightly at two hoops; a reflective band in the middle (vertex colours)
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c0 = new THREE.Color(B.color), c1 = new THREE.Color(B.band);
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v) - M.g, side = Math.abs(Math.hypot(pos.getX(v), pos.getZ(v)) - B.r) < 1e-4 && Math.abs(y) < B.h / 2 - 1e-4;
        const hoop = side && Math.abs(Math.abs(y) - B.h * 0.17) < B.h * 0.09;
        if (hoop) { pos.setX(v, pos.getX(v) * 1.025); pos.setZ(v, pos.getZ(v) * 1.025); }
        const band = side && Math.abs(y) < B.h * 0.09, c = band ? c1 : c0;
        col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: B.mat === 'steel' ? 0.45 : 0.62, metalness: B.mat === 'steel' ? 0.55 : 0.0 });
      const im = new THREE.InstancedMesh(geo, mat, count[type]); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes[type] = im; this.scene.add(im); im.userData.n = 0;
    }
    for (const b of W.list) { const im = this.meshes[b.type]; this.idx[b.id] = im.userData.n++; }
    this.n = W.list.length; this.ver = -1;
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.P = new THREE.Vector3(); this.S = new THREE.Vector3(); this.D = new THREE.Matrix4(); this.R = new THREE.Matrix4();
  }
  update(W) {
    if (W.list.length !== this.n) this.build(W);
    if (W.ver === this.ver) return;
    this.ver = W.ver;
    const dirty = new Set(), live = new Set();
    for (const b of W.list) if (!b.park) live.add(b.type);
    for (const k in this.meshes) this.meshes[k].visible = live.has(k);   // a pool of parked tyres costs no draw call
    for (const b of W.list) {
      const im = this.meshes[b.type], i = this.idx[b.id];
      if (b.park) { this.M.makeScale(1e-4, 1e-4, 1e-4); this.M.setPosition(0, -500, 0); im.setMatrixAt(i, this.M); dirty.add(im); continue; }
      this.M.compose(this.P.set(b.x, b.y, b.z), this.Q.set(b.qx, b.qy, b.qz, b.qw), this.S.set(1, 1, 1));
      if (b.dent > 0.001) {   // squash across the hit direction (local), bulge the other way a little
        const a = b.dentA; this.R.makeRotationY(a); this.D.makeScale(1 + b.dent * 0.45, 1, 1 - b.dent).premultiply(this.R).multiply(this.R.makeRotationY(-a));
        this.M.multiply(this.D);
      }
      im.setMatrixAt(i, this.M); dirty.add(im);
    }
    for (const im of dirty) im.instanceMatrix.needsUpdate = true;
  }
  dispose() { for (const k in this.meshes) this.scene.remove(this.meshes[k]); this.meshes = {}; this.n = -1; }
}
