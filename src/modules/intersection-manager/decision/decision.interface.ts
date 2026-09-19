import type { Direction, Vehicle } from '../domain/vehicle.model';

export type SimMode = 'traditional' | 'managed' | 'managed-ai';
export type DecisionEngineName = 'fifo' | 'right-priority' | 'ai';

export interface DecisionEvent {
  vehicleId: string;
  from: Direction;
  waitSeconds: number;
  engine: DecisionEngineName;
  at: number;
}

export interface DecisionEngine {
  decideNextCrossing(
    queue: Vehicle[],
    occupant: Vehicle | null,
  ): Promise<string | null>;
}
