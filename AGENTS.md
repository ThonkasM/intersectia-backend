# AGENTS.md

## Project

IntersectIA backend: a NestJS + Prisma service that is the **source of truth** of a traffic simulation for an autonomous intersection management system. It simulates vehicles, decides who crosses (deterministic FIFO decision engine, with an optional AI decision client that must time out after 150ms and fall back to the deterministic engine), broadcasts live vehicle state over WebSocket, and persists metrics (sessions, crossings, violations) with Prisma.

## Commands

- Install: `npm install`
- Dev server: `npm run start:dev` (watch mode)
- Build: `npm run build`
- Test: `npm test` (unit) / `npm run test:e2e` (e2e)
- Prisma generate: `npx prisma generate`
- Prisma migrate (create/apply): `npx prisma migrate dev`
- Prisma migrate (deploy in prod): `npx prisma migrate deploy`
- Prisma studio: `npx prisma studio`

## Architecture Conventions

These conventions MUST be respected (from the design docs):

- The simulation loop ticks at ~50ms server-side. The **backend SIMULATES** (spawn/move/queue/decide) and the **frontend only renders/interpolates**. Never move simulation logic to the client.
- A `DecisionEngine` interface — `decideNextCrossing(queue, occupant): Promise<string|null>` — is implemented by `DeterministicDecisionService` (FIFO) and `AiDecisionClient`. `AiDecisionClient` calls the AI service with a **150ms timeout** and **MUST fall back to the deterministic engine** on any failure/timeout.
- `SimulationLoopService` must be a **singleton** — NEVER `@Injectable({ scope: Scope.REQUEST })` — so all WebSocket clients share the same live simulation.
- DB writes must **NOT block the simulation tick**: persist asynchronously with `.catch()` + logging.
- The WebSocket `state` message shape is:
  `{ id, x, z, from: 'N'|'S'|'E'|'W', state: 'approach'|'queued'|'crossing'|'gone' }[]`
- Environment variables via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`), never hardcoded. See `.env.example`.
- Explicit timeouts on ALL external calls inside the loop (AI service, DB, any HTTP call).

## Multi-session (por visitante)

`SimulationLoopService` ya **no** es una simulación global: es un gestor que mantiene
`Map<sessionId, SessionSimulation>` y un único `setInterval` recorre todas las sesiones. El
gateway usa **salas de socket.io** (`server.to(sessionId)`) y recibe el `sessionId` por el
handshake (`auth.sessionId`) o `client.id`. Ver `docs/SESSIONS.md`.

- Cada `SessionSimulation` tiene mutex de reentrancia (`ticking`) para que un tick lento (IA 150 ms)
  no se solape.
- Las escrituras a métricas reciben el `sessionId` de la sesión (no hay `currentSessionId` global).
- Los payloads WS se validan con `ValidationPipe` + DTOs; CORS vía `CORS_ORIGIN`.

## Docs

- `docs/ARCHITECTURE.md`, `docs/SESSIONS.md`, `docs/API.md`.

## Notes

- Do NOT add code comments to source files unless truly necessary.