import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as mongoose from 'mongoose';

export enum TicketStatus {
  ACTIVE = 'active', // Participando en la rifa
  BURNED_AL_AGUA = 'burned_al_agua', // Salió en una tirada "al agua" (no ganadora)
  WINNER = 'winner', // Boleto ganador de la tirada definitiva
}

export interface ITicket {
  userId?: Types.ObjectId;
  raffleId: Types.ObjectId;
  ticketNumber: number;
  status: TicketStatus;
  prizeIndex?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

@Schema({ timestamps: true, collection: 'tickets' })
export class Ticket implements ITicket {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true })
  userId?: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Raffle', required: true, index: true })
  raffleId: Types.ObjectId;

  /** Número visible del boleto (1..totalTickets de la rifa). */
  @Prop({ required: true, min: 1 })
  ticketNumber: number;

  /** Código de numerología ya formateado: "PS5-0042" (prefijo de la rifa). */
  @Prop({ default: '' })
  code: string;

  /**
   * Ciclo de vida del boleto durante la transmisión:
   * active → burned_al_agua (tiradas 1..n-1) | winner (tirada winningAttempt).
   * Los boletos que quedan en 'active' o 'burned_al_agua' al cerrar la rifa
   * disparan el reembolso Cero Pérdida vía TransactionsService.
   */
  @Prop({ type: String, enum: TicketStatus, default: TicketStatus.ACTIVE, index: true })
  status: TicketStatus;

  /** Si el sorteo es tipo PAQUETE, guarda para qué premio se usó este boleto (índice 0, 1, 2...). */
  @Prop({ type: Number, required: false })
  prizeIndex?: number;

  // --- Campos para POS (Punto de Venta / Offline) ---
  @Prop({ type: Boolean, default: false })
  isOffline: boolean;

  @Prop({ type: String, required: false })
  buyerName?: string;

  @Prop({ type: String, required: false })
  buyerPhone?: string;

  @Prop({ type: String, required: false })
  buyerDni?: string;

  @Prop({ type: String, required: false })
  buyerEmail?: string;

  @Prop({ type: String, required: false })
  paymentMethod?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false })
  soldBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export type TicketDocument = HydratedDocument<Ticket>;
export const TicketSchema = SchemaFactory.createForClass(Ticket);

/** Un número de boleto no puede repetirse dentro de la misma rifa. */
TicketSchema.index({ raffleId: 1, ticketNumber: 1 }, { unique: true });

/**
 * ÍNDICES DE CARGA. Cada uno responde a una consulta real del sistema:
 *  - {raffleId, status}: la grilla y el sorteo ("dame los activos de esta
 *    rifa") — sin él, con 50 rifas x 400 boletos son 20k docs escaneados
 *    en CADA giro de tómbola.
 *  - {raffleId, userId}: el límite de boletos por persona, que se valida
 *    dentro de la transacción de compra (ahí el tiempo es oro: bloquea).
 *  - {userId, createdAt}: "Mis boletos", ya ordenado — el índice entrega
 *    el orden y Mongo se ahorra el sort en memoria.
 */
TicketSchema.index({ raffleId: 1, status: 1 });
TicketSchema.index({ raffleId: 1, userId: 1 });
TicketSchema.index({ userId: 1, createdAt: -1 });
