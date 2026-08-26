import { Injectable, NestMiddleware, ServiceUnavailableException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { SettingsService } from '../settings/settings.service';

/**
 * MODO MANTENIMIENTO — un switch que apaga la API sin apagar el servidor.
 *
 * Cuándo se usa: migraciones de BD, reparaciones de datos, deploys que
 * tocan el schema. Lo activas desde Admin → Contenido, haces tu trabajo,
 * y lo desactivas — sin reiniciar nada.
 *
 * Qué SIGUE funcionando (para que puedas operar):
 *   - /health y /health/ready (el load balancer necesita saber que vives)
 *   - /auth/* (para que el admin pueda loguearse y desactivar el modo)
 *   - /settings/maintenance (para poder apagarlo)
 *
 * Todo lo demás devuelve 503 con el mensaje que configuraste.
 */
const EXEMPT = ['/api/v1/health', '/api/v1/auth', '/api/v1/settings/maintenance', '/api/v1/site', '/api/v1/users/me'];

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly settings: SettingsService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // Las rutas exentas siempre pasan
    if (EXEMPT.some((p) => req.originalUrl.startsWith(p))) return next();

    const mode = await this.settings.getMaintenanceMode();
    if (mode.enabled) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: mode.message,
        resumeAt: mode.resumeAt,
        maintenance: true,
      });
    }
    next();
  }
}
