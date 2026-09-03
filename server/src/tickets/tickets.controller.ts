import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { AdminAddTicketsDto, PurchaseOfflineDto, PurchaseTicketsDto } from './dto/purchase.dto';
import { CancelPosSaleDto } from './dto/cancel-pos-sale.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { AuthUser, CurrentUser, Public, Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  /**
   * POST /api/v1/tickets/purchase — compra atómica con saldo Misio.
   * Descuenta la billetera, asigna números libres y registra el movimiento
   * en una sola transacción MongoDB (sin sobreventa ni saldos fantasma).
   */
  @Post('purchase')
  purchase(@CurrentUser() user: AuthUser, @Body() dto: PurchaseTicketsDto) {
    return this.ticketsService.purchase(user.userId, dto.raffleId, {
      quantity: dto.quantity,
      ticketNumbers: dto.ticketNumbers,
      promoCode: dto.promoCode,
    });
  }

  /**
   * 🔧 POST /api/v1/tickets/admin-add — inyecta boletos a mano (admin).
   * Body: { raffleId, userId, ticketNumbers: number[] }
   */
  @Roles(UserRole.ADMIN)
  @Post('admin-add')
  adminAdd(@Body() body: AdminAddTicketsDto) {
    return this.ticketsService.adminAddTickets(body.raffleId, body.userId, body.ticketNumbers);
  }

  /** 🔧 POST /api/v1/tickets/admin-recount — recalcula soldCount (admin). */
  @Roles(UserRole.ADMIN)
  @Post('admin-recount')
  adminRecount(@Body('raffleId') raffleId: string) {
    return this.ticketsService.adminRecountRaffle(raffleId);
  }

  /**
   * POST /api/v1/tickets/offline — Venta física (calle/POS).
   * Solo para Administradores y Vendedores.
   */
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @Post('offline')
  purchaseOffline(@CurrentUser() user: AuthUser, @Body() dto: PurchaseOfflineDto) {
    return this.ticketsService.purchaseOffline(user.userId, dto.raffleId, {
      quantity: dto.quantity,
      ticketNumbers: dto.ticketNumbers,
      buyerName: dto.buyerName,
      buyerPhone: dto.buyerPhone,
      buyerDni: dto.buyerDni,
      buyerEmail: dto.buyerEmail,
      paymentMethod: dto.paymentMethod,
    });
  }

  /** POST /api/v1/tickets/pos/cancel-sale — Anulación de venta POS por Admin. */
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @Post('pos/cancel-sale')
  cancelPosSale(@CurrentUser() user: AuthUser, @Body() dto: CancelPosSaleDto) {
    return this.ticketsService.cancelPosSale(dto.transactionId, dto.adminPin, user.userId);
  }

  /**
   * GET /api/v1/tickets/validate/:code — Validación pública (escaneo QR).
   */
  @Public()
  @Get('validate/:code')
  validateTicket(@Param('code') code: string) {
    return this.ticketsService.validateTicket(code);
  }

  /**
   * GET /api/v1/tickets/offline-sales — Reporte de caja por día/vendedor.
   */
  @Roles(UserRole.ADMIN, UserRole.SELLER)
  @Get('offline-sales')
  getOfflineSales(@CurrentUser() user: AuthUser, @Query() query: any) {
    // Si es vendedor, forzamos que solo vea sus propias ventas
    const sellerId = user.role === UserRole.SELLER ? user.userId : query.sellerId;
    return this.ticketsService.getOfflineSales(query.startDate, query.endDate, sellerId);
  }

  /** GET /api/v1/tickets/mine — historial del usuario autenticado. */
  @Get('mine')
  findMine(@CurrentUser() user: AuthUser) {
    return this.ticketsService.findByUser(user.userId);
  }

  /** GET /api/v1/tickets?raffleId=... — participantes de una rifa (admin). */
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Get()
  findByRaffle(@Query('raffleId') raffleId: string) {
    return raffleId ? this.ticketsService.findByRaffle(raffleId) : [];
  }

  /** PATCH /api/v1/tickets/:id/burn — tirada al agua, SOLO presentador/admin. */
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Patch(':id/burn')
  burn(@Param('id') id: string) {
    return this.ticketsService.burnAlAgua(id);
  }

  /** PATCH /api/v1/tickets/:id/winner — tirada definitiva, SOLO admin. */
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Patch(':id/winner')
  winner(@Param('id') id: string) {
    return this.ticketsService.markWinner(id);
  }
}
