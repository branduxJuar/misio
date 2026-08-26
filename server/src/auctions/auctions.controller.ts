import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Query,
  Req, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuctionsService, AUCTIONS_FLAG_KEY } from './auctions.service';
import { SettingsService } from '../settings/settings.service';
import { evidenceUploadOptions } from '../logistics/upload.config';
import { JwtAuthGuard, OptionalJwtGuard, RolesGuard } from '../auth/guards/auth.guards';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';
import { CancelAuctionDto, CreateAuctionDto, SetAuctionFlagDto, SetStreamDto } from './dto/auctions.dto';

@Controller('auctions')
export class AuctionsController {
  constructor(
    private readonly auctionsService: AuctionsService,
    private readonly settingsService: SettingsService,
  ) {}

  /** GET /api/v1/auctions/flag — ¿módulo activo? (público, para el nav). */
  @Get('flag')
  async flag() {
    return { enabled: await this.auctionsService.isEnabled() };
  }

  /** PUT /api/v1/auctions/flag — el INTERRUPTOR del módulo (solo admin). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put('flag')
  setFlag(@Body() body: SetAuctionFlagDto) {
    return this.settingsService.set(AUCTIONS_FLAG_KEY, { enabled: body.enabled });
  }

  // ── ADMIN (declarados ANTES de :id) ─────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  findAllAdmin(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.auctionsService.findAllAdmin({ page: Number(page) || 1, limit: Number(limit) || 20 });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() body: CreateAuctionDto) {
    const { title, description, emoji, basePrice, minIncrement, buyNowPrice, startAt, durationMin, mode, streamUrl } = body;
    const start = new Date(startAt);
    return this.auctionsService.create({
      title: title.slice(0, 120),
      description: (description ?? '').slice(0, 2000),
      emoji: (emoji ?? '🔨').slice(0, 4),
      basePrice: Math.max(1, Math.floor(basePrice)),
      minIncrement: Math.max(1, Math.floor(minIncrement ?? 5)),
      buyNowPrice: Math.max(0, Math.floor(buyNowPrice ?? 0)),
      startAt: start,
      endAt: new Date(start.getTime() + Math.max(5, Math.floor(durationMin)) * 60 * 1000),
      mode: mode === 'moderated' ? 'moderated' : 'auto',
      streamUrl: streamUrl ? streamUrl.slice(0, 500) : '',
    });
  }

  /** PATCH /api/v1/auctions/:id/publish — publicar subasta (de DRAFT a SCHEDULED). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/publish')
  publish(@Param('id') id: string) {
    return this.auctionsService.publish(id);
  }

  /** PATCH /api/v1/auctions/:id/stream — enlace de transmisión (moderada). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/stream')
  setStream(@Param('id') id: string, @Body() body: SetStreamDto) {
    return this.auctionsService.setStream(id, body.streamUrl);
  }

  /** POST /api/v1/auctions/:id/start — INICIAR AHORA (sin esperar la hora). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/start')
  startNow(@Param('id') id: string) {
    return this.auctionsService.startNow(id);
  }

  /** POST /api/v1/auctions/:id/finish — TERMINAR AHORA (como admin). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/finish')
  finishNow(@Param('id') id: string) {
    return this.auctionsService.finishNow(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() body: CancelAuctionDto) {
    return this.auctionsService.cancel(id, body.reason.trim());
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('files', 4, evidenceUploadOptions))
  uploadImages(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('Falta al menos una imagen (campo "files")');
    return this.auctionsService.addImages(id, files.map((f) => `/uploads/${f.filename}`));
  }

  // ── PÚBLICO / USUARIO ────────────────────────────────────────────
  /** Listado (con OptionalJwt para marcar "amIEnrolled"). */
  @UseGuards(OptionalJwtGuard)
  @Get()
  findPublic(@Req() req: any) {
    return this.auctionsService.findPublic(req.user?.userId);
  }

  @UseGuards(OptionalJwtGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.auctionsService.findOnePublic(id, req.user?.userId);
  }

  @Get(':id/bids')
  bids(@Param('id') id: string) {
    return this.auctionsService.recentBids(id);
  }

  /** POST /api/v1/auctions/:id/enroll — MATRÍCULA (requiere sesión). */
  @UseGuards(JwtAuthGuard)
  @Post(':id/enroll')
  enroll(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auctionsService.enroll(user.userId, id);
  }
}
