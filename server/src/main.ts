import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { UPLOADS_DIR } from './logistics/upload.config';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { validateEnv } from './common/env.validation';
import * as mongoSanitize from 'express-mongo-sanitize';
import { SanitizePipe } from './common/sanitize.pipe';

/**
 * Punto de entrada de la API de Misio.
 *
 * HTTPS EN RED LOCAL: si existe `certs/dev.pem` y `certs/dev-key.pem`
 * (generados por mkcert o el script dev-lan.bat), NestJS arranca en
 * HTTPS. Sin esos archivos, arranca en HTTP normal — nada se rompe.
 *
 * Esto resuelve dos problemas de un golpe:
 *   1. El celular puede instalar la PWA (requiere HTTPS).
 *   2. No hay mixed-content (frontend HTTPS → backend HTTPS).
 */
async function bootstrap() {
  validateEnv();

  // ── HTTPS automático si hay certificados locales ──────────────────
  const certDir = join(process.cwd(), 'certs');
  const certPath = join(certDir, 'dev.pem');
  const keyPath = join(certDir, 'dev-key.pem');
  const useHttps = existsSync(certPath) && existsSync(keyPath);

  const httpsOptions = useHttps
    ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
    : undefined;

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...(httpsOptions ? { httpsOptions } : {}),
  });

  const protocol = useHttps ? 'https' : 'http';
  const logger = new Logger('Bootstrap');
  if (useHttps) {
    logger.log('🔒 HTTPS activado con certificados locales (certs/)');
  }

  app.setGlobalPrefix('api/v1');
  app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      },
    },
  }));

  // Trust proxy: para que req.ip devuelva la IP real detrás de Nginx/Caddy
  app.set('trust proxy', 1);
  // x-powered-by → off (no regalar la tecnología que usamos)
  app.set('x-powered-by', false);

  // Prevenir inyección NoSQL eliminando claves con $ y .
  app.use(mongoSanitize());

  app.useGlobalPipes(
    new SanitizePipe(), // Limpia XSS antes de validar tipos
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Compresión: todo lo que supere 1 KB (los JSON de listas se comprimen 3-5x)
  app.use(compression({ threshold: 1024 }));

  // ── CORS: flexible en desarrollo, estricto en producción ──────────
  // En dev: acepta cualquier origen de la red local (tu PC, celular,
  // tablet) sin tener que listar cada IP a mano.
  // En prod: solo los orígenes de CLIENT_URL.
  const isDev = process.env.NODE_ENV !== 'production';
  const clientOrigins = (process.env.CLIENT_URL ?? `${protocol}://localhost:5173`)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: isDev
      ? (origin, callback) => {
          // En desarrollo: aceptar cualquier origen (localhost, IP local,
          // ngrok...) sin tener que listar cada uno.
          callback(null, true);
        }
      : clientOrigins,
    credentials: true,
  });

  app.useBodyParser('json', { limit: '256kb' });

  if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
    logger.error('🚨 MONGO_URI o JWT_SECRET no están definidos en las variables de entorno. Abortando inicio por seguridad.');
    process.exit(1);
  }

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // Redis para Socket.IO (escala horizontal)
  const { RedisIoAdapter } = await import('./common/redis-io-adapter');
  const redisAdapter = new RedisIoAdapter(app);
  await redisAdapter.connectToRedis();
  app.useWebSocketAdapter(redisAdapter);

  // Archivos subidos (evidencias, QRs, avatares)
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/', maxAge: '1d' });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`🎰 Misio API corriendo en ${protocol}://localhost:${port}/api/v1`);
}
bootstrap();
