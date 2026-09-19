import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { SimulationMetricsService } from './simulation-metrics.service';
import type { SimMode } from '../intersection-manager/decision/decision.interface';

const MODES: SimMode[] = ['traditional', 'managed', 'managed-ai'];

@Controller('metrics')
export class SimulationMetricsController {
  constructor(private readonly metrics: SimulationMetricsService) {}

  @Get('avg')
  getAvg(@Query('mode') mode: SimMode): Promise<{
    avgWaitSeconds: number | null;
    total: number;
  }> {
    if (!MODES.includes(mode)) {
      throw new BadRequestException(`Invalid mode: ${String(mode)}`);
    }
    return this.metrics.getAverageWaitByMode(mode);
  }

  @Get('node')
  getNode(
    @Query('window') window?: string,
  ): ReturnType<SimulationMetricsService['getNodeMetrics']> {
    const parsed = window === undefined ? 60 : Number(window);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`Invalid window: ${String(window)}`);
    }
    return this.metrics.getNodeMetrics(Math.min(Math.floor(parsed), 3600));
  }

  @Get('summary')
  getSummary(): Promise<{
    totalCrossings: number;
    totalViolations: number;
    avgWaitByMode: Record<string, number | null>;
  }> {
    return this.metrics.getSummary();
  }
}
