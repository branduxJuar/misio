import {
  IsEmail, IsEnum, IsOptional, IsString, Length, Matches, MaxLength,
} from 'class-validator';
import { ComplaintKind } from '../complaint.schema';

/**
 * Libro de Reclamaciones (Ley 29571): endpoint PÚBLICO — cualquiera puede
 * reclamar, con o sin cuenta. Justo por eso necesita el DTO más estricto
 * del sistema: es la única puerta abierta a internet sin token.
 *
 * Con `whitelist` + `forbidNonWhitelisted` (global), lo que no está
 * declarado aquí se elimina, y si mandan campos de más se rechaza la
 * petición: nadie puede colar `status: 'respondido'` ni `userId` ajeno.
 */
export class CreateComplaintDto {
  @IsString()
  @Length(3, 120, { message: 'Ingresa tu nombre completo' })
  fullName: string;

  @Matches(/^\d{8}$/, { message: 'El DNI debe tener 8 dígitos' })
  dni: string;

  @IsOptional()
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsEnum(ComplaintKind, { message: 'Indica si es reclamo o queja' })
  kind: ComplaintKind;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  orderRef?: string;

  @IsString()
  @Length(20, 3000, { message: 'Cuéntanos el detalle (mínimo 20 caracteres)' })
  detail: string;
}

export class RespondComplaintDto {
  @IsString()
  @Length(5, 3000, { message: 'Escribe la respuesta al reclamo' })
  response: string;
}
