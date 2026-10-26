# HANDOFF

## v66 (26-oct-2026) — proyecto pasado a Claude Code
- Los fuentes se reconstruyeron desde la versión publicada v66. `node build.js` reproduce byte a byte los 7 packs publicados, y el contenido del `index.html` (el publicado lleva además el envoltorio de publicación); la trazada ideal recalculada también sale idéntica.
- `src/head.html` incluye ahora `<meta charset>`, viewport y `[hidden]{display:none!important}`. Antes los ponía el envoltorio de publicación; sin ellos, la página local se quedaba en la pantalla de carga.
- Herramientas nuevas: `tools/serve.mjs`, `tools/shot.mjs` (capturas con Playwright) y `tools/headless.js` (aceleración y lado de las barreras).

## Repo y publicación (26-oct-2026, sin cambios de código)
- Proyecto subido a `juanserodriguezh/tu-record-juego` (main). Un clon limpio + `node build.js` reproduce los 7 packs publicados.
- `CLAUDE.md`: procedimiento real de publicación con la herramienta Artifact (antes decía que desde Code no se podía), regla de versiones (v67, v68…) y nota de fuentes originales fuera del repo (`fuentes/` en `.gitignore`).

## v67 (26-oct-2026, sin publicar) — barreras de neumáticos de Monza
- Causa: dos muros de neumáticos estaban por dentro de la curva. En la Variante Ascari ([4000,4120,-1]), todo el muro quedaba a la derecha, por dentro del tramo central (que es de derechas) y detrás de la hierba; la grava estaba en el otro lado. En el Rettifilo ([900,1010,+1]), el muro iba bien por fuera de la T1, pero seguía por la izquierda en la T2 (de izquierdas) y quedaba pegado al vértice, en la isleta junto al salchichón amarillo.
- Arreglo en `tracks.js`: Rettifilo pasa a ser un muro por curva, `[900,945,1]` por fuera de la T1 y `[955,1010,-1]` por fuera de la T2. Ascari pasa a `[4000,4110,1]`, detrás de la grava y por fuera del tramo de derechas.
- `tools/headless.js tyres`: ya no mira solo el punto medio, porque en una chicane la curvatura cambia de signo justo ahí. Ahora pondera la curvatura de todo el tramo y exige que al menos el 75 % gire en sentido contrario al muro. Si algo falla, lo lista y sale con exit 1. El margen más bajo que queda es la Roggia, con un 85 %.
- Verificado: `tyres` da todo en verde (Monza 5/5 y el resto sin cambios). Capturas antes y después en el Rettifilo (vista aérea, entrada de la T1 y T2) y en Ascari (vista aérea y entrada).
- Capturas en el contenedor en la nube: jsDelivr está bloqueado. Hay que bajar three con `npm pack three@0.160.0` y lanzar con `THREE_DIR=<carpeta>/package`. Playwright está en `/opt/node-tools`: hay que enlazarlo en `node_modules/` para que el `import` ESM lo encuentre.

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
1. ~~Barreras de Monza~~: hecho en v67.
2. Ritmo de la IA en Monza (objetivo GT3 ~2:00).
3. Tocancipá Largo: línea de meta según la numeración del plano oficial (si Juanse lo confirma).
4. Pipeline GLB (gltf-transform) y redondeo de ruedas del RB22 y el MCL39.
5. Ferrari F40: bloqueado hasta tener un modelo sin protección.
