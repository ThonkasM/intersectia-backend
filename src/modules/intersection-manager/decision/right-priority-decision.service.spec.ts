import { RightPriorityDecisionService } from './right-priority-decision.service';
import { Vehicle } from '../domain/vehicle.model';

describe('RightPriorityDecisionService', () => {
  let service: RightPriorityDecisionService;

  beforeEach(() => {
    service = new RightPriorityDecisionService();
  });

  it('returns null when the queue is empty', async () => {
    await expect(service.decideNextCrossing([], null)).resolves.toBeNull();
  });

  it('returns null while an occupant is crossing', async () => {
    const queue = [new Vehicle('v-1', 'N', 2.25, 8)];
    const occupant = new Vehicle('v-2', 'S', -2.25, -8);
    await expect(
      service.decideNextCrossing(queue, occupant),
    ).resolves.toBeNull();
  });

  it('gives priority to E over N (E is to the right of N)', async () => {
    const queue = [
      new Vehicle('v-n', 'N', 2.25, 8),
      new Vehicle('v-e', 'E', -8, -2.25),
    ];
    await expect(service.decideNextCrossing(queue, null)).resolves.toBe('v-e');
  });

  it('gives priority to W over S (W is to the right of S)', async () => {
    const queue = [
      new Vehicle('v-s', 'S', -2.25, -8),
      new Vehicle('v-w', 'W', 8, 2.25),
    ];
    await expect(service.decideNextCrossing(queue, null)).resolves.toBe('v-w');
  });

  it('gives priority to N over W (N is to the right of W)', async () => {
    const queue = [
      new Vehicle('v-w', 'W', 8, 2.25),
      new Vehicle('v-n', 'N', 2.25, 8),
    ];
    await expect(service.decideNextCrossing(queue, null)).resolves.toBe('v-n');
  });

  it('falls back to the lowest waitedSeconds on a tie', async () => {
    const waitedLonger = new Vehicle('v-slow', 'N', 2.25, 8);
    waitedLonger.waitedSeconds = 2.5;
    const waitedLess = new Vehicle('v-fast', 'S', -2.25, -8);
    waitedLess.waitedSeconds = 0.5;
    const queue = [waitedLonger, waitedLess];
    await expect(service.decideNextCrossing(queue, null)).resolves.toBe(
      'v-fast',
    );
  });

  it('breaks a remaining tie by lowest id', async () => {
    const a = new Vehicle('a-1', 'N', 2.25, 8);
    a.waitedSeconds = 1;
    const b = new Vehicle('b-1', 'S', -2.25, -8);
    b.waitedSeconds = 1;
    await expect(service.decideNextCrossing([a, b], null)).resolves.toBe('a-1');
  });
});
