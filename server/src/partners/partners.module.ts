import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';
import { Partner, PartnerSchema } from './partner.schema';
import { PartnerPayout, PartnerPayoutSchema } from './partner-payout.schema';
import { Raffle, RaffleSchema } from '../raffles/raffle.schema';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Partner.name, schema: PartnerSchema },
      { name: PartnerPayout.name, schema: PartnerPayoutSchema },
      { name: Raffle.name, schema: RaffleSchema },
    ]),
    UsersModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
