import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { maskName } from '../common/mask-name.util';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DrawMode, Raffle, RaffleDocument, RaffleStatus } from '../raffles/raffle.schema';
import { Ticket, TicketDocument, TicketStatus } from '../tickets/ticket.schema';
import { ClosingSummary, RaffleClosingService } from '../raffles/raffle-closing.service';

/**
 * Máscara de privacidad: "Brandon Juarez Pérez" → "BRAN… JUA…".
 * Se usa en la lista pública, la tómbola virtual y los anuncios de tirada.
 */


/** Resultado de una tirada, tal como se emite por WebSocket a la sala. */
export interface DrawResult {
  attempt: number;
  totalAttempts: number;
  result: 'al_agua' | 'winner';
  ticketNumber: number;
  holderName: string;
  drawnAt: string;
  prizeIndex?: number;
  isManual?: boolean;
  winnerUserId?: string;
  /** Solo en la tirada ganadora: resumen del cierre Cero Pérdida. */
  closing?: ClosingSummary;
  /**
   * Si la tirada ganadora salió bien pero el CIERRE (reembolsos +
   * asignación en Logística) falló, este mensaje lo dice. Sin esto, el
   * admin ve "hay ganador" y dos pantallas después no encuentra a nadie
   * en Logística, sin ninguna pista de qué pasó.
   */
  closingError?: string;
}

/** Reexport temporal: los módulos que ya lo importaban desde aquí siguen
 *  funcionando mientras migran a `common/mask-name.util`. */

@Injectable()
export class LiveService {
  constructor(
    @InjectModel(Raffle.name) private raffleModel: Model<RaffleDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    private readonly closingService: RaffleClosingService,
  ) {}

  /**
   * Estado inicial de la sala (REST, al entrar): rifa + tiradas ya
   * ejecutadas + participantes. El resto llega por WebSocket.
   */
  async getRoomState(raffleId: string, reqUser?: any) {
    const isAdmin = reqUser?.role === 'admin';
    const raffle = await this.raffleModel.findById(raffleId).lean();
    if (!raffle) throw new NotFoundException('Rifa no existe');

    // Match robusto: acepta el raffleId guardado como ObjectId O como
    // string (por datos de distintas versiones). Un countDocuments normal
    // castea, pero lo hacemos explícito para que NUNCA devuelva 0 por un
    // desajuste de tipos — que es justo lo que dejaba la tómbola vacía
    // teniendo boletos.
    const rid: any = { $in: [raffle._id, String(raffle._id)] };

    const [draws, activeCount, participants] = await Promise.all([
      this.ticketModel
        .find({ raffleId: rid, status: { $in: [TicketStatus.BURNED_AL_AGUA, TicketStatus.WINNER] } })
        .populate('userId', 'name')
        .sort({ updatedAt: 1 })
        .lean(),
      this.ticketModel.countDocuments({ raffleId: rid, status: TicketStatus.ACTIVE }),
      this.ticketModel
        .find({ raffleId: rid })
        .populate('userId', 'name')
        .sort({ status: 1, ticketNumber: 1 })
        .limit(200)
        .lean(),
    ]);

    return {
      raffle,
      currentAttempt: draws.length + 1,
      activeCount,
      draws: draws.map((t, i) => {
        const unmaskedName = (t as any).isOffline ? ((t as any).buyerName || 'Cliente Físico') : ((t.userId as any)?.name || 'Usuario');
        const res: any = {
          attempt: i + 1, // Frontend can recalculate attempt per prize
          result: t.status === TicketStatus.WINNER ? 'winner' : 'al_agua',
          ticketNumber: t.ticketNumber,
          holderName: maskName(unmaskedName),
          prizeIndex: t.prizeIndex,
        };
        if (isAdmin) {
          res.unmaskedName = unmaskedName;
          res.isOffline = (t as any).isOffline || false;
          res.paymentMethod = (t as any).paymentMethod;
        }
        return res;
      }),
      participants: participants.map((t) => {
        const unmaskedName = (t as any).isOffline ? ((t as any).buyerName || 'Cliente Físico') : ((t.userId as any)?.name || 'Usuario');
        const isMine = reqUser && !((t as any).isOffline) && (t.userId as any)?._id?.toString() === (reqUser.userId || reqUser._id)?.toString();
        const res: any = {
          name: maskName(unmaskedName),
          ticketNumber: t.ticketNumber,
          code: (t as any).code || undefined,
          status: t.status,
          prizeIndex: t.prizeIndex,
          isMine,
        };
        if (isAdmin) {
          res.unmaskedName = unmaskedName;
          res.isOffline = (t as any).isOffline || false;
          res.paymentMethod = (t as any).paymentMethod;
        }
        return res;
      }),
    };
  }

