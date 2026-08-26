import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateAuctionDto {
  @IsString()
  @Length(3, 120)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 10)
  emoji?: string;

  @IsNumber()
  @Min(1)
  basePrice: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  minIncrement?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  buyNowPrice?: number;

  @IsDateString()
  startAt: string;

  @IsNumber()
  @Min(1)
  durationMin: number;

  @IsOptional()
  @IsEnum(['auto', 'moderated'])
  mode?: 'auto' | 'moderated';

  @IsOptional()
  @IsString()
  streamUrl?: string;
}

export class SetAuctionFlagDto {
  @IsBoolean()
  enabled: boolean;
}

export class SetStreamDto {
  @IsString()
  streamUrl: string;
}

export class CancelAuctionDto {
  @IsString()
  @Length(5, 500)
  reason: string;
}
