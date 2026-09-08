import { INTERSECTION_HALF } from './intersection-state';

export const PLAYER_TIMEOUT_MS = 2000;
export const PLAYER_MAX_SPEED = 12;

export function isPlayerTimedOut(lastSeenMs: number, nowMs: number): boolean {
  return nowMs - lastSeenMs > PLAYER_TIMEOUT_MS;
}

export function shouldFlagViolation(vehicle: {
  state: string;
  isPlayerControlled: boolean;
  from: string;
  x: number;
  z: number;
}): boolean {
  if (!vehicle.isPlayerControlled || vehicle.state === 'crossing') return false;
  const distance =
    vehicle.from === 'N' || vehicle.from === 'S'
      ? Math.abs(vehicle.z)
      : Math.abs(vehicle.x);
  return distance <= INTERSECTION_HALF;
}
