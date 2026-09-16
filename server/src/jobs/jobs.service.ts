import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { TicketEmailJob, TicketEmailOutbox } from '../common/ticket-email-outbox.service';
import { MailService } from '../auth/mail.service';
import { NotificationType } from '../notifications/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';

export interface PaymentConfirmedJob {
  userId: string;
  email?: string;
  name: string;
  amount: number;
}

export interface RaffleNotificationJob {
  raffleId: string;
  message: string;
  type: NotificationType;
}

export interface PaymentEmailJob {
  email: string;
  name: string;
  amount: number;
}

export interface CampaignEmailJob {
  email: string;
  name: string;
  subject: string;
  message: string;
  promoCode?: string;
}


@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private queue?: Queue;
  private worker?: Worker;
  private dispatcher?: ReturnType<typeof setInterval>;
  private dispatching = false;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    await this.outbox().createIndex({ status: 1, nextDispatchAt: 1, createdAt: 1 });
    await this.outbox().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    this.dispatcher = setInterval(() => { void this.dispatchTicketEmails(); }, 5000);
    this.dispatcher.unref();
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log('REDIS_URL no definido: las tareas secundarias seguirán en modo directo');
      return;
    }
    const connection = { url } as any;
    this.queue = new Queue('misio-jobs', { connection });
    this.worker = new Worker(
      'misio-jobs',
      async (job) => this.process(job),
      { connection, concurrency: 5 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.name ?? 'desconocido'} falló: ${error.message}`);
      if (job?.name === 'ticket-email' && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void this.outbox().updateOne({ _id: job.data.id, status: 'pending' }, { $set: { status: 'failed' } })
          .catch(() => this.logger.error('Could not persist failed email status'));
      }
    });
    this.queue.on('error', () => this.logger.warn('Job queue temporarily unavailable'));
    this.worker.on('error', () => this.logger.warn('Job worker temporarily unavailable'));
    this.logger.log('Cola misio-jobs configurada');
  }

  private outbox() { return this.connection.db!.collection<TicketEmailOutbox>('ticket_email_outbox'); }

  private async dispatchTicketEmails() {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const pending = await this.outbox().find({ status: 'pending',
        $or: [{ nextDispatchAt: { $exists: false } }, { nextDispatchAt: { $lte: new Date() } }],
      }).sort({ createdAt: 1 }).limit(100).toArray();
      for (const record of pending) {
        if (!this.queue) {
          const claimed = await this.outbox().findOneAndUpdate({
            _id: record._id, status: 'pending',
            $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: new Date() } }],
          }, { $set: { leaseUntil: new Date(Date.now() + 120_000) }, $inc: { deliveryAttempts: 1 } }, { returnDocument: 'after' });
          if (!claimed) continue;
          try {
            await this.process({ name: 'ticket-email', data: { id: record._id, ...record.data } } as Job);
          } catch {
            await this.outbox().updateOne({ _id: record._id, status: 'pending' }, { $set: {
              status: (claimed.deliveryAttempts ?? 0) >= 10 ? 'failed' : 'pending',
              leaseUntil: new Date(Date.now() + 30_000),
            } });
          }
          continue;
        }
        await this.queue.add('ticket-email', { id: record._id, ...record.data }, {
          jobId: `ticket-mail-${record._id}`, attempts: 10,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000, removeOnFail: 5000,
        });
        // Revisit dispatched jobs periodically for recovery without starving newer mail.
        await this.outbox().updateOne({ _id: record._id, status: 'pending' },
          { $set: { nextDispatchAt: new Date(Date.now() + 60_000) } });
      }
    } catch { this.logger.warn('Ticket email delivery pending; retained in MongoDB'); }
    finally { this.dispatching = false; }
  }

  async enqueuePaymentConfirmed(data: PaymentConfirmedJob) {
    const notificationQueued = await this.enqueuePaymentNotification(data);
    const emailQueued = data.email ? await this.enqueuePaymentEmail({ email: data.email, name: data.name, amount: data.amount }) : true;
    return notificationQueued && emailQueued;
  }

  async enqueuePaymentNotification(data: PaymentConfirmedJob) {
    if (!this.queue) return false;
    await this.queue.add('payment-notification', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return true;
  }

  async enqueuePaymentEmail(data: PaymentEmailJob) {
    if (!this.queue) return false;
    await this.queue.add('payment-email', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return true;
  }

  async enqueueRaffleNotification(data: RaffleNotificationJob) {
    if (!this.queue) return false;
    await this.queue.add('raffle-notification', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return true;
  }

  async enqueueCampaignEmail(data: CampaignEmailJob) {
    if (!this.queue) return false;
    await this.queue.add('campaign-email', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return true;
  }

  private async process(job: Job) {
    if (job.name === 'ticket-email') {
      const data = job.data as TicketEmailJob & { id: string };
      const record = await this.outbox().findOne({ _id: data.id });
      if (!record || record.status === 'sent') return;
      const send = data.offline ? this.mailService.sendOfflineSaleTickets.bind(this.mailService)
        : this.mailService.sendTicketPurchaseConfirmation.bind(this.mailService);
      await send(data.email, data.name, data.raffleId, data.title, new Date(data.drawDate), data.tickets);
      await this.outbox().updateOne({ _id: data.id }, { $set: {
        status: 'sent', expiresAt: new Date(Date.now() + 30 * 86400_000),
      } });
      return;
    }
    if (job.name === 'payment-notification') {
      const data = job.data as PaymentConfirmedJob;
      await this.notificationsService.notifyUser(
        data.userId,
        `✅ Tu recarga de S/ ${Number(data.amount).toFixed(2)} fue confirmada y ya está en tu Billetera Misio.`,
        NotificationType.GENERAL,
      );
      return;
    }
    if (job.name === 'payment-email') {
      const data = job.data as PaymentEmailJob;
      await this.mailService.sendPaymentConfirmed(data.email, data.name, Number(data.amount));
      return;
    }
    if (job.name === 'campaign-email') {
      const data = job.data as CampaignEmailJob;
      await this.mailService.sendCampaignEmail(data.email, data.name, data.subject, data.message, data.promoCode);
      return;
    }
    if (job.name === 'raffle-notification') {
      const data = job.data as RaffleNotificationJob;
      await this.notificationsService.notifyRaffleBuyers(data.raffleId, data.message, data.type);
    }
  }

  async onModuleDestroy() {
    clearInterval(this.dispatcher);
    await this.worker?.close();
    await this.queue?.close();
  }
}
