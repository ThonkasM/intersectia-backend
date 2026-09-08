import {
  PLAYER_TIMEOUT_MS,
  isPlayerTimedOut,
  shouldFlagViolation,
} from './player-vehicle.rules';

describe('isPlayerTimedOut', () => {
  it('returns false when within the timeout window', () => {
    expect(isPlayerTimedOut(1000, 1000 + PLAYER_TIMEOUT_MS - 1)).toBe(false);
  });

  it('returns false exactly at the threshold', () => {
    expect(isPlayerTimedOut(1000, 1000 + PLAYER_TIMEOUT_MS)).toBe(false);
  });

  it('returns true when over the timeout window', () => {
    expect(isPlayerTimedOut(1000, 1000 + PLAYER_TIMEOUT_MS + 1)).toBe(true);
  });

  it('returns true when there is no last-seen record', () => {
    expect(isPlayerTimedOut(0, Date.now())).toBe(true);
  });
});

describe('shouldFlagViolation', () => {
  it('returns false for an autonomous vehicle inside the intersection', () => {
    expect(
      shouldFlagViolation({
        state: 'crossing',
        isPlayerControlled: false,
        from: 'N',
        x: 2.25,
        z: 3,
      }),
    ).toBe(false);
  });

  it('returns false for a player vehicle crossing inside the intersection', () => {
    expect(
      shouldFlagViolation({
        state: 'crossing',
        isPlayerControlled: true,
        from: 'N',
        x: 2.25,
        z: 3,
      }),
    ).toBe(false);
  });

  it('returns true for a player vehicle queued inside the zone', () => {
    expect(
      shouldFlagViolation({
        state: 'queued',
        isPlayerControlled: true,
        from: 'N',
        x: 2.25,
        z: 4,
      }),
    ).toBe(true);
  });

  it('returns false for a player vehicle queued outside the zone', () => {
    expect(
      shouldFlagViolation({
        state: 'queued',
        isPlayerControlled: true,
        from: 'N',
        x: 2.25,
        z: 8,
      }),
    ).toBe(false);
  });
});
