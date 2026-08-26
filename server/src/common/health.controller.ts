import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

// La versión sale del package.json: una sola fuente de verdad.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: API_VERSION } = require('../../../package.json');

/**
 * SONDAS DE SALUD (para el balanceador / Docker / Railway / PM2).
 *
 * - GET /api/v1/health  → "¿el proceso está vivo?" (liveness). Debe ser
 *   instantáneo y NO tocar la base: si Mongo tarda, no queremos que el
 *   orquestador mate un servidor que está sano.
 * - GET /api/v1/health/ready → "¿puede atender?" (readiness). Aquí sí se
 *   comprueba la conexión: si la base no responde, el balanceador deja de
 *   mandarle tráfico a esta instancia en vez de darle errores a la gente.
 *
 * Sin readiness, un despliegue nuevo recibe usuarios ANTES de estar
 * conectado a Mongo — y esos usuarios ven un error que no volverá a
 * ocurrir, pero que ya se llevaron.
 */
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  live() {
    return {
      status: 'ok',
      // SELLO DE VERSIÓN: saber qué build está corriendo de verdad.
      // Sin esto, diagnosticar "sigue fallando" es adivinar: puede ser un
      // bug nuevo o un servidor que arrancó con código viejo.
      version: API_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  ready() {
    // 1 = conectado (readyState de Mongoose)
    const db = this.connection.readyState === 1;
    const mem = process.memoryUsage();
    return {
      status: db ? 'ready' : 'degraded',
      database: db ? 'up' : 'down',
      memoryMb: Math.round(mem.heapUsed / 1024 / 1024),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  /**
   * GET /api/v1/health/system — DIAGNÓSTICO COMPLETO para el panel admin.
   * Revisa cada dependencia y configura, y explica qué significa cada
   * estado. Es la respuesta a "¿por qué no funciona X en mi máquina?".
   */
  @Get('system')
  async system() {
    const mem = process.memoryUsage();
    const dbConnected = this.connection.readyState === 1;

    // ¿El Mongo soporta transacciones? (replica set). Sin esto, las
    // compras corren en modo degradado (sin atomicidad multi-documento).
    let transactions: 'ok' | 'unavailable' | 'unknown' = 'unknown';
    let mongoTopology = 'desconocida';
    if (dbConnected) {
      try {
        const admin = this.connection.db?.admin();
        if (!admin) throw new Error('sin acceso admin');
        const hello = await admin.command({ hello: 1 });
        if (hello.setName) {
          transactions = 'ok';
          mongoTopology = `replica set "${hello.setName}"`;
        } else if (hello.msg === 'isdbgrid') {
          transactions = 'ok';
          mongoTopology = 'sharded (mongos)';
        } else {
          transactions = 'unavailable';
          mongoTopology = 'standalone';
        }
      } catch { /* sin permisos de admin: se queda unknown */ }
    }

    return {
      timestamp: new Date().toISOString(),
      version: API_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(mem.heapUsed / 1024 / 1024),
      node: process.version,
      checks: {
        mongodb: {
          status: dbConnected ? 'ok' : 'error',
          detail: dbConnected
            ? `Conectado (${mongoTopology})`
            : 'Sin conexión — nada funciona sin la base de datos',
        },
        transacciones: {
          status: transactions === 'ok' ? 'ok' : transactions === 'unavailable' ? 'warning' : 'unknown',
          detail: transactions === 'ok'
            ? 'Soportadas (replica set) — compras 100% atómicas'
            : transactions === 'unavailable'
              ? 'Mongo standalone: las compras corren SIN transacción (funciona en dev; en producción usa replica set)'
              : 'No se pudo determinar',
        },
        redis: {
          status: process.env.REDIS_URL ? 'ok' : 'info',
          detail: process.env.REDIS_URL
            ? 'Configurado — Socket.IO escala a varios procesos'
            : 'Sin configurar — tiempo real en modo local (1 proceso). Suficiente para desarrollo.',
        },
        webPush: {
          status: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? 'ok' : 'info',
          detail: process.env.VAPID_PUBLIC_KEY
            ? 'Claves VAPID configuradas — notificaciones push activas'
            : 'Sin claves VAPID — push desactivado. Genera con: npx web-push generate-vapid-keys',
        },
        correo: {
          status: process.env.SMTP_HOST || process.env.MAIL_HOST ? 'ok' : 'info',
          detail: process.env.SMTP_HOST || process.env.MAIL_HOST
            ? 'SMTP configurado'
            : 'Sin SMTP — los correos (recuperación, ganador) no se envían',
        },
        jwt: {
          status: process.env.JWT_SECRET ? 'ok' : 'warning',
          detail: process.env.JWT_SECRET
            ? 'JWT_SECRET definido'
            : 'Usando secreto por defecto de desarrollo — define JWT_SECRET',
        },
      },
    };
  }
}
