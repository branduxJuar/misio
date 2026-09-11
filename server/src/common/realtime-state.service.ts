import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { DistributedLockService } from './distributed-lock.service';

const HOLD_MS = 3 * 60 * 1000;

@Injectable()
export class RealtimeStateService {
  private redis?: Redis;
  private ready?: Promise<void>;

  constructor(private readonly locks: DistributedLockService) {}

  private client() {
    if (!process.env.REDIS_URL) return undefined;
    if (!this.redis) {
      this.redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.ready = this.redis.connect().then(() => undefined);
    }
    return this.redis;
  }

  private async getRedis() {
    const redis = this.client();
    if (!redis) return undefined;
    await this.ready;
    return redis;
  }

  async getSelectionHolds(raffleId: string) {
    const redis = await this.getRedis();
    if (!redis) return undefined;
    const key = `misio:selection:${raffleId}`;
    const values = await redis.hgetall(key);
    const now = Date.now();
    const live: number[] = [];
    const expired: string[] = [];
    for (const [number, raw] of Object.entries(values)) {
      try {
        const hold = JSON.parse(raw) as { expiresAt: number };
        if (hold.expiresAt > now) live.push(Number(number));
        else expired.push(number);
      } catch {
        expired.push(number);
      }
    }
    if (expired.length) await redis.hdel(key, ...expired);
    return live.sort((a, b) => a - b);
  }

  async setSelection(raffleId: string, socketId: string, numbers: number[]) {
    const redis = await this.getRedis();
    if (!redis) return undefined;
    const release = await this.locks.acquire(`selection-state:${raffleId}`);
    try {
      const key = `misio:selection:${raffleId}`;
      const current = await redis.hgetall(key);
      const wanted = new Set(numbers.slice(0, 60));
      const now = Date.now();
      const operations = redis.multi();
      for (const [number, raw] of Object.entries(current)) {
        try {
          const hold = JSON.parse(raw) as { socketId: string; expiresAt: number };
          if (hold.expiresAt <= now || (hold.socketId === socketId && !wanted.has(Number(number)))) {
            operations.hdel(key, number);
          }
        } catch {
          operations.hdel(key, number);
        }
      }
      for (const number of wanted) {
        const currentHold = current[String(number)];
        if (!currentHold) {
          operations.hset(key, String(number), JSON.stringify({ socketId, expiresAt: now + HOLD_MS }));
        } else {
          try {
            const hold = JSON.parse(currentHold) as { socketId: string; expiresAt: number };
            if (hold.socketId === socketId) {
              operations.hset(key, String(number), JSON.stringify({ socketId, expiresAt: now + HOLD_MS }));
            } else if (hold.expiresAt <= now) {
              operations.hset(key, String(number), JSON.stringify({ socketId, expiresAt: now + HOLD_MS }));
            }
          } catch {
            operations.hset(key, String(number), JSON.stringify({ socketId, expiresAt: now + HOLD_MS }));
          }
        }
      }
      operations.pexpire(key, HOLD_MS);
      await operations.exec();
      return this.getSelectionHolds(raffleId);
    } finally {
      await release();
    }
  }

  async removeSelectionSocket(raffleId: string, socketId: string) {
    const redis = await this.getRedis();
    if (!redis) return undefined;
    const release = await this.locks.acquire(`selection-state:${raffleId}`);
    try {
      const key = `misio:selection:${raffleId}`;
      const values = await redis.hgetall(key);
      const remove = Object.entries(values).filter(([, raw]) => {
        try { return JSON.parse(raw).socketId === socketId; } catch { return false; }
      }).map(([number]) => number);
      if (remove.length) await redis.hdel(key, ...remove);
      return this.getSelectionHolds(raffleId);
    } finally {
      await release();
    }
  }

  async getGridSelections(raffleId: string) {
    const redis = await this.getRedis();
    if (!redis) return undefined;
    const values = await redis.hgetall(`misio:grid:${raffleId}`);
    const result: Record<string, { label: string; numbers: number[] }> = {};
    for (const [socketId, raw] of Object.entries(values)) {
      try { result[socketId] = JSON.parse(raw); } catch { await redis.hdel(`misio:grid:${raffleId}`, socketId); }
    }
    return result;
  }

  async setGridSelection(raffleId: string, socketId: string, value: { label: string; numbers: number[] }) {
    const redis = await this.getRedis();
    if (!redis) return undefined;
    const release = await this.locks.acquire(`grid-state:${raffleId}`);
    try {
      const key = `misio:grid:${raffleId}`;
      if (value.numbers.length) {
        await redis.hset(key, socketId, JSON.stringify(value));
        await redis.sadd(`misio:grid-sockets:${socketId}`, raffleId);
        await redis.pexpire(key, HOLD_MS);
      } else {
        await redis.hdel(key, socketId);
      }
      return this.getGridSelections(raffleId);
    } finally {
      await release();
    }
  }

  async removeGridNumbers(raffleId: string, numbers: number[]) {
    const redis = await this.getRedis();
    if (!redis) return undefined;
    const release = await this.locks.acquire(`grid-state:${raffleId}`);
    try {
      const key = `misio:grid:${raffleId}`;
      const values = await redis.hgetall(key);
      const wanted = new Set(numbers);
      const operations = redis.multi();
      for (const [socketId, raw] of Object.entries(values)) {
        try {
          const value = JSON.parse(raw) as { label: string; numbers: number[] };
          const left = value.numbers.filter((number) => !wanted.has(number));
          if (left.length) operations.hset(key, socketId, JSON.stringify({ ...value, numbers: left }));
          else operations.hdel(key, socketId);
        } catch { operations.hdel(key, socketId); }
      }
      await operations.exec();
      return this.getGridSelections(raffleId);
    } finally {
      await release();
    }
  }

  async removeGridSocket(socketId: string) {
    const redis = await this.getRedis();
    if (!redis) return undefined;
    const rooms = await redis.smembers(`misio:grid-sockets:${socketId}`);
    for (const raffleId of rooms) {
      await redis.hdel(`misio:grid:${raffleId}`, socketId);
      await redis.srem(`misio:grid-sockets:${socketId}`, raffleId);
    }
    return rooms;
  }
}
