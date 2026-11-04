# Física de barriles y muros (v97)

Motor: el propio del juego (JavaScript, three.js solo para dibujar). No hay Unity ni PhysX: el coche es un sólido plano (x, z, guiñada) integrado a 240 Hz en `Vehicle.step` (`src/damage.js`), y los barriles se añadieron como sólidos rígidos 3D en `src/barrels.js`, en el mismo paso de 1/240 s. Todo es determinista: el rebobinado y `headless.js barrels` comprueban que la repetición es idéntica bit a bit.

## Arquitectura

| Pieza | Dónde | Qué hace |
|---|---|---|
| `BARRIER_MAT` | `src/barrels.js` | Materiales coche-muro (hormigón, armco, neumáticos): restitución y fricción. Los lee `Vehicle.collide` |
| `BARREL_TYPES` | `src/barrels.js` | Tipos de barril: medidas, masa de la carcasa y del lastre, material, Cd, resistencia a la rodadura |
| `BMAT` | `src/barrels.js` | Tabla de pares de materiales barril-X: fricción y restitución |
| `barrelMass` | `src/barrels.js` | Masa, centro de masas e inercia compuestos (pared lateral + tapas + lastre), con el teorema de Steiner |
| `BarrelWorld` | `src/barrels.js` | El mundo de barriles: colocación (torre, pirámide, fila, bloque), detección, solver, sueño, estado para el rebobinado |
| `placeBarrels` | `src/barrels.js` | Colocación en los circuitos: `real` (amortiguador de barriles de agua en la nariz del muro de boxes) y `test` (zona de pruebas, solo práctica) |
| `BarrelView` | `src/barrels.js` | Dibujo: un `InstancedMesh` por tipo, aros y franja reflectante, abolladura visual |
| Integración | `src/main.js` | `barrelsReset` al empezar la sesión, `barrelStep` tras `collisions()` en cada paso, `barrelFrame` (dibujo, sonido, polvo, chispas), rebobinado (`rwLapState` guarda `BW.snap()`), ajuste «Barriles en pista» |

### Paso de simulación (`BarrelWorld.step`, 1/240 s)
1. LOD de física: si hay más de 64 barriles despiertos, se congelan los más lejanos del jugador.
2. Fuerzas: gravedad; arrastre del aire con el área proyectada de un cilindro según el ángulo con la velocidad (`Cd·(2r·h·sen θ) + Cd·π r² |cos θ|`); par de arrastre al girar (cuadrático) y un amortiguamiento angular pequeño. En vuelo (|vy| > 7 m/s o ω > 18 rad/s sin contacto) el arrastre sube ×1,8 y el rebote baja ×0,75.
3. Contactos:
   - suelo: el punto más bajo de cada tapa (un cuadrado de puntos si el barril está casi de pie: base estable);
   - muros: las mismas caras que usa el coche (con las abolladuras que dejaron los coches), solo por debajo de 1 m: un barril que vuela por encima de un muro pasa al otro lado;
   - barril-barril: muestras del borde de cada tapa más el punto de apoyo hacia el otro barril, en los dos sentidos. El borde está redondeado 12 mm: así un barril encima de otro siempre da contactos de tapa (apilable) y dos barriles de lado siempre dan contactos laterales;
   - coche-barril: las muestras del barril contra el casco del coche (caja con frontal vertical hasta el paragolpes/alerón y morro inclinado encima: 14° en coches de calle, 24° en coches de carreras, 38° en monoplazas y prototipos) y las esquinas del coche contra el barril. La cara de contacto se elige por la que el punto cruzó más recientemente (profundidad / velocidad de aproximación): un CCD sencillo que evita el túnel aunque el coche avance 0,37 m por paso a 320 km/h.
4. Solver de impulsos secuenciales: 10 iteraciones de velocidad (normal con impulso acumulado ≥ 0 y fricción de Coulomb en un círculo), arranque en caliente con el 90 % del impulso del paso anterior (por contacto: barril, cara y muestra), rebote solo en contactos nuevos (un contacto que ya estaba no reinyecta energía).
5. Tope de impulso: un coche no puede dar a un barril más de 1,4 veces su propia velocidad (+2 m/s); techo global de 70 m/s y 45 rad/s.
6. Resistencia a la rodadura y al giro sobre la base (se escala con el impulso normal del suelo; ×3,5 en hierba, ×9 en grava; una abolladura la aumenta).
7. Corrección de posición con pseudovelocidades (split impulse, 4 iteraciones, 25 % del solape por paso, máx. 2,5 m/s): arreglar un solape no añade velocidad.
8. Integración (cuaternión normalizado) y sueño por islas: una isla de barriles que se tocan duerme entera cuando todos están por debajo de 0,1 m/s y 0,25 rad/s durante 0,8 s. Se despierta cuando la toca un coche o un barril despierto.

