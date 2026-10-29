# ARMK Racing (antes «Tu récord») — juego de carreras en el navegador

Juego 3D con three.js 0.160 (cargado desde jsDelivr). Incluye 4 circuitos: Spa-Francorchamps, Monza, Albert Park y Tocancipá (6 trazados), 22 coches escaneados, IA, daños, neumáticos, clima, multijugador por sala y audio sintetizado.
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
node tools/headless.js pits                # tribunas, boxes y postes no se pisan entre sí ni con la pista (exit 1 si falla)
node tools/headless.js pitstop             # tiempo de parada por categoría y daño
node tools/headless.js coach monza amg_gt3   # línea adaptativa: zonas y juicio de 3 pilotos IA (exit 1 si falla)
node tools/headless.js rewind monza amg_gt3,w17   # rebobinado: restauración exacta, daño, coste y línea adaptativa (exit 1 si falla)
node tools/shot.mjs <prefijo> <pista> <coche> "<js>|||<js>" [ancho]   # capturas en shots/
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
| `src/tracks.js` | `TRACK_DEFS`: curvas, sectores, boxes, tribunas, barreras de neumáticos, escapatorias, elevación y paisaje de cada trazado |
| `src/cars.js` | `BODY_DEF` (valores por tipo), `ACCEL_CAL` (calibración a tiempos reales 0-100/0-200) y `CARS` (`mkCar(id, nombre, categoría, tipo, CV, kg, tracción, vmax, extras)`) |
| `src/physics.js` | `buildTrack`, `computeRacingLine` y el modelo del vehículo `Vehicle` (neumáticos, aero, motor, caja). Lo usa también `tools/headless.js` |
| `src/damage.js` | Modelo de daños por coche (`DMG_PROFILES`) y contacto entre coches |
| `src/line_offs.js` | Trazada ideal precalculada (la genera `build.js`) |
| `src/ai.js` | Pilotos IA |
| `src/coach.js` | Línea de frenada adaptativa: plan alcanzable, juicio por curva, retirada de ayuda; `CoachLine` la dibuja |
| `src/rewind.js` | Rebobinado de prácticas: anillo de fotos del coche (`Rewind`, `REWIND`); `main.js` guarda el cronómetro alrededor |
| `src/world.js` | Escenario: asfalto, pianos, muros, boxes, tribunas, terreno, árboles, cielo y clima |
| `src/carmodel.js`, `src/body.js`, `src/hands.js`, `src/special.js` | Coches procedurales, cabina, volante y manos |
| `src/glb.js` | Monta los modelos escaneados (GLB) sobre el coche: ruedas, cabina real, volante y piezas fijas |
| `src/audio.js` | Motores sintetizados |
| `src/main.js` | Arranque, garaje, modos de sesión, HUD, cámaras, red, `window.__spa` (ganchos de prueba) |
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
  - `trueWheels`: el juego endereza las ruedas al cargar; `false` si el asset ya viene corregido.
  - `wheelStat`: regex de piezas de rueda que no giran (conductos de freno).
  - `series`: `'f1mod'` o `'gt3'` para la parrilla de su serie.
- **Boxes:** la calle de boxes va a la derecha de la recta. Con `pitSide: 1` en `TRACK_DEFS` va a la izquierda. En Tocancipá los boxes están por dentro (foto aérea, v72): `pitSide: 1` en el Largo inverso y el Corto inverso. Las tribunas de la recta van en el lado contrario.
- **Parada en boxes:** `pitStopPlan` en `damage.js`. Usa `PIT_CREW` (tiempos reales de neumáticos y factor del equipo por tipo de coche) y `PIT_REPAIR` (cada pieza escala con su daño). En Spa la salida de boxes es una vía propia (`escape` con `pit: true`).
- **Rendimiento (v73):** los coches escaneados rivales cambian a mallas simplificadas por distancia (`glbLod*` en `glb.js`, meshoptimizer en `src/meshopt_simplifier.js`, calculado en un worker). Cada malla usa el nivel más simple cuyo error geométrico en pantalla es < 0,3 px (`LOD_PX`); el coche del jugador siempre lleva el modelo completo. `__spa.lod(false)` lo apaga para comparar; `__spa.freeze(true)` + `__spa.redraw()` congelan un frame para comparar píxel a píxel. Límite de FPS en ajustes (60 por defecto, `paceSkip` en `main.js`). En el postproceso solo la pasada de escena lleva MSAA.
- **Ajuste de cámara** en juego: teclas 1–0. Se guarda por coche y por vista.

## Historial reciente y decisiones
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

Alternativa: alojar `dist/` en cualquier hosting estático (GitHub Pages, Netlify, Vercel), sirviendo `.wasm` como `application/wasm`.

## Fuentes originales (no están en el repo)
Los 28 archivos originales (zips de coches de Sketchfab/vecarz, circuitos de Assetto Corsa, el F40 y Tocancipá en `.rar`; 2,1 GB, verificados por sha256) **no están en el repo**: viven en el Mac de Juanse, en `~/Documents/juego-carreras/fuentes/` (`fuentes/` está en `.gitignore`). En `assets/` solo están los GLB ya optimizados.
Para rehacer un coche (p. ej. el redondeo de ruedas del RB22 o el MCL39) se usan desde esa carpeta, en un hilo con acceso al dispositivo. Solo si el archivo no está ahí, se le pide a Juanse.
