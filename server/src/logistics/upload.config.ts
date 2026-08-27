import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Configuración de subida de archivos del ERP.
 * - Boletas: imagen o PDF (facturas escaneadas).
 * - Evidencias: solo imagen (foto del ganador con su premio).
 * - Disco local en /uploads, servido estático en GET /uploads/<archivo>.
 *   Para producción con varios nodos, cambiar diskStorage por S3/Cloudinary
 *   sin tocar controladores (solo esta config).
 */
export const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const MAX_SIZE_MB = 5;

const storage = diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    // erp-<timestamp>-<aleatorio>.<ext> — evita colisiones y nombres raros
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `erp-${unique}${extname(file.originalname).toLowerCase()}`);
  },
});

const imageOrPdf = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const imageOnly = /^image\/(jpeg|png|webp)$/;

export const receiptUploadOptions = {
  storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    if (!imageOrPdf.test(file.mimetype)) {
      return cb(new BadRequestException('La boleta debe ser JPG, PNG, WEBP o PDF'), false);
    }
    cb(null, true);
  },
};

export const evidenceUploadOptions = {
  storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    if (!imageOnly.test(file.mimetype)) {
      return cb(new BadRequestException('La evidencia debe ser una foto JPG, PNG o WEBP'), false);
    }
    cb(null, true);
  },
};
