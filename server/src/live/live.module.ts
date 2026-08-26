import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { Raffle, RaffleSchema } from '../raffles/raffle.schema';
import { RafflesModule } from '../raffles/raffles.module';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { LiveController } from './live.controller';
import { LiveGateway } from './live.gateway';
import { LiveService } from './live.service';

/**
 * Módulo del Modo Presentador. Registra su propio JwtModule (misma
 * config que AuthModule) para verificar el token del presentador en
 * el handshake del socket.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Raffle.name, schema: RaffleSchema },
      { name: Ticket.name, schema: TicketSchema },
    ]),
    RafflesModule, // RaffleClosingService: cierre al salir el ganador
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [LiveController],
  providers: [LiveService, LiveGateway],
  exports: [LiveService, LiveGateway], // Iteración 4: el cierre de rifa reusa este servicio
})
export class LiveModule {}
