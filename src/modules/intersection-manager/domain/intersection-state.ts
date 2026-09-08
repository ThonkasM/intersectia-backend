import { Vehicle } from './vehicle.model';

export const SPAWN_DISTANCE = 90;
export const STOP_LINE_DISTANCE = 10;
export const INTERSECTION_HALF = 6;
export const GONE_DISTANCE = 12;
export const APPROACH_SPEED = 6;
export const CROSSING_SPEED = 9;
export const MIN_FOLLOW_DISTANCE = 4.5;
export const MIN_STOP_DISTANCE = 2.0;

export function distanceToIntersection(v: Vehicle): number {
  if (v.from === 'N' || v.from === 'S') return Math.abs(v.z);
  return Math.abs(v.x);
}

// Progreso longitudinal (0 en el spawn, crece al acercarse y atravesar la intersección).
// Sirve para calcular la separación entre vehículos del mismo carril.
export function progress(v: Vehicle): number {
  switch (v.from) {
    case 'N':
      return SPAWN_DISTANCE - v.z;
    case 'S':
      return SPAWN_DISTANCE + v.z;
    case 'E':
      return SPAWN_DISTANCE + v.x;
    case 'W':
      return SPAWN_DISTANCE - v.x;
  }
}

// Velocidad que debe adoptar `v` para no chocar con `ahead` (mismo carril, por delante).
export function computeSeparationSpeed(v: Vehicle, ahead: Vehicle): number {
  const gap = progress(ahead) - progress(v);
  if (gap < MIN_STOP_DISTANCE) return 0;
  if (gap < MIN_FOLLOW_DISTANCE) return Math.min(v.speed, ahead.speed);
  return v.speed;
}
