import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Método de pago configurable por el Super Admin (Sprint 3).
 * Ej: "Yape" con el QR de la cuenta del negocio, número y titular.
 * El usuario ve el QR al recargar; el operador verifica en su app.
 */
@Schema({ timestamps: true, collection: 'payment_methods' })
export class PaymentMethod {
  /** Nombre visible: Yape, Plin, Transferencia BCP, etc. */
  @Prop({ required: true, trim: true })
  name: string;

  /** Número de celular o cuenta destino. */
  @Prop({ required: true, trim: true })
  accountNumber: string;

  /** Titular que verá el usuario al pagar (debe coincidir con el QR). */
  @Prop({ default: '' })
  holderName: string;

  /** Imagen del QR (subida por el admin a /uploads). */
  @Prop({ default: '' })
  qrImageUrl: string;

  /** Instrucciones extra: "Yapea el monto EXACTO y guarda el N° de operación". */
  @Prop({ default: '' })
  instructions: string;

  /** Solo los activos se muestran al usuario. */
  @Prop({ default: true, index: true })
  active: boolean;
}

export type PaymentMethodDocument = HydratedDocument<PaymentMethod>;
export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);
