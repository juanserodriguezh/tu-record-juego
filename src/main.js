// ============================================================================
//  MAIN: boot, garage UI, session modes (practice / quick race / full race /
//  multiplayer), AI field, input, cameras, timing, HUD and render loop
// ============================================================================
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('spa_rec_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('spa_rec_' + k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem('spa_rec_' + k); } catch (e) { } }
};
const fmtTime = (t) => { if (t == null || !isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(3).padStart(6, '0'); };
const fmtSec = (t) => (t == null || !isFinite(t)) ? '—' : (t >= 60 ? fmtTime(t) : t.toFixed(3));
const fmtDelta = (d) => (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(3);
const fmtClock = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t - m * 60); return m + ':' + String(s).padStart(2, '0'); };
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const DRIVE = { F: 'Delantera', R: 'Trasera', A: 'Integral' };
const QUAL = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' };
const DRAW = { corta: ['Corta', 0.6], normal: ['Normal', 1], larga: ['Larga', 1.5] };
const PATTERNS = { solido: 'Sólido', franjas: 'Franjas', dos: 'Techo', banda: 'Banda' };
const FINISH = { brillo: 'Brillo', mate: 'Mate', metal: 'Metal' };
const RIMNAMES = { plata: 'Plata', negro: 'Negro', oro: 'Oro', bronce: 'Bronce' };
const SWATCHES = ['#f4f4f4', '#9aa0a6', '#2a2d31', '#0e0f11', '#c8120c', '#e3342c', '#f28c28', '#f6c21c', '#b5e61d', '#1f9a3a', '#0f5c4a', '#6fc3df', '#2f63b8', '#1b3a6b', '#5b1a8f', '#c9a24a'];
const MODES = { practica: 'Práctica', rapida: 'Carrera rápida', completa: 'Carrera completa', multi: 'Multijugador' };
const DIFFN = (d) => d <= 2 ? 'Novato' : d <= 4 ? 'Aficionado' : d <= 6 ? 'Intermedio' : d <= 8 ? 'Experto' : d === 9 ? 'Profesional' : 'Leyenda';
const DEFAULTS = { quality: 'medio', draw: 'normal', fov: 62, fps: false, fpsCap: '60', abs: true, tc: true, esc: true, autoShift: true, steerAssist: true, steerSens: 1.0, minimap: true, lineMode: 'off', ghost: true, units: 'kmh', volume: 0.7, volEngine: 1, volFx: 0.8, muted: false, damage: 'real', tyres: 'normal' };
const GAME_DEFAULTS = { mode: 'practica', start: 'grid', rivals: false, nRivals: 12, diff: 5, rivalCars: 'mismo', laps: 3, gridPos: 'medio', qualiMin: 10, name: '', tyre: 'auto', netLaps: 3, netCol: 1 };
const S = {
  // phones start on the light graphics preset (it can be raised in Ajustes)
  settings: Object.assign({}, DEFAULTS, (() => { try { return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820 ? { quality: 'bajo' } : {}; } catch (e) { return {}; } })(), store.get('settings', {})),
  game: Object.assign({}, GAME_DEFAULTS, store.get('game', {})),
  carId: store.get('car', 'amg_gt3'), weather: store.get('weather', 'soleado'), liveries: store.get('liveries', {}),
  times: store.get('times', {}), mode: 'loading', camIdx: 0, cat: 'todos', brand: null, lookBack: false, search: ''
};
if (!CARS.find(c => c.id === S.carId)) S.carId = 'amg_gt3';
const LINE_MODES = { off: 'Desactivada', fija: 'Fija', activa: 'Adaptativa' };
if (!LINE_MODES[S.settings.lineMode]) S.settings.lineMode = 'off';
if (store.get('settings', {}).lineMode == null && S.settings.idealLine) S.settings.lineMode = 'activa';   // the old ideal-line switch
if (!WEATHER[S.weather]) S.weather = 'soleado';
if (!MODES[S.game.mode]) S.game.mode = 'practica';
S.game.rivals = S.game.rivals === true || S.game.rivals === 'true';
const carById = (id) => CARS.find(c => c.id === id);
const liveryOf = (sp) => Object.assign({ col: sp.col || '#dddddd', col2: sp.col2 || '#111111', col3: sp.col3, pattern: 'solido', finish: 'brillo', rim: sp.rim || (sp.race ? 'negro' : 'plata') }, S.liveries[sp.id] || {});
const recKey = (id, wet) => (TRACK.id === 'spa' ? '' : TRACK.id + ':') + id + '|' + (wet ? 'wet' : 'dry');
const wxStart = (k) => { const w = WEATHER[k || S.weather]; return w.water0 != null ? w.water0 : (w.water || 0); };
const isWet = () => wxStart() > 0.12;
const saveGame = () => store.set('game', S.game);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let T, LINE, renderer, scene, camera, world, sky, audio;
let RSEED_W = 12345;
let TRACK = TRACK_DEFS[store.get('track', 'spa')] || TRACK_DEFS.spa;
let car = null, model = null, ghost = null;
const env = { grip: 1, abs: true, tc: true, esc: true, autoShift: true, steerAssist: true, wet: false, water: 0, dryLine: 0 };

function setProgress(p, msg) { $('loadFill').style.width = Math.round(p * 100) + '%'; if (msg) $('loadMsg').textContent = msg; }
const tick = () => new Promise(r => setTimeout(r, 16));

// ---------------------------------------------------------------------------
async function boot() {
  try {
    setProgress(0.04, 'Cargando tipografías…');
    try { await Promise.race([Promise.all([document.fonts.load("800 40px 'Saira Condensed'"), document.fonts.load("600 20px 'Saira Condensed'")]), new Promise(r => setTimeout(r, 1800))]); } catch (e) { }
    const q = S.settings.quality;
    // medio / alto draw through the composer, whose scene target has its own MSAA: a multisampled canvas would only resolve one quad
    renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'alto' ? 2 : q === 'medio' ? 1.25 : 0.75));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = q !== 'bajo'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    scene = new THREE.Scene();
    DFX.init(scene, (x, z) => world ? world.heightAt(x, z) : 0);
    camera = new THREE.PerspectiveCamera(S.settings.fov, window.innerWidth / window.innerHeight, 0.1, 3600);
    RSEED = 12345; makeTextures(); RSEED_W = RSEED;
    sky = new Sky(scene, renderer);
    await loadTrack(TRACK.id, true);
    applyQuality(false);
    audio = new CarAudio();
    setProgress(0.9, 'Cargando modelos 3D…'); await tick(); try { await loadGlbs((f, id) => setProgress(0.9 + f * 0.05, 'Cargando modelos 3D…')); } catch (e) { console.warn(e); }
    setProgress(0.95, 'Preparando el garaje…'); await tick();
    initUI();
    selectCar(S.carId, true);
    enterMenu();
    $('loading').hidden = true;
    requestAnimationFrame(frame);
    // a shared room link (…#ABCD) opens the lobby and joins that room
    const hc = normCode(location.hash || '');
    if (codeValid(hc)) { $('netCode').value = hc; NET.pendingCode = hc; openLobby(); }
  } catch (err) {
    console.error(err);
    $('loadMsg').textContent = 'No se pudo iniciar el juego: ' + (err && err.message ? err.message : err) + '. Prueba en un navegador con WebGL activado.';
  }
}

// ---------------------------------------------------------------------------
//  Circuits: build (or rebuild) track, racing line and scenery
// ---------------------------------------------------------------------------
async function loadTrack(id, first) {
  const D = TRACK = TRACK_DEFS[id] || TRACK_DEFS.spa;
  $('loading').hidden = false; applyTrackTexts();
  setProgress(0.1, D.load[0]); await tick();
  if (world) { scene.remove(world.group); world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); world = null; }
  if (skids) skids.clear();
  T = buildTrack(D);
  const offs = (LINE_OFFS[D.id] || '').split(',').map(v => +v / 100);
  LINE = lineFromOffsets(T, Float64Array.from(offs.length === T.N ? offs : new Array(T.N).fill(0)));
  AI_PROFILES.clear();
  RSEED = RSEED_W;
  world = new World(scene, T, LINE, S.settings.quality);
  setProgress(0.2, 'Asfalto, pianos, boxes y escapatorias…'); await tick();
  world.buildTrack();
  setProgress(0.35, D.load[1]); await tick();
  world.buildTerrain();
  setProgress(0.55, D.load[2]); await tick();
  world.buildLandmarks();
  setProgress(0.7, 'Plantando el bosque…'); await tick();
  world.buildTrees();
  setProgress(0.86, 'Cielo y clima…'); await tick();
  wxInit(T, LINE, D); world.buildPuddles();
  applyWeather();
  DFX.attachWorld(world, T);
  if (!first) { initMinimap(); scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } }); $('loading').hidden = true; }
}
function applyTrackTexts() {
  const D = TRACK;
  document.title = D.title;
  document.querySelectorAll('.brand-mark').forEach(el => el.textContent = D.mark);
  document.querySelectorAll('.load-title, .brand-text strong').forEach(el => el.textContent = D.title);
  const sm = document.querySelector('.brand-text small'); if (sm) sm.textContent = D.sub;
  const fam = (id) => id.startsWith('toca_') ? 'toca' : id;
  const tt = $('trackTabs'); if (tt) tt.querySelectorAll('.trk').forEach(b => b.setAttribute('aria-pressed', String(fam(b.dataset.k) === fam(D.id))));
  // layouts of the selected circuit (Tocancipá): one button per layout
  const lt = $('layoutTabs');
  if (lt) { const lays = Object.values(TRACK_DEFS).filter(d => d.layout && fam(d.id) === fam(D.id));
    const lg = $('layoutGroup'); if (lg) { lg.hidden = lays.length < 2; const card = tt && [...tt.querySelectorAll('.trk')].find(b => fam(b.dataset.k) === fam(D.id)); if (card && !lg.hidden) card.after(lg); }
    if (lays.length >= 2 && lt.dataset.fam !== fam(D.id)) { lt.dataset.fam = fam(D.id); lt.innerHTML = '';
      for (const d of lays) { const b = document.createElement('button'); b.type = 'button'; b.dataset.k = d.id; b.textContent = d.layout;
        b.addEventListener('click', () => { if (NET.code && !NET.host) { netNotify('En la sala, el circuito lo elige el anfitrión.'); return; } switchTrack(d.id).then(ok => { if (ok && NET.code) netSet({ trk: TRACK.id }); }); }); lt.appendChild(b); } }
    [...lt.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === D.id))); }
}
let trackBusy = false;
async function switchTrack(id) {
  if (trackBusy || !TRACK_DEFS[id] || (TRACK && TRACK.id === id && world)) return false;
  if (S.mode !== 'menu' && S.mode !== 'loading') return false;
  trackBusy = true;
  try { store.set('track', id); await loadTrack(id); enterMenu(); }
  finally { trackBusy = false; }
  return true;
}

// ---------------------------------------------------------------------------
//  Weather / quality
// ---------------------------------------------------------------------------
function applyWeather() {
  const w = WEATHER[S.weather];
  sky.apply(S.weather, DRAW[S.settings.draw][1], world);
  env.grip = w.grip; wxReset();
  renderer.toneMappingExposure = w.exposure;
  scene.background = new THREE.Color(w.fog);
}
function applyQuality(rebuildTrees) {
  const q = S.settings.quality;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'alto' ? 2 : q === 'medio' ? 1.25 : 0.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = q !== 'bajo';
  sky.sun.castShadow = q !== 'bajo';
  { const ms = q === 'alto' ? 4096 : 1536; if (sky.sun.shadow.mapSize.x !== ms) { sky.sun.shadow.mapSize.set(ms, ms); if (sky.sun.shadow.map) { sky.sun.shadow.map.dispose(); sky.sun.shadow.map = null; } } }
  if (model && model.blob) model.blob.visible = q === 'bajo';
  { const an = q === 'bajo' ? 4 : Math.min(16, renderer.capabilities.getMaxAnisotropy()); for (const k of ['asphalt', 'grass', 'gravel', 'armco']) if (TEX[k] && TEX[k].anisotropy !== an) { TEX[k].anisotropy = an; TEX[k].needsUpdate = true; } }
  if (q !== 'bajo') initPost();
  if (rebuildTrees && world.q !== q) { world.q = q; world.buildTrees(); }
  scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
}
const TYW_LEVELS = { off: 0, normal: 1, fast: 2.5 };
function syncEnv() {
  const st = S.settings;
  DMG.scale = (SES && SES.mode === 'multi') ? 0 : (DMG_LEVELS[st.damage] != null ? DMG_LEVELS[st.damage] : 1);
  TYW.scale = (SES && SES.mode === 'multi') ? 0 : (TYW_LEVELS[st.tyres] != null ? TYW_LEVELS[st.tyres] : 1);
  env.abs = st.abs; env.tc = st.tc; env.esc = st.esc; env.autoShift = st.autoShift; env.steerAssist = st.steerAssist; env.slipCap = st.steerAssist;
}

// ---------------------------------------------------------------------------
//  Player car
// ---------------------------------------------------------------------------
const GRID_S = () => T.L - 12, GRID_D = -2.6;
function placeModel() {
  if (model) { scene.remove(model.root); }
  const sp = carById(S.carId);
  model = buildCar(sp, liveryOf(sp));
  scene.add(model.root);
  if (model.blob) model.blob.visible = S.settings.quality === 'bajo';
  if (ghost) { scene.remove(ghost.root); ghost = null; }
}
function selectCar(id, silent) {
  S.carId = id; store.set('car', id);
  const sp = carById(id);
  car = new Vehicle(sp, T);
  car.reset(GRID_S(), GRID_D);
  placeModel();
  updateModelTransform(0);
  if (!silent) renderGarage();
  renderSpec();
  netProfileSync();
}
const accelCache = {};
function zeroTo100(sp) {
  if (accelCache[sp.id] != null) return accelCache[sp.id];
  const v = new Vehicle(sp, T); v.reset(1500, 0); v.collide = () => {}; v.surfaceAt = () => 'asphalt';   // a slow car (13 s) would leave a short straight before 100 km/h
  const e = { grip: 1, abs: true, tc: true, esc: true, autoShift: true, steerAssist: true, noGrade: true };
  let t = 0; const dt = 1 / 240;
  while (t < 25) { v.step(dt, { steer: 0, throttle: 1, brake: 0 }, e); t += dt; if (v.u >= 100 / 3.6) break; }
  return (accelCache[sp.id] = t);
}

