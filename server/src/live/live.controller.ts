import { Controller, Get, Header, Param, Post, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard, OptionalJwtGuard } from '../auth/guards/auth.guards';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePerm } from '../auth/decorators/roles.decorator';
import { LiveService } from './live.service';
import { VerifiableDrawService } from './verifiable-draw.service';
import { ParticipantProofGuard } from './participant-proof.guard';
import { RaffleDossierService } from '../raffles/raffle-dossier.service';

@Controller('live')
export class LiveController {
  constructor(
    private readonly liveService: LiveService, 
    private readonly verifiableDraw: VerifiableDrawService,
    private readonly dossierService: RaffleDossierService
  ) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePerm('sorteos')
  @Post(':raffleId/prepare')
  prepare(@Param('raffleId') raffleId: string) {
    return this.verifiableDraw.prepare(raffleId);
  }

  @UseGuards(JwtAuthGuard, ParticipantProofGuard)
  @Header('Cache-Control', 'private, no-store')
  @Get(':raffleId/proof')
  proof(@Param('raffleId') raffleId: string) {
    return this.verifiableDraw.publicProof(raffleId);
  }

  @Get(':raffleId/proof/status')
  proofStatus(@Param('raffleId') raffleId: string) {
    return this.verifiableDraw.proofSummary(raffleId);
  }

  @UseGuards(JwtAuthGuard, ParticipantProofGuard)
  @Header('Cache-Control', 'private, no-store')
  @Get(':raffleId/proof/commitment-check')
  verifyCommitment(@Param('raffleId') raffleId: string) {
    return this.verifiableDraw.verifyCommitment(raffleId);
  }

  @UseGuards(JwtAuthGuard, ParticipantProofGuard)
  @Header('Cache-Control', 'private, no-store')
  @Get(':raffleId/verify')
  verify(@Param('raffleId') raffleId: string) {
    return this.verifiableDraw.verify(raffleId);
  }

  @Get(':raffleId/beacon')
  beacon(@Param('raffleId') raffleId: string) {
    return this.verifiableDraw.publicBeacon(raffleId);
  }

  @Get(':raffleId/dossier')
  async publicDossier(@Param('raffleId') raffleId: string) {
    const dossier = await this.dossierService.findByRaffleId(raffleId);
    if (!dossier) return null;
    return {
      certifierName: dossier.certifierName,
      certifierRole: dossier.certifierRole,
      reference: dossier.reference,
      status: dossier.status,
      videoPlatform: dossier.videoPlatform,
      videoUrl: dossier.videoUrl,
      updatedAt: (dossier as any).updatedAt
    };
  }

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
