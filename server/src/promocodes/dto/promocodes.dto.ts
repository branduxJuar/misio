import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { PromoCodeType } from '../promocode.schema';

export class CreatePromocodeDto {
  @IsString()
  @Length(2, 30)
  code: string;

  @IsEnum(PromoCodeType)
  type: PromoCodeType;

  @IsNumber()
  @Min(0)
  value: number;

  @IsString()
  terms: string;

  @IsDateString()
  expiresAt: Date;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsesPerUser?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ValidateCodeDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsEnum(PromoCodeType)
  type?: PromoCodeType;
}
