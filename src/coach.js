// ============================================================================
//  COACH: active racing line. Green = throttle, yellow = lift / get ready, red = brake,
//  coloured live from the player's speed against a reachable speed plan for this car and grip.
//  It learns per braking zone from the player's own passes (late / early / good), warns earlier
//  where they brake late, marks the braking point where they miss it, and withdraws the line
//  from the corners they already master (it comes back when they get one wrong again).
//  Pure logic here (also used by tools/headless.js); CoachLine draws it.
// ============================================================================
// plan: braking at 80 % of the tyre limit and corners at 97 %, below the theoretical lap so a
// human can hit it; lead: seconds of yellow before the red; pre/exit: metres judged around a zone
// apex: red only above this share of the plan's apex speed (the plan corners at 97 %); soft: per level of late
// braking, the warning envelope brakes that much softer (level 3 = 30 % longer braking, so the red starts earlier)
const COACH = { brake: 0.8, vk: 0.97, lead: 0.45, pre: 160, exit: 25, master: 3, apex: 1.02, soft: 0.1, blend: 1.2 }, NEVER = 1e4;
const coachPlan = (T, line, P, grip) => qssProfile(T, line, P, { grip }, { brake: COACH.brake, lat: 1, vk: COACH.vk }).vel;

// braking zones of a speed plan: { s (window start), b (brake), a (apex), e (window end) } as sample indices
function coachZones(T, vel) {
  const N = T.N, ds = T.ds, md = (i) => ((i % N) + N) % N, at = (o) => vel[md(s0 + o)];
  let s0 = 0; for (let i = 1; i < N; i++) if (vel[i] > vel[s0]) s0 = i;   // scan from the fastest point: no zone wraps around it
  const Z = [];
  for (let c = 0; c < N;) {
    if (!(at(c + 1) < at(c) - 0.02)) { c++; continue; }
    let e = c; while (e < N && at(e + 1) < at(e) - 0.02) e++;
    // carry on through a plateau (and a second step down, as in a chicane) to the slowest point
    let m = e; for (let k = e; k < N && at(k + 1) <= at(k) + 0.02 && (k - e) * ds < 80;) { k++; if (at(k) < at(m)) m = k; }
    if (at(c) - at(m) > Math.max(3, 0.07 * at(c))) Z.push({ ob: c, oa: m });   // a real brake or lift, not a breath
    c = m + 1;
  }
  const pre = Math.round(COACH.pre / ds), ex = Math.round(COACH.exit / ds);
  // the window ends before the next zone brakes and starts after the previous window (offsets wrap by N)
  Z.forEach((z, k) => { z.oe = Math.min(z.oa + ex, (k < Z.length - 1 ? Z[k + 1].ob : Z[0].ob + N) - 1); });
  return Z.map((z, k) => {
    const os = Math.max(z.ob - pre, (k ? Z[k - 1].oe : Z[Z.length - 1].oe - N) + 1);
    return { s: md(s0 + os), b: md(s0 + z.ob), a: md(s0 + z.oa), e: md(s0 + z.oe) };
  });
}

