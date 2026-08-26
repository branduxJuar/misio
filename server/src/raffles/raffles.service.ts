import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DrawMode, Raffle, RaffleDocument, RaffleStatus } from './raffle.schema';

/** Lo que ve el cliente en una lista de rifas. */
export type RaffleListItem = Raffle & {
  _id: unknown;
  /** Alias de soldCount (compatibilidad con el cliente). */
  soldTickets: number;
};
import { CreateRaffleDto, UpdateRaffleDto } from './dto/raffle.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.schema';
import { normalizeStreamUrl } from './stream-url.util';
import { maskName } from '../common/mask-name.util';
import { Ticket, TicketDocument } from '../tickets/ticket.schema';

import { RaffleClosingService } from './raffle-closing.service';

@Injectable()
export class RafflesService {
  constructor(
    @InjectModel(Raffle.name) private raffleModel: Model<RaffleDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    private readonly notifService: NotificationsService,
    private readonly closingService: RaffleClosingService,
  ) {}

  async create(dto: CreateRaffleDto) {
    const isPaquete = dto.type === 'paquete';

    // MODO DIRECTO: una sola tirada y es la ganadora
    if (!isPaquete) {
      if (dto.drawMode === DrawMode.DIRECT) (dto as any).winningAttempt = 1;
    } else {
      if (!dto.prizes || dto.prizes.length === 0) {
        throw new BadRequestException('Un sorteo paquete debe tener al menos un premio');
      }
      dto.prizes.forEach(p => {
        if (p.drawMode === DrawMode.DIRECT) p.winningAttempt = 1;
        else p.winningAttempt = p.winningAttempt ?? 3;
      });
    }

    const prefix = dto.ticketPrefix.toUpperCase();
    const existing = await this.raffleModel.findOne({ 
      ticketPrefix: prefix, 
      status: { $in: [RaffleStatus.ACTIVE, RaffleStatus.LIVE] } 
    });
    if (existing) {
      throw new BadRequestException(`El código/prefijo "${prefix}" ya está en uso por un sorteo que está actualmente en curso. Debe ser único entre los sorteos activos.`);
    }

    return this.raffleModel.create({
      ...dto,
      ticketPrefix: prefix,
      winningAttempt: !isPaquete && dto.drawMode === DrawMode.DIRECT ? 1 : (dto.winningAttempt ?? 3),
      drawDate: new Date(dto.drawDate),
    });
  }

  /** Vitrina pública: rifas en venta o en vivo con conteo de vendidos. */
  findActive(): Promise<RaffleListItem[]> {
    return this.aggregateWithSold({ status: { $in: [RaffleStatus.ACTIVE, RaffleStatus.LIVE] } });
  }

  /** Panel admin: TODAS las rifas (incluye completadas y canceladas). */
  findAllAdmin(): Promise<RaffleListItem[]> {
    return this.aggregateWithSold({});
  }

  /**
   * Lista de rifas con lo vendido. Lectura pura sobre la colección de
   * rifas (índice status+drawDate): sin $lookup, sin tocar boletos.
   * `soldTickets` se mantiene por compatibilidad con el cliente.
   */
  private async aggregateWithSold(match: Record<string, unknown>): Promise<RaffleListItem[]> {
    const raffles = await this.raffleModel
      .find(match)
      .sort({ drawDate: 1, createdAt: -1 })
      .select('-__v')
      .limit(200)
      .lean();
    return raffles.map((r) => ({ ...r, soldTickets: r.soldCount ?? 0 })) as RaffleListItem[];
  }

  /**
   * REINICIAR TIRADAS (admin): devuelve al juego los boletos quemados
   * "al agua". Rescate para una rifa ATASCADA — pruebas con código viejo
   * o una transmisión caída a mitad de sorteo dejaban todos los boletos
   * quemados y el sorteo imposible ("no quedan boletos activos") sin
   * salida posible.
   * Solo si la rifa NO tiene ganador: un sorteo con ganador declarado es
   * un resultado público y no se rebobina.
   */
  async resetDraws(id: string, prizeIndex?: number) {
    const raffle = await this.raffleModel.findById(id);
    if (!raffle) throw new NotFoundException('Rifa no existe');
    
    if (raffle.refundsProcessed) {
      throw new BadRequestException(
        'No se puede reiniciar: los reembolsos de Cero Pérdida ya fueron entregados. El sorteo es definitivo.',
      );
    }

    const rid: any = { $in: [raffle._id, id] };

    // Si la rifa es paquete y se especificó un premio, solo resetea ese premio
    if (raffle.type === 'paquete' && prizeIndex !== undefined) {
      const res = await this.ticketModel.updateMany(
        { raffleId: rid, status: { $in: ['burned_al_agua', 'winner'] }, prizeIndex },
        { status: 'active', $unset: { prizeIndex: 1 } },
      );
      
      if (raffle.prizes?.[prizeIndex]) {
        raffle.prizes[prizeIndex].winner = null as any;
      }
      
      await raffle.save();

      return {
        restaurados: res.modifiedCount,
        mensaje: res.modifiedCount > 0
          ? `${res.modifiedCount} boleto(s) devueltos al juego para el premio actual`
          : 'No había boletos que restaurar para este premio',
      };
    }

    const res = await this.ticketModel.updateMany(
      { raffleId: rid, status: { $in: ['burned_al_agua', 'winner'] } },
      { status: 'active', $unset: { prizeIndex: 1 } },
    );

    (raffle as any).winner = null;
    if (raffle.type === 'paquete') {
      raffle.prizes?.forEach(p => p.winner = null as any);
    }
    
    if (raffle.status === RaffleStatus.COMPLETED) {
      raffle.status = RaffleStatus.LIVE;
    }
    await raffle.save();

    try {
      const erpColl = this.ticketModel.db.collection('logisticserps');
      await erpColl.deleteOne({ raffleId: raffle._id });
    } catch (e) {}

    return {
      restaurados: res.modifiedCount,
      mensaje: res.modifiedCount > 0
        ? `${res.modifiedCount} boleto(s) devueltos al juego — la tómbola puede girar de nuevo`
        : 'No había boletos que restaurar',
    };
  }

