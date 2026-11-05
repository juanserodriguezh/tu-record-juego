# ARMK Racing (antes «Tu récord») — juego de carreras en el navegador

Juego 3D con three.js 0.160 (cargado desde jsDelivr). Incluye 5 circuitos: Spa-Francorchamps, Monza, Albert Park, Tocancipá (6 trazados) y Mónaco, 24 coches escaneados, IA, daños, neumáticos, clima, multijugador por sala y audio sintetizado.
El resultado es una sola página `dist/spa.html` más los modelos en `dist/models/packN.wasm`.

## Cómo trabajar con el usuario (Juanse)
- Responde en español: directo, crítico y orientado a resultados. Si algo es incorrecto o mejorable, dilo y propón la alternativa. Sé honesto con las limitaciones.
- **Verifica siempre con capturas** (`tools/shot.mjs`) y con medidas (`tools/headless.js`) antes de dar algo por terminado.
- Después de cada cambio visible, deja una nota corta en `HANDOFF.md` (versión, causa, arreglo y cómo se verificó).
- **Publicar siempre (decisión de Juanse):** todo cambio del juego, una vez verificado, se fusiona a `main`, sube de versión (v67, v68…) y se publica en el artefacto **sin preguntar**. Ver «Publicación».
- **Autor de los commits:** todos van a nombre de `Juanse <juanserodriguezh@gmail.com>`. En cada clon nuevo: `git config user.name "Juanse"` y `git config user.email "juanserodriguezh@gmail.com"`.

## Comandos
```bash
npm install                 # solo para las capturas (playwright); el build no tiene dependencias
npx playwright install chromium
node build.js               # dist/spa.html + dist/models/packN.wasm
node build.js --lines       # además recalcula la trazada ideal (~10 s); solo si cambió un circuito
node build.js --single      # además dist/online/index.html con los modelos dentro (un solo archivo grande)
npm run serve               # http://localhost:8000  (file:// no sirve: la página hace fetch de los .wasm)
node tools/headless.js accel amg_gt3,w17   # 0-100 / 0-200 / 0-300 / vmax con la física real del juego
node tools/headless.js ailap monza amg_gt3,w17 5   # vueltas de la IA sola (pista, coches, nivel 1-10)
node tools/headless.js tyres               # comprueba que las barreras de neumáticos quedan por fuera de la curva
node tools/headless.js city                # Mónaco: ningún edificio ni tribuna dentro de los muros (exit 1 si falla)
node tools/headless.js pits                # tribunas, boxes y postes no se pisan entre sí ni con la pista (exit 1 si falla)
node tools/headless.js pitstop             # tiempo de parada por categoría y daño
node tools/headless.js pitwall [pistas] [coche]   # choques contra el muro de boxes y el de la vía de salida desde los dos lados: ninguno lo atraviesa (exit 1 si falla, ~10 min todas)
node tools/headless.js barrels            # barriles: golpes a 8/80/150 km/h, torres, pirámide, bloque de agua, determinismo, coste, amortiguadores en los 10 trazados (exit 1 si falla)
node tools/headless.js walls [old]        # GT3 contra hormigón, armco y neumáticos (ángulos y velocidades); old = materiales anteriores a v97
node tools/headless.js tyrelife monaco amg_gt3 [nivel]   # vueltas hasta el 80 % de desgaste por compuesto (S/M/H) con IA a ritmo, en seco
node tools/headless.js tyretemp toca_largo,monaco amg_gt3   # temperatura de neumáticos por vuelta (media/pico, % recalentado) con IA a ritmo
node tools/headless.js coach monza amg_gt3   # línea adaptativa: zonas y juicio de 3 pilotos IA (exit 1 si falla)
node tools/headless.js rewind monza amg_gt3,w17   # rebobinado: restauración exacta, daño, coste y línea adaptativa (exit 1 si falla)
node tools/net_test.mjs p2p|relay|room|lab   # multijugador: 3 páginas reales entran por código (PeerJS local / relé MQTT sin WebRTC / sala de Claude emulada) y laboratorio de interpolación y predicción (exit 1 si falla; necesita THREE_DIR y, para p2p/relay, NET_DEPS con npm i peer@1 peerjs@1.5.5 aedes@0.51 ws@8)
node tools/net_load.mjs rtc|relay [N=5] [s=12]   # carga: N páginas en una sala enviando estados a 20 Hz; mensajes, KB/s y ms de JS por segundo por página, broker, frescura (DIST=<carpeta> compara otra compilación; RACE=1 sin la UI de la sala)
node tools/net_fresh_test.mjs          # dispositivos nuevos crean salas (toque antes de cargar PeerJS) y aviso + versión web en Claude sin acceso a la sala (THREE_DIR, NET_DEPS)
node tools/road_layers.mjs [pistas]   # una sola superficie de carretera por punto: nada (salvo calcomanías marcadas) sobre el asfalto (exit 1 si falla)
node tools/shot.mjs <prefijo> <pista> <coche> "<js>|||<js>" [ancho]   # capturas en shots/  (DPR=2 Retina, DIST=<carpeta> otra compilación)
node tools/menu_shot.mjs <prefijo> "<js>|||<js>" [ancho] [alto] [móvil]   # capturas del menú (sin empezar sesión)
LOD=1 node tools/perf.mjs spa amg_gt3 race medio 8 960   # coste por frame: draw calls, triángulos (todas las pasadas), ms de JS
```
Ejemplos de capturas:
- `node tools/shot.mjs c3 toca_largo amg_gt3 "__spa.view(563,0,70,-40,0,70)"`: vista aérea de la curva 3.
- `node tools/shot.mjs rueda w17 w17 "__spa.camAt([2.9,0.36,1.62],[0.78,0.355,1.62],30)"`: la rueda delantera izquierda.