class Coach {
  constructor(T, vel, saved) {
    this.T = T; this.N = T.N; this.vel = vel;
    const N = T.N;
    this.thrR = new Float32Array(N); this.thrY = new Float32Array(N); this.hide = new Uint8Array(N); this.stat = new Float32Array(N);
    this.zEval = new Int16Array(N).fill(-1);
    this.zones = coachZones(T, vel);
    saved = saved || {};
    this.zones.forEach((z, k) => {
      const sN = z.a * T.ds * T.nom / T.L; let best = null;
      for (const c of T.corners || []) if (Math.abs(c.s - sN) < 160 && (!best || Math.abs(c.s - sN) < Math.abs(best.s - sN))) best = c;
      z.name = best ? best.name : 'Frenada ' + (k + 1);
      z.key = String(Math.round(z.a * T.ds / 10) * 10);
      // saved state, matched to the nearest apex within 40 m (the plan moves a little with grip)
      let st = saved[z.key]; if (!st) for (const kk in saved) if (Math.abs(+kk - +z.key) <= 40) { st = saved[kk]; break; }
      z.lvl = st ? st.l : 0; z.streak = st ? st.s : 0; z.n = st ? st.n : 0; z.hidden = z.streak >= COACH.master; z.mark = null;
      for (let j = z.s; j !== this.next(z.e); j = this.next(j)) this.zEval[j] = k;
      z.p = z.s; for (let j = z.s; j !== z.b; j = this.next(j)) if (vel[j] > vel[z.p]) z.p = j;   // top speed before the zone
    });
    this.obs = null;
    this.rebuild();
  }
  next(i) { return (i + 1) % this.N; }
  rel(z, i) { return ((i - z.s) % this.N + this.N) % this.N; }
  // per-sample thresholds (m/s): red when the car is faster than thrR, yellow when faster than thrY.
  // thrR is a braking envelope, not the plan speed itself: the fastest a car can be at that point and still make
  // the apex braking like the plan does. So it is red only where braking is due (from your braking point to the apex),
  // never on a corner exit or a straight, and never at the apex for a car at the plan's speed. A late braker gets the
  // red earlier by braking softer in the envelope (longer braking), which leaves the apex speed untouched.
  rebuild() {
    const { N, vel, T } = this, ds = T.ds, lead = new Float32Array(N).fill(COACH.lead), nx = (j) => this.next(j), pv = (j) => (j - 1 + N) % N;
    // fixed colours, continuous 0 (green) .. 1 (yellow) .. 2 (red) from the plan's slope
    for (let i = 0; i < N; i++) { const dv = vel[(i + 3) % N] - vel[i]; this.stat[i] = Math.min(2, Math.max(0, (-dv - 0.02) / 0.165)); }
    this.thrR.fill(NEVER); this.hide.fill(0);
    for (const z of this.zones) {
      const g = 1 / (1 + COACH.soft * z.lvl), ld = Math.min(1.3, Math.max(0.25, COACH.lead + (z.lvl > 0 ? 0.25 : 0.08) * z.lvl));
      let d = z.b; while (d !== z.a && vel[nx(d)] < vel[d] - 0.02) d = nx(d);   // end of the main braking run
      // apex back to the braking point: the plan's own deceleration, softened by g on the main run
      let e2 = (vel[z.a] * COACH.apex) ** 2, main = false; this.thrR[z.a] = Math.sqrt(e2);
      for (let j = pv(z.a); ; j = pv(j)) {
        if (j === d) main = true;
        e2 += (main ? g : 1) * Math.max(0, vel[j] ** 2 - vel[nx(j)] ** 2); this.thrR[j] = Math.sqrt(e2);
        if (j === z.b) break;
      }
      // before the braking point: carry on with the deceleration of its first 30 m
      let n = 0, j2 = z.b; while (n < 12 && j2 !== d) { j2 = nx(j2); n++; }
      const rate = g * (n ? (vel[z.b] ** 2 - vel[j2] ** 2) / n : 2 * 8 * ds);
      if (z.b !== z.s) for (let j = pv(z.b); ; j = pv(j)) { e2 += rate; this.thrR[j] = Math.sqrt(e2); if (j === z.s) break; }
      // and on, outside any zone, until it is far above any speed (no red edge at the window start)
      for (let j = pv(z.s), k = 0; k < 400 && this.zEval[j] < 0 && e2 < 150 * 150; j = pv(j), k++) { e2 += rate; this.thrR[j] = Math.min(this.thrR[j], Math.sqrt(e2)); }
      // past the apex the threshold climbs away from the plan over ~15 m (no hard edge for a car too fast there), then never red
      const va = this.thrR[z.a]; for (let j = nx(z.a), k = 1; j !== nx(z.e); j = nx(j), k++) this.thrR[j] = Math.max(vel[j], va) + 0.6 * k;
      for (let j = z.s; ; j = nx(j)) { lead[j] = ld; if (z.hidden) this.hide[j] = 1; if (j === z.e) break; }
    }
    for (let i = 0; i < N; i++) {   // yellow: the red is less than `lead` seconds ahead at this speed
      const n = Math.ceil(Math.max(5, vel[i]) * lead[i] / ds); let m = this.thrR[i];
      for (let k = 1; k <= n; k++) m = Math.min(m, this.thrR[(i + k) % N]);
      this.thrY[i] = m;
    }
    // a withdrawn corner fades in and out over 20 m instead of starting at one sample
    const h = this.hide, w = Math.round(20 / ds); this.hideS = this.hideS || new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 0; for (let k = -w; k <= w; k++) if (h[(i + k + N) % N]) m = Math.max(m, 1 - Math.abs(k) / (w + 1)); this.hideS[i] = m; }
    for (const z of this.zones) if (z.mark) z.mark.ref = this.refPoint(z, z.mark.vb);
  }
  // live colour of sample j for a car at speed v, 0 green .. 1 yellow .. 2 red: the same blend as the shader
  code(v, j) { const sm = (x) => { const t = Math.min(1, Math.max(0, (x + COACH.blend) / (2 * COACH.blend))); return t * t * (3 - 2 * t); };
    return sm(v - this.thrY[j]) + sm(v - this.thrR[j]); }
  // where the red starts for a car arriving at speed v (sample index)
  refPoint(z, v) {
    for (let j = z.p; ; j = this.next(j)) { if (this.thrR[j] < v) return j; if (j === z.a) return z.b; }
  }
  // every simulation step: i sample, v speed (m/s), brk pedal 0..1, off = completely beyond the track limits,
  // hit = hard contact with a barrier. Returns { zone, kind: 'late' | 'early' | 'good', msg } when a pass ends.
  observe(i, v, brk, off, hit, dt) {
    const k = this.zEval[i]; let o = this.obs, ev = null;
    this.cool = hit || off ? 3 : Math.max(0, (this.cool || 0) - dt);   // still recovering from a crash or an off: that pass says nothing
    if (o && k !== o.k) {   // left the window: judged only if the car rode it to its end
      const z = this.zones[o.k];
      if (o.ok && o.r >= this.rel(z, z.e) - 3) ev = this.judge(o);
      this.obs = o = null;
    }
    if (k < 0) return ev;
    const z = this.zones[k], r = this.rel(z, i);
    // a pass counts only when the car comes in before the top speed ahead of the zone and with some speed there
    // (not after a spin, a reset or stuck in traffic); braking and red are looked at from that point on
    if (!o) { this.obs = o = { k, ok: r < this.rel(z, z.p) || (this.reArm && r < this.rel(z, z.b) - 4), arm: false, bi: -1, vb: 0, red: -1, vmin: 1e9, off: false, r }; this.reArm = false; }
    if (r < o.r - 4) o.ok = false;   // going backwards, reset or spun
    o.r = Math.max(o.r, r);
    const ra = this.rel(z, z.a);
    if (!o.arm) { if (r < this.rel(z, z.p)) return ev; o.arm = true; o.vin = v / this.vel[i]; if (o.vin < 0.55 || this.cool > 0) o.ok = false; }
    if (o.red < 0 && r <= ra && v > this.thrR[i] + 0.5) o.red = i;   // the line turned red under the car here
    if (brk > 0.05 && o.bi < 0 && r <= ra) { o.bi = i; o.vb = v; }
    if (r >= this.rel(z, z.b) - 4) { o.vmin = Math.min(o.vmin, v); if (off || hit) o.off = true; }
    return ev;
  }
  judge(o) {
    const z = this.zones[o.k], T = this.T, kmh = (x) => Math.round(Math.abs(x) * 3.6);
    const vA = this.vel[z.a], ratio = o.vmin / vA;
    // err (m): + braked after the line turned red under the car, - braked before the red for the speed it carried
    let err = 0, ref = -1;
    const red = o.red >= 0 && (o.bi < 0 || this.rel(z, o.red) <= this.rel(z, o.bi));
    if (red) { ref = o.red; err = Math.round(((o.bi >= 0 ? this.rel(z, o.bi) : this.rel(z, z.a)) - this.rel(z, ref)) * T.ds); }
    else if (o.bi >= 0) { ref = this.refPoint(z, o.vb); err = Math.round((this.rel(z, o.bi) - this.rel(z, ref)) * T.ds); }
    let kind = 'good', msg = '';
    // braking later than the line is fine while the corner still comes out right (the plan keeps a margin)
    if (o.off || ratio > 1.10 || (err > 15 && ratio > 1.04) || (err > 8 && ratio < 0.92)) {
      kind = 'late';
      msg = err > 8 ? `frenaste ${err} m tarde` + (o.off ? ' y te saliste' : '') : o.off ? 'te saliste o tocaste el muro: frena antes' : `entraste ${kmh(o.vmin - vA)} km/h rápido`;
    } else if ((o.bi >= 0 && err < -15 && ratio < 0.98) || ratio < 0.85) {
      kind = 'early';
      msg = err < -15 ? `podías frenar ${-err} m más tarde` : `pasaste ${kmh(vA - o.vmin)} km/h lento`;
    }
    z.n++;
    if (kind === 'good') {
      z.streak++;
      if (z.streak >= 2 && z.lvl) z.lvl -= Math.sign(z.lvl);   // learned: the extra help fades
      if (z.streak === COACH.master) msg = 'dominada: retiro la ayuda';
      else if (z.mark) msg = 'corregido';
      z.mark = null;
    } else {
      if (z.hidden) msg += ' · vuelve la ayuda';
      z.streak = 0;
      z.lvl = kind === 'late' ? Math.min(3, z.lvl + 1) : Math.max(-2, z.lvl - 1);
      z.mark = o.bi >= 0 ? { vb: o.vb, bi: o.bi, ref } : { vb: o.vmin, bi: -1, ref };
      if (kind === 'late') this.cool = 2;   // the next corner right after a mistake is not judged on it
    }
    z.hidden = z.streak >= COACH.master;
    this.rebuild();
    return { zone: z, kind, err, ratio, msg: msg ? z.name + ' · ' + msg : '' };
  }
  // the player rewound (practice): a pass that already went wrong (off, or past the apex) still counts, since the
  // retry is what the marks are for; a pass cut short says nothing. The retry is judged even when the rewind
  // lands inside the window, as long as it lands before the braking point.
  rewound() {
    const o = this.obs; let ev = null;
    if (o && o.ok && o.arm && (o.off || o.r >= this.rel(this.zones[o.k], this.zones[o.k].a))) ev = this.judge(o);
    this.obs = null; this.cool = 0; this.reArm = true;
    return ev;
  }
  state() { const o = {}; for (const z of this.zones) if (z.n) o[z.key] = { l: z.lvl, s: z.streak, n: z.n }; return o; }
}

