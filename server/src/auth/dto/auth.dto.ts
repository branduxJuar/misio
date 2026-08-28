import {
  IsOptional, Equals, IsBoolean, IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';

/**
 * Registro rápido: nombre + DNI + celular + contraseña.
 * Las validaciones corren automáticamente gracias al ValidationPipe global
 * (main.ts): un body inválido devuelve 400 con el detalle del error.
 */
export class RegisterDto {
  @IsString()
  @Length(3, 80, { message: 'El nombre debe tener entre 3 y 80 caracteres' })
  name: string;

  @Matches(/^\d{8}$/, { message: 'El DNI debe tener exactamente 8 dígitos' })
  dni: string;

  @Matches(/^\+?51\s?9\d{2}\s?\d{3}\s?\d{3}$|^9\d{8}$/, {
    message: 'Celular peruano inválido (ej: 987654321)',
  })
  phone: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'La contraseña debe combinar letras y números',
  })
  password: string;

  @IsEmail({}, { message: 'Ingresa un correo válido' })
  email: string;

  /** Obligatorio: aceptación expresa de los T&C (Ley N° 29733, Perú). */
  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar los Términos y Condiciones para registrarte' })
  acceptTerms: boolean;

  // Tracking (opcionales, vienen del query string del frontend)
  @IsOptional()
  @IsString()
  utmSource?: string;
  @IsOptional()
  @IsString()
  utmMedium?: string;
  @IsOptional()
  @IsString()
  utmCampaign?: string;
  @IsOptional()
  @IsString()
  referrer?: string;
}

/** Login con DNI + contraseña (futuro: DNI + OTP por SMS). */
export class LoginDto {
  @IsString({ message: 'El identificador es requerido' })
  identifier: string;

  @IsString()
  @MinLength(6)
  password: string;
}


export class VerifyEmailDto {
  @IsString({ message: 'El identificador es requerido' })
  dni: string;

  @Matches(/^\d{6}$/, { message: 'El código tiene 6 dígitos' })
  code: string;
}
