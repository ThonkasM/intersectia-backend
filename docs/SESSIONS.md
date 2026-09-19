# Sesiones aisladas (multi-tenant)

Cada visitante que abre `/demo` recibe su **propia simulación**. Ya no hay una única simulación global compartida.

## Cómo funciona

1. El frontend genera un `sessionId` (almacenado en `sessionStorage`) y lo envía en el handshake de socket.io (`auth.sessionId`).
2. El gateway lo sanea (solo `[A-Za-z0-9_-]`, máx. 64) y hace `socket.join(sessionId)`.
3. `SimulationLoopService` mantiene un `Map<sessionId, SessionSimulation>`.
4. Las emisiones `state` y `decision` se hacen a la sala (`server.to(sessionId)`), nunca globales.
5. Cada `SessionSimulation` tiene vehículos, cola y ocupantes propios, y su propia fila en `SimulationSession`.

## Ciclo de vida

- Se crea al conectar el primer cliente de esa sesión.
- `addClient` / `removeClient` llevan un conteo por sesión.
- Al quedar vacía, se programa la destrucción tras **60 s de gracia** (por si el cliente reconecta).
- Al destruirse, se escribe `endedAt` de la sesión en la base de datos.

## Archivos clave

- `src/modules/intersection-manager/domain/session-simulation.ts` — estado y lógica por sesión.
- `src/modules/intersection-manager/simulation-loop.service.ts` — registro y tick de todas las sesiones.
- `src/modules/intersection-manager/intersection-manager.gateway.ts` — salas, validación y CORS.

## Compatibilidad

Si un cliente no envía `sessionId`, se usa `client.id` como sesión (aislado igualmente). El vehículo del jugador usa el id `player` dentro de su sesión, por lo que no choca con otros visitantes.