## Estructura
`build.js` concatena los archivos **en este orden**. Comparten un único ámbito global de módulo, así que el orden importa.

| Archivo | Contenido |
|---|---|
| `src/head.html`, `src/style.css`, `src/body.html`, `src/tail.html` | Página, CSS y la UI (menú, HUD, modales) |
| `src/data_*.js` | Líneas centrales de los circuitos: `"x,y,anchoDer,anchoIzq;..."` en metros. En el juego, `pz = -y` |
| `src/data_monaco.js` | Mónaco medido sobre el mod de Assetto Corsa (lo genera `tools/prep_monaco/prep.mjs`): eje, muros por muestra (`MONACO_BAR`), elevación y `MONACO_CITY` (túnel, pianos, edificios, terreno, tribunas, yates, palmeras) |
| `src/tracks.js` | `TRACK_DEFS`: curvas, sectores, boxes, tribunas, barreras de neumáticos, escapatorias, elevación y paisaje de cada trazado |
| `src/cars.js` | `BODY_DEF` (valores por tipo), `ACCEL_CAL` (calibración a tiempos reales 0-100/0-200) y `CARS` (`mkCar(id, nombre, categoría, tipo, CV, kg, tracción, vmax, extras)`) |
| `src/physics.js` | `buildTrack`, `computeRacingLine` y el modelo del vehículo `Vehicle` (neumáticos, aero, motor, caja). Lo usa también `tools/headless.js` |
| `src/damage.js` | Modelo de daños por coche (`DMG_PROFILES`) y contacto entre coches |
| `src/barrels.js` | Barriles 3D (`BarrelWorld`: solver de impulsos, apilado, sueño, LOD), materiales de muro `BARRIER_MAT` que usa `collide`, colocación `placeBarrels` y dibujo `BarrelView`. Detalle en `docs/fisica-barriles.md` |
| `src/line_offs.js` | Trazada ideal precalculada (la genera `build.js`) |
| `src/ai.js` | Pilotos IA |
| `src/coach.js` | Línea de frenada adaptativa: plan alcanzable, juicio por curva, retirada de ayuda; `CoachLine` la dibuja |
| `src/rewind.js` | Rebobinado de prácticas: anillo de fotos del coche (`Rewind`, `REWIND`); `main.js` guarda el cronómetro alrededor |
| `src/world.js` | Escenario: asfalto, pianos, muros, boxes, tribunas, terreno, árboles, cielo y clima |
| `src/carmodel.js`, `src/body.js`, `src/hands.js`, `src/special.js` | Coches procedurales, cabina, volante y manos |
| `src/glb.js` | Monta los modelos escaneados (GLB) sobre el coche: ruedas, cabina real, volante y piezas fijas |
| `src/audio.js` | Motores sintetizados |
| `src/net.js` | Multijugador, Room Manager: códigos de sala, transportes (PeerJS / sala de Claude), admisión, perfil del piloto, carrera en red, interpolación y nombres sobre los coches |
| `src/lobby.js` | UI de la sala dentro del menú (paso Sesión), botón principal y avisos emergentes (`netNotify`) |
| `src/main.js` | Arranque, menú (`MENU_UI`, `Spring`), garaje, modos de sesión, HUD, cámaras, red, `window.__spa` (ganchos de prueba) |
| `assets/*.glb` | Modelos ya optimizados. `build.js` los empaqueta en `dist/models/packN.wasm` (≤ 8 MB cada uno) |

