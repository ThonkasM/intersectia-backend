import { IsBoolean, IsIn, IsString, Length } from 'class-validator';
import type { SimMode } from '../decision/decision.interface';

const MODES: SimMode[] = ['traditional', 'managed', 'managed-ai'];

export class SetModeDto {
  @IsIn(MODES)
  mode: SimMode;
}

export class FreezeVehicleDto {
  @IsString()
  @Length(1, 64)
  id: string;
}

export class SetCollisionsDto {
  @IsBoolean()
  enabled: boolean;
}
