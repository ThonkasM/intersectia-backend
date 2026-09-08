import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SimulationMetricsController } from './simulation-metrics.controller';
import { SimulationMetricsService } from './simulation-metrics.service';

@Module({
  imports: [PrismaModule],
  controllers: [SimulationMetricsController],
  providers: [SimulationMetricsService],
  exports: [SimulationMetricsService],
})
export class SimulationMetricsModule {}
