import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromoCode, PromoCodeSchema } from './promocode.schema';
import { PromoCodeUsage, PromoCodeUsageSchema } from './promocode-usage.schema';
import { PromoCodesController } from './promocodes.controller';
import { PromoCodesService } from './promocodes.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PromoCode.name, schema: PromoCodeSchema },
      { name: PromoCodeUsage.name, schema: PromoCodeUsageSchema },
    ]),
  ],
  controllers: [PromoCodesController],
  providers: [PromoCodesService],
  exports: [PromoCodesService],
})
export class PromoCodesModule {}
