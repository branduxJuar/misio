import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatsController } from './stats.controller';
import { User, UserSchema } from '../users/user.schema';
import { Raffle, RaffleSchema } from '../raffles/raffle.schema';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';
import { Redemption, RedemptionSchema } from '../store/store.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Raffle.name, schema: RaffleSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Redemption.name, schema: RedemptionSchema },
    ]),
  ],
  controllers: [StatsController],
})
export class StatsModule {}
