import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum RaffleStatus {
  ACTIVE = 'active', // Venta de boletos abierta
  LIVE = 'live', // Transmisión en vivo (Modo Presentador)
  COMPLETED = 'completed', // Ganador asignado, pasa a LogisticsERP
  CANCELLED = 'cancelled', // Rifa estropeada → dinero devuelto a todos
}

/** Formato del sorteo. */
export enum DrawMode {
  DIRECT = 'direct', // La primera tirada es la ganadora
  AL_AGUA = 'al_agua', // N-1 tiradas "al agua" antes de la ganadora
}

export enum RaffleType {
  NORMAL = 'normal',
  PAQUETE = 'paquete', // Múltiples premios independientes
}

@Schema({ _id: false })
export class Prize {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: String, enum: DrawMode, default: DrawMode.AL_AGUA })
  drawMode: DrawMode;

  @Prop({ required: true, min: 1, default: 3 })
  winningAttempt: number;

  @Prop({ type: Object, default: null })
  winner: {
    ticketNumber: number;
    code?: string;
    name: string;
    userId: string;
    drawnAt: string;
  } | null;
}
const PrizeSchema = SchemaFactory.createForClass(Prize);

/** Registro de cada aplazamiento (auditoría + aviso a compradores). */
@Schema({ _id: false })
class Postponement {
  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  oldDate: Date;

  @Prop({ required: true })
  newDate: Date;

  @Prop({ default: () => new Date() })
  at: Date;
}
const PostponementSchema = SchemaFactory.createForClass(Postponement);

@Schema({ timestamps: true, collection: 'raffles' })
export class Raffle {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: String, enum: RaffleType, default: RaffleType.NORMAL })
  type: RaffleType;

  /** Si es tipo PAQUETE, esta lista contiene los premios individuales. */
  @Prop({ type: [PrizeSchema], default: [] })
  prizes: Prize[];

  /**
   * NUMEROLOGÍA: prefijo del boleto. Con prefix "PS5" y totalTickets 100,
   * los boletos van de PS5-0001 a PS5-0100. El padding se calcula según
   * la cantidad (100 → 4 dígitos mínimo, 20000 → 5).
   */
  @Prop({ required: true, uppercase: true, trim: true, match: /^[A-Z0-9]{2,6}$/ })
  ticketPrefix: string;

  /** Fotos del producto (URLs de /uploads, subidas por el admin). */
  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ required: true, min: 1 })
  ticketPrice: number;

  @Prop({ required: true, min: 10 })
  totalTickets: number;

  /**
   * ESCALA: boletos vendidos, mantenido con $inc DENTRO de la misma
   * transacción de compra (si la compra falla, no queda contado).
   *
   * Antes la vitrina hacía $lookup de TODOS los boletos de cada rifa solo
   * para contarlos: con 400 boletos por rifa y miles de visitas, la
   * portada leía cientos de miles de documentos por minuto. Ahora el dato
   * ya vive en la rifa y la portada no toca la colección de boletos.
   * `recountSold()` permite volver a la verdad si alguna vez se desvía.
   */
  @Prop({ default: 0, min: 0 })
  soldCount: number;

  /** direct = gana la primera tirada; al_agua = hay tiradas de suspenso. */
  @Prop({ type: String, enum: DrawMode, default: DrawMode.AL_AGUA })
  drawMode: DrawMode;

  /**
   * Tirada ganadora. En modo direct SIEMPRE es 1. En al_agua, N significa
   * que las tiradas 1..N-1 se queman ("al agua") y la N gana.
   */
  @Prop({ required: true, min: 1, default: 3 })
  winningAttempt: number;

  /**
   * GANADOR (snapshot al cerrar): queda grabado EN la rifa para
   * mostrarse sin joins — número, código, nombre enmascarable y userId.
   */
  @Prop({ type: Object, default: null })
  winner: {
    ticketNumber: number;
    code?: string;
    name: string;
    userId: string;
    drawnAt: string;
  } | null;

  /** DELIMITADOR: máximo de boletos que UNA persona puede acumular aquí. */
  @Prop({ default: 10, min: 1 })
  maxTicketsPerUser: number;

  /** Fecha/hora programada del sorteo. */
  @Prop({ required: true })
  drawDate: Date;

  /** Si está activo, el cron avisa a todos los compradores 1 día antes. */
  @Prop({ default: true })
  notifyDayBefore: boolean;

  /** Candado del cron: evita mandar el aviso de "falta 1 día" dos veces. */
  @Prop({ default: false })
  dayBeforeNotified: boolean;

  /** Historial de aplazamientos (motivo + fechas). */
  @Prop({ type: [PostponementSchema], default: [] })
  postponements: Postponement[];

  /** URL de embed (YouTube Live / Kick / TikTok Live) para LiveDrawRoom. */
  @Prop({ default: '' })
  streamUrl: string;

  @Prop({ type: String, enum: RaffleStatus, default: RaffleStatus.ACTIVE, index: true })
  status: RaffleStatus;

  /**
   * Candado de idempotencia de reembolsos (cierre normal O cancelación).
   * Ver RaffleClosingService.
   */
  @Prop({ default: false })
  refundsProcessed: boolean;
}

export type RaffleDocument = HydratedDocument<Raffle>;
export const RaffleSchema = SchemaFactory.createForClass(Raffle);

/** Padding de la numerología: PS5-0001 (mínimo 4 dígitos, crece si hace falta). */
export function formatTicketCode(prefix: string, n: number, totalTickets: number): string {
  const digits = Math.max(4, String(totalTickets).length);
  return `${prefix}-${String(n).padStart(digits, '0')}`;
}

/**
 * {status, drawDate}: la portada pide "rifas activas ordenadas por fecha
 * de sorteo". Es la consulta más ejecutada de todo el sistema: la corre
 * cada visitante, esté logueado o no.
 */
RaffleSchema.index({ status: 1, drawDate: 1 });
