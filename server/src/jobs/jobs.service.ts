import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
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

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
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
    });
    this.logger.log('Cola misio-jobs conectada a Redis');
  }

  async enqueuePaymentConfirmed(data: PaymentConfirmedJob) {
    if (!this.queue) return false;
    await this.queue.add('payment-confirmed', data, {
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

  private async process(job: Job) {
    if (job.name === 'payment-confirmed') {
      const data = job.data as PaymentConfirmedJob;
      await this.notificationsService.notifyUser(
        data.userId,
        `✅ Tu recarga de S/ ${Number(data.amount).toFixed(2)} fue confirmada y ya está en tu Billetera Misio.`,
        NotificationType.GENERAL,
      );
      if (data.email) await this.mailService.sendPaymentConfirmed(data.email, data.name, Number(data.amount));
      return;
    }
    if (job.name === 'raffle-notification') {
      const data = job.data as RaffleNotificationJob;
      await this.notificationsService.notifyRaffleBuyers(data.raffleId, data.message, data.type);
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
