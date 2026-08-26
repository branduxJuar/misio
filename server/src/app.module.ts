import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { UsersModule } from './users/users.module';
import { PresenceInterceptor } from './users/presence.interceptor';
import { RafflesModule } from './raffles/raffles.module';
import { TicketsModule } from './tickets/tickets.module';
import { TransactionsModule } from './transactions/transactions.module';
import { LogisticsModule } from './logistics/logistics.module';
import { AuthModule } from './auth/auth.module';
import { LiveModule } from './live/live.module';
import { BingoModule } from './bingo/bingo.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { SettingsModule } from './settings/settings.module';
import { StoreModule } from './store/store.module';
import { InboxModule } from './inbox/inbox.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ComplaintsModule } from './complaints/complaints.module';
import { AccountingModule } from './accounting/accounting.module';
import { CashModule } from './cash/cash.module';
import { AuditModule } from './audit/audit.module';
import { CommonModule } from './common/common.module';
import { MongoSanitizeMiddleware } from './common/mongo-sanitize.middleware';
import { MaintenanceMiddleware } from './common/maintenance.middleware';
import { AuctionsModule } from './auctions/auctions.module';
import { StatsModule } from './stats/stats.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { PromoCodesModule } from './promocodes/promocodes.module';

/**
 * Módulo raíz de Misio.
 * Arquitectura modular: cada dominio de negocio (usuarios, rifas, boletos,
 * billetera, logística) vive en su propio módulo con controlador, servicio
 * y esquema. Esto permite que un dev junior trabaje una feature completa
 * en una rama de Gitflow sin tocar otros dominios.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // Cron de recordatorios (falta 1 día)
    // RATE LIMIT global: frena scrapers y fuerza bruta distribuida.
    // Los endpoints sensibles (login/registro) llevan su propio límite.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
        /**
         * POOL DE CONEXIONES. Por defecto Mongoose abre 100: con varias
         * instancias del servidor, Atlas se queda sin conexiones y empieza
         * a rechazar. 30 por instancia va sobrado (Node es de un solo hilo:
         * las consultas se turnan igual) y deja aire para escalar en
         * horizontal.
         */
        maxPoolSize: Number(config.get('MONGO_POOL_MAX', 30)),
        minPoolSize: Number(config.get('MONGO_POOL_MIN', 5)),
        /** Si la base no responde en 5 s, fallamos rápido en vez de colgar
         *  la petición del usuario 30 s (el default). */
        serverSelectionTimeoutMS: 5_000,
        socketTimeoutMS: 45_000,
      }),
    }),
    AuthModule,
    UsersModule,
    RafflesModule,
    TicketsModule,
    TransactionsModule,
    LogisticsModule,
    LiveModule,
    BingoModule,
    NotificationsModule,
    PaymentsModule,
    SettingsModule,
    StoreModule,
    InboxModule,
    EventEmitterModule.forRoot(),
    ComplaintsModule,
    AccountingModule,
    CashModule,
    AuditModule,
    CommonModule,
    AuctionsModule,
    StatsModule,
    CampaignsModule,
    PromoCodesModule,
  ],
  // El rate limit se aplica a TODA la API (los endpoints sensibles suman
  // su propio @Throttle encima).
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: PresenceInterceptor },
  ],
})
export class AppModule implements NestModule {
  /** El saneador corre ANTES que cualquier controlador, en toda la API. */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MongoSanitizeMiddleware).forRoutes('*');
    consumer.apply(MaintenanceMiddleware).forRoutes('*');
  }
}
