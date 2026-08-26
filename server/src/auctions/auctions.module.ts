import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Auction, AuctionBid, AuctionBidSchema, AuctionSchema } from './auction.schema';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';
import { LogisticsERP, LogisticsERPSchema } from '../logistics/logistics.schema';
import { AuctionsService } from './auctions.service';
import { AuctionsController } from './auctions.controller';
import { AuctionsGateway } from './auctions.gateway';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';

/** 🔨 Subastas en tiempo real con retención de dinero real. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Auction.name, schema: AuctionSchema },
      { name: AuctionBid.name, schema: AuctionBidSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: LogisticsERP.name, schema: LogisticsERPSchema },
    ]),
    UsersModule,
    SettingsModule,
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuctionsController],
  providers: [AuctionsService, AuctionsGateway],
})
export class AuctionsModule {}