// The line on the track: one mesh, coloured in the vertex shader from the thresholds above, so a frame
// costs three uniforms. Mode 'fija' shows the plan's static colours everywhere, as the old ideal line.
class CoachLine {
  constructor(world) {
    this.world = world; this.group = new THREE.Group(); world.group.add(this.group);
    this.u = { uV: { value: 0 }, uI: { value: 0 }, uN: { value: 1 }, uWin: { value: 0 }, uHide: { value: 1 },
      uG: { value: col3('#2fd27a') }, uY: { value: col3('#f6c21c') }, uR: { value: col3('#e3342c') } };
    this.mesh = null; this.marks = null;
  }
  build(coach) {
    const T = coach.T, N = T.N, W = this.world, off = W.line.off, seg = [];
    for (let i = 0; i < N; i++) if (i % 3 !== 2) seg.push(i);   // dashed
    const pos = new Float32Array(seg.length * 18), aI = new Float32Array(seg.length * 6);
    seg.forEach((i, n) => {
      const i2 = (i + 1) % N, a0 = W.P(i, off[i] - 0.28, 0.02), a1 = W.P(i, off[i] + 0.28, 0.02), b0 = W.P(i2, off[i2] - 0.28, 0.02), b1 = W.P(i2, off[i2] + 0.28, 0.02);
      // each end of a dash carries its own sample, so the colour runs smoothly along it
      [a0, b0, b1, a0, b1, a1].forEach((p, k) => { pos.set(p, n * 18 + k * 3); aI[n * 6 + k] = k === 1 || k === 2 || k === 4 ? i2 : i; });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aI', new THREE.BufferAttribute(aI, 1));
    g.setAttribute('aD', new THREE.BufferAttribute(new Float32Array(seg.length * 24), 4));
    const mat = new THREE.MeshBasicMaterial({ transparent: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
    mat.customProgramCacheKey = () => 'coachline';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = 'attribute float aI;\nattribute vec4 aD;\nuniform float uV, uI, uN, uWin, uHide;\nuniform vec3 uG, uY, uR;\nvarying vec4 vCo;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          // live colours near the car (fading into the fixed ones at the far end of the window and just behind it)
          float di = mod(aI - uI + uN, uN);
          float near = uWin > 0.0 ? max(1.0 - smoothstep(uWin * 0.7, uWin, di), smoothstep(uN - 16.0, uN - 4.0, di)) : 0.0;
          // 0 green .. 1 yellow .. 2 red, blended over ±${COACH.blend.toFixed(2)} m/s around each threshold (Coach.code does the same)
          float live = smoothstep(-${COACH.blend.toFixed(2)}, ${COACH.blend.toFixed(2)}, uV - aD.y) + smoothstep(-${COACH.blend.toFixed(2)}, ${COACH.blend.toFixed(2)}, uV - aD.x);
          float code = mix(aD.w, live, near);
          float al = mix(0.55, 0.9, near);
          al *= mix(1.0, near * smoothstep(aD.x * 1.04, aD.x * 1.04 + 2.0, uV), aD.z * uHide);   // mastered corner: only when clearly too fast
          vCo = vec4(code > 1.0 ? mix(uY, uR, code - 1.0) : mix(uG, uY, code), al);`);
      sh.fragmentShader = 'varying vec4 vCo;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if (vCo.a < 0.01) discard;\n  diffuseColor = vec4(vCo.rgb, diffuseColor.a * vCo.a);');
    };
    this.dispose();
    this.seg = seg; this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.group.add(this.mesh);
    this.u.uN.value = N;
    this.update(coach);
  }
  update(coach) {
    const a = this.mesh.geometry.getAttribute('aD'), d = a.array;
    this.seg.forEach((i, n) => { for (let k = 0, o = n * 24; k < 6; k++, o += 4) { const j = k === 1 || k === 2 || k === 4 ? (i + 1) % coach.N : i; d[o] = coach.thrR[j]; d[o + 1] = coach.thrY[j]; d[o + 2] = coach.hideS[j]; d[o + 3] = coach.stat[j]; } });
    a.needsUpdate = true;
    this.buildMarks(coach);
  }
  // braking boards on the line where the last pass went wrong: white = brake here, orange = where you braked
  buildMarks(coach) {
    if (this.marks) { this.group.remove(this.marks); this.marks.geometry.dispose(); this.marks.material.dispose(); this.marks = null; }
    const W = this.world, off = W.line.off, b = new GeoBuilder(false), wh = col3('#ffffff'), or = col3('#ff8a1c');
    const bar = (j, c) => { const j2 = (j + 1) % coach.N; b.quad(W.P(j, off[j] - 1.2, 0.03), W.P(j2, off[j2] - 1.2, 0.03), W.P(j2, off[j2] + 1.2, 0.03), W.P(j, off[j] + 1.2, 0.03), c); };
    let n = 0;
    for (const z of coach.zones) if (z.mark && !z.hidden) { bar(z.mark.ref, wh); if (z.mark.bi >= 0 && z.mark.bi !== z.mark.ref) bar(z.mark.bi, or); n++; }
    if (!n) return;
    this.marks = new THREE.Mesh(b.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, depthWrite: false }));
    this.group.add(this.marks);
  }
  // every frame: v speed (m/s), i sample of the car; adaptive = live colours + withdrawn corners
  frame(v, i, adaptive) {
    this.u.uV.value = v; this.u.uI.value = i; this.u.uHide.value = adaptive ? 1 : 0;
    this.u.uWin.value = adaptive ? Math.max(200, v * 6) / this.world.T.ds : -1;
    if (this.marks) this.marks.visible = adaptive;
  }
  dispose() {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
  }
  remove() { this.dispose(); if (this.marks) { this.group.remove(this.marks); this.marks.geometry.dispose(); this.marks.material.dispose(); this.marks = null; } this.world.group.remove(this.group); }
}
