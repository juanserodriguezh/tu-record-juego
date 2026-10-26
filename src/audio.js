// ============================================================================
//  AUDIO: engines synthesised from each engine's real firing pattern (one
//  720-degree combustion cycle turned into a periodic wave, so a cross-plane V8
//  burbles, a flat-plane V8 or V12 screams, an odd-fire V10 warbles), plus
//  induction, turbo / supercharger / hybrid whines, overrun pops, rev limiter,
//  gear cut, tyres, wind, kerbs, rain and the nearest rival. Web Audio, no samples.
// ============================================================================
const CROSSPLANE = new Set(['nascar', 'camaro_zl1', 'charger_srt', 'mustang_rtr', 'amg_gtr', 'ftype_svr', 'alfieri', 'vantage_gt3', 'hussarya', 'akula', 'c8_preliator', 'p72', 'bt62']);
const ODDFIRE_V10 = new Set(['r8', 'zerouno']);
function engineProfile(spec) {
  const sub = spec.sub || '', cyl = spec.cyl || 8, id = spec.id, body = spec.body;
  let layout;
  if (/W16/.test(sub)) layout = 'W16';
  else if (/W12/.test(sub)) layout = 'W12';
  else if (/V12/.test(sub) || cyl === 12) layout = 'V12';
  else if (/V10/.test(sub) || cyl === 10) layout = ODDFIRE_V10.has(id) ? 'V10o' : 'V10';
  else if (/V8/.test(sub) || cyl === 8) layout = /plano/i.test(sub) ? 'V8f' : CROSSPLANE.has(id) || body === 'muscle' || body === 'stock' ? 'V8c' : 'V8f';
  else if (/b[óo]xer/i.test(sub)) layout = 'F6';
  else if (/V6/.test(sub)) layout = 'V6';
  else if (cyl === 6) layout = 'I6';
  else if (/V4/.test(sub)) layout = 'V4';
  else if (cyl === 5) layout = 'I5';
  else layout = 'I4';
  const dm = sub.match(/(\d+[.,]\d+)\s*L/), disp = dm ? parseFloat(dm[1].replace(',', '.')) : cyl * 0.5;
  return {
    id, layout, cyl, disp,
    turbo: /turbo|EcoBoost|VR38/i.test(sub), sc: /sobrealimentado|compresor|Hellcat/i.test(sub), hybrid: /h[íi]brido|el[ée]ctric/i.test(sub),
    ev: !!spec.ev, race: !!spec.race || body === 'track', open: body === 'f1' || body === 'f1h' || body === 'fe' || body === 'indy' || body === 'lmp'
  };
}
// firing angles (deg over 720), bank of each event, pulse sharpness
function firingPattern(p) {
  const ev = (n, off) => Array.from({ length: n }, (_, k) => k * 720 / n + (off || 0));
  switch (p.layout) {
    case 'I4': return { a: ev(4), b: [0, 0, 0, 0] };
    case 'I5': return { a: ev(5), b: [0, 0, 0, 0, 0] };
    case 'I6': return { a: ev(6), b: [0, 0, 0, 0, 0, 0] };
    case 'V6': return { a: ev(6), b: [0, 1, 0, 1, 0, 1] };
    case 'F6': return { a: ev(6), b: [0, 1, 1, 0, 1, 0] };
    case 'V4': return { a: [0, 180, 270, 450], b: [0, 1, 0, 1] };
    case 'V8c': return { a: ev(8), b: [0, 1, 1, 0, 1, 0, 0, 1] };
    case 'V8f': return { a: ev(8), b: [0, 1, 0, 1, 0, 1, 0, 1] };
    case 'V10': return { a: ev(10), b: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1] };
    case 'V10o': return { a: [0, 54, 144, 198, 288, 342, 432, 486, 576, 630], b: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1] };
    case 'W12': case 'V12': return { a: ev(12), b: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1] };
    case 'W16': return { a: ev(16), b: Array.from({ length: 16 }, (_, k) => k % 2) };
  }
  return { a: ev(8), b: [0, 1, 0, 1, 0, 1, 0, 1] };
}
const WAVES = new Map();
// one 720-degree combustion cycle -> periodic wave. Real engines are never perfectly even: each cylinder
// fires a little stronger or weaker and a few degrees early or late, which is what puts the low
// "lumpy" orders into the sound. Two variants (different cylinder spreads) are layered per engine.
function engineWave(ctx, p, variant) {
  const key = p.id + '|' + (variant || 0); let w = WAVES.get(key); if (w) return w;
  const N = 2048, H = 400, x = new Float32Array(N), pat = firingPattern(p), n = pat.a.length, I = 720 / n;
  const sharp = p.open ? 0.8 : p.race ? 0.85 : (p.layout === 'W16' || p.layout === 'W12') ? 1.35 : p.turbo ? 1.2 : 1.0;
  const rise = 0.08 * I * sharp, decay = 0.34 * I * sharp, ring = 2.1 / I;
  let seed = 7 + (variant || 0) * 131; for (const ch of p.id) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed % 1000) / 1000; };
  const spreadA = p.race ? 0.16 : 0.24, spreadT = p.race ? 2.5 : 4.5;
  for (let k = 0; k < n; k++) {
    const amp = (pat.b[k] ? 0.84 : 1.0) * (1 - spreadA / 2 + spreadA * rnd()), bankShift = pat.b[k] ? 1.14 : 1.0;
    const at = pat.a[k] + (rnd() - 0.5) * spreadT, dec = decay * bankShift * (0.9 + 0.2 * rnd());
    for (let i = 0; i < N; i++) {
      let ph = i / N * 720 - at; if (ph < 0) ph += 720;
      if (ph > I * 2.6) continue;
      x[i] += amp * (1 - Math.exp(-ph / rise)) * Math.exp(-ph / dec) * (1 + 0.28 * Math.sin(ph * ring * Math.PI * 2));
    }
  }
  let mean = 0; for (let i = 0; i < N; i++) mean += x[i]; mean /= N;
  const re = new Float32Array(H), im = new Float32Array(H);
  for (let h = 1; h < H; h++) {
    let c = 0, s = 0; const wv = 2 * Math.PI * h / N;
    for (let i = 0; i < N; i++) { const v = x[i] - mean; c += v * Math.cos(wv * i); s += v * Math.sin(wv * i); }
    // roll the upper harmonics off steeply (exhaust pipes and silencers absorb them)
    const tilt = 1 / (1 + Math.pow(h / (n * (p.open ? 3.2 : 4.5)), 1.6));
    re[h] = c / N * tilt; im[h] = s / N * tilt;
  }
  w = ctx.createPeriodicWave(re, im); WAVES.set(key, w);
  return w;
}

