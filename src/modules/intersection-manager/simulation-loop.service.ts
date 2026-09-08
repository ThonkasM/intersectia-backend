import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  LANE_WIDTH,
  Vehicle,
  laneFromPosition,
  laneOffset,
} from './domain/vehicle.model';
import {
  APPROACH_SPEED,
  CROSSING_SPEED,
  GONE_DISTANCE,
  INTERSECTION_HALF,
  MIN_FOLLOW_DISTANCE,
  SPAWN_DISTANCE,
  STOP_LINE_DISTANCE,
  computeSeparationSpeed,
  distanceToIntersection,
  progress,
} from './domain/intersection-state';
import {
  PLAYER_MAX_SPEED,
  isPlayerTimedOut,
} from './domain/player-vehicle.rules';
import { DecisionEngine, SimMode } from './decision/decision.interface';
import { DeterministicDecisionService } from './decision/deterministic-decision.service';
import { RightPriorityDecisionService } from './decision/right-priority-decision.service';
import { AiDecisionClient } from './decision/ai-decision.client';
import { SimulationMetricsService } from '../simulation-metrics/simulation-metrics.service';
import { IntersectionManagerGateway } from './intersection-manager.gateway';
import { RemoteVehicleDto } from './dto/remote-vehicle.dto';
import { PlayerStateDto } from './dto/player-state.dto';

const TICK_DT = 0.05;
const MAX_VEHICLES = 14;
const LANE_CHANGE_COOLDOWN = 1.5;
const OVERTAKE_CLEARANCE = 14;
const DIRECTIONS: Array<Vehicle['from']> = ['N', 'S', 'E', 'W'];

@Injectable()
export class SimulationLoopService implements OnModuleInit, OnModuleDestroy {
  private readonly vehicles: Vehicle[] = [];
  private readonly queue: Vehicle[] = [];
  private occupants: Vehicle[] = [];
  private mode: SimMode = 'managed';
  private spawnCountdown = 1.5;
  private nextId = 0;
  private interval?: ReturnType<typeof setInterval>;
  private readonly playerLastSeen = new Map<string, number>();

