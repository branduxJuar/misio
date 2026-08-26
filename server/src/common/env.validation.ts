import { Logger } from '@nestjs/common';

/**
 * VALIDACIÓN DE ENTORNO — se ejecuta ANTES de levantar la aplicación.
 *
 * La idea: fallar temprano y ruidoso. Un servidor que arranca sin
 * JWT_SECRET o sin MONGO_URI parece sano, responde el health check y
 * recién falla cuando un usuario intenta pagar. Preferimos que no
 * arranque y que el log diga exactamente qué falta.
 */
const REQUIRED_IN_PROD = ['MONGO_URI', 'JWT_SECRET', 'CLIENT_URL'];

export function validateEnv(): void {
  const logger = new Logger('Config');
  const isProd = process.env.NODE_ENV === 'production';
  const problems: string[] = [];

  if (isProd) {
    for (const key of REQUIRED_IN_PROD) {
      if (!process.env[key]?.trim()) problems.push(`Falta ${key}`);
    }
    // Un secreto corto se rompe por fuerza bruta: 32 caracteres mínimo
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      problems.push('JWT_SECRET es demasiado corto (usa 32+ caracteres aleatorios)');
    }
    // Secretos de ejemplo que se cuelan al desplegar
    if (['secret', 'changeme', 'test', 'misio'].includes(process.env.JWT_SECRET ?? '')) {
      problems.push('JWT_SECRET es un valor de ejemplo: cámbialo');
    }
    if (process.env.CLIENT_URL?.includes('localhost')) {
      problems.push('CLIENT_URL apunta a localhost en producción (CORS quedaría inservible)');
    }
  }

  if (problems.length > 0) {
    logger.error('🚨 Configuración inválida — no se puede arrancar:');
    problems.forEach((p) => logger.error(`   · ${p}`));
    process.exit(1);
  }

  // Avisos que no impiden arrancar pero conviene ver en el log
  if (!process.env.SMTP_HOST) {
    logger.warn('SMTP no configurado: los códigos de verificación saldrán por consola.');
  }
  if (!isProd) logger.log('Entorno de desarrollo — validación de configuración relajada.');
}