// one engine voice (the player's car or the nearest rival)
class EngineVoice {
  constructor(ctx, out, noiseBuf) {
    this.ctx = ctx; this.p = null;
    const noise = (rate) => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.playbackRate.value = rate; n.start(); return n; };
    // two slightly different cycles, detuned against each other: never a perfectly static tone
    this.oA = ctx.createOscillator(); this.oB = ctx.createOscillator();
    const gA = ctx.createGain(), gB = ctx.createGain(); gA.gain.value = 0.62; gB.gain.value = 0.45;
    this.drive = ctx.createGain(); this.drive.gain.value = 1;
    this.oA.connect(gA); this.oB.connect(gB); gA.connect(this.drive); gB.connect(this.drive);
    // slow random pitch drift (a few cents), different for each layer
    for (const [o, r] of [[this.oA, 0.21], [this.oB, 0.29]]) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7;
      const dg = ctx.createGain(); dg.gain.value = 900; noise(r).connect(lp); lp.connect(dg); dg.connect(o.detune);
    }
    this.shaper = ctx.createWaveShaper(); const cv = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) { const t = i / 1024 - 1; cv[i] = Math.tanh(t * 1.35) / Math.tanh(1.35); } this.shaper.curve = cv; this.shaper.oversample = '2x';
    this.drive.connect(this.shaper);
    // combustion noise: band-passed noise whose amplitude follows the firing pulses (the "breath" of the exhaust)
    this.cBp = ctx.createBiquadFilter(); this.cBp.type = 'bandpass'; this.cBp.Q.value = 0.7; this.cBp.frequency.value = 900;
    this.cAm = ctx.createGain(); this.cAm.gain.value = 0;
    this.cG = ctx.createGain(); this.cG.gain.value = 0;
    const amIn = ctx.createGain(); amIn.gain.value = 0.9; this.oA.connect(amIn); amIn.connect(this.cAm.gain);
    noise(1).connect(this.cBp); this.cBp.connect(this.cAm); this.cAm.connect(this.cG);
    // tone shaping: exhaust body, mids, then a pipe resonance (short feedback delay) and the brightness lowpass
    this.body = ctx.createBiquadFilter(); this.body.type = 'peaking'; this.body.frequency.value = 120; this.body.Q.value = 0.8; this.body.gain.value = 5;
    this.mid = ctx.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 700; this.mid.Q.value = 0.7; this.mid.gain.value = 0;
    this.shaper.connect(this.body); this.cG.connect(this.body); this.body.connect(this.mid);
    this.dly = ctx.createDelay(0.05); this.dly.delayTime.value = 0.004;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.32; const fbLp = ctx.createBiquadFilter(); fbLp.type = 'lowpass'; fbLp.frequency.value = 2500;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.4;
    this.mid.connect(this.dly); this.dly.connect(fbLp); fbLp.connect(this.fb); this.fb.connect(this.dly); fbLp.connect(this.wet);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 2000; this.lp.Q.value = 0.5;
    this.lp2 = ctx.createBiquadFilter(); this.lp2.type = 'lowpass'; this.lp2.frequency.value = 9000; this.lp2.Q.value = 0.5;
    this.mid.connect(this.lp); this.wet.connect(this.lp); this.lp.connect(this.lp2);
    this.g = ctx.createGain(); this.g.gain.value = 0; this.lp2.connect(this.g);
    // induction roar: the same cycle, band-passed, rises with throttle
    this.iOsc = ctx.createOscillator();
    this.iBp = ctx.createBiquadFilter(); this.iBp.type = 'bandpass'; this.iBp.Q.value = 1.1; this.iBp.frequency.value = 500;
    this.iG = ctx.createGain(); this.iG.gain.value = 0;
    this.iOsc.connect(this.iBp); this.iBp.connect(this.iG); this.iG.connect(this.g);
    // slow random amplitude wobble
    const nlp = ctx.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = 18;
    this.rough = ctx.createGain(); this.rough.gain.value = 0.0;
    noise(0.37).connect(nlp); nlp.connect(this.rough); this.rough.connect(this.g.gain);
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (this.pan) { this.g.connect(this.pan); this.pan.connect(out); } else this.g.connect(out);
    this.oA.start(); this.oB.start(); this.iOsc.start();
    this.lim = 0;
  }
  setEngine(spec) {
    if (this.p && this.p.id === spec.id) return;
    this.p = engineProfile(spec);
    const p = this.p;
    this.oA.setPeriodicWave(engineWave(this.ctx, p, 0)); this.oB.setPeriodicWave(engineWave(this.ctx, p, 1)); this.iOsc.setPeriodicWave(engineWave(this.ctx, p, 0));
    this.oB.detune.value = 7;
    const big = clamp(p.disp / 6, 0.25, 1.4), hiRev = (spec.red || 7000) > 10500;
    this.body.frequency.value = clamp(160 - 55 * big, 70, 160) * (hiRev ? 1.6 : 1);
    this.body.gain.value = p.layout === 'V8c' ? 7 : hiRev ? 6.5 : 4.5;
    this.mid.frequency.value = hiRev ? 850 : p.layout === 'V12' || p.layout === 'V10' || p.layout === 'V10o' ? 1000 : p.layout === 'V8f' ? 900 : 650;
    this.mid.gain.value = hiRev ? 1.5 : p.race ? 2.5 : p.layout === 'V12' ? 2.5 : 1;
    // exhaust pipe resonance: longer pipes on big road engines, short and tuned on race cars
    this.dly.delayTime.value = p.open ? 0.0016 : p.race ? 0.0024 : 0.0032 + 0.0012 * big;
    this.fb.gain.value = p.open ? 0.22 : 0.32;
    this.maxBright = p.open ? 4300 : p.race ? 6500 : 6000;
    this.red = spec.red || 7000;
  }
  // rpm, load 0..1, level 0..1, inside: cockpit, dt, pitch: doppler factor
  set(t, rpm, load, level, inside, dt, pitch) {
    const p = this.p; if (!p) return;
    const f = Math.max(rpm, 500) / 120 * (pitch || 1);
    this.oA.frequency.setTargetAtTime(f, t, 0.015); this.oB.frequency.setTargetAtTime(f, t, 0.02); this.iOsc.frequency.setTargetAtTime(f, t, 0.015);
    const x = clamp(rpm / this.red, 0, 1.05), fire = f * (p.cyl || 8) / 2 * 2;
    // brightness follows load and revs, but stays under the pipe/silencer limit
    const bright = (p.open ? 1200 : p.race ? 1200 : 1000) + 2600 * load * x + fire * (p.open ? 0.9 : 1.2);
    const cap = inside && !p.open ? this.maxBright * 0.55 : inside && p.open ? this.maxBright * 0.8 : this.maxBright;
    this.lp.frequency.setTargetAtTime(Math.min(bright, cap), t, 0.04);
    this.drive.gain.setTargetAtTime(0.75 + 1.0 * load, t, 0.05);
    this.cBp.frequency.setTargetAtTime(clamp(fire * 2.2, 300, 3500), t, 0.05);
    this.cG.gain.setTargetAtTime((0.12 + 0.35 * load) * (p.turbo ? 0.7 : 1), t, 0.05);
    this.iBp.frequency.setTargetAtTime(280 + 700 * x, t, 0.05);
    this.iG.gain.setTargetAtTime(load * (inside ? 0.5 : 0.2) * x, t, 0.05);
    // rev limiter: fuel-cut stutter at the redline
    let lim = 1;
    if (rpm >= this.red * 0.992 && load > 0.5) { this.lim += dt * 19; lim = Math.sin(this.lim * Math.PI * 2) > 0 ? 1 : 0.3; }
    const lvl = level * lim * (0.5 + 0.5 * load) * (0.62 + 0.45 * x);
    this.g.gain.setTargetAtTime(lvl, t, 0.025);
    this.rough.gain.setTargetAtTime(lvl * (0.08 + 0.1 * (1 - x)), t, 0.1);
  }
  setPan(t, v) { if (this.pan) this.pan.pan.setTargetAtTime(clamp(v, -1, 1), t, 0.05); }
}

