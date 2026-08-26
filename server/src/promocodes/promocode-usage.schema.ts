import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'promocode_usages' })
export class PromoCodeUsage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PromoCode', required: true, index: true })
  promoCodeId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  code: string;

  /** Identificador de la transacción o boleto donde se aplicó */
  @Prop({ type: Types.ObjectId, default: null })
  referenceId: Types.ObjectId | null;
}

export type PromoCodeUsageDocument = HydratedDocument<PromoCodeUsage>;
export const PromoCodeUsageSchema = SchemaFactory.createForClass(PromoCodeUsage);
