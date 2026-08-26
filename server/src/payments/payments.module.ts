import { User, UserSchema } from '../users/user.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { PaymentMethod, PaymentMethodSchema } from './payment-method.schema';
import { Raffle, RaffleSchema } from '../raffles/raffle.schema';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TransactionsModule } from '../transactions/transactions.module';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StoreModule } from '../store/store.module';
import { LiveModule } from '../live/live.module';
import { CashModule } from '../cash/cash.module';

/**
 * Orquestador de pagos (Sprint 3). Evita dependencias circulares:
 * Tickets usa Transactions; este módulo usa a AMBOS por encima.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: PaymentMethod.name, schema: PaymentMethodSchema },
      { name: Raffle.name, schema: RaffleSchema },
      { name: Ticket.name, schema: TicketSchema },
    ]),
    AuthModule,
    TransactionsModule,
    TicketsModule,
    NotificationsModule,
    StoreModule,
    LiveModule,
    CashModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