  /**
   * TIRADA DE LA TÓMBOLA (solo presentador/admin, vía gateway):
   * - El número de intento se DERIVA de los boletos ya quemados (stateless:
   *   si el server se reinicia a mitad de sorteo, no se pierde el conteo).
   * - Intentos 1..(winningAttempt-1) → boleto al agua.
   * - Intento winningAttempt → GANADOR + rifa pasa a 'completed'.
   *   (Los reembolsos Cero Pérdida masivos se disparan en la Iteración 4.)
   */
  async drawNext(raffleId: string, prizeIndex: number = -1): Promise<DrawResult> {
    const raffle = await this.raffleModel.findById(raffleId);
    if (!raffle) throw new NotFoundException('Rifa no existe');

    const ridN: any = { $in: [raffle._id, String(raffle._id)] };

    const filterBurned: any = {
      raffleId: ridN,
      status: TicketStatus.BURNED_AL_AGUA,
    };
    if (prizeIndex >= 0) filterBurned.prizeIndex = prizeIndex;

    const burned = await this.ticketModel.countDocuments(filterBurned);
    const attempt = burned + 1;

    const activeCount = await this.ticketModel.countDocuments({
      raffleId: ridN,
      status: TicketStatus.ACTIVE,
    });
    if (activeCount === 0) {
      const soldAny = await this.ticketModel.countDocuments({ raffleId: ridN });
      throw new BadRequestException(
        soldAny === 0
          ? 'Esta rifa aún no tiene boletos vendidos — no hay nada que sortear'
          : 'Todos los boletos se quemaron en tiradas al agua. Usa "Reiniciar tiradas" para devolverlos al juego y sortear de nuevo.',
      );
    }
    
    const targetObj = prizeIndex >= 0 ? raffle.prizes[prizeIndex] : raffle;
    if (!targetObj) throw new BadRequestException('El premio especificado no existe');

    const effectiveWinning =
      targetObj.drawMode === DrawMode.DIRECT ? 1 : Math.max(1, targetObj.winningAttempt ?? 1);
      
    const isWinner = attempt >= effectiveWinning || activeCount === 1;
    const totalAttempts = Math.min(effectiveWinning, attempt + activeCount - 1);

    if (raffle.status !== RaffleStatus.LIVE) {
      throw new BadRequestException('La rifa no está en vivo (cámbiala a status "live" primero)');
    }

    if (targetObj.winner) {
      throw new BadRequestException('El sorteo de este premio ya terminó: la tirada ganadora ya salió');
    }

    // TÓMBOLA VIRTUAL: boleto aleatorio entre los activos ($sample).
    // El $match de un aggregate NO castea tipos como sí lo hace
    // countDocuments — hay que pasar el raffleId con el mismo tipo con el
    // que se guardó. Usamos el _id de la rifa (ObjectId) de forma robusta:
    // probamos por _id y, si por datos viejos el campo quedó como string,
    // también matcheamos el string. Así el giro nunca "no encuentra" boletos
    // que la pantalla sí cuenta.
    const [picked] = await this.ticketModel.aggregate([
      { $match: { raffleId: ridN, status: TicketStatus.ACTIVE } },
      { $sample: { size: 1 } },
    ]);
    if (!picked) {
      throw new BadRequestException(
        'No se pudo elegir un boleto activo. Si la pantalla muestra boletos en juego, recarga la página e intenta de nuevo.',
      );
    }

    const updateTicket: any = { status: isWinner ? TicketStatus.WINNER : TicketStatus.BURNED_AL_AGUA };
    if (prizeIndex >= 0) updateTicket.prizeIndex = prizeIndex;

    const ticket = await this.ticketModel
      .findByIdAndUpdate(
        picked._id,
        updateTicket,
        { new: true },
      )
      .populate('userId', 'name');

    let holderName = (ticket as any).isOffline ? ((ticket as any).buyerName || 'Cliente Físico') : (ticket!.userId as any)?.name;
    let holderId = (ticket as any).isOffline ? 'offline' : ((ticket!.userId as any)?._id?.toString() || ticket!.userId?.toString() || '');
    if (!holderName && holderId !== 'offline') {
      // Buscar en el modelo User directamente
      try {
        const userDoc = await this.ticketModel.db.model('User').findById(holderId).select('name');
        holderName = userDoc?.name ?? '';
      } catch (e) {
        holderName = '';
      }
    }

    let closing: ClosingSummary | undefined;
    let closingError: string | undefined;
    if (isWinner) {
      const winnerObj = {
        ticketNumber: ticket!.ticketNumber,
        code: (ticket as any).code || undefined,
        name: holderName,
        userId: holderId,
        drawnAt: new Date().toISOString(),
      };

      let allPrizesDrawn = false;
      if (prizeIndex >= 0) {
        raffle.prizes[prizeIndex].winner = winnerObj;
        allPrizesDrawn = raffle.prizes.every((p) => p.winner);
      } else {
        raffle.winner = winnerObj;
        allPrizesDrawn = true;
      }

      await raffle.save();
    }

    return {
      attempt,
      totalAttempts,
      result: isWinner ? 'winner' : 'al_agua',
      ticketNumber: ticket!.ticketNumber,
      holderName: maskName(holderName ?? 'Alguien'),
      drawnAt: new Date().toISOString(),
      prizeIndex: prizeIndex >= 0 ? prizeIndex : undefined,
      winnerUserId: isWinner && holderId !== 'offline' ? holderId : undefined,
      closing,
      closingError,
    };
  }

