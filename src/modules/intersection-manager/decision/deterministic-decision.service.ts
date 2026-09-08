import { Injectable } from '@nestjs/common';
import { Vehicle } from '../domain/vehicle.model';
import { DecisionEngine } from './decision.interface';

@Injectable()
export class DeterministicDecisionService implements DecisionEngine {
  decideNextCrossing(
    queue: Vehicle[],
    occupant: Vehicle | null,
  ): Promise<string | null> {
    if (occupant || queue.length === 0) return Promise.resolve(null);
    return Promise.resolve(queue[0].id);
  }
}
