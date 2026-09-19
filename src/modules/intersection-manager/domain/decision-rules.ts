import type { Direction } from './vehicle.model';
import {
  INTERSECTION_HALF,
  MIN_FOLLOW_DISTANCE,
  SPAWN_DISTANCE,
} from './intersection-state';

// Un ocupante deja de bloquear direcciones en conflicto apenas termina de
// atravesar la interseccion (no espera a desaparecer en el horizonte).
export const OCCUPANT_CLEAR_DISTANCE = INTERSECTION_HALF + 1.5;

// Si hay un vehiculo detenido por delante dentro de este tramo, entrar a la
// interseccion la bloquearia (spillback): mejor esperar en la linea de parada.
export const EXIT_CLEARANCE = 22;

// Debajo de esta velocidad se considera que un vehiculo esta detenido.
export const STOPPED_SPEED = 1;

// Si un vehiculo espera mas que esto, se considera en riesgo de inanicion: se
// prioriza y se le permite cruzar aunque el jugador este bloqueando su eje.
export const STARVATION_LIMIT_SECONDS = 25;

const OPPOSITE: Record<Direction, Direction> = {
  N: 'S',
  S: 'N',
  E: 'W',
  W: 'E',
};

export function directionsConflict(a: Direction, b: Direction): boolean {
  if (a === b) return false;
  return OPPOSITE[a] !== b;
}

// `progress` crece de 0 (spawn) a ~180 (salida); el centro esta en SPAWN_DISTANCE.
export function withinIntersection(progressValue: number): boolean {
  return (
    progressValue >= SPAWN_DISTANCE - INTERSECTION_HALF &&
    progressValue <= SPAWN_DISTANCE + OCCUPANT_CLEAR_DISTANCE
  );
}

export function occupantHasCleared(progressValue: number): boolean {
  return progressValue > SPAWN_DISTANCE + OCCUPANT_CLEAR_DISTANCE;
}

export function exitBlockedBy(
  aheadProgress: number,
  selfProgress: number,
  aheadSpeed: number,
): boolean {
  if (aheadSpeed >= STOPPED_SPEED) return false;
  return aheadProgress - selfProgress < EXIT_CLEARANCE;
}

// Un vehiculo detenido por delante no deberia detener al de atras: si el
// carril vecino esta libre, se empieza el cambio de carril con mas antelacion.
export function isStarving(
  waitedSeconds: number,
  limit = STARVATION_LIMIT_SECONDS,
): boolean {
  return waitedSeconds >= limit;
}

export function shouldChangeLaneForQueue(
  gap: number,
  aheadStopped: boolean,
  cooldown: number,
  targetLaneClear: boolean,
): boolean {
  if (cooldown > 0 || !targetLaneClear) return false;
  const threshold = aheadStopped
    ? MIN_FOLLOW_DISTANCE * 2.5
    : MIN_FOLLOW_DISTANCE;
  return gap < threshold;
}
