import { Global, Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { WsRateLimiter } from './ws-rate-limiter';

/**
 * Piezas transversales: sondas de salud y utilidades compartidas.
 * Global porque el limitador de sockets lo necesitan TODOS los gateways
 * y obligarles a importarlo sería puro ceremonial.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [WsRateLimiter],
  exports: [WsRateLimiter],
})
export class CommonModule {}
