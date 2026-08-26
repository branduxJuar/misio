import { Injectable, Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';

/**
 * LÍMITE DE EVENTOS EN TIEMPO REAL.
 *
 * El rate limit HTTP (ThrottlerGuard) NO protege los WebSockets: una vez
 * abierto el socket, los eventos no pasan por Express. Sin esto, un bot
 * puede disparar 10.000 `place_bid` por segundo y tumbar el proceso —
 * o peor, ganar por saturación mientras los demás no logran pujar.
 *
 * Ventana deslizante por socket y por tipo de evento, en memoria: es
 * O(1), no toca la BD y se limpia sola cuando el socket se desconecta.
 *
 * NOTA DE ESCALA: con varias instancias del servidor esto limita por
 * proceso (cada socket vive en uno solo), que es justo lo que se quiere:
 * proteger el proceso que atiende ese socket.
 */

/** Cuántos eventos se aceptan por ventana, según su costo real. */
export const WS_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  // Escriben dinero: caros y sensibles
  place_bid: { limit: 12, windowMs: 10_000 },
  buy_now: { limit: 3, windowMs: 10_000 },
  // Escriben estado de juego
  host_call: { limit: 30, windowMs: 10_000 },
  claim_host: { limit: 5, windowMs: 30_000 },
  presenter_draw: { limit: 20, windowMs: 10_000 },
  presenter_draw_manual: { limit: 20, windowMs: 10_000 },
  // Ruido de interfaz: mucho volumen, poco costo
  grid_select: { limit: 60, windowMs: 10_000 },
  react: { limit: 40, windowMs: 10_000 },
  // Puertas de entrada
  join_auction: { limit: 10, windowMs: 30_000 },
  watch_auction: { limit: 10, windowMs: 30_000 },
  join_bingo: { limit: 10, windowMs: 30_000 },
  join_room: { limit: 10, windowMs: 30_000 },
};

const DEFAULT_LIMIT = { limit: 30, windowMs: 10_000 };

type Bucket = { count: number; resetAt: number };

@Injectable()
export class WsRateLimiter {
  private readonly logger = new Logger('WsRateLimiter');
  /** socketId → evento → cubeta */
  private readonly buckets = new Map<string, Map<string, Bucket>>();

  /**
   * ¿Puede este socket ejecutar este evento ahora?
   * Devuelve null si puede; un mensaje para el usuario si debe esperar.
   */
  check(socket: Socket, event: string): string | null {
    const rule = WS_LIMITS[event] ?? DEFAULT_LIMIT;
    const now = Date.now();

    let bySocket = this.buckets.get(socket.id);
    if (!bySocket) {
      bySocket = new Map();
      this.buckets.set(socket.id, bySocket);
      // La memoria se libera sola al desconectar: sin esto, un servidor
      // con meses de uptime acumula cubetas de sockets muertos.
      socket.once('disconnect', () => this.buckets.delete(socket.id));
    }

    const bucket = bySocket.get(event);
    if (!bucket || bucket.resetAt <= now) {
      bySocket.set(event, { count: 1, resetAt: now + rule.windowMs });
      return null;
    }

    bucket.count += 1;
    if (bucket.count > rule.limit) {
      const wait = Math.ceil((bucket.resetAt - now) / 1000);
      this.logger.warn(`Socket ${socket.id} excedió "${event}" (${bucket.count}/${rule.limit})`);
      return `Vas muy rápido — espera ${wait}s antes de volver a intentar.`;
    }
    return null;
  }

  /** Cuántos sockets están siendo vigilados (para diagnóstico). */
  get tracked(): number {
    return this.buckets.size;
  }
}
