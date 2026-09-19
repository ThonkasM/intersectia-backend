import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PlayerStateDto } from './player-state.dto';
import { SetModeDto, SetCollisionsDto } from './control.dto';

describe('WebSocket DTO validation', () => {
  it('accepts a valid player state', () => {
    const dto = plainToInstance(PlayerStateDto, {
      id: 'player',
      x: 1,
      z: -3,
      from: 'N',
      speed: 5,
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects an invalid direction', () => {
    const dto = plainToInstance(PlayerStateDto, {
      id: 'player',
      x: 1,
      z: -3,
      from: 'Q',
      speed: 5,
    });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects non-numeric coordinates', () => {
    const dto = plainToInstance(PlayerStateDto, {
      id: 'player',
      x: Number.NaN,
      z: -3,
      from: 'N',
      speed: 5,
    });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects an unknown simulation mode', () => {
    const dto = plainToInstance(SetModeDto, { mode: 'turbo' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('accepts a valid collisions flag', () => {
    const dto = plainToInstance(SetCollisionsDto, { enabled: true });
    expect(validateSync(dto)).toHaveLength(0);
  });
});
