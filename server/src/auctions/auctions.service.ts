import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { normalizeStreamUrl } from '../raffles/stream-url.util';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ANTI_SNIPE_EXTENSION_MS, ANTI_SNIPE_WINDOW_MS, Auction, AuctionBid,
  AuctionBidDocument, AuctionDocument, AuctionStatus,
} from './auction.schema';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.schema';
import {
  Transaction, TransactionDocument, TransactionStatus, TransactionType,
} from '../transactions/transaction.schema';
import { LogisticsERP, LogisticsERPDocument } from '../logistics/logistics.schema';
import { maskName } from '../common/mask-name.util';

export const AUCTIONS_FLAG_KEY = 'auctions';

/** Resultado que se transmite a la sala tras cada puja. */
export interface BidBroadcast {
  auctionId: string;
  currentBid: { name: string; amount: number; at: Date };
  bidsCount: number;
  endAt: Date;
  extended: boolean;
}

@Injectable()
export class AuctionsService {
  private readonly logger = new Logger(AuctionsService.name);

  /**
   * MUTEX por subasta: las pujas de una misma subasta se procesan EN
   * SERIE (cadena de promesas). Elimina la carrera puja-vs-puja dentro
   * del nodo; los guards atómicos de billetera protegen el dinero
   * incluso si algo se colara.
   */
  private locks = new Map<string, Promise<any>>();

  constructor(
    @InjectModel(Auction.name) private auctionModel: Model<AuctionDocument>,
    @InjectModel(AuctionBid.name) private bidModel: Model<AuctionBidDocument>,
    @InjectModel(Transaction.name) private txModel: Model<TransactionDocument>,
    @InjectModel(LogisticsERP.name) private erpModel: Model<LogisticsERPDocument>,
    private readonly usersService: UsersService,
    private readonly settingsService: SettingsService,
    private readonly notifService: NotificationsService,
  ) {}

  /** ¿El admin tiene el módulo encendido? */
  async isEnabled(): Promise<boolean> {
    const cfg = await this.settingsService.get<{ enabled: boolean }>(AUCTIONS_FLAG_KEY, { enabled: false });
    return !!cfg?.enabled;
  }

  private async assertEnabled() {
    if (!(await this.isEnabled())) {
      throw new ForbiddenException('El módulo de subastas está deshabilitado por el administrador');
    }
  }

  // ── Listados ────────────────────────────────────────────────────
  /** Vitrina pública: programadas, en vivo y las últimas terminadas. */
  async findPublic(userId?: string) {
    await this.assertEnabled();
    const auctions = await this.auctionModel
      .find({ status: { $in: [AuctionStatus.SCHEDULED, AuctionStatus.LIVE, AuctionStatus.FINISHED] } })
      .sort({ status: 1, startAt: 1 })
      .limit(60)
      .lean();
    return auctions.map((a) => this.toPublic(a, userId));
  }

  async findOnePublic(id: string, userId?: string) {
    await this.assertEnabled();
    const auction = await this.auctionModel.findById(id).lean();
    if (!auction) throw new NotFoundException('Subasta no existe');
    return this.toPublic(auction, userId);
  }

  /** Sin lista de matriculados ni IDs ajenos; nombres enmascarados. */
  private toPublic(a: any, userId?: string) {
    return {
      _id: a._id,
      title: a.title,
      description: a.description,
      emoji: a.emoji,
      images: a.images,
      basePrice: a.basePrice,
      minIncrement: a.minIncrement,
      buyNowPrice: a.buyNowPrice,
      startAt: a.startAt,
      endAt: a.endAt,
      status: a.status,
      mode: a.mode ?? 'auto',
      streamUrl: a.streamUrl ?? '',
      bidsCount: a.bidsCount,
      enrolledCount: a.enrolled?.length ?? 0,
      amIEnrolled: userId ? a.enrolled?.some((e: any) => e.toString() === userId) : false,
      amILeader: userId && a.currentBid ? a.currentBid.userId === userId : false,
      currentBid: a.currentBid
        ? { name: maskName(a.currentBid.name), amount: a.currentBid.amount, at: a.currentBid.at }
        : null,
      winner: a.winner ? { name: maskName(a.winner.name), amount: a.winner.amount } : null,
    };
  }

