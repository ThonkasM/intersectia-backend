import { Logger } from '@nestjs/common';
import {
  LANE_WIDTH,
  laneFromPosition,
  laneOffset,
  Vehicle,
  type Turn,
} from './vehicle.model';
import {
  APPROACH_SPEED,
  CROSSING_BRAKE,
  CROSSING_SPEED,
  EXIT_DISTANCE,
  GONE_DISTANCE,
  INTERSECTION_HALF,
  SPAWN_DISTANCE,
  STOP_LINE_DISTANCE,
  applyBrake,
  computeSeparationSpeed,
  distanceToIntersection,
  progress,
  vehiclesOverlap,
} from './intersection-state';
import {
  PLAYER_MAX_SPEED,
  isPlayerTimedOut,
  shouldFlagViolation,
} from './player-vehicle.rules';
import {
  exitBlockedBy,
  isStarving,
  movementConflicts,
  occupantHasCleared,
  shouldChangeLaneForQueue,
  STOPPED_SPEED,
  withinIntersection,
} from './decision-rules';
import {
  buildTurnPath,
  exitDirection,
  laneForTurn,
  sampleQuadratic,
} from './turn-path';
import {
  DecisionEngine,
  DecisionEngineName,
  DecisionEvent,
  SimMode,
} from '../decision/decision.interface';
import { DeterministicDecisionService } from '../decision/deterministic-decision.service';
import { RightPriorityDecisionService } from '../decision/right-priority-decision.service';
import { AiDecisionClient } from '../decision/ai-decision.client';
import { SimulationMetricsService } from '../../simulation-metrics/simulation-metrics.service';
import { RemoteVehicleDto } from '../dto/remote-vehicle.dto';
import { PlayerStateDto } from '../dto/player-state.dto';

const TICK_DT = 0.05;
const MAX_VEHICLES = 14;
const MAX_PLAYERS = 4;
const LANE_CHANGE_COOLDOWN = 1.5;
const OVERTAKE_CLEARANCE = 7;
const LANE_BALANCE_LOOKAHEAD = 40;
const CRASH_DURATION = 2.0;
const CRASH_COOLDOWN = 1.5;
const DIRECTIONS: Array<Vehicle['from']> = ['N', 'S', 'E', 'W'];

export interface SessionSimulationDeps {
  sessionId: string;
  metrics: SimulationMetricsService;
  deterministicDecision: DeterministicDecisionService;
  rightPriorityDecision: RightPriorityDecisionService;
  aiDecisionClient: AiDecisionClient;
  emitState: (vehicles: RemoteVehicleDto[]) => void;
  emitDecision: (event: DecisionEvent) => void;
  logger: Logger;
  random?: () => number;
}

export class SessionSimulation {
  private readonly vehicles: Vehicle[] = [];
  private readonly queue: Vehicle[] = [];
  private occupants: Vehicle[] = [];
  private mode: SimMode = 'managed';
  private spawnCountdown = 1.5;
  private nextId = 0;
  private ticking = false;
  private disposed = false;
  private dbSessionId: string | null = null;
  private readonly playerLastSeen = new Map<string, number>();
  private collisionsEnabled = false;
  private readonly random: () => number;

  constructor(private readonly deps: SessionSimulationDeps) {
    this.random = deps.random ?? Math.random;
  }

  get sessionId(): string {
    return this.deps.sessionId;
  }

  async init(): Promise<void> {
    try {
      this.dbSessionId = await this.deps.metrics.startSession(this.mode);
    } catch (err) {
      this.deps.logger.warn(
        `[${this.sessionId}] failed to start session: ${String(err)}`,
      );
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.dbSessionId) {
      await this.deps.metrics
        .endSession(this.dbSessionId)
        .catch((err: unknown) =>
          this.deps.logger.warn(
            `[${this.sessionId}] failed to end session: ${String(err)}`,
          ),
        );
    }
  }

  private getEngine(): DecisionEngine {
    switch (this.mode) {
      case 'managed-ai':
        return this.deps.aiDecisionClient;
      case 'traditional':
        return this.deps.rightPriorityDecision;
      default:
        return this.deps.deterministicDecision;
    }
  }

  setMode(mode: SimMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // Un vehiculo encolado que ya no esta en la cola volveria a quedar inmóvil:
    // lo devolvemos a "approach" para que se re-encola con el nuevo motor.
    for (const v of this.vehicles) {
      if (v.state === 'queued') v.state = 'approach';
    }
    this.queue.length = 0;
    this.deps.logger.log(`[${this.sessionId}] mode set to ${mode}`);
    void this.restartDbSession();
  }