class CarAudio {
  constructor() { this.ctx = null; this.vol = 0.7; this.mix = { engine: 1, fx: 1 }; this.muted = false; this.enabled = false; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -10; this.comp.ratio.value = 4; this.comp.attack.value = 0.005; this.comp.release.value = 0.15;
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(this.comp); this.comp.connect(ctx.destination);
    // buses: engine (player + rival) and effects
    this.eng = ctx.createGain(); this.fx = ctx.createGain();
    // cabin tone: from inside a closed car the lows swell and the highs are damped
    this.inLow = ctx.createBiquadFilter(); this.inLow.type = 'lowshelf'; this.inLow.frequency.value = 180; this.inLow.gain.value = 0;
    this.inHigh = ctx.createBiquadFilter(); this.inHigh.type = 'highshelf'; this.inHigh.frequency.value = 2800; this.inHigh.gain.value = 0;
    this.eng.connect(this.inLow); this.inLow.connect(this.inHigh); this.inHigh.connect(this.master); this.fx.connect(this.master);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.me = new EngineVoice(ctx, this.eng, buf);
    this.rivals = [new EngineVoice(ctx, this.eng, buf), new EngineVoice(ctx, this.eng, buf)];
    const noise = (type, f, q, dest) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0; src.connect(flt); flt.connect(g); g.connect(dest || this.fx); src.start();
      return { g, flt, src };
    };
    this.tyre = noise('bandpass', 950, 7);
    this.tyre2 = noise('bandpass', 1900, 9);
    this.road = noise('lowpass', 220, 0.8);
    this.wind = noise('bandpass', 500, 0.5);
    this.rumble = noise('lowpass', 140, 1.2);
    this.rain = noise('highpass', 2500, 0.5);
    this.scr = noise('bandpass', 2400, 1.6); this.scrLo = noise('lowpass', 520, 1.1);
    this.turbo = noise('bandpass', 3000, 12, this.eng);
    this.bov = noise('highpass', 1600, 0.7, this.eng);
    const tone = (type, dest) => { const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(dest || this.eng); o.start(); return { o, g }; };
    this.whistle = tone('sine');
    this.scWhine = tone('triangle');
    this.eWhine = tone('sine');
    this.gearWhine = tone('sine');
    // kerb rumble: tyre-roar noise chopped at the ridge rate ("brrrr"), a low thump at the same rate and a rattle
    this.kOsc = ctx.createOscillator(); this.kOsc.type = 'square'; this.kOsc.frequency.value = 40;
    const kn = ctx.createBufferSource(); kn.buffer = buf; kn.loop = true; kn.start();
    const kbp = ctx.createBiquadFilter(); kbp.type = 'bandpass'; kbp.frequency.value = 220; kbp.Q.value = 0.9;
    this.kAm = ctx.createGain(); this.kAm.gain.value = 0.5; const kDepth = ctx.createGain(); kDepth.gain.value = 0.5;
    this.kOsc.connect(kDepth); kDepth.connect(this.kAm.gain); kn.connect(kbp); kbp.connect(this.kAm);
    const kf = ctx.createBiquadFilter(); kf.type = 'lowpass'; kf.frequency.value = 180; kf.Q.value = 1.2;
    const kThump = ctx.createGain(); kThump.gain.value = 0.9; this.kOsc.connect(kf); kf.connect(kThump);
    const krat = ctx.createBiquadFilter(); krat.type = 'bandpass'; krat.frequency.value = 1400; krat.Q.value = 1.5; const kRat = ctx.createGain(); kRat.gain.value = 0.25;
    this.kAm.connect(krat); krat.connect(kRat);
    this.kG = ctx.createGain(); this.kG.gain.value = 0; this.kAm.connect(this.kG); kThump.connect(this.kG); kRat.connect(this.kG); this.kG.connect(this.fx); this.kOsc.start();
    this.kPrev = 0;
    // overrun pop: a short band-passed crack
    const pl = Math.floor(ctx.sampleRate * 0.09), pb = ctx.createBuffer(1, pl, ctx.sampleRate), pd = pb.getChannelData(0);
    for (let i = 0; i < pl; i++) { const e = Math.exp(-i / (ctx.sampleRate * 0.012)); pd[i] = (Math.random() * 2 - 1) * e * (i < 30 ? i / 30 : 1); }
    this.popBuf = pb; this.popBp = ctx.createBiquadFilter(); this.popBp.type = 'bandpass'; this.popBp.frequency.value = 700; this.popBp.Q.value = 0.9; this.popBp.connect(this.eng);
    this.st = { spool: 0, prevThr: 0, popT: 0, popRate: 0, bovT: 0, lastT: 0 };
    this.applyVolume();
    this.enabled = true;
  }
  setVolume(v) { this.vol = v; this.applyVolume(); }
  setMix(engine, fx) { this.mix.engine = engine; this.mix.fx = fx; this.applyVolume(); }
  setMuted(m) { this.muted = !!m; this.applyVolume(); }
  applyVolume() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.eng.gain.setTargetAtTime(this.mix.engine, t, 0.05); this.fx.gain.setTargetAtTime(this.mix.fx, t, 0.05);
  }
  mute() { if (this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); }
  pop(level) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.popBuf; s.playbackRate.value = 0.7 + Math.random() * 0.8;
    const g = ctx.createGain(); g.gain.value = level * (0.5 + Math.random() * 0.8); s.connect(g); g.connect(this.popBp); s.start();
  }
  // sausage kerb hit: a heavy low thunk + a scrape
  thunk(level) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g); g.connect(this.fx); o.start(t); o.stop(t + 0.35);
    const s = ctx.createBufferSource(); s.buffer = this.popBuf; s.playbackRate.value = 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
    const g2 = ctx.createGain(); g2.gain.value = level * 1.4; s.connect(lp); lp.connect(g2); g2.connect(this.fx); s.start(t);
  }
  // crash: a dull thud, a burst of crunch and a metallic ring; level 0..1
  crash(level, inside) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, lv = clamp(level, 0.05, 1) * (inside ? 0.8 : 1);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70 + 30 * (1 - lv), t); o.frequency.exponentialRampToValueAtTime(28, t + 0.28);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * lv, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(this.fx); o.start(t); o.stop(t + 0.45);
    for (const [rate, f, q, len, gain] of [[0.55, 900, 0.7, 0.35, 1.5], [1.1, 3200, 2.2, 0.22, 0.7]]) {
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = rate; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(gain * lv * 0.7, t + 0.004); gg.gain.exponentialRampToValueAtTime(0.001, t + len * (0.5 + lv));
      s.connect(bp); bp.connect(gg); gg.connect(this.fx); s.start(t, Math.random()); s.stop(t + len * 1.6 + 0.1);
    }
    if (lv > 0.3) { // metal ring-out
      const r = ctx.createOscillator(); r.type = 'square'; r.frequency.value = 380 + Math.random() * 300;
      const rg = ctx.createGain(); rg.gain.setValueAtTime(0.0001, t); rg.gain.exponentialRampToValueAtTime(0.05 * lv, t + 0.01); rg.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
      const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 900; rf.Q.value = 6; r.connect(rf); rf.connect(rg); rg.connect(this.fx); r.start(t); r.stop(t + 0.55);
    }
  }
  // opt: { view: 'in' | 'out', open, rival: { veh, dist, pan, closing } | null }
  update(veh, throttle, running, rain, opt) {
    if (!this.enabled || !this.ctx) return;
    opt = opt || {};
    const ctx = this.ctx, t = ctx.currentTime, P = veh.P, S = this.st;
    const dt = clamp(S.lastT ? t - S.lastT : 0.016, 0.001, 0.1); S.lastT = t;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol * 0.8, t, 0.08);
    const inside = opt.view === 'in';
    this.me.setEngine(veh.spec);
    const p = this.me.p, closedIn = inside && !p.open;
    this.inLow.gain.setTargetAtTime(closedIn ? 5 : 0, t, 0.2); this.inHigh.gain.setTargetAtTime(closedIn ? -7 : 0, t, 0.2);
    const rpm = Math.max(veh.rpm, P.red * 0.1), x = clamp(rpm / P.red, 0, 1.05);
    const cut = veh.shiftTimer > 0;
    const load = cut ? 0.08 : running ? throttle : 0.15;
    this.me.set(t, rpm, load, p.ev ? 0.0001 : running ? 0.62 : 0.3, inside, dt);
    // turbo: spool follows boost demand; whistle + blow-off when lifting on boost
    if (p.turbo) {
      S.spool += ((load > 0.3 ? load * clamp((x - 0.25) / 0.5, 0, 1) : 0) - S.spool) * clamp(dt * (load > S.spool ? 2.2 : 5), 0, 1);
      this.whistle.o.frequency.setTargetAtTime(1800 + 5200 * S.spool, t, 0.05);
      this.whistle.g.gain.setTargetAtTime(0.018 * S.spool * (inside ? 1.3 : 0.8), t, 0.05);
      this.turbo.flt.frequency.setTargetAtTime(2200 + 4000 * S.spool, t, 0.05);
      this.turbo.g.gain.setTargetAtTime(0.05 * S.spool, t, 0.05);
      if (S.prevThr > 0.6 && throttle < 0.2 && S.spool > 0.35 && !p.open) S.bovT = 0.45 * S.spool;
    } else this.whistle.g.gain.setTargetAtTime(0, t, 0.05);
    if (S.bovT > 0) { S.bovT -= dt; this.bov.g.gain.setTargetAtTime(Math.max(0, S.bovT) * 0.35, t, 0.02); } else this.bov.g.gain.setTargetAtTime(0, t, 0.05);
    // supercharger whine
    this.scWhine.o.frequency.setTargetAtTime(p.ev ? 260 + Math.abs(veh.u) * 76 : rpm * 0.36, t, 0.02);
    this.scWhine.g.gain.setTargetAtTime(p.sc ? 0.012 * (0.3 + load) * x : p.ev ? 0.022 * clamp(Math.abs(veh.u) / 10, 0, 1) * (0.35 + load) * (running ? 1 : 0) : 0, t, 0.05);
    // hybrid / electric drive whine, straight-cut gearbox whine on race cars
    const v = Math.abs(veh.u);
    // electric single-seater: the motor + gear whine IS the engine sound (rises with road speed, swells on power)
    this.eWhine.o.frequency.setTargetAtTime(p.ev ? 130 + v * 38 : 90 + v * 55, t, 0.05);
    this.eWhine.g.gain.setTargetAtTime(p.ev ? (running ? 0.05 * (0.25 + 0.75 * clamp(v / 15, 0, 1)) * (0.45 + 0.8 * load) : 0) : p.hybrid ? 0.006 * clamp(v / 20, 0, 1) * (0.4 + load) : 0, t, 0.05);
    this.gearWhine.o.frequency.setTargetAtTime(40 + rpm * 0.19, t, 0.03);
    this.gearWhine.g.gain.setTargetAtTime(p.race && !cut ? 0.005 * x * (inside ? 1.6 : 0.6) : 0, t, 0.05);
    // overrun pops on lift at high revs (sporty engines), and a crack on each upshift
    if (running && !p.ev && S.prevThr > 0.55 && throttle < 0.15 && x > 0.55) S.popRate = p.race || p.layout !== 'I6' ? 1 : 0.5;
    if (cut && !S.wasCut && !p.ev && (p.race || p.turbo || p.layout.startsWith('V')) && x > 0.6) this.pop(0.28);
    S.wasCut = cut;
    if (S.popRate > 0 && throttle < 0.2) {
      S.popT -= dt; S.popRate -= dt * 0.9;
      if (S.popT <= 0) { this.pop(0.2 * S.popRate * (inside ? 0.7 : 1)); S.popT = 0.04 + Math.random() * 0.16; }
    } else S.popRate = 0;
    S.prevThr = throttle;
    // nearest rival: its own engine, distance attenuation, doppler and pan
    const RS = opt.rivals || [];
    for (let k = 0; k < this.rivals.length; k++) {
      const R = RS[k], vo = this.rivals[k];
      if (R && R.veh && R.dist < 140) {
        vo.setEngine(R.veh.spec);
        const c = 343, pitch = clamp(c / (c - clamp(R.closing || 0, -60, 60)), 0.8, 1.25);
        const lv = 0.5 * Math.pow(10 / (10 + R.dist), 1.35) * (closedIn ? 0.55 : 1) * (k ? 0.8 : 1) * (R.veh.spec.ev ? 0.12 : 1);
        vo.set(t, Math.max(R.veh.rpm, 900), R.throttle != null ? R.throttle : 0.7, lv, false, dt, pitch);
        vo.setPan(t, R.pan || 0);
      } else if (vo.p) vo.g.gain.setTargetAtTime(0, t, 0.1);
    }
    // tyres: squeal with slip (two resonances), rolling roar with speed
    const slip = Math.max(0, Math.max(veh.slipF, veh.slipR) - 1.05) + (veh.spin ? 0.6 : 0);
    const onTarmac = veh.surfF === 'asphalt' || veh.surfF === 'kerb' || veh.surfF === 'tarmac';
    const sq = onTarmac && v > 4 && !rain ? clamp(slip * 0.35, 0, 0.3) : 0;
    this.tyre.g.gain.setTargetAtTime(sq, t, 0.05); this.tyre2.g.gain.setTargetAtTime(sq * 0.45, t, 0.05);
    this.tyre.flt.frequency.setTargetAtTime(700 + v * 6 + slip * 150, t, 0.1); this.tyre2.flt.frequency.setTargetAtTime(1500 + v * 9, t, 0.1);
    this.road.g.gain.setTargetAtTime(clamp(v / 90, 0, 0.14) * (closedIn ? 1.4 : 0.8), t, 0.1);
    this.wind.g.gain.setTargetAtTime(clamp(v * v / 9000, 0, 0.28) * (closedIn ? 0.55 : p.open ? 1.3 : 1), t, 0.1);
    this.wind.flt.frequency.setTargetAtTime(300 + v * 8, t, 0.1);
    const bumpy = (veh.surfF === 'grass' || veh.surfF === 'gravel') ? 0.25 : 0;
    const kerb = veh.kerbA != null ? veh.kerbA : Math.min(1, (veh.kerbN || 0) / 2.5) * Math.min(1, v / 14);
    this.kOsc.frequency.setTargetAtTime(clamp(v / 0.45, 14, 170), t, 0.02);
    this.kG.gain.setTargetAtTime(v > 3 ? kerb * (closedIn ? 0.75 : 0.6) : 0, t, 0.015);
    if (kerb > 0.2 && this.kPrev <= 0.2) this.pop(0.35); // first hit
    const sh = veh.sausHit || 0; if (this.sausPrev != null && sh !== this.sausPrev && v > 3) this.thunk(closedIn ? 0.9 : 0.7); this.sausPrev = sh;
    this.kPrev = kerb;
    this.rumble.g.gain.setTargetAtTime(v > 3 ? bumpy : 0, t, 0.03);
    this.rain.g.gain.setTargetAtTime((+rain || 0) * (closedIn ? 0.1 : 0.068) + (veh.wxNow > 0.15 ? Math.min(1, v / 60) * Math.min(1, veh.wxNow) * (closedIn ? 0.035 : 0.05) : 0), t, 0.3);
    { // metal on tarmac / wall: scraping along a barrier, dragging a missing wheel or a broken floor
      const D = veh.dmg, on = D && DMG.scale > 0;
      const sc = on && veh.scrapeT > 0 ? clamp((veh.scrapeAt ? veh.scrapeAt[2] : v) / 35, 0.12, 1) : 0;
      const dr = on && v > 4 && (D.lost[0] + D.lost[1] + D.lost[2] + D.lost[3] > 0 || D.floor > 0.65 || D.fw >= 0.95 && p.open) ? clamp(v / 45, 0, 1) * 0.55 : 0;
      const lv = Math.max(sc, dr);
      this.scr.g.gain.setTargetAtTime(lv * 0.2 * (closedIn ? 1.25 : 1), t, 0.03); this.scr.flt.frequency.setTargetAtTime(1500 + 1900 * lv + Math.random() * 500, t, 0.03);
      this.scrLo.g.gain.setTargetAtTime(lv * 0.26, t, 0.03);
    }
  }
}

