import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  @Length(2, 40)
  name: string;

  @IsString()
  @Length(6, 30, { message: 'Número/cuenta: 6-30 caracteres' })
  accountNumber: string;

  @IsOptional() @IsString() holderName?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePaymentMethodDto {
  @IsOptional() @IsString() @Length(2, 40) name?: string;
  @IsOptional() @IsString() @Length(6, 30) accountNumber?: string;
  @IsOptional() @IsString() holderName?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
