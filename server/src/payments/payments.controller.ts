import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post,
  Query, UploadedFile, UseGuards, UseInterceptors, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentsService } from './payments.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payments.dto';
import { evidenceUploadOptions } from '../logistics/upload.config';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { Roles } from '../auth/decorators/roles.decorator';
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Get('methods/all')
  findAllMethods() {
    return this.paymentsService.findAllMethods();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('methods')
  createMethod(@Body() dto: CreatePaymentMethodDto) {
    return this.paymentsService.createMethod(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch('methods/:id')
  updateMethod(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.paymentsService.updateMethod(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Delete('methods/:id')
  removeMethod(@Param('id') id: string) {
    return this.paymentsService.removeMethod(id);
  }

  /** POST /api/v1/payments/methods/:id/qr — subir la imagen del QR. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('methods/:id/qr')
  @UseInterceptors(FileInterceptor('file', evidenceUploadOptions))
  uploadQr(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Falta la imagen del QR (campo "file")');
    return this.paymentsService.setMethodQr(id, `/uploads/${file.filename}`);
  }

  // ── ADMIN: panel dedicado de verificación ────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  /**
   * GET /api/v1/payments/history — depósitos ya resueltos, para volver a
   * ellos y adjuntar el recibo. Filtros: ?status=completed|rejected,
   * ?from=YYYY-MM-DD, ?to=YYYY-MM-DD, ?page, ?limit.
   */
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
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

  @Get('pending')
  findPending() {
    return this.paymentsService.findPending();
  }

  /** Confirmar: acredita saldo + AUTO-COMPRA si venía del carrito. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch(':id/confirm')
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.paymentsService.confirmDeposit(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.paymentsService.rejectDeposit(id);
  }
}
