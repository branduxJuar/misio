import { UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket, MessageBody, OnGatewayDisconnect, SubscribeMessage,
  WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { WsRateLimiter } from '../common/ws-rate-limiter';
import { BingoService } from './bingo.service';

const room = (id: string) => `bingo:${id}`;

/**
 * Gateway del Bingo social (namespace /bingo). TODOS necesitan token
 * (jugar requiere cuenta). Eventos:
 *  ESCUCHA: join_room { roomId } · host_call { roomId } · host_restart { roomId }
 *  EMITE:   player_joined { name } · room_update { players }
 *           number_called { number, calledNumbers, players }
 *           bingo_winner { name } (detectado por el sistema)
 *           room_restarted (todos recargan SU cartón nuevo)
 */
@WebSocketGateway({
  namespace: '/bingo',
  cors: { origin: process.env.CLIENT_URL ?? 'http://localhost:5173' },
})
export class BingoGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private readonly bingoService: BingoService,
    private readonly jwtService: JwtService,
    private readonly wsLimit: WsRateLimiter,
  ) {}

  private auth(socket: Socket): { userId: string; name: string } {
    const token = socket.handshake.auth?.token;
    if (!token) throw new UnauthorizedException('Necesitas una cuenta para jugar');
    const payload = this.jwtService.verify(token);
    return { userId: payload.sub, name: payload.name };
  }

  @SubscribeMessage('join_room')
  async joinRoom(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string }) {
    try {
      const user = this.auth(socket);
      // Guardamos quién es este socket: sirve para saber si el anfitrión
      // sigue presente y para avisar cuando se va.
      socket.data.userId = user.userId;
      socket.data.roomId = body.roomId;
      await socket.join(room(body.roomId));
      socket.to(room(body.roomId)).emit('player_joined', { name: user.name });
      // La lista de jugadores se refresca sola para TODOS los presentes
      const players = await this.bingoService.roomPlayers(body.roomId);
      this.server.to(room(body.roomId)).emit('room_update', { players });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /** El ANFITRIÓN canta; el resultado (y el BINGO, si hay) va a toda la sala. */
  @SubscribeMessage('host_call')
  async hostCall(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string }) {
    // El modo automático canta cada pocos segundos: el límite deja pasar
    // el ritmo normal del juego y corta el spam.
    const limited = this.wsLimit.check(socket, 'host_call');
    if (limited) return { ok: false, error: limited };
    try {
      const user = this.auth(socket);
      const result = await this.bingoService.callNumber(body.roomId, user.userId);

      this.server.to(room(body.roomId)).emit('number_called', {
        number: result.number,
        calledNumbers: result.calledNumbers,
        players: result.players, // Avance de cada jugador, en vivo
      });
      if (result.winner) {
        this.server.to(room(body.roomId)).emit('bingo_winner', result.winner);
      }
      return { ok: true, result };
    } catch (err: any) {
      return { ok: false, error: err.message ?? 'Error al cantar' };
    }
  }

  /**
   * ¿El anfitrión sigue conectado a la sala? (para el rescate).
   */
  private async hostIsOnline(roomId: string, hostId: string) {
    const sockets = await this.server.in(room(roomId)).fetchSockets();
    return sockets.some((s) => s.data?.userId === hostId);
  }

  /**
   * RESCATE: un jugador toma el control si el anfitrión se fue. Sin
   * esto, cerrar la pestaña del anfitrión mataba la partida.
   */
  @SubscribeMessage('claim_host')
  async claimHost(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string }) {
    const limited = this.wsLimit.check(socket, 'claim_host');
    if (limited) return { ok: false, error: limited };
    try {
      const user = this.auth(socket);
      const state = await this.bingoService.getRoomState(body.roomId, user.userId);
      const currentHost = state.room.hostId?.toString?.() ?? String(state.room.hostId);
      if (currentHost !== user.userId && (await this.hostIsOnline(body.roomId, currentHost))) {
        return { ok: false, error: 'El anfitrión sigue en la sala — solo puede cantar él' };
      }
      const { room: updated } = await this.bingoService.claimHost(body.roomId, user.userId);
      this.server.to(room(body.roomId)).emit('host_changed', {
        hostId: user.userId,
        name: user.name,
      });
      const players = await this.bingoService.roomPlayers(body.roomId);
      this.server.to(room(body.roomId)).emit('room_update', { players });
      return { ok: true, hostId: updated.hostId };
    } catch (err: any) {
      return { ok: false, error: err.message ?? 'No se pudo tomar el control' };
    }
  }

  /** Si el que se desconecta ERA el anfitrión, la sala se entera. */
  async handleDisconnect(socket: Socket) {
    const { userId, roomId } = socket.data ?? {};
    if (!userId || !roomId) return;
    try {
      const state = await this.bingoService.getRoomState(roomId, userId);
      const hostId = state.room.hostId?.toString?.() ?? String(state.room.hostId);
      if (hostId !== userId) return;
      // Puede tener otra pestaña abierta: solo avisamos si NO queda ninguna
      if (await this.hostIsOnline(roomId, hostId)) return;
      this.server.to(room(roomId)).emit('host_left');
    } catch { /* sala borrada o sin acceso: nada que avisar */ }
  }

  /**
   * REVANCHA: el anfitrión reparte cartones nuevos. Cada jugador recarga
   * SU propio cartón (son distintos, no se pueden mandar en un broadcast).
   */
  @SubscribeMessage('host_restart')
  async hostRestart(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string }) {
    try {
      const user = this.auth(socket);
      await this.bingoService.restartRoom(body.roomId, user.userId);
      this.server.to(room(body.roomId)).emit('room_restarted');
      const players = await this.bingoService.roomPlayers(body.roomId);
      this.server.to(room(body.roomId)).emit('room_update', { players });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message ?? 'Error al reiniciar' };
    }
  }
}
