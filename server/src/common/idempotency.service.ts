import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IdempotencyRecord, IdempotencyDocument } from './idempotency.schema';

type ClaimResult =
  | { kind: 'new'; id: Types.ObjectId }
  | { kind: 'replay'; response: Record<string, any> };

@Injectable()
export class IdempotencyService {
  constructor(@InjectModel(IdempotencyRecord.name) private readonly model: Model<IdempotencyDocument>) {}

  async claim(scope: string, key: string | undefined, userId: string): Promise<ClaimResult | null> {
    const normalized = key?.trim();
    if (!normalized) return null;
    const filter = { scope, key: normalized, userId: new Types.ObjectId(userId) };
    const current = await this.model.findOne(filter).lean();
    const currentExpiresAt = current?.expiresAt ?? new Date(0);
    if (current && currentExpiresAt <= new Date()) {
      await this.model.deleteOne({ _id: current._id });
    }
    const active = current && currentExpiresAt > new Date() ? current : null;
    if (active?.status === 'completed' && active.response) return { kind: 'replay', response: active.response };
    if (active) throw new ConflictException('Esta operación ya está siendo procesada');
    try {
      const created = await this.model.create({ ...filter, status: 'processing', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
      return { kind: 'new', id: created._id };
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const duplicate = await this.model.findOne(filter).lean();
      const duplicateExpiresAt = duplicate?.expiresAt ?? new Date(0);
      if (duplicateExpiresAt > new Date() && duplicate?.status === 'completed' && duplicate.response) return { kind: 'replay', response: duplicate.response };
      if (duplicate && duplicateExpiresAt <= new Date()) {
        await this.model.deleteOne({ _id: duplicate._id });
      }
      throw new ConflictException('Esta operación ya está siendo procesada');
    }
  }

  async complete(id: Types.ObjectId, response: Record<string, any>) {
    await this.model.updateOne({ _id: id, status: 'processing' }, { $set: { status: 'completed', response } });
  }

  async fail(id: Types.ObjectId) {
    await this.model.deleteOne({ _id: id, status: 'processing' });
  }
}
