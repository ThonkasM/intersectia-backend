export class PlayerStateDto {
  id: string;
  x: number;
  z: number;
  from: 'N' | 'S' | 'E' | 'W';
  speed: number;
}
