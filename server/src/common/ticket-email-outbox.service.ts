import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';

export interface TicketEmailJob {
  email: string;
  name: string;
  raffleId: string;
  title: string;
  drawDate: Date | string;
  tickets: string[];
  offline: boolean;
}

export interface TicketEmailOutbox {
  _id: string;
  data: TicketEmailJob;
  status: 'pending' | 'sent' | 'failed';
  createdAt: Date;
  expiresAt?: Date;
  leaseUntil?: Date;
  deliveryAttempts?: number;
  nextDispatchAt?: Date;
}

@Injectable()
export class TicketEmailOutboxService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async recordTicketEmail(id: string, data: TicketEmailJob, session?: ClientSession) {
    await this.connection.db!.collection<TicketEmailOutbox>('ticket_email_outbox')
      .insertOne({ _id: id, data, status: 'pending', createdAt: new Date() }, { session });
  }
}
