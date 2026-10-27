# HANDOFF

## v66 (26-oct-2026) — proyecto pasado a Claude Code
- Los fuentes se reconstruyeron desde la versión publicada v66. `node build.js` reproduce byte a byte los 7 packs publicados, y el contenido del `index.html` (el publicado lleva además el envoltorio de publicación); la trazada ideal recalculada también sale idéntica.
- `src/head.html` incluye ahora `<meta charset>`, viewport y `[hidden]{display:none!important}`. Antes los ponía el envoltorio de publicación; sin ellos, la página local se quedaba en la pantalla de carga.
- Herramientas nuevas: `tools/serve.mjs`, `tools/shot.mjs` (capturas con Playwright) y `tools/headless.js` (aceleración y lado de las barreras).

## Repo y publicación (26-oct-2026, sin cambios de código)
- Proyecto subido a `juanserodriguezh/tu-record-juego` (main). Un clon limpio + `node build.js` reproduce los 7 packs publicados.
- `CLAUDE.md`: procedimiento real de publicación con la herramienta Artifact (antes decía que desde Code no se podía), regla de versiones (v67, v68…) y nota de fuentes originales fuera del repo (`fuentes/` en `.gitignore`).

## v67 (26-oct-2026, publicada) — barreras de neumáticos de Monza
- Causa: dos muros de neumáticos estaban por dentro de la curva. En la Variante Ascari ([4000,4120,-1]), todo el muro quedaba a la derecha, por dentro del tramo central (que es de derechas) y detrás de la hierba; la grava estaba en el otro lado. En el Rettifilo ([900,1010,+1]), el muro iba bien por fuera de la T1, pero seguía por la izquierda en la T2 (de izquierdas) y quedaba pegado al vértice, en la isleta junto al salchichón amarillo.
- Arreglo en `tracks.js`: Rettifilo pasa a ser un muro por curva, `[900,945,1]` por fuera de la T1 y `[955,1010,-1]` por fuera de la T2. Ascari pasa a `[4000,4110,1]`, detrás de la grava y por fuera del tramo de derechas.
- `tools/headless.js tyres`: ya no mira solo el punto medio, porque en una chicane la curvatura cambia de signo justo ahí. Ahora pondera la curvatura de todo el tramo y exige que al menos el 75 % gire en sentido contrario al muro. Si algo falla, lo lista y sale con exit 1. La Roggia pasaba con un 85 %, pero su muro también seguía por dentro de la segunda curva (de derechas): se partió igual que el Rettifilo, `[2100,2162,-1]` por fuera de la primera y `[2172,2215,1]` por fuera de la segunda. Ahora los 6 muros de Monza están al 100 %.
- Verificado: `tyres` da todo en verde (Monza 5/5 y el resto sin cambios). Capturas antes y después en el Rettifilo (vista aérea, entrada de la T1 y T2) en Ascari (vista aérea y entrada) y en la Roggia (vista aérea y salida).
- Publicada el 26-oct-2026 como versión 67 del artefacto (id 1793055356-2f16). Solo cambió la página: los packs siguen como en v66. Se comprobó que el `index.html` publicado contiene `dist/spa.html` entero, con los muros nuevos.
- Capturas en el contenedor en la nube: jsDelivr está bloqueado. Hay que bajar three con `npm pack three@0.160.0` y lanzar con `THREE_DIR=<carpeta>/package`. Playwright está en `/opt/node-tools`: hay que enlazarlo en `node_modules/` para que el `import` ESM lo encuentre.

## v68 (26-oct-2026) — ritmo de la IA (Monza y resto)
- Causa: la dificultad multiplicaba todo el perfil de velocidad de la IA (`prof × aiPace`, 0,8 a 1,0), también en las rectas. En nivel 5 (0,889) un GT3 no pasaba de 243 km/h en Monza (puede 270) y daba 2:02, frente a 1:45,1 de pole real (GTWC Europe 2025, Q3). Monza, el circuito con más recta, era el más castigado.
- Segundo fallo: en `ai.js`, el límite de velocidad por ir fuera de la trazada medía la curvatura del eje de la pista, no la de la trazada desplazada. Donde la trazada cruza recta una curva (salida de Lesmo 2, Ascari), un desvío de 0,45 m hacía frenar de 225 a 155 km/h. Afectaba a los niveles bajos (que ondulan) y a cualquier IA al adelantar. Ahora se usa `line.k / (1 - line.k × off)` (comprobado: predice la curvatura real con 1 m de desvío).
- Arreglo: la dificultad entra en el plan (`aiProfile`): velocidad de paso por curva × `aiPace` (`qssProfile` acepta `vk`) y frenada × `aiPace²`. La recta queda libre: todos los niveles llegan a la punta del coche. `aiPace` pasa a 0,72–1,0 para no comprimir la escala. `this.k` queda solo para la dispersión entre pilotos y los daños.
- Herramienta nueva: `node tools/headless.js ailap <pista> <coches> [nivel] [vueltas]` (vueltas lanzadas de una IA sola, en seco).
- Medido (mejor vuelta, IA sola): Monza GT3 nivel 5: 2:01,94 → 1:55,70 (punta 243 → 271 km/h); nivel 1: 2:23,4 → 2:05,7; el nivel 10 no cambia (1:49,29). En Spa, Albert Park y Tocancipá los niveles 1-5 bajan entre un 0 y un 15 %, y el nivel 10 queda idéntico en los 6 trazados × 4 coches (GT3, W17, Chiron, Duster). La escala queda monótona (Monza GT3: 2:05,7 / 2:00,1 / 1:55,7 / 1:52,6 / 1:49,3 en los niveles 1/3/5/7/10).
- Carrera en el navegador (Monza, 12 GT3, nivel 5, 4 vueltas): rivales en 1:54,5–1:58,9 (antes 2:00,6–2:03,7), sin errores de página ni coches atascados.
- Límite que queda: el nivel 10 en Monza da 1:49,3 y el plan teórico 1:47,1, frente a 1:45,1 real. Esa diferencia es de la física del coche (afecta también al jugador), no de la IA. Previo y sin tocar: el Chiron se queda atascado en Tocancipá Corto con nivel 10.
- Publicada el 26-oct-2026 como versión 68 del artefacto (id 1793057115-51d5). Solo cambió la página; los packs siguen como en v66.

