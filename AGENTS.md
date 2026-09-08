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

## Notes

- Do NOT add code comments to source files unless truly necessary.