import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
} from './transaction.schema';
import { UsersService } from '../users/users.service';
import { PromoCodesService } from '../promocodes/promocodes.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
    private readonly usersService: UsersService,
    private readonly promoCodesService: PromoCodesService,
  ) {}

  /**
   * Historial de movimientos de la billetera (UserDashboard).
   * PAGINADO: sin techo, una cuenta con miles de movimientos devolvía un
   * JSON enorme que además el móvil tenía que renderizar entero.
   */
  async findByUser(userId: string, page = 1, limit = 50) {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
    const safePage = Math.max(1, Number(page) || 1);
    const [items, total] = await Promise.all([
      this.txModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      this.txModel.countDocuments({ userId }),
    ]);
    return { items, total, page: safePage, limit: safeLimit, hasMore: safePage * safeLimit < total };
  }

  /**
   * Números "EN PROCESO DE COMPRA" de una rifa: los que viajan como
   * intención en depósitos PENDIENTES. La grilla los pinta en ámbar y
   * bloquea su selección; si el pago se rechaza, se liberan solos
   * (la consulta es en vivo, no hay reserva que limpiar).
   */
  async pendingNumbersForRaffle(raffleId: string): Promise<number[]> {
    const ids: any[] = [raffleId];
    try {
      if (Types.ObjectId.isValid(raffleId)) {
        ids.push(new Types.ObjectId(raffleId));
      }
    } catch { /* ignore */ }

    const pending = await this.txModel
      .find({
        type: TransactionType.DEPOSIT_YAPE,
        status: TransactionStatus.PENDING,
        'meta.raffleId': { $in: ids },
      })
      .select('meta.ticketNumbers')
      .lean();
    const nums = new Set<number>();
    for (const tx of pending) {
      const tickets = tx.meta?.ticketNumbers;
      if (Array.isArray(tickets)) {
        for (const n of tickets) {
          if (typeof n === 'number') nums.add(n);
          else if (typeof n === 'string' && !isNaN(Number(n))) nums.add(Number(n));
        }
      }
    }
    return [...nums].sort((a, b) => a - b);
  }

  async findById(id: string) {
    const tx = await this.txModel.findById(id).lean();
    if (!tx) throw new NotFoundException('Transacción no existe');
    return tx;
  }

  /** Adjunta el comprobante (imagen/PDF) al depósito. */
  async attachReceipt(id: string, receiptUrl: string) {
    const tx = await this.txModel.findByIdAndUpdate(
      id,
      { $set: { 'meta.receiptUrl': receiptUrl } },
      { new: true },
    );
    if (!tx) throw new NotFoundException('Transacción no existe');
    return tx;
  }

  /** Depósitos Yape/Plin esperando confirmación del operador (panel admin). */
  findPendingDeposits() {
    return this.txModel
      .find({ type: TransactionType.DEPOSIT_YAPE, status: TransactionStatus.PENDING })
      .populate('userId', 'name dni phone')
      .sort({ createdAt: 1 }) // Los más antiguos primero (orden de atención)
      .lean();
  }

  /**
   * Crea la transacción y, si nace completada, impacta el saldo del usuario.
   * Acepta ClientSession para participar en la transacción de compra de
   * boletos (TicketsService.purchase).
   */
  /**
   * ⚠️ ESTE MÉTODO MUEVE DINERO, no solo registra.
   *
   * Si `status` es COMPLETED, además de escribir el asiento contable
   * aplica el importe a la billetera del usuario (`adjustWallet`). Es la
   * ÚNICA puerta por la que se mueve saldo en el sistema: quien la llama
   * NO debe llamar a `adjustWallet` por su cuenta.
   *
   * (Esa duplicación causó el bug del doble cobro en la compra de
   * boletos: cobraba en la compra y otra vez al escribir el asiento.)
   *
   * Con `status` PENDING solo se registra: el saldo no se toca hasta que
   * un operador confirme (ver `confirmDeposit`).
   */
  async create(
    data: {
      userId: string;
      amount: number;
      type: TransactionType;
      status?: TransactionStatus;
      meta?: Record<string, any> | null;
      wallet?: 'contable' | 'canje';
    },
    session?: ClientSession,
  ) {
    const [tx] = await this.txModel.create([data], { session });
    if (tx.status === TransactionStatus.COMPLETED && tx.type !== TransactionType.OFFLINE_SALE) {
      await this.usersService.adjustWallet(data.userId, data.amount, session, data.wallet ?? 'contable');
    }
    return tx;
  }

  /** Obtiene el gasto total acumulado en el mes calendario en curso para Autocontrol. */
  async getMonthlySpend(userId: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const txs = await this.txModel.find({
      userId,
      amount: { $lt: 0 },
      status: TransactionStatus.COMPLETED,
      createdAt: { $gte: startOfMonth },
    }).lean();
    return txs.reduce((acc, curr) => acc + Math.abs(curr.amount), 0);
  }

  /**
   * HISTORIAL DE DEPÓSITOS ya resueltos (confirmados o rechazados).
   * Es donde el administrador vuelve a un pago viejo para adjuntarle su
   * recibo: la pantalla de "pendientes" los pierde de vista apenas los
   * aprueba, y el comprobante casi nunca se emite en ese mismo segundo.
   */
  async depositHistory(opts: {
    status?: TransactionStatus;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(1, Number(opts.limit) || 30), 100);
    const page = Math.max(1, Number(opts.page) || 1);

    const filter: Record<string, unknown> = {
      type: { $in: [TransactionType.DEPOSIT_YAPE, TransactionType.OFFLINE_SALE] },
      // Resueltos = confirmados o rechazados (los pendientes viven en su
      // propia pantalla)
      status: opts.status ?? { $in: [TransactionStatus.COMPLETED, TransactionStatus.FAILED] },
    };
    if (opts.from || opts.to) {
      filter.createdAt = {
        ...(opts.from ? { $gte: new Date(opts.from) } : {}),
        ...(opts.to ? { $lte: new Date(`${opts.to}T23:59:59.999`) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.txModel
        .find(filter)
        .populate('userId', 'name dni phone email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.txModel.countDocuments(filter),
    ]);
    return { items, total, page, limit, hasMore: page * limit < total };
  }

  /**
   * El operador verificó el Yape en su app → confirma el depósito.
   * findOneAndUpdate con filtro de status 'pending' garantiza que una
   * doble confirmación (dos admins a la vez) NO acredite el saldo dos veces.
   */
  async confirmDeposit(txId: string, shiftId?: string) {
    const tx = await this.txModel.findOneAndUpdate(
      { _id: txId, status: TransactionStatus.PENDING, type: TransactionType.DEPOSIT_YAPE },
      { status: TransactionStatus.COMPLETED, shiftId },
      { new: true },
    );
    if (!tx) {
      throw new BadRequestException('Depósito no existe, ya fue procesado o no es un depósito');
    }
    
    let finalAmount = tx.amount;
    try {
      if (tx.meta?.promoCode && tx.meta?.promoValue) {
        // Calcular el bono (promoValue es porcentaje)
        const bonus = tx.amount * (tx.meta.promoValue / 100);
        finalAmount += bonus;
        // Registrar el uso del código promocional
        await this.promoCodesService.apply(tx.meta.promoCode, tx.userId.toString(), tx._id.toString());
      }

      await this.usersService.adjustWallet(tx.userId.toString(), finalAmount);
    } catch (err) {
      // Si el abono falla, el depósito NO puede quedar "completado":
      // se revierte a pendiente para que el operador reintente.
      await this.txModel.updateOne(
        { _id: tx._id },
        { status: TransactionStatus.PENDING },
      );
      throw new BadRequestException(
        'No se pudo acreditar el saldo (el depósito sigue PENDIENTE — reintenta): ' +
          ((err as any).message ?? ''),
      );
    }
    return tx;
  }

  /** Yape no llegó / monto no coincide → rechazado, sin tocar el saldo. */
  async rejectDeposit(txId: string) {
    const tx = await this.txModel.findOneAndUpdate(
      { _id: txId, status: TransactionStatus.PENDING },
      { status: TransactionStatus.FAILED },
      { new: true },
    );
    if (!tx) throw new NotFoundException('Depósito no existe o ya fue procesado');
    return tx;
  }

  /**
   * Núcleo del modelo Cero Pérdida: al completarse una rifa, cada boleto
   * perdedor genera un reembolso automático a la Billetera Misio.
   * (Se orquesta masivamente en la Iteración 4 — cierre de rifa.)
   */
  refundCeroPerdida(userId: string, ticketPrice: number, session?: ClientSession) {
    return this.create(
      {
        userId,
        amount: ticketPrice, // Positivo: entra a la billetera
        type: TransactionType.CERO_PERDIDA_REFUND,
        status: TransactionStatus.COMPLETED,
      },
      session,
    );
  }
}
