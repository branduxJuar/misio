import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Partner, PartnerDocument } from './partner.schema';
import { PartnerPayout, PartnerPayoutDocument, PayoutStatus } from './partner-payout.schema';
import { Raffle, RaffleDocument, RaffleStatus } from '../raffles/raffle.schema';
import { MailService } from '../auth/mail.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PartnersService {
  constructor(
    @InjectModel(Partner.name) private partnerModel: Model<PartnerDocument>,
    @InjectModel(PartnerPayout.name) private payoutModel: Model<PartnerPayoutDocument>,
    @InjectModel(Raffle.name) private raffleModel: Model<RaffleDocument>,
    private mailService: MailService,
    private usersService: UsersService,
  ) {}

  async findAll() {
    return this.partnerModel.find().sort({ createdAt: -1 }).lean();
  }

  async findOne(id: string) {
    const partner = await this.partnerModel.findById(id).lean();
    if (!partner) throw new NotFoundException('Empresa no encontrada');
    return partner;
  }

  async create(data: Partial<Partner>) {
    return this.partnerModel.create(data);
  }

  async update(id: string, data: Partial<Partner>) {
    const partner = await this.partnerModel.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!partner) throw new NotFoundException('Empresa no encontrada');
    return partner;
  }

  /**
   * Añade saldo a la billetera empresarial de forma atómica.
   */
  async addWalletBalance(id: string, amount: number, session?: any) {
    const opts = session ? { session, new: true } : { new: true };
    const partner = await this.partnerModel.findByIdAndUpdate(
      id,
      { $inc: { walletBalance: amount } },
      opts
    ).lean();
    if (!partner) throw new NotFoundException('Empresa no encontrada');
    return partner;
  }

  /**
   * Un partner B2B acepta los términos al iniciar sesión.
   */
  async acceptTerms(partnerId: string) {
    const partner = await this.partnerModel.findByIdAndUpdate(
      partnerId,
      { termsAcceptedAt: new Date() },
      { new: true }
    ).lean();
    if (!partner) throw new NotFoundException('Empresa no encontrada');
    return partner;
  }

  /**
   * Obtiene todos los retiros solicitados (para que el Admin los liquide)
   */
  async getPayouts(partnerId?: string) {
    const filter = partnerId ? { partnerId: new Types.ObjectId(partnerId) } : {};
    return this.payoutModel.find(filter).populate('partnerId', 'name legalId feePercentage bankDetails logo').sort({ createdAt: -1 }).lean();
  }

  /**
   * El Partner solicita retirar saldo de su billetera.
   * notes: datos bancarios u observaciones del partner.
   */
  async requestPayout(partnerId: string, amount: number, notes?: string) {
    const partner = await this.partnerModel.findById(partnerId);
    if (!partner) throw new NotFoundException('Empresa no encontrada');
    if (partner.walletBalance < amount) {
      throw new BadRequestException('Saldo insuficiente en tu Billetera Empresarial');
    }

    const activeRaffles = await this.raffleModel.countDocuments({
      partnerId: partner._id,
      status: { $in: [RaffleStatus.ACTIVE, RaffleStatus.LIVE] }
    });

    if (activeRaffles > 0) {
      throw new BadRequestException('No puedes solicitar retiros mientras tengas sorteos en curso (activos o en vivo).');
    }

    // Descontar saldo y crear solicitud
    partner.walletBalance -= amount;
    await partner.save();

    return this.payoutModel.create({
      partnerId: partner._id,
      amount,
      status: PayoutStatus.PENDING,
      notes: notes ?? '',
    });
  }

  /**
   * El Super Admin liquida (transfiere) y sube el comprobante
   */
  async processPayout(payoutId: string, receiptUrl?: string) {
    const payout = await this.payoutModel.findByIdAndUpdate(
      payoutId,
      { status: PayoutStatus.COMPLETED, processedAt: new Date(), receiptUrl },
      { new: true }
    ).populate('partnerId').lean();
    if (!payout) throw new NotFoundException('Solicitud de retiro no encontrada');

    // Send email to partner admins
    try {
      if (payout.partnerId && payout.partnerId._id) {
        const admins = await this.usersService.findAdminsByPartner(payout.partnerId._id.toString());
        for (const admin of admins) {
          if (admin.email) {
            await this.mailService.sendGenericMail(
              admin.email,
              '✅ Retiro Aprobado - Misio',
              `Hola <b>${admin.name}</b>,<br><br>Te informamos que tu solicitud de retiro por <b>S/ ${payout.amount.toFixed(2)}</b> ha sido procesada exitosamente y transferida a tu cuenta bancaria.<br><br>Puedes revisar el comprobante en tu panel de Billetera Empresarial.<br><br>Atentamente,<br>El equipo de Misio`
            );
          }
        }
      }
    } catch (err) {
      // Ignore email errors to avoid failing the main transaction
    }

    return payout;
  }

  /**
   * El Super Admin rechaza la solicitud y DEVUELVE el monto al partner
   */
  async rejectPayout(payoutId: string, reason: string) {
    const payout = await this.payoutModel.findById(payoutId).populate('partnerId');
    if (!payout) throw new NotFoundException('Solicitud de retiro no encontrada');
    if (payout.status !== PayoutStatus.PENDING) {
      throw new BadRequestException('Solo se pueden rechazar solicitudes pendientes');
    }

    // Devolvemos el dinero a la billetera del partner
    await this.partnerModel.findByIdAndUpdate(
      payout.partnerId._id,
      { $inc: { walletBalance: payout.amount } },
    );

    payout.status = PayoutStatus.REJECTED;
    payout.notes = reason;
    payout.processedAt = new Date();
    await payout.save();

    // Send email to partner admins
    try {
      if (payout.partnerId && payout.partnerId._id) {
        const admins = await this.usersService.findAdminsByPartner(payout.partnerId._id.toString());
        for (const admin of admins) {
          if (admin.email) {
            await this.mailService.sendGenericMail(
              admin.email,
              '❌ Retiro Rechazado - Misio',
              `Hola <b>${admin.name}</b>,<br><br>Te informamos que tu solicitud de retiro por <b>S/ ${payout.amount.toFixed(2)}</b> ha sido <b>rechazada</b>.<br><br><b>Motivo:</b> ${reason}<br><br>El monto ha sido devuelto a tu saldo disponible.<br><br>Atentamente,<br>El equipo de Misio`
            );
          }
        }
      }
    } catch (err) {
      // Ignore email errors
    }

    return payout;
  }
}