## Convenciones importantes
- **Coche:** +Z adelante, +X izquierda, +Y arriba, con el origen en el suelo bajo el centro de gravedad. Las ruedas de un GLB van en nodos `WHL_FL/FR/RL/RR` con el eje en X.
- **Pista:** `s` es la distancia en metros nominales desde la línea de meta. `d` es el desplazamiento lateral: positivo a la izquierda, negativo a la derecha. El lado de tribunas y barreras (±1) sigue el mismo signo; `node tools/headless.js tyres` lo comprueba.
- **Coordenadas de Assetto Corsa:** en Tocancipá el `y` crudo es `+z` (verificado contra el plano oficial con 0,0 m de error). En Monza se usó `y = -z` (verificado contra TUMFTM). Cada circuito nuevo se verifica superponiéndolo a un plano real.
- **Campos útiles de un coche con GLB:**
  - `glb`: nombre del archivo en assets.
  - `cdx/cdy/cdz`: posición de la cabina procedural.
  - `cabClip`: recorte de la cabina.
  - `realCab`: usa el interior del modelo.
  - `swAt [y,z,x]`: posición del volante.
  - `onb [x,y,z,pitch]`: cámara onboard.
  - `trueWheels`: el juego endereza las ruedas al cargar; `false` si el asset ya viene corregido (comprobarlo midiendo, no copiarlo de otro coche: v98); `2` usa el ajuste más estricto `trueWheel2` (SF-26, MAC-26, Fórmula E); `3` endereza cada pieza sobre sus ejes principales (`trueWheel3`, neumáticos de pocos polígonos: BMW M Hybrid, Valkyrie LM).
  - Giro de ruedas en pantalla (v105): `spinVis` limita el giro visual a `WHEEL_STEP` (0,45 rad) por fotograma para evitar el efecto estroboscópico de las letras del flanco; no es un problema de geometría. Para medir bamboleo real usa vértices en el marco del eje (`__spa.model.wheels`), no capturas con `wheelRot`.
  - Máscara de pintura (v105): textura opaca y peso en el shader (`paintMode` 'dark'/'ref' en extras, `opaque_paint.mjs`). Todo clon de material debe copiar `onBeforeCompile` y `customProgramCacheKey` (`material.clone()` no lo hace).
  - `wheelStat`: regex de piezas de rueda que no giran (conductos de freno).
  - `series`: `'f1mod'` o `'gt3'` para la parrilla de su serie.