// ---------------------------------------------------------------------------
//  Damage visuals: dents (vertex displacement), parts that break off, flying debris, sparks and smoke,
//  deformable armco rails and tyre walls with loose tyres. Reads what the physics reports:
//  V.dmg.hits / V.dmg.ev (per car) and T.barEv / T.barVer (barriers).
// ---------------------------------------------------------------------------
const dfxHash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _d3 = new THREE.Vector3(), _dq = new THREE.Quaternion(), _dq2 = new THREE.Quaternion();
const _dX = new THREE.Vector3(1, 0, 0), _dUp = new THREE.Vector3(0, 1, 0);

// ---- point sprites (sparks: additive, smoke: normal blending) ----
class DfxParticles {
  constructor(parent, n, additive) {
    this.n = n; this.k = 0; this.any = false;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.siz = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n).fill(0); this.age = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n); this.drag = new Float32Array(n);
    this.grav = new Float32Array(n); this.gy = new Float32Array(n).fill(-1e9); this.rgb = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sa = new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pa); g.setAttribute('aColor', this.ca); g.setAttribute('aSize', this.sa);
    this.uScale = { value: 800 };
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale }, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC; void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(' + (additive ? '1.5' : '2.0') + ', aSize * uScale / max(0.2, -mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; float a = smoothstep(1.0, ' + (additive ? '0.2' : '0.0') + ', r); gl_FragColor = vec4(vC.rgb, vC.a * a); }'
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 7 : 6;
    parent.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav, gy) {
    const k = this.k; this.k = (k + 1) % this.n; const o = k * 3;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; this.vel[o] = vx; this.vel[o + 1] = vy; this.vel[o + 2] = vz;
    this.life[k] = life; this.age[k] = 0; this.s0[k] = s0; this.s1[k] = s1; this.a0[k] = a; this.drag[k] = drag; this.grav[k] = grav; this.gy[k] = gy == null ? -1e9 : gy;
    this.rgb[o] = r; this.rgb[o + 1] = g; this.rgb[o + 2] = b; this.any = true;
  }
  update(dt) {
    if (!this.any) return;
    let alive = 0;
    for (let k = 0; k < this.n; k++) {
      const o = k * 3;
      if (this.age[k] >= this.life[k]) { this.siz[k] = 0; this.col[k * 4 + 3] = 0; continue; }
      alive++;
      this.age[k] += dt; const t = Math.min(1, this.age[k] / this.life[k]);
      const dr = Math.exp(-this.drag[k] * dt);
      this.vel[o] *= dr; this.vel[o + 2] *= dr; this.vel[o + 1] = this.vel[o + 1] * dr - this.grav[k] * dt;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.pos[o + 1] < this.gy[k]) { this.pos[o + 1] = this.gy[k]; this.vel[o + 1] *= -0.35; this.vel[o] *= 0.7; this.vel[o + 2] *= 0.7; }
      this.siz[k] = this.s0[k] + (this.s1[k] - this.s0[k]) * t;
      const c = k * 4; this.col[c] = this.rgb[o]; this.col[c + 1] = this.rgb[o + 1]; this.col[c + 2] = this.rgb[o + 2]; this.col[c + 3] = this.a0[k] * (1 - t) * (1 - t);
    }
    this.pa.needsUpdate = this.ca.needsUpdate = this.sa.needsUpdate = true;
    if (!alive) this.any = false;
  }
}

