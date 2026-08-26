import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';

/**
 * CONFIGURACIÓN DE SUBIDA DE ARCHIVOS.
 *
 * HOY: disco local (/uploads, servido estático desde main.ts).
 * PRODUCCIÓN: reemplaza `storage` por el engine de S3 y cambia las rutas
 * que devuelves a URLs firmadas. Los controladores NO se tocan: solo
 * este archivo.
 *
 * Para migrar a S3:
 *   1. `npm install multer-s3 @aws-sdk/client-s3`
 *   2. Reemplaza `diskStorage(...)` por:
 *      ```
 *      import multerS3 from 'multer-s3';
 *      import { S3Client } from '@aws-sdk/client-s3';
 *      const s3 = new S3Client({ region: process.env.AWS_REGION });
 *      storage: multerS3({
 *        s3, bucket: process.env.S3_BUCKET,
 *        key: (_req, file, cb) => cb(null, `uploads/${unique}${ext}`),
 *      })
 *      ```
 *   3. En main.ts borra el serveStaticModule de /uploads.
 *   4. Las rutas que devuelves pasan de `/uploads/abc.jpg` a la URL de S3.
 */
const UPLOAD_DIR = join(process.cwd(), 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

/** Tipos permitidos: fotos (evidencias) y PDF (boletas/facturas). */
const ALLOWED_MIME = /^(image\/(jpe?g|png|webp)|application\/pdf)$/;

/** Tamaño máximo por archivo: 5 MB. */
const MAX_SIZE = 5 * 1024 * 1024;

export const multerOptions = {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    if (!ALLOWED_MIME.test(file.mimetype)) {
      return cb(new BadRequestException('Solo se aceptan imágenes (jpg/png/webp) o PDF'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_SIZE },
};