- **Boxes:** la calle de boxes va a la derecha de la recta. Con `pitSide: 1` en `TRACK_DEFS` va a la izquierda. En Tocancipá los boxes están por dentro (foto aérea, v72): `pitSide: 1` en el Largo inverso y el Corto inverso. Las tribunas de la recta van en el lado contrario.
- **Muros de boxes (v96):** el coche se empuja siempre a la cara de su propia zona (`this.zone` en `collide`: pista, banda de boxes, vía de salida) y un raíl blando solo se dobla hasta 0,4 m antes del suelo conducible que tenga detrás (`barrierRoom`, `T.strL/strR`). La valla de las tribunas va sobre el raíl real (`standFence` en `world.js`).
- **Parada en boxes:** `pitStopPlan` en `damage.js`. Usa `PIT_CREW` (tiempos reales de neumáticos y factor del equipo por tipo de coche) y `PIT_REPAIR` (cada pieza escala con su daño). En Spa la salida de boxes es una vía propia (`escape` con `pit: true`).
- **Rendimiento (v73):** los coches escaneados rivales cambian a mallas simplificadas por distancia (`glbLod*` en `glb.js`, meshoptimizer en `src/meshopt_simplifier.js`, calculado en un worker). Cada malla usa el nivel más simple cuyo error geométrico en pantalla es < 0,3 px (`LOD_PX`); el coche del jugador siempre lleva el modelo completo. `__spa.lod(false)` lo apaga para comparar; `__spa.freeze(true)` + `__spa.redraw()` congelan un frame para comparar píxel a píxel. Límite de FPS en ajustes (60 por defecto, `paceSkip` en `main.js`). En el postproceso solo la pasada de escena lleva MSAA.
- **Capas de carretera (v99):** nunca dos superficies de carretera en el mismo sitio: una vía nueva (salida de boxes, escapatoria) se recorta en el borde del asfalto (`buildEscape`) y usa el material del circuito. Lo que va encima a propósito (líneas, pianos, charcos…) lleva `material.userData.decal = true` y polygonOffset. `node tools/road_layers.mjs` lo comprueba.
- **Ajuste de cámara** en juego: teclas 1–0. Se guarda por coche y por vista.
- **Menú (v81):** tres pasos en una hoja de cristal: Pista (tarjetas con el trazado, trazados de Tocancipá, clima) · Coche (lista + ficha a la derecha) · Sesión (modo, detalles, «Más opciones»). Escritorio: panel lateral; móvil (≤ 820 px): hoja inferior con dos posiciones que se arrastra por la cabecera. Movimiento con muelles propios (`Spring`: amortiguamiento + respuesta, parten del valor y la velocidad actuales), proyección del gesto y rebote en los bordes, según la guía de diseño de Apple que pasó Juanse. Los ids de los controles antiguos se conservan. La cámara del menú encuadra el coche en el hueco libre (`menuFrame`). Capturas del menú: `node tools/menu_shot.mjs <prefijo> "__spa.menuStep('coche')" [ancho] [alto] [móvil=1]`.

