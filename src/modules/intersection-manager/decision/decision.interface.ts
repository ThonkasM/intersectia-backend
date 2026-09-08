import { Vehicle } from '../domain/vehicle.model';

export type SimMode = 'traditional' | 'managed' | 'managed-ai';

export interface DecisionEngine {
  decideNextCrossing(
    queue: Vehicle[],
    occupant: Vehicle | null,
  ): Promise<string | null>;
}