// ---- debris: panels, wheels and tyres that tumble, bounce and come to rest ----
class DfxDebris {
  constructor(scene, heightAt) { this.scene = scene; this.hy = heightAt; this.list = []; this.max = 100; }
  add(mesh, o) {
    const d = Object.assign({ mesh, vel: new THREE.Vector3(), w: new THREE.Vector3(), r: 0.15, hw: 0.15, kind: 'chunk', own: false, age: 0, rest: false, spin: 0, e: 0.3 }, o);
    this.scene.add(mesh); this.list.push(d);
    const cap = { tyre: 34, chunk: 60, wheel: 10 }[d.cat || d.kind] || 40;
    let n = 0; for (const x of this.list) if ((x.cat || x.kind) === (d.cat || d.kind)) n++;
    if (n > cap) { for (let i = 0; i < this.list.length; i++) if ((this.list[i].cat || this.list[i].kind) === (d.cat || d.kind)) { this.remove(i); break; } }
    while (this.list.length > this.max) this.remove(0);
    return d;
  }
  remove(i) { const d = this.list[i]; this.scene.remove(d.mesh); if (d.own) d.mesh.geometry.dispose(); this.list.splice(i, 1); }
  clear() { while (this.list.length) this.remove(this.list.length - 1); }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i], m = d.mesh; d.age += dt;
      if (d.age > 45) { m.scale.multiplyScalar(Math.max(0.01, 1 - dt * 2)); if (m.scale.x < 0.05) { this.remove(i); continue; } }
      if (d.rest) continue;
      const p = m.position, v = d.vel, gy = this.hy(p.x, p.z);
      v.y -= 9.81 * dt;
      p.addScaledVector(v, dt);
      let contact = false;
      if (d.kind === 'chunk') {
        if (p.y - d.r < gy) { p.y = gy + d.r; if (v.y < 0) { v.y = -v.y * d.e; if (Math.abs(v.y) < 1.1) v.y = 0; } contact = true; }
        const fr = Math.exp(-(contact ? 4.5 : 0.05) * dt); v.x *= fr; v.z *= fr; d.w.multiplyScalar(Math.exp(-(contact ? 3.5 : 0.1) * dt));
        _dq.setFromAxisAngle(_d1.copy(d.w).normalize(), d.w.length() * dt); m.quaternion.premultiply(_dq);
        if (contact && v.lengthSq() < 0.04 && d.w.lengthSq() < 0.2) d.rest = true;
      } else { // wheel / tyre: rolls on its tread while it has speed, then falls over flat
        _d2.set(1, 0, 0).applyQuaternion(m.quaternion); const flat = Math.abs(_d2.y);
        const cr = d.r * Math.sqrt(Math.max(0, 1 - flat * flat)) + d.hw * flat;
        if (p.y - cr < gy) { p.y = gy + cr; if (v.y < 0) { v.y = -v.y * 0.42; if (Math.abs(v.y) < 1.4) v.y = 0; } contact = true; }
        const sp = Math.hypot(v.x, v.z);
        if (contact) {
          const fr = Math.exp(-(sp > 2.5 ? 0.35 : 3.2) * dt); v.x *= fr; v.z *= fr;
          if (sp > 2.5) { // roll: axle perpendicular to the travel direction
            _d3.set(-v.z / sp, 0, v.x / sp); d.spin += sp / d.r * dt;
            _dq.setFromUnitVectors(_dX, _d3); _dq2.setFromAxisAngle(_dX, d.spin); m.quaternion.slerp(_dq.multiply(_dq2), Math.min(1, dt * 10));
          } else { // tip over
            _dq.setFromUnitVectors(_dX, _dUp); m.quaternion.slerp(_dq, Math.min(1, dt * 3.5));
            if (flat > 0.985 && sp < 0.15) d.rest = true;
          }
        } else {
          _dq.setFromAxisAngle(_d1.copy(d.w).normalize(), d.w.length() * dt); m.quaternion.premultiply(_dq);
        }
      }
    }
  }
}

const DFX = {
  ready: false, sc: null, sparks: null, smoke: null, debris: null, world: null, T: null, bar: null, shake: 0, lastHit: 0,
  init(scene, heightAt) {
    this.sc = scene; this.sparks = new DfxParticles(scene, 420, true); this.smoke = new DfxParticles(scene, 260, false);
    this.debris = new DfxDebris(scene, heightAt); this.ready = true;
    this.tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.31, 14).rotateZ(Math.PI / 2);
    this.tyreMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1d });
    this.plateGeo = new THREE.BoxGeometry(0.9, 0.3, 0.02);
    this.plateMat = new THREE.MeshStandardMaterial({ color: 0xb9bec3, metalness: 0.7, roughness: 0.4 });
  },
  attachWorld(world, T) {
    this.world = world; this.T = T;
    if (this.bar) this.bar = null;
    if (T && T.btL) this.bar = new DfxBarriers(world, T, this);
    this.debris && this.debris.clear();
  },
  clear() { if (!this.ready) return; this.debris.clear(); this.sparks.any = this.smoke.any = true; for (const p of [this.sparks, this.smoke]) p.life.fill(0); },
  frame(dt, camera, renderer) {
    if (!this.ready) return;
    const sz = renderer.getDrawingBufferSize(_dsz), sc = sz.y / (2 * Math.tan(camera.fov * Math.PI / 360));
    this.sparks.uScale.value = sc; this.smoke.uScale.value = sc;
    if (this.bar) this.bar.update(dt);
    this.sparks.update(dt); this.smoke.update(dt); this.debris.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
  },
  // sparks from a point with a base direction
  spark(x, y, z, vx, vz, n, power, gy) {
    const S = this.sparks;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, sp = (0.3 + Math.random()) * power, up = 1 + Math.random() * 3.5 * power / 8;
      S.emit(x, y, z, vx * 0.35 + Math.cos(a) * sp * 0.5, up, vz * 0.35 + Math.sin(a) * sp * 0.5, 0.25 + Math.random() * 0.5, 0.05 + Math.random() * 0.04, 0.012, 1, 0.65 + Math.random() * 0.25, 0.25, 1, 0.8, 9.8, gy);
    }
  },
  puff(x, y, z, vx, vy, vz, size, r, g, b, a, life) {
    this.smoke.emit(x, y, z, vx + (Math.random() - 0.5) * 0.6, vy, vz + (Math.random() - 0.5) * 0.6, life, size * 0.5, size * 2.2, r, g, b, a, 0.7, -0.35);
  }
};
const _dsz = new THREE.Vector2();

// ---------------------------------------------------------------------------
//  Per-car visuals
// ---------------------------------------------------------------------------
function dvSetup(model) {
  model.open = ['f1', 'f1h', 'indy', 'lmp', 'fe'].includes(model.spec.body) || model.spec.model === 'formulae';
  const dv = model.dv = { lostDone: [0, 0, 0, 0], meshes: [], det: { fw: [], rw: [], chunk: [] }, R: 0.34, sagY: 0, pitch: 0, roll: 0, wheelsOff: [0, 0, 0, 0], flat: [0, 0, 0, 0], emitT: 0, seed: Math.random() * 1000, dentN: 0, wpos: [], wfx: [] };
  const skip = new Set([...(model.helmetParts || []), ...(model.hideInCockpit || [])]);
  for (const m of model.body.children) {
    if (!m.isMesh || skip.has(m) || !m.geometry.attributes.position || m.geometry.attributes.position.count % 3) continue;
    if (!m.geometry.attributes.color) continue;
    m.geometry = m.geometry.clone();
    const g = m.geometry, n = g.attributes.position.count;
    dv.meshes.push({ m, g, pos: g.attributes.position.array, nor: g.attributes.normal.array, col: g.attributes.color.array, o: Float32Array.from(g.attributes.position.array), on: Float32Array.from(g.attributes.normal.array), oc: Float32Array.from(g.attributes.color.array), gone: new Uint8Array(n / 3), n });
  }
  const w0 = model.wheels[0];
  if (w0) { w0.geometry.computeBoundingBox(); dv.R = w0.geometry.boundingBox.max.y; dv.hw = (w0.geometry.boundingBox.max.x - w0.geometry.boundingBox.min.x) / 2; }
  dv.wbase = model.wheels.map(w => w.position.y);
  dv.fronts = model.wheels.map(w => !!(w.parent && w.parent !== model.root));
  dv.camSign = [1, -1, 1, -1];
  return dv;
}
// paint rubbed off along a side: darker streaks on the panel that touches the wall
function dvScuff(dv, sign, a, H, W) {
  for (const M of dv.meshes) {
    const p = M.pos, c = M.col, oc = M.oc;
    for (let v = 0; v < M.n; v++) {
      const i = v * 3, x = p[i] * sign; if (x < W * 0.28) continue;
      const y = p[i + 1]; if (y < H * 0.1 || y > H * 0.72) continue;
      if (Math.abs(p[i + 2] - a) > 1.7 || M.gone[Math.floor(v / 3)]) continue;
      const f = 0.9 + 0.08 * dfxHash(v * 0.913 + dv.seed), mn = 0.35;
      for (let k = 0; k < 3; k++) c[i + k] = Math.max(oc[i + k] * mn, c[i + k] * f);
    }
    M.g.attributes.color.needsUpdate = true;
  }
}
function dvFlatNormals(M, tris) {
  const p = M.pos, nr = M.nor;
  for (const t of tris) {
    const o = t * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2], vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) { nr[o + k * 3] = nx; nr[o + k * 3 + 1] = ny; nr[o + k * 3 + 2] = nz; }
  }
  M.g.attributes.normal.needsUpdate = true;
}
// push the surface near P (body frame) along dir: a rounded crush with a ragged edge, darkened paint
function dvDent(dv, P, dir, depth, rad) {
  const r2 = rad * rad;
  for (const M of dv.meshes) {
    const p = M.pos, c = M.col, o = M.o, touched = new Set();
    for (let v = 0; v < M.n; v++) {
      const i = v * 3, dx = p[i] - P.x, dy = p[i + 1] - P.y, dz = p[i + 2] - P.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;
      const t = Math.floor(v / 3); if (M.gone[t]) continue;
      let w = 1 - d2 / r2; w *= w;
      const hz = dfxHash(v * 0.731 + dv.seed), k = depth * w * (0.55 + 0.45 * hz);
      p[i] += dir.x * k + (dfxHash(v * 1.7 + dv.seed) - 0.5) * 0.3 * k;
      p[i + 1] += dir.y * k + (dfxHash(v * 2.3 + dv.seed) - 0.5) * 0.3 * k;
      p[i + 2] += dir.z * k + (dfxHash(v * 3.1 + dv.seed) - 0.5) * 0.3 * k;
      const ex = p[i] - o[i], ey = p[i + 1] - o[i + 1], ez = p[i + 2] - o[i + 2], el = Math.hypot(ex, ey, ez);
      if (el > 0.6) { const s = 0.6 / el; p[i] = o[i] + ex * s; p[i + 1] = o[i + 1] + ey * s; p[i + 2] = o[i + 2] + ez * s; }
      const dk = 1 - 0.3 * w * (0.5 + 0.5 * hz); c[i] *= dk; c[i + 1] *= dk * 0.97; c[i + 2] *= dk * 0.95;
      touched.add(t);
    }
    if (touched.size) { dvFlatNormals(M, touched); M.g.attributes.position.needsUpdate = true; M.g.attributes.color.needsUpdate = true; }
  }
}
// triangles of the body that satisfy pred(cx, cy, cz) -> [{M, t}]
function dvCollect(dv, pred) {
  const out = [];
  for (const M of dv.meshes) {
    const p = M.pos;
    for (let t = 0; t < M.n / 3; t++) {
      if (M.gone[t]) continue;
      const o = t * 9, cx = (p[o] + p[o + 3] + p[o + 6]) / 3, cy = (p[o + 1] + p[o + 4] + p[o + 7]) / 3, cz = (p[o + 2] + p[o + 5] + p[o + 8]) / 3;
      if (pred(cx, cy, cz)) out.push({ M, t, cx, cy, cz });
    }
  }
  return out;
}
// remove the triangles from the body and turn them into a flying piece
function dvDetach(model, dv, tris, kind, V, vel, spinPower) {
  if (!tris.length) return;
  const byM = new Map();
  for (const it of tris) { if (!byM.has(it.M)) byM.set(it.M, []); byM.get(it.M).push(it); }
  let cx = 0, cy = 0, cz = 0;
  for (const it of tris) { cx += it.cx; cy += it.cy; cz += it.cz; }
  cx /= tris.length; cy /= tris.length; cz /= tris.length;
  model.root.updateMatrixWorld(true);
  for (const [M, list] of byM) {
    const n = list.length, P = new Float32Array(n * 9), N = new Float32Array(n * 9), C = new Float32Array(n * 9);
    let k = 0;
    for (const it of list) {
      const o = it.t * 9;
      for (let j = 0; j < 9; j += 3) { P[k + j] = M.pos[o + j] - cx; P[k + j + 1] = M.pos[o + j + 1] - cy; P[k + j + 2] = M.pos[o + j + 2] - cz; }
      N.set(M.nor.subarray(o, o + 9), k); C.set(M.col.subarray(o, o + 9), k); k += 9;
      M.pos.fill(0, o, o + 9); M.gone[it.t] = 1; dv.det[kind].push({ M, t: it.t });
    }
    M.g.attributes.position.needsUpdate = true;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, M.m.material); mesh.castShadow = true;
    _d1.set(cx, cy, cz); model.body.localToWorld(_d1); mesh.position.copy(_d1);
    mesh.quaternion.copy(model.root.quaternion);
    const d = DFX.debris.add(mesh, { own: true, r: Math.max(0.08, Math.min(0.35, g.boundingSphere.radius * 0.5)), kind: 'chunk', e: 0.28 });
    d.vel.copy(vel).add(_d2.set((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3));
    d.w.set((Math.random() - 0.5) * spinPower, (Math.random() - 0.5) * spinPower, (Math.random() - 0.5) * spinPower);
  }
}
function dvVel(V, out) { // world velocity of the car
  const fx = Math.sin(V.h), fz = Math.cos(V.h), lx = Math.cos(V.h), lz = -Math.sin(V.h);
  return out.set(V.u * fx + V.v * lx, 0, V.u * fz + V.v * lz);
}
// body frame (a forward, b left) -> world, at a given body height
function dvWorld(model, a, b, y, out) { return model.body.localToWorld(out.set(b, y, a)); }