## Historial reciente y decisiones
- **v108:** Tesla Model 3 Performance (`model3_p`, `assets/tesla3.glb`, `tools/prep_tesla.mjs`): FBX girado 180°, escala por batalla y X ×0,945 (el asset venía ancho), ruedas rectas (0,00 mm), 0-100 3,44 s, límite 261 km/h.
- **v112:** sala de Claude (artefacto): ping medido por eco en la presencia (`pi`/`po`, `netRoomPing`) y usado en la predicción (antes 80 ms fijos); el paquete de barriles sale de la presencia cuando duermen; el indicador muestra «Sala de Claude (servidor) · ping · FPS». Las mejoras de red de v106-v107 solo aplican en la web (PeerJS): para carreras de varios se recomienda la web.
- **v107:** red con muchos pilotos: los estados de carrera van aparte de la presencia, el anfitrión manda un paquete con todos cada 40 ms y por WebRTC usan un canal sin orden. 5 pilotos: anfitrión de 323 a 103 mensajes/s y de 108 a 28 KB/s (`tools/net_load.mjs`). En carrera online, un indicador arriba al centro (`netInfo`) muestra conexión (directa/servidor), ping, FPS y tirones; los primeros 75 s de una carrera toleran más silencio (`NET_SILENCE_LOAD`) porque todos cargan el circuito.
- **v106:** online entre redes distintas: si WebRTC no abre, el invitado entra por un broker MQTT público (`MqttWs`/`RelayConn`/`hostRelay` en `net.js`). Los coches remotos se dibujan donde están ahora (`netPredict`: reloj + ping, proyección a lo largo de la pista), no interpolados en el pasado. Estados durante el semáforo y parrilla completa desde el inicio (`netRemoteEntry`).
- **v104:** en el artefacto, la sala de Claude solo admite cuentas con acceso al artefacto; los demás (enlace público, sin sesión) reciben el botón «Abrir la versión web» (GitHub Pages + PeerJS, donde cualquiera crea sala). Un toque en «Crear sala» antes de cargar PeerJS queda en cola (`NET.pending`).
- **v100:** barriles en multijugador: el anfitrión es la autoridad (`netPack`/`netApply` en `barrels.js`, presencia `bw`/`bs`), los coches remotos empujan como cuerpos cinemáticos y cada invitado predice lo que toca su coche. `headless.js barrels` y `net_test.mjs room` lo comprueban.
- **v97:** barriles con física 3D determinista (`src/barrels.js`, ajuste «Barriles en pista»: amortiguador de agua en la nariz de boxes o zona de pruebas) y materiales de muro reales (neumáticos absorben, armco ya no frena a 5 g al rozar). Valores, pruebas y lo que no aplica del encargo (Unity/PhysX, juntas de neumáticos…) en `docs/fisica-barriles.md`.
- **v91:** salas privadas por código (sin matchmaking): `src/net.js` + `src/lobby.js`, sala dentro de la hoja del menú, listo/esperando, colisiones on/off, errores (inválido, sin sala, llena, empezada, anfitrión se fue), nombres sobre los coches, interpolación con reloj del emisor. Flujo y límites en `docs/multijugador.md`.
- **v84:** la vida de los neumáticos en el menú se mide en la pista y con el coche elegidos (IA nivel 9, 4 vueltas por compuesto, en trozos de 6 ms mientras el menú está abierto: `tyreLifeStart` en `main.js`); antes decía siempre «en Spa» con un número fijo. «Auto» elige el compuesto más blando que aguanta la carrera con esa medida.
- **v86:** neumáticos: el calor es potencia de deslizamiento (crece con la velocidad), enfriamiento con el cuadrado del exceso (sin desboque) y más masa térmica (`TYH` en `damage.js`). Tocancipá/Mónaco ya no pasan de ~110 °C (antes 130-150); Spa/Monza siguen en ventana. `headless.js tyretemp` lo mide.
- **v85:** Mónaco: palmeras fuera de boxes (`pitZone`); las piezas de tribuna del modelo se unen en tribunas continuas que siguen el muro (`standRuns` en `buildMonaco`), nunca en boxes, garajes, otra calle o el mar; túnel con paredes claras, luz cálida propia (`tunLight`) y exposición +22 % dentro; Tabac sin el muro de 10 m (muros de contención limitados a 3 m salvo calle justo detrás o suelo medido que sube a < 7 m; terreno tallado hasta 16 m donde el suelo medido sigue a nivel).
- **v83:** Mónaco sin bancos de tierra: el terreno de 8 m se talla al nivel de la calle más baja en un pasillo de 6 m detrás del muro, y los muros de contención de piedra (`buildMonacoStreet` en `world.js`) tapan el desnivel. Además, aceras de ladrillo, la isla de la horquilla y árboles en jardines y taludes.
- **v82:** salida de boxes de Spa: la vía sigue la cota de la pista (`escape.follow`), raíles solo donde la física para el coche (`T.drivable`), sin muro cruzado en la boca ni hierba encima.
- **v81:** menú nuevo en tres pasos (Pista · Coche · Sesión) con hoja de cristal, muelles y gestos; en móvil el menú anterior se salía de la pantalla.
- **v80:** alrededores de Mónaco: `prep_monaco` parte cualquier bloque o tribuna que llegue por dentro del muro (`node tools/headless.js city`, exit 1 si alguno invade); relleno de ciudad en la ladera y la Roca, roca en las pendientes y palmeras con normales hacia arriba.
- **v79:** Mónaco desde el mod de AC (`tools/prep_monaco/`: `kn5.mjs` lee `.kn5` y `fast_lane.ai`; `prep.mjs` mide eje, anchos, muros reales, pianos, ciudad). Opciones de pista nuevas: `bar`/`barDs` (muros medidos por muestra; la cara del muro de neumáticos es la medida), `kerbs`, `lineMargin`, `passRoom` (la IA adelanta solo con hueco y en fila entre muros), `crane` (retira coches destrozados), `escape.handles`. La trazada nunca usa piano con muro detrás. `__spa.setAuto` gira con el entorno del jugador.
- **v78:** Cadillac MAC-26 y Ferrari SF-26 (F1 2026, física del W17) preparados con `tools/prep_f1_2026/`; libreas texturizadas recoloreables con la máscara de pintura (`glbPaintMask`, alfa de la textura = peso); la parrilla F1 conserva las libreas.
- **v77:** BYD Seagull (eléctrico, 55 kW, limitado a 130): modelo preparado con `tools/prep_seagull.mjs`; el color cambia solo la pintura (también mate/metal en cualquier coche escaneado).
- **v75:** rebobinado en prácticas (tecla Retroceso o botón ⟲): 5 s por pulsación, hasta 15 s; restaura coche, daño y cronómetro; la vuelta queda inválida; `node tools/headless.js rewind` comprueba que la repetición es idéntica bit a bit.
- **v72:** Tocancipá con las referencias de la foto aérea (`buildToca`, marco fijo `TOCA_VENUE`): pórtico Mobil, garajes bajos, paddock de contenedores, llantas, eucaliptos, montañas y chimeneas. Los boxes van **por dentro** (entre la recta y la vía de vuelta de la horquilla) y la tribuna por fuera, como en la foto; esto corrige la v69.
- **v71:** línea de frenada adaptativa (`coach.js`): colores según tu velocidad, aprende por curva, marcas de frenada y se retira de las curvas dominadas.
- **v70:** salida de boxes de Spa después de La Source; tiempo de parada según la categoría y el daño.
- **v69:** boxes y tribunas. En Tocancipá la tribuna principal estaba encima de la calle de boxes, y los boxes cambiaban de lado según el trazado. Se añadió `pitSide` y el chequeo `headless.js pits`.
- **v68:** la dificultad de la IA ya no limita la velocidad en recta: escala el paso por curva y la frenada (`aiProfile` en `ai.js`, `vk` en `qssProfile`). El nivel 10 no cambió.
- **v66:** el edificio de boxes, el paddock y la torre de Tocancipá atravesaban la curva 3. En `world.js`, `farTrack`/`footHits` omiten cualquier edificio cuya planta quede a menos de semiancho + 3 m de otro tramo de pista.
- **v65:** Tocancipá estaba en espejo. Se corrigió a `y = +z`, invirtiendo el lado de las barreras y las tribunas.
- **v64:** ruedas del W17 corregidas en el asset: 2,5° de caída eliminados, llanta redondeada y ruedas excluidas de la simplificación. Por eso `trueWheels: false`.
- **v62:** la escapatoria de la T1 de Monza es plana (rampa lineal) y el coche se apoya en ella.
- El pipeline que optimizaba los GLB originales (gltf-transform + meshoptimizer, scripts `prep.mjs` por coche) **no está en este repo**. Para un coche nuevo, el modelo a seguir es `tools/prep_seagull.mjs` (v77): FBX → GLB con FBX2glTF, escala por la batalla real, ruedas separadas en `WHL_*` por cilindro, materiales arreglados, `paint`/`int` en extras, simplify por grupo (la pintura sin simplificar), webp, quantize y meshopt. Sus dependencias (`fbx2gltf`, `@gltf-transform/*`, `meshoptimizer`, `sharp`) se instalan aparte, no en `package.json`.
- El Ferrari F40 de ACPursuit (mod de Assetto Corsa) **no se integró**: el modelo viene protegido contra extracción. Su física (data.acd) está calculada; ver HANDOFF.md.

