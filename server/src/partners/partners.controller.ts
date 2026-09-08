import {
  Controller, Get, Post, Patch, Body, Param, UseGuards, Req,
  UseInterceptors, UploadedFile
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PartnersService } from './partners.service';
import { JwtAuthGuard } from '../auth/guards/auth.guards';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePerm } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';
import { receiptUploadOptions } from '../logistics/upload.config';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('empresas')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @RequirePerm('dashboard')
  @Get()
  async getAll(@Req() req) {
    if (req.user.role === UserRole.PARTNER_ADMIN) {
      // Si es partner, solo ve su empresa
      return [await this.partnersService.findOne(req.user.partnerId)];
    }
    // Si es super admin, ve todas
    return this.partnersService.findAll();
  }

  @RequirePerm('dashboard')
  @Post()
  async create(@Body() data) {
    return this.partnersService.create(data);
  }

  @RequirePerm('dashboard')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() data) {
    return this.partnersService.update(id, data);
  }

  @RequirePerm('dashboard')
  @Patch(':id/accept-terms')
  async acceptTerms(@Param('id') id: string) {
    return this.partnersService.update(id, { termsAcceptedAt: new Date() });
  }

  @RequirePerm('dashboard')
  @Post('upload-contract')
  @UseInterceptors(FileInterceptor('file', receiptUploadOptions))
  async uploadContract(@UploadedFile() file: Express.Multer.File) {
    return { url: `/uploads/${file.filename}` };
  }

  /** El partner ve solo sus retiros; el admin ve todos */
  @Get('payouts')
  async getPayouts(@Req() req) {
    const partnerId = req.user.role === UserRole.PARTNER_ADMIN ? req.user.partnerId : undefined;
    return this.partnersService.getPayouts(partnerId);
  }

  /** El partner solicita un retiro */
  @Post('payouts/request')
  async requestPayout(@Req() req, @Body() body: { amount: number; notes?: string }) {
    return this.partnersService.requestPayout(req.user.partnerId, body.amount, body.notes);
  }

  /** El Super Admin aprueba y sube el comprobante */
  @RequirePerm('dashboard')
  @Post('payouts/:id/approve')
  @UseInterceptors(FileInterceptor('file', receiptUploadOptions))
  async approvePayout(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const receiptUrl = file ? `/uploads/${file.filename}` : undefined;
    return this.partnersService.processPayout(id, receiptUrl);
  }

  /** El Super Admin rechaza un retiro (devuelve el dinero al partner) */
  @RequirePerm('dashboard')
  @Post('payouts/:id/reject')
  async rejectPayout(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.partnersService.rejectPayout(id, body.reason);
  }
}
