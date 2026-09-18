import { drawCommitment, drawSequence, locateDraw } from '../src/live/verifiable-draw.util';
import { LiveGateway } from '../src/live/live.gateway';
import { LiveService } from '../src/live/live.service';

const raffleId = '507f1f77bcf86cd799439011';
const tickets = Array.from({ length: 120 }, (_, i) => i + 1);
const beaconChain = 'quicknet-test-chain';
const beaconRound = 12345;
const prizes = [
  { title: 'TV', drawMode: 'al_agua', winningAttempt: 3 },
  { title: 'Celular', drawMode: 'direct', winningAttempt: 1 },
  { title: 'Audifonos', drawMode: 'al_agua', winningAttempt: 2 },
];

describe('secuencia verificable de sorteo multiple', () => {
  it('congela boletos y reglas en la huella', () => {
    const commitment = drawCommitment({ raffleId, tickets, prizes, beaconChain, beaconRound });
    expect(commitment).toMatch(/^[0-9a-f]{64}$/);
    expect(drawCommitment({ raffleId, tickets: [...tickets].reverse(), prizes, beaconChain, beaconRound })).not.toBe(commitment);
    expect(drawCommitment({ raffleId, tickets, prizes: [{ ...prizes[0], winningAttempt: 2 }, ...prizes.slice(1)], beaconChain, beaconRound })).not.toBe(commitment);
    expect(drawCommitment({ raffleId, tickets, prizes, beaconChain, beaconRound: beaconRound + 1 })).not.toBe(commitment);
  });

  it('da la misma secuencia sin repeticiones al repetir la verificacion', () => {
    const commitment = drawCommitment({ raffleId, tickets, prizes, beaconChain, beaconRound });
    const first = drawSequence(tickets, commitment, 'firma-publica-de-prueba');
    expect(first).toEqual(drawSequence(tickets, commitment, 'firma-publica-de-prueba'));
    expect(new Set(first).size).toBe(tickets.length);
    expect(first).toHaveLength(tickets.length);
    expect(tickets[0]).toBe(1); // no altera la lista congelada
    expect(drawSequence(tickets, commitment, 'otra-firma')).not.toEqual(first);
  });

  it('asigna a cada premio sus aguas y un ganador en orden global', () => {
    expect(Array.from({ length: 6 }, (_, cursor) => locateDraw(prizes, cursor))).toEqual([
      { prizeIndex: 0, attempt: 1, isWinner: false },
      { prizeIndex: 0, attempt: 2, isWinner: false },
      { prizeIndex: 0, attempt: 3, isWinner: true },
      { prizeIndex: 1, attempt: 1, isWinner: true },
      { prizeIndex: 2, attempt: 1, isWinner: false },
      { prizeIndex: 2, attempt: 2, isWinner: true },
    ]);
    expect(locateDraw(prizes, 6)).toBeNull();
  });
});

describe('modalidades de sorteo', () => {
  it('exige registro manual en el sorteo fisico y reserva la tirada automatica al verificable', async () => {
    const raffleModel = { findById: jest.fn() };
    const verified = { drawNext: jest.fn().mockResolvedValue({ ticketNumber: 42 }) };
    const service = new LiveService(raffleModel as any, {} as any, {} as any, {} as any, verified as any);
    raffleModel.findById.mockReturnValue({ select: () => ({ lean: async () => ({ drawProtocol: 'legacy' }) }) });
    await expect(service.drawNext(raffleId)).rejects.toThrow('requiere extraer un boleto');
    expect(verified.drawNext).not.toHaveBeenCalled();

    raffleModel.findById.mockReturnValue({ select: () => ({ lean: async () => ({ drawProtocol: 'verifiable_v1' }) }) });
    expect((await service.drawNext(raffleId, 0)).ticketNumber).toBe(42);
    expect(verified.drawNext).toHaveBeenCalledWith(raffleId, 0);
  });

  it('impide introducir a mano un boleto en el modo verificable', async () => {
    const raffleModel = { findById: () => ({ select: () => ({ lean: async () => ({ drawProtocol: 'verifiable_v1' }) }) }) };
    const service = new LiveService(raffleModel as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.drawSpecific(raffleId, 12)).rejects.toThrow('no permite elegir manualmente');
  });

  it('registra el boleto extraido manualmente en el sorteo fisico', async () => {
    const raffleModel = { findById: () => ({ select: () => ({ lean: async () => ({ drawProtocol: 'legacy' }) }) }) };
    const release = jest.fn();
    const service = new LiveService(raffleModel as any, {} as any, {} as any, { acquire: jest.fn().mockResolvedValue(release) } as any, {} as any);
    const manual = jest.spyOn(service as any, 'drawSpecificOnce').mockResolvedValue({ ticketNumber: 12 });

    expect((await service.drawSpecific(raffleId, 12)).ticketNumber).toBe(12);
    expect(manual).toHaveBeenCalledWith(raffleId, 12, -1);
    expect(release).toHaveBeenCalled();
  });
});

describe('eventos de premios multiples', () => {
  it('no anuncia que todo el sorteo termino cuando gano un premio intermedio', async () => {
    const emitted: string[] = [];
    const gateway = new LiveGateway(
      { drawNext: async () => ({ result: 'winner', ticketNumber: 42, holderName: 'Ana', prizeIndex: 0, prizeTitle: 'TV' }) } as any,
      { verify: () => ({ role: 'admin' }) } as any,
      { check: async () => null } as any,
      {} as any,
    );
    gateway.server = { to: () => ({ emit: (event: string) => emitted.push(event) }) } as any;
    const response = await gateway.presenterDraw({ handshake: { auth: { token: 'test' } } } as any, { raffleId });
    expect(response.ok).toBe(true);
    expect(emitted).toContain('prize_completed');
    expect(emitted).not.toContain('raffle_completed');
  });
});
