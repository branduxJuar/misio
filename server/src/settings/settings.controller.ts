import {
  BadRequestException, Body, Controller, Get, Post, Put,
  UploadedFile, UseGuards, UseInterceptors, Param, Req
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { evidenceUploadOptions } from '../logistics/upload.config';
import { SettingsService } from './settings.service';
import { WelcomeBonusConfig } from './setting.schema';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';
import { SetAnnouncementsDto, SetEmailVerificationDto, SetLegalDto, SetMaintenanceDto, SetRefundPercentageDto, UpdateSiteDto, WelcomeBonusConfigDto } from './dto/settings.dto';

/**
 * CONTENIDO PÚBLICO DEL SITIO (sin login): marca, colores y textos.
 */
@Controller('site')
export class PublicSiteController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.getSite();
  }
}

/**
 * Endpoints públicos de /settings que el frontend necesita SIN login:
 * páginas legales, anuncios activos y estado de mantenimiento.
 */
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** GET /api/v1/settings/legal — páginas legales (público). */
  @Get('legal')
  getLegal() {
    return this.settingsService.getLegalPages();
  }

  /** GET /api/v1/settings/announcements — avisos activos (público). */
  @Get('announcements')
  getAnnouncements() {
    return this.settingsService.getAnnouncements();
  }

  /** GET /api/v1/settings/maintenance — estado de mantenimiento (público). */
  @Get('maintenance')
  getMaintenance() {
    return this.settingsService.getMaintenanceMode();
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** PUT /api/v1/settings/site — editar marca, colores y textos. */
  @Put('site')
  setSite(@Body() body: UpdateSiteDto) {
    return this.settingsService.setSite(body);
  }

  /** POST /api/v1/settings/site/logo — subir el logo de la empresa. */
  @Post('site/logo')
  @UseInterceptors(FileInterceptor('file', evidenceUploadOptions))
  async setLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Falta la imagen (campo "file")');
    return this.settingsService.setSite({ logoUrl: `/uploads/${file.filename}` });
  }

  /** POST /api/v1/settings/upload-image — subir una imagen genérica (para collage u otros). */
  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file', evidenceUploadOptions))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Falta la imagen');
    return { url: `/uploads/${file.filename}` };
  }

  /** GET /api/v1/settings/email-verification */
  @Get('email-verification')
  async getEmailVerification() {
    return { enabled: await this.settingsService.isEmailVerificationEnabled() };
  }

  /** PUT /api/v1/settings/email-verification — { enabled } */
  @Put('email-verification')
  setEmailVerification(@Body() body: SetEmailVerificationDto) {
    return this.settingsService.setEmailVerification(body.enabled);
  }

  /** GET /api/v1/settings/welcome-bonus */
  @Get('welcome-bonus')
  getWelcomeBonus() {
    return this.settingsService.getWelcomeBonus();
  }

  /** PUT /api/v1/settings/welcome-bonus */
  @Put('welcome-bonus')
  setWelcomeBonus(@Body() body: WelcomeBonusConfigDto) {
    return this.settingsService.setWelcomeBonus({
      enabled: !!body.enabled,
      type: body.type === 'ticket' ? 'ticket' : 'credit',
      creditAmount: Math.max(0, Number(body.creditAmount) || 0),
      raffleId: body.raffleId || null,
    });
  }

  /** GET /api/v1/settings/refund-percentage */
  @Get('refund-percentage')
  async getRefundPercentage() {
    return { percentage: await this.settingsService.getRefundPercentage() };
  }

  /** PUT /api/v1/settings/refund-percentage */
  @Put('refund-percentage')
  async setRefundPercentage(@Body() body: SetRefundPercentageDto) {
    return { percentage: await this.settingsService.setRefundPercentage(body.percentage) };
  }

  /** PUT /api/v1/settings/legal — editar términos/privacidad/cómo funciona. */
  @Put('legal')
  setLegal(@Body() body: SetLegalDto) {
    return this.settingsService.setLegalPages(body);
  }

  /** PUT /api/v1/settings/announcements */
  @Put('announcements')
  setAnnouncements(@Body() body: SetAnnouncementsDto) {
    return this.settingsService.setAnnouncements(body.announcements);
  }

  /** GET /api/v1/settings/announcements/stats */
  @Get('announcements/stats')
  getAnnouncementStats() {
    return this.settingsService.getAnnouncementStats();
  }

  /** POST /api/v1/settings/announcements/:id/read */
  @Post('announcements/:id/read')
  @UseGuards(JwtAuthGuard)
  markAnnouncementAsRead(@Req() req: any, @Param('id') id: string) {
    return this.settingsService.markAnnouncementAsRead(req.user.id, id);
  }

  /** PUT /api/v1/settings/maintenance */
  @Put('maintenance')
  setMaintenance(@Body() body: SetMaintenanceDto) {
    return this.settingsService.setMaintenanceMode(body.enabled, body.message, body.resumeAt);
  }
}