  /** Últimas pujas para la sala (nombres enmascarados). */
  async recentBids(auctionId: string) {
    const bids = await this.bidModel
      .find({ auctionId })
      .sort({ createdAt: -1 })
      .limit(12)
      .populate('userId', 'name')
      .lean();
    return bids.map((b) => ({
      name: maskName((b.userId as any)?.name ?? ''),
      amount: b.amount,
      at: (b as any).createdAt,
    }));
  }

  // ── Matrícula ───────────────────────────────────────────────────
  async enroll(userId: string, auctionId: string) {
    await this.assertEnabled();
    const auction = await this.auctionModel.findOneAndUpdate(
      { _id: auctionId, status: { $in: [AuctionStatus.SCHEDULED, AuctionStatus.LIVE] } },
      { $addToSet: { enrolled: new Types.ObjectId(userId) } },
      { new: true },
    );
    if (!auction) throw new BadRequestException('La subasta no existe o ya terminó');
    await this.notifService.notifyUser(
      userId,
      `🔨 Matriculado en la subasta "${auction.title}". Te avisaremos cuando esté por empezar (${auction.startAt.toLocaleString('es-PE')}).`,
      NotificationType.GENERAL,
    );
    return { enrolled: true, enrolledCount: auction.enrolled.length };
  }

  /** Guardia de la sala: solo matriculados entran a pujar. */
  async assertEnrolled(userId: string, auctionId: string) {
    const auction = await this.auctionModel.findById(auctionId).select('enrolled status');
    if (!auction) throw new NotFoundException('Subasta no existe');
    if (!auction.enrolled.some((e) => e.toString() === userId)) {
      throw new ForbiddenException('Debes matricularte antes para participar en esta subasta');
    }
    return auction;
  }

  // ── PUJA en tiempo real (dinero REAL con retención) ─────────────
  placeBid(userId: string, userName: string, auctionId: string, amount: number): Promise<BidBroadcast> {
    // Serializar por subasta
    const prev = this.locks.get(auctionId) ?? Promise.resolve();
    const task = prev
      .catch(() => {}) // El error de la puja anterior no bloquea la cadena
      .then(() => this.doPlaceBid(userId, userName, auctionId, Math.floor(amount)));
    this.locks.set(auctionId, task);
    return task;
  }

  private async doPlaceBid(userId: string, userName: string, auctionId: string, amount: number): Promise<BidBroadcast> {
    await this.assertEnabled();
    const auction = await this.auctionModel.findById(auctionId);
    if (!auction) throw new NotFoundException('Subasta no existe');
    if (auction.status !== AuctionStatus.LIVE) throw new BadRequestException('La subasta no está en vivo');
    if (auction.endAt.getTime() <= Date.now()) throw new BadRequestException('La subasta ya cerró');
    if (!auction.enrolled.some((e) => e.toString() === userId)) {
      throw new ForbiddenException('Debes matricularte para pujar');
    }

    const minAllowed = auction.currentBid
      ? auction.currentBid.amount + auction.minIncrement
      : auction.basePrice;
    if (amount < minAllowed) {
      throw new BadRequestException(`La puja mínima es S/ ${minAllowed}`);
    }
    if (auction.currentBid?.userId === userId) {
      throw new BadRequestException('Ya eres el líder — espera a que alguien te supere');
    }

    // 1. RETENER el dinero REAL del nuevo postor (guard de saldo contable)
    await this.usersService.holdFunds(userId, amount);

    // 2. Liberar la retención del líder anterior
    const previous = auction.currentBid;
    if (previous) {
      try {
        await this.usersService.releaseFunds(previous.userId, previous.amount);
        await this.notifService.notifyUser(
          previous.userId,
          `⚡ Te superaron en "${auction.title}": nueva puja S/ ${amount}. Tus S/ ${previous.amount} ya están de vuelta en tu saldo. ¡Aún puedes recuperar el liderato!`,
          NotificationType.GENERAL,
        );
      } catch (err) {
        // Nunca dejar dinero doblemente retenido: revertir la nuestra
        await this.usersService.releaseFunds(userId, amount);
        throw err;
      }
    }

    // 3. ANTI-SNIPING: puja en la ventana final → extiende el cierre
    const now = Date.now();
    let extended = false;
    let endAt = auction.endAt;
    if (auction.endAt.getTime() - now <= ANTI_SNIPE_WINDOW_MS) {
      endAt = new Date(auction.endAt.getTime() + ANTI_SNIPE_EXTENSION_MS);
      extended = true;
    }

    auction.currentBid = { userId, name: userName, amount, at: new Date() } as any;
    auction.bidsCount += 1;
    auction.endAt = endAt;
    await auction.save();
    await this.bidModel.create({ auctionId, userId, amount });

    return {
      auctionId,
      currentBid: { name: maskName(userName), amount, at: new Date() },
      bidsCount: auction.bidsCount,
      endAt,
      extended,
    };
  }

