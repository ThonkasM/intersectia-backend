import { DeterministicDecisionService } from './deterministic-decision.service';
import { Vehicle } from '../domain/vehicle.model';

describe('DeterministicDecisionService', () => {
  let service: DeterministicDecisionService;

  beforeEach(() => {
    service = new DeterministicDecisionService();
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

  it('releases the first vehicle in FIFO order', async () => {
    const queue = [
      new Vehicle('v-1', 'N', 2.25, 8),
      new Vehicle('v-2', 'E', -8, -2.25),
      new Vehicle('v-3', 'W', 8, 2.25),
    ];
    await expect(service.decideNextCrossing(queue, null)).resolves.toBe('v-1');
  });
});
