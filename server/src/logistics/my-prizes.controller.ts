import { Controller, Get, UseGuards } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { JwtAuthGuard } from '../auth/guards/auth.guards';
import { AuthUser, CurrentUser } from '../auth/decorators/roles.decorator';

/**
 * 🎁 MIS PREMIOS (usuario) — GET /api/v1/my-prizes
 *
 * Deliberadamente FUERA del controlador del ERP: ese es territorio del
 * administrador (@Roles(ADMIN) a nivel de clase) y colgar aquí una ruta
 * de usuario obligaría a recordar un override por método — la clase de
 * detalle que un día se olvida y abre el inventario entero.
 *
 * El servicio decide qué se devuelve: nunca el costo de compra ni la
 * boleta del proveedor (información interna del negocio).
 */
@UseGuards(JwtAuthGuard)
@Controller('my-prizes')
export class MyPrizesController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.logisticsService.findMine(user.userId);
  }
}