  /**
   * RECONCILIACIÓN (admin): recuenta de verdad y corrige el contador si
   * alguna vez se desvía (import manual, borrado directo en la BD…).
   * Los contadores denormalizados necesitan SIEMPRE una forma de volver
   * a la verdad.
   */
  async recountSold(id?: string) {
    const filter = id ? { _id: id } : {};
    const raffles = await this.raffleModel.find(filter).select('_id').lean();
    const fixed: Array<{ raffleId: string; before: number; after: number }> = [];
    for (const r of raffles) {
      const real = await this.ticketModel.countDocuments({ raffleId: r._id });
      const doc = await this.raffleModel.findOneAndUpdate(
        { _id: r._id, soldCount: { $ne: real } },
        { soldCount: real },
      );
      if (doc) fixed.push({ raffleId: String(r._id), before: doc.soldCount ?? 0, after: real });
    }
    return { revisadas: raffles.length, corregidas: fixed.length, detalle: fixed };
  }

  async findOne(id: string) {
    const raffle = await this.raffleModel.findById(id).lean();
    if (!raffle) throw new NotFoundException(`Rifa ${id} no existe`);
    return raffle;
  }

  /** EDICIÓN de todos los campos — solo mientras la rifa está en venta. */
  async update(id: string, dto: UpdateRaffleDto) {
    const raffle = await this.raffleModel.findById(id);
    if (!raffle) throw new NotFoundException('Rifa no existe');
    if (raffle.status !== RaffleStatus.ACTIVE) {
      throw new BadRequestException('Solo se puede editar una rifa en venta (status active)');
    }

    const patch: any = { ...dto };
    if (dto.ticketPrefix) {
      const prefix = dto.ticketPrefix.toUpperCase();
      const existing = await this.raffleModel.findOne({ 
        ticketPrefix: prefix, 
        _id: { $ne: id },
        status: { $in: [RaffleStatus.ACTIVE, RaffleStatus.LIVE] } 
      });
      if (existing) {
        throw new BadRequestException(`El código/prefijo "${prefix}" ya está en uso por un sorteo que está actualmente en curso. Debe ser único entre los sorteos activos.`);
      }
      patch.ticketPrefix = prefix;
    }
    if (dto.drawDate) patch.drawDate = new Date(dto.drawDate);
    
    // Si se está cambiando el tipo o si es paquete y estamos actualizando premios
    const isPaquete = dto.type === 'paquete' || (raffle.type === 'paquete' && !dto.type);
    
    if (!isPaquete) {
      if (dto.drawMode === DrawMode.DIRECT) patch.winningAttempt = 1;
    } else {
      if (dto.prizes) {
        if (dto.prizes.length === 0) {
          throw new BadRequestException('Un sorteo paquete debe tener al menos un premio');
        }
        dto.prizes.forEach(p => {
          if (p.drawMode === DrawMode.DIRECT) p.winningAttempt = 1;
          else p.winningAttempt = p.winningAttempt ?? 3;
        });
        patch.prizes = dto.prizes;
      }
    }

    return this.raffleModel.findByIdAndUpdate(id, patch, { new: true });
  }

