import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum AuctionStatus {
  DRAFT = 'draft', // Creada pero no visible
  SCHEDULED = 'scheduled', // Matrícula abierta, esperando startAt
  LIVE = 'live', // Pujas en tiempo real
  FINISHED = 'finished',
  CANCELLED = 'cancelled',
}

/** Ventana anti-sniping: pujas en los últimos N seg extienden el cierre. */
export const ANTI_SNIPE_WINDOW_MS = 2 * 60 * 1000;
export const ANTI_SNIPE_EXTENSION_MS = 2 * 60 * 1000;

@Schema({ timestamps: true, collection: 'auctions' })
export class Auction {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '🔨' })
  emoji: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  /**
   * MODO:
   *  - 'auto': arranca y cierra sola por reloj (lo de siempre).
   *  - 'moderated': tú conduces — pones el enlace de transmisión y la
   *    sala muestra el video junto a las pujas, como en los sorteos.
   */
  @Prop({ type: String, enum: ['auto', 'moderated'], default: 'auto', index: true })
  mode: 'auto' | 'moderated';

  /** Enlace de transmisión (YouTube/Kick/TikTok/Facebook) — modo moderado. */
  @Prop({ default: '' })
  streamUrl: string;

  /** Precio de partida (primera puja mínima). */
  @Prop({ required: true, min: 1 })
  basePrice: number;

  /** Incremento mínimo entre pujas. */
  @Prop({ required: true, min: 1, default: 5 })
  minIncrement: number;

  /** "Cómpralo ya" (0 = sin opción). */
  @Prop({ default: 0 })
  buyNowPrice: number;

  @Prop({ required: true })
  startAt: Date;

  /** Se EXTIENDE con el anti-sniping. */
  @Prop({ required: true })
  endAt: Date;

  @Prop({ type: String, enum: AuctionStatus, default: AuctionStatus.DRAFT, index: true })
  status: AuctionStatus;

  /** MATRÍCULA: solo los inscritos reciben avisos y entran a pujar. */
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  enrolled: Types.ObjectId[];

  /** Puja líder (su monto está RETENIDO del saldo contable). */
  @Prop({ type: Object, default: null })
  currentBid: { userId: string; name: string; amount: number; at: Date } | null;

  @Prop({ default: 0 })
  bidsCount: number;

  /** Flags de avisos del cron (no duplicar notificaciones). */
  @Prop({ default: false })
  startSoonNotified: boolean;

  @Prop({ default: false })
  startNotified: boolean;

  /** Ganador al finalizar (si hubo pujas). */
  @Prop({ type: Object, default: null })
  winner: { userId: string; name: string; amount: number } | null;
}
export type AuctionDocument = HydratedDocument<Auction>;
export const AuctionSchema = SchemaFactory.createForClass(Auction);

/** Historial de pujas (auditoría + lista en vivo). */
@Schema({ timestamps: true, collection: 'auction_bids' })
export class AuctionBid {
  @Prop({ type: Types.ObjectId, ref: 'Auction', required: true, index: true })
  auctionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;
}
export type AuctionBidDocument = HydratedDocument<AuctionBid>;
export const AuctionBidSchema = SchemaFactory.createForClass(AuctionBid);

/**
 * {status, startAt} / {status, endAt}: el cron corre CADA MINUTO buscando
 * qué arrancar y qué cerrar. Sin índice, cada minuto escanea la colección
 * entera — para siempre.
 */
AuctionSchema.index({ status: 1, startAt: 1 });
AuctionSchema.index({ status: 1, endAt: 1 });
AuctionBidSchema.index({ auctionId: 1, createdAt: -1 });
