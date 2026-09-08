import { Vehicle } from './vehicle.model';

export const SPAWN_DISTANCE = 90;
export const STOP_LINE_DISTANCE = 10;
export const INTERSECTION_HALF = 6;
export const GONE_DISTANCE = 12;
export const APPROACH_SPEED = 6;
export const CROSSING_SPEED = 9;
export const MIN_FOLLOW_DISTANCE = 6.0;
export const MIN_STOP_DISTANCE = 3.4;
export const CROSSING_BRAKE = 20;

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

// Frenado para ceder el paso al jugador dentro de la intersección.
export function applyBrake(speed: number, dt: number): number {
  return Math.max(0, speed - CROSSING_BRAKE * dt);
}

// Dimensiones del vehículo para detección de colisiones (AABB en el plano).
export const VEHICLE_HALF_LENGTH = 1.2; // a lo largo del sentido de avance
export const VEHICLE_HALF_WIDTH = 0.65; // perpendicular al avance
const COLLISION_TOLERANCE = 0.85;

export function vehiclesOverlap(a: Vehicle, b: Vehicle): boolean {
  const aX =
    a.from === 'N' || a.from === 'S' ? VEHICLE_HALF_WIDTH : VEHICLE_HALF_LENGTH;
  const aZ =
    a.from === 'N' || a.from === 'S' ? VEHICLE_HALF_LENGTH : VEHICLE_HALF_WIDTH;
  const bX =
    b.from === 'N' || b.from === 'S' ? VEHICLE_HALF_WIDTH : VEHICLE_HALF_LENGTH;
  const bZ =
    b.from === 'N' || b.from === 'S' ? VEHICLE_HALF_LENGTH : VEHICLE_HALF_WIDTH;
  return (
    Math.abs(a.x - b.x) < (aX + bX) * COLLISION_TOLERANCE &&
    Math.abs(a.z - b.z) < (aZ + bZ) * COLLISION_TOLERANCE
  );
}
