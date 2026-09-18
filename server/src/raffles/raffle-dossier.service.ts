import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RaffleDossier, RaffleDossierDocument } from './raffle-dossier.schema';
import { Raffle, RaffleDocument } from './raffle.schema';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RaffleDossierService {
  constructor(
    @InjectModel(RaffleDossier.name) private readonly dossierModel: Model<RaffleDossierDocument>,
    @InjectModel(Raffle.name) private readonly raffleModel: Model<RaffleDocument>,
  ) {}

  async findByRaffleId(raffleId: string) {
    return this.dossierModel.findOne({ raffleId: new Types.ObjectId(raffleId) }).lean();
  }

  async saveDossier(raffleId: string, data: Partial<RaffleDossier>) {
    const raffle = await this.raffleModel.findById(raffleId);
    if (!raffle) {
      throw new NotFoundException('Rifa no encontrada');
    }

    const result = await this.dossierModel.findOneAndUpdate(
      { raffleId: new Types.ObjectId(raffleId) },
      { $set: data },
      { new: true, upsert: true }
    );
    return result;
  }

  async updateStatus(raffleId: string, status: 'received' | 'validated' | 'observed') {
    const result = await this.dossierModel.findOneAndUpdate(
      { raffleId: new Types.ObjectId(raffleId) },
      { $set: { status } },
      { new: true }
    );
    if (!result) throw new NotFoundException('Dossier no encontrado');
    return result;
  }

  async getOriginalFilePath(raffleId: string): Promise<string> {
    const dossier = await this.dossierModel.findOne({ raffleId: new Types.ObjectId(raffleId) });
    if (!dossier || !dossier.originalFilePath) {
      throw new NotFoundException('Archivo original no encontrado para este sorteo');
    }
    const PRIVATE_UPLOADS_DIR = process.env.UPLOADS_DIR ? path.join(process.env.UPLOADS_DIR, 'private') : path.join(process.cwd(), 'uploads', 'private');
    const fullPath = path.join(PRIVATE_UPLOADS_DIR, dossier.originalFilePath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('El archivo físico no existe en el servidor');
    }
    return fullPath;
  }
}
