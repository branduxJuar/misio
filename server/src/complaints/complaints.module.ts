import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Complaint, ComplaintSchema } from './complaint.schema';
import { Counter, CounterSchema } from '../common/counter.schema';
import { ComplaintsController } from './complaints.controller';
import { NotificationsModule } from '../notifications/notifications.module';

/** Libro de Reclamaciones virtual (Ley N° 29571). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Complaint.name, schema: ComplaintSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [ComplaintsController],
})
export class ComplaintsModule {}
