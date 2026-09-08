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

  @Get('summary')
  getSummary(): Promise<{
    totalCrossings: number;
    totalViolations: number;
    avgWaitByMode: Record<string, number | null>;
  }> {
    return this.metrics.getSummary();
  }
}