function dvRegion(model, kind) {
  const L = model.L, H = model.H, open = !!model.open;
  if (kind === 'fw') { const z0 = (open ? 0.8 : 0.86) * L / 2, y1 = (open ? 0.34 : 0.3) * H; return (x, y, z) => z > z0 && y < y1; }
  const z0 = -(open ? 0.76 : 0.82) * L / 2, y0 = (open ? 0.5 : 0.56) * H; return (x, y, z) => z < z0 && y > y0;
}
function dvLoseWheel(model, dv, c, V) {
  const w = model.wheels[c]; if (!w || dv.lostDone[c]) return; dv.lostDone[c] = 1;
  model.root.updateMatrixWorld(true);
  const mesh = new THREE.Mesh(w.geometry, w.material); mesh.castShadow = true;
  w.getWorldPosition(mesh.position); w.getWorldQuaternion(mesh.quaternion);
  w.visible = false;
  const d = DFX.debris.add(mesh, { kind: 'wheel', r: dv.R, hw: dv.hw || 0.15 });
  dvVel(V, d.vel); const out = c % 2 ? -1 : 1;
  d.vel.x += Math.cos(V.h) * out * (2 + Math.random() * 4) * 0.8; d.vel.z += -Math.sin(V.h) * out * (2 + Math.random() * 4) * 0.8; d.vel.y = 2 + Math.random() * 4; d.vel.multiplyScalar(0.85);
  d.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
  DFX.spark(mesh.position.x, mesh.position.y, mesh.position.z, d.vel.x, d.vel.z, 24, 7, mesh.position.y - dv.R);
}
function dvRestore(dv, lists) {
  for (const it of lists) {
    const M = it.M, o = it.t * 9;
    for (let k = 0; k < 9; k++) { M.pos[o + k] = M.o[o + k]; M.nor[o + k] = M.on[o + k]; M.col[o + k] = M.oc[o + k]; }
    M.gone[it.t] = 0;
    M.g.attributes.position.needsUpdate = M.g.attributes.normal.needsUpdate = M.g.attributes.color.needsUpdate = true;
  }
}
function dvRestoreAll(dv, keep) {
  const keepSet = new Set(); for (const k of keep) for (const it of dv.det[k]) keepSet.add(it.M.g.id + ':' + it.t);
  for (const M of dv.meshes) {
    for (let v = 0; v < M.n * 3; v++) {
      const t = Math.floor(v / 9); if (keepSet.has(M.g.id + ':' + t)) continue;
      M.pos[v] = M.o[v]; M.nor[v] = M.on[v]; M.col[v] = M.oc[v];
    }
    for (let t = 0; t < M.gone.length; t++) if (!keepSet.has(M.g.id + ':' + t)) M.gone[t] = 0;
    M.g.attributes.position.needsUpdate = M.g.attributes.normal.needsUpdate = M.g.attributes.color.needsUpdate = true;
  }
  dv.det = { fw: [], rw: [], chunk: [] };
}

