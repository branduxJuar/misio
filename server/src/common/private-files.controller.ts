import { Controller, Get, NotFoundException, Param, Query, StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Header } from '@nestjs/common';
import { PRIVATE_UPLOADS_DIR, verifyPrivateFileSignature } from '../logistics/upload.config';

@Controller('files')
export class PrivateFilesController {
  @Get(':filename')
  @Header('Cache-Control', 'private, max-age=300')
  getPrivateFile(
    @Param('filename') filename: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
  ) {
    const safeName = basename(filename);
    if (safeName !== filename || !safeName.startsWith('private-') || !verifyPrivateFileSignature(safeName, expires, signature)) {
      throw new NotFoundException('Archivo no encontrado');
    }
    const path = join(PRIVATE_UPLOADS_DIR, safeName);
    if (!existsSync(path)) throw new NotFoundException('Archivo no encontrado');
    return new StreamableFile(createReadStream(path));
  }
}
