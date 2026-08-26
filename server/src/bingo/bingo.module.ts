import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { BingoCard, BingoCardSchema, BingoRoom, BingoRoomSchema } from './bingo.schema';
import { BingoController } from './bingo.controller';
import { BingoGateway } from './bingo.gateway';
import { BingoService } from './bingo.service';

/**
 * Bingo social v2: juego GRATIS entre usuarios registrados. Salas con
 * código compartible, el anfitrión canta, el sistema detecta el BINGO.
 * Sin admin, sin créditos, sin premios del sistema.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BingoRoom.name, schema: BingoRoomSchema },
      { name: BingoCard.name, schema: BingoCardSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [BingoController],
  providers: [BingoService, BingoGateway],
})
export class BingoModule {}
