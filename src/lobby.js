// =============================================================================
//  Multiplayer · room UI inside the menu sheet (step «Sesión», mode «Multijugador»)
// =============================================================================
// No modal: the room lives in the same glass sheet as the rest of the menu, so the steps Pista and Coche stay
// one tap away while you are in a room (the host picks the circuit there; anyone changes car or colour there).
//   not in a room : name + colour · code field (joins by itself on the 4th character) · «Crear sala privada»
//   in a room     : big code + Copiar · pilots with status · race settings (host edits, guests see) ·
//                   «Cambiar coche o color» · Salir. A room chip in the sheet head shows the code on every step.
//   footer button : Crear sala · Conectando… · ¡Estoy listo! / Listo ✓ (guest) · Iniciar carrera (host, only
//                   when every guest is ready on the host's circuit)
// Pop-up notices (netNotify) for errors, the host leaving and pilots coming and going, in the menu and on track.
const NET_WEB = 'https://juanserodriguezh.github.io/tu-record-juego/';   // public build (GitHub Pages, PeerJS): anyone can host there
const NET_COLORS = ['#e10600', '#ff8000', '#f6c21c', '#27c26a', '#00a3e0', '#2b4bd8', '#8f3fe0', '#ff4fa0', '#f2f2f2', '#16181d'];
const lobbyOn = () => S.mode === 'menu' && S.game.mode === 'multi';
function initLobbyUI() {
  $('netName').value = S.game.name || '';
  $('netName').addEventListener('input', (e) => { S.game.name = e.target.value.slice(0, 16); saveGame(); netProfileSync(); });
  const sw = $('netColors');
  for (const c of NET_COLORS) { const b = document.createElement('button'); b.type = 'button'; b.dataset.c = c; b.style.background = c; b.setAttribute('aria-label', 'Color ' + c); b.addEventListener('click', () => { setLivery({ col: c }); }); sw.appendChild(b); }
  let autoT = 0;
  $('netCode').addEventListener('input', (e) => {
    const c = normCode(e.target.value); e.target.value = c;
    clearTimeout(autoT);
    // four valid characters = a complete code: join without another tap
    if (codeValid(c) && !NET.code && !NET.joining) autoT = setTimeout(() => { if ($('netCode').value === c && !NET.code && !NET.joining) netJoin(c, false); }, 250);
  });
  $('netCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('netJoin').click(); } });
  $('netJoin').addEventListener('click', () => { clearTimeout(autoT); const c = normCode($('netCode').value); if (!c) { $('netCode').focus(); return; } netJoin(c, false); });
  $('netCreate').addEventListener('click', () => netJoin(newCode(), true));
  $('netCopy').addEventListener('click', () => copyText(NET.code, $('netCopy'), 'Copiado ✓'));
  $('netCopyLink').addEventListener('click', () => copyText(joinLink(), $('netCopyLink'), 'Enlace copiado ✓'));
  $('netBar').addEventListener('click', () => openLobby());
  $('netCar').addEventListener('click', () => setMenuStep('coche'));
  $('netLeave').addEventListener('click', () => { if (NET.code || NET.joining) netLeaveRoom(); });
  $('btnJoin').addEventListener('click', () => openLobby(true));
  $('netModes').addEventListener('click', () => { const b = $('modeTabs').querySelector('[data-k="practica"]'); if (b) b.click(); });
}
// Menu -> «Unirse a sala» (top bar) -> code -> joined. Also used when coming back from a race.
function openLobby(focusCode) {
  S.game.mode = 'multi'; saveGame();
  [...$('modeTabs').children].forEach(c => c.setAttribute('aria-selected', String(c.dataset.k === 'multi')));
  if (S.mode === 'menu') { setMenuStep('sesion'); if (MENU_UI.mobile) sheetTo(MENU_UI.det[0], 0); }
  netInit(); renderStartHint();
  if (focusCode && !NET.code) setTimeout(() => { try { $('netCode').focus({ preventScroll: true }); } catch (e) { } }, 380);
}
function copyText(txt, btn, done) {
  const ok = () => { const t = btn.dataset.lbl || (btn.dataset.lbl = btn.textContent); btn.textContent = done; clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = t; }, 1500); netNotify('Código ' + NET.code + ' copiado: pégalo en el chat para invitar'); };
  const show = () => { $('netLinkText').hidden = false; $('netLinkText').textContent = txt; };
  try { navigator.clipboard.writeText(txt).then(ok, show); } catch (e) { show(); }
}
const joinLink = () => location.href.split('#')[0] + '#' + NET.code;
// pop-up notice (glass pill at the top); kind 'err' is red-edged and stays a bit longer
function netNotify(msg, kind) {
  (netNotify.log || (netNotify.log = [])).push(msg); if (netNotify.log.length > 20) netNotify.log.shift();   // last notices (tests)
  const el = $('netToast'); if (!el) return;
  el.textContent = msg; el.className = 'ntoast' + (kind === 'err' ? ' err' : ''); el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(netNotify.t); netNotify.t = setTimeout(() => { el.hidden = true; }, kind === 'err' ? 5200 : 3200);
}
const initials = (n) => { const w = String(n || 'P').trim().split(/\s+/); return ((w[0] || 'P')[0] + (w[1] ? w[1][0] : (w[0][1] || ''))).toUpperCase(); };
// readable ink on any avatar colour
const inkOn = (hex) => { const h = hexOr(hex, '#888888'); const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff'; };
function avatarHtml(name, col) { const c = hexOr(col, '#888888'); return `<span class="avatar" style="background:${c};color:${inkOn(c)}">${esc(initials(name))}</span>`; }

// footer button: label, hint and state for the multiplayer mode (called from renderStartHint)
function lobbyFoot() {
  const btn = $('startBtn');
  let lbl, hint, dis = false, rdy = false;
  if (NET.avail === false && NET.err === 'claude') { lbl = 'Abrir la versión web'; hint = 'Aquí no se pueden crear salas sin acceso al artefacto'; }
  else if (NET.avail === false) { lbl = 'Reintentar'; hint = 'El modo online no está disponible'; }
  else if (NET.pending) { lbl = 'Conectando…'; hint = 'Preparando el modo online'; dis = true; }
  else if (NET.joining) { lbl = 'Conectando…'; hint = (NET.host ? 'Creando la sala ' : 'Entrando en la sala ') + NET.joinCode; dis = true; }
  else if (!NET.code) { lbl = 'Crear sala privada'; hint = 'o escribe arriba el código de un amigo'; }
  else if (NET.host) {
    const st = netRoomState(), n = st.waiting.length;
    lbl = 'Iniciar carrera'; dis = !st.canStart;
    hint = n ? 'Esperando a ' + n + (n === 1 ? ' piloto' : ' pilotos') : st.ps.length < 2 ? 'Solo tú en la sala · comparte el código' : 'Todos listos · ' + st.ps.length + ' pilotos';
  } else {
    rdy = !!myPres().rdy;
    lbl = rdy ? 'Listo ✓' : '¡Estoy listo!'; hint = rdy ? 'Pulsa para cancelar · el anfitrión inicia la carrera' : 'Avisa al anfitrión de que puedes salir';
  }
  btn.disabled = dis; btn.classList.toggle('ready', rdy);
  return [lbl, hint];
}
function lobbyPrimary() {
  if (NET.avail === false && NET.err === 'claude') { try { window.open($('netWeb').href, '_blank', 'noopener'); } catch (e) { } return; }   // retrying cannot help: the room does not admit this viewer
  if (NET.avail === false) { NET.connecting = null; NET.avail = null; NET.err = null; peerLib = null; netInit(); renderLobby(); return; }
  if (NET.joining || NET.pending) return;
  if (NET.avail == null) { const c = normCode($('netCode').value); return codeValid(c) ? netJoin(c, false) : netJoin(newCode(), true); }   // queued until the module loads
  if (!NET.code) { const c = normCode($('netCode').value); return codeValid(c) ? netJoin(c, false) : netJoin(newCode(), true); }
  if (NET.host) return netHostStart();
  netReady(!myPres().rdy); renderLobby();
}
function renderLobby() {
  const panel = $('netPanel'); if (!panel) return;
  const on = S.game.mode === 'multi';
  $('netBar').hidden = !NET.code;
  if (NET.code) { $('netBarCode').textContent = NET.code; $('netBarN').textContent = roomPeers().length + '/' + NET_MAX; }
  panel.hidden = !on; $('quickOpts').hidden = on;
  // in a room the session step IS the room: the other modes step aside until you leave it
  // multiplayer takes the whole step: the other modes fold away behind «Otros modos» (shown only outside a room)
  const inRoom = on && !!(NET.code || NET.joining), ttl = document.querySelector('.page[data-step="sesion"] .pg-title');
  $('modeTabs').hidden = on; $('netModes').hidden = !on || inRoom;
  if (ttl) ttl.textContent = inRoom ? 'Sala privada' : on ? 'Multijugador' : '¿Qué quieres hacer?';
  if (!on) return;
  if (NET.avail == null) netInit();
  if (S.mode === 'menu') renderStartHint();
  const sp = carById(S.carId), liv = liveryOf(sp), note = $('lobbyNote');
  $('netAvatar').outerHTML = avatarHtml(pilotName(), liv.col).replace('class="avatar"', 'class="avatar big" id="netAvatar"');
  for (const b of $('netColors').children) b.setAttribute('aria-pressed', String(b.dataset.c.toLowerCase() === String(liv.col).toLowerCase()));
  const setNote = (txt, err) => { note.textContent = txt; note.classList.toggle('err', !!err); note.hidden = !txt; };
  // inside Claude, viewers the room does not admit (public link, signed out) can still play: the web version (PeerJS) lets anyone host
  const web = $('netWeb'), inClaude = !!(window.claude && typeof window.claude.use === 'function');
  // not admitted: the footer button opens it; admitted: a quiet row for friends without access (rooms here and there do not mix)
  web.href = NET_WEB;
  web.hidden = !(inClaude && NET.avail === true && NET.mode === 'room' && !NET.code && !NET.joining);
  if (NET.avail === false) { setNote(NET_ERR[NET.err] || (NET.mode === 'room' ? 'La sala de Claude no está disponible ahora mismo.' : NET_ERR.lib), true); $('lobbyJoin').hidden = true; $('lobbyRoom').hidden = true; return; }
  if (NET.avail == null) { setNote(NET.pending ? (NET.pending.host ? 'Preparando el modo online… la sala se crea en cuanto esté listo.' : 'Preparando el modo online… entrarás en ' + NET.pending.code + ' en cuanto esté listo.') : 'Preparando el modo online…'); $('lobbyJoin').hidden = true; $('lobbyRoom').hidden = true; return; }
  if (NET.joining) { setNote((NET.host ? 'Creando la sala ' : 'Conectando con la sala ') + NET.joinCode + '…'); $('lobbyJoin').hidden = false; $('lobbyRoom').hidden = true; $('netJoin').disabled = true; $('netCreate').disabled = true; return; }
  $('netJoin').disabled = false; $('netCreate').disabled = false;
  if (!NET.code) {
    setNote(NET.err ? NET_ERR[NET.err] || '' : '', !!NET.err);
    $('lobbyJoin').hidden = false; $('lobbyRoom').hidden = true; $('netLinkText').hidden = true; return;
  }
  $('lobbyJoin').hidden = true; $('lobbyRoom').hidden = false;
  $('netRoomCode').textContent = NET.code; $('netCopyLink').hidden = NET.mode !== 'p2p';
  const st = netRoomState();
  setNote(NET.err === 'server' ? NET_ERR.server : '', NET.err === 'server');
  $('netCount').textContent = st.ps.length + ' de ' + NET_MAX + (NET.mode === 'p2p' && !NET.host && NET.room && NET.room.via ? (NET.room.via === 'relay' ? ' · conexión por servidor' : ' · conexión directa') : '');
  const order = st.ps.slice().sort((a, b) => (pres(b).host - pres(a).host) || ((pres(a).since || 0) - (pres(b).since || 0)));
  $('netPlayers').innerHTML = order.map(p => {
    const pr = pres(p), c = carById(pr.car), [s, k] = netPilotStatus(p, st);
    return `<li>${avatarHtml(pr.name || 'Piloto', pr.c1)}<span class="who"><b>${esc(String(pr.name || 'Piloto').slice(0, 16))}${p.sameTab ? ' <span class="tag">Tú</span>' : ''}</b><small>${esc(c ? c.name : '')}</small></span><span class="pst ${k}">${s}</span></li>`;
  }).join('') + (st.ps.length < 2 ? '<li class="empty"><small>Comparte el código: quien lo escriba entra directo a esta sala.</small></li>' : '');
  // race settings: the host edits them, guests see the host's values
  const box = $('netHostCfg'); box.innerHTML = '';
  const hp = st.h ? pres(st.h) : {}, laps = NET.host ? S.game.netLaps : +hp.lp || 3, col = NET.host ? !!S.game.netCol : hp.col !== 0;
  const row = (label, right) => { const d = document.createElement('div'); d.className = 'qs'; const l = document.createElement('span'); l.className = 'ql'; l.textContent = label; d.appendChild(l); right(d); box.appendChild(d); };
  const txt = (d, t) => { const b = document.createElement('b'); b.className = 'ro'; b.textContent = t; d.appendChild(b); };
  row('Pista', (d) => { if (NET.host) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = trackLabel() + ' ›'; b.addEventListener('click', () => setMenuStep('pista')); d.appendChild(b); } else txt(d, (TRACK_DEFS[st.trk] || TRACK).name || trackLabel()); });
  row('Vueltas', (d) => {
    if (!NET.host) return txt(d, laps);
    const mk = (s, dv) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = s; b.setAttribute('aria-label', 'Vueltas: ' + (dv < 0 ? 'menos' : 'más')); b.disabled = dv < 0 ? laps <= 1 : laps >= 20; b.addEventListener('click', () => netHostSettings({ netLaps: clamp(laps + dv, 1, 20) })); return b; };
    const v = document.createElement('b'); v.textContent = laps; d.append(mk('−', -1), v, mk('+', 1));
  });
  if (NET.host) {
    const t = document.createElement('button'); t.type = 'button'; t.className = 'qs toggle';
    t.innerHTML = '<span class="ql">Colisiones</span><b></b>'; t.setAttribute('aria-pressed', String(col));
    t.addEventListener('click', () => netHostSettings({ netCol: S.game.netCol ? 0 : 1 })); box.appendChild(t);
  } else row('Colisiones', (d) => txt(d, col ? 'Sí' : 'No (fantasmas)'));
  $('netCarName').textContent = sp.name + ' · se ve igual para todos';
  $('netStatus').textContent = NET.host ? 'Eres el anfitrión: eliges pista (paso 1), vueltas y colisiones. El clima es el tuyo.' : 'El anfitrión elige la pista y empieza la carrera. Puedes cambiar de coche mientras esperas.';
}
