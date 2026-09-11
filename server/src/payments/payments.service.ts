import { User, UserDocument } from '../users/user.schema';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaymentMethod, PaymentMethodDocument } from './payment-method.schema';
import { Raffle, RaffleDocument, formatTicketCode } from '../raffles/raffle.schema';
import { Ticket, TicketDocument } from '../tickets/ticket.schema';
import { TransactionStatus } from '../transactions/transaction.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { MailService } from '../auth/mail.service';
import { TicketsService } from '../tickets/tickets.service';
import { StoreService } from '../store/store.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.schema';
import { LiveGateway } from '../live/live.gateway';
import { CashService } from '../cash/cash.service';
import { IdempotencyService } from '../common/idempotency.service';
import { JobsService } from '../jobs/jobs.service';

/**
 * SPRINT 3 — Orquestador de pagos.
 * Une las piezas: métodos de pago configurables (QR del admin),
 * verificación de depósitos y AUTO-COMPRA de la intención del carrito.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  /** Historial de depósitos resueltos (delegado en el módulo contable). */
  async depositHistory(opts: {
    status?: TransactionStatus;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const result = await this.txService.depositHistory(opts);

    // Enriquecer con los números de tickets formateados (e.g. MOTO-001)
    const raffleIds = new Set<string>();
    for (const tx of result.items as any[]) {
      if (tx.meta?.raffleId) {
        raffleIds.add(String(tx.meta.raffleId));
      }
    }

    if (raffleIds.size > 0) {
      const raffles = await this.raffleModel.find({ _id: { $in: Array.from(raffleIds) } }).lean();
      const raffleMap = new Map(raffles.map((r) => [r._id.toString(), r]));

      for (const tx of result.items as any[]) {
        if (tx.meta?.raffleId && Array.isArray(tx.meta?.ticketNumbers)) {
          const r = raffleMap.get(String(tx.meta.raffleId));
          tx.meta.formattedTickets = tx.meta.ticketNumbers.map((n: number) =>
            r ? formatTicketCode(r.ticketPrefix, n, r.totalTickets) : `#${n}`,
          );
        }
      }
    }

    return result;
  }

  constructor(
    @InjectModel(PaymentMethod.name) private methodModel: Model<PaymentMethodDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Raffle.name) private raffleModel: Model<RaffleDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    private readonly txService: TransactionsService,
    private readonly ticketsService: TicketsService,
    private readonly storeService: StoreService,
    private readonly notifService: NotificationsService,
    private readonly mailService: MailService,
    private readonly liveGateway: LiveGateway,
    private readonly cashService: CashService,
    private readonly idempotencyService: IdempotencyService,
    private readonly jobsService: JobsService,
  ) {}

  // ── Métodos de pago ─────────────────────────────────────────────
  /** Solo activos: lo que ve el usuario al recargar/pagar. */
  findActiveMethods() {
    return this.methodModel.find({ active: true }).sort({ createdAt: 1 }).lean();
  }

  findAllMethods() {
    return this.methodModel.find().sort({ createdAt: 1 }).lean();
  }

  createMethod(data: Partial<PaymentMethod>) {
    return this.methodModel.create(data);
  }

  async updateMethod(id: string, data: Partial<PaymentMethod>) {
    const doc = await this.methodModel.findByIdAndUpdate(id, data, { new: true });
    if (!doc) throw new NotFoundException('Método de pago no existe');
    return doc;
  }

  async removeMethod(id: string) {
    const doc = await this.methodModel.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('Método de pago no existe');
    return { deleted: true };
  }

  async setMethodQr(id: string, qrImageUrl: string) {
    return this.updateMethod(id, { qrImageUrl });
  }

  // ── Verificación de depósitos ───────────────────────────────────
  async findPending() {
    const pending: any[] = await this.txService.findPendingDeposits();
    if (!pending.length) return pending;

    // Recopilar IDs de rifas en las intenciones de compra
    const raffleIds = new Set<string>();
    for (const tx of pending) {
      if (tx.meta?.raffleId && tx.meta?.ticketNumbers?.length) {
        raffleIds.add(String(tx.meta.raffleId));
      }
    }

    const raffleMap = new Map<string, any>();
    const soldTicketsInfoMap = new Map<string, any>(); // key: raffleId_number => info

    if (raffleIds.size > 0) {
      const idArray = Array.from(raffleIds);
      const objectIds = idArray.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
      const matchArray: any[] = [...idArray, ...objectIds];

      const raffles = await this.raffleModel.find({ _id: { $in: matchArray } }).lean();
      for (const r of raffles) {
        raffleMap.set(r._id.toString(), r);
      }

      // Buscar boletos YA VENDIDOS en estas rifas
      const soldTickets = await this.ticketModel
        .find({ raffleId: { $in: matchArray } })
        .populate('userId', 'name dni')
        .lean();

      for (const t of soldTickets) {
        const rIdStr = t.raffleId.toString();
        const key = `${rIdStr}_${t.ticketNumber}`;
        soldTicketsInfoMap.set(key, {
          ticketNumber: t.ticketNumber,
          code: t.code || `#${t.ticketNumber}`,
          userName: (t.userId as any)?.name ?? 'Usuario',
          userDni: (t.userId as any)?.dni ?? '—',
          status: t.status,
        });
      }
    }

    // Analizar conflictos y enriquecer cada transacción pendiente
    for (let i = 0; i < pending.length; i++) {
      const tx = pending[i];
      const meta = tx.meta || {};
      const raffleId = meta.raffleId ? String(meta.raffleId) : null;
      const numbers: number[] = Array.isArray(meta.ticketNumbers) ? meta.ticketNumbers : [];

      if (raffleId && numbers.length > 0) {
        const raffle = raffleMap.get(raffleId);
        const totalTickets = raffle?.totalTickets || 1000;
        const prefix = raffle?.ticketPrefix || 'TICK';

        const formattedTickets = numbers.map((n) =>
          raffle ? formatTicketCode(prefix, n, totalTickets) : `#${n}`,
        );

        // 1. Verificar si ya fue comprado por alguien en base de datos (sold)
        const conflictsWithSold: any[] = [];
        for (const n of numbers) {
          const key = `${raffleId}_${n}`;
          if (soldTicketsInfoMap.has(key)) {
            conflictsWithSold.push(soldTicketsInfoMap.get(key));
          }
        }

        // 2. Verificar conflicto con OTROS usuarios en la cola de pendientes (simultáneo)
        const conflictsWithPending: any[] = [];
        for (let j = 0; j < pending.length; j++) {
          if (i === j) continue;
          const otherTx = pending[j];
          const otherMeta = otherTx.meta || {};
          const otherRaffleId = otherMeta.raffleId ? String(otherMeta.raffleId) : null;
          if (otherRaffleId === raffleId && Array.isArray(otherMeta.ticketNumbers)) {
            const otherUser = otherTx.userId || {};
            for (const n of numbers) {
              if (otherMeta.ticketNumbers.includes(n)) {
                conflictsWithPending.push({
                  ticketNumber: n,
                  formatted: raffle ? formatTicketCode(prefix, n, totalTickets) : `#${n}`,
                  userName: otherUser.name || 'Otro usuario',
                  userDni: otherUser.dni || '—',
                });
              }
            }
          }
        }

        tx.intentDetails = {
          type: 'raffle',
          raffleId,
          raffleTitle: raffle?.title || 'Rifa no identificada',
          ticketNumbers: numbers,
          formattedTickets,
          hasConflict: conflictsWithSold.length > 0 || conflictsWithPending.length > 0,
          conflictsWithSold,
          conflictsWithPending,
        };
      } else if (meta.storeItems && meta.storeItems.length > 0) {
        tx.intentDetails = {
          type: 'store',
          summary: `${meta.storeItems.length} producto(s) de tienda`,
        };
      } else {
        tx.intentDetails = {
          type: 'wallet',
          summary: 'Recarga libre',
        };
      }
    }

    return pending;
  }

  /**
   * CONFIRMAR PAGO (operador verificó el Yape):
   * 1. Acredita el saldo (doble confirmación protegida en TransactionsService).
   * 2. Si el depósito traía INTENCIÓN DE COMPRA (carrito de una rifa),
   *    intenta comprar esos números automáticamente con el saldo recién
   *    acreditado. Si alguien los ganó mientras tanto, el saldo queda
   *    intacto en la billetera y se le avisa para que elija otros.
   * 3. Notifica al usuario el resultado en ambos casos.
   */
  async confirmDeposit(txId: string, adminId: string, idempotencyKey?: string) {
    const claim = await this.idempotencyService.claim('payments.confirm', idempotencyKey, adminId);
    if (claim?.kind === 'replay') return claim.response;
    try {
      const result = await this.confirmDepositOnce(txId, adminId);
      if (claim?.kind === 'new') await this.idempotencyService.complete(claim.id, result as any);
      return result;
    } catch (error) {
      if (claim?.kind === 'new') await this.idempotencyService.fail(claim.id);
      throw error;
    }
  }

  private async confirmDepositOnce(txId: string, adminId: string) {
    // REQUISITO RELAJADO: Se intenta vincular a un turno de caja si existe, pero no bloquea si no lo hay.
    const shift = await this.cashService.getActiveShift(adminId);
    // if (!shift) {
    //   throw new Error('NO_ACTIVE_SHIFT'); // El frontend lo capturará
    // }

    const tx = await this.txService.confirmDeposit(txId, shift?.id);
    if (!tx) throw new Error('La transacción confirmada no fue encontrada');
    const userId = tx.userId.toString();

    const user = await this.userModel.findById(userId).select('name email').lean();
    const paymentJob = {
      userId,
      email: user?.email,
      name: user?.name ?? 'Usuario',
      amount: Number(tx.amount ?? 0),
    };
    const hasTicketIntent = Boolean(tx.meta?.raffleId && tx.meta?.ticketNumbers?.length);
    // Una compra iniciada desde el carrito no es una recarga: esperamos a
    // completar la compra para enviar el comprobante correcto.
    if (!hasTicketIntent) {
      const notificationQueued = await this.jobsService.enqueuePaymentNotification(paymentJob);
      const emailQueued = user?.email
        ? await this.jobsService.enqueuePaymentEmail({ email: user.email, name: user.name ?? 'Usuario', amount: paymentJob.amount })
        : true;
      if (!notificationQueued) {
        try {
          await this.notifService.notifyUser(
            userId,
            `✅ Tu recarga de S/ ${Number(tx.amount ?? 0).toFixed(2)} fue confirmada y ya está en tu Billetera Misio.`,
            NotificationType.GENERAL,
          );
        } catch { /* la notificación nunca bloquea el abono */ }
      }
      if (!emailQueued && user?.email) {
        try { await this.mailService.sendPaymentConfirmed(user.email, user.name ?? 'Usuario', paymentJob.amount); }
        catch { /* el correo nunca bloquea el abono */ }
      }
    }

    let autoPurchase: 'ok' | 'failed' | null = null;
    let detail = '';

    // Intención de TIENDA: ejecutar el checkout con el saldo recién acreditado
    const storeItems = tx.meta?.storeItems as { itemId: string; qty: number }[] | undefined;
    if (storeItems?.length) {
      try {
        const order = await this.storeService.checkout(userId, storeItems);
        autoPurchase = 'ok';
        detail = order.itemName;
      } catch (err: any) {
        autoPurchase = 'failed';
        detail = err.message ?? 'Checkout falló';
        await this.notifService.notifyUser(
          userId,
          `⚠️ Tu pago se confirmó y el saldo está en tu billetera, pero la compra de la tienda falló: ${detail}. Vuelve a intentar desde la tienda — tu saldo te espera.`,
          NotificationType.GENERAL,
        );
      }
      return { tx, autoPurchase, detail };
    }

    const intentRaffle = tx.meta?.raffleId;
    const intentNumbers = tx.meta?.ticketNumbers;
    if (intentRaffle && intentNumbers?.length) {
      try {
        const result = await this.ticketsService.purchase(userId, intentRaffle, {
          ticketNumbers: intentNumbers,
          fromPendingConfirmation: true, // Su propio pago pendiente ERA la reserva
        });
        autoPurchase = 'ok';
        detail = result!.tickets.map((t: any) => t.code || `#${t.ticketNumber}`).join(', ');
        await this.notifService.notifyUser(
          userId,
          `🎟️ ¡Compra automática exitosa! Tus números: ${detail}. Suerte en el sorteo.`,
          NotificationType.GENERAL,
        );
        try { this.liveGateway.notifySold(String(intentRaffle), intentNumbers); } catch { /* ignore ws err */ }
      } catch (err: any) {
        autoPurchase = 'failed';
        detail = err.message ?? 'Números no disponibles';
        await this.notifService.notifyUser(
          userId,
          `⚠️ Tu pago se confirmó y el saldo está en tu billetera, pero la compra automática falló: ${detail}. Entra a la rifa y elige tus números — tu saldo te espera.`,
          NotificationType.GENERAL,
        );
        // El saldo sí fue confirmado, pero la compra no pudo completarse:
        // en este caso sí corresponde informar la recarga acreditada.
        if (user?.email) {
          this.mailService.sendPaymentConfirmed(user.email, user.name ?? 'Usuario', paymentJob.amount)
            .catch(() => {});
        }
        try { this.liveGateway.notifyReleased(String(intentRaffle), intentNumbers); } catch { /* ignore ws err */ }
      }
      this.logger.log(`Auto-compra tras depósito ${txId}: ${autoPurchase} (${detail})`);
    }

    return { tx, autoPurchase, detail };
  }

  async rejectDeposit(txId: string) {
    const tx = await this.txService.rejectDeposit(txId);
    const intentRaffle = tx.meta?.raffleId;
    const intentNumbers = tx.meta?.ticketNumbers;
    if (intentRaffle && intentNumbers?.length) {
      try { this.liveGateway.notifyReleased(String(intentRaffle), intentNumbers); } catch { /* ignore ws err */ }
    }
    await this.notifService.notifyUser(
      tx.userId.toString(),
      `❌ Tu recarga de S/ ${tx.amount.toFixed(2)} fue rechazada (el pago no se encontró o el monto no coincide). Si crees que es un error, contáctanos con tu N° de operación.`,
      NotificationType.GENERAL,
    );
    return tx;
  }
}
