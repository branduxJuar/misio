import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post,
  Query, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ticket, TicketDocument, TicketStatus } from '../tickets/ticket.schema';
import { LogisticsERP, LogisticsERPDocument } from '../logistics/logistics.schema';
import { maskName } from '../common/mask-name.util';
import { formatTicketCode } from './raffle.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { RaffleListItem, RafflesService } from './raffles.service';
import { RaffleClosingService } from './raffle-closing.service';
import {
  CreateRaffleDto, PostponeRaffleDto, UpdateRaffleDto, UpdateRaffleStatusDto,
} from './dto/raffle.dto';
import { evidenceUploadOptions } from '../logistics/upload.config';
import { Raffle, RaffleDocument } from './raffle.schema';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/auth.guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.schema';

@Controller('raffles')
export class RafflesController {
  constructor(
    private readonly rafflesService: RafflesService,
    private readonly closingService: RaffleClosingService,
    private readonly jwtService: JwtService,
    private readonly events: EventEmitter2,
    @InjectModel(Ticket.name) private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(Raffle.name) private readonly raffleModel: Model<RaffleDocument>,
    @InjectModel(LogisticsERP.name) private readonly erpModel: Model<LogisticsERPDocument>,
    private readonly txService: TransactionsService,
  ) {}

  // ── PÚBLICO ──────────────────────────────────────────────────────
  /** GET /api/v1/raffles — vitrina (rifas en venta/en vivo). */
  @Get()
  findActive() {
    return this.rafflesService.findActive();
  }

  @Get('debug-tickets/:raffleId')
  async debugTickets(@Param('raffleId') raffleId: string) {
    const ridMatch: any = { $in: [raffleId, String(raffleId)] };
    try {
      const Types = require('mongoose').Types;
      ridMatch.$in.push(new Types.ObjectId(raffleId));
    } catch(e) {}
    const tickets = await this.ticketModel.find({ raffleId: ridMatch }).lean();
    return {
      count: tickets.length,
      statuses: [...new Set(tickets.map(t => t.status))],
      winners: tickets.filter(t => t.status === 'winner'),
      raffle: await this.raffleModel.findById(raffleId).lean()
    };
  }

  /**
   * GET /api/v1/raffles/winners — PÁGINA DE GANADORES (pública).
   * Sorteos completados con: premio, código ganador, nombre enmascarado,
   * fecha, y (del ERP) estado de entrega + foto de evidencia si existe.
   */
  @Get('winners')
  async winners() {
    const completed = await this.raffleModel
      .find({ status: 'completed' })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    const results = await Promise.all(
      completed.map(async (r: any) => {
        const erp = await this.erpModel.findOne({ raffleId: r._id }).lean();
        const deliveryData = erp
          ? { status: erp.deliveryStatus, evidencePhotoUrl: erp.evidencePhotoUrl ?? '' }
          : null;

        if (r.type === 'paquete' && r.prizes && r.prizes.length > 0) {
          return r.prizes
            .filter((p: any) => p.winner?.ticketNumber)
            .map((p: any) => {
              const code = p.winner.code || formatTicketCode(r.ticketPrefix, p.winner.ticketNumber, r.totalTickets);
              const name = maskName(p.winner.name ?? '');
              return {
                raffleId: r._id,
                title: p.title,
                image: r.images?.[0] ?? '',
                drawDate: r.drawDate,
                updatedAt: r.updatedAt,
                totalTickets: r.totalTickets,
                winner: { code, name },
                delivery: deliveryData,
              };
            });
        }

        // Fuente primaria: el snapshot grabado EN la rifa al declarar al
        // ganador (sobrevive aunque los boletos se borren o re-siembren).
        // Fallback: el boleto con status winner (datos de antes del snapshot).
        let winner: { code: string; name: string } | null = null;
        if (r.winner?.ticketNumber) {
          winner = {
            code:
              r.winner.code ||
              formatTicketCode(r.ticketPrefix, r.winner.ticketNumber, r.totalTickets),
            name: maskName(r.winner.name ?? ''),
          };
        } else {
          const winnerTicket = await this.ticketModel
            .findOne({ raffleId: r._id, status: TicketStatus.WINNER })
            .populate('userId', 'name')
            .lean();
          if (winnerTicket) {
            winner = {
              code:
                (winnerTicket as any).code ||
                formatTicketCode(r.ticketPrefix, winnerTicket.ticketNumber, r.totalTickets),
              name: maskName((winnerTicket.userId as any)?.name ?? ''),
            };
          }
        }
        
        if (!winner) return [];

        return [{
          raffleId: r._id,
          title: r.title,
          image: r.images?.[0] ?? '',
          drawDate: r.drawDate,
          updatedAt: r.updatedAt,
          totalTickets: r.totalTickets,
          winner,
          delivery: deliveryData,
        }];
      }),
    );
    return results.flat();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rafflesService.findOne(id);
  }

  /**
   * GET /api/v1/raffles/:id/sold — números YA VENDIDOS (público).
   * Alimenta la grilla de selección: vendidos en gris, libres elegibles.
   */
  @Get(':id/sold')
  async soldNumbers(@Param('id') id: string) {
    const raffle = await this.rafflesService.findOne(id); // 404 si no existe
    // Match robusto: acepta raffleId como ObjectId o string
    const rid: any = { $in: [raffle._id, id] };
    const [sold, inProcessRaw] = await Promise.all([
      this.ticketModel.distinct('ticketNumber', { raffleId: rid }) as Promise<number[]>,
      this.txService.pendingNumbersForRaffle(id),
    ]);
    const soldSet = new Set(sold);
    return {
      sold: sold.sort((a, b) => a - b),
      // Un número puede estar "en proceso" y venderse por saldo: gana vendido
      inProcess: inProcessRaw.filter((n) => !soldSet.has(n)),
    };
  }

