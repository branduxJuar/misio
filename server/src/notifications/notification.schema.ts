import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum NotificationType {
  DRAW_REMINDER = 'draw_reminder', // "Falta 1 día para el sorteo"
  RAFFLE_POSTPONED = 'raffle_postponed',
  RAFFLE_CANCELLED = 'raffle_cancelled',
  GENERAL = 'general',
}

/** Notificación in-app (futuro: espejo por WhatsApp/SMS con Twilio). */
@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  message: string;

  @Prop({ type: String, enum: NotificationType, default: NotificationType.GENERAL })
  type: NotificationType;

  @Prop({ default: false, index: true })
  read: boolean;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);

/** {userId, read, createdAt}: la campanita — pocas no leídas entre miles. */
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
