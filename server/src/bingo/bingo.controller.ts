import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { BingoService } from './bingo.service';
import { CreateBingoRoomDto, JoinBingoDto } from './dto/bingo.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guards';
import { AuthUser, CurrentUser } from '../auth/decorators/roles.decorator';

/**
 * BINGO SOCIAL v2 — TODO requiere cuenta (jugar es gratis, pero
 * registrado). El admin NO participa: las salas son de los usuarios.
 */
@UseGuards(JwtAuthGuard)
@Controller('bingo')
export class BingoController {
  constructor(private readonly bingoService: BingoService) {}

  /** POST /api/v1/bingo/rooms — crear sala (el creador es el anfitrión). */
  @Post('rooms')
  createRoom(@CurrentUser() user: AuthUser, @Body() dto: CreateBingoRoomDto) {
    return this.bingoService.createRoom(user.userId, user.name, dto);
  }

  /** POST /api/v1/bingo/join — entrar con el código que te compartieron. */
  @Post('join')
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinBingoDto) {
    return this.bingoService.joinByCode(user.userId, dto.code);
  }

  /** GET /api/v1/bingo/rooms/mine — mis partidas recientes. */
  @Get('rooms/mine')
  myRooms(@CurrentUser() user: AuthUser) {
    return this.bingoService.myRooms(user.userId);
  }

  /**
   * POST /api/v1/bingo/rooms/:id/enter — ENTRAR: devuelve el estado y,
   * si aún no tenías cartón (y hay cupo), te reparte uno.
   */
  @Post('rooms/:id/enter')
  enter(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bingoService.enterRoom(id, user.userId);
  }

  /** GET /api/v1/bingo/rooms/:id — estado (solo si tienes cartón). */
  @Get('rooms/:id')
  getRoom(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bingoService.getRoomState(id, user.userId);
  }

  /** POST /api/v1/bingo/rooms/:id/restart — revancha (solo anfitrión). */
  @Post('rooms/:id/restart')
  restart(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bingoService.restartRoom(id, user.userId);
  }

  /** POST /api/v1/bingo/rooms/:id/leave — abandonar la sala. */
  @Post('rooms/:id/leave')
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bingoService.leaveRoom(id, user.userId);
  }
}
