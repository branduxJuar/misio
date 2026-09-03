import { IsArray, IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { UserRole } from '../user.schema';

export class CreateUserDto {
  @IsString()
  @Length(3, 50, { message: 'Nombre: mínimo 3 caracteres' })
  name: string;

  @IsString()
  @Matches(/^\d{8}$/, { message: 'DNI: 8 dígitos' })
  dni: string;

  @IsString()
  phone: string;

  @IsString()
  @Length(6, 120, { message: 'Contraseña: mínimo 6 caracteres' })
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  altContact?: string;

  @IsOptional()
  @IsObject()
  address?: Record<string, string>;
}

export class UpdateAutocontrolDto {
  @IsOptional()
  @IsEnum(['none', 'monthly_spend', 'daily_time', 'exclusion'])
  option?: 'none' | 'monthly_spend' | 'daily_time' | 'exclusion';

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlySpendLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyTimeLimit?: number;

  @IsOptional()
  @IsBoolean()
  confirmDisable?: boolean;

  @IsOptional()
  @IsBoolean()
  cancelDisable?: boolean;
}

export class SetPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}

export class SetBanDto {
  @IsBoolean()
  banned: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetBalancesDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  walletBalance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  walletCanje?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  walletHeld?: number;
}

export class SetPosPinDto {
  @IsString()
  @Length(4, 6, { message: 'El PIN debe tener entre 4 y 6 dígitos' })
  pin: string;
}
