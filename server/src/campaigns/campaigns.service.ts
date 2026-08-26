import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignStatus, ICampaignTarget } from './campaign.schema';
import { User } from '../users/user.schema';
import { Transaction, TransactionType, TransactionStatus } from '../transactions/transaction.schema';
import { InboxService } from '../inbox/inbox.service';
import { PromoCodesService } from '../promocodes/promocodes.service';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel(Campaign.name) private campaignModel: Model<Campaign>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    private inboxService: InboxService,
    private promoCodesService: PromoCodesService,
  ) {}

  async findAll() {
    return this.campaignModel.find().sort({ createdAt: -1 });
  }

  async create(data: { title: string; message: string; target: ICampaignTarget; createdBy: string; promo?: any }) {
    if (data.promo && data.promo.code) {
      await this.promoCodesService.create({
        code: data.promo.code,
        type: data.promo.type,
        value: data.promo.value,
        terms: data.promo.terms,
        expiresAt: data.promo.expiresAt,
        maxUsesPerUser: 1, // Por defecto 1 uso por usuario para campañas
      });
    }

    const doc = new this.campaignModel({
      ...data,
      createdBy: new Types.ObjectId(data.createdBy),
      status: CampaignStatus.DRAFT,
    });
    return doc.save();
  }

  /**
   * Determina los usuarios que coinciden con los filtros de la campaña.
   */
  async findAudienceIds(target: ICampaignTarget): Promise<Types.ObjectId[]> {
    const query: any = { role: 'user' }; // Solo enviamos a usuarios normales

    // Filtro por país
    if (target.country) {
      query['address.country'] = new RegExp(`^${target.country}$`, 'i');
    }

    // Buscamos usuarios base
    let users = await this.userModel.find(query).select('_id createdAt');
    
    // Filtro por tipo de audiencia
    if (target.audienceType === 'new') {
      // Nuevos: nunca han hecho una recarga completada
      const allDeposits = await this.transactionModel.aggregate([
        { $match: { type: TransactionType.DEPOSIT_YAPE, status: TransactionStatus.COMPLETED } },
        { $group: { _id: '$userId' } }
      ]);
      const usersWithDeposits = new Set(allDeposits.map(d => d._id.toString()));
      users = users.filter(u => !usersWithDeposits.has(u._id.toString()));
    } else if (target.audienceType === 'inactive' && target.monthsInactive && target.monthsInactive > 0) {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - target.monthsInactive);

      // Buscamos qué usuarios SÍ han recargado recientemente
      const recentDeposits = await this.transactionModel.aggregate([
        { 
          $match: { 
            type: TransactionType.DEPOSIT_YAPE, 
            status: TransactionStatus.COMPLETED,
            createdAt: { $gte: cutoffDate }
          }
        },
        { $group: { _id: '$userId' } }
      ]);

      const activeUserIds = new Set(recentDeposits.map(d => d._id.toString()));

      // Excluimos a los activos y a los registrados recientemente (que aún no han tenido tiempo de ser inactivos)
      users = users.filter(u => {
        const isRecentUser = new Date(u.createdAt) >= cutoffDate;
        const isActive = activeUserIds.has(u._id.toString());
        return !isRecentUser && !isActive;
      });
    }

    return users.map(u => u._id as Types.ObjectId);
  }

  async getAudienceCount(target: ICampaignTarget) {
    const ids = await this.findAudienceIds(target);
    return { count: ids.length };
  }

  async send(campaignId: string) {
    const campaign = await this.campaignModel.findById(campaignId);
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    if (campaign.status === CampaignStatus.SENT) {
      throw new Error('Esta campaña ya fue enviada');
    }

    const audienceIds = await this.findAudienceIds(campaign.target);

    // Enviar mensajes uno por uno (o en lote si la app escala mucho)
    for (const userId of audienceIds) {
      await this.inboxService.send({
        userId: userId.toString(),
        subject: campaign.title,
        body: campaign.message,
        kind: campaign.promo?.code ? 'code' : 'info',
        code: campaign.promo?.code || '',
      });
    }

    campaign.status = CampaignStatus.SENT;
    campaign.sentCount = audienceIds.length;
    campaign.sentAt = new Date();
    await campaign.save();

    return campaign;
  }

  async finish(campaignId: string) {
    const campaign = await this.campaignModel.findById(campaignId);
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    campaign.status = CampaignStatus.FINISHED;
    await campaign.save();

    if (campaign.promo && campaign.promo.code) {
      await this.promoCodesService.expireCode(campaign.promo.code);
    }

    return campaign;
  }
}