## Publicación
El juego público es el artefacto de Claude **https://claude.ai/artifact/Y3YH8j53hJtVGmR75KyzL7**. Se publica desde Claude Code con la herramienta Artifact:
1. `node build.js` y verificar (capturas + `node tools/headless.js`).
2. Artifact `publish` con `url` = ese enlace, `file_path` = `dist/spa.html` y `files` = `{ "models/pack0.wasm": "dist/models/pack0.wasm", …, "models/packN.wasm": "dist/models/packN.wasm" }`. Si no se pasan los packs, se conservan los ya publicados: pásalos solo si cambió algún `assets/*.glb`. Si el número de packs baja, borra los sobrantes con `null`.
3. La publicación añade su propio envoltorio (`<!doctype html>…<head>` con estilos base y `</body></html>`); por eso el `index.html` publicado no es byte a byte igual a `dist/spa.html`, pero el contenido sí.

**Regla de versiones:** cada versión publicada sube el número (v67, v68…). Se anota en `HANDOFF.md` (versión, fecha, qué cambió y cómo se verificó) y se hace commit con ese número en el mensaje. Cada cambio verificado se fusiona a `main` y se publica sin pedir permiso (decisión de Juanse, 26-oct-2026); si el cambio va por PR, el PR se fusiona antes de publicar.

