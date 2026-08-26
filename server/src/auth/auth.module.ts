import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { User, UserSchema } from '../users/user.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { SettingsModule } from '../settings/settings.module';
import { MailService } from './mail.service';
import { Ticket, TicketSchema } from '../tickets/ticket.schema';
import { Transaction, TransactionSchema } from '../transactions/transaction.schema';

/**
 * Módulo de autenticación.
 * JWT_SECRET y JWT_EXPIRES se leen de .env (ver .env.example).
 * JwtStrategy queda registrada globalmente: cualquier módulo puede usar
 * JwtAuthGuard y RolesGuard sin importar nada extra.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    PassportModule,
    SettingsModule, // Bono de bienvenida al registrar
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        // Cast necesario: las tipificaciones nuevas de jsonwebtoken usan
        // el tipo StringValue de 'ms' ("7d", "12h", etc.)
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES', '7d') as `${number}d`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, MailService],
  exports: [MailService, JwtModule, AuthService],
})
export class AuthModule {}
