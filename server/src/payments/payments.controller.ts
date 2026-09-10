import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post,
  Query, UploadedFile, UseGuards, UseInterceptors, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentsService } from './payments.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payments.dto';
import { evidenceUploadOptions } from '../logistics/upload.config';
import { JwtAuthGuard } from '../auth/guards/auth.guards';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser, AuthUser, RequirePerm } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** GET /api/v1/payments/methods — métodos ACTIVOS (los ve el usuario al pagar). */
  @Get('methods')
  findActiveMethods() {
    return this.paymentsService.findActiveMethods();
  }

  // ── ADMIN: configuración de métodos ──────────────────────────────
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('pagos')
  @Get('methods/all')
  findAllMethods() {
    return this.paymentsService.findAllMethods();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('pagos')
  @Post('methods')
  createMethod(@Body() dto: CreatePaymentMethodDto) {
    return this.paymentsService.createMethod(dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('pagos')
  @Patch('methods/:id')
  updateMethod(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.paymentsService.updateMethod(id, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('pagos')
  @Delete('methods/:id')
  removeMethod(@Param('id') id: string) {
    return this.paymentsService.removeMethod(id);
  }

  /** POST /api/v1/payments/methods/:id/qr — subir la imagen del QR. */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('pagos')
  @Post('methods/:id/qr')
  @UseInterceptors(FileInterceptor('file', evidenceUploadOptions))
  uploadQr(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Falta la imagen del QR (campo "file")');
    return this.paymentsService.setMethodQr(id, `/uploads/${file.filename}`);
  }

  // ── ADMIN: panel dedicado de verificación ────────────────────────
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('pagos')
  /**
   * GET /api/v1/payments/history — depósitos ya resueltos, para volver a
   * ellos y adjuntar el recibo. Filtros: ?status=completed|rejected,
   * ?from=YYYY-MM-DD, ?to=YYYY-MM-DD, ?page, ?limit.
   */
  @Get('history')
  history(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentsService.depositHistory({
      status: status as any,
      from,
      to,
      page: Number(page) || 1,
      limit: Number(limit) || 30,
    });
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('pagos')
  @Get('pending')
  findPending() {
    return this.paymentsService.findPending();
  }

  /** Confirmar: acredita saldo + AUTO-COMPRA si venía del carrito. */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('pagos')
  @Patch(':id/confirm')
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.paymentsService.confirmDeposit(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('pagos')
  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.paymentsService.rejectDeposit(id);
  }
}