// ---------------------------------------------------------------------------
//  Garage UI
// ---------------------------------------------------------------------------
const CATS = [['todos', 'Todos'], ['nuevos', 'Escaneados'], ['proto', 'Monoplazas'], ['calle', 'Calle'], ['super', 'Súper'], ['hyper', 'Híper'], ['pista', 'Pista']];
const WICON = {
  soleado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>',
  nublado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 18h10.5a3.8 3.8 0 0 0 .4-7.6A5.6 5.6 0 0 0 7.2 9.3 4.4 4.4 0 0 0 7 18z"/></svg>',
  atardecer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 17h16M7 17a5 5 0 0 1 10 0M12 5v3M4.9 9.9l1.9 1.4M19.1 9.9l-1.9 1.4M6 20.5h12"/></svg>',
  lluvia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 14h10.5a3.6 3.6 0 0 0 .4-7.2A5.3 5.3 0 0 0 7.2 5.8 4.1 4.1 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3"/></svg>',
  llovizna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 14h10.5a3.6 3.6 0 0 0 .4-7.2A5.3 5.3 0 0 0 7.2 5.8 4.1 4.1 0 0 0 7 14z"/><path d="M9 17.5v.01M13 18.5v.01M16 17.5v.01M11 21v.01" stroke-linecap="round" stroke-width="2.2"/></svg>',
  tormenta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 13h10.5a3.6 3.6 0 0 0 .4-7.2A5.3 5.3 0 0 0 7.2 4.8 4.1 4.1 0 0 0 7 13z"/><path d="M12.5 14l-3 4.5h3L11 22" stroke-linejoin="round"/></svg>',
  secando: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 14h8.5a3.4 3.4 0 0 0 .3-6.8A5 5 0 0 0 6.4 8 3.6 3.6 0 0 0 7 14z"/><circle cx="18.5" cy="6" r="2.2"/><path d="M18.5 1.8v.8M22.2 6h-.8M21.1 3.4l-.6.6M8 17l-1 3M12 17l-1 3"/></svg>'
};
function segButtons(el, map, current, onPick) {
  el.innerHTML = '';
  for (const [k, v] of Object.entries(map)) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = Array.isArray(v) ? v[0] : v; b.setAttribute('aria-pressed', String(k === String(current)));
    b.addEventListener('click', () => { [...el.children].forEach(c => c.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); onPick(k); });
    el.appendChild(b);
  }
}
function initUI() {
  const tabs = $('catTabs');
  for (const [k, lbl] of CATS) {
    const b = document.createElement('button'); b.type = 'button'; b.role = 'tab'; b.textContent = lbl; b.dataset.k = k;
    b.setAttribute('aria-selected', String(k === S.cat));
    b.addEventListener('click', () => { S.cat = k; S.search = ''; $('carSearch').value = ''; syncTabs(); renderGarage(); });
    tabs.appendChild(b);
  }
  $('carSearch').addEventListener('input', (e) => { S.search = e.target.value; syncTabs(); renderGarage(); });
  $('carSearch').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const l = filteredCars(); if (l.length) selectCar(l[0].id); } if (e.key === 'Escape') { e.target.value = ''; S.search = ''; syncTabs(); renderGarage(); e.target.blur(); } });
  $('brandBack').addEventListener('click', () => { S.brand = null; renderGarage(); });
  renderGarage();
  for (const [id, key] of [['sw1', 'col'], ['sw2', 'col2']]) {
    const el = $(id);
    for (const c of SWATCHES) {
      const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.dataset.c = c; b.setAttribute('aria-label', 'Color ' + c);
      b.addEventListener('click', () => setLivery({ [key]: c }));
      el.appendChild(b);
    }
  }
  $('col1').addEventListener('input', (e) => setLivery({ col: e.target.value }));
  $('col2').addEventListener('input', (e) => setLivery({ col2: e.target.value }));
  const wb = $('weatherBtns');
  for (const [k, w] of Object.entries(WEATHER)) {
    const b = document.createElement('button'); b.type = 'button'; b.innerHTML = WICON[k] + '<span>' + w.name + '</span>'; b.setAttribute('aria-pressed', String(k === S.weather)); b.dataset.k = k;
    b.addEventListener('click', () => setWeather(k));
    wb.appendChild(b);
  }
  const mt = $('modeTabs');
  for (const [k, lbl] of Object.entries(MODES)) {
    const b = document.createElement('button'); b.type = 'button'; b.role = 'tab'; b.textContent = lbl; b.dataset.k = k;
    b.setAttribute('aria-selected', String(k === S.game.mode));
    b.addEventListener('click', () => { if (k === 'multi') return openLobby(); S.game.mode = k; saveGame(); [...mt.children].forEach(c => c.setAttribute('aria-selected', String(c.dataset.k === k))); renderStartHint(); renderLobby(); });
    mt.appendChild(b);
  }
  $('prevCar').addEventListener('click', () => stepCar(-1));
  $('nextCar').addEventListener('click', () => stepCar(1));
  $('startBtn').addEventListener('click', startFromMenu);
  $('sessBtn').addEventListener('click', openSessionOptions);
  $('sessClose').addEventListener('click', () => { $('session').hidden = true; });
  $('sessGo').addEventListener('click', () => { $('session').hidden = true; startFromMenu(); });
  buildTrackCards();
  for (const b of $('trackTabs').querySelectorAll('.trk')) b.addEventListener('click', () => {
    if (NET.code && !NET.host) { netNotify('En la sala, el circuito lo elige el anfitrión.'); return; }
    if (b.dataset.k.startsWith('toca_') && TRACK.id.startsWith('toca_')) return;
    switchTrack(b.dataset.k).then(ok => { if (ok && NET.code) netSet({ trk: TRACK.id }); });
  });
  applyTrackTexts();
  $('btnSettings').addEventListener('click', () => openSettings());
  $('btnControls').addEventListener('click', () => { $('controls').hidden = false; });
  $('ctlClose').addEventListener('click', () => { $('controls').hidden = true; });
  $('pResume').addEventListener('click', resume);
  $('pRepair').addEventListener('click', () => { dmgRepairAll(car); RW.clear(); $('pRepair').hidden = true; if (SES) { SES.rep = null; $('hRepair').hidden = true; toast('Coche reparado'); } });
  $('pRestart').addEventListener('click', () => { $('pause').hidden = true; restartSession(); });
  $('pSettings').addEventListener('click', () => openSettings());
  $('pMenu').addEventListener('click', () => { $('pause').hidden = true; leaveSession(); });
  $('pEnd').addEventListener('click', () => { $('pause').hidden = true; S.mode = 'race'; endQuali(); });
  $('pauseBtn').addEventListener('click', () => { if (S.mode === 'race') pause(); });
  $('hRewind').addEventListener('pointerdown', (e) => { e.preventDefault(); if (S.mode === 'race') rewind(); });
  $('resMenu').addEventListener('click', () => { $('results').hidden = true; leaveSession(); });
  $('resNext').addEventListener('click', onResultsNext);
  initSettings();
  initLobbyUI();
  const cv = $('gl'); let drag = null;
  cv.addEventListener('pointerdown', (e) => { if (S.mode === 'menu') { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); } });
  cv.addEventListener('pointermove', (e) => { if (drag && S.mode === 'menu') { MENU.ang -= (e.clientX - drag[0]) * 0.008; MENU.pitch = clamp(MENU.pitch + (e.clientY - drag[1]) * 0.004, 0.02, 0.7); drag = [e.clientX, e.clientY]; MENU.idle = 0; } });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('wheel', (e) => { if (S.mode === 'menu') { MENU.zoom = clamp(MENU.zoom + e.deltaY * 0.001, 0.7, 1.8); } }, { passive: true });
  const isTouch = matchMedia('(pointer: coarse)').matches;
  for (const btn of document.querySelectorAll('#touch button')) {
    const k = btn.dataset.k;
    const on = (e) => { e.preventDefault(); TOUCH[k] = true; btn.classList.add('act'); };
    const off = (e) => { e.preventDefault(); TOUCH[k] = false; btn.classList.remove('act'); };
    btn.addEventListener('pointerdown', on); btn.addEventListener('pointerup', off); btn.addEventListener('pointercancel', off); btn.addEventListener('pointerleave', off);
  }
  S.touch = isTouch;
  window.addEventListener('resize', onResize);
  initMinimap();
  initMenuUI();
  renderStartHint();
}
function setWeather(k) {
  S.weather = k; store.set('weather', k);
  [...$('weatherBtns').children].forEach(c => c.setAttribute('aria-pressed', String(c.dataset.k === k)));
  applyWeather(); renderSpec();
}
function syncTabs() { [...$('catTabs').children].forEach(c => c.setAttribute('aria-selected', String(!S.search.trim() && c.dataset.k === S.cat))); }
function stepCar(dir) {
  const list = filteredCars(); if (!list.length) return;
  let i = list.findIndex(c => c.id === S.carId);
  if (i < 0) i = 0; i = (i + dir + list.length) % list.length;
  if (S.brand) S.brand = brandOf(list[i]);
  selectCar(list[i].id);
}
function filteredCars() {
  const q = norm(S.search.trim());
  if (q) { const words = q.split(/\s+/); return CARS.filter(c => { const h = norm(c.name + ' ' + (c.sub || '')); return words.every(w => h.includes(w)); }); }
  if (S.cat === 'todos') return CARS;
  if (S.cat === 'nuevos') return CARS.filter(c => c.isNew);
  return CARS.filter(c => c.cat === S.cat);
}
// car previews: each model rendered once into a small image with its own renderer (cached per livery)
const BRAND_MENU = false; // brand grid + thumbnails menu (disabled: flat list as before)
const THUMB = { r: null, scene: null, cam: null, cache: new Map(), queue: [], busy: false, failed: false };
function thumbInit() {
  if (THUMB.r || THUMB.failed) return !THUMB.failed;
  try {
    const cv = document.createElement('canvas'); cv.width = 336; cv.height = 189;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(336, 189, false); r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xdfeaf7, 0x39414a, 0.9));
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.4); sun.position.set(-4, 6, 5); sc.add(sun);
    // small studio environment for paint and glass reflections
    const es = new THREE.Scene(), g = new THREE.SphereGeometry(40, 24, 12), pa = g.attributes.position, col = [];
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i) / 40; const c = new THREE.Color().setRGB(0.22, 0.24, 0.27).lerp(new THREE.Color(0.75, 0.82, 0.92), Math.max(0, y)); col.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    for (const [x, z, w] of [[-12, 8, 14], [14, -6, 10]]) { const bx = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6.4) })); bx.position.set(x, 22, z); es.add(bx); }
    const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(es, 0.03).texture; pm.dispose();
    THUMB.r = r; THUMB.scene = sc; THUMB.cam = new THREE.PerspectiveCamera(26, 336 / 189, 0.1, 100);
  } catch (e) { THUMB.failed = true; return false; }
  return true;
}
const thumbKey = (sp) => { const l = liveryOf(sp); return [sp.id, l.col, l.col2, l.col3, l.pattern, l.finish, l.rim].join('|'); };
function thumbRender(sp) {
  const key = thumbKey(sp); if (THUMB.cache.has(key)) return THUMB.cache.get(key);
  if (!thumbInit()) return null;
  const m = buildCar(sp, liveryOf(sp), { lite: true });
  THUMB.scene.add(m.root);
  const bb = new THREE.Box3().setFromObject(m.root), ctr = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
  const az = 0.62, cam = THUMB.cam, pw = 0.81 * sz.z + 0.58 * sz.x, rad = Math.hypot(sz.x, sz.z) * 0.5;
  const d = Math.max(pw / (2 * Math.tan(THREE.MathUtils.degToRad(13)) * cam.aspect * 0.86), sz.y * 2.2) + 0.25 * rad;
  cam.position.set(ctr.x + Math.sin(az) * d, ctr.y + d * 0.2, ctr.z + Math.cos(az) * d); cam.lookAt(ctr.x, ctr.y - sz.y * 0.05, ctr.z);
  THUMB.r.render(THUMB.scene, cam);
  const url = THUMB.r.domElement.toDataURL('image/png');
  THUMB.scene.remove(m.root);
  const wg = new Set(CM.wheelGeo.values());
  m.root.traverse(o => { if (o.geometry && !wg.has(o.geometry)) o.geometry.dispose(); });
  THUMB.cache.set(key, url);
  return url;
}
function thumbQueue(sp, img) {
  const k = thumbKey(sp); const hit = THUMB.cache.get(k); if (hit) { img.src = hit; return; }
  THUMB.queue.push([sp, img]); if (!THUMB.busy) thumbPump();
}
function thumbPump() {
  THUMB.busy = true;
  const next = () => {
    const job = THUMB.queue.shift(); if (!job) { THUMB.busy = false; return; }
    const [sp, img] = job;
    if (img.isConnected) { try { const u = thumbRender(sp); if (u) img.src = u; } catch (e) { } }
    setTimeout(next, 12);
  };
  setTimeout(next, 0);
}
const brandOfId = (id) => brandOf(carById(id));
function renderGarage() {
  const ul = $('carList'), grid = $('brandGrid'), bar = $('brandBar');
  const searching = !!S.search.trim(), filtered = filteredCars();
  const cur = carById(S.carId), curBrand = cur ? brandOf(cur) : null;
  if (!BRAND_MENU) S.brand = null;
  if (S.brand && !filtered.some(c => brandOf(c) === S.brand) && !searching) S.brand = null;
  const showGrid = BRAND_MENU && !searching && !S.brand;
  $('carCount').textContent = !BRAND_MENU ? filtered.length + ' modelos' : searching ? filtered.length + (filtered.length === 1 ? ' resultado' : ' resultados') : S.brand ? filtered.filter(c => brandOf(c) === S.brand).length + ' modelos' : (() => { const set = new Set(filtered.map(brandOf)); return set.size + ' marcas · ' + filtered.length + ' coches'; })();
  grid.hidden = !showGrid; ul.hidden = showGrid; bar.hidden = !BRAND_MENU || showGrid || searching; ul.classList.toggle('thumbs', BRAND_MENU);
  ul.innerHTML = '';
  if (showGrid) {
    grid.innerHTML = '';
    const by = new Map();
    for (const c of filtered) { const b = brandOf(c); if (!by.has(b)) by.set(b, []); by.get(b).push(c); }
    const brands = [...by.keys()].sort((a, b) => a.localeCompare(b, 'es'));
    for (const b of brands) {
      const cars = by.get(b), t = document.createElement('button'); t.type = 'button'; t.className = 'brand-tile'; t.setAttribute('aria-current', String(b === curBrand));
      const ini = b.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      t.innerHTML = '<span class="bt-badge"></span><span class="bt-name"></span><span class="bt-n"></span>';
      t.querySelector('.bt-badge').textContent = ini; { let h = 0; for (const ch of b) h = (h * 31 + ch.charCodeAt(0)) % 360; t.querySelector('.bt-badge').style.borderColor = `hsl(${h} 55% 55%)`; } t.querySelector('.bt-name').textContent = b;
      t.querySelector('.bt-n').textContent = cars.length + (cars.length === 1 ? ' modelo' : ' modelos');
      t.addEventListener('click', () => { S.brand = b; renderGarage(); });
      grid.appendChild(t);
    }
    return;
  }
  const list = (searching || !BRAND_MENU) ? filtered : filtered.filter(c => brandOf(c) === S.brand);
  if (!searching) $('brandName').textContent = S.brand;
  if (!list.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Ningún coche coincide con «' + S.search.trim() + '».'; ul.appendChild(li); return; }
  for (const c of list) {
    const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.className = 'card';
    b.setAttribute('aria-current', String(c.id === S.carId));
    const best = S.times[recKey(c.id, false)];
    b.innerHTML = `${BRAND_MENU ? '<span class="th"><img alt="" decoding="async"></span>' : ''}<span class="nm"></span><span class="hp">${c.hp} CV</span><span class="meta">${c.isNew ? '<span class="tag new">Escaneado</span>' : ''}${c.starter ? '<span class="tag start">Para empezar</span>' : ''}<span>${DRIVE[c.drive]}</span><span class="pb">${best ? fmtTime(best) : ''}</span></span>`;
    b.querySelector('.nm').textContent = (!searching && S.brand && c.name.startsWith(S.brand + ' ')) ? c.name.slice(S.brand.length + 1) : c.name;
    b.addEventListener('click', () => selectCar(c.id));
    li.appendChild(b); ul.appendChild(li);
    if (BRAND_MENU) thumbQueue(c, b.querySelector('img'));
  }
  const curEl = ul.querySelector('[aria-current="true"]'); if (curEl) scrollIntoPage(curEl);
}
function renderSpec() {
  const sp = carById(S.carId), liv = liveryOf(sp);
  $('specCat').textContent = CAT_NAMES[sp.cat];
  $('specName').textContent = sp.name;
  $('specSub').textContent = sp.sub || '';
  const t100 = zeroTo100(sp);
  const vmax = sp.lim ? sp.lim : sp.vmax;
  const unitsMph = S.settings.units === 'mph';
  const vtxt = unitsMph ? Math.round(vmax / 1.609) + '<small>mph</small>' : vmax + '<small>km/h</small>';
  const gripIdx = sp.mu * (1 + sp.cla / 4);
  const rows = [
    ['Potencia', sp.hp + '<small>CV</small>', sp.hp / 1817],
    ['0–100 km/h', t100.toFixed(1) + '<small>s</small>', clamp((7 - t100) / 5.5, 0.03, 1)],
    ['Velocidad máx.', vtxt + (sp.lim ? ' <small>(limitada)</small>' : ''), vmax / 480],
    ['Agarre', gripIdx.toFixed(2) + '<small>índice</small>', clamp((gripIdx - 1) / 2.6, 0.03, 1)],
    ['Peso', sp.kg + '<small>kg</small>', null],
    ['Tracción', DRIVE[sp.drive], null]
  ];
  $('specStats').innerHTML = rows.map(([k, v, f]) => `<div><dt>${k}</dt><dd>${v}</dd>${f != null ? `<div class="bar"><i style="width:${Math.round(clamp(f, 0, 1) * 100)}%"></i></div>` : ''}</div>`).join('');
  $('bestDry').textContent = fmtTime(S.times[recKey(sp.id, false)]);
  $('bestWet').textContent = fmtTime(S.times[recKey(sp.id, true)]);
  for (const [id, key] of [['sw1', 'col'], ['sw2', 'col2']]) [...$(id).children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c.toLowerCase() === String(liv[key]).toLowerCase())));
  $('col1').value = liv.col; $('col2').value = liv.col2;
  const special = ['f1', 'f1h', 'indy', 'lmp', 'fe'].includes(sp.body) || !!sp.model || !!sp.glb;   // scanned bodies only recolour their paint: no stripes
  segButtons($('segPattern'), special ? { solido: 'Original' } : PATTERNS, special ? 'solido' : liv.pattern, (k) => setLivery({ pattern: k }));
  segButtons($('segFinish'), FINISH, liv.finish, (k) => setLivery({ finish: k }));
  segButtons($('segRim'), RIMNAMES, liv.rim, (k) => setLivery({ rim: k }));
  renderStartHint();
}
function setLivery(patch) {
  const sp = carById(S.carId);
  S.liveries[sp.id] = Object.assign(liveryOf(sp), patch);
  store.set('liveries', S.liveries);
  placeModel(); updateModelTransform(0); renderSpec(); netProfileSync();
}
function renderStartHint() {
  const g = S.game, w = WEATHER[S.weather].name.toLowerCase() + (isWet() ? ' (mojado)' : '');
  const riv = `${g.nRivals} rivales · IA ${g.diff} (${DIFFN(g.diff).toLowerCase()})`;
  let lbl = 'Salir a pista', hint = '';
  if (g.mode === 'practica') hint = (g.start === 'pits' ? 'Desde boxes' : 'Salida parada') + ' · ' + (g.rivals ? riv : 'sin rivales') + ' · ' + w;
  else if (g.mode === 'rapida') { lbl = 'Empezar carrera'; hint = `${g.laps} ${g.laps === 1 ? 'vuelta' : 'vueltas'} · ${riv} · ${g.start === 'pits' ? 'desde boxes' : 'parrilla ' + { pole: 'pole', medio: 'media', ultimo: 'última', aleatoria: 'aleatoria' }[g.gridPos]}`; }
  else if (g.mode === 'completa') { lbl = 'Ir a clasificación'; hint = `Clasif. ${g.qualiMin} min + ${g.laps} ${g.laps === 1 ? 'vuelta' : 'vueltas'} · ${riv}`; }
  else [lbl, hint] = lobbyFoot();
  if (g.mode !== 'multi') { $('startBtn').disabled = false; $('startBtn').classList.remove('ready'); }
  $('startLbl').textContent = lbl; $('startHint').textContent = hint;
  $('sessBtn').hidden = g.mode === 'multi'; $('quickTitle').hidden = g.mode === 'multi';
  renderQuick(); renderSummary();
}

// quick steppers under the mode tabs (difficulty, rivals, laps, qualifying)
function renderQuick() {
  const g = S.game, box = $('quickOpts'); if (!box) return;
  box.innerHTML = '';
  const step = (label, key, min, max, fmt, stepV) => {
    const d = document.createElement('div'); d.className = 'qs';
    const l = document.createElement('span'); l.className = 'ql'; l.textContent = label;
    const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', label + ': menos');
    const val = document.createElement('b'); val.innerHTML = fmt(g[key]);
    const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', label + ': más');
    const set = (v) => { g[key] = clamp(v, min, max); saveGame(); renderStartHint(); };
    minus.disabled = g[key] <= min; plus.disabled = g[key] >= max;
    minus.addEventListener('click', () => set(g[key] - (stepV || 1)));
    plus.addEventListener('click', () => set(g[key] + (stepV || 1)));
    d.append(l, minus, val, plus); box.appendChild(d);
  };
  const diffFmt = (v) => v + '<small>' + DIFFN(v) + '</small>';
  if (g.mode === 'practica') {
    const t = document.createElement('button'); t.type = 'button'; t.className = 'qs toggle';
    t.innerHTML = '<span class="ql">Rivales IA</span><b>' + (g.rivals ? 'Sí' : 'No') + '</b>';
    t.setAttribute('aria-pressed', String(!!g.rivals));
    t.addEventListener('click', () => { g.rivals = !g.rivals; saveGame(); renderStartHint(); });
    box.appendChild(t);
    if (g.rivals) { step('Dificultad', 'diff', 1, 10, diffFmt); step('Rivales', 'nRivals', 10, 22, v => v); }
  } else if (g.mode === 'rapida' || g.mode === 'completa') {
    step('Dificultad IA', 'diff', 1, 10, diffFmt);
    step('Rivales', 'nRivals', 10, 22, v => v);
    step('Vueltas', 'laps', 1, 20, v => v);
    if (g.mode === 'completa') step('Clasif.', 'qualiMin', 5, 15, v => v + '<small>min</small>', 5);
  }
  if (g.mode !== 'multi') {
    const tp = document.createElement('div'); tp.className = 'qs tyrepick';
    const l = document.createElement('span'); l.className = 'ql'; l.textContent = 'Neumáticos'; tp.appendChild(l);
    for (const c of ['auto', ...TYRE_ORDER]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ty-opt' + (c === 'auto' ? ' auto' : '');
      b.textContent = c === 'auto' ? 'Auto' : c; b.setAttribute('aria-pressed', String((g.tyre || 'auto') === c));
      if (c !== 'auto') { b.style.setProperty('--tc', TYRES[c].col); b.title = TYRES[c].name + ' (' + TYRES[c].code + ')'; }
      b.addEventListener('click', () => { g.tyre = c; saveGame(); renderQuick(); });
      tp.appendChild(b);
    }
    box.appendChild(tp);
    const h = document.createElement('div'); h.className = 'ty-hint'; h.textContent = tyreHint(g.mode === 'practica' ? 'practice' : 'race'); tp.appendChild(h);
    const ll = document.createElement('div'); ll.className = 'ty-life'; tyreLifeCells(ll); tp.appendChild(ll);
  }
}

// ---------------------------------------------------------------------------
//  Menu (v80): three steps (Pista · Coche · Sesión) in one sheet.
//  Motion follows Apple's fluid-interface rules: springs (damping ratio + response) that start from the live value and
//  take the gesture's velocity, momentum projection to choose the page / detent, rubber-banding at the ends, 1:1 tracking.
// ---------------------------------------------------------------------------
const MENU_STEPS = ['pista', 'coche', 'sesion'];
const NEXT_LBL = { pista: 'Coche', coche: 'Sesión' };
const TRACK_CARDS = [
  ['spa', 'Spa-Francorchamps', 'Bélgica · 7,0 km · 19 curvas'], ['monza', 'Monza', 'Italia · 5,8 km · 11 curvas'],
  ['albertpark', 'Albert Park', 'Australia · 5,3 km · 14 curvas'], ['toca_largo', 'Tocancipá', 'Colombia · 6 trazados · a 2.600 m'],
  ['monaco', 'Mónaco', 'Callejero · 3,3 km · 19 curvas']
];
const MODE_INFO = {
  practica: ['Vueltas libres para bajar tu récord', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M18.5 6.5l1.5-1.5"/></svg>'],
  rapida: ['Directo a la parrilla contra la IA', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h13l-2.5 4.5L18 13H5"/></svg>'],
  completa: ['Clasificación y después carrera', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4l.5 3.5h-5z"/></svg>'],
  multi: ['Sala con código para correr con amigos', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/></svg>']
};
const REDUCED_MOTION = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { return { matches: false }; } })();
// spring with Apple's parameters: damping ratio (1 = no overshoot) and response (s); always runs from the current value and velocity
class Spring {
  constructor(x, apply, eps) { this.x = x; this.v = 0; this.to = x; this.apply = apply; this.eps = eps || 1e-3; this.raf = 0; this.d = 1; this.r = 0.35; this.done = null; this.tick = this.tick.bind(this); }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  set(x) { this.stop(); this.x = this.to = x; this.v = 0; this.apply(x); }
  go(to, o) {
    o = o || {}; this.to = to; this.d = o.damping != null ? o.damping : 1; this.r = o.response || 0.35; if (o.v != null) this.v = o.v; this.done = o.done || null;
    if (REDUCED_MOTION.matches) { this.set(to); if (this.done) this.done(); return; }
    if (!this.raf) { this.t = performance.now(); this.raf = requestAnimationFrame(this.tick); }
  }
  tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.t) / 1000)); this.t = now;
    const k = Math.pow(2 * Math.PI / this.r, 2), c = 4 * Math.PI * this.d / this.r, n = 4, h = dt / n;
    for (let i = 0; i < n; i++) { const a = -k * (this.x - this.to) - c * this.v; this.v += a * h; this.x += this.v * h; }
    if (Math.abs(this.x - this.to) < this.eps && Math.abs(this.v) < this.eps * 10) { this.x = this.to; this.v = 0; this.raf = 0; this.apply(this.x); if (this.done) this.done(); return; }
    this.apply(this.x); this.raf = requestAnimationFrame(this.tick);
  }
}
// where a flick would come to rest (Apple's projection, deceleration rate per ms)
const projectFlick = (v, rate) => (v / 1000) * rate / (1 - rate);
// progressive resistance past an edge
const rubber = (over, dim) => (over * dim * 0.55) / (dim + 0.55 * Math.abs(over));
// short pointer history -> release velocity (px/s)
function velTracker() {
  const h = [];
  return { add(x, y, ts) { const t = ts || performance.now(); h.push([x, y, t]); while (h.length > 2 && t - h[0][2] > 100) h.shift(); },
    vel() { if (h.length < 2) return [0, 0]; const a = h[0], b = h[h.length - 1], dt = (b[2] - a[2]) / 1000; return dt > 0.004 ? [(b[0] - a[0]) / dt, (b[1] - a[1]) / dt] : [0, 0]; },
    reset() { h.length = 0; } };
}
const MENU_UI = { step: 'pista', mobile: false, pages: null, sheet: null, sy: 0, det: [0, 0], cx: null, cy: null, rFit: null };
const isPhoneLayout = () => window.innerWidth <= 820;
// scrollIntoView would also scroll the clipped row of pages sideways: scroll only the page itself
function scrollIntoPage(el) {
  const pg = el.closest('.page'); if (!pg) return;
  const a = el.getBoundingClientRect(), b = pg.getBoundingClientRect(), bot = b.bottom - (MENU_UI.mobile ? (parseFloat(getComputedStyle(pg).paddingBottom) || 0) : 0);
  if (a.top < b.top + 8) pg.scrollTop += a.top - b.top - 8; else if (a.bottom > bot - 8) pg.scrollTop += a.bottom - bot + 8;
}
function trackOutlineSvg(D) {
  const pts = D.raw().split(';').filter(Boolean).map(r => r.split(',').map(Number));
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, -p[1]); y1 = Math.max(y1, -p[1]); }
  const W = 64, H = 48, sc = Math.min(W / (x1 - x0), H / (y1 - y0)), ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
  const step = Math.max(1, Math.floor(pts.length / 160)), P = (p) => (ox + (p[0] - x0) * sc).toFixed(1) + ' ' + (oy + (-p[1] - y0) * sc).toFixed(1);
  let d = ''; for (let i = 0; i < pts.length; i += step) d += (i ? 'L' : 'M') + P(pts[i]);
  const s = P(pts[0]).split(' ');
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}Z"/><circle cx="${s[0]}" cy="${s[1]}" r="2.6"/></svg>`;
}
function buildTrackCards() {
  const box = $('trackTabs'); box.innerHTML = '';
  for (const [k, name, info] of TRACK_CARDS) {
    const D = TRACK_DEFS[k]; if (!D) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'trk'; b.dataset.k = k; b.setAttribute('aria-pressed', 'false');
    b.innerHTML = trackOutlineSvg(D) + '<span class="tn"></span><span class="ts"></span><span class="tr"></span>';
    b.querySelector('.tn').textContent = name; b.querySelector('.ts').textContent = info;
    box.appendChild(b);
  }
}
// personal best of the selected car on each circuit (dry), shown on the track cards
function renderTrackRecords() {
  for (const b of $('trackTabs').querySelectorAll('.trk')) {
    const k = b.dataset.k, id = k.startsWith('toca_') && TRACK.id.startsWith('toca_') ? TRACK.id : k;
    const t = S.times[(id === 'spa' ? '' : id + ':') + S.carId + '|dry'];
    b.querySelector('.tr').innerHTML = t ? 'Tu récord<b>' + fmtTime(t) + '</b>' : '';
  }
}
function buildModeRows() {
  const mt = $('modeTabs');
  for (const b of mt.children) { const [desc, ic] = MODE_INFO[b.dataset.k]; const t = b.textContent; b.innerHTML = ic + '<b></b><span></span>'; b.querySelector('b').textContent = t; b.querySelector('span').textContent = desc; }
}
function initMenuUI() {
  const pages = $('menuPages'), clip = pages.parentElement; clip.addEventListener('scroll', () => { clip.scrollLeft = 0; clip.scrollTop = 0; });
  const sheet = $('menuSheet'), head = $('sheetHead'), thumb = $('stepsThumb');
  MENU_UI.pages = new Spring(0, (x) => { pages.style.transform = `translate3d(${-x * 100}%,0,0)`; thumb.style.transform = `translateX(${clamp(x, -0.15, 2.15) * 100}%)`; }, 1e-4);
  MENU_UI.sheet = new Spring(0, (y) => { MENU_UI.sy = y; sheet.style.setProperty('--sy', y.toFixed(1) + 'px'); sheet.style.setProperty('--foot-y', Math.max(0, y).toFixed(1) + 'px'); }, 0.2);
  buildModeRows();
  for (const b of $('menuSteps').querySelectorAll('button')) b.addEventListener('click', () => { if (!MENU_UI.swallow) setMenuStep(b.dataset.step); });
  $('nextStep').addEventListener('click', () => { const i = MENU_STEPS.indexOf(MENU_UI.step); if (i < 2) setMenuStep(MENU_STEPS[i + 1]); });
  $('lookBtn').addEventListener('click', () => { const on = !$('specPanel').classList.contains('look'); $('specPanel').classList.toggle('look', on); $('lookBtn').setAttribute('aria-expanded', String(on)); $('specLook').open = on; });
  // choosing something moves you on: a circuit or a mode picked by tap is the answer to that step
  // horizontal swipe between steps (vertical stays native scroll)
  const vt = velTracker(); let g = null;
  clip.addEventListener('pointerdown', (e) => { if (e.button) return; g = { id: e.pointerId, x: e.clientX, y: e.clientY, st: 0 }; vt.reset(); vt.add(e.clientX, e.clientY, e.timeStamp); });
  clip.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y; vt.add(e.clientX, e.clientY, e.timeStamp);
    if (g.st === 0) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { g.st = 1; g.x0 = MENU_UI.pages.x; g.x = e.clientX; MENU_UI.pages.stop(); try { clip.setPointerCapture(e.pointerId); } catch (er) { } }
      else if (Math.abs(dy) > 10) g = null;
      return;
    }
    const w = clip.clientWidth; let x = g.x0 - (e.clientX - g.x) / w;
    if (x < 0) x = -rubber(-x * w, w) / w; else if (x > 2) x = 2 + rubber((x - 2) * w, w) / w;
    MENU_UI.pages.x = x; MENU_UI.pages.apply(x);
  });
  const endSwipe = (e) => {
    if (!g || e.pointerId !== g.id) return; const st = g.st; g = null; if (st !== 1) return;
    MENU_UI.swallow = true; setTimeout(() => { MENU_UI.swallow = false; }, 0);
    const w = clip.clientWidth, vx = -vt.vel()[0] / w, x = MENU_UI.pages.x, cur = MENU_STEPS.indexOf(MENU_UI.step);
    const proj = x + projectFlick(vx * w, 0.99) / w;
    const to = clamp(Math.round(proj), Math.max(0, cur - 1), Math.min(2, cur + 1));
    setMenuStep(MENU_STEPS[to], { v: vx });
  };
  clip.addEventListener('pointerup', endSwipe); clip.addEventListener('pointercancel', endSwipe);
  clip.addEventListener('click', (e) => { if (MENU_UI.swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
  // phones: the sheet has two detents (half and full); drag it by its head, flick to throw it
  const vs = velTracker(); let s = null;
  head.addEventListener('pointerdown', (e) => { if (!MENU_UI.mobile || e.button) return; s = { id: e.pointerId, y: e.clientY, st: 0 }; vs.reset(); vs.add(0, e.clientY, e.timeStamp); });
  head.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return; vs.add(0, e.clientY, e.timeStamp);
    const dy = e.clientY - s.y;
    if (s.st === 0) { if (Math.abs(dy) < 10) return; s.st = 1; s.y0 = MENU_UI.sheet.x; s.y = e.clientY; MENU_UI.sheet.stop(); try { head.setPointerCapture(e.pointerId); } catch (er) { } }
    const [hi, lo] = MENU_UI.det; let y = s.y0 + (e.clientY - s.y);
    if (y < hi) y = hi - rubber(hi - y, window.innerHeight); else if (y > lo) y = lo + rubber(y - lo, window.innerHeight);
    MENU_UI.sheet.x = y; MENU_UI.sheet.apply(y);
  });
  const endSheet = (e) => {
    if (!s || e.pointerId !== s.id) return; const st = s.st; s = null;
    const [hi, lo] = MENU_UI.det;
    if (st !== 1) { if (e.type === 'pointerup' && e.target.closest('.grabber')) sheetTo(MENU_UI.sheet.to > (hi + lo) / 2 ? hi : lo, 0); return; }
    MENU_UI.swallow = true; setTimeout(() => { MENU_UI.swallow = false; }, 0);
    const vy = vs.vel()[1], proj = MENU_UI.sheet.x + projectFlick(vy, 0.99);
    sheetTo(Math.abs(proj - hi) < Math.abs(proj - lo) ? hi : lo, vy);
  };
  head.addEventListener('pointerup', endSheet); head.addEventListener('pointercancel', endSheet);
  window.addEventListener('resize', layoutMenu);
  layoutMenu(); setMenuStep('pista', { instant: true });
}
function sheetTo(y, v) {
  // a flick keeps a little of its energy (slight overshoot); a plain release settles without bounce
  MENU_UI.sheet.go(y, { v: v || 0, damping: Math.abs(v || 0) > 300 ? 0.8 : 1, response: 0.32, done: sheetSettled });
}
function sheetSettled() { const sh = $('menuSheet'); sh.style.setProperty('--hidden-h', Math.max(0, MENU_UI.sheet.x).toFixed(0) + 'px'); sh.style.setProperty('--sheet-top', sh.getBoundingClientRect().top.toFixed(0) + 'px'); }
function layoutMenu() {
  const sh = $('menuSheet'); if (!sh) return;
  MENU_UI.mobile = isPhoneLayout();
  sh.style.setProperty('--foot-h', sh.querySelector('.sheet-foot').offsetHeight + 'px');
  if (!MENU_UI.mobile) { MENU_UI.det = [0, 0]; MENU_UI.sheet.set(0); sh.style.removeProperty('--hidden-h'); return; }
  const H = sh.offsetHeight, vis = clamp(Math.round(window.innerHeight * 0.5), 300, H);
  const was = MENU_UI.det[1] && MENU_UI.sheet.to <= MENU_UI.det[0] + 1;
  MENU_UI.det = [0, Math.max(0, H - vis)];
  MENU_UI.sheet.set(was ? 0 : MENU_UI.det[1]); sheetSettled();
}
function setMenuStep(k, o) {
  o = o || {}; const i = MENU_STEPS.indexOf(k); if (i < 0) return;
  MENU_UI.step = k;
  for (const b of $('menuSteps').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.step === k));
  for (const p of $('menuPages').children) { const on = p.dataset.step === k; p.inert = !on; p.setAttribute('aria-hidden', String(!on)); }
  if (o.instant) MENU_UI.pages.set(i); else MENU_UI.pages.go(i, { v: o.v || 0, damping: 1, response: 0.38 });
  $('nextStep').hidden = !NEXT_LBL[k]; if (NEXT_LBL[k]) $('nextStep').textContent = NEXT_LBL[k] + ' ›';
  const spec = $('specPanel'); spec.classList.toggle('off', k !== 'coche');
  if (k !== 'coche') { spec.classList.remove('look'); $('lookBtn').setAttribute('aria-expanded', 'false'); }
  if (k === 'coche') { const cur = $('carList').querySelector('[aria-current="true"]'); if (cur) scrollIntoPage(cur); }
}
function renderSummary() {
  const el = $('menuSummary'); if (!el) return;
  const sp = carById(S.carId);
  el.innerHTML = '<b></b> · <b></b> · ' + MODES[S.game.mode];
  el.querySelectorAll('b')[0].textContent = trackLabel(); el.querySelectorAll('b')[1].textContent = sp ? sp.name : '';
  renderTrackRecords();
}
// menu camera: frame the car in the screen area the panels leave free
function menuFrame(dt) {
  const W = window.innerWidth, Hh = window.innerHeight, sh = $('menuSheet').getBoundingClientRect(), sp = $('specPanel'), spOn = !sp.classList.contains('off');
  let x0, x1, y0, y1;
  if (!MENU_UI.mobile) { x0 = sh.right; x1 = spOn ? sp.getBoundingClientRect().left : W; y0 = 56; y1 = Hh; }
  else { x0 = 0; x1 = W; y0 = spOn ? sp.getBoundingClientRect().bottom : 56; y1 = Math.min(Hh, sh.top); }
  const wF = Math.max(80, x1 - x0), hF = Math.max(80, y1 - y0), tanH = Math.tan(THREE.MathUtils.degToRad(19));
  // distance that fits the car in the free area (length across the width, height down the height)
  const rFit = Math.max(model.L * (MENU_UI.mobile ? 1.15 : 0.95) * Hh / (2 * tanH * wF), model.H * 2.6 * Hh / (2 * tanH * hF));
  const tx = (x0 + x1) / 2, ty = (y0 + y1) / 2 + (MENU_UI.mobile ? 0 : Hh * 0.04), a = 1 - Math.exp(-dt * 7);
  if (MENU_UI.cx == null || dt === 0) { MENU_UI.cx = tx; MENU_UI.cy = ty; MENU_UI.rFit = rFit; }
  MENU_UI.cx += (tx - MENU_UI.cx) * a; MENU_UI.cy += (ty - MENU_UI.cy) * a; MENU_UI.rFit += (rFit - MENU_UI.rFit) * a;
  return { ox: W / 2 - MENU_UI.cx, oy: Hh / 2 - MENU_UI.cy, rFit: MENU_UI.rFit };
}