### Coche
El coche recibe la parte horizontal de cada impulso en el punto exacto de contacto: cambia su velocidad y su velocidad de guiñada (un barril golpeado con una esquina gira el coche). La pérdida de agarre posterior la da su propio modelo de neumáticos. El impulso vertical no lo toma (su suspensión no está modelada en 3D): un barril que cae encima resbala por el capó. Daño: un golpe en la zona del contacto que crece con la velocidad de cierre y con la raíz de la masa del barril (`dmgImpact`, tipo `barrel`): un barril de 15 kg a 150 km/h rompe un alerón delantero de F1, un bloque de barriles de agua de 80 kg dobla una suspensión.

## Valores

### Barriles
| Tipo | Medidas | Masa | Centro de masas | Inercia axial / transversal | Material |
|---|---|---|---|---|---|
| `plastic` (bidón HDPE 220 L con 6 kg de arena) | Ø 0,58 × 0,93 m | 9,5 + 6 = 15,5 kg | 0,17 m por debajo del centro | 0,96 / 2,23 kg·m² | e 0,35 asfalto, 0,40 entre barriles |
| `water` (el mismo bidón con 70 L de agua) | Ø 0,58 × 0,93 m | 79,5 kg | 0,29 m por debajo | 3,65 / 4,17 kg·m² | e 0,15 (el agua disipa) |
| `steel` (bidón de acero 200 L) | Ø 0,572 × 0,88 m | 19 + 3 = 22 kg | 0,06 m por debajo | 1,49 / 3,06 kg·m² | e 0,22 asfalto, 0,25 entre barriles |

La inercia la calcula `barrelMass` (pared lateral como tubo fino, tapas como discos, lastre como disco macizo abajo, todo trasladado al centro de masas); no se usa ningún valor por defecto.

### Pares de materiales (μ deslizamiento, e restitución)
| Barril \ con | asfalto | hierba | grava | plástico | acero | coche | hormigón | armco | neumáticos |
|---|---|---|---|---|---|---|---|---|---|
| plástico | 0,62 / 0,35 | 0,45 / 0,20 | 0,65 / 0,05 | 0,50 / 0,40 | 0,48 / 0,30 | 0,45 / 0,30 | 0,60 / 0,30 | 0,45 / 0,30 | 0,80 / 0,10 |
| agua | 0,62 / 0,15 | 0,45 / 0,10 | 0,65 / 0,03 | 0,50 / 0,25 | 0,48 / 0,18 | 0,45 / 0,15 | 0,60 / 0,15 | 0,45 / 0,15 | 0,80 / 0,05 |
| acero | 0,55 / 0,22 | 0,42 / 0,12 | 0,60 / 0,04 | 0,48 / 0,30 | 0,45 / 0,25 | 0,40 / 0,20 | 0,55 / 0,20 | 0,42 / 0,25 | 0,80 / 0,08 |

Arrastre: Cd 0,9 de lado y 1,0 de frente (bidón con aros: rugoso, sin crisis de arrastre). Rodadura: 0,15 plástico (aros y arena suelta), 0,25 agua (oleaje), 0,05 acero.

### Muros (coche)
| Muro | Antes | Ahora | Por qué |
|---|---|---|---|
| Hormigón | e 0,20, μ 0,35 | e 0,10, μ 0,40 | El coche (su zona de deformación) se lleva la energía; el muro casi no devuelve |
| Armco rígido (sin recorrido) | e 0,12, μ 0,35 | e 0,18, μ 0,38 | Algo más de rebote que el hormigón |
| Armco cediendo | μ 0,38 con la fuerza nominal de aplastamiento | μ 0,40 con el impulso normal real | Error corregido: un coche que solo rozaba el raíl se frenaba a ~5 g |
| Neumáticos | e 0,12, μ 0,35 (rígido) / 0,70 cediendo | e 0,06, μ 0,75 / 0,72 cediendo | Absorben y «abrazan» |

