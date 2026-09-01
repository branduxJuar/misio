import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ticket, TicketSchema } from './ticket.schema';
import { Raffle, RaffleSchema } from '../raffles/raffle.schema';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PromoCodesModule } from '../promocodes/promocodes.module';
import { CashModule } from '../cash/cash.module';
import { AuthModule } from '../auth/auth.module';


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: Raffle.name, schema: RaffleSchema }, // Para validar la rifa en la compra
    ]),
    UsersModule, // Descuento de saldo
    TransactionsModule, // Registro en el ledger
    PromoCodesModule,
    CashModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