  /** CÓMPRALO YA: paga el precio fijo al instante y cierra la subasta. */
  async buyNow(userId: string, userName: string, auctionId: string) {
    const prev = this.locks.get(auctionId) ?? Promise.resolve();
    const task = prev.catch(() => {}).then(async () => {
      await this.assertEnabled();
      const auction = await this.auctionModel.findById(auctionId);
      if (!auction || auction.status !== AuctionStatus.LIVE) {
        throw new BadRequestException('La subasta no está en vivo');
      }
      if (!auction.buyNowPrice) throw new BadRequestException('Esta subasta no tiene "Cómpralo ya"');
      if (!auction.enrolled.some((e) => e.toString() === userId)) {
        throw new ForbiddenException('Debes matricularte para comprar');
      }

      // Retener + consumir en el acto (mismo camino del dinero que una puja ganadora)
      await this.usersService.holdFunds(userId, auction.buyNowPrice);
      return this.finalize(auction, { userId, name: userName, amount: auction.buyNowPrice });
    });
    this.locks.set(auctionId, task);
    return task;
  }

  /** Cierre: consume la retención del ganador, ledger, ERP y avisos. */
  private async finalize(
    auction: AuctionDocument,
    winner: { userId: string; name: string; amount: number } | null,
  ) {
    // Candado de estado: solo un cierre gana
    const claimed = await this.auctionModel.findOneAndUpdate(
      { _id: auction._id, status: AuctionStatus.LIVE },
      { status: AuctionStatus.FINISHED, winner, endAt: new Date() },
      { new: true },
    );
    if (!claimed) return null;

    if (winner) {
      // Se libera el dinero retenido (Reembolso Cero Pérdida) en lugar de consumirlo
      await this.usersService.releaseFunds(winner.userId, winner.amount);
      
      await this.erpModel.create({
        raffleId: auction._id, // Reutilizamos el ERP: el "sorteo" es la subasta
        productName: `🔨 ${auction.title}`,
        purchaseCost: 0,
        winnerId: winner.userId,
        history: [{ label: `Subasta ganada por S/ ${winner.amount}`, at: new Date() }],
      });
      await this.notifService.notifyUser(
        winner.userId,
        `🏆 ¡GANASTE la subasta "${auction.title}"! Tu dinero retenido (S/ ${winner.amount}) ha sido liberado a tu favor. Coordinaremos la entrega a tu dirección.`,
        NotificationType.GENERAL,
      );
      this.logger.log(`Subasta "${auction.title}" ganada por ${winner.name} — S/ ${winner.amount}`);
    } else {
      this.logger.log(`Subasta "${auction.title}" cerró SIN pujas`);
    }
    return { finished: true, winner: winner ? { name: maskName(winner.name), amount: winner.amount } : null };
  }

