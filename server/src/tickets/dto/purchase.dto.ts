import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Compra de boletos con saldo Misio. DOS modalidades:
 *  - quantity: compra rápida (el sistema asigna los números libres más bajos)
 *  - ticketNumbers: el usuario ELIGE sus números en la grilla (Sprint 3)
 * El límite real por usuario lo define cada rifa (maxTicketsPerUser).
 */
export class PurchaseTicketsDto {
  @IsMongoId()
  raffleId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  quantity?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  ticketNumbers?: number[];

  @IsOptional()
  promoCode?: string;
}

export class AdminAddTicketsDto {
  @IsMongoId()
  raffleId: string;

  @IsMongoId()
  userId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ticketNumbers: number[];
}

export class PurchaseOfflineDto {
  @IsMongoId()
  raffleId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  ticketNumbers?: number[];

  @IsOptional()
  @IsString()
  buyerName?: string;

  @IsOptional()
  @IsString()
  buyerPhone?: string;

  @IsOptional()
  @IsString()
  buyerDni?: string;

  @IsOptional()
  @IsString()
  buyerEmail?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
