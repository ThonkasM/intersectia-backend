# IntersectIA Backend

Backend for **IntersectIA**, an autonomous intersection management system. This service is the **source of truth** of a real-time traffic simulation: it simulates vehicles approaching a four-way intersection (N, S, E, W), decides who crosses using a deterministic FIFO decision engine (with an optional AI decision client that falls back to the deterministic engine), and broadcasts the live vehicle state to connected clients over WebSocket.

## Stack

- **NestJS** (TypeScript) — application framework
- **Prisma** + **PostgreSQL** — persistence of simulation sessions, vehicle crossings, and violations
- **Socket.IO** — WebSocket gateway for broadcasting live vehicle state
- **@nestjs/axios** — HTTP client for calling the AI decision service

## Key Concepts

- **Simulation loop**: ticks at ~50ms server-side. The backend spawns, moves, queues, and decides; the frontend only renders/interpolates.
- **DecisionEngine**: `decideNextCrossing(queue, occupant): Promise<string|null>` — implemented by `DeterministicDecisionService` (FIFO) and `AiDecisionClient` (calls the AI service with a 150ms timeout, falling back to the deterministic engine on failure).
- **WebSocket `state` message**: `{ id, x, z, from: 'N'|'S'|'E'|'W', state: 'approach'|'queued'|'crossing'|'gone' }[]`
- **Metrics**: crossings, wait times, and violations are persisted asynchronously so DB writes never block the simulation tick.

## Setup

```bash
npm install
cp .env.example .env   # configure DATABASE_URL and friends
npx prisma generate
npx prisma migrate dev # create/apply the schema
```

## Running

```bash
npm run start:dev   # development (watch mode)
npm run build       # compile
npm run start:prod  # run compiled output
```

## Tests

```bash
npm test
```