import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Campaign, CampaignSchema } from './campaign.schema';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { InboxModule } from '../inbox/inbox.module';
import { PromoCodesModule } from '../promocodes/promocodes.module';
import { User, UserSchema } from '../users/user.schema';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: User.name, schema: UserSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    InboxModule,
    PromoCodesModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
