import { VehicleState } from '../domain/vehicle.model';

export class RemoteVehicleDto {
  id: string;
  x: number;
  z: number;
  from: 'N' | 'S' | 'E' | 'W';
  state: VehicleState;
  frozen: boolean;
  crashed: boolean;
}
