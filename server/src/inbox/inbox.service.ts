import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InternalMessage, InternalMessageDocument } from './inbox.schema';

@Injectable()
export class InboxService {
  constructor(
    @InjectModel(InternalMessage.name) private msgModel: Model<InternalMessageDocument>,
  ) {}

  /** Enviar un mensaje interno a un usuario. */
  async send(data: {
    userId: string;
    subject: string;
    body: string;
    kind?: 'code' | 'info';
    code?: string;
    redemptionId?: string;
  }) {
    return this.msgModel.create({
      userId: new Types.ObjectId(data.userId),
      subject: data.subject,
      body: data.body,
      kind: data.kind ?? 'info',
      code: data.code ?? '',
      redemptionId: data.redemptionId ? new Types.ObjectId(data.redemptionId) : null,
      read: false,
    });
  }

  /** Bandeja del usuario (más recientes primero). */
  findMine(userId: string) {
    const ids: any[] = [userId];
    try { ids.push(new Types.ObjectId(userId)); } catch {}
    return this.msgModel.find({ userId: { $in: ids } }).sort({ createdAt: -1 }).limit(100).lean();
  }

  /** Cuántos sin leer (para el badge). */
  unreadCount(userId: string) {
    const ids: any[] = [userId];
    try { ids.push(new Types.ObjectId(userId)); } catch {}
    return this.msgModel.countDocuments({ userId: { $in: ids }, read: false });
  }

  async markRead(userId: string, id: string) {
    const ids: any[] = [userId];
    try { ids.push(new Types.ObjectId(userId)); } catch {}
    await this.msgModel.updateOne({ _id: new Types.ObjectId(id), userId: { $in: ids } }, { read: true });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const ids: any[] = [userId];
    try { ids.push(new Types.ObjectId(userId)); } catch {}
    await this.msgModel.updateMany({ userId: { $in: ids }, read: false }, { read: true });
    return { ok: true };
  }
}
