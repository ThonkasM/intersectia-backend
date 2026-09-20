import { Logger } from '@nestjs/common';
import { SessionSimulation } from './session-simulation';
import { Vehicle } from './vehicle.model';
import { vehiclesOverlap } from './intersection-state';
import { DeterministicDecisionService } from '../decision/deterministic-decision.service';
import { RightPriorityDecisionService } from '../decision/right-priority-decision.service';
import type { RemoteVehicleDto } from '../dto/remote-vehicle.dto';

describe('vehiclesOverlap', () => {
  it('does not overlap for same-direction vehicles in adjacent lanes', () => {
    const a = new Vehicle('a', 'N', 3.375, 0);
    const b = new Vehicle('b', 'N', 1.125, 0);
    expect(vehiclesOverlap(a, b)).toBe(false);
  });

  it('does not overlap for same-lane vehicles with a safe gap', () => {
    const a = new Vehicle('a', 'N', 3.375, 0);
    const b = new Vehicle('b', 'N', 3.375, 3.4);
    expect(vehiclesOverlap(a, b)).toBe(false);
  });

  it('overlaps for perpendicular vehicles crossing at the center', () => {
    const a = new Vehicle('a', 'N', 0, 0);
    const b = new Vehicle('b', 'E', 0, 0);
    expect(vehiclesOverlap(a, b)).toBe(true);
  });

  it('overlaps for same-lane vehicles below the safe gap', () => {
    const a = new Vehicle('a', 'N', 3.375, 0);
    const b = new Vehicle('b', 'N', 3.375, 2);
    expect(vehiclesOverlap(a, b)).toBe(true);
  });
});

describe('SessionSimulation collisions', () => {
  function makeSimulation(): {
    simulation: SessionSimulation;
    last: () => RemoteVehicleDto[];
  } {
    let snapshot: RemoteVehicleDto[] = [];
    const metrics = {
      startSession: jest.fn().mockResolvedValue('db'),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const simulation = new SessionSimulation({
      sessionId: 'collisions',
      metrics: metrics as never,
      deterministicDecision: new DeterministicDecisionService(),
      rightPriorityDecision: new RightPriorityDecisionService(),
      aiDecisionClient: { decideNextCrossing: jest.fn() } as never,
      emitState: (vehicles) => {
        snapshot = vehicles;
      },
      emitDecision: () => undefined,
      logger: new Logger('collisions'),
      random: () => 0.99,
    });
    return { simulation, last: () => snapshot };
  }

  it('crashes two overlapping vehicles when collisions are enabled', async () => {
    const { simulation, last } = makeSimulation();
    simulation.setCollisions(true);
    simulation.upsertPlayerVehicle({ id: 'p1', x: 0, z: 0, from: 'N', speed: 0 });
    simulation.upsertPlayerVehicle({ id: 'p2', x: 0.1, z: 0.1, from: 'E', speed: 0 });

    await simulation.tick();

    const crashed = last().filter((v) => v.crashed).map((v) => v.id).sort();
    expect(crashed).toEqual(['p1', 'p2']);
  });

  it('does not crash vehicles when collisions are disabled', async () => {
    const { simulation, last } = makeSimulation();
    simulation.upsertPlayerVehicle({ id: 'p1', x: 0, z: 0, from: 'N', speed: 0 });
    simulation.upsertPlayerVehicle({ id: 'p2', x: 0.1, z: 0.1, from: 'E', speed: 0 });

    await simulation.tick();

    expect(last().some((v) => v.crashed)).toBe(false);
  });

  it('recovers vehicles after the crash duration', async () => {
    const { simulation, last } = makeSimulation();
    simulation.setCollisions(true);
    simulation.upsertPlayerVehicle({ id: 'p1', x: 0, z: 0, from: 'N', speed: 0 });
    simulation.upsertPlayerVehicle({ id: 'p2', x: 0.1, z: 0.1, from: 'E', speed: 0 });
    await simulation.tick();
    expect(last().some((v) => v.crashed)).toBe(true);

    // 2 s de choque (40 ticks) + margen; en ese punto ya se recuperaron.
    for (let i = 0; i < 45; i += 1) {
      await simulation.tick();
    }

    expect(last().some((v) => v.crashed)).toBe(false);
  });

  it('uncrashes all vehicles when collisions are turned off', async () => {
    const { simulation, last } = makeSimulation();
    simulation.setCollisions(true);
    simulation.upsertPlayerVehicle({ id: 'p1', x: 0, z: 0, from: 'N', speed: 0 });
    simulation.upsertPlayerVehicle({ id: 'p2', x: 0.1, z: 0.1, from: 'E', speed: 0 });
    await simulation.tick();
    expect(last().some((v) => v.crashed)).toBe(true);

    simulation.setCollisions(false);
    await simulation.tick();

    expect(last().some((v) => v.crashed)).toBe(false);
  });
});
