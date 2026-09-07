import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MongooseModule } from '@nestjs/mongoose';
import { InternalMessage, InternalMessageSchema } from './inbox.schema';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: InternalMessage.name, schema: InternalMessageSchema }]),
  ],
  controllers: [InboxController],
  providers: [InboxService],
  exports: [InboxService], // La tienda lo usa para entregar códigos
})
export class InboxModule {}
