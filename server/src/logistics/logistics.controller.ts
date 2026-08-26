import {
  Body, Controller, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LogisticsService } from './logistics.service';
import { CreateLogisticsDto, UpdateLogisticsDto } from './dto/logistics.dto';
import { DeliveryStatus } from './logistics.schema';
import { evidenceUploadOptions, receiptUploadOptions } from './upload.config';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';

/** TODO el ERP es territorio exclusivo del Super Admin. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  /** POST /api/v1/logistics — registrar compra de premio. */
  @Post()
  create(@Body() dto: CreateLogisticsDto) {
    return this.logisticsService.create(dto as any);
  }

  /** GET /api/v1/logistics — inventario completo con bitácora. */
  @Get()
  findAll() {
    return this.logisticsService.findAll();
  }

  /** GET /api/v1/logistics/summary — KPIs: ingresos, costos, margen neto. */
  @Get('summary')
  summary() {
    return this.logisticsService.financialSummary();
  }

  /** PATCH /api/v1/logistics/:id — tracking/estado (bitácora automática). */
  /** GET /api/v1/logistics/:id/timeline — línea de tiempo enriquecida */
  @Get(':id/timeline')
  getTimeline(@Param('id') id: string) {
    return this.logisticsService.getTimeline(id);
  }

  /**
   * PATCH /api/v1/logistics/:id/status — cambiar SOLO el estado del
   * premio (el gesto del día a día: "ya lo despaché").
   * Body: { status, courier?, trackingNumber? }
   */
  /**
   * POST /api/v1/logistics/sync-winners — reconciliación: cada sorteo
   * completado con ganador obtiene su fila de envío (repara datos de
   * cierres corridos con código antiguo).
   */
  @Post('sync-winners')
  syncWinners() {
    return this.logisticsService.syncWinners();
  }

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body('status') status: DeliveryStatus,
    @Body('courier') courier?: string,
    @Body('trackingNumber') trackingNumber?: string,
  ) {
    return this.logisticsService.setStatus(id, status, { courier, trackingNumber });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLogisticsDto) {
    return this.logisticsService.update(id, dto as any);
  }

  /**
   * POST /api/v1/logistics/:id/receipt — boleta de compra (JPG/PNG/WEBP/PDF).
   * Multipart: campo "file". Máx 5MB. El archivo queda en /uploads y la
   * URL pública se guarda en receiptFileUrl.
   */
  @Post(':id/receipt')
  @UseInterceptors(FileInterceptor('file', receiptUploadOptions))
  uploadReceipt(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Falta el archivo (campo "file")');
    return this.logisticsService.attachFile(id, 'receipt', `/uploads/${file.filename}`);
  }

  /** POST /api/v1/logistics/:id/evidence — foto de entrega (solo imagen). */
  @Post(':id/evidence')
  @UseInterceptors(FileInterceptor('file', evidenceUploadOptions))
  uploadEvidence(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Falta el archivo (campo "file")');
    return this.logisticsService.attachFile(id, 'evidence', `/uploads/${file.filename}`);
  }
}
