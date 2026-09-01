import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Raffle, RaffleDocument, RaffleStatus } from './raffle.schema';
import { Ticket, TicketDocument, TicketStatus } from '../tickets/ticket.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
} from '../transactions/transaction.schema';
import { User, UserDocument } from '../users/user.schema';
import { LogisticsERP, LogisticsERPDocument } from '../logistics/logistics.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../notifications/push.service';
import { MailService } from '../auth/mail.service';
import { NotificationType } from '../notifications/notification.schema';
import { SettingsService } from '../settings/settings.service';
import { InboxService } from '../inbox/inbox.service';

/** Resumen del cierre, emitido por socket y devuelto por el endpoint. */
export interface ClosingSummary {
  raffleTitle: string;
  winner: { userId: string; name: string; ticketNumber: number };
  refundedUsers: number;
  refundedTickets: number;
  refundedTotal: number;
}

/**
 * CIERRE ORQUESTADO DE RIFA — el corazón del modelo Cero Pérdida.
 *
 * Cuando sale el boleto ganador:
 *   1. Reclama el candado `refundsProcessed` (atómico → idempotente).
 *   2. Agrupa los boletos perdedores POR USUARIO y reembolsa en bulk:
 *      un usuario con 3 boletos perdedores recibe UNA transacción de
 *      3 × ticketPrice (menos ruido en su ledger, menos queries).
 *   3. Asigna el winnerId al registro ERP (activa el flujo logístico).
 *
 * Si algo falla a mitad, el candado se libera para poder reintentar con
 * POST /raffles/:id/close (admin).
 */
@Injectable()
export class RaffleClosingService {
  private readonly logger = new Logger(RaffleClosingService.name);

  constructor(
    @InjectModel(Raffle.name) private raffleModel: Model<RaffleDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(LogisticsERP.name) private erpModel: Model<LogisticsERPDocument>,
    private readonly notifService: NotificationsService,
    private readonly mailService: MailService,
    private readonly pushService: PushService,
    private readonly settingsService: SettingsService,
    private readonly inboxService: InboxService,
  ) {}

