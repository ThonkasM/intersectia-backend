export type Direction = 'N' | 'S' | 'E' | 'W';
export type VehicleState = 'approach' | 'queued' | 'crossing' | 'gone';

// Dos carriles por sentido. Índice 0 = carril exterior (derecho), 1 = interior (sobrepaso).
// Para N/S el desvío es en x; para E/W es en z.
export const LANES: Record<Direction, [number, number]> = {
  N: [3.375, 1.125],
  S: [-3.375, -1.125],
  E: [-3.375, -1.125],
  W: [3.375, 1.125],
};

export const LANE_WIDTH = 2.25;
export const LANE_CHANGE_SPEED = 4;

export function laneOffset(
  from: Direction,
  lane: number,
): { x: number; z: number } {
  const offset = LANES[from][lane] ?? LANES[from][0];
  if (from === 'N' || from === 'S') return { x: offset, z: 0 };
  return { x: 0, z: offset };
}

export function laneFromPosition(
  from: Direction,
  x: number,
  z: number,
): number {
  const lateral = from === 'N' || from === 'S' ? x : z;
  const lanes = LANES[from];
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < lanes.length; i += 1) {
    const d = Math.abs(lateral - lanes[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export class Vehicle {
  static readonly DIRECTION: Record<Direction, { dx: number; dz: number }> = {
    N: { dx: 0, dz: -1 },
    S: { dx: 0, dz: 1 },
    E: { dx: 1, dz: 0 },
    W: { dx: -1, dz: 0 },
  };

  id: string;
  from: Direction;
  x: number;
  z: number;
  lane: number;
  state: VehicleState = 'approach';
  speed: number = 6;
  waitedSeconds: number = 0;
  isPlayerControlled: boolean = false;
  laneChangeCooldown: number = 0;

  constructor(id: string, from: Direction, x: number, z: number, lane = 0) {
    this.id = id;
    this.from = from;
    this.x = x;
    this.z = z;
    this.lane = lane;
  }

  setPosition(x: number, z: number): void {
    this.x = x;
    this.z = z;
  }

  advance(dt: number): void {
    if (this.state === 'queued' || this.state === 'gone') return;
    const { dx, dz } = Vehicle.DIRECTION[this.from];
    this.x += dx * this.speed * dt;
    this.z += dz * this.speed * dt;
  }

  // Desplaza lateralmente el vehículo hacia su carril objetivo (cambio de carril suave).
  steerToLane(dt: number): void {
    if (this.state === 'queued' || this.state === 'gone') return;
    const off = laneOffset(this.from, this.lane);
    const isNS = this.from === 'N' || this.from === 'S';
    const lateral = isNS ? this.x : this.z;
    const desired = isNS ? off.x : off.z;
    const delta = desired - lateral;
    if (Math.abs(delta) < 0.01) return;
    const step =
      Math.sign(delta) * Math.min(Math.abs(delta), LANE_CHANGE_SPEED * dt);
    if (isNS) this.x += step;
    else this.z += step;
  }
}
