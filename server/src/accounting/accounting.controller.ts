import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePerm } from '../auth/decorators/roles.decorator';
import { User, UserDocument, UserRole } from '../users/user.schema';
import {
  Transaction, TransactionDocument, TransactionStatus, TransactionType,
} from '../transactions/transaction.schema';
import { LogisticsERP, LogisticsERPDocument } from '../logistics/logistics.schema';

/** Rango de fechas del reporte (por defecto: últimos 30 días). */
const range = (from?: string, to?: string) => {
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 86400000);
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

/**
 * 💰 CONTABILIDAD — la foto financiera del negocio.
 *
 * Distingue lo que muchos sistemas mezclan y termina en pérdidas:
 *  - DINERO REAL que entró (recargas confirmadas) vs
 *  - SALDO PROMOCIONAL que regalaste (Cero Pérdida, bonos), que es un
 *    pasivo tuyo pero NO dinero que recibiste.
 * La caja disponible = recargas − compras de premios (ERP) − nada más:
 * las compras de boletos NO son ingreso nuevo, solo mueven saldo que ya
 * estaba en la casa.
 */
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePerm('contabilidad')
@Controller('accounting')
export class AccountingController {
  constructor(
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(LogisticsERP.name) private erpModel: Model<LogisticsERPDocument>,
  ) {}

  /** GET /api/v1/accounting/summary?from=&to= */
  @Get('summary')
  async summary(@Query('from') from?: string, @Query('to') to?: string) {
    const { start, end } = range(from, to);
    const inRange = { createdAt: { $gte: start, $lte: end } };
    const done = { status: TransactionStatus.COMPLETED };

    const sum = async (match: any) => {
      const [r] = await this.txModel.aggregate([
        { $match: { ...done, ...inRange, ...match } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } }, n: { $sum: 1 } } },
      ]);
      return { total: r?.total ?? 0, n: r?.n ?? 0 };
    };

    const [
      deposits, ticketSales, storeCanje, storeVenta, refundsCanje,
      cancelRefunds, bonuses, auctionPayments, walletAgg, erpAgg, pendingDeposits,
    ] = await Promise.all([
      sum({ type: { $in: [TransactionType.DEPOSIT_YAPE, TransactionType.OFFLINE_SALE] } }), // 💵 dinero real que ENTRÓ
      sum({ type: TransactionType.TICKET_PURCHASE }),
      sum({ type: TransactionType.MARKETPLACE_PURCHASE, wallet: 'canje' }),
      sum({ type: TransactionType.MARKETPLACE_PURCHASE, wallet: 'contable' }),
      sum({ type: TransactionType.CERO_PERDIDA_REFUND }), // 🎁 saldo regalado
      sum({ type: TransactionType.RAFFLE_CANCELLED_REFUND }),
      sum({ type: TransactionType.WELCOME_BONUS }),
      sum({ type: TransactionType.AUCTION_PAYMENT }),
      this.userModel.aggregate([
        {
          $group: {
            _id: null,
            contable: { $sum: '$walletBalance' },
            canje: { $sum: '$walletCanje' },
            held: { $sum: '$walletHeld' },
          },
        },
      ]),
      // Costo de premios comprados (ERP) en el rango
      this.erpModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$purchaseCost' }, n: { $sum: 1 } } },
      ]),
      this.txModel.countDocuments({
        type: TransactionType.DEPOSIT_YAPE,
        status: TransactionStatus.PENDING,
      }),
    ]);

    const wallets = walletAgg[0] ?? { contable: 0, canje: 0, held: 0 };
    const prizeCost = erpAgg[0]?.total ?? 0;

    return {
      range: { from: start, to: end },
      // ── Dinero real ──
      income: { deposits: deposits.total, deposCount: deposits.n },
      costs: { prizes: prizeCost, prizesCount: erpAgg[0]?.n ?? 0 },
      cash: deposits.total - prizeCost, // Caja del periodo (aprox.)
      // ── Actividad (mueve saldo, no es ingreso nuevo) ──
      activity: {
        ticketSales: ticketSales.total,
        ticketsCount: ticketSales.n,
        storeVenta: storeVenta.total,
        storeCanje: storeCanje.total,
        auctionPayments: auctionPayments.total,
      },
      // ── Saldo promocional entregado (pasivo, no salida de caja) ──
      promo: {
        ceroPerdida: refundsCanje.total,
        bonuses: bonuses.total,
        cancelRefunds: cancelRefunds.total,
      },
      // ── Pasivo vivo con los usuarios (deuda de la casa) ──
      liability: {
        contable: wallets.contable ?? 0,
        canje: wallets.canje ?? 0,
        held: wallets.held ?? 0,
        total: (wallets.contable ?? 0) + (wallets.canje ?? 0) + (wallets.held ?? 0),
      },
      queue: { pendingDeposits },
    };
  }

  /** GET /api/v1/accounting/daily?from=&to= — flujo por día (gráfico). */
  @Get('daily')
  async daily(@Query('from') from?: string, @Query('to') to?: string) {
    const { start, end } = range(from, to);
    const rows = await this.txModel.aggregate([
      {
        $match: {
          status: TransactionStatus.COMPLETED,
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            t: '$type',
          },
          total: { $sum: { $abs: '$amount' } },
        },
      },
      { $sort: { '_id.d': 1 } },
    ]);

    const byDay: Record<string, any> = {};
    for (const r of rows) {
      const d = r._id.d;
      byDay[d] ??= { date: d, recargas: 0, boletos: 0, tienda: 0, canjeado: 0 };
      if (r._id.t === TransactionType.DEPOSIT_YAPE) byDay[d].recargas += r.total;
      if (r._id.t === TransactionType.TICKET_PURCHASE) byDay[d].boletos += r.total;
      if (r._id.t === TransactionType.MARKETPLACE_PURCHASE) byDay[d].tienda += r.total;
      if (r._id.t === TransactionType.CERO_PERDIDA_REFUND) byDay[d].canjeado += r.total;
    }
    return Object.values(byDay);
  }

  /** GET /api/v1/accounting/ledger?type=&from=&to=&limit= — libro mayor. */
  @Get('ledger')
  async ledger(
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit = '200',
  ) {
    const { start, end } = range(from, to);
    const filter: any = { createdAt: { $gte: start, $lte: end } };
    if (type) filter.type = type;
    return this.txModel
      .find(filter)
      .populate('userId', 'name dni')
      .sort({ createdAt: -1 })
      .limit(Math.min(1000, Number(limit) || 200))
      .lean();
  }
}