**Web pública (GitHub Pages, 3-nov-2026): https://juanserodriguezh.github.io/tu-record-juego/**. Se publica sola en cada push a `main` (`.github/workflows/pages.yml`: `node build.js`, `dist/spa.html` → `index.html` + `models/`). No hace falta cuenta de Claude: el multijugador usa PeerJS (señalización pública de PeerJS + STUN). En el artefacto de Claude, en cambio, usa la sala de Claude y cada jugador necesita sesión iniciada. El repo es público desde ese día (decisión de Juanse) porque Pages gratis lo exige. Se siguen publicando las dos cosas: el artefacto a mano y Pages automático al fusionar.

## Fuentes originales (no están en el repo)
Los 28 archivos originales (zips de coches de Sketchfab/vecarz, circuitos de Assetto Corsa, el F40 y Tocancipá en `.rar`; 2,1 GB, verificados por sha256) **no están en el repo**: viven en el Mac de Juanse, en `~/Documents/juego-carreras/fuentes/` (`fuentes/` está en `.gitignore`). En `assets/` solo están los GLB ya optimizados.
Para rehacer un coche (p. ej. el redondeo de ruedas del RB22 o el MCL39) se usan desde esa carpeta, en un hilo con acceso al dispositivo. Solo si el archivo no está ahí, se le pide a Juanse.

## graphify (grafo del código, para gastar menos tokens)
El grafo vive en `graphify-out/` (no se versiona: `.gitignore`). El hook `SessionStart` de `.claude/settings.json` instala `graphifyy==0.9.102` si falta y corre `graphify update .` (solo AST, sin LLM, ~7 s). Los hooks `PreToolUse` (modo `--strict`) bloquean la primera lectura o búsqueda de la sesión hasta que se consulte el grafo.

**Regla:** antes de abrir o buscar en archivos, usa `graphify query "<pregunta>"`, `graphify explain "<símbolo>"` o `graphify path "<A>" "<B>"` para ubicar el código exacto (archivo y línea), y lee solo esas líneas (`Read` con `offset`/`limit`, o `sed -n`). Pon esta regla en el prompt de cualquier subagente que explore código.
- Pregunta en inglés o con nombres del código: los comentarios y símbolos están en inglés. «posición del volante en la cabina» no encuentra `fitSteeringWheel()` (`src/glb.js`); «swAt steering wheel position» sí.
- Los `src/data_*.js` y `MONACO_CITY` son datos, no tienen símbolos en el grafo: para ellos, `grep` directo.
- `graphify-out/GRAPH_REPORT.md` solo para revisar la arquitectura completa.
- Después de cambiar código: `graphify update .`.
- Si `pip` falla en el Mac (Python de Homebrew, PEP 668): `pipx install graphifyy==0.9.102`.