  private async restartDbSession(): Promise<void> {
    if (this.dbSessionId) {
      await this.dispose();
      this.disposed = false;
    }
    await this.init();
  }

  async tick(): Promise<void> {
    if (this.ticking || this.disposed) return;
    this.ticking = true;
    try {
      this.handlePlayerVehicles();
      this.maybeSpawn();
      this.moveVehicles();
      this.detectViolations();
      this.detectCollisions();
      await this.decideAndRelease();
      this.cleanupFinished();
      this.deps.emitState(this.toSnapshot());
    } catch (err) {
      this.deps.logger.error(
        `[${this.sessionId}] tick failed: ${String(err)}`,
      );
    } finally {
      this.ticking = false;
    }
  }

  private handlePlayerVehicles(): void {
    const now = Date.now();
    for (const v of this.vehicles) {
      if (!v.isPlayerControlled) continue;
      if (isPlayerTimedOut(this.playerLastSeen.get(v.id) ?? 0, now)) {
        this.deps.logger.warn(
          `[${this.sessionId}] player vehicle ${v.id} handed over to autonomous mode`,
        );
        v.isPlayerControlled = false;
        this.playerLastSeen.delete(v.id);
      }
    }
  }

  private maybeSpawn(): void {
    this.spawnCountdown -= TICK_DT;
    if (this.spawnCountdown > 0) return;
    if (this.vehicles.length < MAX_VEHICLES) {
      const from = DIRECTIONS[Math.floor(this.random() * DIRECTIONS.length)];
      const roll = this.random();
      const turn: Turn =
        roll < 0.6 ? 'straight' : roll < 0.8 ? 'right' : 'left';
      const lane = laneForTurn(turn, this.random() < 0.5 ? 0 : 1);
      const { dx, dz } = Vehicle.DIRECTION[from];
      const off = laneOffset(from, lane);
      const vehicle = new Vehicle(
        `v-${this.nextId++}`,
        from,
        off.x - dx * SPAWN_DISTANCE,
        off.z - dz * SPAWN_DISTANCE,
        lane,
      );
      vehicle.turn = turn;
      vehicle.exitFrom = exitDirection(from, turn);
      this.vehicles.push(vehicle);
    }
    this.spawnCountdown = 1 + this.random() * 1.5;
  }

  private moveVehicles(): void {
    for (const v of this.vehicles) {
      if (v.crashTimer > 0) {
        v.crashTimer -= TICK_DT;
        if (v.crashTimer <= 0) {
          v.crashed = false;
          v.crashCooldown = CRASH_COOLDOWN;
        }
      } else if (v.crashCooldown > 0) {
        v.crashCooldown -= TICK_DT;
      }
    }

    const player = this.playerVehicle();
    const yieldToPlayer = player?.state === 'crossing';
    for (const v of this.vehicles) {
      if (
        v.isPlayerControlled ||
        v.frozen ||
        v.crashed ||
        v.state === 'queued' ||
        v.state === 'gone'
      ) {
        continue;
      }
      const cruise = v.state === 'crossing' ? CROSSING_SPEED : APPROACH_SPEED;
      if (v.speed < cruise && !(yieldToPlayer && v.state === 'crossing')) {
        v.speed = Math.min(cruise, v.speed + CROSSING_BRAKE * TICK_DT);
      }
    }
    for (const v of this.vehicles) {
      if (
        v.isPlayerControlled ||
        v.frozen ||
        v.crashed ||
        v.state === 'queued' ||
        v.state === 'gone'
      ) {
        continue;
      }
      if (v.state === 'crossing' && v.path) {
        this.advanceAlongPath(v, TICK_DT);
        continue;
      }
      if (
        yieldToPlayer &&
        player &&
        v.state === 'crossing' &&
        this.conflicts(v, player)
      ) {
        v.speed = applyBrake(v.speed, TICK_DT);
      }
      const ahead = this.findAhead(v);
      if (ahead) {
        v.speed = computeSeparationSpeed(v, ahead);
        const gap = progress(ahead) - progress(v);
        if (
          shouldChangeLaneForQueue(
            gap,
            ahead.speed < STOPPED_SPEED,
            v.laneChangeCooldown,
            this.isLaneClear(v, 1 - v.lane),
          )
        ) {
          const target = this.freerLane(v);
          if (target !== v.lane) {
            v.lane = target;
            v.laneChangeCooldown = LANE_CHANGE_COOLDOWN;
          }
        }
      }
      v.laneChangeCooldown = Math.max(0, v.laneChangeCooldown - TICK_DT);
      v.steerToLane(TICK_DT);
      v.advance(TICK_DT);
    }
    for (const v of this.vehicles) {
      if (v.isPlayerControlled) {
        const p = progress(v);
        const distance = distanceToIntersection(v);
        if (p >= SPAWN_DISTANCE + GONE_DISTANCE) {
          v.state = 'gone';
        } else if (v.authorized && p >= SPAWN_DISTANCE - INTERSECTION_HALF) {
          v.state = 'crossing';
        } else if (
          !v.authorized &&
          distance <= STOP_LINE_DISTANCE &&
          distance > INTERSECTION_HALF
        ) {
          v.state = 'queued';
          v.speed = 0;
          if (!this.queue.includes(v)) this.queue.push(v);
        } else {
          v.state = 'approach';
        }
        continue;
      }
      if (v.frozen || v.crashed) continue;
      if (
        v.state === 'approach' &&
        distanceToIntersection(v) <= STOP_LINE_DISTANCE
      ) {
        v.state = 'queued';
        v.speed = 0;
        if (!this.queue.includes(v)) this.queue.push(v);
      } else if (
        v.state === 'crossing' &&
        distanceToIntersection(v) > GONE_DISTANCE
      ) {
        v.state = 'success';
      } else if (
        v.state === 'success' &&
        distanceToIntersection(v) > EXIT_DISTANCE
      ) {
        v.state = 'gone';
      }
    }
    for (const v of this.vehicles) {
      if (v.isPlayerControlled || v.frozen || v.crashed) continue;
      if (v.state === 'queued') {
        v.waitedSeconds += TICK_DT;
      }
    }
  }

