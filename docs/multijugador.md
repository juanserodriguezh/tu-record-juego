# Multijugador: salas privadas por código (v91)

Sin matchmaking ni buscador público: solo se entra creando una sala o escribiendo su código.

## Flujo de pantallas del menú privado

```mermaid
flowchart TD
    M[Menú · hoja de cristal<br/>Pista · Coche · Sesión] -->|"botón «Unirse a sala» (barra superior)<br/>o Sesión › Multijugador"| P

    subgraph P[Sesión › Multijugador · sin sala]
      direction TB
      ID[Tu nombre + color<br/>avatar con iniciales]
      J[Campo «Código»<br/>se une solo al 4.º carácter]
      CR[«Crear sala privada»<br/>o botón principal]
    end

    J -->|código mal escrito| E1[/Aviso: código no válido/]
    J -->|nadie con ese código| E2[/Aviso: no hay ninguna sala/]
    J -->|sala con 8 pilotos| E3[/Aviso: sala llena/]
    J -->|carrera en marcha| E4[/Aviso: la carrera ya empezó/]
    E1 & E2 & E3 & E4 --> P
    J -->|ok| G
    CR -->|el anfitrión reserva el código| H
    L[Enlace compartido …#K7QX] -->|abre el juego y entra| G

    subgraph H[Sala · anfitrión]
      direction TB
      HC[Código grande · Copiar código / enlace]
      HL[Pilotos: Anfitrión · ¡Listo! · Esperando… · Cargando pista…]
      HS[Pista ›  · Vueltas − + · Colisiones sí/no]
      HB[«Iniciar carrera»<br/>activo solo con todos listos]
    end

    subgraph G[Sala · invitado]
      direction TB
      GC[Código grande · Copiar]
      GL[Pilotos y estado]
      GS[Ajustes del anfitrión, solo lectura]
      GB[«¡Estoy listo!» ⇄ «Listo ✓»]
    end

    H -->|Pista ›| PI[Paso Pista: el anfitrión cambia el circuito<br/>los invitados lo cargan solos]
    PI --> H
    G -->|Cambiar coche o color| CO[Paso Coche<br/>la sala sigue abierta, chip con el código arriba]
    H -->|Cambiar coche o color| CO
    CO --> G
    CO --> H
    HB --> R[Carrera sincronizada<br/>semáforo común · nombres sobre los coches · tabla en vivo]
    GB -.->|el anfitrión pulsa Iniciar| R
    R --> RES[Resultados] -->|Volver a la sala| H
    RES -->|Volver a la sala| G
    G -->|el anfitrión cierra o se cae| E5[/Aviso: el anfitrión cerró la sala/] --> P
    R -->|el anfitrión se va| E6[/Aviso: sigue tu carrera; al volver, sala cerrada/] --> RES
    H -->|Salir de la sala| P
    G -->|Salir de la sala| P
```

Mínimo de toques para unirse: **Unirse a sala → escribir el código → ¡Estoy listo!** (con el enlace, ni siquiera el código).

## Módulos

| Archivo | Qué hace |
|---|---|
| `src/net.js` | **Room Manager**: códigos (`normCode`, `codeValid`, `newCode`), los dos transportes (`P2PRoom` con PeerJS y la sala de Claude), admisión (`netRefusal`: sin anfitrión, llena, empezada), unirse/crear/salir, avisos de entradas y salidas, arranque de carrera, envío del estado a 20 Hz, **sincronización del perfil** (`pilotProfile`, `netProfileSync`) e **interpolación** (`netClock`, `netSampleAt`, `netPoseRemote`) y etiquetas con el nombre (`netTags`). |
| `src/lobby.js` | **UI de la sala** dentro de la hoja del menú: formulario de código, sala (código, pilotos, ajustes), botón principal según el estado (`lobbyFoot`, `lobbyPrimary`), chip de sala en la cabecera, avisos emergentes (`netNotify`). |
| `src/main.js` | Llama a lo anterior: modo «Multijugador», colisiones remotas solo si `SES.netCol`, `netTags()` cada cuadro, `netProfileSync()` al cambiar coche o librea. |

### Perfil del piloto (presencia en red)
`pid` (id persistente en `localStorage`), `name`, `car`, librea (`c1` = color del avatar, `c2`, `pt`, `fn`, `rm`), `rdy`, `trk`, `ph`. El id de sesión en red es el id del par (PeerJS o la sala de Claude). Ver la cabecera de `src/net.js` para el registro completo.

### Transportes
- **Dentro de Claude (artefacto):** sala de Claude (`window.claude.use('room')`). Solo admite cuentas con acceso al artefacto (organización o invitados); con enlace público o sin sesión no hay sala, y el botón principal abre la versión web (v104). La admisión la comprueba quien entra, con la presencia que ya ve.
- **Fuera de Claude (hosting propio):** PeerJS (WebRTC). El anfitrión reserva `spa-record-v1-CODIGO` en el servidor público de PeerJS y reenvía el estado de todos (estrella). Decide la admisión y responde `deny` con el motivo.
- **Relé (v106):** si el invitado no consigue canal WebRTC en 4 s (redes móviles, CGNAT, empresas), entra por un broker MQTT público (`armk-racing/v1/CODIGO/h` al anfitrión, `/a` a todos, `/g/<id>` a uno). Mismo protocolo; gana el primer enlace que trae la bienvenida.

### Estados de carrera (v107)
Arreglo corto `[hora, carrera, x, z, rumbo, u, v, vuelta, s, y]` fuera de la presencia. Invitado → anfitrión (`t:'s'`); el anfitrión manda cada 40 ms un paquete `t:'S'` con el último estado de cada piloto. En WebRTC por un segundo canal sin orden. En la sala de Claude siguen en la presencia.

**Indicador en carrera (v107).** Arriba al centro, bajo el nombre de la curva: tipo de enlace (directa / por servidor), ping al anfitrión, FPS y el peor fotograma de los últimos 2 s si pasa de 60 ms. El anfitrión ve cuántos invitados van por cada vía y el peor ping. Sirve para distinguir un problema de red (ping alto, «por servidor») de uno del dispositivo (FPS bajos, tirones).

**Carga del circuito.** Al empezar una carrera todos cargan a la vez y un dispositivo lento puede bloquearse muchos segundos: durante 75 s el silencio tolerado sube de 20 s a 75 s en ambos sentidos.

### Límites conocidos
- Topología en estrella: si el anfitrión se va en mitad de la carrera (PeerJS), los invitados dejan de ver a los demás; su carrera sigue y cuenta. No hay migración de anfitrión.
- Sin servidor autoritativo: cada piloto simula su coche y envía su posición (anti-trampas fuera de alcance).
- PeerJS usa su servidor público de señalización y STUN; donde WebRTC no abre se usa el relé MQTT (brokers públicos gratuitos, sin garantía). Una red que bloquee también WebSocket a 8084/8884 no puede unirse.
- Coches remotos (v106): se dibujan donde están ahora (`netPredict`), no en el pasado; `net_test.mjs lab` lo mide.

## Pruebas
`node tools/net_test.mjs p2p|relay|room|lab` (ver la cabecera del archivo): páginas reales del juego entrando por código, con todos los errores, carrera y salida del anfitrión.
`node tools/net_fresh_test.mjs`: dispositivos nuevos (sin datos guardados) crean salas, también pulsando antes de que cargue PeerJS, y el caso Claude sin acceso a la sala.
