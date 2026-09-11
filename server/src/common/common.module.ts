import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import { WsRateLimiter } from './ws-rate-limiter';
import { PrivateFilesController } from './private-files.controller';
import { IdempotencyRecord, IdempotencySchema } from './idempotency.schema';
import { IdempotencyService } from './idempotency.service';
import { DistributedLockService } from './distributed-lock.service';
import { RealtimeStateService } from './realtime-state.service';

/**
 * Piezas transversales: sondas de salud y utilidades compartidas.
 * Global porque el limitador de sockets lo necesitan TODOS los gateways
 * y obligarles a importarlo sería puro ceremonial.
 */
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: IdempotencyRecord.name, schema: IdempotencySchema }])],
  controllers: [HealthController, PrivateFilesController],
  providers: [WsRateLimiter, IdempotencyService, DistributedLockService, RealtimeStateService],
  exports: [WsRateLimiter, IdempotencyService, DistributedLockService, RealtimeStateService],
})
export class CommonModule {}
