import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Vehicle } from '../intersection-manager/domain/vehicle.model';
import { SimMode } from '../intersection-manager/decision/decision.interface';

@Injectable()
export class SimulationMetricsService {
  private readonly logger = new Logger(SimulationMetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async startSession(mode: SimMode): Promise<string> {
    const session = await this.prisma.simulationSession.create({
      data: { mode },
    });
    return session.id;
  }

  async endSession(sessionId: string): Promise<void> {
    await this.prisma.simulationSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });
  }

  async recordCrossing(sessionId: string, v: Vehicle): Promise<void> {
    await this.prisma.vehicleCrossing.create({
      data: {
        sessionId,
        direction: v.from,
        waitSeconds: v.waitedSeconds,
      },
    });
  }

  async recordViolation(sessionId: string, vehicleId: string): Promise<void> {
    await this.prisma.intersectionViolation.create({
      data: { sessionId, vehicleId },
    });
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
