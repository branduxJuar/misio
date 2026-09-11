import {
  ConnectedSocket, MessageBody, OnGatewayDisconnect, SubscribeMessage,
  WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeStateService } from '../common/realtime-state.service';

const room = (raffleId: string) => `sel:${raffleId}`;
const HOLD_MS = 3 * 60 * 1000; // Una selección "viva" dura máx. 3 min sin renovarse

interface Hold { socketId: string; expiresAt: number }

/**
 * SELECCIÓN EN TIEMPO REAL (namespace /selection).
 *
 * El problema reportado: Brandux selecciona el ticket 42 en su navegador
 * y María lo sigue viendo LIBRE en el suyo. Ahora cada grilla abierta se
 * une a la sala de su sorteo; al tocar un número se transmite a todos:
 * María lo ve al instante como "lo está eligiendo otra persona".
 *
 * Es una CORTESÍA visual anti-choque, no una reserva dura: la verdad
 * final sigue siendo la compra atómica (índice único + transacción).
 * Si Brandux cierra la pestaña o pasan 3 min, sus números se liberan
 * solos para todos.
 */
const selectionOrigins = (process.env.CLIENT_URL ?? 'http://localhost:5173').split(',').map((origin) => origin.trim());

@WebSocketGateway({ namespace: '/selection', cors: { origin: selectionOrigins } })
export class SelectionGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  /** raffleId → (ticketNumber → hold) */
  private holds = new Map<string, Map<number, Hold>>();

  constructor(private readonly realtimeState: RealtimeStateService) {}

  private roomHolds(raffleId: string) {
    if (!this.holds.has(raffleId)) this.holds.set(raffleId, new Map());
    return this.holds.get(raffleId)!;
  }

  /** Números vigentes (limpia vencidos al leer — sin timers). */
  private liveNumbers(raffleId: string): number[] {
    const map = this.roomHolds(raffleId);
    const now = Date.now();
    for (const [n, h] of map) if (h.expiresAt < now) map.delete(n);
    return [...map.keys()].sort((a, b) => a - b);
  }

  private broadcast(raffleId: string) {
    this.server.to(room(raffleId)).emit('selection_update', {
      numbers: this.liveNumbers(raffleId),
    });
  }

  @SubscribeMessage('join_selection')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { raffleId: string }) {
    socket.join(room(body.raffleId));
    socket.data.raffleId = body.raffleId;
    // Estado actual solo para el recién llegado
    return { numbers: (await this.realtimeState.getSelectionHolds(body.raffleId)) ?? this.liveNumbers(body.raffleId) };
  }

  /** El cliente manda SU selección completa (idempotente y simple). */
  @SubscribeMessage('set_selection')
  async setSelection(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raffleId: string; numbers: number[] },
  ) {
    const distributed = await this.realtimeState.setSelection(body.raffleId, socket.id, body.numbers ?? []);
    if (distributed) {
      this.server.to(room(body.raffleId)).emit('selection_update', { numbers: distributed });
      return { ok: true };
    }
    const map = this.roomHolds(body.raffleId);
    // Retirar lo que este socket tenía y ya no tiene
    for (const [n, h] of map) {
      if (h.socketId === socket.id && !body.numbers.includes(n)) map.delete(n);
    }
    // Registrar/renovar lo que tiene ahora (sin robar holds ajenos)
    const expiresAt = Date.now() + HOLD_MS;
    for (const n of body.numbers.slice(0, 60)) {
      const current = map.get(n);
      if (!current || current.socketId === socket.id) {
        map.set(n, { socketId: socket.id, expiresAt });
      }
    }
    this.broadcast(body.raffleId);
    return { ok: true };
  }

  /** Al cerrar la pestaña, sus números se liberan para todos. */
  async handleDisconnect(socket: Socket) {
    const raffleId = socket.data?.raffleId;
    if (!raffleId) return;
    const distributed = await this.realtimeState.removeSelectionSocket(raffleId, socket.id);
    if (distributed) {
      this.server.to(room(raffleId)).emit('selection_update', { numbers: distributed });
      return;
    }
    const map = this.roomHolds(raffleId);
    for (const [n, h] of map) if (h.socketId === socket.id) map.delete(n);
    this.broadcast(raffleId);
  }
}
