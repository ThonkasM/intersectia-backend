import { IsIn, IsNumber, IsString, Length, Max, Min } from 'class-validator';
import type { Direction } from '../domain/vehicle.model';

const DIRECTIONS: Direction[] = ['N', 'S', 'E', 'W'];

export class PlayerStateDto {
  @IsString()
  @Length(1, 64)
  id: string;

  @IsNumber()
  @Min(-200)
  @Max(200)
  x: number;

  @IsNumber()
  @Min(-200)
  @Max(200)
  z: number;

  @IsIn(DIRECTIONS)
  from: Direction;

  @IsNumber()
  @Min(0)
  @Max(50)
  speed: number;
}
