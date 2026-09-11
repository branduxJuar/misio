import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type IdempotencyDocument = HydratedDocument<IdempotencyRecord>;

@Schema({ timestamps: true, collection: 'idempotency_keys' })
export class IdempotencyRecord {
  @Prop({ required: true }) scope: string;
  @Prop({ required: true }) key: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId: Types.ObjectId;
  @Prop({ required: true, enum: ['processing', 'completed'] }) status: 'processing' | 'completed';
  @Prop({ type: Object, default: null }) response?: Record<string, any> | null;
}

export const IdempotencySchema = SchemaFactory.createForClass(IdempotencyRecord);
IdempotencySchema.index({ scope: 1, key: 1, userId: 1 }, { unique: true });
