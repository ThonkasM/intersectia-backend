import { Logger } from '@nestjs/common';
import { SessionSimulation } from './session-simulation';
import { Vehicle } from './vehicle.model';
import { DeterministicDecisionService } from '../decision/deterministic-decision.service';
import { RightPriorityDecisionService } from '../decision/right-priority-decision.service';
import type { RemoteVehicleDto } from '../dto/remote-vehicle.dto';

describe('SessionSimulation AI decision cache', () => {
  function makeSimulation(decide: jest.Mock): SessionSimulation {
    const metrics = {
      startSession: jest.fn().mockResolvedValue('db'),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    return new SessionSimulation({
      sessionId: 'test',
      metrics: metrics as never,
      deterministicDecision: new DeterministicDecisionService(),
      rightPriorityDecision: new RightPriorityDecisionService(),
      aiDecisionClient: { decideNextCrossing: decide } as never,
      emitState: () => undefined,
      emitDecision: () => undefined,
      logger: new Logger('test'),
      random: () => 0.5,
    });
  }

  it('reuses the AI decision while the queue signature is unchanged', async () => {
    const decide = jest.fn().mockResolvedValue('a');
    const simulation = makeSimulation(decide);
    const queue = [new Vehicle('a', 'N', 3.375, 12)];
    const secret = simulation as unknown as {
      decideWithCache: (q: Vehicle[], o: null) => Promise<string | null>;
    };

    await expect(secret.decideWithCache(queue, null)).resolves.toBe('a');
    await expect(secret.decideWithCache(queue, null)).resolves.toBe('a');
    expect(decide).toHaveBeenCalledTimes(1);

    queue[0].waitedSeconds = 5.4;
    await expect(secret.decideWithCache(queue, null)).resolves.toBe('a');
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it('clears the turn signal when the turn path completes', () => {
    const simulation = makeSimulation(jest.fn());
    const vehicle = new Vehicle('a', 'N', 3.375, 10);
    vehicle.turn = 'right';
    vehicle.exitFrom = 'W';
    vehicle.path = {
      sx: 3.375,
      sz: 10,
      cx: 3.375,
      cz: -3.375,
      ex: -10,
      ez: -3.375,
      length: 20,
    };
    vehicle.pathT = 0.999;

    const secret = simulation as unknown as {
      advanceAlongPath: (v: Vehicle, dt: number) => void;
    };
    secret.advanceAlongPath(vehicle, 0.05);

    expect(vehicle.from).toBe('W');
    expect(vehicle.path).toBeNull();
    expect(vehicle.turn).toBe('straight');
  });
});

describe('SessionSimulation ambulance spawning', () => {
  function makeSimulation(random: () => number): {
    simulation: SessionSimulation;
    last: () => RemoteVehicleDto[];
  } {
    let snapshot: RemoteVehicleDto[] = [];
    const metrics = {
      startSession: jest.fn().mockResolvedValue('db'),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const simulation = new SessionSimulation({
      sessionId: 'ambulance',
      metrics: metrics as never,
      deterministicDecision: new DeterministicDecisionService(),
      rightPriorityDecision: new RightPriorityDecisionService(),
      aiDecisionClient: { decideNextCrossing: jest.fn() } as never,
      emitState: (vehicles) => {
        snapshot = vehicles;
      },
      emitDecision: () => undefined,
      logger: new Logger('ambulance'),
      random,
    });
    return { simulation, last: () => snapshot };
  }

  it('spawns an ambulance when the roll is below the ambulance chance', async () => {
    const { simulation, last } = makeSimulation(() => 0.01);
    for (let i = 0; i < 31; i += 1) await simulation.tick();

    expect(last().length).toBeGreaterThan(0);
    expect(last().some((v) => v.kind === 'ambulance')).toBe(true);
  });

  it('spawns only cars when the roll is above the ambulance chance', async () => {
    const { simulation, last } = makeSimulation(() => 0.99);
    for (let i = 0; i < 31; i += 1) await simulation.tick();

    expect(last().length).toBeGreaterThan(0);
    expect(last().every((v) => v.kind === 'car')).toBe(true);
  });
});
