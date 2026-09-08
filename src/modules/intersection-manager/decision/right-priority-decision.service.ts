import { Injectable } from '@nestjs/common';
import { Vehicle } from '../domain/vehicle.model';
import { DecisionEngine } from './decision.interface';

type Direction = 'N' | 'S' | 'E' | 'W';

const RIGHT_OF: Record<Direction, Direction> = {
  N: 'E',
  S: 'W',
  E: 'S',
  W: 'N',
};

function fromDirectionConflicts(a: Direction, b: Direction): boolean {
  return a !== b;
}

@Injectable()
export class RightPriorityDecisionService implements DecisionEngine {
  decideNextCrossing(
    queue: Vehicle[],
    occupant: Vehicle | null,
  ): Promise<string | null> {
    if (occupant || queue.length === 0) return Promise.resolve(null);
    const winner = queue.find((v) =>
      queue.every((o) => {
        if (!fromDirectionConflicts(v.from, o.from)) return true;
        return RIGHT_OF[o.from] === v.from;
      }),
    );
    if (winner) return Promise.resolve(winner.id);
    const sorted = [...queue].sort((a, b) => {
      if (a.waitedSeconds !== b.waitedSeconds) {
        return a.waitedSeconds - b.waitedSeconds;
      }
      return a.id.localeCompare(b.id);
    });
    return Promise.resolve(sorted[0].id);
  }
}
