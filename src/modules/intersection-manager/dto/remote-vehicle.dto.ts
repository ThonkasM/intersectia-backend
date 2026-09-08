export class RemoteVehicleDto {
  id: string;
  x: number;
  z: number;
  from: 'N' | 'S' | 'E' | 'W';
  state: 'approach' | 'queued' | 'crossing' | 'gone';
}