// consume what the physics reported for one car this frame; returns { evs, hit } for the UI / audio
function dvCar(model, V, dt, near) {
  const D = V.dmg, res = { evs: null, hit: 0 };
  if (!D || !(DMG.scale > 0)) { if (model.dv) dvOff(model); return res; }
  const hasEv = D.ev.length > 0, hasHit = D.hits && D.hits.length > 0;
  if (!near) { if (D.ev.length > 40) D.ev.splice(0, D.ev.length - 40); return res; }
  let dv = model.dv;
  if (!dv) { if (!hasEv && !hasHit && D.total <= 0.02 && !(V.scrapeT > 0)) return res; dv = dvSetup(model); dvSync(model, dv, V); }
  model.root.updateMatrixWorld(true);
  const H = model.H, wv = dvVel(V, _d3.set(0, 0, 0)).clone();
  // ---- events
  if (hasEv) {
    res.evs = D.ev.splice(0, D.ev.length);
    for (const e of res.evs) {
      if (e.type === 'fwOff' || e.type === 'rwOff') {
        const kind = e.type === 'fwOff' ? 'fw' : 'rw', tris = dvCollect(dv, dvRegion(model, kind));
        // split into left / middle / right pieces
        const parts = [[], [], []]; for (const t of tris) parts[t.cx > model.W * 0.12 ? 0 : t.cx < -model.W * 0.12 ? 2 : 1].push(t);
        for (let k = 0; k < 3; k++) dvDetach(model, dv, parts[k], kind, V, wv.clone().multiplyScalar(0.8), 8);
        dvMark(dv, kind);
      } else if (e.type === 'wheel') { dvLoseWheel(model, dv, e.idx, V); }
      else if (e.type === 'repair') dvRepair(model, dv, V, e.part);
      else if (e.type === 'repairAll') dvRepair(model, dv, V, 'all');
    }
    dvSync(model, dv, V);
  }
  // ---- impacts
  if (hasHit) {
    const hits = D.hits.splice(0, D.hits.length);
    for (const h of hits) {
      res.hit = Math.max(res.hit, h.x);
      if (h.dx < 0.15) continue;
      const depth = Math.min(0.6, 0.042 * h.dx * (0.6 + 0.4 * Math.min(1, h.x / 15))), rad = 0.5 + Math.min(0.85, 0.05 * h.x);
      _d1.set(h.b, H * 0.36, h.a); _d2.set(h.nL, 0, h.nF);
      if (_d2.lengthSq() < 1e-6) _d2.set(-Math.sign(h.b), 0, -Math.sign(h.a)); _d2.normalize();
      dvDent(dv, _d1, _d2, depth, rad);
      // panels that tear off
      if (h.x > 4.5) {
        const n = Math.min(60, Math.floor(h.dx * 5 + 3));
        const cand = dvCollect(dv, (x, y, z) => { const dx = x - _d1.x, dy = y - _d1.y, dz = z - _d1.z; return dx * dx + dy * dy + dz * dz < rad * rad * 0.8; });
        cand.sort((p, q) => ((p.cx - _d1.x) ** 2 + (p.cy - _d1.y) ** 2 + (p.cz - _d1.z) ** 2) - ((q.cx - _d1.x) ** 2 + (q.cy - _d1.y) ** 2 + (q.cz - _d1.z) ** 2));
        const pick = cand.slice(0, n).filter(() => Math.random() < 0.7);
        // a few clumps rather than one confetti
        const cl = [[], []]; for (const t of pick) cl[Math.random() < 0.5 ? 0 : 1].push(t);
        for (const c of cl) dvDetach(model, dv, c, 'chunk', V, wv.clone().multiplyScalar(0.7).addScaledVector(_d2.clone().applyQuaternion(model.root.quaternion), -2), 9);
      }
      // sparks + a puff of dust
      dvWorld(model, h.a, h.b, H * 0.3, _d3);
      const gy = _d3.y - H * 0.28;
      DFX.spark(_d3.x, _d3.y, _d3.z, wv.x, wv.z, Math.min(70, 8 + Math.floor(h.dx * 4)), 4 + Math.min(10, h.x * 0.5), gy);
      for (let k = 0; k < 4; k++) DFX.puff(_d3.x, _d3.y, _d3.z, wv.x * 0.3, 0.6 + Math.random(), wv.z * 0.3, 0.7, 0.55, 0.52, 0.47, 0.4, 1.6);
    }
    dv.dirty = true;
  }
  // ---- continuous: scraping sparks, smoke, steam
  if (V.scrapeT > 0 && V.scrapeAt) {
    const sp = V.scrapeAt[2];
    if (sp > 6) { const n = Math.min(6, Math.floor(sp * dt * 2 + Math.random())); if (n > 0) DFX.spark(V.scrapeAt[0], V.y + 0.28, V.scrapeAt[1], wv.x, wv.z, n, 3 + sp * 0.08, V.y); }
  }
  dv.scuffT = (dv.scuffT || 0) - dt;
  if (V.scrapeT > 0 && V.scrapeAt && V.scrapeAt[2] > 5 && dv.scuffT <= 0) {
    dv.scuffT = 0.22;
    const dx = V.scrapeAt[0] - V.x, dz = V.scrapeAt[1] - V.z, b = dx * Math.cos(V.h) - dz * Math.sin(V.h), a = dx * Math.sin(V.h) + dz * Math.cos(V.h);
    dvScuff(dv, b >= 0 ? 1 : -1, a, H, model.W);
  }
  const lostAny = D.lost[0] || D.lost[1] || D.lost[2] || D.lost[3];
  if ((lostAny || D.floor > 0.5 || D.fw >= 0.95) && Math.abs(V.u) > 8 && Math.random() < dt * 25) {
    const c = D.lost[0] ? 0 : D.lost[1] ? 1 : D.lost[2] ? 2 : D.lost[3] ? 3 : -1;
    const a = c < 0 ? (D.fw >= 0.95 ? model.L * 0.45 : 0) : (c < 2 ? model.a : -model.b), b = c < 0 ? 0 : (c % 2 ? -1 : 1) * model.W * 0.5;
    dvWorld(model, a, b, 0.05, _d3); DFX.spark(_d3.x, _d3.y, _d3.z, wv.x, wv.z, 3, 3 + Math.abs(V.u) * 0.06, V.y);
  }
  if (D.cool > 0.28 || D.temp > 0.3 || D.eng > 0.45) {
    dv.emitT -= dt;
    if (dv.emitT <= 0) {
      const heat = Math.max(D.cool * 0.7, D.temp), black = D.eng > 0.55 || D.dead && D.why === 'motor' || D.temp >= 1;
      dv.emitT = black ? 0.045 : Math.max(0.05, 0.22 - heat * 0.18);
      dvWorld(model, model.spec ? model.a + (model.L / 2 - model.a) * 0.4 : model.L * 0.3, (Math.random() - 0.5) * 0.5, H * 0.62, _d3);
      if (black) DFX.puff(_d3.x, _d3.y, _d3.z, wv.x * 0.6, 1.4, wv.z * 0.6, 0.9, 0.1, 0.1, 0.1, 0.55, 2.1);
      else DFX.puff(_d3.x, _d3.y, _d3.z, wv.x * 0.6, 1.1, wv.z * 0.6, 0.65, 0.9, 0.92, 0.95, 0.32, 1.7);
    }
  }
  return res;
}
function dvMark(dv, kind) { dv.gone = dv.gone || {}; dv.gone[kind] = true; }
function dvOff(model) { // damage switched off: put everything back
  const dv = model.dv; if (!dv) return;
  dvRestoreAll(dv, []); for (const w of model.wheels) { w.visible = true; w.scale.set(1, 1, 1); w.rotation.z = 0; }
  model.dv = null; for (const M of dv.meshes) { /* geometry stays cloned */ }
}
function dvRepair(model, dv, V, part) {
  if (part === 'all') { dvRestoreAll(dv, []); dv.gone = {}; dv.lostDone = [0, 0, 0, 0]; for (const w of model.wheels) w.visible = true; dv.det = { fw: [], rw: [], chunk: [] }; return; }
  if (part === 'fw' || part === 'rw') { dvRestore(dv, dv.det[part]); dv.det[part] = []; if (dv.gone) dv.gone[part] = false; }
  else if (part === 'body') { const keep = ['fw', 'rw'].filter(k => dv.gone && dv.gone[k]); const saved = keep.map(k => dv.det[k].slice()); dvRestoreAll(dv, []); keep.forEach((k, i) => { dv.det[k] = saved[i]; for (const it of saved[i]) { it.M.pos.fill(0, it.t * 9, it.t * 9 + 9); it.M.gone[it.t] = 1; } }); dv.det.chunk = []; }
  else if (part === 'sus') { dv.lostDone = [0, 0, 0, 0]; for (const w of model.wheels) w.visible = true; }
}
// wheels: lost / flat / bent
function dvSync(model, dv, V) {
  const D = V.dmg;
  for (let c = 0; c < 4; c++) {
    const w = model.wheels[c]; if (!w) continue;
    w.visible = !D.lost[c];
    const flat = D.tyre[c] ? 1 : 0;
    w.scale.set(1, 1 - 0.13 * flat, 1 - 0.13 * flat);
    w.position.y = dv.fronts[c] ? -dv.R * 0.13 * flat : dv.wbase[c] - dv.R * 0.13 * flat;
  }
}
// called from the pose: sag where wheels are missing, bent wheels, shake
function dvPose(m, V, dt) {
  const dv = m.dv; if (!dv || !(DMG.scale > 0)) return;
  const D = V.dmg, R = dv.R;
  const cd = [0, 1, 2, 3].map(c => R * (D.lost[c] * 0.85 + D.sus[c] * 0.1 + D.tyre[c] * 0.1));
  const df = (cd[0] + cd[1]) / 2, dr = (cd[2] + cd[3]) / 2, dl = (cd[0] + cd[2]) / 2, drt = (cd[1] + cd[3]) / 2;
  const k = Math.min(1, dt * 7);
  dv.sagY += (-(df + dr) / 2 - dv.sagY) * k;
  dv.pitch += ((df - dr) / (m.a + m.b) - dv.pitch) * k;
  dv.roll += ((drt - dl) / (m.W * 0.85) - dv.roll) * k;
  m.body.position.y += dv.sagY; m.body.rotation.x += dv.pitch; m.body.rotation.z += dv.roll;
  const vib = V.dmg.fx ? V.dmg.fx.vib : 0;
  if (vib > 0.05 && Math.abs(V.u) > 3) { m.body.position.y += (Math.random() - 0.5) * 0.012 * vib; m.body.rotation.z += (Math.random() - 0.5) * 0.006 * vib; }
  for (let c = 0; c < 4; c++) { const w = m.wheels[c]; if (w && w.visible) w.rotation.z = D.sus[c] > 0.15 ? dv.camSign[c] * D.sus[c] * 0.2 : 0; }
}

