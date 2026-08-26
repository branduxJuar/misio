import { OnEvent } from '@nestjs/event-emitter';
import { Logger, UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { LiveService } from './live.service';
import { WsRateLimiter } from '../common/ws-rate-limiter';
import { maskName } from '../common/mask-name.util';
import { UserRole } from '../users/user.schema';

const room = (raffleId: string) => `raffle:${raffleId}`;

/**
 * Gateway del Modo Presentador (namespace /live).
 *
 * Eventos que ESCUCHA:
 *  - join_raffle  { raffleId }         → entra a la sala (viewers anónimos OK)
 *  - leave_raffle { raffleId }
 *  - presenter_draw { raffleId }       → SOLO admin: ejecuta la tirada
 *
 * Eventos que EMITE a la sala:
 *  - viewer_count { count }
 *  - draw_result  { attempt, result: 'al_agua'|'winner', ticketNumber, holderName, ... }
 *
 * Auth: los espectadores no necesitan token. El presentador manda su JWT
 * en el handshake: io('/live', { auth: { token } }). El gateway lo verifica
 * ANTES de cada tirada (no confía en el estado del socket).
 */
@WebSocketGateway({
  namespace: '/live',
  cors: { origin: process.env.CLIENT_URL ?? 'http://localhost:5173' },
})
export class LiveGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(LiveGateway.name);

  /** Contadores de reacciones por sala (en memoria; se reinician con el server). */
  private reactions = new Map<string, { like: number; sad: number }>();

  /**
   * SELECCIÓN EN TIEMPO REAL de la grilla (Mejora: "el sistema debería
   * detectar que Brandux lo seleccionó"): raffleId → (socketId →
   * {label, numbers}). En memoria; al desconectarse un navegador, sus
   * selecciones se liberan solas.
   */
  private gridSelections = new Map<string, Map<string, { label: string; numbers: number[] }>>();

  private getGridBySocket(raffleId: string): Record<string, { label: string; numbers: number[] }> {
    const sels = this.gridSelections.get(raffleId);
    const bySocket: Record<string, { label: string; numbers: number[] }> = {};
    if (sels) for (const [sid, v] of sels) bySocket[sid] = v;
    return bySocket;
  }

  private broadcastGrid(raffleId: string) {
    this.server?.to(room(raffleId)).emit('grid_update', { bySocket: this.getGridBySocket(raffleId) });
  }

  constructor(
    private readonly liveService: LiveService,
    private readonly jwtService: JwtService,
    private readonly wsLimit: WsRateLimiter,
  ) {}

  handleConnection(socket: Socket) {
    // 'disconnecting' (no 'disconnect'): las salas del socket aún existen
    socket.on('disconnecting', () => {
      for (const r of socket.rooms) {
        if (r.startsWith('raffle:')) this.broadcastViewerCount(r, -1);
      }
    });
  }

  @SubscribeMessage('join_raffle')
  async joinRaffle(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string },
  ) {
    const r = room(body.raffleId);
    await socket.join(r);
    await this.broadcastViewerCount(r);
    // Sincronizar al usuario entrante con las selecciones en curso en tiempo real
    socket.emit('grid_update', { bySocket: this.getGridBySocket(body.raffleId) });
    return { joined: true };
  }

  @SubscribeMessage('leave_raffle')
  async leaveRaffle(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string },
  ) {
    const r = room(body.raffleId);
    await socket.leave(r);
    await this.broadcastViewerCount(r);
    return { left: true };
  }

  /**
   * Tirada de la tómbola. Verifica el JWT del handshake en CADA tirada:
   * un socket sin token de admin recibe error y no pasa nada.
   */
  @SubscribeMessage('presenter_draw')
  async presenterDraw(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string; prizeIndex?: number },
  ) {
    const limited = this.wsLimit.check(socket, 'presenter_draw');
    if (limited) return { ok: false, error: limited };
    try {
      this.assertAdmin(socket);
      const result = await this.liveService.drawNext(body.raffleId, body.prizeIndex);

      // Toda la sala ve el resultado al instante
      this.server.to(room(body.raffleId)).emit('draw_result', result);

      // Tirada ganadora → anuncio de cierre: ganador + reembolsos Cero Pérdida
      if (result.result === 'winner') {
        this.server.to(room(body.raffleId)).emit('raffle_completed', result.closing ?? {
          winner: { name: result.holderName, ticketNumber: result.ticketNumber, userId: result.winnerUserId },
          refundedTotal: 0,
          refundedUsers: 0,
          closingError: result.closingError,
        });
      }

      // Notificar cambio de estado a todos (para redirigir cuando sale live/completed)
      this.server.to(room(body.raffleId)).emit('raffle_status', {
        status: result.result === 'winner' ? 'completed' : 'live',
      });
      this.logger.log(
        `Tirada ${result.attempt}/${result.totalAttempts} → ${result.result} (#${result.ticketNumber})`,
      );
      return { ok: true, result };
    } catch (err: any) {
      // El error vuelve SOLO al presentador (ack), no a la sala
      return { ok: false, error: err.message ?? 'Error en la tirada' };
    }
  }

  /**
   * El navegador manda SU selección completa cada vez que cambia el
   * carrito. Anónimos también (eligen sin cuenta): etiqueta "Alguien".
   */
  @SubscribeMessage('grid_select')
  gridSelect(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string; numbers: number[] },
  ) {
    const limited = this.wsLimit.check(socket, 'grid_select');
    if (limited) return { ok: false, error: limited };
    if (!body?.raffleId) return { ok: false };
    const numbers = (body.numbers ?? []).filter((n) => Number.isInteger(n)).slice(0, 60);

    let label = 'Alguien';
    try {
      const token = socket.handshake?.auth?.token;
      if (token) {
        const payload = this.jwtService.verify(token);
        label = maskName(payload.name ?? '');
      }
    } catch { /* token inválido: queda "Alguien" */ }

    if (!this.gridSelections.has(body.raffleId)) {
      this.gridSelections.set(body.raffleId, new Map());
    }
    const roomSel = this.gridSelections.get(body.raffleId)!;
    if (numbers.length === 0) roomSel.delete(socket.id);
    else roomSel.set(socket.id, { label, numbers });

    this.broadcastGrid(body.raffleId);
    return { ok: true };
  }

  /**
   * Tras una compra exitosa, el comprador avisa: los números pasan a
   * VENDIDOS para toda la sala al instante (la verdad autoritativa sigue
   * siendo la BD; esto es sincronización visual inmediata).
   */
  @SubscribeMessage('grid_purchased')
  gridPurchased(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string; numbers: number[] },
  ) {
    if (!body?.raffleId) return { ok: false };
    const numbers = (body.numbers ?? []).filter((n) => Number.isInteger(n));
    // Liberar esos números de todas las selecciones en memoria
    const roomSel = this.gridSelections.get(body.raffleId);
    if (roomSel) {
      for (const [sid, v] of roomSel) {
        const left = v.numbers.filter((n) => !numbers.includes(n));
        if (left.length === 0) roomSel.delete(sid);
        else roomSel.set(sid, { ...v, numbers: left });
      }
    }
    this.server.to(room(body.raffleId)).emit('grid_sold', { numbers });
    this.broadcastGrid(body.raffleId);
    return { ok: true };
  }

  /**
   * Al registrar una recarga por Yape/Plin con intención de compra, el cliente notifica
   * que sus tickets pasan a estar "en proceso". Todos los navegadores conectando
   * los marcan en naranja y previenen que otros intenten tomarlos.
   */
  @SubscribeMessage('grid_in_process')
  gridInProcess(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string; numbers: number[] },
  ) {
    if (!body?.raffleId) return { ok: false };
    const numbers = (body.numbers ?? []).filter((n) => Number.isInteger(n));
    const roomSel = this.gridSelections.get(body.raffleId);
    if (roomSel) {
      for (const [sid, v] of roomSel) {
        const left = v.numbers.filter((n) => !numbers.includes(n));
        if (left.length === 0) roomSel.delete(sid);
        else roomSel.set(sid, { ...v, numbers: left });
      }
    }
    this.server.to(room(body.raffleId)).emit('grid_in_process', { numbers });
    this.broadcastGrid(body.raffleId);
    return { ok: true };
  }

  /** Helper para notificar desde otros módulos (ej. PaymentsService al aprobar o rechazar un pago). */
  notifySold(raffleId: string, numbers: number[]) {
    this.server?.to(room(raffleId)).emit('grid_sold', { numbers });
    this.broadcastGrid(raffleId);
  }

  notifyReleased(raffleId: string, numbers: number[]) {
    this.server?.to(room(raffleId)).emit('grid_released', { numbers });
    this.broadcastGrid(raffleId);
  }

  handleDisconnect(socket: Socket) {
    // Liberar las selecciones de este navegador en todas las rifas
    for (const [raffleId, roomSel] of this.gridSelections) {
      if (roomSel.delete(socket.id)) this.broadcastGrid(raffleId);
    }
  }

  /**
   * MODO PRESENCIAL: el admin ingresa el N° del boleto que salió de la
   * tómbola física. Misma verificación de admin y mismo broadcast.
   */
  @SubscribeMessage('presenter_draw_manual')
  async presenterDrawManual(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string; ticketNumber: number; prizeIndex?: number },
  ) {
    const limited = this.wsLimit.check(socket, 'presenter_draw_manual');
    if (limited) return { ok: false, error: limited };
    try {
      this.assertAdmin(socket);
      const result = await this.liveService.drawSpecific(body.raffleId, body.ticketNumber, body.prizeIndex);
      this.server.to(room(body.raffleId)).emit('draw_result', result);
      if (result.result === 'winner') {
        this.server.to(room(body.raffleId)).emit('raffle_completed', result.closing ?? {
          winner: { name: result.holderName, ticketNumber: result.ticketNumber, userId: result.winnerUserId },
          refundedTotal: 0, refundedUsers: 0, closingError: result.closingError,
        });
        this.server.to(room(body.raffleId)).emit('raffle_status', { status: 'completed' });
      }
      return { ok: true, result };
    } catch (err: any) {
      return { ok: false, error: err.message ?? 'Error en la tirada' };
    }
  }

  /**
   * REACCIONES del público: solo 👍 (like) y 😢 (sad). Cualquier
   * espectador puede reaccionar; los contadores se transmiten a la sala.
   */
  @SubscribeMessage('react')
  react(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string; reaction: 'like' | 'sad' },
  ) {
    const limited = this.wsLimit.check(socket, 'react');
    if (limited) return { ok: false, error: limited };
    if (!['like', 'sad'].includes(body?.reaction)) return { ok: false };
    const r = room(body.raffleId);
    const counts = this.reactions.get(r) ?? { like: 0, sad: 0 };
    counts[body.reaction] += 1;
    this.reactions.set(r, counts);
    this.server.to(r).emit('reaction_update', counts);
    return { ok: true };
  }

  /**
   * El administrador cierra la sala explícitamente (boton "Finalizar sorteo").
   * Solo esto expulsará a los espectadores.
   */
  @SubscribeMessage('close_room')
  closeRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string },
  ) {
    try {
      this.assertAdmin(socket);
      this.server.to(room(body.raffleId)).emit('room_closed');
      return { ok: true };
    } catch { return { ok: false }; }
  }

  /**
   * El administrador reinicia las tiradas de un premio o de la rifa.
   */
  @SubscribeMessage('reset_draws')
  resetDraws(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string },
  ) {
    try {
      this.assertAdmin(socket);
      this.server.to(room(body.raffleId)).emit('raffle_reset');
      return { ok: true };
    } catch { return { ok: false }; }
  }

  /** Valida el JWT del handshake y exige rol admin. */
  private assertAdmin(socket: Socket) {
    const token = socket.handshake.auth?.token;
    if (!token) throw new UnauthorizedException('Presentador sin token');
    const payload = this.jwtService.verify(token); // Lanza si es inválido/vencido
    if (![UserRole.ADMIN, UserRole.PRESENTER].includes(payload.role)) {
      throw new UnauthorizedException('Solo el admin puede tirar la tómbola');
    }
  }

  private async broadcastViewerCount(r: string, delta = 0) {
    const sockets = await this.server.in(r).fetchSockets();
    this.server.to(r).emit('viewer_count', { count: Math.max(0, sockets.length + delta) });
  }

  /**
   * Escucha cambios de estado de rifa emitidos por el controller REST
   * (desacoplado vía EventEmitter2 para evitar dependencia circular).
   */
  @OnEvent('raffle.status_changed')
  handleStatusChanged(payload: { raffleId: string; status: string }) {
    this.server.to(room(payload.raffleId)).emit('raffle_status', {
      status: payload.status,
    });
  }

}
