import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post,
  Query, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { evidenceUploadOptions, receiptUploadOptions } from '../logistics/upload.config';
import { StoreService } from './store.service';
import { CheckoutDto, CreateStoreItemDto, DeliverRedemptionDto, RedeemDto, UpdateStoreItemDto } from './dto/store.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';

@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  /** GET /api/v1/store/items — catálogo activo (público). */
  @Get('items')
  findActive() {
    return this.storeService.findActiveItems();
  }

  /** POST /api/v1/store/checkout — carrito completo: { items: [{itemId, qty}] } */
  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckoutDto,
  ) {
    return this.storeService.checkout(user.userId, dto.items ?? [], dto.delivery);
  }

  /** POST /api/v1/store/redeem — canjear con saldo Misio (autenticado). */
  @UseGuards(JwtAuthGuard)
  @Post('redeem')
  redeem(@CurrentUser() user: AuthUser, @Body() dto: RedeemDto) {
    return this.storeService.redeem(user.userId, dto.itemId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('redemptions/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.storeService.findMyRedemptions(user.userId);
  }

  // ── ADMIN ─────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Get('items/all')
  findAll() {
    return this.storeService.findAllItems();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('items')
  create(@Body() dto: CreateStoreItemDto) {
    return this.storeService.createItem(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch('items/:id')
  update(@Param('id') id: string, @Body() dto: UpdateStoreItemDto) {
    return this.storeService.updateItem(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Delete('items/:id')
  remove(@Param('id') id: string) {
    return this.storeService.removeItem(id);
  }

  /** POST /api/v1/store/items/:id/images — hasta 4 fotos del producto. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('items/:id/images')
  @UseInterceptors(FilesInterceptor('files', 4, evidenceUploadOptions))
  uploadImages(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('Falta al menos una imagen (campo "files")');
    return this.storeService.addImages(id, files.map((f) => `/uploads/${f.filename}`));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Delete('items/:id/images')
  removeImage(@Param('id') id: string, @Query('url') url: string) {
    return this.storeService.removeImage(id, url);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Get('redemptions')
  redemptions() {
    return this.storeService.findAllRedemptions();
  }

  /** GET /store/redemptions/delivered — historial de entregados. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Get('redemptions/delivered')
  delivered() {
    return this.storeService.findDeliveredRedemptions();
  }

  /** GET /store/redemptions/:id — detalle completo (modal de gestión). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Get('redemptions/:id')
  redemptionDetail(@Param('id') id: string) {
    return this.storeService.findRedemptionDetail(id);
  }

  /** PATCH /store/redemptions/:id/deliver — marca entregado (+ código/nota). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch('redemptions/:id/deliver')
  deliver(
    @Param('id') id: string,
    @Body() body: DeliverRedemptionDto,
  ) {
    return this.storeService.markDelivered(id, body ?? {});
  }

  /** POST /store/redemptions/:id/evidence — subir capturas de entrega. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('redemptions/:id/evidence')
  @UseInterceptors(FilesInterceptor('files', 5, evidenceUploadOptions))
  async uploadEvidence(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
    const urls = list.map((f) => `/uploads/${f.filename}`);
    return this.storeService.addEvidence(id, urls);
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch('redemptions/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    // using 'any' cast or import RedemptionStatus if needed, but the service takes it as enum
    return this.storeService.updateStatus(id, body.status as any);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Delete('redemptions/:id/evidence')
  removeEvidence(@Param('id') id: string, @Query('url') url: string) {
    return this.storeService.removeEvidence(id, url);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('redemptions/:id/receipts')
  @UseInterceptors(FilesInterceptor('files', 5, receiptUploadOptions))
  async uploadReceipts(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
    const urls = list.map((f) => `/uploads/${f.filename}`);
    return this.storeService.addReceipts(id, urls);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Delete('redemptions/:id/receipts')
  removeReceipt(@Param('id') id: string, @Query('url') url: string) {
    return this.storeService.removeReceipt(id, url);
  }
}
