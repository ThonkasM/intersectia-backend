import { Vehicle } from './vehicle.model';
import {
  MIN_FOLLOW_DISTANCE,
  MIN_STOP_DISTANCE,
  computeSeparationSpeed,
  progress,
} from './intersection-state';

describe('progress', () => {
  it('is 0 at the N spawn (z=90)', () => {
    expect(progress(new Vehicle('v', 'N', 3.375, 90))).toBe(0);
  });

  it('is 80 at the N stop line (z=10)', () => {
    expect(progress(new Vehicle('v', 'N', 3.375, 10))).toBe(80);
  });

  it('is 102 just past the intersection (z=-12)', () => {
    expect(progress(new Vehicle('v', 'N', 3.375, -12))).toBe(102);
  });

  it('is 0 at the S spawn (z=-90)', () => {
    expect(progress(new Vehicle('v', 'S', -3.375, -90))).toBe(0);
  });
});

describe('computeSeparationSpeed', () => {
  it('stops when the gap is below MIN_STOP_DISTANCE', () => {
    const v = new Vehicle('v', 'N', 3.375, 20);
    const ahead = new Vehicle('ahead', 'N', 3.375, 18.5);
    expect(progress(ahead) - progress(v)).toBeLessThan(MIN_STOP_DISTANCE);
    expect(computeSeparationSpeed(v, ahead)).toBe(0);
  });

  it('matches the ahead speed when within MIN_FOLLOW_DISTANCE', () => {
    const v = new Vehicle('v', 'N', 3.375, 20);
    v.speed = 6;
    const ahead = new Vehicle('ahead', 'N', 3.375, 17);
    ahead.speed = 3;
    const gap = progress(ahead) - progress(v);
    expect(gap).toBeGreaterThanOrEqual(MIN_STOP_DISTANCE);
    expect(gap).toBeLessThan(MIN_FOLLOW_DISTANCE);
    expect(computeSeparationSpeed(v, ahead)).toBe(3);
  });

  it('keeps its own speed when the gap is large enough', () => {
    const v = new Vehicle('v', 'N', 3.375, 20);
    v.speed = 6;
    const ahead = new Vehicle('ahead', 'N', 3.375, 10);
    expect(computeSeparationSpeed(v, ahead)).toBe(6);
  });
});
