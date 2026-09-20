import { laneOffset, type Direction, type Turn } from './vehicle.model';

export const TURN_EXIT: Record<
  Direction,
  { straight: Direction; right: Direction; left: Direction }
> = {
  // 'right' es la derecha real del conductor (nariz +z, arriba +y -> derecha -x).
  N: { straight: 'N', right: 'E', left: 'W' },
  S: { straight: 'S', right: 'W', left: 'E' },
  E: { straight: 'E', right: 'S', left: 'N' },
  W: { straight: 'W', right: 'N', left: 'S' },
};

export interface TurnPath {
  sx: number;
  sz: number;
  cx: number;
  cz: number;
  ex: number;
  ez: number;
  length: number;
}

export function exitDirection(from: Direction, turn: Turn): Direction {
  if (turn === 'straight') return from;
  return TURN_EXIT[from][turn];
}

// Giro a la derecha por el carril exterior; a la izquierda por el interior.
export function laneForTurn(turn: Turn, currentLane: number): number {
  if (turn === 'right') return 0;
  if (turn === 'left') return 1;
  return currentLane;
}

function entryLateral(from: Direction, lane: number): number {
  const offset = laneOffset(from, lane);
  return from === 'N' || from === 'S' ? offset.x : offset.z;
}

function exitLateral(exitFrom: Direction, lane: number): number {
  const offset = laneOffset(exitFrom, lane);
  return exitFrom === 'N' || exitFrom === 'S' ? offset.x : offset.z;
}

function exitPoint(
  exitFrom: Direction,
  lane: number,
  stopLine: number,
): { x: number; z: number } {
  const lateral = exitLateral(exitFrom, lane);
  switch (exitFrom) {
    case 'N':
      return { x: lateral, z: -stopLine };
    case 'S':
      return { x: lateral, z: stopLine };
    case 'E':
      return { x: stopLine, z: lateral };
    case 'W':
      return { x: -stopLine, z: lateral };
  }
}

export function sampleQuadratic(
  path: TurnPath,
  t: number,
): { x: number; z: number } {
  const u = 1 - t;
  return {
    x: u * u * path.sx + 2 * u * t * path.cx + t * t * path.ex,
    z: u * u * path.sz + 2 * u * t * path.cz + t * t * path.ez,
  };
}

function pathLength(path: Omit<TurnPath, 'length'>, samples = 16): number {
  let length = 0;
  let prev = sampleQuadratic({ ...path, length: 0 }, 0);
  for (let i = 1; i <= samples; i += 1) {
    const point = sampleQuadratic({ ...path, length: 0 }, i / samples);
    length += Math.hypot(point.x - prev.x, point.z - prev.z);
    prev = point;
  }
  return length;
}

// Bezier cuadratica desde la posicion actual hasta el carril de salida, con el
// punto de control en la esquina de la interseccion (curva suave).
export function buildTurnPath(
  from: Direction,
  lane: number,
  exitFrom: Direction,
  startX: number,
  startZ: number,
  stopLine: number,
): TurnPath | null {
  if (from === exitFrom) return null;
  const exit = exitPoint(exitFrom, lane, stopLine);
  const verticalEntry = from === 'N' || from === 'S';
  const cx = verticalEntry ? entryLateral(from, lane) : exit.x;
  const cz = verticalEntry ? exit.z : entryLateral(from, lane);
  const base = {
    sx: startX,
    sz: startZ,
    cx,
    cz,
    ex: exit.x,
    ez: exit.z,
  };
  return { ...base, length: pathLength(base) };
}
