import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { DistributedLockService } from '../common/distributed-lock.service';
import {
  BingoCard, BingoCardDocument, BingoRoom, BingoRoomDocument, BingoRoomStatus,
  BingoWinMode, generateCard, hasWon,
} from './bingo.schema';

/** Alfabeto sin ambiguos (sin 0/O, 1/I/L) para códigos de sala. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const randomCode = () =>
  'ZB-' + Array.from({ length: 4 }, () =>
    CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

@Injectable()
export class BingoService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly locks: DistributedLockService,
    @InjectModel(BingoRoom.name) private roomModel: Model<BingoRoomDocument>,
    @InjectModel(BingoCard.name) private cardModel: Model<BingoCardDocument>,
  ) {}

  /**
   * CREAR SALA: cualquier usuario registrado. Genera el código para
   * compartir y le da su cartón al anfitrión (él también juega).
   */
  async createRoom(hostId: string, hostName: string, dto: { title?: string; maxPlayers: number; winMode: BingoWinMode }) {
    let room: BingoRoomDocument | null = null;
    for (let i = 0; i < 5 && !room; i++) {
      try {
        room = await this.roomModel.create({
          code: randomCode(),
          hostId,
          title: dto.title?.trim() || `Bingo de ${hostName.split(' ')[0]}`,
          maxPlayers: dto.maxPlayers,
          winMode: dto.winMode,
        });
      } catch (err: any) {
        if (err?.code !== 11000) throw err; // Colisión de código: reintentar
      }
    }
    if (!room) throw new ConflictException('No se pudo generar la sala, intenta de nuevo');

    const card = await this.cardModel.create({ roomId: room._id, userId: hostId, numbers: generateCard() });
    return { room, card };
  }

  /** UNIRSE POR CÓDIGO: registrados, sala abierta o en juego, con cupo. */
  async joinByCode(userId: string, code: string) {
    const room = await this.roomModel.findOne({ code: code.toUpperCase().trim() });
    if (!room) throw new NotFoundException('No existe una sala con ese código');
    if (room.status === BingoRoomStatus.FINISHED) {
      throw new BadRequestException('Esa partida ya terminó');
    }

    const existing = await this.cardModel.findOne({ roomId: room._id, userId });
    if (existing) return { room, card: existing, rejoined: true };

    const players = await this.cardModel.countDocuments({ roomId: room._id });
    if (players >= room.maxPlayers) {
      throw new BadRequestException(`Sala llena (${room.maxPlayers} jugadores máx.)`);
    }

    const card = await this.cardModel.create({ roomId: room._id, userId, numbers: generateCard() });
    return { room, card, rejoined: false };
  }

  /**
   * ENTRAR A LA SALA (idempotente) — FIX del bug reportado: al pulsar
   * "Entrar" en Mis partidas salía "No estás en esta sala" si el cartón
   * no existía (p.ej. la sala se creó pero el cartón no llegó a
   * guardarse). Ahora entrar = tener cartón: si falta y hay cupo, se
   * reparte uno en el acto. Es lo que el usuario espera al pulsar Entrar.
   */
  async enterRoom(roomId: string, userId: string) {
    const room = await this.roomModel.findById(roomId);
    if (!room) throw new NotFoundException('Sala no existe');

    const mine = await this.cardModel.findOne({ roomId, userId });
    if (!mine) {
      if (room.status === BingoRoomStatus.FINISHED) {
        throw new BadRequestException('Esa partida ya terminó');
      }
      const players = await this.cardModel.countDocuments({ roomId });
      if (players >= room.maxPlayers) {
        throw new BadRequestException(`Sala llena (${room.maxPlayers} jugadores máx.)`);
      }
      try {
        await this.cardModel.create({ roomId, userId, numbers: generateCard() });
      } catch (err: any) {
        // Carrera con otra pestaña del mismo usuario: el cartón ya existe
        if (err?.code !== 11000) throw err;
      }
    }
    return this.getRoomState(roomId, userId);
  }

  /** Estado completo de la sala (para quien ya tiene cartón). */
  async getRoomState(roomId: string, userId: string) {
    const room = await this.roomModel.findById(roomId).populate('hostId', 'name').lean();
    if (!room) throw new NotFoundException('Sala no existe');

    const cards = await this.cardModel.find({ roomId }).populate('userId', 'name').lean();
    const myCard = cards.find((c) => (c.userId as any)?._id?.toString() === userId);
    if (!myCard) throw new ForbiddenException('No estás en esta sala — únete con el código');

    const called = new Set(room.calledNumbers);
    return {
      room,
      myCard: { numbers: myCard.numbers },
      players: cards.map((c) => ({
        userId: (c.userId as any)?._id,
        name: (c.userId as any)?.name ?? '—',
        markedCount: c.numbers.filter((n) => n === 0 || called.has(n)).length,
        isHost: (c.userId as any)?._id?.toString() === room.hostId._id?.toString(),
      })),
    };
  }

  /**
   * Avance de TODOS los jugadores (para la lista en vivo). No expone
   * cartones ajenos: solo cuántas casillas lleva marcadas cada uno.
   */
  async roomPlayers(roomId: string) {
    const room = await this.roomModel.findById(roomId).lean();
    if (!room) throw new NotFoundException('Sala no existe');
    const called = new Set(room.calledNumbers);
    const cards = await this.cardModel
      .find({ roomId })
      .populate('userId', 'name')
      .sort({ createdAt: 1 })
      .lean();
    return cards.map((c) => ({
      userId: (c.userId as any)?._id,
      name: (c.userId as any)?.name ?? '—',
      markedCount: c.numbers.filter((n) => n === 0 || called.has(n)).length,
      isHost: (c.userId as any)?._id?.toString() === room.hostId.toString(),
    }));
  }

  /**
   * REVANCHA (solo anfitrión): misma sala, mismos amigos, CARTONES
   * NUEVOS. Se reinician números cantados, ganador y estado — así se
   * juegan varias rondas seguidas sin volver a repartir el código.
   */
  async restartRoom(roomId: string, hostId: string) {
    const release = await this.locks.acquire(`bingo-round:${roomId}`);
    try {
      const session = await this.connection.startSession();
      try { return await session.withTransaction(() => this.restartRoomOnce(roomId, hostId, session)); }
      finally { await session.endSession(); }
    }
    finally { await release(); }
  }

  private async restartRoomOnce(roomId: string, hostId: string, session: ClientSession) {
    const room = await this.roomModel.findById(roomId).session(session);
    if (!room) throw new NotFoundException('Sala no existe');
    if (room.hostId.toString() !== hostId) {
      throw new ForbiddenException('Solo el anfitrión inicia una nueva ronda');
    }

    const cards = await this.cardModel.find({ roomId }).session(session).lean();
    await this.cardModel.bulkWrite(
      cards.map((c) => ({
        updateOne: { filter: { _id: c._id }, update: { $set: { numbers: generateCard() } } },
      })),
      { session },
    );

    room.calledNumbers = [];
    room.winner = null;
    room.status = BingoRoomStatus.OPEN;
    await room.save({ session });
    return { ok: true, round: true };
  }

  /** Abandonar: el anfitrión cierra la sala para todos; un jugador solo sale. */
  async leaveRoom(roomId: string, userId: string) {
    const room = await this.roomModel.findById(roomId);
    if (!room) throw new NotFoundException('Sala no existe');

    const mine = await this.cardModel.findOne({ roomId, userId });
    if (!mine) throw new ForbiddenException('No estás en esta sala');
    if (room.hostId.toString() === userId) {
      await this.roomModel.deleteOne({ _id: roomId, hostId: userId });
      await this.cardModel.deleteMany({ roomId });
      return { ok: true, roomClosed: true };
    }

    await this.cardModel.deleteOne({ roomId, userId });
    return { ok: true };
  }

  /**
   * RESCATE DE PARTIDA: si el anfitrión abandonó (cerró la pestaña), la
   * sala quedaba muerta — nadie podía cantar. Cualquier jugador con
   * cartón puede tomar el control. El gateway verifica ANTES que el
   * anfitrión no siga conectado.
   */
  async claimHost(roomId: string, userId: string) {
    const room = await this.roomModel.findById(roomId);
    if (!room) throw new NotFoundException('Sala no existe');
    if (room.hostId.toString() === userId) return { room, alreadyHost: true };
    if (room.status === BingoRoomStatus.FINISHED) {
      throw new BadRequestException('La partida ya terminó');
    }
    const card = await this.cardModel.findOne({ roomId, userId });
    if (!card) throw new ForbiddenException('Solo un jugador de la sala puede tomar el control');

    room.hostId = userId as any;
    await room.save();
    return { room, alreadyHost: false };
  }

  /** Solo salas vigentes en las que aún participa el usuario. */
  async myRooms(userId: string) {
    const myCards = await this.cardModel.find({ userId }).select('roomId').lean();
    return this.roomModel
      .find({ _id: { $in: myCards.map((c) => c.roomId) }, status: { $ne: BingoRoomStatus.FINISHED } })
      .populate('hostId', 'name')
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();
  }

  /**
   * CANTAR NÚMERO — solo el ANFITRIÓN. Tras cada número, el sistema
   * revisa TODOS los cartones: si alguno completó el patrón (línea o
   * cartón lleno según la config), la partida termina y se anuncia al
   * ganador. Empates en el mismo número: gana quien se unió primero.
   */
  async callNumber(roomId: string, callerId: string) {
    const release = await this.locks.acquire(`bingo-round:${roomId}`);
    try { return await this.callNumberOnce(roomId, callerId); }
    finally { await release(); }
  }

  private async callNumberOnce(roomId: string, callerId: string) {
    const room = await this.roomModel.findById(roomId);
    if (!room) throw new NotFoundException('Sala no existe');
    if (room.hostId.toString() !== callerId) {
      throw new ForbiddenException('Solo el anfitrión canta los números');
    }
    if (room.status === BingoRoomStatus.FINISHED) {
      throw new BadRequestException('La partida ya terminó');
    }

    const remaining = Array.from({ length: 75 }, (_, i) => i + 1)
      .filter((n) => !room.calledNumbers.includes(n));
    if (remaining.length === 0) throw new ConflictException('Ya se cantaron los 75 números');

    const number = remaining[Math.floor(Math.random() * remaining.length)];
    room.calledNumbers.push(number);
    room.status = BingoRoomStatus.LIVE;

    // Detección automática de BINGO
    const called = new Set(room.calledNumbers);
    const cards = await this.cardModel
      .find({ roomId })
      .populate('userId', 'name')
      .sort({ createdAt: 1 })
      .lean();
    const winnerCard = cards.find((c) => hasWon(c.numbers, called, room.winMode));

    if (winnerCard) {
      room.status = BingoRoomStatus.FINISHED;
      room.winner = {
        userId: (winnerCard.userId as any)._id.toString(),
        name: (winnerCard.userId as any).name,
      };
    }
    await room.save();

    return {
      number,
      calledNumbers: room.calledNumbers,
      winner: room.winner,
      finished: room.status === BingoRoomStatus.FINISHED,
      // Avance en vivo: la sala entera ve quién va ganando
      players: cards.map((c) => ({
        userId: (c.userId as any)?._id,
        name: (c.userId as any)?.name ?? '—',
        markedCount: c.numbers.filter((n) => n === 0 || called.has(n)).length,
        isHost: (c.userId as any)?._id?.toString() === room.hostId.toString(),
      })),
    };
  }
}
