import { laneFromPosition, laneOffset } from './vehicle.model';

describe('laneOffset', () => {
  it('maps N lane 0 to the outer/right lateral offset', () => {
    expect(laneOffset('N', 0)).toEqual({ x: 3.375, z: 0 });
  });

  it('maps E lane 1 to the inner lateral offset', () => {
    expect(laneOffset('E', 1)).toEqual({ x: 0, z: -1.125 });
  });
});

describe('laneFromPosition', () => {
  it('resolves S x=-3.375 to lane 0', () => {
    expect(laneFromPosition('S', -3.375, -50)).toBe(0);
  });

  it('resolves N x=1.125 to lane 1', () => {
    expect(laneFromPosition('N', 1.125, 90)).toBe(1);
  });
});
