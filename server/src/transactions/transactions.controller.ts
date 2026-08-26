import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Param, Query,
  Patch, Post, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { receiptUploadOptions } from '../logistics/upload.config';
import { TransactionsService } from './transactions.service';
import { CreateDepositDto } from './dto/transaction.dto';
import { TransactionStatus } from './transaction.schema';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';
import { PromoCodesService } from '../promocodes/promocodes.service';
import { PromoCodeType } from '../promocodes/promocode.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly txService: TransactionsService,
    private readonly promoCodesService: PromoCodesService,
  ) {}

  /**
   * POST /api/v1/transactions/:id/receipt — RECIBO del depósito
   * (imagen o PDF).
   *
   * SOLO PERSONAL. El recibo es el comprobante que la EMPRESA entrega al
   * usuario por su recarga: lo emite y archiva el administrador (u
   * operador de pagos), no el cliente. El usuario solo lo visualiza y
   * descarga desde Mi Perfil.
   *
   * (Antes lo podía subir también el dueño del depósito: un usuario podía
   * adjuntar cualquier archivo a su propio movimiento y hacerlo pasar por
   * comprobante emitido por nosotros.)
   */
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post(':id/receipt')
  @UseInterceptors(FileInterceptor('file', receiptUploadOptions))
  async uploadReceipt(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo (campo "file")');
    await this.txService.findById(id); // 404 si no existe
    return this.txService.attachReceipt(id, `/uploads/${file.filename}`);
  }

  /**
   * GET /api/v1/transactions/mine?page=1&limit=50 — movimientos del
   * usuario autenticado, paginados (tope duro de 100 por página).
   */
  @Get('mine')
  async findMine(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const res = await this.txService.findByUser(user.userId, Number(page) || 1, Number(limit) || 50);
    // Compatibilidad: sin ?page el cliente antiguo espera el array pelado
    return page || limit ? res : res.items;
  }

  /**
   * POST /api/v1/transactions/deposit — inicia un depósito Yape/Plin.
   * Nace 'pending': el saldo NO se acredita hasta que el operador confirme.
   */
  @Post('deposit')
  async deposit(@CurrentUser() user: AuthUser, @Body() dto: CreateDepositDto) {
    if (!dto.operationNumber || !dto.operationNumber.trim()) {
      throw new BadRequestException('El número de operación es obligatorio para validar tu pago con Yape o Plin');
    }

    let promoData: any = null;
    if (dto.promoCode) {
      const promo = await this.promoCodesService.validate(dto.promoCode, user.userId, PromoCodeType.BONUS_RECHARGE);
      promoData = {
        promoCode: promo.code,
        promoValue: promo.value,
      };
    }

    return this.txService.create({
      userId: user.userId,
      amount: dto.amount,
      type: dto.type,
      status: TransactionStatus.PENDING,
      meta: {
        methodName: dto.methodName,
        operationNumber: dto.operationNumber.trim(),
        ...(dto.purchaseIntent ?? {}),
        storeItems: dto.storeItems ?? undefined,
        ...(promoData ?? {}),
      },
    });
  }

  /** GET /api/v1/transactions/pending — cola de depósitos por confirmar (admin). */
  @Roles(UserRole.ADMIN)
  @Get('pending')
  findPending() {
    return this.txService.findPendingDeposits();
  }

  /** PATCH /api/v1/transactions/:id/confirm — Yape verificado → acredita saldo. */
  @Roles(UserRole.ADMIN)
  @Patch(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.txService.confirmDeposit(id);
  }

  /** PATCH /api/v1/transactions/:id/reject — Yape no llegó → rechazado. */
  @Roles(UserRole.ADMIN)
  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.txService.rejectDeposit(id);
  }
}
