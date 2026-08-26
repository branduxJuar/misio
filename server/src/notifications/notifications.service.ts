import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument, NotificationType } from './notification.schema';
import { Ticket, TicketDocument } from '../tickets/ticket.schema';
import { Raffle, RaffleDocument, RaffleStatus } from '../raffles/raffle.schema';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name) private notifModel: Model<NotificationDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(Raffle.name) private raffleModel: Model<RaffleDocument>,
  ) {}

  findByUser(userId: string) {
    return this.notifModel.find({ userId }).sort({ createdAt: -1 }).limit(30).lean();
  }

  markAllRead(userId: string) {
    return this.notifModel.updateMany({ userId, read: false }, { read: true });
  }

  /** Notificación individual (confirmación de pago, auto-compra, etc.). */
  notifyUser(userId: string, message: string, type: NotificationType) {
    return this.notifModel.create({ userId, message, type });
  }

  /** Notifica a TODOS los compradores de una rifa (userIds únicos). */
  async notifyRaffleBuyers(raffleId: string, message: string, type: NotificationType) {
    const userIds: Types.ObjectId[] = await this.ticketModel.distinct('userId', { raffleId });
    if (userIds.length === 0) return { notified: 0 };
    await this.notifModel.insertMany(userIds.map((userId) => ({ userId, message, type })));
    return { notified: userIds.length };
  }

  /**
   * CRON (cada hora): rifas con aviso activado cuyo sorteo cae dentro de
   * las próximas 24h → aviso "falta 1 día" a todos los compradores.
   * El flag dayBeforeNotified evita duplicados entre corridas.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async remindUpcomingDraws() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 3600 * 1000);

    const upcoming = await this.raffleModel.find({
      status: RaffleStatus.ACTIVE,
      notifyDayBefore: true,
      dayBeforeNotified: false,
      drawDate: { $gte: now, $lte: in24h },
    });

    for (const raffle of upcoming) {
      const { notified } = await this.notifyRaffleBuyers(
        raffle._id.toString(),
        `⏰ ¡Falta menos de 1 día! El sorteo de "${raffle.title}" es el ${raffle.drawDate.toLocaleString('es-PE')}. ¡Suerte!`,
        NotificationType.DRAW_REMINDER,
      );
      raffle.dayBeforeNotified = true;
      await raffle.save();
      this.logger.log(`Recordatorio de "${raffle.title}" enviado a ${notified} compradores`);
    }
  }
}
