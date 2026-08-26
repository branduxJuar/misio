import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { BingoWinMode } from '../bingo.schema';

export class CreateBingoRoomDto {
  @IsOptional()
  @IsString()
  @Length(3, 60)
  title?: string;

  /** Configurable por el anfitrión: cuántos pueden jugar. */
  @IsInt()
  @Min(2, { message: 'Mínimo 2 jugadores' })
  @Max(50, { message: 'Máximo 50 jugadores por sala' })
  maxPlayers: number;

  @IsEnum(BingoWinMode, { message: 'winMode: line | full' })
  winMode: BingoWinMode;
}

export class JoinBingoDto {
  @Matches(/^[A-Za-z0-9-]{4,12}$/, { message: 'Código de sala inválido' })
  code: string;
}
