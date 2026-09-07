import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from './audit.schema';
import { JwtAuthGuard } from '../auth/guards/auth.guards';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePerm } from '../auth/decorators/roles.decorator';

/**
 * Consulta de la bitácora — protegido con el permiso de 'usuarios'.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('usuarios')
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
