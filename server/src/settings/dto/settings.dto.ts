import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, IsObject } from 'class-validator';

export class UpdateSiteDto {
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() tagline?: string;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() secondaryColor?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() whatsappUrl?: string;
  @IsOptional() @IsString() telegramUrl?: string;
  @IsOptional() @IsString() tiktokUrl?: string;
  @IsOptional() @IsString() metaTitle?: string;
  @IsOptional() @IsString() metaDescription?: string;
  @IsOptional() @IsObject() landing?: Record<string, any>;
  @IsOptional() @IsObject() about?: Record<string, any>;
}

export class SetEmailVerificationDto {
  @IsBoolean() enabled: boolean;
}

export class WelcomeBonusConfigDto {
  @IsBoolean() enabled: boolean;
  @IsString() type: 'credit' | 'ticket';
  @IsNumber() @Min(0) creditAmount: number;
  @IsOptional() @IsString() raffleId?: string | null;
}

export class SetRefundPercentageDto {
  @IsNumber() @Min(0) percentage: number;
}

export class SetLegalDto {
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @IsString() privacy?: string;
  @IsOptional() @IsString() howItWorks?: string;
  @IsOptional() @IsString() autocontrol?: string;
  @IsOptional() @IsString() raffleRules?: string;
}

export class SetAnnouncementsDto {
  @IsArray() announcements: any[];
}

export class SetMaintenanceDto {
  @IsBoolean() enabled: boolean;
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsDateString() resumeAt?: string;
}