// ---------------------------------------------------------------------------
//  Sound: master / engine / effects levels and mute, from settings, pause and HUD
// ---------------------------------------------------------------------------
const saveSettings = () => store.set('settings', S.settings);
function applySound() {
  const st = S.settings;
  if (audio) { audio.setVolume(st.volume); audio.setMix(st.volEngine, st.volFx); audio.setMuted(st.muted); }
  for (const b of document.querySelectorAll('.snd-toggle')) { b.setAttribute('aria-pressed', String(!!st.muted)); b.setAttribute('aria-label', st.muted ? 'Activar sonido' : 'Silenciar sonido'); }
  const pct = (v) => Math.round(v * 100) + '%';
  for (const [id, k, lbl] of [['setVol', 'volume', 'volVal'], ['setVolEng', 'volEngine', 'volEngVal'], ['setVolFx', 'volFx', 'volFxVal'], ['pVol', 'volume', 'pVolVal'], ['pVolEng', 'volEngine', 'pVolEngVal'], ['pVolFx', 'volFx', 'pVolFxVal']]) {
    const el = $(id); if (!el) continue; if (document.activeElement !== el) el.value = st[k]; $(lbl).textContent = pct(st[k]);
  }
  const m = $('setMute'); if (m) m.checked = !!st.muted;
}
function toggleMute() {
  S.settings.muted = !S.settings.muted; saveSettings(); applySound();
  if (SES && S.mode === 'race') { $('toast').textContent = S.settings.muted ? 'Sonido silenciado (M)' : 'Sonido activado'; $('toast').hidden = false; SES.msgT = 1.6; }
}
function initSoundUI() {
  const st = S.settings;
  for (const [id, k] of [['setVol', 'volume'], ['setVolEng', 'volEngine'], ['setVolFx', 'volFx'], ['pVol', 'volume'], ['pVolEng', 'volEngine'], ['pVolFx', 'volFx']]) {
    const el = $(id); if (!el) continue;
    el.addEventListener('input', () => { st[k] = +el.value; if (st.muted && st[k] > 0) st.muted = false; saveSettings(); applySound(); });
  }
  $('setMute').addEventListener('change', (e) => { st.muted = e.target.checked; saveSettings(); applySound(); });
  for (const b of document.querySelectorAll('.snd-toggle')) b.addEventListener('click', (e) => { e.currentTarget.blur(); if (audio) audio.init(); toggleMute(); });
  applySound();
}

// ---------------------------------------------------------------------------
//  Session options (per mode)
// ---------------------------------------------------------------------------
function openSessionOptions() {
  if (S.game.mode === 'multi') return openLobby();
  $('sessTitle').textContent = MODES[S.game.mode];
  renderSessionFields();
  $('session').hidden = false;
}
function renderSessionFields() {
  const g = S.game, box = $('sessFields'); box.innerHTML = '';
  const field = (label, build, hint) => { const f = document.createElement('div'); f.className = 'field'; const l = document.createElement('span'); l.className = 'lbl'; l.textContent = label; f.appendChild(l); build(f, l); if (hint) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = hint; f.appendChild(h); } box.appendChild(f); };
  const seg = (label, map, key, hint, rerender) => field(label, (f) => { const d = document.createElement('div'); d.className = 'seg'; segButtons(d, map, g[key], (k) => { g[key] = k === 'true' ? true : k === 'false' ? false : isNaN(+k) ? k : +k; saveGame(); renderStartHint(); if (rerender) renderSessionFields(); }); f.appendChild(d); }, hint);
  const range = (label, key, min, max, fmt) => field(label, (f, l) => { const b = document.createElement('b'); b.textContent = fmt(g[key]); l.appendChild(b); const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = 1; r.value = g[key]; r.setAttribute('aria-label', label); r.addEventListener('input', () => { g[key] = +r.value; b.textContent = fmt(g[key]); saveGame(); renderStartHint(); }); f.appendChild(r); });
  const m = g.mode;
  const cars = carById(S.carId) && carById(S.carId).series ? { mismo: carById(S.carId).series === 'gt3' ? 'Parrilla GT3' : 'Parrilla F1', categoria: 'Misma categoría', variados: 'Variados' } : { mismo: 'Mismo coche', categoria: 'Misma categoría', variados: 'Variados' };
  if (m === 'practica') {
    seg('Salida', { grid: 'Parrilla (salida parada)', pits: 'Desde boxes' }, 'start');
    seg('Neumáticos', { auto: 'Auto', S: 'Blando', M: 'Medio', H: 'Duro', I: 'Intermedio', W: 'Lluvia extrema' }, 'tyre', tyreHint('practice') + '. Se cambian en boxes con T (o desde la pausa).', true);
    seg('Rivales en pista', { false: 'No', true: 'Sí' }, 'rivals', 'Con rivales practicas con tráfico; sin ellos te acompaña el coche fantasma de tu récord.', true);
    if (g.rivals) { range('Número de rivales', 'nRivals', 10, 22, v => v); range('Dificultad', 'diff', 1, 10, v => v + ' · ' + DIFFN(v)); seg('Coches rivales', cars, 'rivalCars'); }
  } else {
    if (m === 'completa') seg('Clasificación', { 5: '5 min', 10: '10 min', 15: '15 min' }, 'qualiMin', 'La clasificación define la parrilla. Puedes terminarla antes desde la pausa.');
    range('Vueltas de carrera', 'laps', 1, 20, v => v);
    range('Número de rivales', 'nRivals', 10, 22, v => v);
    range('Dificultad de la IA', 'diff', 1, 10, v => v + ' · ' + DIFFN(v));
    seg('Coches rivales', cars, 'rivalCars', 'Variados mezcla todas las categorías: habrá mucha diferencia de ritmo.');
    seg('Neumáticos', { auto: 'Auto', S: 'Blando', M: 'Medio', H: 'Duro', I: 'Intermedio', W: 'Lluvia extrema' }, 'tyre', tyreHint('race') + '. Se cambian en boxes con T (o desde la pausa).', true);
    if (m === 'rapida') seg('Posición de salida', { pole: 'Pole', medio: 'Media', ultimo: 'Última', aleatoria: 'Aleatoria' }, 'gridPos');
    seg('Salida', { grid: 'Parrilla', pits: 'Desde boxes' }, 'start', 'Desde boxes sales cuando pasa todo el pelotón (semáforo verde a la salida del pit lane).');
  }
}
function startFromMenu() {
  const m = S.game.mode;
  if (m === 'multi') return lobbyPrimary();
  if (m === 'practica') return startSession('practice');
  SES_FIELD = makeField(S.game.nRivals);
  return startSession(m === 'rapida' ? 'race' : 'quali');
}

// ---------------------------------------------------------------------------
//  Settings
// ---------------------------------------------------------------------------
function initSettings() {
  const st = S.settings;
  const save = () => store.set('settings', st);
  segButtons($('setQuality'), QUAL, st.quality, (k) => { st.quality = k; save(); applyQuality(true); });
  segButtons($('setDraw'), DRAW, st.draw, (k) => { st.draw = k; save(); applyWeather(); });
  segButtons($('setFpsCap'), { 30: '30', 60: '60', no: 'Sin límite' }, st.fpsCap, (k) => { st.fpsCap = k; save(); });
  segButtons($('setDamage'), { off: 'Desactivado', low: 'Reducido', real: 'Realista' }, st.damage, (k) => { st.damage = k; save(); syncEnv(); });
  segButtons($('setTyres'), { off: 'Desactivado', normal: 'Normal', fast: 'Acelerado ×2.5' }, st.tyres, (k) => { st.tyres = k; save(); syncEnv(); renderStartHint(); });
  segButtons($('setLineMode'), LINE_MODES, st.lineMode, (k) => setLineMode(k, false));
  $('setLineForget').addEventListener('click', () => {
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('spa_rec_coach_')) localStorage.removeItem(k); } catch (e) { }
    if (COACH_ST) { COACH_ST.key = null; refreshIdeal(); }
    $('setLineForget').textContent = 'Olvidado';
  });
  segButtons($('setUnits'), { kmh: 'km/h', mph: 'mph' }, st.units, (k) => { st.units = k; save(); renderSpec(); });
  const chk = { setFps: 'fps', setAbs: 'abs', setTc: 'tc', setEsc: 'esc', setAuto: 'autoShift', setSteer: 'steerAssist', setMap: 'minimap', setGhost: 'ghost' };
  for (const [id, k] of Object.entries(chk)) {
    const el = $(id); el.checked = !!st[k];
    el.addEventListener('change', () => { st[k] = el.checked; save(); syncEnv(); if (k === 'fps') $('fps').hidden = !st.fps; if (k === 'minimap') $('minimap').hidden = !st.minimap; });
  }
  const rng = (id, k, lbl, fmt) => { const el = $(id); el.value = st[k]; $(lbl).textContent = fmt(st[k]); el.addEventListener('input', () => { st[k] = +el.value; $(lbl).textContent = fmt(st[k]); save(); if (k === 'fov') camera.fov = st.fov; if (k === 'volume' && audio) audio.setVolume(st.volume); }); };
  rng('setFov', 'fov', 'fovVal', v => v + '°');
  rng('setSens', 'steerSens', 'sensVal', v => (+v).toFixed(2));
  initSoundUI();
  $('setClose').addEventListener('click', () => { $('settings').hidden = true; });
  $('setReset').addEventListener('click', () => { $('resetConfirm').hidden = false; });
  $('resetNo').addEventListener('click', () => { $('resetConfirm').hidden = true; });
  $('resetYes').addEventListener('click', () => {
    for (const k of Object.keys(S.times)) store.del('best_' + k);
    S.times = {}; store.set('times', {}); $('resetConfirm').hidden = true;
    renderGarage(); renderSpec(); if (SES) { SES.best = null; }
  });
  $('fps').hidden = !st.fps; $('minimap').hidden = !st.minimap;
  syncEnv();
}
function openSettings() { $('settings').hidden = false; }

// ---------------------------------------------------------------------------
//  Input
// ---------------------------------------------------------------------------
const KEYS = {}, TOUCH = {};
const INPUT = { steer: 0, throttle: 0, brake: 0, handbrake: false, shiftUp: false, shiftDown: false };
let padPrev = [];
const typing = () => { const a = document.activeElement; return a && ((a.tagName === 'INPUT' && a.type !== 'range' && a.type !== 'checkbox') || a.tagName === 'TEXTAREA'); };
window.addEventListener('keydown', (e) => {
  if (typing()) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && S.mode === 'race') e.preventDefault();
  if (e.repeat) { KEYS[e.code] = true; return; }
  KEYS[e.code] = true;
  if (S.mode === 'race') {
    if (e.code === 'KeyC') cycleCam();
    if (e.code === 'KeyR') resetCar();
    if (e.code === 'Backspace') { e.preventDefault(); rewind(); }
    if (e.code === 'KeyT') tyreRequestCycle();
    if (e.code === 'KeyL') { const ks = Object.keys(LINE_MODES); setLineMode(ks[(ks.indexOf(S.settings.lineMode) + 1) % ks.length], true); }
    if (e.code === 'KeyE' || e.code === 'ShiftRight') INPUT.shiftUp = true;
    if (e.code === 'KeyQ' || e.code === 'ControlRight') INPUT.shiftDown = true;
    if (e.code === 'Escape' || e.code === 'KeyP') pause();
  } else if (S.mode === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) resume();
  if (e.code === 'KeyM') toggleMute();
  else if (S.mode === 'menu') {
    const overlay = !$('settings').hidden || !$('controls').hidden || !$('session').hidden;
    if (!overlay) { if (e.code === 'ArrowRight') stepCar(1); if (e.code === 'ArrowLeft') stepCar(-1); }
    if (e.code === 'Enter' && !overlay && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) startFromMenu();
    if (e.code === 'Escape') { $('settings').hidden = true; $('controls').hidden = true; $('session').hidden = true; }
  }
});
window.addEventListener('keyup', (e) => { KEYS[e.code] = false; });
window.addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; if (S.mode === 'race' && !(SES && SES.mode === 'multi')) pause(); });

let AUTO = null; // test hook: the AI drives the player's car
function readInput(dt) {
  if (AUTO && SES && SES.player) {
    const pe = SES.player;
    if (!pe.autoAI) { pe.autoAI = new AIDriver(car, T, LINE, { diff: AUTO.k, react: 0.2 }); pe.autoAI.setEnv(env, car.spec.id); if (SES.state === 'run') pe.autoAI.startRolling(); }
    pe.autoAI.env = env;   // steer through the player's own assists (slip-capped steering), or the AI's mapping under-steers
    const r = pe.autoAI.drive(dt, SES.entries, pe, { hold: SES.state === 'lights', caution: SES.kind === 'race' && SES.t - SES.goT < 25 ? 1 : 0 });
    INPUT.steer = r.steer; INPUT.throttle = r.throttle; INPUT.brake = r.brake; INPUT.handbrake = false;
    return;
  }
  const st = S.settings;
  let left = KEYS.KeyA || KEYS.ArrowLeft || TOUCH.left, right = KEYS.KeyD || KEYS.ArrowRight || TOUCH.right;
  let thr = (KEYS.KeyW || KEYS.ArrowUp || TOUCH.throttle) ? 1 : 0, brk = (KEYS.KeyS || KEYS.ArrowDown || TOUCH.brake) ? 1 : 0;
  let analog = null, padThr = 0, padBrk = 0;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads && [...pads].find(p => p && p.connected);
  S.lookBack = !!KEYS.KeyB;
  if (pad) {
    const ax = pad.axes[0] || 0;
    if (Math.abs(ax) > 0.08) analog = -Math.sign(ax) * Math.pow((Math.abs(ax) - 0.08) / 0.92, 1.35);
    padThr = pad.buttons[7] ? pad.buttons[7].value : 0; padBrk = pad.buttons[6] ? pad.buttons[6].value : 0;
    const btn = (i) => pad.buttons[i] && pad.buttons[i].pressed;
    const edge = (i) => btn(i) && !padPrev[i];
    if (edge(3)) cycleCam(); if (edge(2)) resetCar(); if (edge(5)) INPUT.shiftUp = true; if (edge(4)) INPUT.shiftDown = true; if (edge(9)) pause();
    if (btn(1)) S.lookBack = true;
    INPUT.handbrake = btn(0);
    padPrev = pad.buttons.map(b => b.pressed);
    // rumble while riding a kerb
    const kr = car.kerbA || 0, now = performance.now();
    if (pad.vibrationActuator && kr > 0.05 && now - (S.rumbleT || 0) > 90) {
      S.rumbleT = now;
      try { pad.vibrationActuator.playEffect('dual-rumble', { duration: 100, weakMagnitude: Math.min(0.8, 0.25 + 0.5 * kr), strongMagnitude: Math.min(0.6, 0.12 + 0.4 * kr) }).catch(() => { }); } catch (e) { }
    }
  } else INPUT.handbrake = false;
  // phones: short buzzes while on a kerb (where the browser allows it)
  if (S.touch && (car.kerbA || 0) > 0.12 && navigator.vibrate) { const nw = performance.now(); if (nw - (S.vibT || 0) > 110) { S.vibT = nw; try { navigator.vibrate(Math.round(10 + 14 * car.kerbA)); } catch (e) { } } }
  if (KEYS.Space) INPUT.handbrake = true;
  const target = analog != null ? analog : (left ? 1 : 0) - (right ? 1 : 0);
  if (analog != null) INPUT.steer += (target - INPUT.steer) * Math.min(1, dt * 18);
  else {
    const spd = Math.abs(car.u);
    const rate = (target === 0 ? 7 : (Math.sign(target) !== Math.sign(INPUT.steer) && INPUT.steer !== 0 ? 8.5 : 3.6 + 3.0 / (1 + spd / 15))) * st.steerSens;
    INPUT.steer += clamp(target - INPUT.steer, -rate * dt, rate * dt);
  }
  const tT = Math.max(thr, padThr), bT = Math.max(brk, padBrk);
  INPUT.throttle += clamp(tT - INPUT.throttle, -dt * 10, dt * (padThr > 0 ? 50 : 5));
  INPUT.brake += clamp(bT - INPUT.brake, -dt * 12, dt * (padBrk > 0 ? 50 : 7));
}

// ---------------------------------------------------------------------------
//  AI field (roster shared between qualifying and the race)
// ---------------------------------------------------------------------------
let SES = null, SES_FIELD = null;
let RSEED2 = (Date.now() % 100000) + 7;
const rnd = () => { RSEED2 = (RSEED2 * 16807) % 2147483647; return (RSEED2 - 1) / 2147483646; };
const LIV_COLS = ['#f4f4f4', '#c8120c', '#e3342c', '#f28c28', '#f6c21c', '#1f9a3a', '#0f5c4a', '#6fc3df', '#2f63b8', '#1b3a6b', '#5b1a8f', '#2a2d31', '#0e0f11', '#9aa0a6', '#c9a24a', '#e84393', '#00a8a8'];
function makeField(n) {
  const player = carById(S.carId), g = S.game;
  // modern F1 (W11, RB22, MCL39): 'same car' / 'same category' race the whole F1 grid, teams dealt round-robin so every team is on track
  const series = player.series ? CARS.filter(c => c.series === player.series) : null;
  let pool = g.rivalCars === 'mismo' ? (series || [player]) : g.rivalCars === 'categoria' ? (series || CARS.filter(c => c.cat === player.cat)) : CARS;
  const deal = series && g.rivalCars !== 'variados' ? (() => { const o = pool.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; })() : null;
  if (!pool.length) pool = [player];
  const names = AI_NAMES.slice(); for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const field = [];
  for (let k = 0; k < n; k++) {
    const sp = deal ? deal[k % deal.length] : pool[Math.floor(rnd() * pool.length)];
    const special = ['f1', 'f1h', 'indy', 'lmp', 'fe'].includes(sp.body) || !!sp.model || !!sp.glb;   // scanned bodies only recolour their paint: no stripes
    let col = LIV_COLS[Math.floor(rnd() * LIV_COLS.length)], col2 = LIV_COLS[Math.floor(rnd() * LIV_COLS.length)];
    if (col2 === col) col2 = col === '#0e0f11' ? '#f4f4f4' : '#0e0f11';
    if (sp.series === 'f1mod') { col = sp.col; col2 = sp.col2; }   // F1 teams keep their livery on the grid
    const liv = { col, col2, col3: sp.col3, pattern: special ? 'solido' : ['solido', 'solido', 'franjas', 'dos', 'banda'][Math.floor(rnd() * 5)], finish: rnd() < 0.2 ? 'metal' : rnd() < 0.1 ? 'mate' : 'brillo', rim: ['plata', 'negro', 'negro', 'oro', 'bronce'][Math.floor(rnd() * 5)] };
    field.push({ id: 'ai' + k, name: names[k % names.length][0], code: names[k % names.length][1], sp, liv, diff: g.diff, spread: (rnd() - 0.5) * 0.024 });
  }
  return field;
}

