import { Module, Logger } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { IntersectionManagerGateway } from './intersection-manager.gateway';
import { SimulationLoopService } from './simulation-loop.service';
import { DeterministicDecisionService } from './decision/deterministic-decision.service';
import { RightPriorityDecisionService } from './decision/right-priority-decision.service';
import { AiDecisionClient } from './decision/ai-decision.client';
import { SimulationMetricsModule } from '../simulation-metrics/simulation-metrics.module';

@Module({
  imports: [HttpModule, SimulationMetricsModule],
  providers: [
    SimulationLoopService,
    DeterministicDecisionService,
    RightPriorityDecisionService,
    AiDecisionClient,
    IntersectionManagerGateway,
    Logger,
  ],
  exports: [
    SimulationLoopService,
    DeterministicDecisionService,
    RightPriorityDecisionService,
    AiDecisionClient,
  ],
})
export class IntersectionManagerModule {}
