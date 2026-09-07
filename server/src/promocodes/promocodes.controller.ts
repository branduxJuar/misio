import { Body, Controller, Get, Post, UseGuards, Param, Query } from '@nestjs/common';
import { PromoCodesService } from './promocodes.service';
import { JwtAuthGuard } from '../auth/guards/auth.guards';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuthUser, CurrentUser, RequirePerm } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';
import { CreatePromocodeDto, ValidateCodeDto } from './dto/promocodes.dto';

@Controller('promocodes')
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('marketing')
  @Get()
  findAll() {
    return this.promoCodesService.findAll();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('marketing')
  @Post()
  create(@Body() body: CreatePromocodeDto) {
    return this.promoCodesService.create(body);
  }

  /**
   * Endpoint público (para usuarios autenticados) para validar un código en vivo
   * antes de enviar un formulario (ej. al escribir el código en Yape).
   */
  @UseGuards(JwtAuthGuard)
  @Post('validate')
  validateCode(@CurrentUser() user: AuthUser, @Body() body: ValidateCodeDto) {
    return this.promoCodesService.validate(body.code, user.userId, body.type);
  }
}
