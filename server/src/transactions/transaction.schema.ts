import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as mongoose from 'mongoose';

export enum TransactionType {
  DEPOSIT_YAPE = 'deposit_yape', // Recarga vía Yape/Plin/PagoEfectivo
  TICKET_PURCHASE = 'ticket_purchase', // Compra de boleto (egreso)
  CERO_PERDIDA_REFUND = 'cero_perdida_refund', // Devolución del boleto perdedor (ingreso)
  MARKETPLACE_PURCHASE = 'marketplace_purchase', // Canje en la tienda interna (egreso)
  RAFFLE_CANCELLED_REFUND = 'raffle_cancelled_refund', // Rifa cancelada: devolución total (ingreso)
  WELCOME_BONUS = 'welcome_bonus', // Bono de bienvenida configurable (ingreso)
  AUCTION_PAYMENT = 'auction_payment', // Ganaste la subasta: se consume la retención (egreso)
  OFFLINE_SALE = 'offline_sale', // Venta Externa (ingreso físico, figurativo en historial)
}

export enum TransactionStatus {
  PENDING = 'pending', // Ej: Yape aún no confirmado por el operador
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface ITransaction {
  userId: Types.ObjectId;
  amount: number;
  type: TransactionType;
  status: TransactionStatus;
}

/**
 * Libro mayor (ledger) de la Billetera Misio.
 * Regla de oro: User.walletBalance es SIEMPRE la suma de sus transacciones
 * completadas. Nunca se edita el saldo sin crear una transacción — esto es
 * lo que hace auditable el modelo Cero Pérdida.
 */
@Schema({ timestamps: true, collection: 'transactions' })
export class Transaction implements ITransaction {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /**
   * Monto en soles. Positivo = ingreso a la billetera (depósito, reembolso),
   * negativo = egreso (compra de boleto, canje en marketplace).
   */
  @Prop({ required: true })
  amount: number;

  @Prop({ type: String, enum: TransactionType, required: true, index: true })
  type: TransactionType;

  @Prop({ type: String, enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  /** Billetera afectada: contable (dinero real) o canje (Cero Pérdida). */
  @Prop({ type: String, enum: ['contable', 'canje'], default: 'contable' })
  wallet: 'contable' | 'canje';

  /** Shift/Turno de Caja que procesó (aprobó) esta transacción, si aplica. */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'CashShift' })
  shiftId?: Types.ObjectId;

  /**
   * Metadata del depósito (Sprint 3):
   * - methodName / operationNumber: qué método usó y su N° de operación
   *   Yape (para que el operador verifique rápido).
   * - raffleId + ticketNumbers: INTENCIÓN DE COMPRA — si el depósito nació
   *   desde el carrito de una rifa, al confirmarse se intenta comprar
   *   esos números automáticamente.
   */
  @Prop({ type: Object, default: null })
  meta: {
    methodName?: string;
    operationNumber?: string;
    raffleId?: string;
    ticketNumbers?: number[];
    storeItems?: { itemId: string; qty: number }[];
    itemName?: string;
    promoCode?: string;
    promoValue?: number;
  } | null;
}

export type TransactionDocument = HydratedDocument<Transaction>;
export const TransactionSchema = SchemaFactory.createForClass(Transaction);

/**
 * ÍNDICES DE CARGA:
 *  - {userId, createdAt}: el historial del usuario, ya ordenado.
 *  - {type, status, createdAt}: la cola de depósitos por verificar
 *    (la pantalla que más abre el operador).
 *  - {status, createdAt}: contabilidad por rango de fechas.
 * Esta colección solo crece: sin índices, el panel se vuelve más lento
 * cada mes que pasa.
 */
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, status: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
