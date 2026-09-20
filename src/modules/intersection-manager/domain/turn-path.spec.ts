import {
  buildTurnPath,
  exitDirection,
  laneForTurn,
  sampleQuadratic,
} from './turn-path';

describe('turn-path', () => {
  it('maps each direction to its exit for right/left turns', () => {
    expect(exitDirection('N', 'right')).toBe('E');
    expect(exitDirection('N', 'left')).toBe('W');
    expect(exitDirection('S', 'right')).toBe('W');
    expect(exitDirection('E', 'right')).toBe('S');
    expect(exitDirection('W', 'left')).toBe('S');
    expect(exitDirection('N', 'straight')).toBe('N');
  });

  it('sends right turns to the actual right side of the car (nose +z, right -x)', () => {
    const dir = {
      N: { dx: 0, dz: -1 },
      S: { dx: 0, dz: 1 },
      E: { dx: 1, dz: 0 },
      W: { dx: -1, dz: 0 },
    } as const;
    const dirOf = (dx: number, dz: number): string =>
      (['N', 'S', 'E', 'W'] as const).find(
        (d) => dir[d].dx === dx && dir[d].dz === dz,
      ) ?? '?';
    for (const from of ['N', 'S', 'E', 'W'] as const) {
      const forward = dir[from];
      // right = cross(forward, up) = (-dz, dx)
      const right = { dx: -forward.dz, dz: forward.dx };
      expect(exitDirection(from, 'right')).toBe(dirOf(right.dx, right.dz));
      expect(exitDirection(from, 'left')).toBe(dirOf(-right.dx, -right.dz));
    }
  });

  it('assigns the outer lane to right turns and the inner lane to left turns', () => {
    expect(laneForTurn('right', 1)).toBe(0);
    expect(laneForTurn('left', 0)).toBe(1);
    expect(laneForTurn('straight', 1)).toBe(1);
  });

  it('has no path for a straight movement', () => {
    expect(buildTurnPath('N', 0, 'N', 3.375, 10, 10)).toBeNull();
  });

  it('builds a curve from the entry to the exit lane (N right-turn)', () => {
    const path = buildTurnPath('N', 0, 'W', 3.375, 10, 10);
    expect(path).not.toBeNull();
    if (!path) return;
    expect(path.length).toBeGreaterThan(0);
    expect(sampleQuadratic(path, 0)).toEqual({ x: 3.375, z: 10 });
    expect(sampleQuadratic(path, 1).x).toBeCloseTo(-10, 5);
    expect(sampleQuadratic(path, 1).z).toBeCloseTo(-3.375, 5);
  });
});
