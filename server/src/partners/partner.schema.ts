import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';

export type PartnerDocument = HydratedDocument<Partner>;

@Schema({ timestamps: true, collection: 'partners' })
export class Partner {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  legalId: string; // RUC o DNI

  @Prop({ default: '' })
  logo: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  bankDetails: string; // Cuenta bancaria, CCI, Banco

  @Prop({ default: '' })
  contactNumber: string;

  @Prop({ default: '' })
  address: string;

  /** Comisión que cobra Misio por cada ticket vendido (Ej: 10 significa 10%) */
  @Prop({ required: true, default: 10, min: 0, max: 100 })
  feePercentage: number;

  /** Saldo disponible (Billetera Empresarial del Partner) */
  @Prop({ required: true, default: 0 })
  walletBalance: number;

  /** Ranking: Cantidad de sorteos finalizados exitosamente */
  @Prop({ default: 0 })
  successfulRaffles: number;

  @Prop({ default: false })
  isPublicSponsor: boolean;

  /** Nivel de confianza. 1 = Limitado (ej: 5000 max), 2 = Verificado sin límite */
  @Prop({ type: Number, enum: [1, 2], default: 1 })
  trustTier: 1 | 2;

  @Prop()
  termsAcceptedAt?: Date;

  @Prop()
  contractDocumentUrl?: string; // Evidencia física del contrato firmado (PDF)
}

export const PartnerSchema = SchemaFactory.createForClass(Partner);