  async closeRaffle(raffleId: string): Promise<ClosingSummary> {
    // 1. Reclamar el candado: solo UN proceso puede cerrar esta rifa
    const raffle = await this.raffleModel.findOneAndUpdate(
      { _id: raffleId, status: RaffleStatus.COMPLETED, refundsProcessed: { $ne: true } },
      { refundsProcessed: true },
      { new: true },
    );
    if (!raffle) {
      const exists = await this.raffleModel.findById(raffleId).lean();
      if (!exists) throw new NotFoundException('Rifa no existe');
      throw new BadRequestException(
        exists.status !== RaffleStatus.COMPLETED
          ? 'La rifa aún no tiene ganador (debe estar en status completed)'
          : 'El cierre ya fue procesado: los reembolsos no se duplican',
      );
    }

    try {
      const raffleOid = new Types.ObjectId(raffleId);
      const ridMatch: any = { $in: [raffleOid, String(raffleOid)] };

      const winnersToProcess: any[] = [];
      if (raffle.type === 'paquete' && raffle.prizes && raffle.prizes.length > 0) {
        for (let i = 0; i < raffle.prizes.length; i++) {
          const prize = raffle.prizes[i];
          if (prize.winner) {
            winnersToProcess.push({
              title: prize.title,
              userId: prize.winner.userId, // string
              name: prize.winner.name,
              ticketNumber: prize.winner.ticketNumber,
              prizeIndex: i
            });
          }
        }
      } else {
        const winnerTicket = await this.ticketModel
          .findOne({ raffleId: ridMatch, status: TicketStatus.WINNER })
          .populate('userId', 'name');
          
        let wUserId: any, wName: string, wTicketNumber: number, wPhone: string;
        if (winnerTicket) {
          wUserId = (winnerTicket.userId as any)?._id?.toString() || winnerTicket.userId?.toString();
          wName = (winnerTicket.userId as any)?.name ?? winnerTicket.buyerName ?? '—';
          wPhone = (winnerTicket.userId as any)?.phone ?? winnerTicket.buyerPhone ?? '';
          wTicketNumber = winnerTicket.ticketNumber;
        } else if (raffle.winner && raffle.winner.userId) {
          wUserId = raffle.winner.userId;
          wName = raffle.winner.name ?? '—';
          wPhone = '';
          wTicketNumber = raffle.winner.ticketNumber;
        } else {
          throw new BadRequestException('No hay boleto ganador registrado');
        }
        
        winnersToProcess.push({
          title: raffle.title,
          userId: wUserId,
          name: wName,
          phone: typeof wPhone !== 'undefined' ? wPhone : '',
          ticketNumber: wTicketNumber
        });
      }

      if (winnersToProcess.length === 0) {
        throw new BadRequestException('No hay ganadores registrados para procesar');
      }

      const winnerUserIds = winnersToProcess.map(w => w.userId ? new Types.ObjectId(w.userId) : null).filter(Boolean);

      // 2. Agrupar boletos perdedores POR USUARIO
      // Mantenemos el $nin por optimización, pero reforzamos con un filter posterior
      // para garantizar que ningún ganador reciba devolución bajo ninguna circunstancia.
      let groups: { _id: Types.ObjectId; count: number }[] =
        await this.ticketModel.aggregate([
          {
            $match: {
              raffleId: ridMatch,
              userId: { $nin: winnerUserIds, $ne: null },
              status: { $in: [TicketStatus.ACTIVE, TicketStatus.BURNED_AL_AGUA] },
            },
          },
          { $group: { _id: '$userId', count: { $sum: 1 } } },
        ]);

      // FILTRO ESTRICTO POST-AGREGACIÓN: Si por algún problema de tipado (String vs ObjectId) 
      // el $nin de Mongo falló, aquí los depuramos sí o sí comparando los strings hexadecimales.
      if (winnerUserIds.length > 0) {
        const winnerHex = winnerUserIds.map(w => w!.toString());
        groups = groups.filter(g => !winnerHex.includes(g._id.toString()));
      }

      let refundedTickets = 0;
      let refundedTotal = 0;

      if (groups.length > 0) {
        const refundPct = await this.settingsService.getRefundPercentage();
        const refundMultiplier = refundPct / 100;

        // Ledger: una transacción de reembolso por usuario
        // 🎁 Cashback alimenta el SALDO DE CANJE (no el contable):
        // solo compra artículos marcados como CANJE en la tienda.
        await this.txModel.insertMany(
          groups.map((g) => ({
            userId: g._id,
            amount: (raffle.ticketPrice * g.count) * refundMultiplier,
            type: TransactionType.CERO_PERDIDA_REFUND,
            status: TransactionStatus.COMPLETED,
            wallet: 'canje',
          })),
        );

        // Billeteras: incrementos masivos en un solo round-trip y registro de tramos
        const expirationDays = Number(process.env.CANJE_EXPIRATION_DAYS || 20);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expirationDays);

        await this.userModel.bulkWrite(
          groups.map((g) => {
            const amount = (raffle.ticketPrice * g.count) * refundMultiplier;
            return {
              updateOne: {
                filter: { _id: g._id },
                update: {
                  $inc: { walletCanje: amount },
                  $push: {
                    canjeTranches: {
                      amount,
                      originalAmount: amount,
                      expiresAt,
                      source: raffle.title,
                      createdAt: new Date(),
                    },
                  },
                },
              },
            };
          }),
        );

        refundedTickets = groups.reduce((sum, g) => sum + g.count, 0);
        refundedTotal = groups.reduce((sum, g) => sum + ((raffle.ticketPrice * g.count) * refundMultiplier), 0);
      }

      // 3. El ERP recibe al ganador → arranca el flujo logístico.
      // 3. El ERP recibe a los ganadores → arranca el flujo logístico.
      for (const w of winnersToProcess) {
        const erpFilter: any = { raffleId: raffleOid };
        if (w.prizeIndex !== undefined) erpFilter.prizeIndex = w.prizeIndex;

        await this.erpModel.findOneAndUpdate(
          erpFilter,
          {
            winnerId: w.userId ? new Types.ObjectId(w.userId.toString()) : null,
            offlineWinnerName: !w.userId ? w.name : undefined,
            offlineWinnerPhone: !w.userId ? w.phone : undefined,
            $setOnInsert: {
              productName: w.title,
              purchaseCost: 0,
              deliveryStatus: 'in_stock',
            },
            $push: {
              history: {
                label: w.userId
                  ? `🏆 Sorteo finalizado. El ganador oficial es ${w.name} con el boleto #${w.ticketNumber}. El premio pasa a estado En Almacén, listo para ser despachado a su cuenta.`
                  : `🏆 Sorteo finalizado. El boleto ganador (#${w.ticketNumber}) pertenece a una Venta Externa a nombre de ${w.name}. Al no tener cuenta registrada, debes contactarlo(a) por teléfono para coordinar la entrega.`,
                at: new Date(),
              },
            },
          },
          { upsert: true },
        );

        // Correo + PUSH + Bandeja Interna al ganador.
        try {
          if (w.userId) {
            const winnerUser = await this.userModel.findById(w.userId);
            if (winnerUser?.email) {
              await this.mailService.sendWinnerNotification(
                winnerUser.email, winnerUser.name, w.title, raffle.title,
              );
            }
            await this.pushService.sendToUser(
              w.userId.toString(),
              '🏆 ¡Ganaste!',
              `Ganaste "${w.title}". Entra para ver tu premio.`,
              '/mi-cuenta',
            );
            await this.inboxService.send({
              userId: w.userId.toString(),
              subject: `🏆 ¡Felicitaciones, ganaste ${w.title}!`,
              body: `¡Eres el ganador de "${w.title}" en el sorteo "${raffle.title}" con tu boleto N° ${w.ticketNumber}! Puedes revisar el estado de tu entrega aquí mismo en tu pestaña "Mis premios y envíos". Nos contactaremos contigo pronto para coordinar el despacho.`,
              kind: 'info',
            });
          }
        } catch { /* el aviso nunca rompe el cierre */ }
      }

      // 4. Resumen
      // Solo devolvemos info del PRIMER ganador por simplicidad en el WebSocket de cierre,
      // la UI principal mostrará todo el paquete.
      const firstWinner = winnersToProcess[0];
      const summary: ClosingSummary = {
        raffleTitle: raffle.title,
        winner: {
          userId: firstWinner.userId ? firstWinner.userId.toString() : null,
          name: firstWinner.name,
          ticketNumber: firstWinner.ticketNumber,
        },
        refundedUsers: groups.length,
        refundedTickets,
        refundedTotal,
      };

      this.logger.log(
        `Rifa "${raffle.title}" cerrada: ${refundedTickets} boletos → S/ ${refundedTotal} devueltos a ${groups.length} usuarios`,
      );
      return summary;
    } catch (err) {
      // Liberar el candado para permitir reintento manual (POST /raffles/:id/close)
      await this.raffleModel.updateOne({ _id: raffleId }, { refundsProcessed: false });
      this.logger.error(`Cierre de rifa ${raffleId} falló, candado liberado`, err);
      throw err;
    }
  }

  /**
   * RIFA ESTROPEADA → CANCELAR Y DEVOLVER TODO.
   * Reembolsa TODOS los boletos (sin importar su estado) agrupados por
   * usuario, marca la rifa 'cancelled' y notifica a cada comprador con
   * el motivo. Usa el mismo candado refundsProcessed: imposible duplicar.
   */
  async cancelRaffle(raffleId: string, reason: string) {
    const raffle = await this.raffleModel.findOneAndUpdate(
      {
        _id: raffleId,
        status: { $in: [RaffleStatus.ACTIVE, RaffleStatus.LIVE] },
        refundsProcessed: false,
      },
      { refundsProcessed: true, status: RaffleStatus.CANCELLED },
      { new: true },
    );
    if (!raffle) {
      throw new BadRequestException('La rifa no existe, ya terminó o ya fue cancelada');
    }

    try {
      const raffleOid = new Types.ObjectId(raffleId);

      // TODOS los boletos, agrupados por usuario
      const groups: { _id: Types.ObjectId; count: number }[] =
        await this.ticketModel.aggregate([
          { $match: { raffleId: raffleOid } },
          { $group: { _id: '$userId', count: { $sum: 1 } } },
        ]);

      let refundedTotal = 0;
      if (groups.length > 0) {
        await this.txModel.insertMany(
          groups.map((g) => ({
            userId: g._id,
            amount: raffle.ticketPrice * g.count,
            type: TransactionType.RAFFLE_CANCELLED_REFUND,
            status: TransactionStatus.COMPLETED,
            wallet: 'contable', // Pagaron con dinero real → vuelve como real
          })),
        );
        await this.userModel.bulkWrite(
          groups.map((g) => ({
            updateOne: {
              filter: { _id: g._id },
              update: { $inc: { walletBalance: raffle.ticketPrice * g.count } },
            },
          })),
        );
        refundedTotal = groups.reduce((s, g) => s + g.count, 0) * raffle.ticketPrice;
      }

      const { notified } = await this.notifService.notifyRaffleBuyers(
        raffleId,
        `❌ La rifa "${raffle.title}" fue cancelada. Motivo: ${reason}. El valor COMPLETO de tus boletos ya está de vuelta en tu Billetera Misio.`,
        NotificationType.RAFFLE_CANCELLED,
      );

      this.logger.warn(
        `Rifa "${raffle.title}" CANCELADA: S/ ${refundedTotal} devueltos a ${groups.length} usuarios. Motivo: ${reason}`,
      );
      return { refundedUsers: groups.length, refundedTotal, notified, reason };
    } catch (err) {
      // Liberar candado y restaurar estado para reintento
      await this.raffleModel.updateOne(
        { _id: raffleId },
        { refundsProcessed: false, status: RaffleStatus.ACTIVE },
      );
      throw err;
    }
  }
}
