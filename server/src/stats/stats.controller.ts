import { Controller, Get, Param, Query, Res, UseGuards, Post, Req } from '@nestjs/common';
import * as os from 'os';
import type { Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/auth.guards';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePerm } from '../auth/decorators/roles.decorator';
import { User, UserDocument, UserRole } from '../users/user.schema';
import { Raffle, RaffleDocument, RaffleStatus } from '../raffles/raffle.schema';
import { Ticket, TicketDocument } from '../tickets/ticket.schema';
import {
  Transaction, TransactionDocument, TransactionStatus, TransactionType,
} from '../transactions/transaction.schema';
import { Redemption, RedemptionDocument, RedemptionStatus } from '../store/store.schema';

/**
 * GET /api/v1/stats/admin — estadísticas del dashboard de administración.
 * Todo se calcula del ledger y las colecciones reales, nada cacheado.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('dashboard')
@Controller('stats')
export class StatsController {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Raffle.name) private raffleModel: Model<RaffleDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
    @InjectModel(Redemption.name) private redemptionModel: Model<RedemptionDocument>,
  ) {}

  @Get('admin')
  async adminStats(@Req() req) {
    const isPartner = req.user.role === UserRole.PARTNER_ADMIN;
    const partnerIdStr = isPartner ? req.user.partnerId : undefined;
    const partnerIdObj = partnerIdStr ? new mongoose.Types.ObjectId(partnerIdStr) : undefined;

    const raffleMatch = isPartner ? { partnerId: partnerIdObj } : {};
    
    // Si es partner, filtramos por sus propios sorteos.
    // Además, EXCLUIMOS los sorteos CANCELADOS de los cálculos de ingresos y boletos vendidos.
    const validRaffles = await this.raffleModel.find({ ...raffleMatch, status: { $ne: RaffleStatus.CANCELLED } }).select('_id');
    const validRaffleIdsObj = validRaffles.map(r => r._id);
    const validRaffleIdsStr = validRaffles.map(r => r._id.toString());
    
    const ticketMatch = { raffleId: { $in: validRaffleIdsObj } };

    const [
      totalUsers, bannedUsers, activeRaffles, liveRaffles, ticketsSold,
      revenueAgg, walletAgg, pendingDeposits, pendingRedemptions,
    ] = await Promise.all([
      // Para partners, totalUsers y bannedUsers no tienen tanto sentido aislar, 
      // mostramos 0 o el total. Mostraremos 0 por privacidad.
      isPartner ? 0 : this.userModel.countDocuments({ role: UserRole.USER }),
      isPartner ? 0 : this.userModel.countDocuments({ banned: true }),
      this.raffleModel.countDocuments({ ...raffleMatch, status: RaffleStatus.ACTIVE }),
      this.raffleModel.countDocuments({ ...raffleMatch, status: RaffleStatus.LIVE }),
      this.ticketModel.countDocuments(ticketMatch),
      // Ingresos por boletos: compras del ledger (montos negativos → se invierte)
      // Solo tomamos compras de sorteos NO cancelados. meta.raffleId se guarda como String.
      this.txModel.aggregate([
        { $match: { type: TransactionType.TICKET_PURCHASE, status: TransactionStatus.COMPLETED, 'meta.raffleId': { $in: validRaffleIdsStr } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Pasivo: saldo total vivo en billeteras de usuarios
      isPartner ? [] : this.userModel.aggregate([
        { $match: { role: UserRole.USER } },
        { $group: { _id: null, contable: { $sum: '$walletBalance' }, canje: { $sum: '$walletCanje' } } },
      ]),
      isPartner ? 0 : this.txModel.countDocuments({
        type: TransactionType.DEPOSIT_YAPE, status: TransactionStatus.PENDING,
      }),
      isPartner ? 0 : this.redemptionModel.countDocuments({ status: RedemptionStatus.PENDING }),
    ]);

    return {
      totalUsers,
      bannedUsers,
      activeRaffles,
      liveRaffles,
      ticketsSold,
      ticketRevenue: Math.abs(revenueAgg[0]?.total ?? 0),
      walletLiability: (walletAgg[0]?.contable ?? 0) + (walletAgg[0]?.canje ?? 0),
      walletContable: walletAgg[0]?.contable ?? 0,
      walletCanje: walletAgg[0]?.canje ?? 0,
      pendingDeposits,
      pendingRedemptions,
    };
  }

  /** GET /api/v1/stats/advanced — Métricas avanzadas (Top Buyers, ROI, Partners) */
  @Get('advanced')
  async advancedStats(@Req() req) {
    const isPartner = req.user.role === UserRole.PARTNER_ADMIN;
    const partnerIdStr = isPartner ? req.user.partnerId : undefined;
    const partnerIdObj = partnerIdStr ? new mongoose.Types.ObjectId(partnerIdStr) : undefined;

    let partnerRaffleIds: mongoose.Types.ObjectId[] = [];
    if (isPartner) {
      const raffles = await this.raffleModel.find({ partnerId: partnerIdObj }).select('_id');
      partnerRaffleIds = raffles.map(r => r._id);
    }

    // 1. Tasa de Conversión
    const totalUsers = isPartner ? 0 : await this.userModel.countDocuments({ role: UserRole.USER });
    const buyersRaw = isPartner ? [] : await this.txModel.distinct('userId', { type: TransactionType.TICKET_PURCHASE, status: TransactionStatus.COMPLETED });
    const conversionRate = totalUsers > 0 ? (buyersRaw.length / totalUsers) * 100 : 0;

    // 2. Top Compradores (Ballenas)
    const topBuyers = isPartner ? [] : await this.txModel.aggregate([
      { $match: { type: TransactionType.TICKET_PURCHASE, status: TransactionStatus.COMPLETED } },
      { $group: { _id: '$userId', totalSpent: { $sum: { $abs: '$amount' } }, purchaseCount: { $sum: 1 } } },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, name: '$user.name', phone: '$user.phone', email: '$user.email', totalSpent: 1, purchaseCount: 1 } }
    ]);

    // 3. Rentabilidad por Sorteo
    // Ignoramos sorteos cancelados
    const validRaffles = await this.raffleModel.find({ ...(isPartner ? { partnerId: partnerIdObj } : {}), status: { $ne: RaffleStatus.CANCELLED } }).select('_id');
    const validRaffleIdsStr = validRaffles.map(r => r._id.toString());
    
    const rafflePerformance = await this.txModel.aggregate([
      { $match: { type: TransactionType.TICKET_PURCHASE, status: TransactionStatus.COMPLETED, 'meta.raffleId': { $in: validRaffleIdsStr } } },
      { $group: { _id: '$meta.raffleId', totalRevenue: { $sum: { $abs: '$amount' } } } },
      { $lookup: { from: 'raffles', localField: '_id', foreignField: '_id', as: 'raffle' } },
      { $unwind: { path: '$raffle', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, title: '$raffle.title', status: '$raffle.status', ticketPrice: '$raffle.ticketPrice', totalRevenue: 1, partnerId: '$raffle.partnerId' } },
      { $sort: { totalRevenue: -1 } },
      { $limit: 15 }
    ]);

    // 4. Rendimiento de Partners (Empresas Externas)
    const partnerPerformance = isPartner ? [] : await this.raffleModel.aggregate([
      { $match: { partnerId: { $exists: true, $ne: null } } },
      { $lookup: { from: 'partners', localField: 'partnerId', foreignField: '_id', as: 'partner' } },
      { $unwind: { path: '$partner', preserveNullAndEmptyArrays: true } },
      { $group: {
          _id: '$partnerId',
          companyName: { $first: '$partner.name' },
          feePercentage: { $first: '$partner.feePercentage' },
          totalSoldTickets: { $sum: '$soldCount' },
          // Estimación de ingreso bruto (boletos * precio)
          grossRevenue: { $sum: { $multiply: ['$soldCount', '$ticketPrice'] } }
      }},
      { $project: {
          _id: 1,
          companyName: 1,
          totalSoldTickets: 1,
          grossRevenue: 1,
          misioCommission: { $multiply: ['$grossRevenue', { $divide: ['$feePercentage', 100] }] }
      }},
      { $sort: { grossRevenue: -1 } }
    ]);

    return {
      conversionRate,
      topBuyers,
      rafflePerformance,
      partnerPerformance,
    };
  }

  /** GET /api/v1/stats/trends?days=30 — series para los gráficos. */
  @Get('trends')
  async trends(@Query('days') daysParam?: string) {
    const days = Math.min(Math.max(7, Number(daysParam) || 30), 90);
    const since = new Date(Date.now() - days * 86400_000);

    const byDay = (arr: any[]) => {
      const map = new Map<string, number>();
      arr.forEach((r) => map.set(r._id, r.value));
      const out: Array<{ date: string; value: number }> = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
        out.push({ date: d, value: map.get(d) ?? 0 });
      }
      return out;
    };

    const [signups, deposits] = await Promise.all([
      this.userModel.aggregate([
        { $match: { role: UserRole.USER, createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, value: { $sum: 1 } } },
      ]),
      this.txModel.aggregate([
        { $match: { type: TransactionType.DEPOSIT_YAPE, status: TransactionStatus.COMPLETED, createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, value: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      days,
      signups: byDay(signups),
      deposits: byDay(deposits.map((d) => ({ ...d, value: Math.abs(d.value) }))),
    };
  }

  /** GET /api/v1/stats/export/:kind — CSV. kind = users|deposits|raffles. */
  @Get('export/:kind')
  async exportCsv(@Param('kind') kind: string, @Res() res: Response) {
    let rows: string[][] = [];
    let filename = 'export.csv';

    if (kind === 'users') {
      const users = await this.userModel.find({ role: UserRole.USER })
        .select('name dni phone email walletBalance walletCanje createdAt').lean();
      rows = [['Nombre', 'DNI', 'Telefono', 'Correo', 'Saldo', 'Canje', 'Registrado']];
      users.forEach((u: any) => rows.push([
        u.name, u.dni, u.phone, u.email ?? '',
        String(u.walletBalance ?? 0), String(u.walletCanje ?? 0),
        new Date(u.createdAt).toISOString().slice(0, 10),
      ]));
      filename = 'usuarios.csv';
    } else if (kind === 'deposits') {
      const deps = await this.txModel.find({ type: TransactionType.DEPOSIT_YAPE })
        .populate('userId', 'name dni').sort({ createdAt: -1 }).limit(5000).lean();
      rows = [['Fecha', 'Usuario', 'DNI', 'Monto', 'Estado']];
      deps.forEach((d: any) => rows.push([
        new Date(d.createdAt).toISOString().slice(0, 16).replace('T', ' '),
        d.userId?.name ?? '—', d.userId?.dni ?? '—',
        String(Math.abs(d.amount ?? 0)), d.status,
      ]));
      filename = 'recargas.csv';
    } else if (kind === 'raffles') {
      const raffles = await this.raffleModel.find()
        .select('title status ticketPrice soldCount totalTickets createdAt').sort({ createdAt: -1 }).lean();
      rows = [['Sorteo', 'Estado', 'Precio', 'Vendidos', 'Total', 'Creado']];
      raffles.forEach((r: any) => rows.push([
        r.title, r.status, String(r.ticketPrice ?? 0),
        String(r.soldCount ?? 0), String(r.totalTickets ?? 0),
        new Date(r.createdAt).toISOString().slice(0, 10),
      ]));
      filename = 'sorteos.csv';
    } else {
      res.status(400).json({ message: 'Tipo inválido: users | deposits | raffles' });
      return;
    }

    const csv = rows.map((row) =>
      row.map((cell) => {
        const s = String(cell ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','),
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  }

  /** GET /api/v1/stats/system — métricas del sistema y usuarios recientes. */
  @Get('system')
  async systemStats() {
    const activeUsers = await this.userModel
      .find({ role: UserRole.USER })
      .sort({ updatedAt: -1 }) // Los que tuvieron actividad reciente en DB
      .limit(10)
      .select('name dni phone createdAt updatedAt');

    return {
      os: {
        uptime: process.uptime(),
        memory: {
          free: os.freemem(),
          total: os.totalmem(),
          usage: process.memoryUsage(),
        },
        cpus: os.cpus().map(c => c.model),
        loadavg: os.loadavg(),
      },
      activeUsers,
    };
  }

  /** POST /api/v1/stats/fix-holds — Fuerza la liberación de todo saldo retenido. */
  @Post('fix-holds')
  async fixHolds() {
    const users = await this.userModel.find({ walletHeld: { $gt: 0 } });
    if (!users.length) return { success: true, count: 0, message: 'No hay retenciones atrapadas.' };

    const result = await this.userModel.updateMany(
      { walletHeld: { $gt: 0 } },
      [{ $set: { walletBalance: { $add: ['$walletBalance', '$walletHeld'] }, walletHeld: 0 } }]
    );
    return { success: true, count: result.modifiedCount, message: `Se devolvió el saldo retenido a ${result.modifiedCount} usuarios.` };
  }
}
