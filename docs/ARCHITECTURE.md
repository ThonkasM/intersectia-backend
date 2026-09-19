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

## Reglas del nodo, carriles y jugador

Reglas puras en `domain/decision-rules.ts` (con tests propios):

- **El ocupante se libera apenas cruza**: una dirección en conflicto deja de esperar
  cuando el vehículo que cruza supera el centro + margen (`occupantHasCleared`), no cuando
  desaparece en el horizonte. Menos espera innecesaria.
- **Sin spillback (no bloquear la caja)**: a un vehículo no se le concede el cruce si tiene
  un vehículo detenido por delante dentro del tramo de salida (`exitBlockedBy`): espera en la
  línea de parada en vez de quedar atravesado bloqueando la intersección.
- **Uso de carriles**: si el carril propio está detenido, el vehículo inicia el cambio de
  carril antes (`shouldChangeLaneForQueue`), usando el carril vecino libre para no quedar
  atrapado detrás de una cola o de un vehículo lento.
- **Reacción al jugador**: el jugador **ya no congela toda la intersección**. Si está dentro,
  solo ceden las direcciones que conflictúan con él; las opuestas/sin conflicto siguen
  cruzando. Los autónomos además lo esquivan por el carril libre y ceden el paso al cruzarse.

## Persistencia

Modelos Prisma: `SimulationSession`, `VehicleCrossing`, `IntersectionViolation`, `ContactMessage`. Las escrituras (cruces, violaciones) son asíncronas y no bloquean el tick. Al cerrar una sesión se escribe `endedAt`.

## Notas de rendimiento y seguridad

- Los vehículos del jugador tienen tope (`MAX_PLAYERS`) y el total de vehículos se limita a `MAX_VEHICLES`.
- CORS configurable con `CORS_ORIGIN`.
