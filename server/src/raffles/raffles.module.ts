import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Raffle, RaffleSchema } from './raffle.schema';
import { RaffleDossier, RaffleDossierSchema } from './raffle-dossier.schema';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';
import { User, UserSchema } from '../users/user.schema';
import { LogisticsERP, LogisticsERPSchema } from '../logistics/logistics.schema';
import { Partner, PartnerSchema } from '../partners/partner.schema';
import { RafflesController } from './raffles.controller';
import { RafflesService } from './raffles.service';
import { RaffleClosingService } from './raffle-closing.service';
import { SelectionGateway } from './selection.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SettingsModule } from '../settings/settings.module';
import { InboxModule } from '../inbox/inbox.module';
import { CommonModule } from '../common/common.module';
import { JobsModule } from '../jobs/jobs.module';
import { RaffleDossierService } from './raffle-dossier.service';
import { RaffleDossierController } from './raffle-dossier.controller';

@Module({
  imports: [
    SettingsModule,
    InboxModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: Raffle.name, schema: RaffleSchema },
      { name: RaffleDossier.name, schema: RaffleDossierSchema },
      // Modelos usados por el cierre orquestado (bulk refunds + ERP):
      { name: Ticket.name, schema: TicketSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: User.name, schema: UserSchema },
      { name: LogisticsERP.name, schema: LogisticsERPSchema },
      { name: Partner.name, schema: PartnerSchema }, // Para acreditar billetera B2B al cerrar
    ]),
    NotificationsModule, // Avisos de aplazamiento/cancelación a compradores
    TransactionsModule, // Números en proceso de compra (pagos pendientes)
    CommonModule,
    JobsModule,
    JwtModule.registerAsync({
      // Tokens de 5 min para el link público de la lista de boletos
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [RafflesController, RaffleDossierController],
  providers: [RafflesService, RaffleClosingService, SelectionGateway, RaffleDossierService],
  exports: [RafflesService, RaffleClosingService, RaffleDossierService], // LiveModule cierra rifas al salir el ganador
})
export class RafflesModule {}
