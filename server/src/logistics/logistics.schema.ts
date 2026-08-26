import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum DeliveryStatus {
  IN_STOCK = 'in_stock', // Premio comprado, en almacén de Misio
  TRANSIT = 'transit', // Enviado con courier (Olva, Shalom, etc.)
  DELIVERED = 'delivered', // Entregado con evidencia fotográfica
}

export interface IShippingDetails {
  courier: string;
  trackingNumber: string;
  destinationCity?: string;
}

export interface ILogisticsERP {
  raffleId: Types.ObjectId;
  productName: string;
  purchaseCost: number;
  receiptFileUrl: string;
  winnerId: Types.ObjectId | null;
  shippingDetails: IShippingDetails;
  deliveryStatus: DeliveryStatus;
  evidencePhotoUrl: string;
  offlineWinnerName?: string;
  offlineWinnerPhone?: string;
}

/** Sub-documento de envío (sin _id propio: vive dentro del registro ERP). */
@Schema({ _id: false })
class ShippingDetails implements IShippingDetails {
  /** Courier nacional: Olva Courier, Shalom, Marvisur, etc. */
  @Prop({ default: '' })
  courier: string;

  @Prop({ default: '' })
  trackingNumber: string;

  /** Ciudad/provincia destino (envíos a nivel nacional). */
  @Prop({ default: '' })
  destinationCity: string;
}
const ShippingDetailsSchema = SchemaFactory.createForClass(ShippingDetails);

/**
 * Entrada de la bitácora del premio. Cada hito relevante (compra, ganador
 * asignado, guía registrada, entrega) agrega una entrada — es la fuente
 * del Timeline en el panel admin.
 */
@Schema({ _id: false })
class HistoryEntry {
  @Prop({ required: true })
  label: string;

  @Prop({ default: () => new Date() })
  at: Date;
}
const HistoryEntrySchema = SchemaFactory.createForClass(HistoryEntry);

/**
 * Registro ERP por premio. Es la fuente de verdad para:
 * - Margen financiero: ingresos de la rifa (boletos) − purchaseCost.
 * - Auditoría: boleta/factura de compra del premio (receiptFileUrl).
 * - Tracking del envío al ganador y evidencia de entrega.
 */
@Schema({ timestamps: true, collection: 'logistics_erp' })
export class LogisticsERP {
  @Prop({ type: Types.ObjectId, ref: 'Raffle', required: true, index: true })
  raffleId: Types.ObjectId;

  /** Índice del premio si es un sorteo PAQUETE (0, 1, 2...). undefined si es NORMAL. */
  @Prop({ type: Number, required: false })
  prizeIndex?: number;

  @Prop({ required: true, trim: true })
  productName: string;

  /** Costo real de compra del premio (para calcular margen neto). */
  @Prop({ required: true, min: 0 })
  purchaseCost: number;

  /** URL de la boleta/factura escaneada (S3, Cloudinary, etc.). */
  @Prop({ default: '' })
  receiptFileUrl: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  winnerId: Types.ObjectId | null;

  @Prop({ type: String, required: false })
  offlineWinnerName?: string;

  @Prop({ type: String, required: false })
  offlineWinnerPhone?: string;

  @Prop({ type: ShippingDetailsSchema, default: {} })
  shippingDetails: ShippingDetails;

  @Prop({ type: String, enum: DeliveryStatus, default: DeliveryStatus.IN_STOCK, index: true })
  deliveryStatus: DeliveryStatus;

  /** Foto del ganador recibiendo el premio (prueba social + auditoría). */
  @Prop({ default: '' })
  evidencePhotoUrl: string;

  /** Bitácora del premio: alimenta el Timeline del panel admin. */
  @Prop({ type: [HistoryEntrySchema], default: [] })
  history: HistoryEntry[];
}

export type LogisticsERPDocument = HydratedDocument<LogisticsERP>;
export const LogisticsERPSchema = SchemaFactory.createForClass(LogisticsERP);

/** Una rifa NORMAL tiene un solo envío (prizeIndex no existe), pero una PAQUETE tiene uno por prizeIndex. */
LogisticsERPSchema.index(
  { raffleId: 1, prizeIndex: 1 },
  { unique: true, partialFilterExpression: { prizeIndex: { $exists: true } } }
);

/** El tablero del ERP filtra por estado y ordena por fecha. */
LogisticsERPSchema.index({ status: 1, createdAt: -1 });