  constructor(
    @Inject(forwardRef(() => IntersectionManagerGateway))
    private readonly gateway: IntersectionManagerGateway,
    private readonly deterministicDecision: DeterministicDecisionService,
    private readonly rightPriorityDecision: RightPriorityDecisionService,
    private readonly aiDecisionClient: AiDecisionClient,
    private readonly metrics: SimulationMetricsService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startSession();
    this.interval = setInterval(() => void this.tick(), 50);
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private getEngine(): DecisionEngine {
    switch (this.mode) {
      case 'managed-ai':
        return this.aiDecisionClient;
      case 'traditional':
        return this.rightPriorityDecision;
      default:
        return this.deterministicDecision;
    }
  }

  setMode(mode: SimMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.logger.log(`Simulation mode set to ${mode}`);
    this.queue.length = 0;
    void this.startSession();
  }

  private async startSession(): Promise<void> {
    try {
      await this.metrics.startSession(this.mode);
    } catch (err) {
      this.logger.warn(`Failed to start simulation session: ${String(err)}`);
    }
  }

  private async tick(): Promise<void> {
    this.handlePlayerVehicles();
    this.maybeSpawn();
    this.moveVehicles();
    await this.decideAndRelease();
    this.cleanupFinished();
    this.gateway.broadcast(this.toSnapshot());
  }

  private handlePlayerVehicles(): void {
    const now = Date.now();
    for (const v of this.vehicles) {
      if (!v.isPlayerControlled) continue;
      if (isPlayerTimedOut(this.playerLastSeen.get(v.id) ?? 0, now)) {
        this.logger.warn(
          `Player vehicle ${v.id} handed over to autonomous mode`,
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
      const from = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const lane = Math.random() < 0.5 ? 0 : 1;
      const { dx, dz } = Vehicle.DIRECTION[from];
      const off = laneOffset(from, lane);
      const vehicle = new Vehicle(
        `v-${this.nextId++}`,
        from,
        off.x - dx * SPAWN_DISTANCE,
        off.z - dz * SPAWN_DISTANCE,
        lane,
      );
      this.vehicles.push(vehicle);
    }
    this.spawnCountdown = 1 + Math.random() * 1.5;
  }

  private moveVehicles(): void {
    for (const v of this.vehicles) {
      if (v.isPlayerControlled || v.state === 'queued' || v.state === 'gone') {
        continue;
      }
      if (v.speed <= 0) {
        v.speed = v.state === 'crossing' ? CROSSING_SPEED : APPROACH_SPEED;
      }
    }
    for (const v of this.vehicles) {
      if (v.isPlayerControlled || v.state === 'queued' || v.state === 'gone') {
        continue;
      }
      const ahead = this.findAhead(v);
      if (ahead) {
        v.speed = computeSeparationSpeed(v, ahead);
        const gap = progress(ahead) - progress(v);
        if (
          gap < MIN_FOLLOW_DISTANCE &&
          v.laneChangeCooldown <= 0 &&
          this.canOvertake(v)
        ) {
          v.lane = 1 - v.lane;
          v.laneChangeCooldown = LANE_CHANGE_COOLDOWN;
        }
      }
      v.laneChangeCooldown = Math.max(0, v.laneChangeCooldown - TICK_DT);
      v.steerToLane(TICK_DT);
      v.advance(TICK_DT);
    }
    for (const v of this.vehicles) {
      if (v.isPlayerControlled) {
        const p = progress(v);
        if (p >= SPAWN_DISTANCE + GONE_DISTANCE) {
          v.state = 'gone';
        } else if (p >= SPAWN_DISTANCE - INTERSECTION_HALF) {
          v.state = 'crossing';
        } else {
          v.state = 'approach';
        }
        continue;
      }
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
        v.state = 'gone';
      }
    }
    for (const v of this.vehicles) {
      if (v.isPlayerControlled) continue;
      if (v.state === 'queued' || v.state === 'crossing') {
        v.waitedSeconds += TICK_DT;
      }
    }
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

  private canOvertake(v: Vehicle): boolean {
    const targetLane = 1 - v.lane;
    const off = laneOffset(v.from, targetLane);
    const targetLateral = v.from === 'N' || v.from === 'S' ? off.x : off.z;
    const myProgress = progress(v);
    for (const other of this.vehicles) {
      if (other === v) continue;
      if (other.from !== v.from || other.state === 'gone') continue;
      if (Math.abs(this.lateralOf(other) - targetLateral) >= LANE_WIDTH)
        continue;
      const otherProgress = progress(other);
      const diff = Math.abs(otherProgress - myProgress);
      if (diff < OVERTAKE_CLEARANCE) {
        return false;
      }
    }
    return true;
  }

  private async decideAndRelease(): Promise<void> {
    this.occupants = this.occupants.filter((o) => o.state !== 'gone');
    if (this.playerInsideIntersection()) return;
    if (this.queue.length === 0) return;

    const id = await this.getEngine().decideNextCrossing(this.queue, null);
    const primary = id ? this.queue.find((v) => v.id === id) : undefined;
    if (primary && !this.conflictsWithOccupants(primary)) {
      this.grantCrossing(primary);
    }

    for (const vehicle of [...this.queue]) {
      if (vehicle.state === 'crossing') continue;
      if (this.conflictsWithOccupants(vehicle)) continue;
      this.grantCrossing(vehicle);
    }
  }

  private grantCrossing(vehicle: Vehicle): void {
    vehicle.state = 'crossing';
    vehicle.speed = CROSSING_SPEED;
    this.occupants.push(vehicle);
    const index = this.queue.indexOf(vehicle);
    if (index !== -1) this.queue.splice(index, 1);
    this.gateway.emitDecision({
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
    if (a.from === b.from) return false;
    const opposite: Record<Vehicle['from'], Vehicle['from']> = {
      N: 'S',
      S: 'N',
      E: 'W',
      W: 'E',
    };
    return opposite[a.from] !== b.from;
  }

  private playerInsideIntersection(): boolean {
    return this.vehicles.some(
      (v) => v.isPlayerControlled && v.state === 'crossing',
    );
  }

  private currentEngineName(): 'fifo' | 'right-priority' | 'ai' {
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
        if (!v.isPlayerControlled) {
          void this.metrics.recordCrossing(v).catch((err) => {
            this.logger.warn(`Failed to record crossing: ${String(err)}`);
          });
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
    }));
  }

  upsertPlayerVehicle(state: PlayerStateDto): void {
    const existing = this.vehicles.find((v) => v.id === state.id);
    if (existing) {
      existing.setPosition(state.x, state.z);
      existing.lane = laneFromPosition(state.from, state.x, state.z);
      existing.speed = Math.min(Math.max(state.speed, 0), PLAYER_MAX_SPEED);
      this.playerLastSeen.set(state.id, Date.now());
      return;
    }
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