## Qué partes del encargo no aplican o no compensan
- **Unity / PhysX / Chaos**: no aplica. El juego tiene su propio motor en el navegador; meter un motor de física externo (Ammo/Rapier en WebAssembly) rompería el determinismo del rebobinado y pesaría varios MB más en móvil.
- **Fricción de 0,75-0,90 para hormigón y 0,85-1,0 para neumáticos**: demasiado alta. Es fricción de goma, no de una carrocería deslizando sobre un muro; con esos valores el coche se clava y trompea. Los ensayos de barreras (NCHRP 350 / EN 1317, coche a 100 km/h y 20-25°) dan salidas de alrededor del 60-70 % de la velocidad de impacto, lo que corresponde a μ ≈ 0,3-0,45. Las barreras de neumáticos FIA llevan además una cinta transportadora delante precisamente para que no agarren.
- **Muros de neumáticos como cuerpos rígidos unidos con juntas**: no compensa. Kilómetros de neumáticos con juntas no caben en un móvil y no aportan sobre el modelo actual: el muro se aplasta con fuerza constante, conserva la forma y suelta neumáticos que salen volando.
- **Deformación con blendshapes del armco**: ya existe (el raíl se dobla y se queda doblado, `refreshRail`).
- **Barriles masa 40-80 kg de acero**: un bidón de acero de 200 L vacío pesa 18-23 kg. Se usa 22 kg; el de 80 kg es el barril de agua.
- **12-18 iteraciones del solver**: 10 de velocidad + 4 de posición a 240 Hz bastan (las torres de 4 se quedan quietas a < 1 cm y duermen en 0,8 s); más solo cuesta CPU.
- **Pooling de objetos**: los contactos sí se reciclan (sin basura por paso); los barriles son pocos y fijos por circuito, no hace falta un pool.
- **Rotura de barriles**: no está; solo abolladura visual. Partirlos en trozos no aporta a la conducción.
- **Multijugador (v100)**: el anfitrión es la autoridad. Todos simulan los barriles; los coches de los demás jugadores los empujan como cuerpos cinemáticos (masa infinita, no reciben nada; solo con colisiones activadas). El anfitrión manda el estado a 20 Hz mientras algo se mueve y 1 s más (`netPack`, presencia `bw`/`bs`); cada invitado lo mezcla con el suyo (`netApply`): lo que su propio coche tocó en el último segundo (y lo que eso empujó) se queda con el resultado local, para sentir el golpe sin espera; el resto se desliza hacia el estado del anfitrión, como mucho 0,25 m por paquete, y salta solo si está a más de 6 m. El ajuste del anfitrión decide si hay barriles (`cfg.bar`).

## Pruebas
`node tools/headless.js barrels` (exit 1 si falla):
- 80 km/h con la esquina delantera: el barril sale desviado, entre 0,6 y 1,45 veces la velocidad del coche; el coche pierde 0,2-6 km/h y gira algo.
- 150 km/h de frente (GT3 y W17): el barril vuela (> 0,3 m), sin explosión (< 1,45 veces la velocidad del coche, < 25 m de alto), el coche pierde 0,5-8 km/h.
- 8 km/h: lo empuja o lo vuelca, nunca lo lanza.
- Torre de 4 sola 10 s: < 1 cm y dormida. Torre de 4 a 30 km/h: se derrumba entera. A 100 km/h: ningún barril sube más de 6 m.
- Pirámide 3-2-1 a 60 km/h, bloque de 2×3 barriles de agua a 100 km/h (el coche pierde 8-60 km/h).
- Barril contra hormigón a 15 m/s: rebota entre 0,1 y 0,5 de la velocidad.
- Determinismo: dos veces el mismo choque idéntico, y foto a mitad del choque + repetición idéntica.
- Coste: < 0,5 ms por paso con 26 barriles despiertos a la vez.
- En los 10 trazados: el amortiguador no pisa la pista y no se mueve al asentarse.
- Multijugador: un invitado golpea el amortiguador a 100 km/h; el anfitrión lo ve 100 ms tarde, un observador 200 ms; paquetes a 20 Hz con 100 ms de retardo. Al final, invitado y observador a < 5 cm del anfitrión, sin saltos visibles.

`node tools/net_test.mjs room`: en una carrera real de dos páginas, los dos tienen el amortiguador y un barril que el anfitrión tumba queda igual en el invitado (< 5 cm).

`node tools/headless.js walls [old]`: GT3 contra hormigón, armco y neumáticos a 80 km/h y 30°, 150 km/h y 10°, 50 y 150 km/h de frente.

## Límites
- El coche no sube encima de un barril tumbado (es plano): lo empuja como una pala.
- Un barril que cae sobre el coche resbala por el capó; el coche no nota el peso.
- El rebobinado devuelve los barriles, pero no a los rivales (como antes).
- Multijugador: si un invitado golpea un barril, durante ~0,2 s los demás lo ven moverse según el coche retrasado que ven ellos; al asentarse todos quedan con el estado del anfitrión (< 5 cm).
