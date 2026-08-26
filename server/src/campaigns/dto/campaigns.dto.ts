import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Length, Min, ValidateNested } from 'class-validator';

export class CampaignTargetDto {
  @IsOptional() @IsEnum(['all', 'inactive', 'new']) audienceType?: 'all' | 'inactive' | 'new';
  @IsOptional() @IsNumber() @Min(1) monthsInactive?: number;
  @IsOptional() @IsString() country?: string;
}

export class CampaignPromoDto {
  @IsString() @Length(2, 30) code: string;
  @IsString() type: string;
  @IsNumber() @Min(0) value: number;
  @IsString() terms: string;
  @IsDateString() expiresAt: Date;
}

export class CreateCampaignDto {
  @IsString()
  @Length(3, 150)
  title: string;

  @IsString()
  @Length(10, 2000)
  message: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignTargetDto)
  target?: CampaignTargetDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignPromoDto)
  promo?: CampaignPromoDto;
}
