import { Controller, Get, Param, Query, Res, UseGuards, Post } from '@nestjs/common';
import * as os from 'os';
import type { Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { Roles } from '../auth/decorators/roles.decorator';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
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
  async adminStats() {
    const [
      totalUsers, bannedUsers, activeRaffles, liveRaffles, ticketsSold,
      revenueAgg, walletAgg, pendingDeposits, pendingRedemptions,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.USER }),
      this.userModel.countDocuments({ banned: true }),
      this.raffleModel.countDocuments({ status: RaffleStatus.ACTIVE }),
      this.raffleModel.countDocuments({ status: RaffleStatus.LIVE }),
      this.ticketModel.countDocuments({}),
      // Ingresos por boletos: compras del ledger (montos negativos → se invierte)
      this.txModel.aggregate([
        { $match: { type: TransactionType.TICKET_PURCHASE, status: TransactionStatus.COMPLETED } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Pasivo: saldo total vivo en billeteras de usuarios
      this.userModel.aggregate([
        { $match: { role: UserRole.USER } },
        { $group: { _id: null, contable: { $sum: '$walletBalance' }, canje: { $sum: '$walletCanje' } } },
      ]),
      this.txModel.countDocuments({
        type: TransactionType.DEPOSIT_YAPE, status: TransactionStatus.PENDING,
      }),
      this.redemptionModel.countDocuments({ status: RedemptionStatus.PENDING }),
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
