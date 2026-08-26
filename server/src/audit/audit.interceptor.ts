import {
  CallHandler, ExecutionContext, Injectable, NestInterceptor,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable, tap } from 'rxjs';
import { AuditLog } from './audit.schema';

const STAFF = ['admin', 'operator', 'presenter'];

/** De qué módulo es la ruta (para poder filtrar la bitácora). */
const moduleOf = (url: string) => {
  const m = url.replace('/api/v1/', '').split('/')[0] ?? '';
  return ({
    payments: 'pagos', transactions: 'pagos', users: 'usuarios',
    raffles: 'sorteos', live: 'sorteos', store: 'tienda',
    logistics: 'erp', auctions: 'subastas', settings: 'contenido',
    complaints: 'reclamos', accounting: 'contabilidad',
  } as Record<string, string>)[m] ?? m;
};

/** Nunca guardamos esto en la bitácora, ni por accidente. */
const SECRET_KEYS = ['password', 'passwordHash', 'token', 'accessToken', 'code'];
const clean = (body: unknown) => {
  if (!body || typeof body !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (SECRET_KEYS.includes(k)) continue;
    if (typeof v === 'object' && v !== null) continue; // solo escalares
    out[k] = v;
  }
  return out;
};

/**
 * Registra TODA acción de escritura (POST/PUT/PATCH/DELETE) hecha por
 * personal. Las lecturas no se registran (harían ruido y volumen), y las
 * acciones de usuarios normales tampoco: la bitácora es para vigilar el
 * poder, no a los clientes.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLog>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const write = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const user = req.user;
    if (!write || !user || !STAFF.includes(user.role)) return next.handle();

    const entry = {
      actorId: user.userId,
      actorName: user.name ?? '',
      actorRole: user.role,
      action: `${req.method} ${req.route?.path ?? req.url}`,
      module: moduleOf(req.url ?? ''),
      targetId: req.params?.id ?? '',
      meta: clean(req.body),
      ip: (req.headers['x-forwarded-for']?.split(',')[0] ?? req.ip ?? '').trim(),
    };

    const write$ = (success: boolean) =>
      this.auditModel.create({ ...entry, success }).catch(() => {
        /* la bitácora jamás rompe la operación del usuario */
      });

    // `pipe()` recibe OPERADORES, no un observador. `tap` es el operador
    // que espía el flujo sin alterarlo: la respuesta del usuario sale
    // idéntica, la bitácora se escribe de lado.
    return next.handle().pipe(
      tap({
        next: () => void write$(true),
        error: () => void write$(false),
      }),
    );
  }
}