  // ── CRON: arranques, avisos y cierres ───────────────────────────
  @Cron(CronExpression.EVERY_MINUTE)
  async lifecycle() {
    if (!(await this.isEnabled())) return;
    const now = new Date();

    // Aviso "empieza pronto" (15 min antes) a los matriculados
    const soon = await this.auctionModel.find({
      status: AuctionStatus.SCHEDULED,
      startSoonNotified: false,
      startAt: { $gt: now, $lte: new Date(now.getTime() + 15 * 60 * 1000) },
    });
    for (const a of soon) {
      await Promise.all(a.enrolled.map((uid) =>
        this.notifService.notifyUser(
          uid.toString(),
          `⏰ La subasta "${a.title}" empieza en menos de 15 minutos. ¡Ten tu saldo listo!`,
          NotificationType.GENERAL,
        )));
      a.startSoonNotified = true;
      await a.save();
    }

    // Arranque automático: scheduled → live + aviso "¡EMPEZÓ!".
    // Las MODERADAS no arrancan solas: las abre el admin con ▶ cuando su
    // transmisión ya está al aire (el cierre por reloj sí se mantiene).
    const starting = await this.auctionModel.find({
      status: AuctionStatus.SCHEDULED,
      startAt: { $lte: now },
      mode: { $ne: 'moderated' },
    });
    for (const a of starting) {
      a.status = AuctionStatus.LIVE;
      a.startNotified = true;
      await a.save();
      await Promise.all(a.enrolled.map((uid) =>
        this.notifService.notifyUser(
          uid.toString(),
          `🔴 ¡La subasta "${a.title}" EMPEZÓ! Entra ya a pujar — cierra ${a.endAt.toLocaleTimeString('es-PE')}.`,
          NotificationType.GENERAL,
        )));
      this.logger.log(`Subasta "${a.title}" EN VIVO (${a.enrolled.length} matriculados)`);
    }

    // Cierre: live vencidas → finalizar con el líder actual
    const ending = await this.auctionModel.find({
      status: AuctionStatus.LIVE,
      endAt: { $lte: now },
    });
    for (const a of ending) {
      await this.finalize(a, a.currentBid
        ? { userId: a.currentBid.userId, name: a.currentBid.name, amount: a.currentBid.amount }
        : null);
    }
  }

