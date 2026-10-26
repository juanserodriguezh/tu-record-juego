# HANDOFF

## v66 (26-oct-2026) — proyecto pasado a Claude Code
- Los fuentes se reconstruyeron desde la versión publicada v66. `node build.js` reproduce byte a byte el `index.html` y los 7 packs publicados; la trazada ideal recalculada también sale idéntica.
- `src/head.html` incluye ahora `<meta charset>`, viewport y `[hidden]{display:none!important}`. Antes los ponía el envoltorio de publicación; sin ellos, la página local se quedaba en la pantalla de carga.
- Herramientas nuevas: `tools/serve.mjs`, `tools/shot.mjs` (capturas con Playwright) y `tools/headless.js` (aceleración y lado de las barreras).

## Ferrari F40 ACPursuit (pendiente, no integrado)
- El kn5 trae las texturas vaciadas (1×1 px) y la geometría alterada a propósito (protección del autor; la repara CSP). No se revierte.
- Física descifrada del data.acd:
  - 477 CV en el motor (305 kW en rueda), 502 Nm en rueda, 1.250 kg con piloto, 38 % delante, 5 marchas, final 3,70.
  - CdA 0,63; ClA 1,14.
- Spec listo para cuando haya un modelo sin protección:
  `mkCar('f40','Ferrari F40','super','super',478,1250,'R',328,{ wf:0.38, cgh:0.40, mu:1.28, cla:1.14, gears:5, shift:0.25, red:7700, cyl:8, len:4.49, wid:1.97, hgt:1.13, wb:2.475, swAt:[0.714,0.371,0.301] })`, con `ACCEL_CAL f40:[0.72,1.15]`.
  Con eso da 0-100 en 3,27 s, 0-200 en 9,4 s y 325 km/h.
- Al integrarlo, añadir la etiqueta y pestaña "Assetto" en el garaje (`.tag.ac`, color #7c3aed).

## Ideas pendientes que ya se mencionaron
- Aplicar el redondeo de ruedas del W17 al Red Bull RB22 y al McLaren MCL39. Hay que rehacer el pipeline de GLB.
- Ritmo de la IA en Monza: más lento que los tiempos reales (GT3 ~2:00).
- Tocancipá Largo: si se quiere la numeración del plano oficial, mover la línea de meta.

## Revisión 26-oct-2026 (Cowork, sin cambios de código)
- `node build.js` compila; tras el build `git status` queda limpio (dist idéntico a v66).
- `node tools/headless.js tyres`: Monza da 2/4. Fallan [900,1010,1] (Variante del Rettifilo) y [4000,4120,-1] (Variante Ascari); el signo de curvatura sale igual con ventanas de 4, 10 y 20 puntos. Ambas son chicanes: el test mira solo el centro del tramo, así que puede ser el test o la barrera. Confirmar con `tools/shot.mjs` (vista aérea) antes de tocar `tracks.js`.
- `headless.js tyres` sale con código 0 aunque falle: debería salir con 1 para que sirva como comprobación.

## Orden sugerido de pendientes
1. Barreras de Monza (Rettifilo, Ascari): captura, decidir si falla el test o la barrera y arreglar. Hacer que `tyres` falle con exit 1.
2. Ritmo de la IA en Monza (objetivo GT3 ~2:00).
3. Tocancipá Largo: línea de meta según la numeración del plano oficial (si Juanse lo confirma).
4. Pipeline GLB (gltf-transform) y redondeo de ruedas del RB22 y el MCL39.
5. Ferrari F40: bloqueado hasta tener un modelo sin protección.
