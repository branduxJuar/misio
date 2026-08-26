import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** Producto de la tienda de canjes (lo configura el admin). */
@Schema({ timestamps: true, collection: 'store_items' })
export class StoreItem {
  @Prop({ required: true, trim: true })
  name: string;

  /** Descripción del producto (tienda tipo carrito). */
  @Prop({ default: '' })
  description: string;

  /** Precio en soles (se paga con saldo Misio o con Yape). */
  @Prop({ required: true, min: 1 })
  priceMisio: number;

  /** Emoji para la card (o imageUrl si se sube foto). */
  @Prop({ default: '🎁' })
  emoji: string;

  @Prop({ default: '' })
  imageUrl: string;

  /** Fotos del producto (subidas por el admin, hasta 4). */
  @Prop({ type: [String], default: [] })
  images: string[];

  /**
   * TIPO DE PRODUCTO:
   * - 'canje': se paga con SALDO DE CANJE (reembolsos Cero Pérdida).
   * - 'venta': venta real — se paga con SALDO CONTABLE (dinero recargado).
   */
  @Prop({ type: String, enum: ['canje', 'venta'], default: 'canje', index: true })
  saleType: 'canje' | 'venta';

  /**
   * ENTREGA DEL PRODUCTO:
   * - 'fisico': se envía a una dirección (requiere datos de envío).
   * - 'virtual': se entrega un código/correo (gift card, recarga).
   */
  @Prop({ type: String, enum: ['fisico', 'virtual'], default: 'fisico', index: true })
  fulfillment: 'fisico' | 'virtual';

  /** Stock disponible. -1 = ilimitado (recargas, gift cards digitales). */
  @Prop({ default: -1 })
  stock: number;

  @Prop({ default: true, index: true })
  active: boolean;
}
export type StoreItemDocument = HydratedDocument<StoreItem>;
export const StoreItemSchema = SchemaFactory.createForClass(StoreItem);

export enum RedemptionStatus {
  PENDING = 'pending', // Canjeado: el admin debe entregarlo/enviarlo
  PROCESSING = 'processing', // El admin está comprando/procesando el pedido
  DELIVERED = 'delivered',
}

/** Línea de una orden (snapshot del producto al momento de comprar). */
@Schema({ _id: false })
class OrderLine {
  @Prop({ type: Types.ObjectId, required: true })
  itemId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true, min: 1 })
  qty: number;
}
const OrderLineSchema = SchemaFactory.createForClass(OrderLine);

/** Orden de la tienda (canje con saldo o compra): el admin la atiende. */
@Schema({ timestamps: true, collection: 'store_redemptions' })
export class Redemption {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'StoreItem', required: true })
  itemId: Types.ObjectId;

  /** Resumen legible: "2× Gift card Rappi, 1× Recarga S/ 15". */
  @Prop({ required: true })
  itemName: string;

  /** Total cobrado. */
  @Prop({ required: true })
  price: number;

  /** Líneas de la orden (carrito). */
  @Prop({ type: [OrderLineSchema], default: [] })
  items: OrderLine[];

  @Prop({ type: String, enum: RedemptionStatus, default: RedemptionStatus.PENDING, index: true })
  status: RedemptionStatus;

  /** Tipo de entrega heredado del producto (para saber qué datos pedir). */
  @Prop({ type: String, enum: ['fisico', 'virtual'], default: 'fisico' })
  fulfillment: 'fisico' | 'virtual';

  /**
   * Datos de entrega que da el usuario al canjear:
   * - físico: dirección, referencia, teléfono.
   * - virtual: correo o dato de contacto donde recibir el código.
   */
  @Prop({
    type: {
      address: String,
      reference: String,
      phone: String,
      email: String,
      note: String,
    },
    default: {},
    _id: false,
  })
  delivery: {
    address?: string;
    reference?: string;
    phone?: string;
    email?: string;
    note?: string;
  };

  /**
   * Código del producto virtual que el admin entrega (gift card, PIN de
   * recarga). Se guarda al marcar entregado y se le muestra al usuario.
   */
  @Prop({ default: '' })
  virtualCode: string;

  /** Evidencia de entrega: capturas/fotos que sube el admin (legal). */
  @Prop({ type: [String], default: [] })
  evidence: string[];

  /** Cuándo se entregó (para el historial). */
  @Prop({ type: Date, default: null })
  deliveredAt: Date | null;

  /** Nota interna del admin sobre la entrega. */
  @Prop({ default: '' })
  deliveryNote: string;
  /** Recibo(s) de la compra subidos por el admin para respaldo financiero. */
  @Prop({ type: [String], default: [] })
  receipts: string[];
}
export type RedemptionDocument = HydratedDocument<Redemption>;
export const RedemptionSchema = SchemaFactory.createForClass(Redemption);
