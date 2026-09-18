import { Controller, Post, Get, Param, UseInterceptors, UploadedFile, Body, Res, BadRequestException, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { RaffleDossierService } from './raffle-dossier.service';
import { receiptUploadOptions } from '../logistics/upload.config';
import { JwtAuthGuard } from '../auth/guards/auth.guards';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePerm } from '../auth/decorators/roles.decorator';
import { createHash } from 'node:crypto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('raffles/:raffleId/dossier')
export class RaffleDossierController {
  constructor(private readonly dossierService: RaffleDossierService) {}

  @RequirePerm('sorteos')
  @Post()
  @UseInterceptors(FileInterceptor('file', receiptUploadOptions))
  async uploadDossier(
    @Param('raffleId') raffleId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any
  ) {
    const data: any = {};
    if (file) {
      // Usar filename ya que la ruta es PRIVATE_UPLOADS_DIR
      data.originalFilePath = file.filename;
      // Generar Hash SHA-256 del archivo
      const fs = require('fs');
      const fileBuffer = fs.readFileSync(file.path);
      const hash = createHash('sha256').update(fileBuffer).digest('hex');
      data.originalFileHash = hash;
      data.status = 'validated'; // Si suben el archivo final, se valida automáticamente
    } else {
      data.status = 'received'; // Borrador / Datos informativos
    }
    
    if (body.certifierName) data.certifierName = body.certifierName;
    if (body.certifierRole) data.certifierRole = body.certifierRole;
    if (body.reference) data.reference = body.reference;
    if (body.videoPlatform) data.videoPlatform = body.videoPlatform;
    if (body.videoUrl) data.videoUrl = body.videoUrl;

    const dossier = await this.dossierService.saveDossier(raffleId, data);
    return dossier;
  }
  @RequirePerm('sorteos')
  @Get()
  async getDossier(@Param('raffleId') raffleId: string) {
    return this.dossierService.findByRaffleId(raffleId);
  }

  @RequirePerm('sorteos')
  @Get('download')
  async downloadOriginal(@Param('raffleId') raffleId: string, @Res() res: Response) {
    const filePath = await this.dossierService.getOriginalFilePath(raffleId);
    res.sendFile(filePath);
  }

  @RequirePerm('sorteos')
  @Post('status')
  async updateStatus(@Param('raffleId') raffleId: string, @Body('status') status: 'received' | 'validated' | 'observed') {
    return this.dossierService.updateStatus(raffleId, status);
  }
}
