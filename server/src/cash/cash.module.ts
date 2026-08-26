import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CashRegister, CashRegisterSchema, CashShift, CashShiftSchema, CashMovement, CashMovementSchema } from './cash.schema';
import { CashController } from './cash.controller';
import { CashService } from './cash.service';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';
import { User, UserSchema } from '../users/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CashRegister.name, schema: CashRegisterSchema },
      { name: CashShift.name, schema: CashShiftSchema },
      { name: CashMovement.name, schema: CashMovementSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService],
})
export class CashModule {}
