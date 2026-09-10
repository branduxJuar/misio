import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';

export type PartnerPayoutDocument = HydratedDocument<PartnerPayout>;

export enum PayoutStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true, collection: 'partner_payouts' })
export class PartnerPayout {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true, index: true })
  partnerId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ type: String, enum: PayoutStatus, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  /** Notas o justificación (ej. motivo de rechazo) */
  @Prop({ default: '' })
  notes: string;

  /** Comprobante bancario subido por el admin al liquidar */
  @Prop()
  receiptUrl?: string;

  /** Fecha de liquidación efectiva */
  @Prop()
  processedAt?: Date;
}

export const PartnerPayoutSchema = SchemaFactory.createForClass(PartnerPayout);