// ---------------------------------------------------------------------------
//  Sessions
// ---------------------------------------------------------------------------
const CAMS = ['chase', 'onboard', 'cockpit'];
function camName(c) {
  const sp = carById(S.carId), open = ['f1', 'f1h', 'indy', 'fe'].includes(sp.body);
  if (c === 'chase') return 'Cámara: 3.ª persona';
  if (c === 'onboard') return open ? 'Cámara: onboard (T-cam)' : 'Cámara: onboard (' + ((model && model.cams && model.cams.onLabel) || 'techo') + ')';
  return 'Cámara: 1.ª persona (cabina)';
}
const pitExitS = () => T.pitSepTo * T.ds + 40;
function newEntry(o) {
  return Object.assign({ s: 0, d: 0, u: 0, i: 0, x: 0, z: 0, vx: 0, vz: 0, len: 4.6, wid: 1.9, ghost: 0, lap: 0, cp: false, prevS: 0, started: false, lapStart: 0, lapValid: true, best: null, last: null, nLaps: 0, fin: false, finT: null, finLaps: 0, progress: 0, lastBucket: -1, bucketT: 0, respawns: 0 }, o);
}
function disposeEntries() {
  if (!SES) return;
  for (const e of SES.entries) if (!e.isPlayer && e.model) scene.remove(e.model.root);
}
// kind: 'practice' | 'quali' | 'race'
function startSession(kind, opts) {
  if (skids) skids.clear();
  if (T.esc) T.esc.reset();
  if (T.resetBarriers) T.resetBarriers();
  DFX.clear();
  opts = opts || {};
  disposeEntries();
  audio.init(); applySound();
  syncEnv();
  const g = S.game, mode = opts.mode || g.mode;
  DMG.scale = mode === 'multi' ? 0 : (DMG_LEVELS[S.settings.damage] != null ? DMG_LEVELS[S.settings.damage] : 1);
  TYW.scale = mode === 'multi' ? 0 : (TYW_LEVELS[S.settings.tyres] != null ? TYW_LEVELS[S.settings.tyres] : 1);
  wxReset();
  const sp = carById(S.carId);
  car = new Vehicle(sp, T);
  car.ty = newTyres(mode === 'multi' ? autoTyre(kind) : pickTyre(kind), TYW.scale > 0);
  placeModel();
  setTyreMark(model, TYRES[car.ty.c].col);
  const key = recKey(sp.id, isWet());
  let best = store.get('best_' + key, null);
  if (best && best.gv !== 2) best.ghost = null; // ghosts recorded before the timing fix are ignored
  const R = SES = {
    kind, mode, t: 0, goT: 0, state: 'lights', lightsT: 0, outAt: 5 + 0.3 + Math.random() * 1.2,
    lapStart: 0, lapNum: 1, valid: true, clean: true, cp: [false, false], sectorsCur: [], lastSectorT: 0, inPitLap: false,
    trace: new Float32Array(Math.ceil(T.L / 10) + 2).fill(-1), ghostRec: [], ghostNext: 0,
    best, key, sessionBest: null, sessionSec: [null, null, null], laps: [], lastLap: null, prevS: 0, wrongT: 0,
    msgT: 0, hintT: 7, secShowT: 0, lastImpactMsg: -10, bannerT: 0, started: false,
    tyreReq: null, entries: [], player: null, raceLaps: g.laps, bucketT: [], leaderFin: null, resultsShown: false,
    qualiDur: g.qualiMin * 60, flag: false, netSeq: opts.seq || 0, gridOrder: opts.grid || null
  };
  RW.clear();
  const pe = newEntry({ id: 'me', name: 'Tú', code: 'TÚ', isPlayer: true, sp, veh: car, model, len: sp.len, wid: sp.wid });
  R.player = pe; R.entries.push(pe);
  // ---- AI field
  let field = [];
  if (kind === 'practice' && g.rivals) field = makeField(g.nRivals);
  else if (kind !== 'practice' && mode !== 'multi') field = SES_FIELD || (SES_FIELD = makeField(g.nRivals));
  for (const f of field) {
    const v = new Vehicle(f.sp, T);
    v.ty = newTyres(aiTyre(), false);
    const ai = new AIDriver(v, T, LINE, { diff: f.diff, spread: f.spread });
    ai.setEnv(env, f.sp.id);
    const m = buildCar(f.sp, f.liv, { lite: true });
    setTyreMark(m, TYRES[v.ty.c].col);
    m.root.visible = false; scene.add(m.root);
    if (m.blob) m.blob.visible = S.settings.quality === 'bajo';
    R.entries.push(newEntry({ id: f.id, name: f.name, code: f.code, isAI: true, sp: f.sp, liv: f.liv, veh: v, ai, model: m, len: f.sp.len, wid: f.sp.wid, spread: f.spread, diff: f.diff }));
  }
  const ais = R.entries.filter(e => e.isAI);
  // ---- placement
  const boxes = world.pitBoxes, lastBox = boxes[boxes.length - 1];
  const putPit = () => { car.reset(lastBox.s, lastBox.d); };
  if (kind === 'practice') {
    if (g.start === 'pits') { putPit(); R.state = 'run'; }
    else car.reset(GRID_S(), GRID_D);
    ais.forEach((e, k) => rolling(e, (car.q.s + 250 + (T.L - 500) * k / Math.max(1, ais.length)) % T.L));
  } else if (kind === 'quali') {
    putPit(); R.state = 'run';
    ais.forEach((e, k) => rolling(e, (lastBox.s + 450 + (T.L - 900) * k / Math.max(1, ais.length)) % T.L));
  } else {
    let order;
    if (opts.grid) order = opts.grid.map(id => R.entries.find(e => e.id === id)).filter(Boolean);
    else {
      const aiSorted = ais.slice().sort((a, b) => (b.spread - a.spread));
      const n = aiSorted.length;
      let pos = g.gridPos === 'pole' ? 0 : g.gridPos === 'ultimo' ? n : g.gridPos === 'aleatoria' ? Math.floor(Math.random() * (n + 1)) : Math.floor(n / 2);
      order = aiSorted.slice(); order.splice(pos, 0, pe);
    }
    for (const e of R.entries) if (!order.includes(e)) order.push(e);
    if (g.start === 'pits' && mode !== 'multi') { order = order.filter(e => e !== pe); order.push(pe); }
    const slots = world.gridSlots;
    order.forEach((e, k) => { const sl = slots[Math.min(k, slots.length - 1)]; e.veh.reset(sl.s - Math.max(0, k - slots.length + 1) * 8, sl.d); e.grid = k + 1; });
    if (g.start === 'pits' && mode !== 'multi') { putPit(); pe.pitHold = true; }
    R.goT = 1e9;
  }
  for (const e of R.entries) { snapshot(e); e.prevS = e.s; e.progress = kind === 'race' ? e.s : 0; }
  R.prevS = car.q.s;
  if (kind === 'practice' && best && S.settings.ghost && best.ghost && best.ghost.length > 8) makeGhost(sp);
  if (world.pitLightMat) world.pitLightMat.color.setHex(pe.pitHold ? 0xff1a10 : 0x18c040);
  refreshIdeal();
  S.mode = 'race'; CAMSTATE.init = false;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  try { $('gl').focus({ preventScroll: true }); } catch (e) { }
  $('menu').hidden = true; $('hud').hidden = false; $('pause').hidden = true; $('results').hidden = true; $('session').hidden = true;
  $('touch').hidden = !S.touch;
  $('lights').hidden = R.state !== 'lights'; [...$('lights').children].forEach(i => i.classList.remove('on'));
  $('hDelta').hidden = true; $('banner').hidden = true; $('toast').hidden = true; $('hRepair').hidden = true;
  $('hHints').style.opacity = 1;
  for (const id of ['hS1', 'hS2', 'hS3']) { $(id).className = 'sec'; $(id).querySelector('b').textContent = '—'; }
  $('hLast').textContent = '—'; $('hBest').textContent = best ? fmtTime(best.time) : '—';
  $('hCam').textContent = camName(CAMS[S.camIdx]);
  $('pEnd').hidden = kind !== 'quali';
  $('pRestart').hidden = mode === 'multi';
  $('hRewind').hidden = !rwAllowed(); $('hRewind').disabled = true;
  setValidChip();
  for (const m of world.lightMats) m.color.setHex(0x2a0606);
  INPUT.steer = 0; INPUT.throttle = 0; INPUT.brake = 0;
  renderStandings();
  if (kind === 'quali') banner(`<div class="big">Clasificación</div><div class="sub">${g.qualiMin} minutos · sal de boxes y marca tu mejor vuelta</div>`, 3.5);
  else if (kind === 'practice' && R.state === 'run') banner('<div class="big">Práctica</div><div class="sub">Sal de boxes · el crono arranca al cruzar la línea</div>', 3);
  else if (pe.pitHold) toast('Salida desde boxes: espera al semáforo verde', 5);
  if (mode !== 'multi' && wxStart() > 0.12 && R.state === 'run') setTimeout(() => { if (SES === R) toast(S.weather === 'secando' ? 'Pista secándose · vigila el cruce a slicks (T: neumáticos en boxes)' : 'Pista mojada · cuidado con pianos, línea de goma y charcos', 4.5); }, 3600);
}
function rolling(e, s) {
  const i = Math.floor(s / T.ds) % T.N;
  const hdg = Math.atan2(LINE.x[(i + 2) % T.N] - LINE.x[i], LINE.z[(i + 2) % T.N] - LINE.z[i]);
  e.veh.reset(s, LINE.off[i], false, hdg);
  e.veh.u = e.ai.prof[i] * 0.8; e.ai.startRolling();
}
function makeGhost(sp) {
  ghost = buildCar(sp, liveryOf(sp), { lite: true });
  const gm = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.3, depthWrite: false });
  ghost.mat = gm;
  ghost.root.traverse(o => { if (o.isMesh) { o.material = gm; o.castShadow = false; } });
  if (ghost.blob) ghost.blob.visible = false;
  ghost.root.visible = false; scene.add(ghost.root);
}
function snapshot(e) {
  if (e.isRemote) return;
  const V = e.veh, q = V.q;
  e.s = q.s; e.d = q.d; e.u = V.u; e.i = q.i; e.x = V.x; e.z = V.z;
  e.vx = V.u * Math.sin(V.h) + V.v * Math.cos(V.h); e.vz = V.u * Math.cos(V.h) - V.v * Math.sin(V.h);
}
function restartSession() {
  if (!SES) return;
  if (SES.kind === 'race' && SES.gridOrder) startSession('race', { grid: SES.gridOrder });
  else startSession(SES.kind);
}
function leaveSession() {
  if (SES && SES.mode === 'multi') netLeaveRace();
  disposeEntries(); SES = null; enterMenu();
}
// ---------------------------------------------------------------------------
//  Braking line (coach.js): off / fixed colours / adaptive (live colours, learns per corner,
//  saved per track, car and dry/wet)
// ---------------------------------------------------------------------------
let COACH_ST = null;   // { coach, line, key, grip, t }
const coachKey = () => 'coach_' + TRACK.id + '|' + S.carId + '|' + (env.wet ? 'wet' : 'dry');
const coachGrip = () => Math.max(0.3, Math.round(env.grip * (car.ty ? tyreGripEst(car.ty, env.water || 0, env) : 1) / 0.02) * 0.02);
function refreshIdeal() {
  if (!world) return;
  if (S.settings.lineMode === 'off' || S.mode === 'loading' || !SES) { if (COACH_ST) { COACH_ST.line.remove(); COACH_ST = null; } return; }
  const key = coachKey(), grip = coachGrip();
  if (COACH_ST && COACH_ST.key === key && COACH_ST.grip === grip) return;
  const coach = new Coach(T, coachPlan(T, LINE, car.P, grip), store.get(key, {}));
  if (!COACH_ST) COACH_ST = { line: new CoachLine(world), t: 0 };
  Object.assign(COACH_ST, { coach, key, grip });
  COACH_ST.line.build(coach);
}
function setLineMode(k, announce) {
  S.settings.lineMode = k; store.set('settings', S.settings);
  segButtons($('setLineMode'), LINE_MODES, k, (m) => setLineMode(m, false));
  refreshIdeal(); if (k !== 'activa') $('hCoach').hidden = true;
  if (announce && SES) toast('Línea de frenada: ' + LINE_MODES[k], 1.6);
}
// every simulation step: judge the braking zones and keep the plan in step with grip (rain, tyres)
function coachStep(dt) {
  const C = COACH_ST, R = SES, pe = R.player;
  if (!C || S.settings.lineMode !== 'activa') return;
  if ((C.t += dt) > 2) { C.t = 0; if (coachKey() !== C.key || coachGrip() !== C.grip) { refreshIdeal(); return; } }
  if (pe.pitHold || (pe.fin && pe.ai) || car.inPit || R.state === 'lights') { C.coach.obs = null; return; }
  const q = car.q, half = (car.spec.wid || 1.9) / 2, left = q.d >= 0;
  const edge = (left ? q.wl : q.wr) + ((left ? T.kerbL[q.i] : T.kerbR[q.i]) ? 1.3 : 0);
  const hit = (car.impactT > 0.45 && car.lastImpact > 4) || (car.carT > 0.45 && car.lastCar > 3);
  const ev = C.coach.observe(q.i, Math.abs(car.u), INPUT.brake, Math.abs(q.d) > edge + half + 0.05, hit, dt);
  if (!ev) return;
  store.set(C.key, C.coach.state()); C.line.update(C.coach);
  if (ev.msg) { const el = $('hCoach'); el.textContent = ev.msg; el.className = 'coach ' + ev.kind; el.hidden = false; R.coachT = 3.2; }
}
function enterMenu() {
  S.mode = 'menu';
  $('menu').hidden = false; $('hud').hidden = true; $('touch').hidden = true; $('results').hidden = true;
  layoutMenu();
  if (audio) audio.mute();
  const sp = carById(S.carId); car = new Vehicle(sp, T); car.reset(GRID_S(), GRID_D);
  placeModel(); updateModelTransform(0);
  SES = null; refreshIdeal(); $('hCoach').hidden = true;
  S.times = store.get('times', {});
  renderGarage(); renderSpec();
  for (const m of world.lightMats) m.color.setHex(0x2a0606);
  if (world.pitLightMat) world.pitLightMat.color.setHex(0x18c040);
  renderLobby();
}
function pause() { if (S.mode !== 'race') return; S.mode = 'pause'; $('pause').hidden = false; renderPitTyres(); $('pRepair').hidden = !(SES && SES.kind !== 'race' && SES.mode !== 'multi' && DMG.scale > 0 && car.dmg && dmgRepairPlan(car.dmg).length); renderLapTable(); if (audio) audio.mute(); }
function resume() { if (S.mode !== 'pause') return; $('pause').hidden = true; $('settings').hidden = true; S.mode = 'race'; syncEnv(); }
function cycleCam() { S.camIdx = (S.camIdx + 1) % CAMS.length; $('hCam').textContent = camName(CAMS[S.camIdx]); CAMSTATE.init = false; if (SES) { $('hHints').style.opacity = 1; SES.hintT = 4; } }
function resetCar() {
  if (!SES || SES.state === 'lights' || SES.player.pitHold || SES.player.fin) return;
  if (DMG.scale > 0 && car.dmg && car.dmg.dead) { // wrecked: the tow truck takes it to the pit box, the crew repairs it there
    const bx = world.pitBoxes[world.pitBoxes.length - 1], keep = car.dmg, kty = car.ty; car.reset(bx.s, bx.d, false); car.dmg = keep; car.ty = kty;
    SES.player.ghost = 2.5; SES.valid = false; setValidChip(); toast('Remolcado a boxes · los mecánicos reparan el coche', 4); return;
  }
  const s = car.q.s, i = Math.round(s / T.ds) % T.N;
  car.reset(s, clamp(LINE.off[i], -T.wr[i] + 1.5, T.wl[i] - 1.5), true);
  SES.player.ghost = 2.5;
  SES.valid = false; setValidChip(); toast('Coche reiniciado · vuelta invalidada');
}
// ---------------------------------------------------------------------------
//  Rewind (practice only: never in a race, qualifying or online). Backspace or the ⟲ button goes back
//  REWIND.step s (up to REWIND.keep s, press again to go further); the car, its damage and tyres and the lap
//  clock come back exactly, then everything holds still for REWIND.hold s. The lap becomes invalid, so it
//  never sets a record; the adaptive braking line drops the pass that was cut short and judges the retry.
// ---------------------------------------------------------------------------
const RW = new Rewind();
const rwAllowed = () => !!SES && SES.kind === 'practice' && SES.mode !== 'multi';
const _rwX = { cp: [false, false], sectorsCur: [] };
function rwLapState() {   // the lap clock, relative to the lap start (the session clock keeps running for the rivals)
  const R = SES, pe = R.player, x = _rwX;
  x.started = R.started; x.lapT = R.t - R.lapStart; x.valid = R.valid; x.clean = R.clean; x.inPitLap = R.inPitLap; x.lap1 = !!R.lap1;
  x.cp = R.cp; x.sectorsCur = R.sectorsCur; x.lastSectorT = R.lastSectorT; x.prevS = R.prevS; x.escMin = R.escMin;
  x.blockHitsSeen = R.blockHitsSeen; x.ghostLen = R.ghostRec.length; x.ghostNext = R.ghostNext;
  x.peLap = pe.lap; x.peCp = pe.cp; x.pePrevS = pe.prevS;
  return x;
}
function rewind() {
  const R = SES; if (!rwAllowed() || R.state !== 'run' || R.player.pitHold || R.rep) return;
  const b = RW.back(REWIND.step); if (!b) { toast('Aún no hay nada que rebobinar', 1.6); return; }
  const sn = b.sn, x = sn.x, pe = R.player, D0 = car.dmg;
  const dmgSig = (D) => D ? D.total + D.fw + D.rw + D.floor + D.lost.join() + D.tyre.join() + D.sus.join() + D.dead : '';
  const dmgChanged = dmgSig(D0) !== dmgSig(sn.v.dmg);
  RW.restore(car, sn);
  if (car.dmg) { car.dmg.ev = dmgChanged ? [{ type: 'repairAll', idx: -1, a: 0, b: 0, nF: 0, nL: 0, x: 0 }] : []; car.dmg.hits = []; }   // the bodywork shows the restored state, without new sparks
  // lap clock: the lap time goes back with the car; buckets and ghost samples after that moment are dropped
  R.started = x.started; R.lapStart = R.t - x.lapT; R.clean = x.clean; R.inPitLap = x.inPitLap; R.lap1 = x.lap1;
  R.cp = x.cp.slice(); R.sectorsCur = x.sectorsCur.slice(); R.lastSectorT = x.lastSectorT; R.prevS = x.prevS;
  R.escMin = x.escMin; R.blockHitsSeen = x.blockHitsSeen; R.wrongT = 0;
  for (let k = 0; k < R.trace.length; k++) if (R.trace[k] > x.lapT) R.trace[k] = -1;
  R.ghostRec.length = Math.min(R.ghostRec.length, x.ghostLen); R.ghostNext = x.ghostNext;
  for (let k = R.sectorsCur.length; k < 3; k++) { const el = $(['hS1', 'hS2', 'hS3'][k]); el.className = 'sec'; el.querySelector('b').textContent = '—'; }
  pe.lap = x.peLap; pe.cp = x.peCp; pe.prevS = x.pePrevS; snapshot(pe);
  _prev.x = car.x; _prev.y = car.y; _prev.z = car.z; _prev.h = car.h;
  pe.ghost = REWIND.hold + 1.5;   // rivals kept driving: no contact with them right after landing
  if (R.started && !R.lap1) { R.valid = false; R.rewound = true; }
  setValidChip();
  R.rwHold = REWIND.hold; R.rwN = (R.rwN || 0) + 1;
  CAMSTATE.init = false; $('toast').hidden = true; R.msgT = 0;   // messages about what was undone go away
  const C = COACH_ST;
  if (C && S.settings.lineMode === 'activa') {
    const ev = C.coach.rewound();
    if (ev) { store.set(C.key, C.coach.state()); C.line.update(C.coach); if (ev.msg) { const el = $('hCoach'); el.textContent = ev.msg; el.className = 'coach ' + ev.kind; el.hidden = false; R.coachT = 3.2; } }
  }
  banner(`<div class="big">⟲ −${b.sec.toFixed(0)} s</div><div class="sub">${R.started && !R.lap1 ? 'Vuelta rebobinada · no cuenta como récord' : 'Rebobinado'}</div>`, REWIND.hold + 0.3);
}
function toast(msg, t) { const el = $('toast'); el.textContent = msg; el.hidden = false; if (SES) SES.msgT = t || 2.6; }
function setValidChip() {
  const el = $('hValid'); if (!SES) return;
  if (SES.kind === 'race' && SES.lap1) { el.className = 'chip warn'; el.textContent = 'Salida'; return; }
  if (!SES.valid) { el.className = 'chip bad'; el.textContent = SES.inPitLap ? 'Boxes' : SES.rewound ? 'Rebobinada' : 'Inválida'; }
  else if (!SES.clean) { el.className = 'chip warn'; el.textContent = 'Con contacto'; }
  else { el.className = 'chip ok'; el.textContent = 'Válida'; }
}
function banner(html, t) { const el = $('banner'); el.innerHTML = html; el.hidden = false; if (SES) SES.bannerT = t || 3; }

