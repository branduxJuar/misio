import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LogisticsERP, LogisticsERPSchema } from './logistics.schema';
import { Raffle, RaffleSchema } from '../raffles/raffle.schema';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { LogisticsController } from './logistics.controller';
import { MyPrizesController } from './my-prizes.controller';
import { LogisticsService } from './logistics.service';
import { InboxModule } from '../inbox/inbox.module';

@Module({
  imports: [
    InboxModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: LogisticsERP.name, schema: LogisticsERPSchema },
      { name: Raffle.name, schema: RaffleSchema },
      { name: Ticket.name, schema: TicketSchema },
    ]),
  ],
  controllers: [LogisticsController, MyPrizesController],
  providers: [LogisticsService],
})
export class LogisticsModule {}
