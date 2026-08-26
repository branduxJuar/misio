import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum PromoCodeType {
  BONUS_RECHARGE = 'bonus_recharge', // Porcentaje extra en recarga (value = 10 para 10%)
  FREE_TICKET = 'free_ticket',       // Boleto gratis (value = 1 para 1 boleto)
}

@Schema({ timestamps: true, collection: 'promocodes' })
export class PromoCode {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ type: String, enum: PromoCodeType, required: true })
  type: PromoCodeType;

  /**
   * Valor del descuento o bono. 
   * Si es BONUS_RECHARGE, value es el porcentaje (ej. 15 = 15%).
   * Si es FREE_TICKET, value es la cantidad de boletos gratis (ej. 1).
   */
  @Prop({ required: true, min: 0 })
  value: number;

  @Prop({ required: true })
  terms: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ default: 1 })
  maxUsesPerUser: number;

  @Prop({ default: 0 })
  totalUses: number;

  @Prop({ default: true })
  isActive: boolean;
}

export type PromoCodeDocument = HydratedDocument<PromoCode>;
export const PromoCodeSchema = SchemaFactory.createForClass(PromoCode);
