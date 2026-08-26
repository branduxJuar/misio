import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';

/**
 * 📬 CORREO INTERNO — mensajes que el admin envía al usuario dentro del
 * sistema. Su uso principal: entregar códigos de productos virtuales
 * (gift cards, recargas) de forma segura y registrada, sin depender solo
 * del correo externo. El usuario los ve en su cuenta.
 */
@Schema({ timestamps: true, collection: 'internal_messages' })
export class InternalMessage {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  body: string;

  /**
   * Tipo del mensaje:
   * - 'code': entrega de código virtual (se resalta y es copiable).
   * - 'info': aviso general.
   */
  @Prop({ type: String, enum: ['code', 'info'], default: 'info' })
  kind: 'code' | 'info';

  /** El código en sí (para productos virtuales), copiable aparte. */
  @Prop({ default: '' })
  code: string;

  /** Referencia opcional al canje que originó el mensaje. */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Redemption', default: null })
  redemptionId: Types.ObjectId | null;

  @Prop({ default: false, index: true })
  read: boolean;
}
export type InternalMessageDocument = HydratedDocument<InternalMessage>;
export const InternalMessageSchema = SchemaFactory.createForClass(InternalMessage);