// ---------------------------------------------------------------------------
//  Barriers: deformable armco rails, tyre walls made of loose tyres
// ---------------------------------------------------------------------------
class DfxBarriers {
  constructor(world, T, fx) {
    this.world = world; this.T = T; this.fx = fx; this.group = new THREE.Group(); world.group.add(this.group);
    this.slots = []; this.bySample = [{}, {}]; this.meshes = [];
    this.ver = T.barVer; this.tyreBudget = 0;
    const N = T.N, ds = T.ds, step = 0.72;
    const geo = new THREE.CylinderGeometry(0.36, 0.36, 0.31, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (const side of [1, -1]) {
      const tw0 = side > 0 ? T.twL0 : T.twR0, si = side > 0 ? 0 : 1;
      let i = 0;
      while (i < N) {
        if (!(tw0[i] > 0.05)) { i++; continue; }
        let j = i; while (j < N - 1 && tw0[j + 1] > 0.05) j++;
        const run = []; // slots of this run
        for (let s = i; s <= j; s++) {
          const d0 = world.barDf(side, s), d1 = world.barDf(side, s + 1), nsub = Math.max(1, Math.round(ds / step));
          for (let q = 0; q < nsub; q++) {
            const f = q / nsub, pA = world.P(s, 0, 0), pB = world.P(s + 1, 0, 0);
            const px = (pA[0] + (pB[0] - pA[0]) * f), pz = (pA[2] + (pB[2] - pA[2]) * f), py = pA[1] + (pB[1] - pA[1]) * f;
            const k = (s + 1) % N, nx = T.nx[s] + (T.nx[k] - T.nx[s]) * f, nz = T.nz[s] + (T.nz[k] - T.nz[s]) * f, nl = Math.hypot(nx, nz) || 1;
            const d = d0 + (d1 - d0) * f;
            for (let layer = 0; layer < 2; layer++) for (let row = 0; row < 3; row++) {
              const h = dfxHash(s * 7.13 + q * 3.7 + layer * 11.3 + row * 1.9 + side);
              const e = layer === 0 ? 0.99 : 0.36 + (h - 0.5) * 0.08;
              const lat = d - side * e + (h - 0.5) * 0.08;
              const thr = layer === 0 ? 0.74 + 0.5 * (0.15 + 0.85 * h) + 0.03 * row : 0.04 + 0.4 * h + 0.03 * row;
              if (tw0[s] < thr) continue;
              { const ex = px + nx / nl * lat, ez = pz + nz / nl * lat; if (T.esc && T.esc.near(ex, ez)[0] < T.esc.hw + 1.5) continue; }   // nothing but the lane on an escape road
              run.push({ s, side, layer, row, h, thr, x: px + nx / nl * lat, y: py + 0.155 + row * 0.31, z: pz + nz / nl * lat, yaw: h * 6.283, on: true });
            }
          }
        }
        const groups = new Map();
        for (const sl of run) { const k = Math.floor((sl.s - i) / 30); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(sl); }
        for (const list of groups.values()) {
          const im = new THREE.InstancedMesh(geo, mat, list.length); im.castShadow = false;
          const col = new THREE.Color();
          list.forEach((sl, n) => {
            sl.mesh = im; sl.idx = n;
            const r = dfxHash(n * 1.3 + side * 5.1 + sl.s);
            col.setHex(r < 0.1 ? 0xd9dadc : r < 0.2 ? 0xa81a1e : 0x1c1c1e).multiplyScalar(0.8 + 0.4 * dfxHash(n * 2.1 + sl.s));
            im.setColorAt(n, col);
            (this.bySample[si][sl.s] || (this.bySample[si][sl.s] = [])).push(sl);
            this.slots.push(sl);
          });
          this.meshes.push(im); this.group.add(im); this.writeAll(im, list); im.computeBoundingSphere();
        }
        i = j + 1;
      }
    }
  }
  writeAll(im, list) {
    for (const sl of list) this.write(sl);
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  write(sl) {
    _dq.setFromAxisAngle(_dUp, sl.yaw);
    sl.mesh.setMatrixAt(sl.idx, DfxBarriers.M.compose(_d1.set(sl.x, sl.y, sl.z), _dq, sl.on ? DfxBarriers.S1 : DfxBarriers.S0));
  }
  refreshRail(side, i) {
    const W = this.world, A = W.armco[side > 0 ? 'L' : 'R']; if (!A) return;
    const T = this.T, N = T.N, dent = side > 0 ? T.dentL : T.dentR, pos = A.geo.attributes.position.array;
    const topD = (j) => { const k = ((j % N) + N) % N, dd = dent[k]; return W.barDf(side, k) + side * (dd + 0.28 * Math.min(1, dd)); };
    const botD = (j) => { const k = ((j % N) + N) % N, dd = dent[k]; return W.barDf(side, k) + side * dd * 0.75; };
    for (let j = i - 8; j <= i + 8; j++) {
      const k = ((j % N) + N) % N, st = A.st[k]; if (st < 0) continue;
      const dd0 = dent[k], dd1 = dent[(k + 1) % N];
      const b0 = W.P(k, botD(k), -0.3), b1 = W.P(k + 1, botD(k + 1), -0.3);
      const t0 = W.P(k, topD(k), 0.78 - Math.min(0.34, dd0 * 0.32) + (dfxHash(k * 1.7) - 0.5) * 0.07 * Math.min(1, dd0 * 2)), t1 = W.P(k + 1, topD(k + 1), 0.78 - Math.min(0.34, dd1 * 0.32) + (dfxHash(k * 1.7 + 1.7) - 0.5) * 0.07 * Math.min(1, dd1 * 2));
      const order = [b0, b1, t1, b0, t1, t0];
      for (let v = 0; v < 6; v++) { const o = (st + v) * 3; pos[o] = order[v][0]; pos[o + 1] = order[v][1]; pos[o + 2] = order[v][2]; }
    }
    A.geo.attributes.position.needsUpdate = true;
  }
  // a tyre of the wall gets thrown out
  loose(sl, ev) {
    if (this.tyreBudget <= 0 || Math.random() > 0.3) return;
    this.tyreBudget--;
    const mesh = new THREE.Mesh(DFX.tyreGeo, DFX.tyreMat); mesh.position.set(sl.x, sl.y, sl.z); mesh.quaternion.setFromAxisAngle(_dUp, sl.yaw);
    const d = DFX.debris.add(mesh, { kind: 'wheel', cat: 'tyre', r: 0.36, hw: 0.155 });
    const sp = Math.hypot(ev.vx, ev.vz) || 1;
    d.vel.set(ev.vx * 0.45 + (Math.random() - 0.5) * 4 + (ev.nx || 0) * 2, 1.5 + Math.random() * Math.min(5, 1 + sp * 0.08), ev.vz * 0.45 + (Math.random() - 0.5) * 4 + (ev.nz || 0) * 2);
    d.w.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
  }
  update(dt) {
    const T = this.T;
    if (T.barReset) {
      T.barReset = false;
      for (const sl of this.slots) sl.on = true;
      for (const im of this.meshes) { const list = this.slots.filter(s => s.mesh === im); this.writeAll(im, list); }
      for (const side of [1, -1]) for (let i = 0; i < T.N; i += 6) this.refreshRail(side, i);
      T.barEv.length = 0; this.ver = T.barVer; return;
    }
    if (!T.barEv.length) return;
    const evs = T.barEv.splice(0, T.barEv.length), done = new Set(); this.tyreBudget = 3;
    const dirty = new Set();
    for (const ev of evs) {
      const key = ev.side + ':' + ev.i;
      // hard hits throw sparks and plates
      if (ev.close > 3 && Math.random() < 0.9) {
        DFX.spark(ev.x, this.world.heightAt ? this.world.heightAt(ev.x, ev.z) + 0.35 : 0.4, ev.z, ev.vx, ev.vz, Math.min(28, 4 + Math.floor(ev.close)), 3 + ev.close * 0.3, null);
        if (ev.typ === 2) for (let k = 0; k < 2; k++) DFX.puff(ev.x, this.world.heightAt(ev.x, ev.z) + 0.5, ev.z, ev.vx * 0.1, 0.8, ev.vz * 0.1, 0.9, 0.3, 0.3, 0.3, 0.35, 1.8);
        if (ev.typ === 0 && ev.close > 7 && Math.random() < 0.12) {
          const mesh = new THREE.Mesh(DFX.plateGeo, DFX.plateMat); mesh.position.set(ev.x, this.world.heightAt(ev.x, ev.z) + 0.5, ev.z);
          mesh.rotation.y = Math.atan2(ev.nx || 0, ev.nz || 1);
          const d = DFX.debris.add(mesh, { kind: 'chunk', r: 0.1, e: 0.3 }); d.vel.set(ev.vx * 0.3 + (Math.random() - 0.5) * 3, 2 + Math.random() * 3, ev.vz * 0.3 + (Math.random() - 0.5) * 3); d.w.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
        }
      }
      if (done.has(key)) continue; done.add(key);
      const si = ev.side > 0 ? 0 : 1, tw = ev.side > 0 ? T.twL : T.twR;
      for (let j = ev.i - 8; j <= ev.i + 8; j++) {
        const k = ((j % T.N) + T.N) % T.N, list = this.bySample[si][k]; if (!list) continue;
        for (const sl of list) {
          const on = tw[k] >= sl.thr;
          if (on !== sl.on) { sl.on = on; this.write(sl); dirty.add(sl.mesh); if (!on) this.loose(sl, ev); }
        }
      }
      this.refreshRail(ev.side, ev.i);
    }
    for (const im of dirty) im.instanceMatrix.needsUpdate = true;
  }
}
DfxBarriers.M = new THREE.Matrix4(); DfxBarriers.S1 = new THREE.Vector3(1, 1, 1); DfxBarriers.S0 = new THREE.Vector3(0.0001, 0.0001, 0.0001);
