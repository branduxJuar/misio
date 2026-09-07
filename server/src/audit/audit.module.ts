import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLog, AuditLogSchema } from './audit.schema';
import { AuditInterceptor } from './audit.interceptor';
import { AuditController } from './audit.controller';

import { UsersModule } from '../users/users.module';

/**
 * Auditoría GLOBAL: el interceptor se engancha a toda la API, así que
 * ningún módulo puede "olvidarse" de registrar sus acciones sensibles.
 */
@Global()
@Module({
  imports: [UsersModule, MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }])],
  controllers: [AuditController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [MongooseModule],
})
export class AuditModule {}
