import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { OptionalJwtGuard } from '../auth/guards/auth.guards';
import { LiveService } from './live.service';

@Controller('live')
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  /**
   * GET /api/v1/live/:raffleId — estado inicial de la sala (PÚBLICO):
   * rifa, tiradas ya ejecutadas y participantes. Los eventos siguientes
   * llegan por WebSocket (/live namespace).
   */
  @UseGuards(OptionalJwtGuard)
  @Get(':raffleId')
  getRoomState(@Param('raffleId') raffleId: string, @Req() req: any) {
    return this.liveService.getRoomState(raffleId, req.user);
  }
}