  private detectViolations(): void {
    for (const v of this.vehicles) {
      if (!v.isPlayerControlled) continue;
      if (shouldFlagViolation(v)) {
        if (!v.violationFlagged) {
          v.violationFlagged = true;
          if (this.dbSessionId) {
            void this.deps.metrics
              .recordViolation(this.dbSessionId, v.id)
              .catch((err: unknown) =>
                this.deps.logger.warn(
                  `[${this.sessionId}] failed to record violation: ${String(err)}`,
                ),
              );
          }
        }
      } else {
        v.violationFlagged = false;
      }
    }
  }

  private detectCollisions(): void {
    if (!this.collisionsEnabled) return;
    const active = this.vehicles.filter((v) => v.state !== 'gone');
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const a = active[i];
        const b = active[j];
        if (a.crashed || b.crashed) continue;
        if (a.crashCooldown > 0 || b.crashCooldown > 0) continue;
        if (vehiclesOverlap(a, b)) {
          this.crashVehicle(a);
          this.crashVehicle(b);
        }
      }
    }
  }

  private crashVehicle(v: Vehicle): void {
    v.crashed = true;
    v.crashTimer = CRASH_DURATION;
    v.speed = 0;
  }

  setCollisions(enabled: boolean): void {
    this.collisionsEnabled = enabled;
    if (!enabled) {
      for (const v of this.vehicles) {
        v.crashed = false;
        v.crashTimer = 0;
        v.crashCooldown = 0;
      }
    }
    this.deps.logger.log(
      `[${this.sessionId}] collisions ${enabled ? 'enabled' : 'disabled'}`,
    );
  }

  private findAhead(v: Vehicle): Vehicle | null {
    const myProgress = progress(v);
    const myLateral = this.lateralOf(v);
    let ahead: Vehicle | null = null;
    let minDiff = Infinity;
    for (const other of this.vehicles) {
      if (other === v) continue;
      if (other.from !== v.from || other.state === 'gone') continue;
      if (Math.abs(this.lateralOf(other) - myLateral) >= LANE_WIDTH) continue;
      const otherProgress = progress(other);
      if (otherProgress <= myProgress) continue;
      const diff = otherProgress - myProgress;
      if (diff < minDiff) {
        minDiff = diff;
        ahead = other;
      }
    }
    return ahead;
  }

  private lateralOf(v: Vehicle): number {
    return v.from === 'N' || v.from === 'S' ? v.x : v.z;
  }

  // Avanza un vehiculo girando a lo largo de su curva. Al terminar, adopta la
  // direccion de salida y sigue recto (el resto del pipeline no cambia).
  private advanceAlongPath(v: Vehicle, dt: number): void {
    const path = v.path;
    if (!path) return;
    v.pathT = Math.min(1, v.pathT + (v.speed * dt) / path.length);
    const point = sampleQuadratic(path, v.pathT);
    v.setPosition(point.x, point.z);
    if (v.pathT >= 1) {
      v.from = v.exitFrom;
      v.path = null;
      v.pathT = 0;
    }
  }

  private laneLateral(from: Vehicle['from'], lane: number): number {
    const off = laneOffset(from, lane);
    return from === 'N' || from === 'S' ? off.x : off.z;
  }

  private laneAheadCount(v: Vehicle, lane: number, lookahead: number): number {
    const lateral = this.laneLateral(v.from, lane);
    const myProgress = progress(v);
    let count = 0;
    for (const other of this.vehicles) {
      if (other === v || other.from !== v.from || other.state === 'gone') {
        continue;
      }
      if (Math.abs(this.lateralOf(other) - lateral) >= LANE_WIDTH) continue;
      const diff = progress(other) - myProgress;
      if (diff > 0 && diff <= lookahead) count += 1;
    }
    return count;
  }

  private isLaneClear(v: Vehicle, lane: number): boolean {
    return this.laneAheadCount(v, lane, OVERTAKE_CLEARANCE) === 0;
  }

  // Entre los dos carriles, elige el que tiene menos vehiculos por delante
  // (equilibra el uso de carriles y reduce esperas). Mantiene el actual si no mejora.
  private freerLane(v: Vehicle): number {
    const alternative = 1 - v.lane;
    if (!this.isLaneClear(v, alternative)) return v.lane;
    const currentCount = this.laneAheadCount(v, v.lane, LANE_BALANCE_LOOKAHEAD);
    const alternativeCount = this.laneAheadCount(
      v,
      alternative,
      LANE_BALANCE_LOOKAHEAD,
    );
    return alternativeCount < currentCount ? alternative : v.lane;
  }

  private async decideAndRelease(): Promise<void> {
    this.occupants = this.occupants.filter(
      (o) => !occupantHasCleared(progress(o)),
    );
    const eligible = this.queue.filter(
      (v) => !v.frozen && v.state !== 'crossing',
    );
    if (eligible.length === 0) return;

    const occupant = this.occupants[0] ?? null;
    const starving = eligible.reduce<Vehicle | null>(
      (worst, v) =>
        isStarving(v.waitedSeconds) &&
        (!worst || v.waitedSeconds > worst.waitedSeconds)
          ? v
          : worst,
      null,
    );
    const id = starving
      ? starving.id
      : await this.getEngine().decideNextCrossing(eligible, occupant);
    const primary = id ? eligible.find((v) => v.id === id) : undefined;
    if (primary && this.canGrant(primary)) this.grantCrossing(primary);

    for (const vehicle of [...this.queue]) {
      if (vehicle.frozen || vehicle.state === 'crossing') continue;
      if (!this.canGrant(vehicle)) continue;
      this.grantCrossing(vehicle);
    }
  }

  // Un cruce solo se concede si el carril de salida esta libre y no se
  // conflictua con el ocupante ni con el jugador dentro de la interseccion.
  private canGrant(vehicle: Vehicle): boolean {
    if (this.conflictsWithOccupants(vehicle)) return false;
    // Un vehiculo en riesgo de inanicion puede cruzar aunque el jugador bloquee
    // su eje: evita que un jugador detenido detenga una direccion indefinidamente.
    if (!isStarving(vehicle.waitedSeconds) && this.playerBlocks(vehicle)) {
      return false;
    }
    if (this.exitBlocked(vehicle)) return false;
    return true;
  }

  private playerBlocks(vehicle: Vehicle): boolean {
    const player = this.playerVehicle();
    if (!player || !withinIntersection(progress(player))) return false;
    return this.conflicts(vehicle, player);
  }

  private exitBlocked(vehicle: Vehicle): boolean {
    const ahead = this.findAhead(vehicle);
    if (!ahead) return false;
    return exitBlockedBy(progress(ahead), progress(vehicle), ahead.speed);
  }

  private grantCrossing(vehicle: Vehicle): void {
    vehicle.state = 'crossing';
    vehicle.authorized = true;
    vehicle.speed = CROSSING_SPEED;
    const lane = laneForTurn(vehicle.turn, vehicle.lane);
    vehicle.lane = lane;
    vehicle.exitFrom = exitDirection(vehicle.from, vehicle.turn);
    if (!vehicle.isPlayerControlled && vehicle.turn !== 'straight') {
      vehicle.path = buildTurnPath(
        vehicle.from,
        lane,
        vehicle.exitFrom,
        vehicle.x,
        vehicle.z,
        STOP_LINE_DISTANCE,
      );
      vehicle.pathT = 0;
    }
    this.occupants.push(vehicle);
    const index = this.queue.indexOf(vehicle);
    if (index !== -1) this.queue.splice(index, 1);
    this.deps.emitDecision({
      vehicleId: vehicle.id,
      from: vehicle.from,
      waitSeconds: Math.round(vehicle.waitedSeconds * 100) / 100,
      engine: this.currentEngineName(),
      at: Date.now(),
    });
  }

  private conflictsWithOccupants(v: Vehicle): boolean {
    return this.occupants.some((o) => this.conflicts(o, v));
  }

  private conflicts(a: Vehicle, b: Vehicle): boolean {
    return movementConflicts(a.from, a.turn, b.from, b.turn);
  }

  private playerVehicle(): Vehicle | null {
    return this.vehicles.find((v) => v.isPlayerControlled) ?? null;
  }

  private currentEngineName(): DecisionEngineName {
    switch (this.mode) {
      case 'traditional':
        return 'right-priority';
      case 'managed-ai':
        return 'ai';
      default:
        return 'fifo';
    }
  }

  private cleanupFinished(): void {
    const remaining: Vehicle[] = [];
    for (const v of this.vehicles) {
      if (v.state === 'gone') {
        this.playerLastSeen.delete(v.id);
        if (!v.isPlayerControlled && this.dbSessionId) {
          void this.deps.metrics
            .recordCrossing(this.dbSessionId, v)
            .catch((err: unknown) =>
              this.deps.logger.warn(
                `[${this.sessionId}] failed to record crossing: ${String(err)}`,
              ),
            );
        }
      } else {
        remaining.push(v);
      }
    }
    this.vehicles.length = 0;
    this.vehicles.push(...remaining);
  }

  private toSnapshot(): RemoteVehicleDto[] {
    return this.vehicles.map((v) => ({
      id: v.id,
      x: Math.round(v.x * 1000) / 1000,
      z: Math.round(v.z * 1000) / 1000,
      from: v.from,
      state: v.state,
      frozen: v.frozen,
      crashed: v.crashed,
    }));
  }

  setFrozen(id: string, frozen: boolean): void {
    const vehicle = this.vehicles.find((v) => v.id === id);
    if (!vehicle || vehicle.isPlayerControlled) return;
    vehicle.frozen = frozen;
    if (frozen) vehicle.speed = 0;
    this.deps.logger.log(
      `[${this.sessionId}] vehicle ${id} ${frozen ? 'frozen' : 'resumed'}`,
    );
  }

  reset(): void {
    this.vehicles.length = 0;
    this.queue.length = 0;
    this.occupants = [];
    this.spawnCountdown = 1.5;
    this.nextId = 0;
    this.playerLastSeen.clear();
    this.deps.logger.log(`[${this.sessionId}] reset`);
    void this.restartDbSession();
  }

  upsertPlayerVehicle(state: PlayerStateDto): void {
    const existing = this.vehicles.find((v) => v.id === state.id);
    if (existing) {
      existing.from = state.from;
      existing.setPosition(state.x, state.z);
      existing.lane = laneFromPosition(state.from, state.x, state.z);
      existing.speed = Math.min(Math.max(state.speed, 0), PLAYER_MAX_SPEED);
      existing.isPlayerControlled = true;
      existing.frozen = false;
      existing.crashed = false;
      this.playerLastSeen.set(state.id, Date.now());
      return;
    }
    const players = this.vehicles.filter((v) => v.isPlayerControlled).length;
    if (players >= MAX_PLAYERS || this.vehicles.length >= MAX_VEHICLES) return;
    const vehicle = new Vehicle(
      state.id,
      state.from,
      state.x,
      state.z,
      laneFromPosition(state.from, state.x, state.z),
    );
    vehicle.isPlayerControlled = true;
    vehicle.speed = Math.min(Math.max(state.speed, 0), PLAYER_MAX_SPEED);
    this.vehicles.push(vehicle);
    this.playerLastSeen.set(state.id, Date.now());
  }
}
