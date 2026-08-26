import { Type } from 'class-transformer';
import {
  IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Length, Min, ValidateNested,
} from 'class-validator';
import { DeliveryStatus } from '../logistics.schema';

class ShippingDetailsDto {
  @IsOptional() @IsString() courier?: string;
  @IsOptional() @IsString() trackingNumber?: string;
  @IsOptional() @IsString() destinationCity?: string;
}

export class CreateLogisticsDto {
  @IsMongoId()
  raffleId: string;

  @IsString()
  @Length(3, 120)
  productName: string;

  @IsNumber()
  @Min(0)
  purchaseCost: number;

  @IsOptional() @IsString() receiptFileUrl?: string;
}

export class UpdateLogisticsDto {
  @IsOptional() @IsMongoId() winnerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingDetailsDto)
  shippingDetails?: ShippingDetailsDto;

  @IsOptional()
  @IsEnum(DeliveryStatus)
  deliveryStatus?: DeliveryStatus;

  @IsOptional() @IsString() evidencePhotoUrl?: string;
}
