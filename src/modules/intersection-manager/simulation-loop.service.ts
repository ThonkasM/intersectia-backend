import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SessionSimulation } from './domain/session-simulation';
import { DeterministicDecisionService } from './decision/deterministic-decision.service';
import { RightPriorityDecisionService } from './decision/right-priority-decision.service';
import { AiDecisionClient } from './decision/ai-decision.client';
import { SimulationMetricsService } from '../simulation-metrics/simulation-metrics.service';
import { IntersectionManagerGateway } from './intersection-manager.gateway';
import { SimMode } from './decision/decision.interface';
import { PlayerStateDto } from './dto/player-state.dto';

const TICK_MS = 50;
const SESSION_IDLE_MS = 60_000;

@Injectable()
export class SimulationLoopService implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, SessionSimulation>();
  private readonly clientCounts = new Map<string, number>();
  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private interval?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(forwardRef(() => IntersectionManagerGateway))
    private readonly gateway: IntersectionManagerGateway,
    private readonly deterministicDecision: DeterministicDecisionService,
    private readonly rightPriorityDecision: RightPriorityDecisionService,
    private readonly aiDecisionClient: AiDecisionClient,
    private readonly metrics: SimulationMetricsService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.interval = setInterval(() => this.tickAll(), TICK_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    await Promise.all([...this.sessions.values()].map((s) => s.dispose()));
    this.sessions.clear();
  }

  addClient(sessionId: string): void {
    const timer = this.idleTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(sessionId);
    }
    this.clientCounts.set(
      sessionId,
      (this.clientCounts.get(sessionId) ?? 0) + 1,
    );
    this.ensureSession(sessionId);
  }

  removeClient(sessionId: string): void {
    const count = (this.clientCounts.get(sessionId) ?? 1) - 1;
    if (count > 0) {
      this.clientCounts.set(sessionId, count);
      return;
    }
    this.clientCounts.delete(sessionId);
    const timer = setTimeout(() => {
      this.idleTimers.delete(sessionId);
      void this.destroySession(sessionId);
    }, SESSION_IDLE_MS);
    this.idleTimers.set(sessionId, timer);
  }

  private ensureSession(sessionId: string): SessionSimulation {
    const current = this.sessions.get(sessionId);
    if (current) return current;
    const session = new SessionSimulation({
      sessionId,
      metrics: this.metrics,
      deterministicDecision: this.deterministicDecision,
      rightPriorityDecision: this.rightPriorityDecision,
      aiDecisionClient: this.aiDecisionClient,
      emitState: (vehicles) => this.gateway.broadcast(sessionId, vehicles),
      emitDecision: (event) => this.gateway.emitDecision(sessionId, event),
      logger: this.logger,
    });
    this.sessions.set(sessionId, session);
    void session.init();
    this.logger.log(
      `[${sessionId}] session created (active=${this.sessions.size})`,
    );
    return session;
  }

  private async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    await session.dispose();
    this.logger.log(
      `[${sessionId}] session disposed (active=${this.sessions.size})`,
    );
  }

  private tickAll(): void {
    for (const session of this.sessions.values()) {
      void session.tick();
    }
  }

  setMode(sessionId: string, mode: SimMode): void {
    this.ensureSession(sessionId).setMode(mode);
  }

  upsertPlayerVehicle(sessionId: string, dto: PlayerStateDto): void {
    this.ensureSession(sessionId).upsertPlayerVehicle(dto);
  }

  setFrozen(sessionId: string, id: string, frozen: boolean): void {
    this.ensureSession(sessionId).setFrozen(id, frozen);
  }

  reset(sessionId: string): void {
    this.ensureSession(sessionId).reset();
  }

  setCollisions(sessionId: string, enabled: boolean): void {
    this.ensureSession(sessionId).setCollisions(enabled);
  }

  setTurns(sessionId: string, enabled: boolean): void {
    this.ensureSession(sessionId).setTurns(enabled);
  }

  get activeSessions(): number {
    return this.sessions.size;
  }
}
