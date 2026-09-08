import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Vehicle } from '../intersection-manager/domain/vehicle.model';
import { SimMode } from '../intersection-manager/decision/decision.interface';

@Injectable()
export class SimulationMetricsService {
  private readonly logger = new Logger(SimulationMetricsService.name);
  private currentSessionId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async startSession(mode: SimMode): Promise<string> {
    const session = await this.prisma.simulationSession.create({
      data: { mode },
    });
    this.currentSessionId = session.id;
    return session.id;
  }

  async recordCrossing(v: Vehicle): Promise<void> {
    if (!this.currentSessionId) return;
    try {
      await this.prisma.vehicleCrossing.create({
        data: {
          sessionId: this.currentSessionId,
          direction: v.from,
          waitSeconds: v.waitedSeconds,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to record crossing: ${String(err)}`);
    }
  }

  async recordViolation(vehicleId: string): Promise<void> {
    if (!this.currentSessionId) return;
    try {
      await this.prisma.intersectionViolation.create({
        data: { sessionId: this.currentSessionId, vehicleId },
      });
    } catch (err) {
      this.logger.warn(`Failed to record violation: ${String(err)}`);
    }
  }

  async getAverageWaitByMode(
    mode: SimMode,
  ): Promise<{ avgWaitSeconds: number | null; total: number }> {
    const agg = await this.prisma.vehicleCrossing.aggregate({
      where: { session: { mode } },
      _avg: { waitSeconds: true },
      _count: true,
    });
    return {
      avgWaitSeconds: agg._avg.waitSeconds,
      total: agg._count,
    };
  }

  async getSummary(): Promise<{
    totalCrossings: number;
    totalViolations: number;
    avgWaitByMode: Record<string, number | null>;
  }> {
    const modes: SimMode[] = ['traditional', 'managed', 'managed-ai'];
    const [totalCrossings, totalViolations, perMode] = await Promise.all([
      this.prisma.vehicleCrossing.count(),
      this.prisma.intersectionViolation.count(),
      Promise.all(
        modes.map(async (mode) => {
          const agg = await this.prisma.vehicleCrossing.aggregate({
            where: { session: { mode } },
            _avg: { waitSeconds: true },
          });
          return [mode, agg._avg.waitSeconds] as const;
        }),
      ),
    ]);
    const avgWaitByMode: Record<string, number | null> = {};
    for (const [mode, avg] of perMode) avgWaitByMode[mode] = avg;
    return { totalCrossings, totalViolations, avgWaitByMode };
  }
}