  /**
   * MODO PRESENCIAL: el admin gira la tómbola FÍSICA, saca el boleto y
   * lo ingresa aquí por su número. El sistema valida que exista y siga
   * activo, y aplica la misma secuencia al agua/ganador que la virtual.
   */
  async drawSpecific(raffleId: string, ticketNumber: number, prizeIndex: number = -1): Promise<DrawResult> {
    const raffle = await this.raffleModel.findById(raffleId);
    if (!raffle) throw new NotFoundException('Rifa no existe');
    if (raffle.status !== RaffleStatus.LIVE) {
      throw new BadRequestException('La rifa no está en vivo');
    }

    const ridM: any = { $in: [raffle._id, String(raffle._id)] };
    
    const filterBurned: any = {
      raffleId: ridM,
      status: TicketStatus.BURNED_AL_AGUA,
    };
    if (prizeIndex >= 0) filterBurned.prizeIndex = prizeIndex;

    const burned = await this.ticketModel.countDocuments(filterBurned);
    const attempt = burned + 1;
    
    const targetObj = prizeIndex >= 0 ? raffle.prizes[prizeIndex] : raffle;
    if (!targetObj) throw new BadRequestException('El premio especificado no existe');

    if (targetObj.winner) {
      throw new BadRequestException('El sorteo de este premio ya terminó: la tirada ganadora ya salió');
    }
    
    const activeCount = await this.ticketModel.countDocuments({
      raffleId: ridM,
      status: TicketStatus.ACTIVE,
    });
    
    const effectiveWinning =
      targetObj.drawMode === DrawMode.DIRECT ? 1 : Math.max(1, targetObj.winningAttempt ?? 1);
    const isWinnerTurn = attempt >= effectiveWinning || activeCount === 1;

    const found = await this.ticketModel.findOne({ raffleId: ridM, ticketNumber });
    if (!found) {
      throw new BadRequestException(`El boleto N° ${ticketNumber} no fue vendido en esta rifa`);
    }
    if (found.status !== TicketStatus.ACTIVE) {
      throw new BadRequestException(`El boleto N° ${ticketNumber} ya salió en una tirada anterior`);
    }

    const isWinner = isWinnerTurn;
    const updateTicket: any = { status: isWinner ? TicketStatus.WINNER : TicketStatus.BURNED_AL_AGUA };
    if (prizeIndex >= 0) updateTicket.prizeIndex = prizeIndex;

    const ticket = await this.ticketModel
      .findByIdAndUpdate(
        found._id,
        updateTicket,
        { new: true },
      )
      .populate('userId', 'name');

    let holderName = (ticket as any).isOffline ? ((ticket as any).buyerName || 'Cliente Físico') : (ticket!.userId as any)?.name;
    let holderId = (ticket as any).isOffline ? 'offline' : ((ticket!.userId as any)?._id?.toString() || ticket!.userId?.toString() || '');
    if (!holderName && holderId !== 'offline') {
      try {
        const userDoc = await this.ticketModel.db.model('User').findById(holderId).select('name');
        holderName = userDoc?.name ?? '';
      } catch (e) {
        holderName = '';
      }
    }

    let closing: ClosingSummary | undefined;
    let closingError: string | undefined;
    if (isWinner) {
      const winnerObj = {
        ticketNumber: ticket!.ticketNumber,
        code: (ticket as any).code || undefined,
        name: holderName,
        userId: holderId,
        drawnAt: new Date().toISOString(),
      };

      let allPrizesDrawn = false;
      if (prizeIndex >= 0) {
        raffle.prizes[prizeIndex].winner = winnerObj;
        allPrizesDrawn = raffle.prizes.every((p) => p.winner);
      } else {
        raffle.winner = winnerObj;
        allPrizesDrawn = true;
      }

      await raffle.save();
    }

    return {
      attempt,
      totalAttempts: Math.min(effectiveWinning, attempt + activeCount - 1),
      result: isWinner ? 'winner' : 'al_agua',
      ticketNumber: ticket!.ticketNumber,
      holderName: maskName(holderName ?? 'Alguien'),
      drawnAt: new Date().toISOString(),
      prizeIndex: prizeIndex >= 0 ? prizeIndex : undefined,
      isManual: true,
      winnerUserId: isWinner && holderId !== 'offline' ? holderId : undefined,
      closing,
      closingError,
    };
  }
}
