import { IsArray, IsBoolean, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Length, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStoreItemDto {
  @IsString()
  @Length(3, 80)
  name: string;

  @IsInt()
  @Min(1)
  priceMisio: number;

  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsEnum(['canje', 'venta']) saleType?: 'canje' | 'venta';
  @IsOptional() @IsEnum(['fisico', 'virtual']) fulfillment?: 'fisico' | 'virtual';

  /** -1 = ilimitado */
  @IsOptional() @IsInt() @Min(-1) stock?: number;

  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateStoreItemDto {
  @IsOptional() @IsString() @Length(3, 80) name?: string;
  @IsOptional() @IsEnum(['canje', 'venta']) saleType?: 'canje' | 'venta';
  @IsOptional() @IsEnum(['fisico', 'virtual']) fulfillment?: 'fisico' | 'virtual';
  @IsOptional() @IsInt() @Min(1) priceMisio?: number;
  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(-1) stock?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class RedeemDto {
  @IsMongoId()
  itemId: string;
}

class CheckoutItemDto {
  @IsMongoId()
  itemId: string;

  @IsInt()
  @Min(1)
  qty: number;
}

class CheckoutDeliveryDto {
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() note?: string;
}

export class CheckoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutDeliveryDto)
  delivery?: CheckoutDeliveryDto;
}

export class DeliverRedemptionDto {
  @IsOptional() @IsString() virtualCode?: string;
  @IsOptional() @IsString() deliveryNote?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) evidence?: string[];
}

export class UpdateRedemptionStatusDto {
  @IsString() status: string;
}
