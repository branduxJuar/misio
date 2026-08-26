import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Redemption, RedemptionSchema, StoreItem, StoreItemSchema } from './store.schema';
import { User, UserSchema } from '../users/user.schema';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { TransactionsModule } from '../transactions/transactions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InboxModule } from '../inbox/inbox.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StoreItem.name, schema: StoreItemSchema },
      { name: Redemption.name, schema: RedemptionSchema },
      { name: User.name, schema: UserSchema },
    ]),
    TransactionsModule, // Cobro del canje vía ledger
    NotificationsModule, // Notif + PushService (exportado)
    InboxModule, // Correo interno para códigos virtuales
    AuthModule, // MailService para correo externo
  ],
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService], // PaymentsService ejecuta el checkout al confirmar Yape
})
export class StoreModule {}
