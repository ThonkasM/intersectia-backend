import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { Vehicle } from '../domain/vehicle.model';
import { DecisionEngine } from './decision.interface';
import { DeterministicDecisionService } from './deterministic-decision.service';

@Injectable()
export class AiDecisionClient implements DecisionEngine {
  private readonly logger = new Logger(AiDecisionClient.name);
  private readonly serviceUrl: string;
  private readonly internalToken: string;

  constructor(
    private readonly http: HttpService,
    private readonly fallback: DeterministicDecisionService,
    config: ConfigService,
  ) {
    this.serviceUrl = config.get<string>(
      'AI_SERVICE_URL',
      'http://localhost:8000',
    );
    this.internalToken = config.get<string>(
      'INTERNAL_SERVICE_TOKEN',
      'dev-internal-token',
    );
  }

  async decideNextCrossing(
    queue: Vehicle[],
    occupant: Vehicle | null,
  ): Promise<string | null> {
    if (queue.length === 0) return null;
    const occupantPayload = occupant
      ? {
          id: occupant.id,
          from: occupant.from,
          waitedSeconds: occupant.waitedSeconds,
        }
      : null;
    try {
      const response = await firstValueFrom(
        this.http
          .post(
            `${this.serviceUrl}/decision`,
            {
              queue: queue.map((v) => ({
                id: v.id,
                from: v.from,
                waitedSeconds: v.waitedSeconds,
              })),
              occupant: occupantPayload,
            },
            { headers: { 'X-Internal-Token': this.internalToken } },
          )
          .pipe(timeout(150)),
      );
      const vehicleId = (response.data as { vehicleId?: unknown }).vehicleId;
      if (typeof vehicleId === 'string' && vehicleId.length > 0) {
        return vehicleId;
      }
      this.logger.warn(
        `AI decision returned an invalid vehicleId: ${String(vehicleId)}`,
      );
    } catch (err) {
      this.logger.warn(
        `AI decision failed, falling back to deterministic engine: ${String(err)}`,
      );
    }
    return this.fallback.decideNextCrossing(queue, occupant);
  }
}
