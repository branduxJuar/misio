import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication, Logger } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * ADAPTADOR REDIS PARA SOCKET.IO — escala horizontal.
 *
 * HOY con un solo proceso funciona sin Redis: todos los sockets viven en
 * la misma memoria. Con DOS procesos (detrás de un load balancer), un
 * usuario conectado al proceso A y otro al B no se ven entre sí: no
 * comparten sala, no reciben las tiradas del otro, y el bingo se rompe.
 *
 * Redis resuelve eso: cada emit() pasa por el pub/sub de Redis y llega
 * a TODOS los procesos. Es la diferencia entre "funciona en desarrollo"
 * y "funciona con usuarios reales y un load balancer".
 *
 * ACTIVACIÓN: basta con poner REDIS_URL en el .env:
 *   REDIS_URL=redis://localhost:6379
 * Sin esa variable, el adaptador NO se activa y todo sigue funcionando
 * como hoy (un solo proceso, sin dependencia externa).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger('RedisIoAdapter');
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplication) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log('REDIS_URL no definido → Socket.IO funciona en modo local (un solo proceso)');
      return;
    }

    try {
      const pubClient = new Redis(url);
      const subClient = pubClient.duplicate();

      await Promise.all([
        new Promise<void>((res, rej) => {
          pubClient.once('ready', res);
          pubClient.once('error', rej);
        }),
        new Promise<void>((res, rej) => {
          subClient.once('ready', res);
          subClient.once('error', rej);
        }),
      ]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log(`Socket.IO conectado a Redis (${url}) → escala horizontal activa`);
    } catch (err) {
      this.logger.warn(`No se pudo conectar a Redis (${url}): ${(err as Error).message}. Socket.IO usará modo local.`);
    }
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