  // ── ADMIN ───────────────────────────────────────────────────────
  /** Listado del panel: paginado (tope 100) — las subastas se acumulan. */
  async findAllAdmin(opts: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
    const [items, total] = await Promise.all([
      this.auctionModel.find().sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      this.auctionModel.countDocuments(),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  create(data: Partial<Auction>) {
    // Las nuevas subastas siempre nacen como borradores
    return this.auctionModel.create({ ...data, status: AuctionStatus.DRAFT });
  }

  /**
   * PUBLICAR (admin): Pasa la subasta de DRAFT a SCHEDULED para que sea visible
   * en la tienda y los usuarios puedan matricularse.
   */
  async publish(id: string) {
    const auction = await this.auctionModel.findOneAndUpdate(
      { _id: id, status: AuctionStatus.DRAFT },
      { status: AuctionStatus.SCHEDULED },
      { new: true }
    );
    if (!auction) {
      throw new BadRequestException('La subasta no existe o ya no es un borrador');
    }
    return auction;
  }

  /**
   * Enlace de transmisión (modo moderado): editable incluso EN VIVO, para
   * poder recuperar una transmisión caída sin cancelar la subasta.
   */
  async setStream(id: string, rawUrl: string) {
    // normalizeStreamUrl devuelve { ok, url, platform } — NO una cadena.
    // Guardarlo entero dejaba "[object Object]" en el campo y el video
    // nunca cargaba. Desestructurar y validar antes de tocar la BD.
    const { ok, url } = normalizeStreamUrl(rawUrl ?? '');
    if (!ok) {
      throw new BadRequestException(
        'El enlace de transmisión no es válido (usa YouTube, Twitch, Kick, TikTok o Facebook)',
      );
    }
    const auction = await this.auctionModel.findByIdAndUpdate(
      id,
      { streamUrl: url, mode: 'moderated' },
      { new: true },
    );
    if (!auction) throw new NotFoundException('Subasta no existe');
    return auction.toObject();
  }

  async update(id: string, data: Partial<Auction>) {
    const auction = await this.auctionModel.findOneAndUpdate(
      { _id: id, status: { $in: [AuctionStatus.DRAFT, AuctionStatus.SCHEDULED] } }, // Solo editables antes de empezar
      data,
      { new: true },
    );
    if (!auction) throw new BadRequestException('Solo se editan subastas programadas');
    return auction;
  }

  /** Cancelar: libera la retención del líder y avisa a los matriculados. */
  /**
   * INICIAR AHORA (admin): sin esperar el cron ni la hora programada.
   * Conserva la DURACIÓN original (endAt - startAt) desde este instante.
   */
  async startNow(id: string) {
    const auction = await this.auctionModel.findById(id);
    if (!auction) throw new NotFoundException('Subasta no existe');
    if (auction.status !== AuctionStatus.SCHEDULED) {
      throw new BadRequestException('Solo se puede iniciar una subasta programada');
    }
    const durationMs = Math.max(
      5 * 60 * 1000,
      new Date(auction.endAt).getTime() - new Date(auction.startAt).getTime(),
    );
    auction.startAt = new Date();
    auction.endAt = new Date(Date.now() + durationMs);
    auction.status = AuctionStatus.LIVE;
    auction.startNotified = true;
    await auction.save();

    for (const uid of auction.enrolled ?? []) {
      try {
        await this.notifService.notifyUser(
          uid.toString(),
          `🔨 ¡ARRANCÓ la subasta "${auction.title}"! Entra ya a pujar — cierra ${auction.endAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}.`,
          NotificationType.GENERAL,
        );
      } catch { /* una notificación fallida no detiene el arranque */ }
    }
    return auction.toObject();
  }

  /**
   * TERMINAR AHORA (admin): sin esperar la hora de fin. 
   * Fuerza el cierre de la subasta con el postor actual.
   */
  async finishNow(id: string) {
    const auction = await this.auctionModel.findById(id);
    if (!auction) throw new NotFoundException('Subasta no existe');
    if (auction.status !== AuctionStatus.LIVE) {
      throw new BadRequestException('Solo se puede terminar una subasta que esté EN VIVO');
    }
    
    // Llamar al flujo normal de cierre
    const winnerData = auction.currentBid
      ? { userId: auction.currentBid.userId, name: auction.currentBid.name, amount: auction.currentBid.amount }
      : null;
      
    await this.finalize(auction, winnerData);
    
    return { success: true, message: 'Subasta finalizada' };
  }

  async cancel(id: string, reason: string) {
    const auction = await this.auctionModel.findOneAndUpdate(
      { _id: id, status: { $in: [AuctionStatus.SCHEDULED, AuctionStatus.LIVE] } },
      { status: AuctionStatus.CANCELLED },
      { new: false }, // Necesitamos el currentBid previo
    );
    if (!auction) throw new BadRequestException('La subasta no existe o ya terminó');

    if (auction.currentBid) {
      await this.usersService.releaseFunds(auction.currentBid.userId, auction.currentBid.amount);
    }
    await Promise.all(auction.enrolled.map((uid) =>
      this.notifService.notifyUser(
        uid.toString(),
        `❌ La subasta "${auction.title}" fue cancelada. Motivo: ${reason}. Si tenías la puja líder, tu dinero ya volvió a tu saldo.`,
        NotificationType.GENERAL,
      )));
    return { cancelled: true };
  }

  async addImages(id: string, urls: string[]) {
    const auction = await this.auctionModel.findByIdAndUpdate(
      id, { $push: { images: { $each: urls } } }, { new: true },
    );
    if (!auction) throw new NotFoundException('Subasta no existe');
    return auction;
  }
}
