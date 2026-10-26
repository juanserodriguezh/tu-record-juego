// ============================================================================
//  AI DRIVERS: racing-line pursuit scaled by difficulty, traffic handling
//  (follow / overtake / side-by-side), launch and stuck recovery.
// ============================================================================
const AI_NAMES = [
  ['Thibault Averbeke', 'AVE'], ['Marco Castellan', 'CAS'], ['Ruben Okafor', 'OKA'], ['Jonas Lindqvist', 'LIN'], ['Sacha Moreau', 'MOR'],
  ['Dawid Kaminski', 'KAM'], ['Eoin Farrell', 'FAR'], ['Naoki Tahara', 'TAH'], ['Anders Brevik', 'BRE'], ['Luca Santoro', 'SAN'],
  ['Felipe Duarte', 'DUA'], ['Callum Whitmore', 'WHI'], ['Hanna Vogt', 'VOG'], ['Pablo Ruiz', 'RUI'], ['Ivana Novak', 'NOV'],
  ['Giulia Marchetti', 'MAR'], ['Omar Haddad', 'HAD'], ['Viktor Kowal', 'KOW'], ['Bastien Aubert', 'AUB'], ['Yuki Morimoto', 'MRM'],
  ['Zara Adeyemi', 'ADE'], ['Wim Brandt', 'BRA'], ['Iker Etxeberria', 'ETX'], ['Nils Oyelaran', 'OYE']
];
const AI_PROFILES = new Map();
const AI_TUNE = { brake: 0.72, lat: 1.0 };
// braking commitment grows with difficulty (later braking = faster, riskier)
const aiBrake = (diff) => AI_TUNE.brake - 0.1 + 0.012 * (clamp(diff, 1, 10) - 1);
// difficulty sets how close to the limit a driver takes the corners and the braking zones (1..10).
// It must not cap the straights: a slower driver still runs flat out to the car's top speed,
// otherwise power tracks (Monza) punish the AI far more than twisty ones.
const aiPace = (diff) => 0.72 + 0.28 * (clamp(diff, 1, 10) - 1) / 9;
function aiProfile(T, line, P, env, key, diff) {
  const c = diff != null ? aiPace(diff) : 1, bk = (diff != null ? aiBrake(diff) : AI_TUNE.brake) * c * c;
  const k = key + '|' + env.grip.toFixed(2) + '|' + bk.toFixed(3) + '|' + c.toFixed(3);
  let p = AI_PROFILES.get(k);
  // corners at c x the limit speed (not grip x c^2: with downforce that would hit the winged cars harder)
  if (!p) { p = qssProfile(T, line, P, env, { brake: bk, lat: AI_TUNE.lat, vk: c }); AI_PROFILES.set(k, p); }
  return p;
}

