import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl,
  Length, Matches, Min, ValidateNested, ArrayMinSize
} from 'class-validator';
import { Type } from 'class-transformer';
import { DrawMode, RaffleStatus, RaffleType } from '../raffle.schema';

export class PrizeDto {
  @IsString()
  @Length(2, 120)
  title: string;

  @IsEnum(DrawMode)
  drawMode: DrawMode;

  @IsOptional()
  @IsInt()
  @Min(2)
  winningAttempt?: number;
}

export class CreateRaffleDto {
  @IsString()
  @Length(5, 120)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Prefijo de la numerología: PS5 → PS5-0001, PS5-0002... */
  @Matches(/^[A-Za-z0-9]{2,6}$/, { message: 'Prefijo: 2-6 letras/números (ej: PS5, IPH16)' })
  ticketPrefix: string;

  @IsInt()
  @Min(1, { message: 'El precio mínimo del boleto es S/ 1' })
  ticketPrice: number;

  @IsInt()
  @Min(10, { message: 'Una rifa necesita mínimo 10 boletos' })
  totalTickets: number;

  /** direct = primera tirada gana; al_agua = con tiradas de suspenso. */
  @IsOptional()
  @IsEnum(DrawMode, { message: 'drawMode: direct | al_agua' })
  drawMode?: DrawMode;

  /** En al_agua: tirada ganadora (2 = 1 al agua antes). En direct se ignora (=1). */
  @IsOptional()
  @IsInt()
  @Min(2, { message: 'En modo al agua, la tirada ganadora es mínimo la 2da' })
  winningAttempt?: number;

  @IsOptional()
  @IsEnum(RaffleType)
  type?: RaffleType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrizeDto)
  prizes?: PrizeDto[];

  /** Máximo de boletos por persona en esta rifa. */
  @IsInt()
  @Min(1)
  maxTicketsPerUser: number;

  @IsDateString({}, { message: 'drawDate debe ser fecha ISO 8601' })
  drawDate: string;

  @IsOptional()
  @IsBoolean()
  notifyDayBefore?: boolean;

  @IsOptional()
  @IsUrl({}, { message: 'streamUrl debe ser una URL válida' })
  streamUrl?: string;
}

/** Edición: todos los campos opcionales (solo con la rifa en venta). */
export class UpdateRaffleDto {
  @IsOptional() @IsString() @Length(5, 120) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9]{2,6}$/) ticketPrefix?: string;
  @IsOptional() @IsInt() @Min(1) ticketPrice?: number;
  @IsOptional() @IsInt() @Min(10) totalTickets?: number;
  @IsOptional() @IsEnum(DrawMode) drawMode?: DrawMode;
  @IsOptional() @IsInt() @Min(2) winningAttempt?: number;
  @IsOptional() @IsEnum(RaffleType) type?: RaffleType;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrizeDto) prizes?: PrizeDto[];
  @IsOptional() @IsInt() @Min(1) maxTicketsPerUser?: number;
  @IsOptional() @IsDateString() drawDate?: string;
  @IsOptional() @IsBoolean() notifyDayBefore?: boolean;
  @IsOptional() @IsUrl() streamUrl?: string;
}

export class PostponeRaffleDto {
  @IsString()
  @Length(5, 300, { message: 'Explica el motivo del aplazamiento (mín. 5 caracteres)' })
  reason: string;

  @IsDateString({}, { message: 'newDate debe ser fecha ISO 8601' })
  newDate: string;
}

export class UpdateRaffleStatusDto {
  @IsEnum(RaffleStatus, { message: 'Status inválido' })
  status: RaffleStatus;
}
