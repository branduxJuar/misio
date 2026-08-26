import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountingController } from './accounting.controller';
import { User, UserSchema } from '../users/user.schema';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';
import { LogisticsERP, LogisticsERPSchema } from '../logistics/logistics.schema';

/** 💰 Contabilidad: reportes de caja, actividad, pasivos y libro mayor. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: LogisticsERP.name, schema: LogisticsERPSchema },
    ]),
  ],
  controllers: [AccountingController],
})
export class AccountingModule {}