## v69 (27-oct-2026) — boxes y tribunas
- Herramienta nueva: `node tools/headless.js pits [pista]`. Comprueba que tribunas, calle de boxes, edificio de boxes, torre de control, postes de comisarios y pilares del pórtico de frenada no se pisan entre sí ni con otro tramo del circuito. Si algo falla, lo lista y sale con exit 1.
- Causa principal (Tocancipá, los 6 trazados): la tribuna principal estaba en el mismo lado que los boxes, encima de la calle de boxes y de los garajes. Además, los boxes estaban en lados opuestos de la recta según el trazado: en el Largo, la Ampliación y los Mixtos (horarios) iban por dentro, y en el Largo inverso y el Corto (antihorarios) por fuera. Por dentro solo hay 43 m entre la recta y la vía interior, y por eso el juego quitaba 140 m de edificio de boxes y la torre pisaba la curva 4. El código ponía siempre los boxes a la derecha, así que el arreglo del espejo de la v65 no pudo cambiarlos de lado.
- Arreglo: opción nueva `pitSide: 1` (boxes a la izquierda) en `physics.js`, `world.js`, `ai.js`, `damage.js` y `main.js`. Sin la opción, todo sigue igual (−1, a la derecha). En Tocancipá los boxes van ahora siempre por fuera (al suroeste de la recta), con `pitSide: 1` en el Largo, la Ampliación y los Mixtos. La tribuna principal va enfrente, por dentro: en el Largo inverso, el Corto y el Óvalo pasa de −1 a +1. En el Óvalo, la tribuna pasa al lado interior.
- Otros arreglos: el poste de comisarios de s = 150 quedaba dentro de la calle de boxes en todos los circuitos, y ahora se omite. El pilar del pórtico de frenada de Tocancipá caía dentro de la calle de boxes, y ahora queda en la línea del muro de boxes. La torre de control comprueba toda su longitud (22 m), no solo ±2 muestras. En Monza, las tribunas de la recta se solapaban en s = 140 (la segunda empieza ahora en 145).
- No se tocó: en Spa la entrada a boxes va después de la Bus Stop y la salida antes de La Source. Puede que en el circuito real la salida esté después de La Source; no lo pude confirmar, y cambiarlo exigiría que la calle de boxes no fuera una banda paralela a la pista.
- Verificado: `pits` pasa en los 9 trazados (antes fallaban 7, con 22 solapes) y `tyres` sigue en verde. Capturas antes y después en el Largo (aéreas y a ras de pista desde los dos lados), el Corto, la Ampliación y el Óvalo. Salida de boxes con el piloto automático (clasificación) en el Largo: el coche sale por la izquierda a d = +15 m y entra en pista sin golpes. En Spa y el Largo inverso, el piloto automático se sale en la vuelta de salida en el mismo punto antes y después del cambio, así que ese fallo ya existía y no lo causa este cambio.
- Publicada el 27-oct-2026 como versión 69 del artefacto (id 1793059691-03d8). Solo cambió la página; los packs siguen como en v66.

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
- Tocancipá Largo: si se quiere la numeración del plano oficial, mover la línea de meta.

## Revisión 26-oct-2026 (Cowork, sin cambios de código)
- `node build.js` compila; tras el build `git status` queda limpio (dist idéntico a v66).
- `node tools/headless.js tyres`: Monza da 2/4. Fallan [900,1010,1] (Variante del Rettifilo) y [4000,4120,-1] (Variante Ascari); el signo de curvatura sale igual con ventanas de 4, 10 y 20 puntos. Ambas son chicanes: el test mira solo el centro del tramo, así que puede ser el test o la barrera. Confirmar con `tools/shot.mjs` (vista aérea) antes de tocar `tracks.js`.
- `headless.js tyres` sale con código 0 aunque falle: debería salir con 1 para que sirva como comprobación.

## Orden sugerido de pendientes
1. ~~Barreras de Monza~~: hecho en v67.
2. ~~Ritmo de la IA en Monza~~: hecho en v68.
2b. ~~Boxes y tribunas~~: hecho en v69. Pendiente de confirmar: la salida de boxes real de Spa (¿después de La Source?).
3. Tocancipá Largo: línea de meta según la numeración del plano oficial (si Juanse lo confirma).
4. Pipeline GLB (gltf-transform) y redondeo de ruedas del RB22 y el MCL39.
5. Ferrari F40: bloqueado hasta tener un modelo sin protección.
