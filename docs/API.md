# API del backend

## HTTP

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | `{ name: "IntersectIA Backend", status: "ok" }` |
| GET | `/metrics/avg?mode=<mode>` | `{ avgWaitSeconds, total }` |
| GET | `/metrics/summary` | `{ totalCrossings, totalViolations, avgWaitByMode }` |
| POST | `/ai/chat` | `{ message, sessionId? }` → `{ answer }` (proxy a la IA) |
| GET | `/ai/chat/topics` | `{ topics: [{ slug, titulo, categoria }] }` |

`mode` ∈ `traditional | managed | managed-ai`. `/ai/chat` tiene rate-limit por sesión (20 req/min).

## WebSocket (socket.io)

Handshake: `auth: { sessionId }` (opcional). La sesión determina la sala.

### Servidor → cliente

- `state` — `RemoteVehicleDto[]` a 20 Hz:
  ```ts
  { id, x, z, from: 'N'|'S'|'E'|'W',
    state: 'approach'|'queued'|'crossing'|'success'|'gone',
    frozen: boolean, crashed: boolean }
  ```
- `decision` — `{ vehicleId, from, waitSeconds, engine: 'fifo'|'right-priority'|'ai', at }`.

### Cliente → servidor

| Evento | Payload | Validación |
|---|---|---|
| `setMode` | `{ mode }` | `mode` ∈ 3 modos |
| `playerState` | `{ id, x, z, from, speed }` | números en rango, `from` válido, id ≤ 64 |
| `freezeVehicle` / `resumeVehicle` | `{ id }` | string ≤ 64 |
| `reset` | — | — |
| `setCollisions` | `{ enabled }` | booleano |

Payloads inválidos son rechazados por el `ValidationPipe` del gateway (no rompen la simulación).

## IA interna

El backend llama a `intersectia-ai` con `X-Internal-Token`:
- `POST /decision` — timeout 150 ms, fallback FIFO.
- `POST /chat`, `GET /chat/topics` — proxy de solo lectura.