// ---------------------------------------------------------------------------
//  Simulation step (fixed 240 Hz)
// ---------------------------------------------------------------------------
const SECT = () => T.sectors.map(s => s * T.L / T.nom);
const _prev = { x: 0, y: 0, z: 0, h: 0 };
function sessionStep(dt) {
  const R = SES, pe = R.player, race = R.kind === 'race';
  if (R.rwHold > 0) { R.rwHold -= dt; return; }   // just rewound: everything holds still for a moment
  R.t += dt;
  if (R.state !== 'lights' && R.mode !== 'multi') {
    wxStep(dt);
    R.aiRef = (R.aiRef || 0) - dt;
    if (R.aiRef <= 0) { R.aiRef = 1.5; for (const e of R.entries) if (e.isAI) e.ai.refresh(env); }
  }
  // ---- start lights (player standing start; in a race the whole field waits)
  if (R.state === 'lights') {
    R.lightsT += dt;
    if (R.mode === 'multi') R.lightsT = NET.startPerf ? 5 - (NET.startPerf - performance.now()) / 1000 : 0;
    const n = clamp(Math.floor(R.lightsT), 0, 5);
    const lamps = $('lights').children;
    for (let i = 0; i < 5; i++) { lamps[i].classList.toggle('on', i < n); world.lightMats[i].color.setHex(i < n ? 0xff1a10 : 0x2a0606); }
    car.rpm = lerp(car.rpm, car.P.red * (0.15 + 0.55 * INPUT.throttle), clamp(dt * 6, 0, 1));
    const out = R.mode === 'multi' ? (NET.startPerf > 0 && performance.now() >= NET.startPerf) : R.lightsT >= R.outAt;
    if (out) {
      R.state = 'run'; R.goT = R.t; R.lapStart = R.t; R.prevS = car.q.s;
      if (race) { R.started = true; R.lap1 = true; R.trace.fill(-1); R.ghostRec = []; R.ghostNext = 0; setValidChip(); }
      for (let i = 0; i < 5; i++) { lamps[i].classList.remove('on'); world.lightMats[i].color.setHex(0x2a0606); }
      $('lights').hidden = true;
      banner(race ? '<div class="big go">¡Ya!</div>' : '<div class="big go">¡Ya!</div><div class="sub">El crono arranca al cruzar la línea</div>', 1.6);
    } else {
      if (!race) { stepAI(dt); collisions(); for (const e of R.entries) if (e.isAI) trackProgress(e, dt); }
      else for (const e of R.entries) if (e.isAI) { // the grid revs while the lights count down
        const inp = e.ai.drive(dt, R.entries, e, { hold: true, lightsT: R.lightsT });
        e.veh.rpm = lerp(e.veh.rpm, e.veh.P.red * (0.13 + 0.72 * inp.throttle), clamp(dt * 4, 0, 1));
      }
      return;
    }
  }
  // ---- cars
  _prev.x = car.x; _prev.y = car.y; _prev.z = car.z; _prev.h = car.h;
  if (pe.pitHold) {
    car.rpm = lerp(car.rpm, car.P.red * (0.15 + 0.5 * INPUT.throttle), clamp(dt * 6, 0, 1));
    const others = R.entries.filter(e => !e.isPlayer && !e.left);
    if ((others.length && others.every(e => e.progress > pitExitS())) || R.t - R.goT > 30) { pe.pitHold = false; world.pitLightMat.color.setHex(0x18c040); toast('¡Semáforo verde! Sal de boxes', 2.5); }
  } else if (pe.fin && pe.ai) {
    const inp = pe.ai.drive(dt, R.entries, pe, { hold: false }); car.step(dt, inp, pe.ai.env);
  } else car.step(dt, INPUT, env);
  INPUT.shiftUp = false; INPUT.shiftDown = false;
  snapshot(pe);
  stepAI(dt);
  if (pe.ghost > 0) pe.ghost -= dt;
  collisions();
  for (const e of R.entries) trackProgress(e, dt);
  playerTiming(dt);
  coachStep(dt);
  pitRepair(dt);
  if (R.kind === 'practice' && R.mode !== 'multi' && R.state === 'run' && !pe.pitHold && !R.rep) RW.tick(dt, car, rwLapState);
  if (R.mode === 'multi') netTick();
  // ---- session end conditions
  if (R.kind === 'quali' && !R.flag && R.t >= R.qualiDur) {
    R.flag = true;
    if (R.started && !car.inPit && R.valid) toast('Bandera a cuadros · termina tu vuelta', 4);
    else endQuali();
  }
  if (race && pe.fin && !R.resultsShown && R.t - R.goT - pe.finT > 3) { R.resultsShown = true; showRaceResults(); }
}
function stepAI(dt) {
  const R = SES, race = R.kind === 'race';
  const ctrl = { hold: race && R.state === 'lights', caution: race && R.t - R.goT < 25 ? 1 : 0 };
  for (const e of R.entries) {
    if (!e.isAI) continue;
    const inp = e.ai.drive(dt, R.entries, e, ctrl);
    e.veh.step(dt, inp, e.ai.env);
    if (e.ghost > 0) e.ghost -= dt;
    if (e.ai.needReset) respawnAI(e);
    // street circuit (Monaco): a wreck between the walls is craned off after a few seconds instead of blocking the lane
    if (T.def.crane && !e.craned && e.veh.dmg && e.veh.dmg.dead && (e.deadT = (e.deadT || 0) + dt) > 5) { e.craned = true; e.ghost = Infinity; }
    snapshot(e);
  }
}
function respawnAI(e) {
  const V = e.veh, s = V.q.s, i = Math.round(s / T.ds) % T.N;
  const hdg = Math.atan2(LINE.x[(i + 2) % T.N] - LINE.x[i], LINE.z[(i + 2) % T.N] - LINE.z[i]);
  V.reset(s, LINE.off[i], true, hdg); V.u = Math.min(14, e.ai.prof[i] * 0.5);
  e.ai.stuckT = 0; e.ai.wrongT = 0; e.ai.needReset = false; e.ai.startRolling(); e.ghost = 3; e.lapValid = false; e.respawns++;
}
function collisions() {
  const E = SES.entries, n = E.length;
  for (let a = 0; a < n; a++) {
    const A = E[a]; if (A.ghost > 0 || A.isRemote || (A.isPlayer && A.pitHold)) continue;
    for (let b = a + 1; b < n; b++) {
      const B = E[b]; if (B.ghost > 0 || (B.isPlayer && B.pitHold)) continue;
      const dx = A.x - B.x, dz = A.z - B.z; if (dx * dx + dz * dz > 64) continue;
      if (B.isRemote) { if (A.isPlayer && B.kin && SES.netCol !== false) collideCars(A.veh, B.kin); continue; }   // collisions off: ghosts
      collideCars(A.veh, B.veh);
    }
  }
}
// laps / progress for every local car
function trackProgress(e, dt) {
  const R = SES, L = T.L, s = e.s;
  if (e.isRemote) return;
  if (e.isPlayer && e.pitHold) { e.prevS = s; e.progress = -1; return; }
  if (s > L * 0.45 && s < L * 0.6) e.cp = true;
  const crossed = e.prevS > L - 150 && s < 150 && e.cp;
  if (e.prevS < 150 && s > L - 150 && e.lap > 0 && !e.cp) { e.lap--; e.cp = true; }
  if (crossed) {
    const frac = (L - e.prevS) / Math.max(1e-6, s + L - e.prevS), crossT = R.t - dt + dt * frac;
    e.cp = false; e.lap++;
    if (e.started && !e.isPlayer) {
      const lt = crossT - e.lapStart; e.nLaps++; e.last = lt;
      if (e.lapValid && (R.kind !== 'quali' || e.lapStart < R.qualiDur) && (e.best == null || lt < e.best)) e.best = lt;
    }
    e.started = true; e.lapStart = crossT; e.lapValid = true;
    if (R.kind === 'race' && !e.fin && (e.lap >= R.raceLaps || R.leaderFin != null)) {
      e.fin = true; e.finT = crossT - R.goT; e.finLaps = e.lap;
      if (R.leaderFin == null) R.leaderFin = crossT;
      if (e.isPlayer) onPlayerFinish();
    }
  }
  e.prevS = s;
  if (R.kind === 'race') {
    e.progress = e.lap * L + s;
    const bk = Math.floor(e.progress / 50);
    if (bk > e.lastBucket) { for (let b = Math.max(0, e.lastBucket + 1); b <= bk; b++) if (R.bucketT[b] == null) R.bucketT[b] = R.t; e.lastBucket = bk; e.bucketT = R.t; }
  }
}
function playerTiming(dt) {
  const R = SES, pe = R.player, L = T.L;
  if (pe.pitHold) { R.prevS = car.q.s; return; }
  const s = car.q.s, prev = R.prevS;
  const wrapped = prev > L - 150 && s < 150;
  const inBand = car.inBand(car.q, car.q.d) && T.pitSide * car.q.d > (T.pitSide > 0 ? car.q.wl : car.q.wr);
  if (!R.started) {
    if (wrapped && !inBand) {
      const frac = (L - prev) / Math.max(1e-6, (s + L - prev));
      R.started = true; R.lapStart = R.t - dt + dt * frac;
      R.trace.fill(-1); R.trace[0] = 0; R.ghostRec = []; R.ghostNext = 0; R.cp = [false, false];
      R.valid = true; R.clean = true; R.inPitLap = false; R.rewound = false; setValidChip();
    }
    R.prevS = s;
    return;
  }
  const lapT = R.t - R.lapStart;
  // trace (10 m buckets) and ghost (exact 0.1 s samples interpolated inside the step)
  const b = Math.floor(s / 10);
  if (Math.abs(s - prev) < 100 && s > prev) { for (let k = Math.floor(prev / 10) + 1; k <= b; k++) if (k >= 0 && k < R.trace.length && R.trace[k] < 0) R.trace[k] = lapT; }
  const lt0 = lapT - dt;
  while (R.ghostNext <= lapT + 1e-9) {
    const f = clamp((R.ghostNext - lt0) / dt, 0, 1);
    R.ghostRec.push(Math.round(lerp(_prev.x, car.x, f) * 100) / 100, Math.round(lerp(_prev.y, car.y, f) * 100) / 100, Math.round(lerp(_prev.z, car.z, f) * 100) / 100, Math.round((_prev.h + wrapAng(car.h - _prev.h) * f) * 1000) / 1000);
    R.ghostNext = Math.round((R.ghostNext + 0.1) * 10) / 10;
  }
  if (s > L * 0.3 && s < L * 0.45) R.cp[0] = true;
  if (s > L * 0.65 && s < L * 0.8 && R.cp[0]) R.cp[1] = true;
  const sb = SECT();
  for (let k = 0; k < 2; k++) {
    if (R.sectorsCur.length === k && prev < sb[k] && s >= sb[k] && s - prev < 50) {
      const st = lapT - R.lastSectorT; R.sectorsCur.push(st); R.lastSectorT = lapT; showSector(k, st);
    }
  }
  // pit lane: the lap does not count
  if (inBand && !R.inPitLap) { R.inPitLap = true; if (R.valid) { R.valid = false; setValidChip(); } { const P = pitPlanNow(); toast('Entrada a boxes · limitador 80 km/h' + (P.jobs.length ? ' · parada prevista ' + fmtStop(P.tot) : ''), 2.6); } }
  // track limits: kerbs count as track; only a car completely beyond them is out
  const half = (car.spec.wid || 1.9) / 2;
  const i = car.q.i, left = car.q.d >= 0;
  const edge = (left ? car.q.wl : car.q.wr) + ((left ? T.kerbL[i] : T.kerbR[i]) ? 1.3 : 0);
  { const inEsc = T.inEscape && !T.esc.pit && Math.abs(car.q.d) > Math.max(car.q.wl, car.q.wr) + 1 && T.inEscape(car.x, car.z);
    if (inEsc) R.escMin = Math.min(R.escMin == null ? 1e9 : R.escMin, Math.abs(car.u));
    else if (R.escMin != null) { if (R.escMin > 70 / 3.6 && R.valid && !R.lap1) { R.valid = false; setValidChip(); toast('Atajo por la escapatoria sin frenar · vuelta invalidada'); } R.escMin = null; } }
  if (car.blockHits && car.blockHits !== R.blockHitsSeen) { R.blockHitsSeen = car.blockHits; if (R.valid && !R.lap1) { R.valid = false; setValidChip(); toast('Derribaste los bloques de la escapatoria · vuelta invalidada'); } }
  if (!inBand && !R.lap1 && Math.abs(car.q.d) > edge + half + 0.05 && Math.abs(car.u) > 3 && R.valid && !(T.inEscape && T.inEscape(car.x, car.z))) { R.valid = false; setValidChip(); toast('Límites de pista · vuelta invalidada'); }
  if (car.impactT > 0.45 && car.lastImpact > 4 && R.t - R.lastImpactMsg > 2) { R.lastImpactMsg = R.t; if (R.clean) { R.clean = false; setValidChip(); } toast('Contacto con las barreras'); }
  if (car.carT > 0.45 && car.lastCar > 3 && R.clean) { R.clean = false; setValidChip(); }
  if (car.carT > 0) car.carT -= dt;
  const fwdDot = Math.sin(car.h) * car.q.tx + Math.cos(car.h) * car.q.tz;
  if (fwdDot < -0.3 && Math.abs(car.u) > 4) { R.wrongT += dt; if (R.wrongT > 1.5 && R.msgT <= 0) toast('Vas en dirección contraria', 1.5); } else R.wrongT = 0;
  if (wrapped && R.cp[1]) {
    const frac = (L - prev) / Math.max(1e-6, (s + L - prev));
    const cross = R.t - dt + dt * frac;
    completeLap(cross - R.lapStart, cross);
  }
  R.prevS = s;
}
function showSector(k, t) {
  const R = SES, el = $(['hS1', 'hS2', 'hS3'][k]);
  el.querySelector('b').textContent = fmtSec(t);
  const allBest = R.best && R.best.sectors ? R.best.sectors[k] : null;
  const sesBest = R.sessionSec[k];
  let cls = 'yellow';
  if (!R.valid || R.lap1) cls = '';
  else if (allBest == null || t < allBest) cls = 'purple';
  else if (sesBest == null || t < sesBest) cls = 'green';
  el.className = 'sec ' + cls;
  if (R.valid && !R.lap1 && (sesBest == null || t < sesBest)) R.sessionSec[k] = t;
}
function completeLap(lapTime, crossT) {
  const R = SES, pe = R.player;
  const s3 = lapTime - R.lastSectorT;
  if (R.sectorsCur.length === 2) { R.sectorsCur.push(s3); showSector(2, s3); }
  const sectors = R.sectorsCur.length === 3 ? R.sectorsCur.slice() : null;
  const valid = R.valid && !R.lap1 && !(R.kind === 'quali' && R.lapStart >= R.qualiDur);
  const entry = { n: R.lapNum, time: lapTime, valid, clean: R.clean, sectors, pit: R.inPitLap, first: !!R.lap1, rw: !!R.rewound };
  R.laps.push(entry);
  const prevBest = R.best ? R.best.time : null;
  let isRecord = false;
  if (valid && (prevBest == null || lapTime < prevBest)) {
    isRecord = true;
    const tr = Array.from(R.trace, v => v);
    for (let k = 1; k < tr.length; k++) if (tr[k] < 0) tr[k] = tr[k - 1];
    const rec = { time: lapTime, sectors, trace: tr.map(v => Math.round(v * 1000) / 1000), ghost: R.ghostRec.slice(), gv: 2, date: Date.now() };
    R.best = rec;
    store.set('best_' + R.key, rec);
    S.times[R.key] = lapTime; store.set('times', S.times);
    if (ghost == null && S.settings.ghost && R.kind === 'practice') makeGhost(carById(S.carId));
  }
  if (valid && (R.sessionBest == null || lapTime < R.sessionBest)) { R.sessionBest = lapTime; pe.best = lapTime; }
  pe.last = lapTime; pe.nLaps++;
  R.lastLap = lapTime;
  $('hLast').textContent = fmtTime(lapTime);
  $('hBest').textContent = R.best ? fmtTime(R.best.time) : '—';
  const deltaTxt = prevBest != null ? `<div class="sub">${fmtDelta(lapTime - prevBest)} respecto a tu récord</div>` : '';
  if (!pe.fin) {
    if (isRecord) banner(`<div class="big rec">¡Nuevo récord!</div><div class="time">${fmtTime(lapTime)}</div>${prevBest != null ? `<div class="sub">${fmtDelta(lapTime - prevBest)}</div>` : '<div class="sub">Primera vuelta válida</div>'}`, 4);
    else if (!valid) banner(`<div class="time">${fmtTime(lapTime)}</div><div class="sub">${R.lap1 ? 'Vuelta de salida' : R.inPitLap ? 'Vuelta por boxes' : R.rewound ? 'Vuelta rebobinada · no cuenta como récord' : 'Vuelta inválida'}</div>`, 3);
    else banner(`<div class="time">${fmtTime(lapTime)}</div>${deltaTxt}`, 3);
  }
  R.lapNum++; R.lapStart = crossT; R.valid = true; R.clean = true; R.cp = [false, false]; R.lap1 = false; R.rewound = false;
  RW.clear();   // a rewind never goes back across the line: the lap just closed stays as it was
  R.inPitLap = car.inPit || (car.inBand(car.q, car.q.d) && T.pitSide * car.q.d > (T.pitSide > 0 ? car.q.wl : car.q.wr)); if (R.inPitLap) R.valid = false;
  R.sectorsCur = []; R.lastSectorT = 0; R.trace.fill(-1); R.trace[0] = 0; R.ghostRec = []; R.ghostNext = 0; R.secShowT = 3;
  setValidChip();
  if (R.kind === 'quali' && R.flag && !R.resultsShown) endQuali();
}
function onPlayerFinish() {
  const R = SES, pe = R.player;
  const pos = raceOrder().indexOf(pe) + 1;
  banner(`<div class="big">Bandera a cuadros</div><div class="time">P${pos}</div><div class="sub">${fmtTime(pe.finT)}</div>`, 4);
  pe.ai = new AIDriver(car, T, LINE, { diff: 3, react: 0 }); pe.ai.setEnv(env, car.spec.id); pe.ai.startRolling();
  if (R.mode === 'multi') netFinish(pe.finT);
}
function raceOrder() {
  const L = T.L, key = (e) => e.fin ? e.finLaps * L : e.progress;
  return SES.entries.filter(e => !e.left || e.fin).sort((a, b) => {
    if (a.fin && b.fin) return (b.finLaps - a.finLaps) || (a.finT - b.finT);
    return key(b) - key(a) || (a.fin ? -1 : b.fin ? 1 : 0);
  });
}
function qualiOrder() { return SES.entries.slice().sort((a, b) => (a.best ?? 1e9) - (b.best ?? 1e9)); }
function endQuali() {
  const R = SES; if (!R || R.resultsShown) return;
  R.resultsShown = true;
  for (const e of R.entries) if (e.isAI && e.best == null) { const p = e.ai.profObj; e.best = p.time / e.ai.k * (1.035 + Math.random() * 0.02); e.est = true; }
  const ord = qualiOrder();
  R.gridOrder = ord.map(e => e.id);
  const pole = ord[0].best;
  $('resEyebrow').textContent = 'Clasificación · ' + WEATHER[S.weather].name;
  $('resTitle').textContent = 'Parrilla de salida';
  const pp = ord.indexOf(R.player) + 1;
  $('resSub').textContent = R.player.best != null ? `Sales desde la posición ${pp} de ${ord.length}.` : 'No marcaste vuelta válida: sales desde el final de la parrilla.';
  $('resHead').innerHTML = '<tr><th>Pos</th><th>Piloto</th><th>Coche</th><th>Mejor vuelta</th><th>Dif.</th></tr>';
  $('resRows').innerHTML = ord.map((e, k) => `<tr class="${e.isPlayer ? 'me' : ''}"><td>${k + 1}</td><td>${esc(e.isPlayer ? 'Tú' : e.name)}</td><td>${esc(e.sp.name)}</td><td>${e.best != null ? fmtTime(e.best) : 'Sin tiempo'}</td><td>${k === 0 || e.best == null ? '' : '+' + (e.best - pole).toFixed(3)}</td></tr>`).join('');
  $('resNext').textContent = 'Empezar carrera'; $('resNext').hidden = false;
  $('results').hidden = false;
  S.mode = 'results';
  if (audio) audio.mute();
}
function showRaceResults() {
  const R = SES, ord = raceOrder(), leader = ord[0];
  const el = Math.max(1, R.t - R.goT);
  const total = R.raceLaps * T.L;
  const rows = ord.map((e, k) => {
    let res;
    if (e.fin) res = k === 0 ? fmtTime(e.finT) : e.finLaps < leader.finLaps ? '+' + (leader.finLaps - e.finLaps) + (leader.finLaps - e.finLaps === 1 ? ' vuelta' : ' vueltas') : '+' + (e.finT - leader.finT).toFixed(3);
    else if (e.isRemote) res = e.left ? 'Abandonó' : 'En pista';
    else {
      const lapsDown = Math.floor(((leader.fin ? leader.finLaps * T.L : leader.progress) - e.progress) / T.L);
      if (lapsDown >= 1) res = '+' + lapsDown + (lapsDown === 1 ? ' vuelta' : ' vueltas');
      else { const est = el + (total - e.progress) / Math.max(5, e.progress / el); res = '+' + Math.max(0.1, est - (leader.finT || est)).toFixed(1) + ' (est.)'; }
    }
    const bestLap = e.isPlayer ? R.sessionBest : e.best;
    const move = e.grid ? e.grid - (k + 1) : 0;
    return `<tr class="${e.isPlayer ? 'me' : ''}"><td>${k + 1}</td><td>${esc(e.isPlayer ? 'Tú' : e.name)}</td><td>${esc(e.sp ? e.sp.name : '')}</td><td>${res}</td><td>${bestLap ? fmtTime(bestLap) : '—'}</td><td>${!e.grid ? '' : move > 0 ? '▲' + move : move < 0 ? '▼' + (-move) : '='}</td></tr>`;
  });
  const pos = ord.indexOf(R.player) + 1;
  $('resEyebrow').textContent = (R.mode === 'multi' ? 'Multijugador' : MODES[R.mode] || 'Carrera') + ' · ' + R.raceLaps + (R.raceLaps === 1 ? ' vuelta' : ' vueltas');
  $('resTitle').textContent = pos === 1 ? '¡Victoria!' : pos <= 3 ? '¡Podio! P' + pos : 'Terminas P' + pos;
  $('resSub').textContent = (R.sessionBest ? 'Tu mejor vuelta: ' + fmtTime(R.sessionBest) : '') + (R.mode !== 'multi' ? (R.sessionBest ? ' · ' : '') + 'IA nivel ' + S.game.diff + ' (' + DIFFN(S.game.diff) + ')' : '');
  $('resHead').innerHTML = '<tr><th>Pos</th><th>Piloto</th><th>Coche</th><th>Tiempo</th><th>Mejor vuelta</th><th>+/-</th></tr>';
  $('resRows').innerHTML = rows.join('');
  $('resNext').textContent = R.mode === 'multi' ? 'Volver a la sala' : 'Repetir carrera'; $('resNext').hidden = false;
  $('results').hidden = false;
}
function onResultsNext() {
  $('results').hidden = true;
  const R = SES; if (!R) return enterMenu();
  if (R.kind === 'quali') return startSession('race', { grid: R.gridOrder, mode: 'completa' });
  if (R.mode === 'multi') { netLeaveRace(); disposeEntries(); SES = null; enterMenu(); openLobby(); return; }
  restartSession();
}
function renderLapTable() {
  const tb = $('lapRows');
  if (!SES || !SES.laps.length) { tb.innerHTML = '<tr><td colspan="6" class="muted">Aún no has completado ninguna vuelta.</td></tr>'; return; }
  const best = SES.sessionBest;
  tb.innerHTML = SES.laps.map(l => `<tr><td>${l.n}</td><td class="${!l.valid ? 'inv' : l.time === best ? 'best' : ''}">${fmtTime(l.time)}</td><td>${l.sectors ? fmtSec(l.sectors[0]) : '—'}</td><td>${l.sectors ? fmtSec(l.sectors[1]) : '—'}</td><td>${l.sectors ? fmtSec(l.sectors[2]) : '—'}</td><td>${l.first ? 'Salida' : l.pit ? 'Boxes' : !l.valid ? 'Inválida' : l.clean ? 'Limpia' : 'Con contacto'}</td></tr>`).join('');
}

