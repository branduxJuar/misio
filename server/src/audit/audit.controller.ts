import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from './audit.schema';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';

/**
 * Consulta de la bitácora — SOLO el administrador. Ni siquiera con el
 * permiso 'usuarios' basta: quien vigila no debería ser vigilable por
 * sus vigilados.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(@InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLog>) {}

  @Get()
  async list(
    @Query('module') module?: string,
    @Query('actor') actor?: string,
    @Query('limit') limit = '200',
  ) {
    const filter: Record<string, unknown> = {};
    if (module) filter.module = module;
    if (actor) filter.actorId = actor;
    return this.auditModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(500, Number(limit) || 200))
      .lean();
  }
}
