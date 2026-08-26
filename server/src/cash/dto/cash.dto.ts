import { IsEnum, IsMongoId, IsNumber, IsString, Min } from 'class-validator';
import { CashMovementType } from '../cash.schema';

export class CreateRegisterDto {
  @IsString()
  name: string;
}

export class OpenShiftDto {
  @IsMongoId()
  registerId: string;

  @IsNumber()
  @Min(0)
  openingBalance: number;
}

export class CloseShiftDto {
  @IsNumber()
  @Min(0)
  closingBalance: number;
}

export class CashMovementDto {
  @IsEnum(CashMovementType)
  type: CashMovementType;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  description: string;
}
