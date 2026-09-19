import {
  directionsConflict,
  EXIT_CLEARANCE,
  exitBlockedBy,
  isStarving,
  occupantHasCleared,
  OCCUPANT_CLEAR_DISTANCE,
  shouldChangeLaneForQueue,
  STARVATION_LIMIT_SECONDS,
  withinIntersection,
} from './decision-rules';
import { INTERSECTION_HALF, MIN_FOLLOW_DISTANCE, SPAWN_DISTANCE } from './intersection-state';

describe('decision-rules', () => {
  it('does not conflict with the same or the opposite direction', () => {
    expect(directionsConflict('N', 'N')).toBe(false);
    expect(directionsConflict('N', 'S')).toBe(false);
    expect(directionsConflict('E', 'W')).toBe(false);
  });

  it('conflicts with perpendicular directions', () => {
    expect(directionsConflict('N', 'E')).toBe(true);
    expect(directionsConflict('S', 'W')).toBe(true);
  });

  it('bounds the intersection window around the center', () => {
    expect(withinIntersection(SPAWN_DISTANCE)).toBe(true);
    expect(withinIntersection(SPAWN_DISTANCE - INTERSECTION_HALF)).toBe(true);
    expect(withinIntersection(SPAWN_DISTANCE - INTERSECTION_HALF - 0.1)).toBe(false);
    expect(withinIntersection(SPAWN_DISTANCE - 10)).toBe(false);
  });

  it('clears the occupant once it passes the intersection', () => {
    const clear = SPAWN_DISTANCE + OCCUPANT_CLEAR_DISTANCE;
    expect(occupantHasCleared(clear + 0.1)).toBe(true);
    expect(occupantHasCleared(clear - 0.1)).toBe(false);
  });

  it('blocks entry only when a stopped vehicle is ahead within the clearance', () => {
    const self = SPAWN_DISTANCE - 10;
    expect(exitBlockedBy(self + EXIT_CLEARANCE - 1, self, 0)).toBe(true);
    expect(exitBlockedBy(self + EXIT_CLEARANCE + 1, self, 0)).toBe(false);
    expect(exitBlockedBy(self + 2, self, 5)).toBe(false);
  });

  it('starts the lane change earlier when the vehicle ahead is stopped', () => {
    const gap = MIN_FOLLOW_DISTANCE + 3;
    expect(shouldChangeLaneForQueue(gap, false, 0, true)).toBe(false);
    expect(shouldChangeLaneForQueue(gap, true, 0, true)).toBe(true);
  });

  it('never changes lane on cooldown or when the target lane is not clear', () => {
    expect(shouldChangeLaneForQueue(1, true, 1, true)).toBe(false);
    expect(shouldChangeLaneForQueue(1, true, 0, false)).toBe(false);
  });

  it('flags starvation once the wait exceeds the limit', () => {
    expect(isStarving(STARVATION_LIMIT_SECONDS - 0.1)).toBe(false);
    expect(isStarving(STARVATION_LIMIT_SECONDS)).toBe(true);
    expect(isStarving(STARVATION_LIMIT_SECONDS + 5)).toBe(true);
  });
});
