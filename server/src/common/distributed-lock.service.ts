import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

type LocalLock = { token: string; expiresAt: number };
type Release = () => Promise<void>;

/** Lock compartido entre réplicas. Sin REDIS_URL conserva un lock local para desarrollo. */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly local = new Map<string, LocalLock>();
  private redis?: Redis;
  private redisReady?: Promise<void>;

  private getRedis() {
    if (!process.env.REDIS_URL) return undefined;
    if (!this.redis) {
      this.redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.redisReady = this.redis.connect().then(() => undefined);
    }
    return this.redis;
  }

  async acquire(key: string, ttlMs = 30_000): Promise<Release> {
    const token = randomUUID();
    const redis = this.getRedis();

    if (redis) {
      try {
        await this.redisReady;
        const acquired = await redis.set(`misio:lock:${key}`, token, 'PX', ttlMs, 'NX');
        if (acquired !== 'OK') throw new ConflictException('Esta operación ya está siendo procesada');
        return async () => {
          await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            `misio:lock:${key}`,
            token,
          );
        };
      } catch (error: any) {
        if (error instanceof ConflictException) throw error;
        this.logger.error(`Redis no disponible para lock ${key}: ${error?.message ?? error}`);
        throw new ServiceUnavailableException('El sistema de coordinación temporal no está disponible');
      }
    }

    const existing = this.local.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      throw new ConflictException('Esta operación ya está siendo procesada');
    }
    this.local.set(key, { token, expiresAt: Date.now() + ttlMs });
    return async () => {
      const current = this.local.get(key);
      if (current?.token === token) this.local.delete(key);
    };
  }
}