// ---------------------------------------------------------------------------
//  Model transforms, ghost, cameras
// ---------------------------------------------------------------------------
// kerb ridges: a small buzz at the ridge frequency, only while wheels ride the kerb
// kerb rumble strength 0..1 (wheels on the kerb, speed), smoothed per car; the shake itself is random each frame
function kerbAmp(V, dt) {
  const tgt = Math.max(V.sausT > 0 ? 1 : 0, Math.min(1, ((V.kerbN || 0) / 2.5)) * Math.min(1, Math.abs(V.u) / 14));
  V.kerbA = (V.kerbA || 0) + (tgt - (V.kerbA || 0)) * Math.min(1, (dt || 0.016) * (tgt > (V.kerbA || 0) ? 30 : 12));
  return V.kerbA;
}
const jit = () => Math.random() * 2 - 1;
function kerbVib(V) { return (V.kerbA || 0) * jit(); }
function roadVib(V) { const ph = V.kerbPh || 0; return (V.bump || 0) * Math.sin(ph * 1.7) * Math.sin(ph * 0.63 + 1.3); }
// spin a wheel; parts that sit off the axle (brake ducts) are counter-rotated so they stay put
function spinWheel(w, r) {
  w.rotation.x = r;
  const st = w.userData.stat; if (!st) return;
  const c = Math.cos(r), s = Math.sin(r);
  for (const e of st) { const p = e.p; e.o.position.set(p.x, p.y * c + p.z * s, -p.y * s + p.z * c); e.o.rotation.x = -r; }
}
function poseModel(m, V, steer, braking, dt) {
  const r = m.root;
  r.position.set(V.x, V.y, V.z);
  const grade = V.q ? V.q.slope * (Math.sin(V.h) * V.q.tx + Math.cos(V.h) * V.q.tz) : 0;
  const gp = Math.atan(grade);
  r.rotation.order = 'YXZ'; r.rotation.set(-gp, V.h, 0);
  const sp = Math.min(1, Math.abs(V.u) / 12);
  V.kerbRoll = (V.kerbRoll || 0) + (((V.kerbL || 0) - (V.kerbR || 0)) * 0.0065 * sp - (V.kerbRoll || 0)) * Math.min(1, dt * 14);
  const ka = kerbAmp(V, dt);
  // sausage kerb: the wheels on that side ride up onto it (a quick lift and tilt)
  V.sausLift = (V.sausLift || 0) + ((V.sausT > 0.2 ? 0.05 * Math.min(2, V.sausN || 1) : 0) - (V.sausLift || 0)) * Math.min(1, dt * (V.sausT > 0.2 ? 30 : 10));
  const sSide = V.q && V.q.d > 0 ? 1 : -1;
  m.body.position.y = ka * 0.0065 * jit() + roadVib(V) * 0.012 + V.sausLift * 0.6;
  // covered-wheel prototypes (919, Valkyrie LM): the scanned arches clear the tyres by only a few cm, so the body may not
  // pitch / roll / heave against the wheels as much as the rest (the tyre went through the fender while driving)
  const lm = m.spec.body === 'lmp' ? 0.25 : 1;
  m.body.rotation.x = -(V.pitch - gp) * lm + ka * 0.0028 * jit() * lm;
  m.body.rotation.z = (-V.roll + V.kerbRoll) * lm + ka * 0.004 * jit() * lm + V.sausLift * 0.9 * sSide * lm;
  if (lm < 1) m.body.position.y *= lm;
  for (const w of m.wheels) spinWheel(w, V.wheelRot);
  { const sv = m.spec.body === 'lmp' ? 0.5 : 1, lim = m.spec.body === 'lmp' ? 0.16 : 9; for (const p of m.steerPivots) p.rotation.y = clamp(V.delta * 1.2 * sv, -lim, lim); }
  if (m.steeringWheel) m.steeringWheel.rotation.z = -steer * 1.9 + (V.kerbA || 0) * 0.035 * jit();
  if (m.arms && m.interior.visible) for (const A of m.arms) { A.hand.getWorldPosition(_va); m.interior.worldToLocal(_va); solveArm(A.arm, A.sh, _va, 0.0); }
  if (m.dv) dvPose(m, V, dt);
  if (m.setBrake) m.setBrake(braking);
}
function updateModelTransform(dt) {
  if (!model) return;
  const pe = SES && SES.player, brk = pe && pe.fin && pe.ai ? pe.ai.inp.brake : INPUT.brake;
  poseModel(model, car, INPUT.steer, brk > 0.05 && S.mode !== 'menu', dt);
}
function updateOthers(dt) {
  if (!SES) return;
  const cx = camera.position.x, cz = camera.position.z, far = 900 * DRAW[S.settings.draw][1];
  for (const e of SES.entries) {
    if (e.isPlayer || !e.model) continue;
    if (e.isRemote) { netPoseRemote(e, dt); continue; }
    const vis = !e.craned && (e.x - cx) ** 2 + (e.z - cz) ** 2 < far * far;
    e.model.root.visible = vis;
    if (vis) poseModel(e.model, e.veh, 0, e.ai.inp.brake > 0.05, dt);
  }
}
// rivals, remote cars and the ghost: coarser meshes by distance (glbLodUpdate), never off by more than a third of a pixel on screen.
// The player's own car always keeps the full model.
const _lodSz = new THREE.Vector2();
function lodFrame() {
  const pxPerM = renderer.getDrawingBufferSize(_lodSz).y / (2 * Math.tan(camera.fov * Math.PI / 360));
  if (ghost && ghost.root.visible) glbLodUpdate(ghost, camera, pxPerM);
  if (SES) for (const e of SES.entries) if (!e.isPlayer && e.model && e.model.root.visible) glbLodUpdate(e.model, camera, pxPerM);
}
function updateGhost() {
  if (!ghost || !SES || !SES.best || !S.settings.ghost || SES.state !== 'run' || !SES.started || !SES.best.ghost) { if (ghost) ghost.root.visible = false; return; }
  const g = SES.best.ghost, lapT = SES.t - SES.lapStart, f = lapT * 10, i = Math.floor(f), n = g.length / 4;
  if (i < 0 || i >= n - 1) { ghost.root.visible = false; return; }
  const t = f - i, o = i * 4, o2 = o + 4;
  const x = lerp(g[o], g[o2], t), y = lerp(g[o + 1], g[o2 + 1], t), z = lerp(g[o + 2], g[o2 + 2], t);
  const h = g[o + 3] + wrapAng(g[o2 + 3] - g[o + 3]) * t;
  ghost.root.position.set(x, y, z); ghost.root.rotation.set(0, h, 0);
  const d = Math.hypot(x - car.x, z - car.z);
  ghost.mat.opacity = 0.32 * smoothstep(2.5, 10, d);
  ghost.root.visible = d > 2.5;
}
const CAMSTATE = { init: false, pos: new THREE.Vector3(), yaw: 0, look: new THREE.Vector3(), fovAdd: 0 };
let DEBUGCAM = null;
const MENU = { ang: 2.4, pitch: 0.16, zoom: 1, idle: 0 };
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vUp = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _q2 = new THREE.Quaternion();
// ---- free camera adjustment: every player can place each camera (per car and per view) with the number keys; it stays
// rigidly attached to the car body (cockpit / T-cam) or keeps the smoothed follow (chase), and is remembered.
//  1/2 back/forward · 3/4 down/up · 5/6 left/right · 7/8 look down/up · 9/0 field of view -/+ · Backspace reset
const CAMADJ = store.get('camAdj', {});
const CAMADJ_LIM = { cockpit: { x: 0.35, y: 0.3, z: 0.5, p: 0.35, f: 20 }, onboard: { x: 0.6, y: 0.6, z: 1.2, p: 0.4, f: 20 }, chase: { x: 0.8, y: 0.8, z: 0.8, p: 0.4, f: 20 } };
const CAMADJ_KEYS = [['z', -1, 1], ['z', 1, 2], ['y', -1, 3], ['y', 1, 4], ['x', 1, 5], ['x', -1, 6], ['p', -1, 7], ['p', 1, 8], ['f', -1, 9], ['f', 1, 0]];
const CAMADJ_RATE = { x: 0.3, y: 0.3, z: 0.4, p: 0.35, f: 14 };
let camAdjSaveT = 0, camAdjToastT = 0;
function camAdj(mode) { const k = S.carId + '|' + mode; return CAMADJ[k] || (CAMADJ[k] = { x: 0, y: 0, z: 0, p: 0, f: 0 }); }
function camAdjStep(dt, mode) {
  if (S.mode !== 'race' || !mode) return;
  const A = camAdj(mode), L = CAMADJ_LIM[mode] || CAMADJ_LIM.chase; let moved = false;
  for (const [ax, sg, n] of CAMADJ_KEYS) if (KEYS['Digit' + n] || KEYS['Numpad' + n]) { A[ax] = clamp(A[ax] + sg * CAMADJ_RATE[ax] * dt, -L[ax], L[ax]); moved = true; }
  if (KEYS.Backspace) { A.x = A.y = A.z = A.p = A.f = 0; moved = true; }
  if (moved) { camAdjSaveT = 0.6; camAdjToastT -= dt; if (camAdjToastT <= 0) { camAdjToastT = 2.5; toast('Cámara ajustada y guardada para este coche · Retroceso: restablecer', 2.4); } }
  if (camAdjSaveT > 0 && (camAdjSaveT -= dt) <= 0) store.set('camAdj', CAMADJ);
}
function updateCamera(dt) {
  const st = S.settings;
  if (DEBUGCAM) { camera.clearViewOffset(); camera.position.set(DEBUGCAM[0], DEBUGCAM[1], DEBUGCAM[2]); camera.lookAt(DEBUGCAM[3], DEBUGCAM[4], DEBUGCAM[5]); camera.fov = DEBUGCAM[6] || 60; camera.near = 0.1; camera.updateProjectionMatrix(); return; }
  if (S.mode === 'menu' || S.mode === 'loading') {
    MENU.idle += dt; if (MENU.idle > 2.5) MENU.ang += dt * 0.12;
    const fr = menuFrame(dt), r = Math.max(model.L * 1.25 + 3.4, fr.rFit) * MENU.zoom;
    const cx = car.x, cz = car.z, cy = car.y;
    const h = car.h + MENU.ang;
    camera.position.set(cx + Math.sin(h) * r * Math.cos(MENU.pitch), cy + 0.35 + r * Math.sin(MENU.pitch) + 0.6, cz + Math.cos(h) * r * Math.cos(MENU.pitch));
    camera.lookAt(cx, cy + model.H * 0.42, cz);
    camera.setViewOffset(window.innerWidth, window.innerHeight, fr.ox, fr.oy, window.innerWidth, window.innerHeight);
    camera.fov = 38; camera.near = 0.1; camera.updateProjectionMatrix();
    setInterior(false);
    return;
  }
  camera.clearViewOffset();
  const mode = S.mode === 'results' ? 'chase' : CAMS[S.camIdx];
  const spd = Math.abs(car.u);
  if (mode === 'chase') {
    setInterior(false);
    const velYaw = spd > 3 ? Math.atan2(car.u * Math.sin(car.h) + car.v * Math.cos(car.h), car.u * Math.cos(car.h) - car.v * Math.sin(car.h)) : car.h;
    let targetYaw = car.h + wrapAng(velYaw - car.h) * 0.35;
    if (car.u < -1) targetYaw = car.h;
    if (!CAMSTATE.init) { CAMSTATE.yaw = targetYaw; }
    CAMSTATE.yaw += wrapAng(targetYaw - CAMSTATE.yaw) * (1 - Math.exp(-dt * 7));
    let yaw = CAMSTATE.yaw + (S.lookBack ? Math.PI : 0);
    const CA = camAdj('chase'); camAdjStep(dt, 'chase');
    const dist = Math.max(2.2, model.cams.chaseDist * (1 + Math.min(spd, 80) * 0.0012) - CA.z * 3), hgt = model.cams.chaseH + CA.y * 1.5;
    _v.set(car.x - Math.sin(yaw) * dist + Math.cos(yaw) * CA.x * 2, car.y + hgt, car.z - Math.cos(yaw) * dist - Math.sin(yaw) * CA.x * 2);
    const ground = world.heightAt(_v.x, _v.z);
    const q = T.project(_v.x, _v.z, car.q.i);
    const surf = Math.abs(q.d) < Math.max(q.bl, q.br) + 2 ? q.e : ground;
    _v.y = Math.max(_v.y, surf + 0.9);
    if (!CAMSTATE.init) { CAMSTATE.pos.copy(_v); CAMSTATE.init = true; }
    CAMSTATE.pos.lerp(_v, 1 - Math.exp(-dt * 12));
    camera.position.copy(CAMSTATE.pos); { const ka = car.kerbA || 0; camera.position.x += ka * 0.012 * jit(); camera.position.y += ka * 0.016 * jit(); }
    camera.lookAt(car.x + Math.sin(yaw) * 3, car.y + model.H * 0.62 + 0.25 + CA.p * 4, car.z + Math.cos(yaw) * 3);
    camera.near = 0.1;
    CAMSTATE.fovAdd += (Math.min(spd * 0.09, 9) - CAMSTATE.fovAdd) * Math.min(1, dt * 3);
    camera.fov = st.fov + CAMSTATE.fovAdd + CA.f;
  } else {
    const inside = mode === 'cockpit';
    // looking back from inside / onboard: a rear-facing camera above the tail (like a TV rear cam), not the inside of the bodywork
    const back = !!S.lookBack;
    setInterior(inside && !back, mode === 'onboard' && !back);
    const local = back ? _vb.set(0, model.H + 0.42, -model.L * 0.28) : inside ? model.eye : model.cams.onboard;
    model.root.updateMatrixWorld(true);
    const parent = model.body;
    // driver's head: leans against lateral g, nods under braking / acceleration, glances into the corner
    const HD = CAMSTATE.head || (CAMSTATE.head = { x: 0, z: 0, yaw: 0 }), kh = Math.min(1, dt * 6);
    HD.x += (clamp(-(car.ayF || 0) * 0.0032, -0.045, 0.045) - HD.x) * kh;
    HD.z += (clamp(-(car.axF || 0) * 0.0028, -0.03, 0.045) - HD.z) * kh;
    HD.yaw += ((inside ? clamp(INPUT.steer || 0, -1, 1) * 0.07 : 0) - HD.yaw) * Math.min(1, dt * 3);
    const CA = back ? { x: 0, y: 0, z: 0, p: 0, f: 0 } : camAdj(mode); if (!back) camAdjStep(dt, mode);
    _v.copy(local); _v.x += CA.x; _v.y += CA.y; _v.z += CA.z; if (inside && !back) { _v.x += HD.x; _v.z += HD.z; } parent.localToWorld(_v);
    const ka = car.kerbA || 0, sh = Math.min(spd, 90) * 0.000012 * Math.sin((car.kerbPh || 0) * 2.3) + ka * 0.006 * jit();
    camera.position.set(_v.x + ka * 0.004 * jit(), _v.y + sh, _v.z);
    parent.getWorldQuaternion(_q);
    _e.set(back ? -0.1 : inside ? (model.cams.inPitch != null ? model.cams.inPitch : -0.075) : (model.cams.onPitch || -0.035), Math.PI + (back ? Math.PI : HD.yaw), inside && !back ? -HD.x * 0.6 : 0, 'YXZ');
    _e.x += CA.p;
    if (ka > 0.01) { _e.x += ka * 0.006 * jit(); _e.z += ka * 0.006 * jit(); }
    camera.quaternion.copy(_q).multiply(_q2.setFromEuler(_e));
    camera.near = inside && !back ? 0.03 : 0.08;
    camera.fov = back ? st.fov + 4 : st.fov + (inside ? -4 : 2) + Math.min(spd * 0.03, 3) + CA.f;
    CAMSTATE.init = false;
  }
  camera.updateProjectionMatrix();
}
// the two closest AI cars, for the rival engine voices (distance, stereo side, closing speed)
function nearestRivals() {
  if (!SES || !SES.entries) return [];
  const list = [];
  for (const e of SES.entries) { if (!e.isAI || !e.veh) continue; const dx = e.veh.x - car.x, dz = e.veh.z - car.z; list.push([dx * dx + dz * dz, e]); }
  list.sort((a, b) => a[0] - b[0]);
  return list.slice(0, 2).map(([d2, e]) => rivalInfo(e, d2));
}
function rivalInfo(best, bd) {
  const V = best.veh, d = Math.sqrt(bd), dx = V.x - car.x, dz = V.z - car.z;
  const lat = dx * Math.cos(car.h) - dz * Math.sin(car.h);
  const vx = (V.u * Math.sin(V.h) + V.v * Math.cos(V.h)) - (car.u * Math.sin(car.h) + car.v * Math.cos(car.h));
  const vz = (V.u * Math.cos(V.h) - V.v * Math.sin(V.h)) - (car.u * Math.cos(car.h) - car.v * Math.sin(car.h));
  const closing = d > 0.1 ? -(vx * dx + vz * dz) / d : 0;
  return { veh: V, dist: d, pan: clamp(-lat / (Math.abs(lat) + 4), -0.9, 0.9) * (S.lookBack ? -1 : 1), closing, throttle: best.ai && best.ai.inp ? best.ai.inp.throttle : 0.7 };
}
// cockpit view of a scanned model: cut the model's own door liners / roof lining / pillars out of the cabin volume
// (the procedural cabin draws those); player model only (its materials are cloned once so AI cars keep theirs)
function glbCabClip(on) {
  if (!model || !model.glb) return;
  const closedBody = !['f1', 'f1h', 'indy', 'fe'].includes(model.spec.body);
  if (!model.spec.cabClip && !model.swClip && !closedBody) return;
  const K = model.cabClip || (model.cabClip = (() => {
    const e0 = model.eye, c0 = model.spec.cabClip || model.swClip || [0.8, e0.y - 0.65, e0.y + 0.5, 1.0, 0.9], c = c0.slice(); if (c[0] > 0.4) c[4] = Math.max(c[4], 0.9);
    const e = model.eye, xh = c[0], y0 = c[1], y1 = c[2], zb = e.z - c[3], zf = e.z + c[4];
    const L = [[1, 0, 0, -xh], [-1, 0, 0, -xh], [0, 1, 0, -y1], [0, -1, 0, y0], [0, 0, 1, -zf], [0, 0, -1, zb]].map(a => new THREE.Plane(new THREE.Vector3(a[0], a[1], a[2]), a[3]));
    // inside the box every n.p + d is negative -> clipped when ALL planes cut (clipIntersection)
    model.glb.traverse(o => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material];
      const nm = ms.map(mm => { const cl = mm.clone(); cl.clipIntersection = true; return cl; }); o.material = Array.isArray(o.material) ? nm : nm[0]; });
    renderer.localClippingEnabled = true;
    const LG = L.map(p => p.clone()); LG[2].constant = -1.8; // glass: clip up to the roof line so no dark sliver floats above the halo
    return { L, LG, W: L.map(p => p.clone()), WG: LG.map(p => p.clone()), on: null };
  })());
  if (on) { model.body.updateMatrixWorld(true); for (let i = 0; i < 6; i++) { K.W[i].copy(K.L[i]).applyMatrix4(model.body.matrixWorld); K.WG[i].copy(K.LG[i]).applyMatrix4(model.body.matrixWorld); } }
  if (K.on === on && !on) return;
  if (K.on !== on) { model.glb.traverse(o => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const mm of ms) mm.clippingPlanes = on ? (mm.userData && mm.userData.isGlass ? K.WG : K.W) : null; }); K.on = on; }
}
function setInterior(on, tcam) {
  if (!model) return;
  glbCabClip(on);
  // T-cam on single-seaters: helmet AND the gloved hands / forearms on the wheel are in view
  model.interior.visible = on || (!!tcam && !!model.helmetParts && ['f1', 'f1h', 'indy', 'fe'].includes(model.spec.body));
  if (model.helmetParts) for (const h of model.helmetParts) h.visible = !on;
  if (model.hideInCockpit) for (const h of model.hideInCockpit) h.visible = !on;
  if (model.glbCabHide) for (const h of model.glbCabHide) h.visible = !on;
  if (model.cockHalo) model.cockHalo.visible = on;
  if (model.aero) { model.aero.visible = !on; model.aero.material.opacity = 0.38; }
  if (model.cockAero) model.cockAero.visible = on;
  if (model.glbInt) for (const h of model.glbInt) h.visible = !model.interior.visible;
  // window glass: almost clear from the cockpit (own cloned materials only), tinted from outside
  if (model.cabClip && model.glb && model._glassOn !== on) { model._glassOn = on; model.glb.traverse(o => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m.userData && m.userData.isGlass) { const inC = on && !['f1', 'f1h', 'indy', 'fe'].includes(model.spec.body); m.opacity = inC ? 0.045 : m.userData.hiOp; m.envMapIntensity = inC ? 0.12 : 0.45; } }); }
  // the scanned cars carry their own steering column / dash in an INTERIOR node: hide it in the cockpit (the procedural wheel replaces it)
  if (model.glb && ['f1', 'f1h', 'indy', 'fe'].includes(model.spec.body)) model.glb.traverse(o => { if (o.isMesh && /INTERIOR/i.test(o.name)) o.visible = !on; });
}

// ---------------------------------------------------------------------------
//  HUD + minimap + standings
// ---------------------------------------------------------------------------
const MM = {};
function initMinimap() {
  const cv = $('minimap'), g = cv.getContext('2d');
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < T.N; i++) { x0 = Math.min(x0, T.x[i]); x1 = Math.max(x1, T.x[i]); z0 = Math.min(z0, T.z[i]); z1 = Math.max(z1, T.z[i]); }
  const pad = 16, sc = Math.min((cv.width - pad * 2) / (x1 - x0), (cv.height - pad * 2) / (z1 - z0));
  const ox = (cv.width - (x1 - x0) * sc) / 2, oz = (cv.height - (z1 - z0) * sc) / 2;
  MM.map = (x, z) => [ox + (x - x0) * sc, oz + (z - z0) * sc];
  const bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
  const b = bg.getContext('2d');
  b.lineJoin = 'round'; b.lineCap = 'round';
  const sb = SECT(), secCol = ['#e3342c', '#4aa3ff', '#f6c21c'];
  for (let k = 0; k < 3; k++) {
    const sA = k === 0 ? 0 : sb[k - 1], sB = k === 2 ? T.L : sb[k];
    b.strokeStyle = secCol[k]; b.globalAlpha = 0.9; b.lineWidth = 5; b.beginPath();
    for (let s = sA; s <= sB; s += 5) { const i = Math.floor(s / T.ds) % T.N; const [px, pz] = MM.map(T.x[i], T.z[i]); if (s === sA) b.moveTo(px, pz); else b.lineTo(px, pz); }
    b.stroke();
  }
  b.globalAlpha = 1; b.strokeStyle = '#0c0e11'; b.lineWidth = 1.2; b.beginPath();
  for (let i = 0; i <= T.N; i += 2) { const [px, pz] = MM.map(T.x[i % T.N], T.z[i % T.N]); if (i === 0) b.moveTo(px, pz); else b.lineTo(px, pz); }
  b.stroke();
  const [sx, sz] = MM.map(T.x[0], T.z[0]); b.fillStyle = '#fff'; b.fillRect(sx - 4, sz - 1.5, 8, 3);
  b.fillStyle = 'rgba(236,238,241,0.55)'; b.font = "600 11px 'Saira Condensed', sans-serif";
  const lab = (sN, txt, dx, dy) => { const i = Math.round(sN * T.L / T.nom / T.ds) % T.N; const [px, pz] = MM.map(T.x[i], T.z[i]); b.fillText(txt, px + dx, pz + dy); };
  for (const l of T.def.labels) lab(...l);
  MM.bg = bg; MM.g = g; MM.cv = cv; MM.t = 0;
}
function drawMinimap() {
  const { g, cv, bg } = MM; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(bg, 0, 0);
  if (ghost && ghost.root.visible) { const [gx, gz] = MM.map(ghost.root.position.x, ghost.root.position.z); g.fillStyle = '#9fd4ff'; g.beginPath(); g.arc(gx, gz, 4, 0, 7); g.fill(); }
  if (SES) for (const e of SES.entries) {
    if (e.isPlayer || e.left) continue;
    const [ex, ez] = MM.map(e.x, e.z); g.fillStyle = e.isRemote ? '#4aa3ff' : '#e9ecef'; g.strokeStyle = '#0c0e11'; g.lineWidth = 1;
    g.beginPath(); g.arc(ex, ez, 3.3, 0, 7); g.fill(); g.stroke();
  }
  const [px, pz] = MM.map(car.x, car.z);
  g.fillStyle = '#f6c21c'; g.strokeStyle = '#0c0e11'; g.lineWidth = 2; g.beginPath(); g.arc(px, pz, 5.5, 0, 7); g.fill(); g.stroke();
}
function renderStandings() {
  const R = SES; if (!R) return;
  const show = R.entries.length > 1 || R.kind !== 'practice';
  $('standings').hidden = !show; if (!show) return;
  let ord, gapOf;
  if (R.kind === 'race') {
    ord = raceOrder(); const leader = ord[0];
    gapOf = (e, k) => {
      if (k === 0) return e.fin ? 'Meta' : 'Líder';
      if (e.fin && leader.fin) return e.finLaps < leader.finLaps ? '+' + (leader.finLaps - e.finLaps) + 'V' : '+' + (e.finT - leader.finT).toFixed(1);
      const lp = leader.fin ? leader.finLaps * T.L : leader.progress, dl = Math.floor((lp - e.progress) / T.L);
      if (dl >= 1) return '+' + dl + 'V';
      const tb = R.bucketT[e.lastBucket];
      return tb != null ? '+' + Math.max(0, e.bucketT - tb).toFixed(1) : '';
    };
    const lapNow = clamp(R.player.lap + (R.player.fin ? 0 : 1), 1, R.raceLaps);
    $('hSess').textContent = R.state === 'lights' ? 'Parrilla' : R.player.fin ? 'Final' : 'Vuelta ' + lapNow + '/' + R.raceLaps;
  } else {
    ord = qualiOrder(); const p1 = ord[0] && ord[0].best;
    gapOf = (e, k) => e.best == null ? '—' : k === 0 ? fmtTime(e.best) : '+' + (e.best - p1).toFixed(3);
    $('hSess').textContent = R.kind === 'quali' ? (R.flag ? 'Bandera' : 'Clasif. ' + fmtClock(R.qualiDur - R.t)) : 'Práctica';
  }
  const me = ord.indexOf(R.player);
  $('hPos').textContent = 'P' + (me + 1); $('hPosOf').textContent = '/' + ord.length;
  const idx = new Set([0, 1, 2]); for (let k = me - 2; k <= me + 2; k++) if (k >= 0 && k < ord.length) idx.add(k);
  const list = [...idx].filter(k => k < ord.length).sort((a, b) => a - b).slice(0, 8);
  let html = '', prev = -1;
  for (const k of list) {
    if (k > prev + 1) html += '<li class="gap">···</li>';
    const e = ord[k];
    html += `<li class="${e.isPlayer ? 'me' : ''}"><span class="p">${k + 1}</span><span class="n">${esc(e.isPlayer ? 'TÚ' : e.code || e.name.slice(0, 3).toUpperCase())}</span><span class="g">${gapOf(e, k)}</span></li>`;
    prev = k;
  }
  $('stRows').innerHTML = html;
}
let hudT = 0, fpsAcc = 0, fpsN = 0;
// the per-frame HUD values are written only when they change (each write makes the browser restyle and re-lay out the HUD)
const HUDV = new Map();
const hudTxt = (id, v) => { v = String(v); if (HUDV.get(id) !== v) { HUDV.set(id, v); $(id).textContent = v; } };
const hudW = (id, v) => { const k = id + '.w'; if (HUDV.get(k) !== v) { HUDV.set(k, v); $(id).style.width = v; } };
function updateHUD(dt) {
  const R = SES; if (!R) return;
  const st = S.settings;
  const lapT = R.state === 'run' && R.started ? R.t - R.lapStart : 0;
  hudTxt('hTime', fmtTime(lapT));
  if (R.kind === 'practice' && R.mode !== 'multi') { const off = RW.len < 2 || R.state !== 'run' || R.player.pitHold || !!R.rep; const el = $('hRewind'); if (el.disabled !== off) el.disabled = off; }
  hudTxt('hLap', R.kind === 'race' ? clamp(R.player.lap + 1, 1, R.raceLaps) : R.lapNum);
  hudTxt('hLapOf', R.kind === 'race' ? '/' + R.raceLaps : '');
  const dEl = $('hDelta');
  if (R.best && R.best.trace && R.state === 'run' && R.started && !R.lap1 && car.q.s > 30 && car.q.s < T.L - 5 && R.valid) {
    const f = car.q.s / 10, k = Math.floor(f), tr = R.best.trace;
    if (k + 1 < tr.length && tr[k] >= 0 && tr[k + 1] >= 0 && (car.q.s < T.L * 0.3 || R.cp[0])) {
      const bt = lerp(tr[k], tr[k + 1], f - k), d = lapT - bt;
      dEl.hidden = false; dEl.textContent = fmtDelta(d); dEl.className = 'delta ' + (d > 0 ? 'up' : 'down');
    }
  } else dEl.hidden = true;
  if (R.secShowT > 0) { R.secShowT -= dt; if (R.secShowT <= 0) for (const id of ['hS1', 'hS2', 'hS3']) { $(id).className = 'sec'; $(id).querySelector('b').textContent = '—'; } }
  const mph = st.units === 'mph';
  hudTxt('hSpeed', Math.round(Math.abs(car.u) * (mph ? 2.23694 : 3.6)));
  hudTxt('hUnit', mph ? 'mph' : 'km/h');
  hudTxt('hGear', car.gear === -1 ? 'R' : (R.state === 'lights' || R.player.pitHold ? 'N' : car.gear));
  const x = clamp(car.rpm / car.P.red, 0, 1);
  hudW('hRpm', (x * 100).toFixed(1) + '%');
  const lamps = $('hShift').children, lit = Math.round(clamp((x - 0.72) / 0.26, 0, 1) * 8);
  for (let i = 0; i < 8; i++) { const c = i < lit ? (lit >= 8 ? 'b' : i < 3 ? 'g' : 'r') : ''; if (lamps[i].className !== c) lamps[i].className = c; }
  hudW('hThr', Math.round(INPUT.throttle * 100) + '%');
  hudW('hBrk', Math.round(INPUT.brake * 100) + '%');
  hudT += dt;
  if (hudT > 0.1) {
    hudT = 0;
    const as = [];
    if (st.abs) as.push(`<span class="${car.absAct ? 'on' : ''}">ABS</span>`);
    if (st.tc) as.push(`<span class="${car.tcAct ? 'on' : ''}">TC</span>`);
    if (st.esc) as.push(`<span class="${car.escOn ? 'on' : ''}">ESC</span>`);
    as.push(`<span>${st.autoShift ? 'AUTO' : 'MANUAL'}</span>`);
    if (car.inPit) as.push(`<span class="${car.limiter ? 'on' : ''}">PIT 80</span>`);
    $('hAssist').innerHTML = as.join('');
    const sN = car.q.s * T.nom / T.L; let cname = '';
    if (car.inPit) cname = 'Pit lane';
    else for (const c of T.corners) { if (sN > c.s - 130 && sN < c.s + 50) { cname = (c.n ? 'T' + c.n + ' · ' : '') + c.name; break; } }
    $('hCorner').textContent = cname;
    if (st.minimap) drawMinimap();
    if (CAMS[S.camIdx] === 'cockpit' && model.dash) drawDash(model, car, st.units);
    renderStandings();
  }
  if (R.msgT > 0) { R.msgT -= dt; if (R.msgT <= 0) $('toast').hidden = true; }
  if (R.bannerT > 0) { R.bannerT -= dt; if (R.bannerT <= 0) $('banner').hidden = true; }
  if (R.coachT > 0) { R.coachT -= dt; if (R.coachT <= 0) $('hCoach').hidden = true; }
  if (R.hintT > 0) { R.hintT -= dt; if (R.hintT <= 0) $('hHints').style.opacity = 0.25; }
}