  /**
   * POST /api/v1/raffles/:id/share-link — genera el LINK PÚBLICO de la
   * lista de participantes con TOKEN DE 5 MINUTOS. Solo se genera desde
   * la web Misio (requiere sesión). Si alguien comparte el link después,
   * el token ya venció y la página no muestra NADA.
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/share-link')
  async shareLink(@Param('id') id: string) {
    await this.rafflesService.findOne(id); // 404 si no existe
    const token = this.jwtService.sign(
      { raffleId: id, purpose: 'public_ticket_list' },
      { expiresIn: '5m' },
    );
    return { path: `/lista/${id}?t=${token}`, expiresInSeconds: 300 };
  }

  /**
   * GET /api/v1/raffles/:id/public-tickets?t=... — la lista de boletos
   * vendidos con nombres PARCIALMENTE OCULTOS (BRAN… JUA… + código).
   * Sin token válido/vigente → 401 y la página no muestra nada.
   */
  @Get(':id/public-tickets')
  async publicTickets(@Param('id') id: string, @Query('t') token: string) {
    try {
      const payload = this.jwtService.verify(token ?? '');
      if (payload.purpose !== 'public_ticket_list' || payload.raffleId !== id) throw new Error();
    } catch {
      throw new BadRequestException('TOKEN_EXPIRED'); // El front lo traduce a "link vencido"
    }

    const raffle = await this.rafflesService.findOne(id);
    const rid: any = { $in: [raffle._id, id] };
    const tickets = await this.ticketModel
      .find({ raffleId: rid })
      .populate('userId', 'name')
      .sort({ ticketNumber: 1 })
      .lean();

    return {
      raffle: {
        title: raffle.title,
        drawDate: raffle.drawDate,
        totalTickets: raffle.totalTickets,
        soldTickets: tickets.length,
      },
      tickets: tickets.map((t) => ({
        code: (t as any).code || formatTicketCode(raffle.ticketPrefix, t.ticketNumber, raffle.totalTickets),
        holder: maskName((t.userId as any)?.name ?? ''),
      })),
    };
  }

  /**
   * PATCH /api/v1/raffles/:id/stream — fijar/cambiar el link de la
   * transmisión (permitido también EN VIVO, a diferencia de la edición).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Patch(':id/stream')
  setStream(@Param('id') id: string, @Body('streamUrl') streamUrl: string) {
    return this.rafflesService.setStreamUrl(id, streamUrl ?? '');
  }

  // ── ADMIN: gestión completa (Sprint 1) ───────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Get('admin/all')
  findAllAdmin(): Promise<RaffleListItem[]> {
    return this.rafflesService.findAllAdmin();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  /**
   * POST /api/v1/raffles/recount — recuenta los boletos vendidos y corrige
   * el contador denormalizado (`soldCount`). Red de seguridad: todo
   * contador rápido necesita una forma de volver a la verdad.
   * Body opcional: { raffleId } para recontar solo una.
   */
  /** GET /api/v1/raffles/:id/diagnostics — ¿por qué la tómbola está en 0? */
  @Roles(UserRole.ADMIN)
  @Get(':id/diagnostics')
  diagnostics(@Param('id') id: string) {
    return this.rafflesService.diagnostics(id);
  }

  /** POST /api/v1/raffles/:id/reset-draws — rescata una rifa atascada. */
  @Roles(UserRole.ADMIN)
  @Post(':id/reset-draws')
  resetDraws(@Param('id') id: string, @Body('prizeIndex') prizeIndex?: number) {
    return this.rafflesService.resetDraws(id, prizeIndex);
  }

  @Roles(UserRole.ADMIN)
  @Post('recount')
  recount(@Body('raffleId') raffleId?: string) {
    return this.rafflesService.recountSold(raffleId);
  }

  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Post()
  create(@Body() dto: CreateRaffleDto) {
    return this.rafflesService.create(dto);
  }

  /** PATCH /api/v1/raffles/:id — editar TODOS los campos (rifa en venta). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRaffleDto) {
    return this.rafflesService.update(id, dto);
  }

  /** POST /api/v1/raffles/:id/postpone — aplazar con motivo (avisa a compradores). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Post(':id/postpone')
  postpone(@Param('id') id: string, @Body() dto: PostponeRaffleDto) {
    return this.rafflesService.postpone(id, dto.reason, dto.newDate);
  }

  /** POST /api/v1/raffles/:id/cancel — rifa estropeada: devolver TODO. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body('reason') reason: string) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('Explica el motivo de la cancelación (mín. 5 caracteres)');
    }
    return this.closingService.cancelRaffle(id, reason.trim());
  }

  /** POST /api/v1/raffles/:id/images — hasta 5 fotos del producto. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('files', 5, evidenceUploadOptions))
  uploadImages(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('Falta al menos una imagen (campo "files")');
    return this.rafflesService.addImages(id, files.map((f) => `/uploads/${f.filename}`));
  }

  /** DELETE /api/v1/raffles/:id/images?url=... — quitar una foto. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Delete(':id/images')
  removeImage(@Param('id') id: string, @Query('url') url: string) {
    return this.rafflesService.removeImage(id, url);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() dto: UpdateRaffleStatusDto) {
    const raffle = await this.rafflesService.setStatus(id, dto.status);
    // Notificar a todos en la sala cuando el sorteo empieza o termina
    this.events.emit('raffle.status_changed', { raffleId: id, status: dto.status });
    return raffle;
  }

  /** POST /api/v1/raffles/:id/close — reintento del cierre (idempotente). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PRESENTER)
  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.closingService.closeRaffle(id);
  }
}
