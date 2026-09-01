import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Setting, SettingSchema } from './setting.schema';
import { PublicSiteController, PublicSettingsController, SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Setting.name, schema: SettingSchema }]),
    UsersModule,
    TransactionsModule,
    forwardRef(() => TicketsModule),
    NotificationsModule,
  ],
  controllers: [PublicSettingsController, SettingsController, PublicSiteController],
  providers: [SettingsService],
  exports: [SettingsService], // AuthModule aplica el bono al registrar
})
export class SettingsModule {}
