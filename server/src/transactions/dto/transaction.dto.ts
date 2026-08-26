import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsEnum, IsInt, IsMongoId, IsNotEmpty, IsNumber, IsOptional,
  IsPositive, IsString, Length, ValidateNested,
} from 'class-validator';
import { TransactionType } from '../transaction.schema';

/** Intención de compra: números del carrito que se comprarán al confirmar. */
class PurchaseIntentDto {
  @IsMongoId()
  raffleId: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  ticketNumbers: number[];
}

/**
 * Depósito Yape/Plin (nace 'pending'). Puede venir de:
 * - Recarga normal desde "Mi Misio" (solo monto + método + N° operación).
 * - El carrito de una rifa (incluye purchaseIntent: al confirmar el pago,
 *   el sistema compra esos números automáticamente).
 */
export class CreateDepositDto {
  @IsNumber()
  @IsPositive({ message: 'El monto del depósito debe ser positivo' })
  amount: number;

  @IsEnum([TransactionType.DEPOSIT_YAPE], {
    message: 'Solo se aceptan depósitos por este endpoint',
  })
  type: TransactionType.DEPOSIT_YAPE;

  @IsOptional()
  @IsString()
  @Length(2, 40)
  methodName?: string;

  /** N° de operación de Yape/Plin: obligatorio para verificar el pago y proceder con la compra de tickets. */
  @IsNotEmpty({ message: 'El número de operación es obligatorio para validar tu pago con Yape o Plin' })
  @IsString()
  @Length(4, 30, { message: 'El número de operación debe tener entre 4 y 30 caracteres' })
  operationNumber: string;

  @IsOptional()
  @IsString()
  promoCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PurchaseIntentDto)
  purchaseIntent?: PurchaseIntentDto;

  /** Intención de TIENDA: al confirmar el pago se ejecuta el checkout. */
  @IsOptional()
  @IsArray()
  storeItems?: { itemId: string; qty: number }[];
}