// ---------------------------------------------------------------------------
//  Multiplayer: private rooms by code -> src/net.js (room manager, pilot profile, sync) and src/lobby.js (room UI)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  Loop
// ---------------------------------------------------------------------------
let last = performance.now(), acc = 0, resT = 0;
const DT = 1 / 240;
// ---------------------------------------------------------------------------
//  Tyre marks: laid only where a tyre locks or slides past its grip peak
// ---------------------------------------------------------------------------
class SkidMarks {
  constructor(scene) {
    const MAX = this.MAX = 3200;
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 4 * 3); this.col = new Float32Array(MAX * 4 * 4); this.uv = new Float32Array(MAX * 4 * 2);
    const idx = new Uint32Array(MAX * 6);
    for (let k = 0; k < MAX; k++) { const b = k * 4; idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], k * 6); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
    // soft-edged streaky rubber stripe
    const tex = canvasTex(32, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      for (let x = 0; x < w; x++) {
        const e = Math.sin(Math.PI * (x + 0.5) / w), streak = 0.7 + 0.3 * Math.sin(x * 2.3) * Math.sin(x * 0.7 + 1);
        for (let y = 0; y < h; y += 2) { const a = e * streak * (0.8 + 0.2 * Math.random()); c.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`; c.fillRect(x, y, 1, 2); }
      }
    }, true);
    this.mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; scene.add(this.mesh);
    this.n = 0; this.count = 0; this.dirty = false; this.q = newQ();
  }
  clear() { this.n = 0; this.count = 0; this.geo.setDrawRange(0, 0); }
  seg(w, x, z, y, a, width) {
    if (w.lx == null) { w.lx = x; w.lz = z; w.ly = y; w.la = a; w.v = 0; return; }
    const dx = x - w.lx, dz = z - w.lz, len = Math.hypot(dx, dz);
    if (len < 0.25) return;
    if (len > 4) { w.lx = x; w.lz = z; w.ly = y; w.la = a; return; }
    const nx = -dz / len * width / 2, nz = dx / len * width / 2, k = this.n, P = this.pos, C = this.col, U = this.uv;
    const v0 = w.v, v1 = w.v + len / 1.2;
    const pts = [[w.lx + nx, w.ly, w.lz + nz, 0, v0, w.la], [w.lx - nx, w.ly, w.lz - nz, 1, v0, w.la], [x + nx, y, z + nz, 0, v1, a], [x - nx, y, z - nz, 1, v1, a]];
    for (let j = 0; j < 4; j++) { const p = pts[j], o = k * 4 + j; P.set([p[0], p[1], p[2]], o * 3); U.set([p[3], p[4]], o * 2); C.set([0.06, 0.06, 0.065, p[5]], o * 4); }
    this.n = (k + 1) % this.MAX; this.count = Math.min(this.MAX, this.count + 1); this.dirty = true;
    w.lx = x; w.lz = z; w.ly = y; w.la = a; w.v = v1;
  }
  // every car with physics: four wheels, front marks from skidF, rear from skidR
  update(entries) {
    for (const e of entries) {
      const V = e.veh; if (!V || e.isRemote) continue;
      if (!e.skid) e.skid = [{}, {}, {}, {}];
      const far = !e.isPlayer && ((V.x - car.x) ** 2 + (V.z - car.z) ** 2 > 150 * 150), minA = e.isPlayer ? 0.12 : 0.3;
      if (far) { for (const w of e.skid) w.lx = null; continue; }
      const P = V.P, sp = V.spec, hw = (sp.wid || 1.9) / 2 - 0.16, ch = Math.cos(V.h), sh = Math.sin(V.h);
      const on = V.surfF === 'asphalt' || V.surfF === 'kerb' || V.surfF === 'tarmac';
      for (let k = 0; k < 4; k++) {
        const front = k < 2, amt = on ? (front ? V.skidF : V.skidR) || 0 : 0, w = e.skid[k];
        if (amt < minA) { w.lx = null; continue; }
        const lx = (k % 2 ? -1 : 1) * hw, lz = front ? P.a : -P.b;
        const x = V.x + lx * ch + lz * sh, z = V.z - lx * sh + lz * ch;
        this.seg(w, x, z, V.y + (V.q.slope || 0) * lz + 0.025, Math.min(0.75, 0.25 + 0.6 * amt), front ? 0.24 : 0.28);
      }
    }
    if (this.dirty) {
      this.dirty = false; const g = this.geo;
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.uv.needsUpdate = true;
      g.setDrawRange(0, this.count * 6);
    }
  }
}
let skids = null;


// ---------------------------------------------------------------------------
//  Damage: per-frame visuals, toasts, HUD widget, pit repairs
// ---------------------------------------------------------------------------
const DMG_TOAST = { wheel: 7, seized: 7, fwOff: 6, rwOff: 6, sus: 5, puncture: 5, engine: 4, leak: 4, gearbox: 4, fw: 3, rw: 3 };
function dmgToastText(e) {
  const c = e.idx != null && e.idx >= 0 ? e.idx : 0;
  switch (e.type) {
    case 'wheel': return '¡Perdiste una rueda! · ' + DMG_NAMES.sus[c].replace('Suspensión', 'rueda');
    case 'seized': return 'Motor roto · pulsa R para que te remolquen a boxes';
    case 'fwOff': return 'Perdiste el ' + dmgName(car.spec, 'fw').toLowerCase();
    case 'rwOff': return 'Perdiste el ' + dmgName(car.spec, 'rw').toLowerCase();
    case 'sus': return DMG_NAMES.sus[c] + ' dañada · el coche se desvía';
    case 'puncture': return DMG_NAMES.tyre[c] + ' pinchado';
    case 'engine': return 'Motor dañado · pierdes potencia';
    case 'leak': return 'Fuga de refrigerante · vigila la temperatura';
    case 'gearbox': return 'Caja de cambios dañada';
    case 'fw': { const p = dmgProfile(car.spec); return p.fw.n + ' dañado' + (p.fw.aero > 0.3 ? ' · menos apoyo delantero' : ''); }
    case 'rw': { const p = dmgProfile(car.spec); return p.rw.n + ' dañado' + (p.rw.aero > 0.3 ? ' · menos apoyo trasero' : ''); }
  }
  return null;
}
function damageFrame(dt) {
  if (!SES || !DFX.ready || !(S.mode === 'race' || S.mode === 'pause' || S.mode === 'results')) return;
  const live = S.mode !== 'pause';
  if (DMG.scale > 0 || DFX.sparks.any || DFX.smoke.any) {
    for (const e of SES.entries) {
      if (e.isRemote || !e.model || !e.veh) continue;
      const near = e.isPlayer || (e.model.root.visible && (e.x - camera.position.x) ** 2 + (e.z - camera.position.z) ** 2 < 220 * 220);
      const r = dvCar(e.model, e.veh, live ? dt : 0, near);
      if (r.hit > 3.5 && live) {
        const d = e.isPlayer ? 0 : Math.hypot(e.x - car.x, e.z - car.z);
        if (d < 45) {
          const lv = clamp(r.hit / 22, 0.1, 1) * (1 - d / 45);
          if (audio && audio.crash) audio.crash(lv, CAMS[S.camIdx] === 'cockpit' && !S.lookBack);
          if (e.isPlayer) DFX.shake = Math.max(DFX.shake, clamp(r.hit / 18, 0.15, 1));
          else if (d < 25) DFX.shake = Math.max(DFX.shake, lv * 0.35);
        }
        if (e.isPlayer && SES.clean) { SES.clean = false; setValidChip(); }
      }
      if (e.isPlayer && r.evs) {
        let best = null;
        for (const ev of r.evs) { const w = DMG_TOAST[ev.type]; if (w && (!best || w > DMG_TOAST[best.type])) best = ev; }
        if (best) toast(dmgToastText(best), 3.4);
      }
    }
  }
  if (live) DFX.frame(dt, camera, renderer);
  dmgHud(dt);
}
const DMG_HUD = { t: 0, ver: -1, shown: false };
function dmgHud(dt) {
  const el = $('hDmg'), D = car && car.dmg;
  if (!D || !(DMG.scale > 0) || (D.total < 0.01 && !D.dead)) { if (!el.hidden) el.hidden = true; DMG_HUD.ver = -1; return; }
  DMG_HUD.t -= dt; if (DMG_HUD.t > 0 && DMG_HUD.ver === D.ver) return;
  DMG_HUD.t = 0.25; DMG_HUD.ver = D.ver;
  el.hidden = false;
  const col = (v) => v < 0.03 ? '' : 'hsl(' + Math.round(130 * (1 - Math.min(1, v * 1.15))) + ' 85% 52%)';
  const set = (id, v, off) => { const n = $(id); n.style.fill = off ? 'none' : col(v); n.style.stroke = off ? '#e3342c' : ''; n.style.strokeDasharray = off ? '2 2' : ''; };
  set('dmFw', D.fw); set('dmRw', D.rw); set('dmF', D.body.f); set('dmR', D.body.r); set('dmL', D.body.l); set('dmRt', D.body.rt);
  set('dmEng', Math.max(D.eng, D.temp > 0.6 ? D.temp : 0, D.cool * 0.8)); set('dmGear', D.gear); set('dmFloor', D.floor);
  for (let c = 0; c < 4; c++) set('dmW' + c, Math.max(D.sus[c], D.tyre[c] ? 0.65 : 0), D.lost[c]);
  const fx = D.fx, pct = Math.round(D.total * 100);
  $('hDmgPct').textContent = D.dead ? 'Inservible' : pct + '%';
  el.className = 'dmg' + (D.dead || pct > 55 ? ' bad' : pct > 20 ? ' warn' : '');
  const bits = [];
  const aero = Math.round((1 - (fx.kAF + fx.kAR) / 2) * 100); if (aero >= 3) bits.push('Apoyo −' + aero + '%');
  if (fx.pwr < 0.97) bits.push('Potencia ' + Math.round(fx.pwr * 100) + '%');
  if (D.temp > 0.45) bits.push('Motor caliente ' + Math.round(Math.min(1, D.temp) * 100) + '%');
  if (Math.max(...D.tyre) > 0) bits.push('Pinchazo');
  if (D.lost.some(x => x)) bits.push('Rueda perdida');
  if (D.gear > 0.3) bits.push('Caja dañada');
  if (D.dead) bits.push('R: remolque a boxes');
  $('hDmgTxt').textContent = bits.join(' · ');
}
// ---------------------------------------------------------------------------
//  Tyres and wet weather (runtime): water level, compound choice, pit change, HUD, spray
// ---------------------------------------------------------------------------
const WXS = { water: 0, target: 0, dryLine: 0, rain: 0 };
let wxVis = -1;
function wxSync() { env.water = WXS.water; env.dryLine = WXS.dryLine; env.wet = WXS.water > 0.12; }
function wxReset() {
  const w = WEATHER[S.weather];
  WXS.water = wxStart(); WXS.target = w.water || 0; WXS.rain = w.rain || 0; WXS.dryLine = 0; wxVis = WXS.water;
  wxSync();
  if (sky && world) sky.setWet(world, WXS.water);
}
// water rises quickly with rain and drains slowly; while it drains the racing line (hot, rubbered) dries first
function wxStep(dt) {
  const w = WEATHER[S.weather];
  const rate = WXS.target > WXS.water ? 1 / 200 : 1 / (w.dry || 520);
  WXS.water += clamp(WXS.target - WXS.water, -rate * dt, rate * dt);
  WXS.dryLine += ((WXS.water > WXS.target + 0.004 ? 1 : 0) - WXS.dryLine) * Math.min(1, dt * 0.15);
  wxSync();
  if (Math.abs(WXS.water - wxVis) > 0.008) { wxVis = WXS.water; sky.setWet(world, WXS.water); }
}
function autoTyre(kind) {
  const w0 = wxStart();
  if (w0 >= 0.55) return 'W';
  if (w0 >= 0.15) return 'I';
  if (kind === 'quali') return 'S';
  if (kind !== 'race') return 'M';
  const eff = S.game.laps * (TYW.scale > 0 ? TYW.scale : 1), life = TYRE_LIFE.cache.get(tyreLifeKey());
  if (life) { for (const c of ['S', 'M']) if (life[c] && life[c] >= eff + 1) return c; return 'H'; }   // softest compound that lasts the race on this circuit
  return eff <= 9 ? 'S' : eff <= 16 ? 'M' : 'H';
}
function pickTyre(kind) { const c = S.game.tyre; return c !== 'auto' && TYRES[c] ? c : autoTyre(kind); }
function aiTyre() {
  const w0 = wxStart(), base = autoTyre('race');
  if (w0 >= 0.15) return S.weather === 'secando' && Math.random() < 0.3 ? 'M' : base;
  const o = ['S', 'M', 'H'], k = Math.random(); let i = o.indexOf(base);
  if (k < 0.2) i = Math.max(0, i - 1); else if (k > 0.8) i = Math.min(2, i + 1);
  return o[i];
}
// ---- tyre life on the selected circuit: an AI driver at pace (level 9, dry) runs 4 laps per slick compound with the selected car,
// in small slices while the menu is open; the wear of laps 2-4 gives the laps to 80 % (the same model and threshold as the race)
const TYRE_LIFE = { cache: new Map(), job: null };
const tyreLifeKey = () => TRACK.id + '|' + S.carId;
function trackLabel() { return TRACK.id.startsWith('toca_') ? 'Tocancipá ' + TRACK.layout : (TRACK_CARDS.find(c => c[0] === TRACK.id) || [0, TRACK.name])[1]; }
function tyreLifeGet() {
  const key = tyreLifeKey(), hit = TYRE_LIFE.cache.get(key); if (hit) return hit;
  if (S.mode === 'menu' && (!TYRE_LIFE.job || TYRE_LIFE.job.key !== key)) tyreLifeStart(key);
  return null;
}
function tyreLifeStart(key) {
  const sp = carById(S.carId), T0 = T, L0 = LINE, D0 = TRACK, comps = ['S', 'M', 'H'], dt = 1 / 120, job = { key, c: 0, res: {}, st: null };
  TYRE_LIFE.job = job;
  const wmax = (V) => Math.max(V.ty.wF, V.ty.wR);
  const slice = () => {
    if (TYRE_LIFE.job !== job) return;
    if (T !== T0 || S.mode !== 'menu') { TYRE_LIFE.job = null; return; }
    const t0 = performance.now(), dk = DMG.scale, tk = TYW.scale; DMG.scale = 0; TYW.scale = 1;
    try {
      while (performance.now() - t0 < 6) {
        if (!job.st) {
          const V = new Vehicle(sp, T0); V.reset(T0.L - 150 * T0.L / D0.nom, 0); V.u = 0; V.ty = newTyres(comps[job.c], true);
          const ai = new AIDriver(V, T0, L0, { diff: 9, react: 0 }); ai.setEnv({ grip: 1, wet: 0, water: 0, dryLine: 0 }, sp.id); ai.startRolling();
          job.st = { V, ai, n: -1, ps: V.q.s, w0: 0, t: 0, me: { id: 'tl' } };
        }
        const st = job.st, V = st.V, ai = st.ai;
        for (let k = 0; k < 40 && st.n < 3 && st.t < 900; k++) {
          const inp = ai.drive(dt, [st.me], st.me, { hold: false }); V.step(dt, inp, ai.env); st.t += dt;
          if (ai.needReset) { V.reset(V.q.s, 0, true); ai.stuckT = 0; ai.wrongT = 0; ai.needReset = false; ai.startRolling(); }
          if (st.ps > T0.L * 0.8 && V.q.s < T0.L * 0.2) { st.n++; if (st.n === 1) st.w0 = wmax(V); }
          st.ps = V.q.s;
        }
        if (st.n >= 3 || st.t >= 900) {
          const per = st.n >= 3 ? (wmax(V) - st.w0) / 2 : 0;
          job.res[comps[job.c]] = per > 0 ? Math.max(1, 0.8 / per) : null; job.st = null;
          if (++job.c >= comps.length) { TYRE_LIFE.cache.set(key, job.res); TYRE_LIFE.job = null; if (S.mode === 'menu') renderStartHint(); return; }
        }
      }
    } finally { DMG.scale = dk; TYW.scale = tk; }
    setTimeout(slice, 0);
  };
  setTimeout(slice, 50);
}
// laps for compound c on this circuit with the wear setting (null: still measuring or not measured)
function tyreLaps(c) {
  const lv = TYW_LEVELS[S.settings.tyres]; if (!(lv > 0)) return Infinity;
  const L = TYRES[c].kind === 'slick' ? tyreLifeGet() : null;
  return L ? (L[c] ? Math.max(1, Math.round(L[c] / lv)) : null) : null;
}
function tyreLifeLine() {
  if (!(TYW_LEVELS[S.settings.tyres] > 0)) return 'Desgaste de neumáticos desactivado en Ajustes';
  const L = tyreLifeGet(); if (!L) return 'Calculando cuánto dura cada compuesto en ' + trackLabel() + '…';
  return 'Vida en ' + trackLabel() + ': ' + ['S', 'M', 'H'].map(c => TYRES[c].name + ' ~' + (tyreLaps(c) || '?')).join(' · ') + ' vueltas';
}
// the same as three cells (compound colour, name, laps) for the menu
function tyreLifeCells(el) {
  el.textContent = '';
  if (!(TYW_LEVELS[S.settings.tyres] > 0) || !tyreLifeGet()) { el.textContent = tyreLifeLine(); el.classList.add('wait'); return; }
  el.classList.remove('wait');
  const h = document.createElement('span'); h.className = 'tl-h'; h.textContent = 'Vueltas hasta el 80 % de desgaste en ' + trackLabel(); el.appendChild(h);
  for (const c of ['S', 'M', 'H']) { const d = document.createElement('span'); d.className = 'tl-c'; d.style.setProperty('--tc', TYRES[c].col);
    d.innerHTML = '<i></i><span></span><b></b>'; d.querySelector('span').textContent = TYRES[c].name; d.querySelector('b').textContent = '~' + (tyreLaps(c) || '?'); el.appendChild(d); }
}
function tyreHint(kind) {
  const c = S.game.tyre, w0 = wxStart(), t = TYRES[c === 'auto' ? autoTyre(kind) : c];
  const life = Math.round(t.life * (TYW.scale > 0 ? 1 : 1)), laps = tyreLaps(t.id);
  let s = (c === 'auto' ? 'Auto → ' : '') + t.name + ' (' + t.code + ')';
  if (t.kind === 'slick') s += laps === Infinity ? ' · sin desgaste' : laps ? ' · ~' + laps + (laps === 1 ? ' vuelta' : ' vueltas') + ' de vida en ' + trackLabel() : '';
  else s += t.kind === 'inter' ? ' · pista húmeda, ~' + life + ' vueltas' : ' · lluvia fuerte, ~' + life + ' vueltas';
  if (t.kind === 'slick' && w0 > 0.12) s += ' · ¡PELIGRO: slicks con pista mojada!';
  else if (t.kind !== 'slick' && w0 < 0.1) s += ' · en seco se sobrecalientan, hacen ampollas y se destruyen en 2-3 vueltas';
  else if (t.kind === 'inter' && w0 > 0.75) s += ' · desbordadas con tanta agua (aquaplaning)';
  else if (t.kind === 'wet' && w0 < 0.35) s += ' · con poca agua van 4-6 s/vuelta más lentas';
  return s;
}
function tyreRequestCycle() {
  const R = SES; if (!R || R.mode === 'multi' || !car) return;
  const order = [null, ...TYRE_ORDER];
  const i = (order.indexOf(R.tyreReq || null) + 1) % order.length;
  R.tyreReq = order[i];
  toast(R.tyreReq ? 'Boxes: ' + TYRES[R.tyreReq].name + (R.tyreReq === car.ty.c ? ' nuevos' : '') + ' en la próxima parada (T cambia)' : 'Sin cambio de neumáticos', 2.6);
}
function renderPitTyres() {
  const f = $('pTyField'); if (!f) return;
  f.hidden = !(SES && SES.mode !== 'multi');
  if (f.hidden) return;
  const map = { none: 'Sin cambio' }; for (const c of TYRE_ORDER) map[c] = TYRES[c].name;
  segButtons($('pTyres'), map, SES.tyreReq || 'none', (k) => { SES.tyreReq = k === 'none' ? null : k; });
}
function fitPitTyres(c) {
  const sim = car.ty.sim; car.ty = newTyres(c, sim);
  setTyreMark(model, TYRES[c].col); TYHUD.t = 0;
}
// HUD: compound badge, wear and temperature per axle, water on the track, next pit tyre
const TYHUD = { t: 0, warn: 0, worn: false, hot: false, aqT: 0 };
function tyreFrame(dt) {
  const el = $('hTyre'), aq = $('hAqua');
  if (!SES || !car || S.mode !== 'race' && S.mode !== 'pause') { if (el && !el.hidden) el.hidden = true; if (aq && !aq.hidden) aq.hidden = true; return; }
  const live = S.mode === 'race';
  // aquaplaning warning
  const a = car.aqua || 0;
  if (aq) { const on = live && a > 0.3 && SES.state === 'run'; if (aq.hidden === on) aq.hidden = !on; }
  if (live) tyreSpray(dt);
  TYHUD.t -= dt; if (TYHUD.t > 0) return;
  TYHUD.t = 0.2;
  const ty = car.ty, t = TYRES[ty.c], wearOn = TYW.scale > 0;
  el.hidden = false;
  $('hTyB').style.setProperty('--tc', t.col);
  $('hTyB').firstChild.textContent = t.id;
  $('hTyAx').hidden = !wearOn;
  const wcol = (w) => w < 0.6 ? '#3ddc84' : w < 0.8 ? '#ffb23d' : '#ff4d4d';
  if (wearOn) {
    for (const [ax, k] of [['F', 'F'], ['R', 'R']]) {
      const w = Math.min(1, ty['w' + k]), b = $('hTyW' + ax); b.style.width = Math.max(2, (1 - w) * 100) + '%'; b.style.background = wcol(w);
      const T = ty['t' + k], x = (T - t.topt) / t.win, em = $('hTyT' + ax);
      em.textContent = Math.round(T) + '°'; em.className = x < -1 ? 'cold' : x > 1.7 ? 'hot' : x > 1 ? 'warm' : '';
    }
    const wm = Math.max(ty.wF, ty.wR);
    if (!TYHUD.worn && wm > 0.8 && live) { TYHUD.worn = true; toast('Neumáticos al límite · el agarre se desploma (T: pedir cambio)', 3.2); }
    if (wm < 0.2) TYHUD.worn = false;
    const ov = Math.max(ty.ovF, ty.ovR);
    if (!TYHUD.hot && ov > 0.35 && live) { TYHUD.hot = true; toast('Neumáticos sobrecalentados · levanta o desgastas más rápido', 3); }
    if (ov < 0.05) TYHUD.hot = false;
  }
  const wx = Math.round(Math.min(1, WXS.water) * 100);
  const bits = [];
  if (wx > 0) bits.push('<span>Agua <b>' + wx + '%</b></span>');
  if (car.tyG != null && wx > 0) { const g = Math.round(car.tyG * 100); bits.push('<span>Agarre <b class="' + (g < 62 ? 'bad' : '') + '">' + g + '%</b></span>'); }
  if (SES.tyreReq) bits.push('<span>Próx.: <b>' + TYRES[SES.tyreReq].name + '</b></span>');
  $('hTyI').innerHTML = bits.join('');
  if (t.kind === 'slick' && WXS.water > 0.18 && SES.state === 'run' && live && !TYHUD.wetWarn) { TYHUD.wetWarn = true; toast('Slicks sobre mojado: cambia a intermedios (T)', 3); }
  if (WXS.water < 0.1) TYHUD.wetWarn = false;
  // rain tyres on a drying / dry track: overheating, blisters, blocks tearing
  if (t.kind !== 'slick' && live && SES.state === 'run') {
    const bl = Math.max(ty.bF || 0, ty.bR || 0), ov = Math.max(ty.ovF, ty.ovR);
    if (!TYHUD.rainHot && ov > 0.3 && WXS.water < 0.2) { TYHUD.rainHot = true; toast((t.kind === 'wet' ? 'Lluvia extrema' : 'Intermedios') + ' en seco: se sobrecalientan · pisa zonas húmedas para enfriarlos o cambia a slicks (T)', 3.6); }
    if (!TYHUD.blist && bl > 0.25) { TYHUD.blist = true; toast('Ampollas en los neumáticos · los tacos se rompen y el agarre cae', 3.4); }
  } else { TYHUD.rainHot = false; TYHUD.blist = false; }
}
// water thrown up behind the cars
function tyreSpray(dt) {
  if (!DFX.ready || !(WXS.water > 0.1)) return;
  let budget = 8;
  for (const e of SES.entries) {
    if (budget <= 0) break;
    const V = e.veh; if (!V || e.isRemote || !e.model || !(e.isPlayer || e.model.root.visible)) continue;
    const dx = e.x - camera.position.x, dz = e.z - camera.position.z;
    if (!e.isPlayer && dx * dx + dz * dz > 140 * 140) continue;
    const sp = Math.abs(V.u), wl = V.wxNow || 0;
    if (sp < 22 || wl < 0.1) continue;
    const rate = (sp - 15) / 60 * Math.min(1, wl) * 26 * (V.aqua > 0.3 ? 1.6 : 1) * (e.isPlayer && CAMS[S.camIdx] === 'cockpit' ? 0.6 : 1);
    let n = rate * dt; n = Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
    const fx = Math.sin(V.h), fz = Math.cos(V.h), lx = Math.cos(V.h), lz = -Math.sin(V.h);
    for (let k = 0; k < n && budget > 0; k++, budget--) {
      const side = Math.random() < 0.5 ? 1 : -1, hw = (V.spec.wid || 1.9) * 0.4;
      const px = V.x - fx * (V.P.b + 0.1) + lx * side * hw, pz = V.z - fz * (V.P.b + 0.1) + lz * side * hw;
      const vs = Math.min(1, sp / 70);
      DFX.puff(px, V.y + 0.18, pz, fx * sp * 0.35 + (Math.random() - 0.5) * 1.5, 0.9 + vs * 1.6 + Math.random(), fz * sp * 0.35 + (Math.random() - 0.5) * 1.5, 0.7 + vs * 0.7, 0.82, 0.86, 0.9, 0.1 + 0.07 * Math.min(1, wl), 1.0 + vs * 0.5);
    }
  }
}
// the crew works while the car stands in the pit lane: tyres, nose and bodywork at the same time, heavier repairs one after another
const fmtStop = (x) => x.toFixed(1).replace('.', ',') + ' s';
function pitPlanNow() { return pitStopPlan(DMG.scale > 0 ? car.dmg : null, car.spec.body, !!SES.tyreReq); }
function pitRepair(dt) {
  const R = SES, bar = $('hRepair');
  const stop = () => { R.rep = null; bar.hidden = true; };
  if (R.mode === 'multi') { stop(); return; }
  const here = car.inPit && Math.abs(car.u) < 1.2 && !R.player.pitHold;
  if (!here) { if (R.rep && Math.abs(car.u) >= 1.2) toast('Parada interrumpida', 2.2); stop(); return; }
  if (!R.rep) {
    const P = pitPlanNow(); if (!P.jobs.length) { stop(); return; }
    R.rep = { t: 0, tot: P.tot, jobs: P.jobs, done: {}, dmg: P.dmg, tyre: R.tyreReq }; RW.clear();
    if (P.dmg) { R.valid = false; setValidChip(); }
    toast('Parada ' + fmtStop(P.tot) + ' · ' + P.jobs.map(j => j.label.toLowerCase() + ' ' + fmtStop(j.dur)).join(' + ') + ' · no te muevas', 4);
  }
  const rp = R.rep; rp.t += dt;
  for (const p of rp.jobs) if (rp.t >= p.t && !rp.done[p.part]) {
    rp.done[p.part] = true;
    if (p.part === 'tyres' && rp.tyre) { fitPitTyres(rp.tyre); if (R.tyreReq === rp.tyre) R.tyreReq = null; }
    if (DMG.scale > 0 && car.dmg && !(p.part === 'tyres' && !(Math.max(...car.dmg.tyre) > 0.02))) dmgRepairPart(car, p.part);
  }
  if (rp.t >= rp.tot) { R.lastStop = rp.tot; stop(); toast('Coche listo en ' + fmtStop(rp.tot) + ' · ¡a pista!', 2.6); return; }
  bar.hidden = false;
  const now = rp.jobs.filter(p => rp.t >= p.t0 && rp.t < p.t).map(p => p.label);
  $('hRepairT').textContent = (now.join(' + ') || 'Parada') + ' · ' + fmtStop(Math.max(0, rp.tot - rp.t));
  $('hRepairBar').style.width = Math.min(100, rp.t / rp.tot * 100) + '%';
}
// test hook: drive the car into the nearest wall
function crashTest(kmh, ang, side, sNom) {
  side = side || 1; const s = (sNom != null ? sNom : car.q.s / T.L * T.nom) * T.L / T.nom, i = Math.round(s / T.ds) % T.N;
  const bar = side > 0 ? T.barL[i] : T.barR[i];
  car.reset(i * T.ds, side * (bar - 6), true);
  car.h = Math.atan2(T.tx[i], T.tz[i]) + side * (ang || 20) * Math.PI / 180; car.u = kmh / 3.6;
  return 'ok';
}
// frame pacing: with the FPS cap (60 by default) a 120/144 Hz screen gets an even 60/72 FPS instead of redrawing the whole scene
// 120-144 times a second (the GPU's heat). The physics runs on its own fixed step either way. A still pause screen is drawn at 15 FPS.
let FREEZE = null;   // test hook: everything stands still, __spa.redraw() draws the same frame again
const PACE = { prev: 0, draw: 0, min: 1e9, ref: 16.7, t0: 0 };
function paceSkip(now) {
  // display refresh = shortest rAF interval of the last second (skipped refreshes cost nothing, so they show it)
  const iv = now - PACE.prev; PACE.prev = now;
  if (iv > 2) PACE.min = Math.min(PACE.min, iv);
  if (now - PACE.t0 > 1000) { PACE.t0 = now; if (PACE.min < 1e9) PACE.ref = PACE.min; PACE.min = 1e9; }
  const still = S.mode === 'pause' && !(SES && SES.mode === 'multi');
  const cap = still ? 15 : +S.settings.fpsCap || 0;
  // draw every k-th refresh (a whole number, so the pacing stays even): 120 Hz -> 60, 144 Hz -> 72, 90 / 100 Hz -> every refresh
  if (cap) { const k = Math.max(1, Math.floor(1000 / cap / PACE.ref + 0.25)); if (now - PACE.draw < (k - 0.5) * PACE.ref) return true; }
  PACE.draw = now; return false;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (FREEZE) { if (FREEZE.draw) { FREEZE.draw = false; lodFrame(); if (POST.ready && S.settings.quality !== 'bajo') POST.comp.render(0); else renderer.render(scene, camera); } return; }
  if (paceSkip(now)) return;
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) dt = 0.016; dt = Math.min(dt, 0.1);
  const running = SES && (S.mode === 'race' || (S.mode === 'results' && SES.kind === 'race') || (S.mode === 'pause' && SES.mode === 'multi'));
  if (running) {
    if (S.mode === 'race') readInput(dt); else { INPUT.throttle = 0; INPUT.brake = 0; INPUT.steer *= 0.9; }
    acc += dt; let n = 0;
    while (acc >= DT && n < 24) { sessionStep(DT); acc -= DT; n++; }
    if (n >= 24) acc = 0;
    if (S.mode === 'race') audio.update(car, INPUT.throttle, SES.state === 'run', WXS.rain, { view: CAMS[S.camIdx] === 'cockpit' && !S.lookBack ? 'in' : 'out', rivals: nearestRivals() }); else audio.mute();
    updateGhost();
    if (!skids) skids = new SkidMarks(scene);
    skids.update(SES.entries);
  } else {
    acc = 0;
    if (S.mode === 'menu') { car.rpm = car.P.red * 0.12; }
  }
  updateModelTransform(dt);
  updateCamera(dt);
  if (DFX.shake > 0.01 && S.mode === 'race') { camera.position.x += jit() * 0.09 * DFX.shake; camera.position.y += jit() * 0.07 * DFX.shake; camera.rotation.z += jit() * 0.012 * DFX.shake; }
  updateOthers(dt);
  netTags();
  lodFrame();
  damageFrame(dt);
  tyreFrame(dt);
  sky.update(dt, camera, model ? model.root.position : null);
  world.updateLOD(camera.position, dt); world.updateEscape(dt); world.updateTunnel(sky, camera.position);
  if (world.tunnel) renderer.toneMappingExposure = WEATHER[S.weather].exposure * (1 + 0.22 * (world.tunK || 0));   // eyes adapting inside the Monaco tunnel (v85)
  if (COACH_ST && SES) COACH_ST.line.frame(Math.abs(car.u), car.q.i, S.settings.lineMode === 'activa');
  if (SES && (S.mode === 'race' || S.mode === 'pause' || S.mode === 'results')) updateHUD(S.mode === 'pause' ? 0 : dt);
  if (SES && SES.kind === 'race' && SES.resultsShown && !$('results').hidden) { resT += dt; if (resT > 1) { resT = 0; showRaceResults(); } }
  if (POST.ready && S.settings.quality !== 'bajo') POST.comp.render(dt); else renderer.render(scene, camera);
  if (S.settings.fps) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { $('fps').textContent = Math.round(fpsN / fpsAcc) + ' FPS · ' + renderer.info.render.calls + ' draw calls · ' + (world.treeCount || 0) + ' árboles'; fpsAcc = 0; fpsN = 0; } }
}
// ---------------------------------------------------------------------------
//  Post-processing (medio / alto): MSAA HDR target, gentle bloom on lights and sun glare, filmic output,
//  then a light grade (saturation, contrast, vignette). Loaded on demand; falls back to plain rendering.
// ---------------------------------------------------------------------------
const POST = { ready: false, loading: false, failed: false };
// removes NaN / Inf / absurdly bright texels from the HDR image before the bloom blur spreads them into black or white squares
const SANITIZE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    bool bad(vec3 c) { return !(c.r < 6.0e4) || !(c.g < 6.0e4) || !(c.b < 6.0e4) || !(c.r > -1.0) || !(c.g > -1.0) || !(c.b > -1.0); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (bad(c.rgb)) {
        vec3 s = vec3(0.0); float n = 0.0;
        for (int i = 0; i < 8; i++) { float a = float(i) * 0.7853982; vec3 t = texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * 0.002).rgb; if (!bad(t)) { s += t; n += 1.0; } }
        c.rgb = n > 0.0 ? s / n : vec3(0.0);
      }
      c.rgb = min(c.rgb, vec3(64.0)); c.a = (c.a < 1.0 && c.a >= 0.0) ? c.a : 1.0;
      gl_FragColor = c; }`
};
// light grade (saturation, contrast, warmth, vignette) appended to the output pass (tone mapping + sRGB): one full-screen pass, not two
const GRADE = {
  uniforms: { uSat: { value: 1.08 }, uCon: { value: 1.05 }, uVig: { value: 0.32 }, uWarm: { value: 0.012 } },
  pars: 'uniform float uSat, uCon, uVig, uWarm;',
  main: `{ vec3 col = gl_FragColor.rgb; float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat); col = (col - 0.5) * uCon + 0.5; col += vec3(uWarm, uWarm * 0.4, -uWarm) * (1.0 - l);
      vec2 d = vUv - 0.5; col *= 1.0 - uVig * smoothstep(0.18, 0.75, dot(d, d) * 2.0);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), gl_FragColor.a); }`
};
async function initPost() {
  if (POST.ready || POST.loading || POST.failed) return; POST.loading = true;
  try {
    const [m1, m2, m3, m4, m5] = await Promise.all(['EffectComposer', 'RenderPass', 'UnrealBloomPass', 'OutputPass', 'ShaderPass'].map(n => import('three/addons/postprocessing/' + n + '.js')));
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType });
    const comp = new m1.EffectComposer(renderer, rt);
    // only the scene needs MSAA: RenderPass draws into the composer's first read buffer (renderTarget2); the full-screen passes after it
    // write to the plain renderTarget1 (sanitize, then bloom on top) and the output pass reads that one
    comp.renderTarget2.samples = renderer.capabilities.isWebGL2 ? 4 : 0;
    comp.addPass(new m2.RenderPass(scene, camera));
    comp.addPass(new m5.ShaderPass(SANITIZE));
    const bloom = new m3.UnrealBloomPass(new THREE.Vector2(sz.x, sz.y), 0.22, 0.5, 1.05);
    const out = new m4.OutputPass();
    Object.assign(out.uniforms, GRADE.uniforms);
    out.material.fragmentShader = out.material.fragmentShader.replace('varying vec2 vUv;', 'varying vec2 vUv;\n' + GRADE.pars).replace(/\}\s*$/, GRADE.main + '\n}');
    comp.addPass(bloom); comp.addPass(out);
    Object.assign(POST, { comp, bloom, grade: out, ready: true }); postSize();
  } catch (e) { console.warn('post-processing unavailable', e); POST.failed = true; }
  POST.loading = false;
}
function postSize() { if (!POST.ready) return; POST.comp.setPixelRatio(renderer.getPixelRatio()); POST.comp.setSize(window.innerWidth, window.innerHeight); }

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false); postSize();
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
}