class AIDriver {
  constructor(veh, T, line, opts) {
    this.veh = veh; this.T = T; this.line = line;
    this.diff = opts.diff || 5; this.skill = (this.diff - 1) / 9;
    this.k = 1 + (opts.spread || 0);   // the difficulty is already in the speed plan (aiProfile)
    this.off = 0; this.steerF = 0; this.stuckT = 0; this.wrongT = 0; this.passSide = 0;
    // reaction to lights out: ~0.2 s for the best, ~0.5 s for the slowest
    this.react = opts.react != null ? opts.react : 0.18 + (1 - this.skill) * 0.18 + Math.random() * 0.12;
    this.startD = null; this.revPh = Math.random() * 10;
    this.phase = Math.random() * 100; this.t = 0;
    this.inp = { steer: 0, throttle: 0, brake: 0, handbrake: false, shiftUp: false, shiftDown: false };
    this.env = null; this.prof = null;
  }
  startRolling() { this.goT = 10; }
  setEnv(env, key) {
    this.key = key;
    this.env = { grip: env.grip, wet: env.wet, water: env.water || 0, dryLine: env.dryLine || 0, abs: true, tc: true, esc: true, autoShift: true, steerAssist: true };
    // the plan assumes the grip this car's tyres give now (compound x water x wear), quantised so cars share profiles
    const est = this.veh.ty ? tyreGripEst(this.veh.ty, this.env.water, this.env) : 1;
    this.planGrip = Math.max(0.3, Math.round(env.grip * est / 0.02) * 0.02);
    this.profObj = aiProfile(this.T, this.line, this.veh.P, { grip: this.planGrip }, key, this.diff); this.prof = this.profObj.vel;
  }
  // weather / wear moved on: rebuild the plan when the grip it assumes drifted
  refresh(env) {
    if (!this.env) return;
    const e = this.env, est = this.veh.ty ? tyreGripEst(this.veh.ty, env.water || 0, env) : 1, pg = Math.max(0.3, Math.round(env.grip * est / 0.02) * 0.02);
    e.water = env.water || 0; e.dryLine = env.dryLine || 0; e.wet = env.wet; e.grip = env.grip;
    if (pg !== this.planGrip) this.setEnv(env, this.key);
  }
  // cars: [{ id, x, z, s, d, u, len, wid, i }] (every car on track, including this one)
  drive(dt, cars, self, ctrl) {
    const v = this.veh, T = this.T, line = this.line, N = T.N, q = v.q, inp = this.inp;
    this.t += dt;
    // on the grid while the lights count down: on the brakes, the revs come up as the lamps start to light
    // and are then HELD steady at the launch speed (launch control), only a faint natural wobble
    if (ctrl.hold) {
      this.revPh += dt;
      if (this.launchX == null) { this.launchX = (v.P.race ? 0.64 : 0.5) + (Math.random() - 0.5) * 0.06; this.revAt = 0.5 + Math.random() * 0.8; this.revSeed = Math.random() * 6.28; }
      const ramp = clamp(((ctrl.lightsT != null ? ctrl.lightsT : this.revPh) - this.revAt) / 0.6, 0, 1);
      const hold = (this.launchX - 0.13) / 0.72;
      inp.throttle = lerp(0.02, hold, ramp) + 0.008 * ramp * Math.sin(this.revPh * 1.7 + this.revSeed);
      inp.brake = 1; inp.steer = 0; this.goT = 0; this.startD = q.d; return inp;
    }
    this.launchX = null;
    this.goT = (this.goT || 0) + dt;
    const i = q.i, u = Math.max(v.u, 1), L = T.L;
    // crash damage: a hurt car drives slower (limp), a wrecked one pulls to the edge and stops
    const dmgFx = DMG.scale > 0 && v.dmg ? v.dmg.fx : null, dead = !!(dmgFx && v.dmg.dead), kk = this.k * (dmgFx ? dmgFx.pace : 1);
    this.decel = 0.6 * (v.P.mu || 1) * 9.81 * (this.planGrip || 1);
    { let pmin = 1e9; for (let m = 5; m <= 60; m += 11) pmin = Math.min(pmin, this.prof[(i + Math.round(m / T.ds)) % N] * kk); this.brakingAhead = pmin < u * 0.85; }
    const myW = v.spec.wid || 1.9, myL = v.spec.len || 4.6;
    // ---- traffic
    let target = null, vCap = Infinity, dMin = -1e9, dMax = 1e9, squeezed = null;
    const myVx = v.u * Math.sin(v.h) + v.v * Math.cos(v.h), myVz = v.u * Math.cos(v.h) - v.v * Math.sin(v.h);
    const look = 16 + u * 1.15;
    let ahead = null, aheadDs = 1e9;
    for (const c of cars) {
      if (c === self || c.ghost) continue;
      let ds = c.s - q.s; if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L;
      if (ds < -myL - 2 || ds > look) continue;
      const dd = c.d - q.d, lenSum = (myL + c.len) / 2, widSum = (myW + c.wid) / 2;
      // cars in my path: never be faster than a speed from which I could still stop behind them
      // if they braked as hard as they can (Gipps-style safe speed)
      if (ds > 0.5 && ds < look) {
        const jj = (i + Math.round(ds / T.ds)) % N, myD = line.off[jj] + this.off, lenSum = (myL + c.len) / 2, widSum = (myW + c.wid) / 2;
        if (Math.abs(c.d - myD) < widSum + 0.35 || Math.abs(dd) < widSum + 0.1) {
          const b = this.decel, tau = 0.28, gap = ds - lenSum - (1.2 + u * (0.05 + 0.12 * (ctrl.caution || 0)));
          const vs = -b * tau + Math.sqrt(Math.max(0, b * b * tau * tau + (c.u > 0 ? c.u * c.u : 0) + 2 * b * gap));
          vCap = Math.min(vCap, Math.max(0, vs));
        }
      }
      // safety layer: time of closest approach in the ground plane (cars in front only)
      if (ds > 0 && ds < 30) {
        const rx = c.x - v.x, rz = c.z - v.z, vx = (c.vx || 0) - myVx, vz = (c.vz || 0) - myVz, vv = vx * vx + vz * vz;
        if (vv > 0.5) {
          const tca = -(rx * vx + rz * vz) / vv;
          if (tca > 0 && tca < 1.3) {
            const cx = rx + vx * tca, cz = rz + vz * tca;
            if (cx * cx + cz * cz < (widSum + 0.5) * (widSum + 0.5) + (ds < lenSum ? 0 : 1)) vCap = Math.min(vCap, Math.max(0, c.u - 1.5 - 4 * (1.3 - tca)));
          }
        }
      }
      if (ds > lenSum + 1.2) {
        const cOff = c.d - line.off[c.i];
        if ((Math.abs(dd) < widSum + 0.6 || Math.abs(cOff - this.off) < widSum + 0.45) && ds < aheadDs) { aheadDs = ds; ahead = c; }
      } else {
        // alongside (or nearly): never steer into it
        const sep = widSum + 0.5;
        if (dd > 0) dMax = Math.min(dMax, c.d - sep); else dMin = Math.max(dMin, c.d + sep);
        if (ds > 0 && Math.abs(dd) < widSum + 0.2) squeezed = c;
        else if (ds > 0.3 && Math.abs(dd) < widSum + 1.4 && this.brakingAhead) vCap = Math.min(vCap, c.u - 0.8);
      }
    }
    if (ahead) {
      const c = ahead, closing = v.u - c.u, lenSum = (myL + c.len) / 2, widSum = (myW + c.wid) / 2;
      const gap = aheadDs - lenSum;
      if ((closing > 0.3 + 1.2 * (1 - this.skill) && gap / Math.max(0.5, closing) < 2.4 + 1.2 * this.skill) || gap < 6 + u * 0.35) {
        const ci = c.i, roomL = T.wl[ci] - (c.d + c.wid / 2), roomR = (c.d - c.wid / 2) + T.wr[ci];
        const need = myW + 0.7;
        let sd = this.passSide;
        if (!sd || (sd > 0 ? roomL : roomR) < need) sd = roomL >= roomR ? (roomL > need ? 1 : 0) : (roomR > need ? -1 : 0);
        this.passSide = sd;
        if (sd) target = c.d + sd * (widSum + 0.8);
        const latClear = Math.abs(c.d - q.d) > widSum + 0.2;
        const caut = ctrl.caution || 0;
        if (!latClear) vCap = Math.max(0, c.u + (gap - 3 - u * (0.22 + 0.15 * caut)) * 0.9);
      } else this.passSide = 0;
    } else this.passSide = 0;
    if (squeezed) vCap = Math.min(vCap, squeezed.u - 1.5);
    // desired lateral position (absolute), constrained by neighbours and the track edges
    const base = line.off[i];
    let dAbs = target != null ? target : base + Math.sin(this.t * 0.35 + this.phase) * 0.5 * (1 - this.skill);
    // race start: hold the grid lane for the first seconds (fight for places), then merge onto the line
    if (this.startD != null && ctrl.caution && target == null) { const sp = clamp(1 - (this.goT - 2.5) / 5, 0, 1); if (sp > 0) dAbs = lerp(dAbs, this.startD, sp); }
    const edge = myW / 2 + 0.3;
    if (dead) dAbs = q.d >= 0 ? T.wl[i] - edge - 0.4 : -(T.wr[i] - edge - 0.4);
    if (dMin > dMax) dAbs = (dMin + dMax) / 2; else dAbs = clamp(dAbs, dMin, dMax);
    if (dAbs > T.wl[i] - edge || dAbs < -(T.wr[i] - edge)) { if (dMin > -1e8 || dMax < 1e8) vCap = Math.min(vCap, Math.max(5, v.u - 3)); }
    const constrained = dMin > -1e8 || dMax < 1e8;
    const tgtOff = dAbs - base;
    const rate = (target != null || constrained ? 3.5 : 1.3) * dt;
    this.off += clamp(tgtOff - this.off, -rate, rate);
    // ---- steering: pure pursuit on (racing line + offset)
    const Ld = Math.min(45, Math.max(7, 4 + u * 0.32)), j = (i + Math.round(Ld / T.ds)) % N;
    let dj = line.off[j] + this.off;
    const inPitLane = q.pc === q.pc && q.d < -T.wr[i] - 0.5 && q.d > q.pc - q.phw - 0.5;
    if (inPitLane) { const pc = T.pitC[j]; dj = pc === pc ? Math.min(pc, -T.wr[j] - 0.5 - myW / 2 + (T.pitSep[j] ? 0 : 3)) : line.off[j]; this.off = dj - line.off[j]; }
    else if (Math.abs(this.off) > 0.05) { const m = myW / 2 + 0.25; dj = clamp(dj, Math.min(line.off[j], -(T.wr[j] - m)), Math.max(line.off[j], T.wl[j] - m)); }
    const tx = T.x[j] + T.nx[j] * dj - v.x, tz = T.z[j] + T.nz[j] * dj - v.z;
    const fx = Math.sin(v.h), fz = Math.cos(v.h), lx = Math.cos(v.h), lz = -Math.sin(v.h);
    const alpha = Math.atan2(tx * lx + tz * lz, tx * fx + tz * fz);
    const delta = Math.atan(2 * v.P.wb * Math.sin(alpha) / Ld);
    this.steerF += (clamp(delta / v.maxSteer(v.u, this.env), -1, 1) - this.steerF) * 0.5;
    inp.steer = this.steerF;
    // ---- speed
    let vt = this.prof[(i + Math.round(Math.max(3, u * 0.12) / T.ds)) % N] * kk * (1 - 0.01 * Math.min(4, Math.abs(this.off))) * (1 - 0.05 * (ctrl.caution || 0));
    // off the racing line the corners are tighter (or wider): limit speed by the offset path curvature
    if (Math.abs(this.off) > 0.4) {
      for (const m of [0, 12, 25, 40, 60, 85]) {
        // curvature of the racing line shifted sideways by this.off (the line is not parallel to the centreline,
        // so the centreline curvature over-states it where the line runs straight across a bend)
        const jj = (i + Math.round((m + 3) / T.ds)) % N, kc = line.k[jj];
        const kp = Math.abs(kc / Math.max(0.25, 1 - kc * this.off)), kl = Math.max(Math.abs(kc), 1e-4);
        if (kp > kl * 1.03 && kp > 1 / 900) {
          const vc = this.prof[jj] * kk * Math.sqrt(kl / kp);
          vt = Math.min(vt, Math.sqrt(vc * vc + 2 * 7.5 * m));
        }
      }
    }
    vt = Math.min(vt, vCap);
    if (dead) vt = Math.min(vt, Math.abs(q.d) > Math.min(T.wl[i], T.wr[i]) - 2.5 ? 0 : 9);
    if (inPitLane) vt = Math.min(vt, 21.5);
    const err = vt - v.u;
    inp.throttle = err > 0 ? Math.min(1, err * 0.8 + 0.3) : 0;
    inp.brake = err < 0 ? Math.min(1, -err * 0.5) : 0;
    if (this.goT < this.react) { inp.throttle = 0.3; inp.brake = 1; }
    else if (this.goT < this.react + 3 && v.u < 20) { inp.throttle = 1; inp.brake = 0; }
    // ---- stuck / wrong way detection (the session respawns the car)
    const fwd = fx * q.tx + fz * q.tz;
    if (v.u < 2.5 && this.goT > 4) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (fwd < -0.25 && this.goT > 2) this.wrongT += dt; else this.wrongT = 0;
    this.needReset = !dead && (this.stuckT > 3 || this.wrongT > 2);
    return inp;
  }
}
