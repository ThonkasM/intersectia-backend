# Arquitectura del backend

NestJS + Prisma + socket.io. Es la **fuente de verdad** de la simulación: genera vehículos, los mueve, los encola y decide quién cruza. El frontend solo interpola.

## Módulos

| Módulo | Responsabilidad |
|---|---|
| `PrismaModule` | `@Global`, provee `PrismaService` (conecta/desconecta). |
| `IntersectionManagerModule` | Núcleo: gestor de sesiones, gateway WS y motores de decisión. |
| `SimulationMetricsModule` | Persistencia y endpoints REST de métricas. |
| `AiProxyModule` | Proxy HTTP a `intersectia-ai` (`/ai/chat`, `/ai/chat/topics`) con rate-limit. |

## Ciclo de simulación

- Un **único `setInterval` de 50 ms** en `SimulationLoopService` recorre todas las sesiones activas y llama `SessionSimulation.tick()`.
- Cada sesión tiene su propio **mutex de reentrancia** (`ticking`), de modo que un tick lento (p. ej. la llamada a la IA con timeout de 150 ms) no se solapa consigo mismo.
- Orden del tick: `handlePlayerVehicles → maybeSpawn → moveVehicles → detectViolations → detectCollisions → decideAndRelease → cleanupFinished → emitState`.

## Motores de decisión

Interfaz `DecisionEngine.decideNextCrossing(queue, occupant): Promise<string|null>`.

- `DeterministicDecisionService` — FIFO.
- `RightPriorityDecisionService` — prioridad a la derecha (Art. 52).
- `AiDecisionClient` — llama a `intersectia-ai` con **timeout de 150 ms** y **fallback determinista** ante timeout, error o id inválido.

Se seleccionan según `SimMode` (`traditional` → derecha, `managed-ai` → IA, `managed` → FIFO). El backend envía el `occupant` a la IA para que la política pueda considerar la ocupación.

## WebSocket

socket.io con **salas por sesión**. Eventos servidor→cliente: `state` (20 Hz) y `decision`. Cliente→servidor: `setMode`, `playerState`, `freezeVehicle`, `resumeVehicle`, `reset`, `setCollisions`. Todos los payloads se validan con `ValidationPipe` y DTOs con `class-validator`.

## Persistencia

Modelos Prisma: `SimulationSession`, `VehicleCrossing`, `IntersectionViolation`, `ContactMessage`. Las escrituras (cruces, violaciones) son asíncronas y no bloquean el tick. Al cerrar una sesión se escribe `endedAt`.

## Notas de rendimiento y seguridad

- Los vehículos del jugador tienen tope (`MAX_PLAYERS`) y el total de vehículos se limita a `MAX_VEHICLES`.
- CORS configurable con `CORS_ORIGIN`.