// debug: render the scene into a half-float target and count NaN / Inf / huge texels (they turn into black squares through the bloom blur)
function nanScan() {
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2()), rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType });
  renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
  const buf = new Uint16Array(sz.x * sz.y * 4); renderer.readRenderTargetPixels(rt, 0, 0, sz.x, sz.y, buf); rt.dispose();
  let nan = 0, inf = 0, big = 0, first = null;
  for (let i = 0; i < buf.length; i++) { const e = (buf[i] >> 10) & 31; if (e === 31) { if (buf[i] & 1023) nan++; else inf++; if (!first) first = [(i >> 2) % sz.x, sz.y - 1 - Math.floor((i >> 2) / sz.x)]; } else if (e >= 29) big++; }
  return { nan, inf, big, first, w: sz.x, h: sz.y };
}
window.__spa = { S, tyreLife: () => ({ cache: Object.fromEntries(TYRE_LIFE.cache), job: TYRE_LIFE.job && { key: TYRE_LIFE.job.key, c: TYRE_LIFE.job.c, n: TYRE_LIFE.job.st && TYRE_LIFE.job.st.n, t: TYRE_LIFE.job.st && +TYRE_LIFE.job.st.t.toFixed(1) } }), menuStep(k, anim) { setMenuStep(k, { instant: !anim }); return MENU_UI.step; }, sheet(full) { MENU_UI.sheet.set(MENU_UI.det[full ? 0 : 1]); sheetSettled(); return MENU_UI.det; }, menuUI: MENU_UI, nanScan, freeze(on) { FREEZE = on ? { draw: false } : null; return 'ok'; }, redraw() { if (FREEZE) FREEZE.draw = true; return 'ok'; }, lod(on) { if (on != null) LOD_ON = on !== false; return { on: LOD_ON, jobs: LOD_JOBS.length, ms: Math.round(LOD_MS) }; }, async lodFlush() { for (let k = 0; k < 600 && (LOD_JOBS.length || (LOD_W && LOD_W.pend.size)); k++) await new Promise(r => setTimeout(r, 100)); return { worker: !!LOD_W, left: LOD_JOBS.length, ms: Math.round(LOD_MS) }; }, get INPUT() { return INPUT; }, switchTrack, post: () => POST.ready, get TRACK() { return TRACK; }, audioLab: { CarAudio, EngineVoice, engineProfile, engineWave }, get car() { return car; }, get model() { return model; }, get race() { return SES; }, get world() { return world; }, get skids() { return skids; }, get camera() { return camera; }, get T() { return T; }, get DFX() { return DFX; }, get coach() { return COACH_ST; }, setLineMode, crashTest, startSession, rewind, get RW() { return RW; }, selectCar, cycleCam, net: () => ({ code: NET.code, host: NET.host, mode: NET.mode, avail: NET.avail, err: NET.err, joining: NET.joining, closed: NET.closed, room: netRoomState().ps.map(p => ({ peer: p.peer, me: p.sameTab, name: pres(p).name, car: pres(p).car, c1: pres(p).c1, host: pres(p).host, rdy: pres(p).rdy, trk: pres(p).trk, ph: pres(p).ph })), canStart: !!netRoomState().canStart, remotes: SES && SES.mode === 'multi' ? SES.entries.filter(e => e.isRemote).map(e => ({ name: e.name, x: e.x, z: e.z, mode: e.mode, off: e.off, jit: e.jit, gap: e.gap, left: e.left, vis: !!(e.model && e.model.root.visible), tag: !!(e.tag && !e.tag.hidden) })) : null, startText: $('startLbl').textContent, startHint: $('startHint').textContent, disabled: $('startBtn').disabled, toast: $('netToast').hidden ? '' : $('netToast').textContent, notices: (netNotify.log || []).slice(), note: $('lobbyNote').hidden ? '' : $('lobbyNote').textContent }), get netLab() { return { netSampleAt, normCode, codeValid, netClock, netDelay, netRenderTime }; }, netJoin, lobbyPrimary, openLobby, netReady, netHostSettings, netNotify, netDbg: () => ({ code: NET.code, host: NET.host, off: NET.offset, seen: NET.cfgSeen, peers: NET.peers.map(p => [p.peer, p.sameTab, pres(p).code, pres(p).host, pres(p).ph, pres(p).cfg && pres(p).cfg.seq, pres(p).cfg && pres(p).cfg.startAt - Date.now()]) }), setAuto(k) { AUTO = k != null ? { k } : null; }, renderer: () => renderer, menu: MENU, setWeather, WXS, TYRES, tyreRequestCycle, startFromMenu, endQuali,
  view(sN, d, h, back, lookD, fov) { $('menu').hidden = true; const s = ((sN + T.nom) % T.nom) * T.L / T.nom; const p = trackPoint(T, s - (back || 0), d), t = trackPoint(T, s, lookD != null ? lookD : d); DEBUGCAM = [p.x, p.e + h, p.z, t.x, t.e + 1, t.z, fov || 60]; return 'ok'; }, noview() { DEBUGCAM = null; }, cam(a, b, c, d, e, f, g) { $('menu').hidden = true; DEBUGCAM = [a, b, c, d, e, f, g || 60]; return 'ok'; },
  camAt(p, t, fov) { $('menu').hidden = true; model.root.updateMatrixWorld(true); const a = model.body.localToWorld(new THREE.Vector3(p[0], p[1], p[2])), b = model.body.localToWorld(new THREE.Vector3(t[0], t[1], t[2])); DEBUGCAM = [a.x, a.y, a.z, b.x, b.y, b.z, fov || 40]; return 'ok'; },
  orbit(ang, dist, h, fov) { $('menu').hidden = true; const a = car.h + ang, y = car.y; DEBUGCAM = [car.x + Math.sin(a) * dist, y + h, car.z + Math.cos(a) * dist, car.x, y + 0.55, car.z, fov || 35]; return 'ok'; },
  simulate(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { if (i % 4 === 0) readInput(DT * 4); sessionStep(DT); if (!SES) break; } return { t: SES.t, s: car.q.s, lap: SES.player.lap, laps: SES.laps.map(l => [Math.round(l.time * 1000) / 1000, l.valid, l.clean]), pos: SES.kind === 'race' ? raceOrder().indexOf(SES.player) + 1 : null, state: SES.state, fin: SES.player.fin }; } };
boot();
