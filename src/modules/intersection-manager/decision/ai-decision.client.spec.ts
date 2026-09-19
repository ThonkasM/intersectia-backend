import { of, throwError } from 'rxjs';
import { AiDecisionClient } from './ai-decision.client';
import { DeterministicDecisionService } from './deterministic-decision.service';
import { Vehicle } from '../domain/vehicle.model';

describe('AiDecisionClient', () => {
  let http: { post: jest.Mock };
  let client: AiDecisionClient;
  const queue = [
    new Vehicle('v-0', 'N', 3.375, 12),
    new Vehicle('v-1', 'S', -3.375, -12),
  ];

  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      const values: Record<string, string> = {
        AI_SERVICE_URL: 'http://ai:8000',
        INTERNAL_SERVICE_TOKEN: 'secret-token',
      };
      return values[key] ?? fallback;
    }),
  };

  beforeEach(() => {
    http = { post: jest.fn() };
    client = new AiDecisionClient(
      http as never,
      new DeterministicDecisionService(),
      config as never,
    );
  });

  it('uses the AI vehicleId when the response is valid', async () => {
    http.post.mockReturnValue(of({ data: { vehicleId: 'v-1' } }));
    await expect(client.decideNextCrossing(queue, null)).resolves.toBe('v-1');
  });

  it('falls back to the deterministic engine when the AI call errors', async () => {
    http.post.mockReturnValue(throwError(() => new Error('network down')));
    await expect(client.decideNextCrossing(queue, null)).resolves.toBe('v-0');
  });

  it('falls back when the AI returns an invalid vehicleId', async () => {
    http.post.mockReturnValue(of({ data: { vehicleId: 42 } }));
    await expect(client.decideNextCrossing(queue, null)).resolves.toBe('v-0');
  });

  it('returns null without calling the AI when the queue is empty', async () => {
    await expect(client.decideNextCrossing([], null)).resolves.toBeNull();
    expect(http.post).not.toHaveBeenCalled();
  });
});
