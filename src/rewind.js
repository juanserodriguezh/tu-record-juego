// ============================================================================
//  REWIND (practice only): a ring of snapshots of the player's car, REWIND.hz per second for the last
//  REWIND.keep seconds. A snapshot copies every own field of the Vehicle except its fixed references
//  (spec, params, track), so position, speed, gearbox, tyres (wear, temperature) and damage come back
//  exactly as they were; main.js keeps the lap clock alongside (`x`). The slots and every object inside
//  them are reused in place, so recording makes no garbage.
// ============================================================================
// hz: snapshots per second; keep: seconds kept; step: seconds per press; hold: seconds the game holds still
const REWIND = { hz: 10, keep: 15, step: 5, hold: 1.2 };
const RW_SKIP = { spec: 1, P: 1, T: 1, dbg: 1, debug: 1 };

// deep copy of plain data (numbers, strings, arrays, typed arrays, plain objects) into `old` when it can be reused
function rwCopy(v, old) {
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) { if (old && old.constructor === v.constructor && old.length === v.length) { old.set(v); return old; } return v.slice(); }
  if (Array.isArray(v)) { const a = Array.isArray(old) ? old : []; a.length = v.length; for (let i = 0; i < v.length; i++) a[i] = rwCopy(v[i], a[i]); return a; }
  const o = old && typeof old === 'object' && !Array.isArray(old) && !ArrayBuffer.isView(old) ? old : {};
  for (const k in o) if (!(k in v)) delete o[k];
  for (const k in v) o[k] = rwCopy(v[k], o[k]);
  return o;
}

class Rewind {
  constructor() { this.n = REWIND.hz * REWIND.keep + 1; this.buf = new Array(this.n).fill(null); this.clear(); }
  clear() { this.head = 0; this.len = 0; this.acc = 0; }
  // every physics step; `extra` (plain data: the lap clock) is copied only when a snapshot is due
  tick(dt, V, extra) {
    if ((this.acc -= dt) > 1e-9) return false;
    this.acc += 1 / REWIND.hz;
    let sn = this.buf[this.head]; if (!sn) sn = this.buf[this.head] = { v: {}, x: {} };
    const v = sn.v;
    for (const k in v) if (!(k in V) || RW_SKIP[k]) delete v[k];
    for (const k in V) if (!RW_SKIP[k]) v[k] = rwCopy(V[k], v[k]);
    sn.x = rwCopy(typeof extra === 'function' ? extra() : extra, sn.x);
    this.head = (this.head + 1) % this.n; this.len = Math.min(this.n, this.len + 1);
    return true;
  }
  seconds() { return this.len > 1 ? (this.len - 1) / REWIND.hz : 0; }
  // the snapshot `sec` seconds back (or the oldest one); it becomes the newest, so the next press goes further back
  back(sec) {
    if (this.len < 2) return null;
    const k = Math.min(this.len - 1, Math.max(1, Math.round(sec * REWIND.hz)));
    this.len -= k; this.head = (this.head - k + this.n) % this.n;
    this.acc = 1 / REWIND.hz;
    const sn = this.buf[(this.head - 1 + this.n) % this.n];
    return { sn, sec: k / REWIND.hz };
  }
  // the car exactly as in the snapshot (its own objects are overwritten in place, never shared with the ring)
  restore(V, sn) {
    const v = sn.v;
    for (const k in V) if (!(k in v) && !RW_SKIP[k] && typeof V[k] !== 'function') delete V[k];
    for (const k in v) V[k] = rwCopy(v[k], V[k]);
  }
}