  /**
   * APLAZAR: guarda el motivo en el historial, mueve la fecha, resetea el
   * flag del recordatorio (para que el cron avise de nuevo cerca de la
   * nueva fecha) y NOTIFICA a todos los compradores con el motivo.
   */
  async postpone(id: string, reason: string, newDate: string) {
    const raffle = await this.raffleModel.findById(id);
    if (!raffle) throw new NotFoundException('Rifa no existe');
    if (raffle.status !== RaffleStatus.ACTIVE) {
      throw new BadRequestException('Solo se puede aplazar una rifa en venta');
    }

    const oldDate = raffle.drawDate;
    raffle.postponements.push({ reason, oldDate, newDate: new Date(newDate), at: new Date() } as any);
    raffle.drawDate = new Date(newDate);
    raffle.dayBeforeNotified = false;
    await raffle.save();

    const { notified } = await this.notifService.notifyRaffleBuyers(
      id,
      `📅 El sorteo de "${raffle.title}" se aplazó al ${raffle.drawDate.toLocaleString('es-PE')}. Motivo: ${reason}. Tus boletos siguen siendo válidos.`,
      NotificationType.RAFFLE_POSTPONED,
    );

    return { raffle, notified };
  }

  /** Agrega URLs de fotos del producto (tras el upload Multer). */
  async addImages(id: string, urls: string[]) {
    const raffle = await this.raffleModel.findByIdAndUpdate(
      id,
      { $push: { images: { $each: urls } } },
      { new: true },
    );
    if (!raffle) throw new NotFoundException('Rifa no existe');
    return raffle;
  }

  async removeImage(id: string, url: string) {
    const raffle = await this.raffleModel.findByIdAndUpdate(
      id,
      { $pull: { images: url } },
      { new: true },
    );
    if (!raffle) throw new NotFoundException('Rifa no existe');
    return raffle;
  }

  /**
   * Link de transmisión: editable incluso con la rifa EN VIVO.
   * NORMALIZA el link (YouTube watch → embed, Twitch/Kick → player) para
   * que el iframe funcione siempre, pegues el link que pegues.
   */
  async setStreamUrl(id: string, streamUrl: string) {
    const { ok, url, platform } = normalizeStreamUrl(streamUrl);
    if (!ok) {
      throw new BadRequestException(
        `No pude reconocer ese link de ${platform === 'invalido' ? 'transmisión' : platform}. ` +
        'Pega el link del video/canal (ej: youtube.com/watch?v=…, twitch.tv/canal, kick.com/canal)',
      );
    }
    const raffle = await this.raffleModel.findOneAndUpdate(
      { _id: id, status: { $in: [RaffleStatus.ACTIVE, RaffleStatus.LIVE] } },
      { streamUrl: url },
      { new: true },
    );
    if (!raffle) throw new NotFoundException('Rifa no existe o ya terminó');
    return { ...raffle.toObject(), _platform: platform };
  }

  /** Transición de estado: active → live → completed (Modo Presentador). */
  async setStatus(id: string, status: RaffleStatus) {
    const raffle = await this.raffleModel.findByIdAndUpdate(id, { status }, { new: true });
    if (!raffle) throw new NotFoundException(`Rifa ${id} no existe`);
    
    // Si la pasamos a completed manualmente, ejecutamos el cierre orquestado
    if (status === RaffleStatus.COMPLETED) {
      try {
        await this.closingService.closeRaffle(id);
      } catch (e) {
        // Log the error but don't fail the status change
        console.error('Error al cerrar la rifa:', e);
      }
    }
    
    return raffle;
  }

  /**
   * DIAGNÓSTICO de una rifa: responde "¿por qué la tómbola está en 0?"
   * con datos, no con adivinanzas. Desglosa boletos por estado y cuenta
   * las compras PENDIENTES de confirmación de pago (Yape) — que no
   * generan boletos hasta que el admin las confirma en Pagos.
   */
  async diagnostics(id: string) {
    const raffle = await this.raffleModel.findById(id).lean();
    if (!raffle) throw new NotFoundException('Rifa no existe');

    const [active, burned, winner, total] = await Promise.all([
      this.ticketModel.countDocuments({ raffleId: id, status: 'active' }),
      this.ticketModel.countDocuments({ raffleId: id, status: 'burned_al_agua' }),
      this.ticketModel.countDocuments({ raffleId: id, status: 'winner' }),
      this.ticketModel.countDocuments({ raffleId: id }),
    ]);

    // Compras pendientes de pago (Yape sin confirmar): viven en
    // transactions como PENDING con esta rifa en el meta.
    let pendingPurchases = 0;
    let pendingNumbers: number[] = [];
    try {
      const txColl = this.ticketModel.db.collection('transactions');
      const pending = await txColl.find({
        status: 'pending',
        'meta.raffleId': id,
      }).toArray();
      pendingPurchases = pending.length;
      pendingNumbers = pending.flatMap((t: any) => t.meta?.ticketNumbers ?? []).slice(0, 50);
    } catch { /* si falla, el resto del diagnóstico sigue */ }

    return {
      raffleStatus: raffle.status,
      totalTickets: (raffle as any).totalTickets ?? 0,
      sold: total,
      active,
      burned,
      winner,
      pendingPurchases,
      pendingNumbers,
    };
  }

}
