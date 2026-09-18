import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { quicknetClient, fetchBeacon, roundAt } from 'drand-client';
import { Connection, Model } from 'mongoose';
import { maskName } from '../common/mask-name.util';
import { DistributedLockService } from '../common/distributed-lock.service';
import { DrawMode, Raffle, RaffleDocument, RaffleStatus, RaffleType } from '../raffles/raffle.schema';
import { Ticket, TicketDocument, TicketStatus } from '../tickets/ticket.schema';
import { DrawResult } from './live.service';
import { VerifiableDraw, VerifiableDrawDocument } from './verifiable-draw.schema';
import { drawCommitment, drawSequence, locateDraw } from './verifiable-draw.util';
import { RaffleDossierService } from '../raffles/raffle-dossier.service';

@Injectable()
export class VerifiableDrawService {
  private readonly beacon = quicknetClient();

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Raffle.name) private readonly raffles: Model<RaffleDocument>,
    @InjectModel(Ticket.name) private readonly tickets: Model<TicketDocument>,
    @InjectModel(VerifiableDraw.name) private readonly draws: Model<VerifiableDrawDocument>,
    private readonly locks: DistributedLockService,
    private readonly dossierService: RaffleDossierService,
  ) {}

  async prepare(raffleId: string) {
    const release = await this.locks.acquire(`raffle-draw:${raffleId}`);
    try {
      const existing = await this.draws.findOne({ raffleId });
      if (existing) return this.proofSummary(raffleId);
      const raffle = await this.raffles.findById(raffleId).lean();
      if (!raffle) throw new NotFoundException('Rifa no existe');
      if (raffle.drawProtocol !== 'verifiable_v1' || raffle.status !== RaffleStatus.LIVE) {
        throw new BadRequestException('Solo una rifa verificable en vivo puede prepararse');
      }
      if (raffle.winner || raffle.prizes?.some((p) => p.winner)) {
        throw new BadRequestException('La rifa ya tiene un resultado');
      }
      const prizes = raffle.type === RaffleType.PAQUETE
        ? raffle.prizes.map((p) => ({ title: p.title, drawMode: p.drawMode, winningAttempt: p.drawMode === DrawMode.DIRECT ? 1 : p.winningAttempt }))
        : [{ title: raffle.title, drawMode: raffle.drawMode, winningAttempt: raffle.drawMode === DrawMode.DIRECT ? 1 : raffle.winningAttempt }];
      if (!prizes.length || prizes.some((p) => !Number.isSafeInteger(p.winningAttempt) || p.winningAttempt < 1)) {
        throw new BadRequestException('Configuración de premios inválida');
      }
      const sold = await this.tickets.find({ raffleId })
        .select('ticketNumber status').sort({ ticketNumber: 1 }).lean();
      if (sold.some((t) => t.status !== TicketStatus.ACTIVE)) {
        throw new BadRequestException('Ya hay boletos sorteados; no se puede preparar otra secuencia');
      }
      const numbers = sold.map((t) => t.ticketNumber);
      if (new Set(numbers).size !== numbers.length || numbers.length < prizes.reduce((sum, p) => sum + p.winningAttempt, 0)) {
        throw new BadRequestException('No hay suficientes boletos únicos para todas las tiradas de los premios');
      }
      const latest = await fetchBeacon(this.beacon);
      const chain = await this.beacon.chain().info();
      const beaconRound = Math.max(latest.round + 40, roundAt(Date.now() + 120_000, chain));
      const commitment = drawCommitment({ raffleId, tickets: numbers, prizes, beaconChain: chain.hash, beaconRound });
      try {
        await this.draws.create({ 
          raffleId, tickets: numbers, prizes, commitment, beaconRound, beaconChain: chain.hash, cursor: 0,
          openedAt: new Date(),
          commitmentPublishedAt: new Date()
        });
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
      }
      return this.proofSummary(raffleId);
    } finally {
      await release();
    }
  }

  async publicProof(raffleId: string) {
    const proof = await this.draws.findOne({ raffleId }).lean();
    if (!proof) return null;
    // Fetch the proof and dossier info
    let dossier: any = null;
    try {
      const d = await this.dossierService.findByRaffleId(raffleId);
      if (d) {
        dossier = {
          certifierName: d.certifierName,
          certifierRole: d.certifierRole,
          reference: d.reference,
          videoUrl: d.videoUrl,
          videoPlatform: d.videoPlatform,
          status: d.status,
        };
      }
    } catch (e) {}

    return {
      version: 'verifiable_v1', raffleId, commitment: proof.commitment,
      beaconChain: proof.beaconChain, beaconRound: proof.beaconRound,
      tickets: proof.tickets, prizes: proof.prizes, cursor: proof.cursor,
      beaconSignature: proof.beaconSignature ?? null, events: proof.events ?? [], preparedAt: (proof as any).createdAt,
      dossier
    };
  }

  async proofSummary(raffleId: string) {
    const proof = await this.publicProof(raffleId);
    if (!proof) return null;
    const { tickets, events, ...rest } = proof;
    return { ...rest, ticketCount: tickets.length, eventCount: events.length };
  }

  async publicBeacon(raffleId: string) {
    const proof = await this.draws.findOne({ raffleId }).select('beaconRound').lean();
    if (!proof) throw new NotFoundException('Este sorteo aún no tiene acta verificable');
    try {
      const beacon = await fetchBeacon(this.beacon, proof.beaconRound);
      return { round: beacon.round, signature: beacon.signature };
    } catch {
      throw new ServiceUnavailableException('El dato de drand no está disponible en este momento');
    }
  }

  private commitmentReasons(proof: NonNullable<Awaited<ReturnType<VerifiableDrawService['publicProof']>>>): string[] {
    const reasons: string[] = [];
    const commitment = drawCommitment({ raffleId: proof.raffleId, tickets: proof.tickets, prizes: proof.prizes,
      beaconChain: proof.beaconChain, beaconRound: proof.beaconRound });
    if (commitment !== proof.commitment) reasons.push('La lista o las reglas no coinciden con la huella publicada');
    if (new Set(proof.tickets).size !== proof.tickets.length) reasons.push('Hay boletos duplicados');
    return reasons;
  }

  async verifyCommitment(raffleId: string) {
    const proof = await this.publicProof(raffleId);
    if (!proof) throw new NotFoundException('Este sorteo aún no tiene acta verificable');
    const reasons = this.commitmentReasons(proof);
    return { status: reasons.length ? 'invalid' : 'valid', reasons, ticketCount: proof.tickets.length, commitment: proof.commitment };
  }

  async verify(raffleId: string) {
    const proof = await this.publicProof(raffleId);
    if (!proof) throw new NotFoundException('Este sorteo aún no tiene acta verificable');
    const reasons = this.commitmentReasons(proof);
    if (!proof.beaconSignature) return { status: reasons.length ? 'invalid' : 'pending', reasons };
    let beacon;
    try { beacon = await fetchBeacon(this.beacon, proof.beaconRound); }
    catch { return { status: 'unavailable', reasons: ['No se pudo verificar la ronda pública ahora'] }; }
    if (beacon.signature !== proof.beaconSignature) reasons.push('La firma pública no coincide');
    const sequence = drawSequence(proof.tickets, proof.commitment, beacon.signature);
    let offset = 0;
    proof.prizes.forEach((prize, prizeIndex) => {
      for (let attempt = 1; attempt <= prize.winningAttempt; attempt++) {
        const event = proof.events[offset];
        if (!event) break;
        if (event.prizeIndex !== prizeIndex || event.attempt !== attempt ||
            event.ticketNumber !== sequence[offset] ||
            event.result !== (attempt === prize.winningAttempt ? 'winner' : 'al_agua')) {
          reasons.push(`La tirada ${offset + 1} no coincide con la secuencia comprometida`);
        }
        offset++;
      }
    });
    if (offset !== proof.events.length || proof.cursor !== proof.events.length) reasons.push('El historial de tiradas no coincide con el cursor');
    return { status: reasons.length ? 'invalid' : 'valid', reasons, checkedDraws: proof.events.length };
  }

  async drawNext(raffleId: string, prizeIndex: number): Promise<DrawResult> {
    const release = await this.locks.acquire(`raffle-draw:${raffleId}`);
    try {
      let proof = await this.draws.findOne({ raffleId });
      if (!proof) throw new BadRequestException('Prepara y publica el compromiso antes de cantar');
      if (!proof.sequence?.length) {
        let beacon;
        try { beacon = await fetchBeacon(this.beacon, proof.beaconRound); }
        catch { throw new BadRequestException('La fuente pública de azar todavía no está disponible. Espera y vuelve a intentar'); }
        if (beacon.round !== proof.beaconRound) throw new BadRequestException('Ronda de azar incorrecta');
        proof = await this.draws.findByIdAndUpdate(proof._id, {
          $set: {
            beaconSignature: beacon.signature,
            sequence: drawSequence(proof.tickets, proof.commitment, beacon.signature),
          },
        }, { new: true });
        if (!proof) throw new NotFoundException('Acta del sorteo no existe');
      }
      const session = await this.connection.startSession();
      try {
        return await session.withTransaction(async () => {
          const raffle = await this.raffles.findById(raffleId).session(session);
          if (!raffle || raffle.status !== RaffleStatus.LIVE) throw new BadRequestException('La rifa no está en vivo');
          const current = await this.draws.findById(proof!._id).session(session);
          if (!current?.sequence?.length) throw new BadRequestException('La secuencia no está preparada');
          const next = locateDraw(current.prizes, current.cursor);
          if (!next) throw new BadRequestException('Todos los premios ya fueron sorteados');
          const { prizeIndex: expectedPrize, attempt, isWinner } = next;
          const requested = raffle.type === RaffleType.PAQUETE ? prizeIndex : 0;
          if (requested !== expectedPrize) throw new BadRequestException(`Corresponde sortear el premio ${expectedPrize + 1}`);
          const number = current.sequence[current.cursor];
          const ticket = await this.tickets.findOneAndUpdate(
            { raffleId, ticketNumber: number, status: TicketStatus.ACTIVE },
            { $set: { status: isWinner ? TicketStatus.WINNER : TicketStatus.BURNED_AL_AGUA,
              ...(raffle.type === RaffleType.PAQUETE ? { prizeIndex: expectedPrize } : {}) } },
            { new: true, session },
          ).populate('userId', 'name');
          if (!ticket) {
            // Registrar incidencia de forma asíncrona porque la transacción principal va a hacer rollback
            this.addIncident(raffleId, 'high', `El boleto ${number} (secuencia ${current.cursor}) no estaba activo. Sorteo detenido para revisión.`).catch(() => {});
            throw new BadRequestException('El boleto comprometido ya no está activo; sorteo detenido para revisión');
          }
          const holderName = ticket.isOffline ? (ticket.buyerName || 'Cliente Físico') : ((ticket.userId as any)?.name || 'Usuario');
          const holderId = ticket.isOffline ? 'offline' : ((ticket.userId as any)?._id?.toString() || ticket.userId?.toString() || '');
          const drawnAt = new Date().toISOString();
          if (isWinner) {
            const winner = { ticketNumber: number, code: ticket.code, name: holderName, userId: holderId, drawnAt };
            if (raffle.type === RaffleType.PAQUETE) raffle.prizes[expectedPrize].winner = winner;
            else raffle.winner = winner;
            await raffle.save({ session });
          }
          current.events.push({ prizeIndex: expectedPrize, attempt, ticketNumber: number, result: isWinner ? 'winner' : 'al_agua', drawnAt });
          current.cursor += 1;
          
          if (!locateDraw(current.prizes, current.cursor)) {
            current.closedAt = new Date();
          }
          
          await current.save({ session });
          return {
            attempt, totalAttempts: current.prizes[expectedPrize].winningAttempt,
            result: isWinner ? 'winner' as const : 'al_agua' as const,
            ticketNumber: number, holderName: maskName(holderName), drawnAt,
            prizeIndex: raffle.type === RaffleType.PAQUETE ? expectedPrize : undefined,
            prizeTitle: raffle.type === RaffleType.PAQUETE ? current.prizes[expectedPrize].title : undefined,
            winnerUserId: isWinner && holderId !== 'offline' ? holderId : undefined,
          };
        });
      } finally { await session.endSession(); }
    } finally { await release(); }
  }

  async addIncident(raffleId: string, severity: 'low' | 'medium' | 'high' | 'critical', message: string) {
    try {
      await this.draws.updateOne(
        { raffleId },
        { $push: { incidents: { severity, message, timestamp: new Date() } } }
      );
    } catch (error) {
      // Ignorar errores al guardar incidencias para no afectar el flujo
    }
  }
}
