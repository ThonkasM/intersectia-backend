import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Vehicle } from '../intersection-manager/domain/vehicle.model';
import { SimMode } from '../intersection-manager/decision/decision.interface';

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

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

  async getNodeMetrics(windowSeconds = 60): Promise<{
    windowSeconds: number;
    totalCrossings: number;
    throughputPerMinute: number;
    avgWaitSeconds: number | null;
    p95WaitSeconds: number | null;
    byDirection: Record<string, { total: number; avgWaitSeconds: number | null }>;
    fairnessGapSeconds: number | null;
  }> {
    const since = new Date(Date.now() - windowSeconds * 1000);
    const rows = await this.prisma.vehicleCrossing.findMany({
      where: { crossedAt: { gte: since } },
      select: { direction: true, waitSeconds: true },
      orderBy: { waitSeconds: 'asc' },
      take: 5000,
    });
    const total = rows.length;
    const waits = rows.map((row) => row.waitSeconds);
    const avg = total
      ? waits.reduce((sum, value) => sum + value, 0) / total
      : null;
    const p95 = total
      ? waits[Math.min(total - 1, Math.ceil(0.95 * total) - 1)]
      : null;
    const byDirection: Record<
      string,
      { total: number; avgWaitSeconds: number | null }
    > = {};
    const averages: number[] = [];
    for (const direction of ['N', 'S', 'E', 'W']) {
      const dirWaits = rows
        .filter((row) => row.direction === direction)
        .map((row) => row.waitSeconds);
      const dirAvg = dirWaits.length
        ? dirWaits.reduce((sum, value) => sum + value, 0) / dirWaits.length
        : null;
      byDirection[direction] = {
        total: dirWaits.length,
        avgWaitSeconds: dirAvg === null ? null : round3(dirAvg),
      };
      if (dirAvg !== null) averages.push(dirAvg);
    }
    const fairnessGap = averages.length
      ? Math.max(...averages) - Math.min(...averages)
      : null;
    return {
      windowSeconds,
      totalCrossings: total,
      throughputPerMinute: round3(total / (windowSeconds / 60)),
      avgWaitSeconds: avg === null ? null : round3(avg),
      p95WaitSeconds: p95 === null ? null : round3(p95),
      byDirection,
      fairnessGapSeconds: fairnessGap === null ? null : round3(fairnessGap),
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
