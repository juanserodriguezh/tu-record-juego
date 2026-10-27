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
const DEFAULTS = { quality: 'medio', draw: 'normal', fov: 62, fps: false, abs: true, tc: true, esc: true, autoShift: true, steerAssist: true, steerSens: 1.0, minimap: true, lineMode: 'off', ghost: true, units: 'kmh', volume: 0.7, volEngine: 1, volFx: 0.8, muted: false, damage: 'real', tyres: 'normal' };
const GAME_DEFAULTS = { mode: 'practica', start: 'grid', rivals: false, nRivals: 12, diff: 5, rivalCars: 'mismo', laps: 3, gridPos: 'medio', qualiMin: 10, name: '', tyre: 'auto' };
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
    renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: q !== 'bajo', powerPreference: 'high-performance' });
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
    const hc = (location.hash || '').slice(1).toUpperCase();
    if (/^[A-HJ-NP-Z2-9]{4}$/.test(hc)) {
      S.game.mode = 'multi'; [...$('modeTabs').children].forEach(c => c.setAttribute('aria-selected', String(c.dataset.k === 'multi'))); renderStartHint();
      $('netCode').value = hc; NET.pendingCode = hc; openLobby();
    }
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
  const tt = $('trackTabs'); if (tt) [...tt.children].forEach(b => b.setAttribute('aria-pressed', String(fam(b.dataset.k) === fam(D.id))));
  // layouts of the selected circuit (Tocancipá): one button per layout
  const lt = $('layoutTabs');
  if (lt) { const lays = Object.values(TRACK_DEFS).filter(d => d.layout && fam(d.id) === fam(D.id));
    lt.hidden = lays.length < 2;
    if (!lt.hidden && lt.dataset.fam !== fam(D.id)) { lt.dataset.fam = fam(D.id); lt.innerHTML = '';
      for (const d of lays) { const b = document.createElement('button'); b.type = 'button'; b.dataset.k = d.id; b.textContent = d.layout;
        b.addEventListener('click', () => { if (NET.code && !NET.host) return; switchTrack(d.id).then(ok => { if (ok && NET.code) netSet({ trk: TRACK.id }); }); }); lt.appendChild(b); } }
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
}
const accelCache = {};
function zeroTo100(sp) {
  if (accelCache[sp.id] != null) return accelCache[sp.id];
  const v = new Vehicle(sp, T); v.reset(1500, 0);
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
    b.addEventListener('click', () => { S.game.mode = k; saveGame(); [...mt.children].forEach(c => c.setAttribute('aria-selected', String(c.dataset.k === k))); renderStartHint(); });
    mt.appendChild(b);
  }
  $('prevCar').addEventListener('click', () => stepCar(-1));
  $('nextCar').addEventListener('click', () => stepCar(1));
  $('startBtn').addEventListener('click', startFromMenu);
  $('sessBtn').addEventListener('click', openSessionOptions);
  $('sessClose').addEventListener('click', () => { $('session').hidden = true; });
  $('sessGo').addEventListener('click', () => { $('session').hidden = true; startFromMenu(); });
  for (const b of $('trackTabs').children) b.addEventListener('click', () => {
    if (NET.code && !NET.host) { $('lobbyNote').textContent = 'El anfitrión elige el circuito.'; return; }
    if (b.dataset.k.startsWith('toca_') && TRACK.id.startsWith('toca_')) return;
    switchTrack(b.dataset.k).then(ok => { if (ok && NET.code) netSet({ trk: TRACK.id }); });
  });
  applyTrackTexts();
  $('btnSettings').addEventListener('click', () => openSettings());
  $('btnControls').addEventListener('click', () => { $('controls').hidden = false; });
  $('ctlClose').addEventListener('click', () => { $('controls').hidden = true; });
  $('pResume').addEventListener('click', resume);
  $('pRepair').addEventListener('click', () => { dmgRepairAll(car); $('pRepair').hidden = true; if (SES) { SES.rep = null; $('hRepair').hidden = true; toast('Coche reparado'); } });
  $('pRestart').addEventListener('click', () => { $('pause').hidden = true; restartSession(); });
  $('pSettings').addEventListener('click', () => openSettings());
  $('pMenu').addEventListener('click', () => { $('pause').hidden = true; leaveSession(); });
  $('pEnd').addEventListener('click', () => { $('pause').hidden = true; S.mode = 'race'; endQuali(); });
  $('pauseBtn').addEventListener('click', () => { if (S.mode === 'race') pause(); });
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
  const curEl = ul.querySelector('[aria-current="true"]'); if (curEl) curEl.scrollIntoView({ block: 'nearest' });
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
  const special = ['f1', 'f1h', 'indy', 'lmp', 'fe'].includes(sp.body) || !!sp.model;
  segButtons($('segPattern'), special ? { solido: 'Original' } : PATTERNS, special ? 'solido' : liv.pattern, (k) => setLivery({ pattern: k }));
  segButtons($('segFinish'), FINISH, liv.finish, (k) => setLivery({ finish: k }));
  segButtons($('segRim'), RIMNAMES, liv.rim, (k) => setLivery({ rim: k }));
  renderStartHint();
}
function setLivery(patch) {
  const sp = carById(S.carId);
  S.liveries[sp.id] = Object.assign(liveryOf(sp), patch);
  store.set('liveries', S.liveries);
  placeModel(); updateModelTransform(0); renderSpec();
}
function renderStartHint() {
  const g = S.game, w = WEATHER[S.weather].name.toLowerCase() + (isWet() ? ' (mojado)' : '');
  const riv = `${g.nRivals} rivales · IA ${g.diff} (${DIFFN(g.diff).toLowerCase()})`;
  let lbl = 'Salir a pista', hint = '';
  if (g.mode === 'practica') hint = (g.start === 'pits' ? 'Desde boxes' : 'Salida parada') + ' · ' + (g.rivals ? riv : 'sin rivales') + ' · ' + w;
  else if (g.mode === 'rapida') { lbl = 'Empezar carrera'; hint = `${g.laps} ${g.laps === 1 ? 'vuelta' : 'vueltas'} · ${riv} · ${g.start === 'pits' ? 'desde boxes' : 'parrilla ' + { pole: 'pole', medio: 'media', ultimo: 'última', aleatoria: 'aleatoria' }[g.gridPos]}`; }
  else if (g.mode === 'completa') { lbl = 'Ir a clasificación'; hint = `Clasif. ${g.qualiMin} min + ${g.laps} ${g.laps === 1 ? 'vuelta' : 'vueltas'} · ${riv}`; }
  else { lbl = 'Abrir sala'; hint = 'Juega con amigos usando un código de sala'; }
  $('startLbl').textContent = lbl; $('startHint').textContent = hint;
  $('sessBtn').hidden = g.mode === 'multi';
  renderQuick();
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
    const h = document.createElement('div'); h.className = 'ty-hint'; h.textContent = tyreHint(g.mode === 'practica' ? 'practice' : 'race'); box.appendChild(h);
  }
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
  if (m === 'multi') return openLobby();
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
  segButtons($('setDamage'), { off: 'Desactivado', low: 'Reducido', real: 'Realista' }, st.damage, (k) => { st.damage = k; save(); syncEnv(); });
  segButtons($('setTyres'), { off: 'Desactivado', normal: 'Normal', fast: 'Acelerado ×2.5' }, st.tyres, (k) => { st.tyres = k; save(); syncEnv(); });
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
    if (e.code === 'KeyT') tyreRequestCycle();
    if (e.code === 'KeyL') { const ks = Object.keys(LINE_MODES); setLineMode(ks[(ks.indexOf(S.settings.lineMode) + 1) % ks.length], true); }
    if (e.code === 'KeyE' || e.code === 'ShiftRight') INPUT.shiftUp = true;
    if (e.code === 'KeyQ' || e.code === 'ControlRight') INPUT.shiftDown = true;
    if (e.code === 'Escape' || e.code === 'KeyP') pause();
  } else if (S.mode === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) resume();
  if (e.code === 'KeyM') toggleMute();
  else if (S.mode === 'menu') {
    const overlay = !$('settings').hidden || !$('controls').hidden || !$('session').hidden || !$('lobby').hidden;
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
    const special = ['f1', 'f1h', 'indy', 'lmp', 'fe'].includes(sp.body) || !!sp.model;
    let col = LIV_COLS[Math.floor(rnd() * LIV_COLS.length)], col2 = LIV_COLS[Math.floor(rnd() * LIV_COLS.length)];
    if (col2 === col) col2 = col === '#0e0f11' ? '#f4f4f4' : '#0e0f11';
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
  $('menu').hidden = true; $('hud').hidden = false; $('pause').hidden = true; $('results').hidden = true; $('lobby').hidden = true; $('session').hidden = true;
  $('touch').hidden = !S.touch;
  $('lights').hidden = R.state !== 'lights'; [...$('lights').children].forEach(i => i.classList.remove('on'));
  $('hDelta').hidden = true; $('banner').hidden = true; $('toast').hidden = true; $('hRepair').hidden = true;
  $('hHints').style.opacity = 1;
  for (const id of ['hS1', 'hS2', 'hS3']) { $(id).className = 'sec'; $(id).querySelector('b').textContent = '—'; }
  $('hLast').textContent = '—'; $('hBest').textContent = best ? fmtTime(best.time) : '—';
  $('hCam').textContent = camName(CAMS[S.camIdx]);
  $('pEnd').hidden = kind !== 'quali';
  $('pRestart').hidden = mode === 'multi';
  setValidChip();
  for (const m of world.lightMats) m.color.setHex(0x2a0606);
  INPUT.steer = 0; INPUT.throttle = 0; INPUT.brake = 0;
  renderStandings();
  if (kind === 'quali') banner(`<div class="big">Clasificación</div><div class="sub">${g.qualiMin} minutos · sal de boxes y marca tu mejor vuelta</div>`, 3.5);
  else if (kind === 'practice' && R.state === 'run') banner('<div class="big">Práctica</div><div class="sub">Sal de boxes · el crono arranca al cruzar la línea</div>', 3);
  else if (pe.pitHold) toast('Salida desde boxes: espera al semáforo verde', 5);
  if (mode !== 'multi' && wxStart() > 0.12 && R.state === 'run') setTimeout(() => { if (SES === R) toast(S.weather === 'secando' ? 'Pista secándose · vigila el cruce a slicks (T: neumáticos en boxes)' : 'Pista mojada · cuidado con pianos, línea de goma y charcos', 4.5); }, 3600);
  if (mode === 'multi') $('lobby').hidden = true;
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
  if (audio) audio.mute();
  const sp = carById(S.carId); car = new Vehicle(sp, T); car.reset(GRID_S(), GRID_D);
  placeModel(); updateModelTransform(0);
  SES = null; refreshIdeal(); $('hCoach').hidden = true;
  S.times = store.get('times', {});
  renderGarage(); renderSpec();
  for (const m of world.lightMats) m.color.setHex(0x2a0606);
  if (world.pitLightMat) world.pitLightMat.color.setHex(0x18c040);
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
function toast(msg, t) { const el = $('toast'); el.textContent = msg; el.hidden = false; if (SES) SES.msgT = t || 2.6; }
function setValidChip() {
  const el = $('hValid'); if (!SES) return;
  if (SES.kind === 'race' && SES.lap1) { el.className = 'chip warn'; el.textContent = 'Salida'; return; }
  if (!SES.valid) { el.className = 'chip bad'; el.textContent = SES.inPitLap ? 'Boxes' : 'Inválida'; }
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
      if (B.isRemote) { if (A.isPlayer && B.kin) collideCars(A.veh, B.kin); continue; }
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
      R.valid = true; R.clean = true; R.inPitLap = false; setValidChip();
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
  const entry = { n: R.lapNum, time: lapTime, valid, clean: R.clean, sectors, pit: R.inPitLap, first: !!R.lap1 };
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
    else if (!valid) banner(`<div class="time">${fmtTime(lapTime)}</div><div class="sub">${R.lap1 ? 'Vuelta de salida' : R.inPitLap ? 'Vuelta por boxes' : 'Vuelta inválida'}</div>`, 3);
    else banner(`<div class="time">${fmtTime(lapTime)}</div>${deltaTxt}`, 3);
  }
  R.lapNum++; R.lapStart = crossT; R.valid = true; R.clean = true; R.cp = [false, false]; R.lap1 = false;
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
    const vis = (e.x - cx) ** 2 + (e.z - cz) ** 2 < far * far;
    e.model.root.visible = vis;
    if (vis) poseModel(e.model, e.veh, 0, e.ai.inp.brake > 0.05, dt);
  }
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
    const r = (model.L * 1.25 + 3.4) * MENU.zoom;
    const cx = car.x, cz = car.z, cy = car.y;
    const h = car.h + MENU.ang;
    camera.position.set(cx + Math.sin(h) * r * Math.cos(MENU.pitch), cy + 0.35 + r * Math.sin(MENU.pitch) + 0.6, cz + Math.cos(h) * r * Math.cos(MENU.pitch));
    camera.lookAt(cx, cy + model.H * 0.42, cz);
    const W = window.innerWidth, Hh = window.innerHeight, wide = W > 820;
    const gar = $('menu').querySelector('.garage').getBoundingClientRect(), spc = $('menu').querySelector('.spec').getBoundingClientRect();
    const cxFree = wide ? (gar.right + spc.left) / 2 : W / 2;
    camera.setViewOffset(W, Hh, W / 2 - cxFree, wide ? -Hh * 0.04 : Hh * 0.12, W, Hh);
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
function updateHUD(dt) {
  const R = SES; if (!R) return;
  const st = S.settings;
  const lapT = R.state === 'run' && R.started ? R.t - R.lapStart : 0;
  $('hTime').textContent = fmtTime(lapT);
  $('hLap').textContent = R.kind === 'race' ? clamp(R.player.lap + 1, 1, R.raceLaps) : R.lapNum;
  $('hLapOf').textContent = R.kind === 'race' ? '/' + R.raceLaps : '';
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
  $('hSpeed').textContent = Math.round(Math.abs(car.u) * (mph ? 2.23694 : 3.6));
  $('hUnit').textContent = mph ? 'mph' : 'km/h';
  $('hGear').textContent = car.gear === -1 ? 'R' : (R.state === 'lights' || R.player.pitHold ? 'N' : car.gear);
  const x = clamp(car.rpm / car.P.red, 0, 1);
  $('hRpm').style.width = (x * 100).toFixed(1) + '%';
  const lamps = $('hShift').children, lit = Math.round(clamp((x - 0.72) / 0.26, 0, 1) * 8);
  for (let i = 0; i < 8; i++) lamps[i].className = i < lit ? (lit >= 8 ? 'b' : i < 3 ? 'g' : 'r') : '';
  $('hThr').style.width = Math.round(INPUT.throttle * 100) + '%';
  $('hBrk').style.width = Math.round(INPUT.brake * 100) + '%';
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
//  Multiplayer (room presence): lobby by code, synced start, live car states
// ---------------------------------------------------------------------------
const NET = { room: null, mode: null, avail: null, peers: [], code: null, host: false, offset: null, startPerf: 0, lastSend: 0, cfgSeen: 0, connecting: null, err: null, joining: false };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// ---- transport A: the Claude room (signed-in viewers of the artifact)
// ---- transport B: direct browser-to-browser (WebRTC through PeerJS), no account: works wherever the
//      page is hosted outside Claude. The host relays everyone's state (star), emulating the room API.
const P2P_PREFIX = 'spa-record-v1-';
let peerLib = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLib) return peerLib;
  const urls = ['https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.5/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js'];
  peerLib = new Promise((res, rej) => {
    const next = (k) => {
      if (k >= urls.length) { peerLib = null; rej(new Error('lib')); return; }
      const sc = document.createElement('script'); sc.src = urls[k]; sc.async = true;
      sc.onload = () => window.Peer ? res(window.Peer) : next(k + 1); sc.onerror = () => next(k + 1);
      document.head.appendChild(sc);
    };
    next(0);
  });
  return peerLib;
}
class P2PRoom {
  constructor(Peer) { this.Peer = Peer; this.pj = null; this.id = null; this.list = new Map(); this.me = {}; this.fns = []; this.errs = []; this.conns = new Map(); this.hostConn = null; this.isHost = false; this.dead = false; }
  peers() { return [...this.list.values()].map(e => ({ peer: e.peer, sameTab: e.peer === this.id, kind: 'viewer', presence: e.presence, updatedAt: e.at })); }
  onPeers(fn, err) { this.fns.push(fn); if (err) this.errs.push(err); }
  emit() { const ps = this.peers(); for (const f of this.fns) { try { f({ peers: ps }); } catch (e) { } } }
  fail(code) { if (this.dead) return; for (const f of this.errs) { try { f(code); } catch (e) { } } }
  softLost() {
    const pj = this.pj; if (this.dead || !pj) return;
    try { if (pj.disconnected && !pj.destroyed) pj.reconnect(); } catch (e) { }
    clearTimeout(this.lostT);
    this.lostT = setTimeout(() => { if (!this.dead && pj.disconnected && ![...this.conns.values()].some(c => c.open)) this.fail('server'); }, 10000);
  }
  opts() { const o = Object.assign({ debug: 0 }, window.__P2P_SERVER || {}); return o; }
  presence(patch) {
    for (const k in patch) { if (patch[k] === null) delete this.me[k]; else this.me[k] = patch[k]; }
    if (!this.id) return Promise.resolve();
    const p = Object.assign({}, this.me);
    this.list.set(this.id, { peer: this.id, presence: p, at: Date.now() });
    if (this.isHost) this.broadcast({ t: 'u', peer: this.id, p });
    else if (this.hostConn && this.hostConn.open) { try { this.hostConn.send({ t: 'p', p }); } catch (e) { } }
    this.emit();
    return Promise.resolve();
  }
  broadcast(msg, except) { for (const [id, c] of this.conns) if (id !== except && c.open) { try { c.send(msg); } catch (e) { } } }
  snapshot() { return { t: 'all', list: [...this.list.values()].map(e => ({ peer: e.peer, p: e.presence })) }; }
  // host: claim the code on the signalling server, then accept players
  host(code) {
    this.isHost = true;
    return new Promise((res, rej) => {
      const pj = this.pj = new this.Peer(P2P_PREFIX + code, this.opts());
      const to = setTimeout(() => rej('timeout'), 12000);
      pj.on('open', (id) => { clearTimeout(to); this.id = id; this.presence({}); res(this); });
      // after the room is up, a lost signalling socket does not break the open player links: reconnect quietly,
      // and only report it if the host is left with nobody connected and cannot get back
      pj.on('error', (e) => { clearTimeout(to); const t = e && e.type; if (!this.id) rej(t === 'unavailable-id' ? 'taken' : t === 'browser-incompatible' ? 'browser' : 'server'); else if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') this.softLost(); });
      pj.on('connection', (c) => {
        c.on('open', () => { this.conns.set(c.peer, c); try { c.send(this.snapshot()); } catch (e) { } });
        c.on('data', (m) => {
          if (!m || m.t !== 'p' || typeof m.p !== 'object' || m.p === null) return;
          this.list.set(c.peer, { peer: c.peer, presence: m.p, at: Date.now() });
          this.broadcast({ t: 'u', peer: c.peer, p: m.p }, c.peer); this.emit();
        });
        const gone = () => { if (!this.conns.has(c.peer)) return; this.conns.delete(c.peer); this.list.delete(c.peer); this.broadcast({ t: 'x', peer: c.peer }); this.emit(); };
        c.on('close', gone); c.on('error', gone);
      });
      pj.on('disconnected', () => { if (!this.dead) { try { pj.reconnect(); } catch (e) { } } });
    });
  }
  // guest: connect to the host of the code
  join(code) {
    return new Promise((res, rej) => {
      const pj = this.pj = new this.Peer(undefined, this.opts());
      const to = setTimeout(() => rej('timeout'), 15000);
      pj.on('open', (id) => {
        this.id = id;
        const c = this.hostConn = pj.connect(P2P_PREFIX + code, { reliable: true, serialization: 'json' });
        c.on('open', () => { clearTimeout(to); this.presence({}); res(this); });
        c.on('data', (m) => {
          if (!m || typeof m !== 'object') return;
          const now = Date.now();
          if (m.t === 'all' && Array.isArray(m.list)) { const mine = this.list.get(this.id); this.list.clear(); for (const e of m.list) if (e && e.peer && e.peer !== this.id) this.list.set(e.peer, { peer: e.peer, presence: e.p || {}, at: now }); if (mine) this.list.set(this.id, mine); }
          else if (m.t === 'u' && m.peer && m.peer !== this.id) this.list.set(m.peer, { peer: m.peer, presence: m.p || {}, at: now });
          else if (m.t === 'x' && m.peer) this.list.delete(m.peer);
          this.emit();
        });
        c.on('close', () => { const mine = this.list.get(this.id); this.list.clear(); if (mine) this.list.set(this.id, mine); this.emit(); this.fail('hostgone'); });
      });
      pj.on('error', (e) => { clearTimeout(to); const t = e && e.type; if (t === 'peer-unavailable') rej('nohost'); else if (!this.hostConn || !this.hostConn.open) rej(t === 'browser-incompatible' ? 'browser' : 'server'); else if (t === 'network' || t === 'server-error' || t === 'socket-error') { try { if (pj.disconnected && !pj.destroyed) pj.reconnect(); } catch (er) { } } });
      pj.on('disconnected', () => { if (!this.dead && this.hostConn && this.hostConn.open) { try { pj.reconnect(); } catch (e) { } } });
    });
  }
  destroy() { this.dead = true; try { this.pj && this.pj.destroy(); } catch (e) { } this.list.clear(); this.conns.clear(); }
}
for (const ev of ['beforeunload', 'pagehide']) window.addEventListener(ev, () => { if (NET.mode === 'p2p' && NET.room) NET.room.destroy(); });

function netInit() {
  if (NET.connecting) return NET.connecting;
  NET.connecting = (async () => {
    let room = null;
    try { if (window.claude && typeof window.claude.use === 'function') room = await window.claude.use('room'); } catch (e) { room = null; }
    if (room) {
      NET.mode = 'room'; NET.room = room; NET.avail = true;
      room.onPeers((ch) => { NET.peers = ch.peers; onNetPeers(); }, () => { NET.avail = false; renderLobby(); });
      NET.peers = room.peers();
    } else if (window.claude && typeof window.claude.use === 'function') {
      // inside Claude without room access (signed out / public link): this frame blocks direct connections too
      NET.mode = 'p2p'; NET.avail = false; NET.err = 'claude';
    } else {
      NET.mode = 'p2p';
      try { await loadPeerJS(); NET.avail = true; } catch (e) { NET.avail = false; NET.err = 'lib'; }
    }
    renderLobby();
    if (NET.pendingCode && NET.avail) { const c = NET.pendingCode; NET.pendingCode = null; netJoin(c, false); }
  })();
  return NET.connecting;
}
const pres = (p) => (p && p.presence) || {};
const myPeer = () => NET.peers.find(p => p.sameTab);
const roomPeers = () => NET.peers.filter(p => p.kind !== 'agent' && pres(p).g === 'spa1' && pres(p).code && pres(p).code === NET.code);
const roomHost = () => roomPeers().filter(p => pres(p).host).sort((a, b) => (pres(a).since || 0) - (pres(b).since || 0))[0];
function netSet(patch) { if (NET.room) NET.room.presence(Object.assign({ now: Date.now() }, patch)).catch(() => { }); }
const newCode = () => { let code = ''; do { code = ''; for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; } while (NET.mode === 'room' && NET.peers.some(p => pres(p).code === code)); return code; };
function copyText(txt, btn, done) {
  const ok = () => { const t = btn.textContent; btn.textContent = done; setTimeout(() => { btn.textContent = t; }, 1500); };
  try { navigator.clipboard.writeText(txt).then(ok, () => { $('netLinkText').hidden = false; $('netLinkText').textContent = txt; }); } catch (e) { $('netLinkText').hidden = false; $('netLinkText').textContent = txt; }
}
const joinLink = () => location.href.split('#')[0] + '#' + NET.code;
function initLobbyUI() {
  $('netName').value = S.game.name || '';
  $('netName').addEventListener('input', (e) => { S.game.name = e.target.value.slice(0, 16); saveGame(); if (NET.code) netSet({ name: S.game.name || 'Piloto' }); });
  $('netCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('netCreate').addEventListener('click', () => netJoin(newCode(), true));
  $('netJoin').addEventListener('click', () => { const c = $('netCode').value.trim().toUpperCase(); if (c.length === 4) netJoin(c, false); else $('lobbyNote').textContent = 'El código tiene 4 caracteres.'; });
  $('netCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('netJoin').click(); });
  $('netCopy').addEventListener('click', () => copyText(NET.code, $('netCopy'), 'Copiado'));
  $('netCopyLink').addEventListener('click', () => copyText(joinLink(), $('netCopyLink'), 'Enlace copiado'));
  $('netLaps').value = S.game.laps; $('netLapsVal').textContent = S.game.laps;
  $('netLaps').addEventListener('input', (e) => { $('netLapsVal').textContent = e.target.value; });
  $('netLeave').addEventListener('click', () => { if (NET.code || NET.joining) netLeaveRoom(); else $('lobby').hidden = true; });
  $('netStart').addEventListener('click', netHostStart);
}
function openLobby() { $('lobby').hidden = false; renderLobby(); netInit(); }
function netPresence(code, host) {
  const sp = carById(S.carId), liv = liveryOf(sp);
  return { g: 'spa1', trk: TRACK.id, code, host: host ? 1 : 0, since: Date.now(), name: S.game.name || 'Piloto', car: sp.id, c1: liv.col, c2: liv.col2, pt: liv.pattern, fn: liv.finish, rm: liv.rim, ph: 'lobby', st: null, fin: null, cfg: null };
}
function netLeaveRoom() {
  if (NET.mode === 'p2p') { if (NET.room) NET.room.destroy(); NET.room = null; NET.peers = []; }
  else netSet({ code: null, host: 0, ph: null, cfg: null, st: null });
  NET.code = null; NET.host = false; NET.joining = false; NET.err = null; renderLobby();
}
function netJoin(code, host, tries) {
  NET.cfgSeen = 0; NET.offset = host ? 0 : null; NET.err = null;
  if (NET.mode !== 'p2p') { NET.code = code; NET.host = host; netSet(netPresence(code, host)); renderLobby(); return; }
  if (NET.room) { NET.room.destroy(); NET.room = null; NET.peers = []; }
  NET.joining = true; NET.code = null; NET.host = host; NET.joinCode = code; renderLobby();
  const Peer = window.Peer, room = new P2PRoom(Peer);
  (host ? room.host(code) : room.join(code)).then(() => {
    if (!NET.joining || NET.joinCode !== code) { room.destroy(); return; }
    NET.joining = false; NET.room = room; NET.code = code;
    room.onPeers((ch) => { NET.peers = ch.peers; onNetPeers(); }, (why) => { NET.err = why; renderLobby(); });
    netSet(netPresence(code, host));
    NET.peers = room.peers(); renderLobby();
  }).catch((why) => {
    room.destroy();
    if (!NET.joining || NET.joinCode !== code) return;
    if (host && why === 'taken' && (tries || 0) < 4) { netJoin(newCode(), true, (tries || 0) + 1); return; }
    NET.joining = false; NET.code = null; NET.err = why; renderLobby();
  });
}
function onNetPeers() {
  const h = roomHost();
  if (h && !h.sameTab && pres(h).now) { const o = h.updatedAt - pres(h).now; if (NET.offset == null || o < NET.offset) NET.offset = o; }
  if (h && h.sameTab) NET.offset = 0;
  if (NET.code && h && !NET.host) {
    const ht = pres(h).trk;
    if (ht && TRACK_DEFS[ht] && ht !== TRACK.id && S.mode === 'menu' && !trackBusy) switchTrack(ht).then(ok => { if (ok && NET.code) netSet({ trk: TRACK.id }); });
    const cfg = pres(h).cfg;
    if (cfg && cfg.seq && cfg.seq !== NET.cfgSeen && pres(h).ph === 'race' && cfg.startAt + (NET.offset || 0) > Date.now() - 2000) { NET.cfgSeen = cfg.seq; netStartRace(cfg); }
  }
  if (!$('lobby').hidden) renderLobby();
  if (SES && SES.mode === 'multi') netSyncRemotes();
}
const NET_ERR = {
  lib: 'No se pudo cargar el módulo online. Revisa tu conexión a internet y vuelve a abrir esta ventana.',
  claude: 'Dentro de Claude, el online solo funciona con la sesión de Claude iniciada. Para jugar con cualquiera sin cuenta, abre la versión del juego publicada fuera de Claude: allí basta con compartir el código o el enlace de la sala.',
  server: 'No se pudo conectar con el servidor de salas. Revisa tu conexión y prueba otra vez; algunas redes de colegios o empresas bloquean este tipo de conexión.',
  timeout: 'La conexión tardó demasiado. Prueba otra vez; si sigue fallando, puede que tu red bloquee las conexiones directas.',
  nohost: 'No hay ninguna sala abierta con ese código. Revisa el código o pide que la vuelvan a crear.',
  taken: 'No se pudo reservar un código libre. Prueba otra vez.',
  browser: 'Este navegador no permite conexiones directas entre jugadores. Prueba con Chrome, Edge, Firefox o Safari actualizados.',
  hostgone: 'El anfitrión cerró la sala o perdió la conexión.'
};
function renderLobby() {
  const note = $('lobbyNote'), p2p = NET.mode === 'p2p';
  $('netCopyLink').hidden = !p2p; if (!NET.code) $('netLinkText').hidden = true;
  if (NET.avail === false && NET.mode === 'room') {
    note.textContent = 'La sala de Claude no está disponible ahora mismo.';
    $('lobbyJoin').hidden = true; $('lobbyRoom').hidden = true; $('netStart').hidden = true; $('netLeave').textContent = 'Cerrar'; return;
  }
  if (NET.avail === false) {
    note.textContent = NET_ERR[NET.err] || NET_ERR.lib;
    $('lobbyJoin').hidden = true; $('lobbyRoom').hidden = true; $('netStart').hidden = true; $('netLeave').textContent = 'Cerrar'; return;
  }
  if (NET.avail == null) { note.textContent = 'Preparando el modo online…'; $('lobbyJoin').hidden = true; $('lobbyRoom').hidden = true; $('netStart').hidden = true; return; }
  if (NET.joining) { note.textContent = (NET.host ? 'Creando la sala ' : 'Conectando con la sala ') + NET.joinCode + '…'; $('lobbyJoin').hidden = true; $('lobbyRoom').hidden = true; $('netStart').hidden = true; $('netLeave').textContent = 'Cancelar'; return; }
  if (!NET.code) {
    const base = p2p ? 'Crea una sala y comparte el código o el enlace. Tus amigos solo tienen que abrir este mismo juego: no necesitan cuenta.' : 'Crea una sala y comparte el código con tus amigos, o escribe el código que te hayan pasado. Todos deben tener abierto este mismo juego.';
    note.textContent = NET.err ? NET_ERR[NET.err] || base : base;
    $('lobbyJoin').hidden = false; $('lobbyRoom').hidden = true; $('netStart').hidden = true; $('netLeave').textContent = 'Cerrar'; return;
  }
  $('lobbyJoin').hidden = true; $('lobbyRoom').hidden = false; $('netLeave').textContent = 'Salir de la sala';
  $('netRoomCode').textContent = NET.code;
  const ps = roomPeers(), host = roomHost();
  note.textContent = NET.err === 'hostgone' ? NET_ERR.hostgone : NET.err === 'server' ? NET_ERR.server : NET.host ? 'Eres el anfitrión: cuando estén todos, pulsa «Empezar carrera». Se usa tu clima actual.' : host ? 'Conectado. Espera a que el anfitrión empiece la carrera.' : 'Esperando al anfitrión de la sala ' + NET.code + '…';
  $('netPlayers').innerHTML = ps.map(p => { const pr = pres(p), sp = carById(pr.car); return `<li><span>${esc(String(pr.name || 'Piloto').slice(0, 16))}${pr.host ? '<span class="tag start">Anfitrión</span>' : ''}${p.sameTab ? '<span class="tag">Tú</span>' : ''}</span><small>${esc(sp ? sp.name : '')}${pr.ph === 'race' ? ' · en carrera' : ''}</small></li>`; }).join('') || '<li><small>Nadie más todavía</small></li>';
  $('netHostCfg').hidden = !NET.host; $('netStart').hidden = !NET.host;
  $('netStatus').textContent = TRACK.name + ' · ' + ps.length + (ps.length === 1 ? ' piloto en la sala' : ' pilotos en la sala') + (p2p ? ' · conexión directa' : '');
}
function netHostStart() {
  if (!NET.host) return;
  const grid = roomPeers().map(p => p.peer).sort(() => Math.random() - 0.5);
  const cfg = { seq: Date.now() % 1000000, laps: +$('netLaps').value, weather: S.weather, trk: TRACK.id, startAt: Date.now() + 8000, grid };
  netSet({ ph: 'race', cfg });
  NET.cfgSeen = cfg.seq; netStartRace(cfg);
}
async function netStartRace(cfg) {
  const me = myPeer(); if (!me || !Array.isArray(cfg.grid)) return;
  const localStart = cfg.startAt + (NET.offset || 0);
  NET.startPerf = performance.now() + (localStart - Date.now());
  if (cfg.trk && TRACK_DEFS[cfg.trk] && cfg.trk !== TRACK.id) { if (SES) { disposeEntries(); SES = null; } store.set('track', cfg.trk); trackBusy = true; try { await loadTrack(cfg.trk); } finally { trackBusy = false; } if (NET.code) netSet({ trk: TRACK.id }); }
  if (WEATHER[cfg.weather] && cfg.weather !== S.weather) setWeather(cfg.weather);
  const laps = clamp(Math.round(+cfg.laps || 3), 1, 20);
  const slot = Math.max(0, cfg.grid.indexOf(me.peer));
  startSession('race', { mode: 'multi', seq: cfg.seq });
  SES.raceLaps = laps; SES.grid = cfg.grid;
  const sl = world.gridSlots[Math.min(slot, world.gridSlots.length - 1)];
  car.reset(sl.s, sl.d); snapshot(SES.player); SES.player.prevS = SES.player.s; SES.player.progress = SES.player.s; SES.prevS = car.q.s; SES.player.grid = slot + 1;
  netSet({ ph: 'race', rs: cfg.seq, fin: null, st: null });
  netSyncRemotes();
}
function netTick() {
  const now = performance.now();
  if (now - NET.lastSend < 50) return;
  NET.lastSend = now;
  const r2 = (v) => Math.round(v * 100) / 100;
  netSet({ st: [r2(car.x), r2(car.z), Math.round(car.h * 1000) / 1000, r2(car.u), r2(car.v), SES.player.lap, r2(car.q.s), r2(car.y)], rs: SES.netSeq });
}
function netFinish(t) { netSet({ fin: Math.round(t * 1000) / 1000, rs: SES.netSeq }); }
function netLeaveRace() { netSet({ ph: 'lobby', st: null }); NET.startPerf = 0; }
function netSyncRemotes() {
  const R = SES; if (!R || R.mode !== 'multi') return;
  const seen = new Set();
  for (const p of roomPeers()) {
    if (p.sameTab) continue;
    const pr = pres(p); if (pr.rs !== R.netSeq) continue;
    seen.add(p.peer);
    let e = R.entries.find(x => x.peer === p.peer);
    if (!e) {
      const sp = carById(pr.car) || CARS[0];
      const liv = { col: /^#[0-9a-f]{6}$/i.test(pr.c1) ? pr.c1 : sp.col, col2: /^#[0-9a-f]{6}$/i.test(pr.c2) ? pr.c2 : sp.col2, col3: sp.col3, pattern: PATTERNS[pr.pt] ? pr.pt : 'solido', finish: FINISH[pr.fn] ? pr.fn : 'brillo', rim: RIMNAMES[pr.rm] ? pr.rm : 'plata' };
      const m = buildCar(sp, liv, { lite: true }); scene.add(m.root); m.root.visible = false;
      if (m.blob) m.blob.visible = S.settings.quality === 'bajo';
      const nm = String(pr.name || 'Piloto').slice(0, 16);
      e = newEntry({ id: p.peer, peer: p.peer, isRemote: true, name: nm, code: nm.slice(0, 3).toUpperCase(), sp, model: m, len: sp.len, wid: sp.wid, buf: [], q: newQ(), hint: -1, wheelRot: 0, grid: ((R.grid || []).indexOf(p.peer) + 1) || null });
      R.entries.push(e);
    }
    const st = pr.st;
    if (Array.isArray(st) && st.length >= 8 && st.every(v => typeof v === 'number' && isFinite(v))) {
      const lastB = e.buf[e.buf.length - 1];
      if (!lastB || lastB.st !== st) { e.buf.push({ t: performance.now(), st }); if (e.buf.length > 20) e.buf.shift(); }
      e.lap = st[5]; e.progress = st[5] * T.L + st[6];
    }
    if (typeof pr.fin === 'number' && isFinite(pr.fin) && pr.fin > 0) { e.fin = true; e.finT = pr.fin; e.finLaps = R.raceLaps; }
    e.left = false;
  }
  for (const e of R.entries) if (e.isRemote && !seen.has(e.peer)) { e.left = true; if (e.model) e.model.root.visible = false; }
  if (R.resultsShown) showRaceResults();
}
function netPoseRemote(e, dt) {
  if (e.left || !e.buf.length) { e.model.root.visible = false; e.kin = null; return; }
  const tR = performance.now() - 110;
  let a = e.buf[0], b = null;
  for (let k = e.buf.length - 1; k >= 0; k--) if (e.buf[k].t <= tR) { a = e.buf[k]; b = e.buf[k + 1] || null; break; }
  const A = a.st;
  let x, z, h, u, v, y;
  if (b) { const f = clamp((tR - a.t) / Math.max(1, b.t - a.t), 0, 1), B = b.st; x = lerp(A[0], B[0], f); z = lerp(A[1], B[1], f); h = A[2] + wrapAng(B[2] - A[2]) * f; u = lerp(A[3], B[3], f); v = lerp(A[4], B[4], f); y = lerp(A[7], B[7], f); }
  else { const ex = clamp((tR - a.t) / 1000, 0, 0.3); x = A[0] + (A[3] * Math.sin(A[2]) + A[4] * Math.cos(A[2])) * ex; z = A[1] + (A[3] * Math.cos(A[2]) - A[4] * Math.sin(A[2])) * ex; h = A[2]; u = A[3]; v = A[4]; y = A[7]; }
  const vx = u * Math.sin(h) + v * Math.cos(h), vz = u * Math.cos(h) - v * Math.sin(h);
  e.x = x; e.z = z; e.u = u; e.vx = vx; e.vz = vz;
  T.project(x, z, e.hint, e.q); e.hint = e.q.i; e.s = e.q.s; e.d = e.q.d; e.i = e.q.i;
  e.kin = { kin: true, x, z, h, vx, vz, len: e.len, wid: e.wid };
  const r = e.model.root; r.visible = true;
  r.position.set(x, y, z); r.rotation.order = 'YXZ'; r.rotation.set(0, h, 0);
  e.wheelRot += u / 0.34 * dt; for (const w of e.model.wheels) spinWheel(w, e.wheelRot);
}

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
  const eff = S.game.laps * (TYW.scale > 0 ? TYW.scale : 1);
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
function tyreHint(kind) {
  const c = S.game.tyre, w0 = wxStart(), t = TYRES[c === 'auto' ? autoTyre(kind) : c];
  const life = Math.round(t.life * (TYW.scale > 0 ? 1 : 1));
  let s = (c === 'auto' ? 'Auto → ' : '') + t.name + ' (' + t.code + ')';
  if (t.kind === 'slick') s += ' · ~' + life + ' vueltas de vida en Spa';
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
    R.rep = { t: 0, tot: P.tot, jobs: P.jobs, done: {}, dmg: P.dmg, tyre: R.tyreReq };
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
function frame(now) {
  requestAnimationFrame(frame);
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
  damageFrame(dt);
  tyreFrame(dt);
  sky.update(dt, camera, model ? model.root.position : null);
  world.updateLOD(camera.position, dt); world.updateEscape(dt);
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
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.08 }, uCon: { value: 1.05 }, uVig: { value: 0.32 }, uWarm: { value: 0.012 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uCon, uVig, uWarm; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb; float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat); col = (col - 0.5) * uCon + 0.5; col += vec3(uWarm, uWarm * 0.4, -uWarm) * (1.0 - l);
      vec2 d = vUv - 0.5; col *= 1.0 - uVig * smoothstep(0.18, 0.75, dot(d, d) * 2.0);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a); }`
};
async function initPost() {
  if (POST.ready || POST.loading || POST.failed) return; POST.loading = true;
  try {
    const [m1, m2, m3, m4, m5] = await Promise.all(['EffectComposer', 'RenderPass', 'UnrealBloomPass', 'OutputPass', 'ShaderPass'].map(n => import('three/addons/postprocessing/' + n + '.js')));
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
    const comp = new m1.EffectComposer(renderer, rt);
    comp.addPass(new m2.RenderPass(scene, camera));
    comp.addPass(new m5.ShaderPass(SANITIZE));
    const bloom = new m3.UnrealBloomPass(new THREE.Vector2(sz.x, sz.y), 0.22, 0.5, 1.05);
    comp.addPass(bloom); comp.addPass(new m4.OutputPass());
    const grade = new m5.ShaderPass(GRADE); comp.addPass(grade);
    Object.assign(POST, { comp, bloom, grade, ready: true }); postSize();
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
window.__spa = { S, nanScan, get INPUT() { return INPUT; }, switchTrack, post: () => POST.ready, get TRACK() { return TRACK; }, audioLab: { CarAudio, EngineVoice, engineProfile, engineWave }, get car() { return car; }, get model() { return model; }, get race() { return SES; }, get world() { return world; }, get skids() { return skids; }, get camera() { return camera; }, get T() { return T; }, get DFX() { return DFX; }, get coach() { return COACH_ST; }, setLineMode, crashTest, startSession, selectCar, cycleCam, netDbg: () => ({ code: NET.code, host: NET.host, off: NET.offset, seen: NET.cfgSeen, peers: NET.peers.map(p => [p.peer, p.sameTab, pres(p).code, pres(p).host, pres(p).ph, pres(p).cfg && pres(p).cfg.seq, pres(p).cfg && pres(p).cfg.startAt - Date.now()]) }), setAuto(k) { AUTO = k != null ? { k } : null; }, renderer: () => renderer, menu: MENU, setWeather, WXS, TYRES, tyreRequestCycle, startFromMenu, endQuali,
  view(sN, d, h, back, lookD, fov) { $('menu').hidden = true; const s = ((sN + T.nom) % T.nom) * T.L / T.nom; const p = trackPoint(T, s - (back || 0), d), t = trackPoint(T, s, lookD != null ? lookD : d); DEBUGCAM = [p.x, p.e + h, p.z, t.x, t.e + 1, t.z, fov || 60]; return 'ok'; }, noview() { DEBUGCAM = null; }, cam(a, b, c, d, e, f, g) { $('menu').hidden = true; DEBUGCAM = [a, b, c, d, e, f, g || 60]; return 'ok'; },
  camAt(p, t, fov) { $('menu').hidden = true; model.root.updateMatrixWorld(true); const a = model.body.localToWorld(new THREE.Vector3(p[0], p[1], p[2])), b = model.body.localToWorld(new THREE.Vector3(t[0], t[1], t[2])); DEBUGCAM = [a.x, a.y, a.z, b.x, b.y, b.z, fov || 40]; return 'ok'; },
  orbit(ang, dist, h, fov) { $('menu').hidden = true; const a = car.h + ang, y = car.y; DEBUGCAM = [car.x + Math.sin(a) * dist, y + h, car.z + Math.cos(a) * dist, car.x, y + 0.55, car.z, fov || 35]; return 'ok'; },
  simulate(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { if (i % 4 === 0) readInput(DT * 4); sessionStep(DT); if (!SES) break; } return { t: SES.t, s: car.q.s, lap: SES.player.lap, laps: SES.laps.map(l => [Math.round(l.time * 1000) / 1000, l.valid, l.clean]), pos: SES.kind === 'race' ? raceOrder().indexOf(SES.player) + 1 : null, state: SES.state, fin: SES.player.fin }; } };
boot();
