import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JobsService } from './jobs.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
