import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * ANTI-INYECCIÓN NoSQL.
 *
 * MongoDB no tiene "SQL injection", pero sí una puerta equivalente: los
 * operadores. Si alguien manda `{"dni": {"$ne": null}}` en un login, la
 * consulta pasa a significar "cualquier usuario cuyo DNI no sea nulo" —
 * y entra sin contraseña. Igual con `?filtro[$gt]=` en la URL.
 *
 * La regla es simple: en datos que vienen del cliente NUNCA debe haber
 * claves que empiecen con `$` ni que tengan puntos (rutas anidadas).
 * Las quitamos antes de que lleguen a los controladores.
 *
 * Los DTOs con whitelist ya frenan la mayoría, pero esto cubre lo que
 * no pasa por DTO: query params, rutas y cuerpos sueltos.
 */
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Buffer.isBuffer(v);

/** Limpia recursivamente. Devuelve cuántas claves peligrosas quitó. */
function scrub(value: unknown, removed: { count: number }, depth = 0): void {
  if (depth > 6 || !isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete (value as Record<string, unknown>)[key];
      removed.count += 1;
      continue;
    }
    const child = (value as Record<string, unknown>)[key];
    if (Array.isArray(child)) child.forEach((c) => scrub(c, removed, depth + 1));
    else scrub(child, removed, depth + 1);
  }
}

@Injectable()
export class MongoSanitizeMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const removed = { count: 0 };
    scrub(req.body, removed);
    scrub(req.params, removed);
    // req.query es un getter en Express 5: se limpia in-place, no se reasigna
    scrub(req.query, removed);
    if (removed.count > 0) {
      // Nadie manda claves con $ por accidente: esto es un intento.
      // eslint-disable-next-line no-console
      console.warn(
        `[seguridad] Se descartaron ${removed.count} clave(s) con operadores Mongo — ` +
          `${req.method} ${req.url} desde ${req.ip}`,
      );
    }
    next();
  }
}
