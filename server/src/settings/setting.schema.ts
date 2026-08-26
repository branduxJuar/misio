import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Configuración clave-valor de la plataforma (bono de bienvenida, etc.). */
@Schema({ timestamps: true, collection: 'settings' })
export class Setting {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ type: Object, default: null })
  value: any;
}

export type SettingDocument = HydratedDocument<Setting>;
export const SettingSchema = SchemaFactory.createForClass(Setting);

/** Forma del bono de bienvenida configurable desde el admin. */
export interface WelcomeBonusConfig {
  enabled: boolean;
  type: 'credit' | 'ticket';
  creditAmount: number; // Si type=credit: soles que se acreditan
  raffleId: string | null; // Si type=ticket: rifa donde se regala el boleto
}

export const EMAIL_VERIFICATION_KEY = 'email_verification';
export const WELCOME_BONUS_KEY = 'welcome_bonus';
export const REFUND_PERCENTAGE_KEY = 'refund_percentage';

export const DEFAULT_WELCOME_BONUS: WelcomeBonusConfig = {
  enabled: false,
  type: 'credit',
  creditAmount: 5,
  raffleId: null,
};
