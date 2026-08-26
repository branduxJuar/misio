import {
  ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsRateLimiter } from '../common/ws-rate-limiter';
import { JwtService } from '@nestjs/jwt';
import { AuctionsService } from './auctions.service';

const room = (id: string) => `auction:${id}`;

/**
 * 🔨 Sala de pujas en TIEMPO REAL (namespace /auctions).
 * TODO exige token (las subastas son solo para matriculados) y cada puja
 * valida dinero real con retención en AuctionsService.
 */
@WebSocketGateway({ namespace: '/auctions', cors: { origin: '*' } })
export class AuctionsGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly auctionsService: AuctionsService,
    private readonly jwtService: JwtService,
    private readonly wsLimit: WsRateLimiter,
  ) {}

  private auth(socket: Socket): { userId: string; name: string; role: string } {
    const token = socket.handshake?.auth?.token;
    if (!token) throw new Error('Inicia sesión para entrar a la subasta');
    const payload = this.jwtService.verify(token);
    return { userId: payload.sub, name: payload.name, role: payload.role };
  }

  /** Entrar a la sala — SOLO matriculados (el admin entra como observador). */
  @SubscribeMessage('join_auction')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { auctionId: string }) {
    const limited = this.wsLimit.check(socket, 'join_auction');
    if (limited) return { ok: false, error: limited };
    try {
      const { userId, role } = this.auth(socket);
      if (role !== 'admin') await this.auctionsService.assertEnrolled(userId, body.auctionId);
      socket.join(room(body.auctionId));
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * PANEL EN VIVO DEL ADMIN: mirar las pujas al instante sin matricularse
   * ni pujar. Solo administradores — es el "modo moderador".
   */
  @SubscribeMessage('watch_auction')
  async watch(@ConnectedSocket() socket: Socket, @MessageBody() body: { auctionId: string }) {
    const limited = this.wsLimit.check(socket, 'watch_auction');
    if (limited) return { ok: false, error: limited };
    try {
      const { role } = this.auth(socket);
      if (role !== 'admin') throw new Error('Solo el administrador puede moderar la subasta');
      socket.join(room(body.auctionId));
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  @SubscribeMessage('leave_auction')
  leave(@ConnectedSocket() socket: Socket, @MessageBody() body: { auctionId: string }) {
    socket.leave(room(body.auctionId));
    return { ok: true };
  }

  /** PUJAR: valida saldo REAL (retención) y transmite a toda la sala. */
  @SubscribeMessage('place_bid')
  async placeBid(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { auctionId: string; amount: number },
  ) {
    // Anti-inundación: sin esto un bot dispara miles de pujas por segundo
    const limited = this.wsLimit.check(socket, 'place_bid');
    if (limited) return { ok: false, error: limited };
    try {
      const { userId, name } = this.auth(socket);
      const result = await this.auctionsService.placeBid(userId, name, body.auctionId, body.amount);
      this.server.to(room(body.auctionId)).emit('bid_update', result);
      return { ok: true, result };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /** CÓMPRALO YA: cierre inmediato transmitido a la sala. */
  @SubscribeMessage('buy_now')
  async buyNow(@ConnectedSocket() socket: Socket, @MessageBody() body: { auctionId: string }) {
    const limited = this.wsLimit.check(socket, 'buy_now');
    if (limited) return { ok: false, error: limited };
    try {
      const { userId, name } = this.auth(socket);
      const result = await this.auctionsService.buyNow(userId, name, body.auctionId);
      this.server.to(room(body.auctionId)).emit('auction_finished', result);
      return { ok: true, result };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}
