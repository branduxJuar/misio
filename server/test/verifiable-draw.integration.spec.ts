import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DistributedLockService } from '../src/common/distributed-lock.service';
import { Raffle, RaffleSchema } from '../src/raffles/raffle.schema';
import { Ticket, TicketSchema } from '../src/tickets/ticket.schema';
import { VerifiableDraw, VerifiableDrawSchema } from '../src/live/verifiable-draw.schema';
import { VerifiableDrawService } from '../src/live/verifiable-draw.service';
import { drawCommitment, drawSequence } from '../src/live/verifiable-draw.util';

describe('tiradas verificables persistidas', () => {
  let mongo: MongoMemoryReplSet;
  let connection: mongoose.Connection;
  let service: VerifiableDrawService;
  let raffles: mongoose.Model<any>;
  let tickets: mongoose.Model<any>;
  let draws: mongoose.Model<any>;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await mongoose.createConnection(mongo.getUri()).asPromise();
    raffles = connection.model(Raffle.name, RaffleSchema);
    tickets = connection.model(Ticket.name, TicketSchema);
    draws = connection.model(VerifiableDraw.name, VerifiableDrawSchema);
    const locks = { acquire: async () => async () => undefined } as unknown as DistributedLockService;
    const dossierService = { findByRaffleId: jest.fn(() => null) } as any;
    service = new VerifiableDrawService(connection, raffles, tickets, draws, locks, dossierService);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await mongo?.stop();
  });

  it('consume una bolsa compartida: agua, ganador y siguiente premio', async () => {
    const raffle = await raffles.create({
      title: 'Paquete', ticketPrefix: 'PKT', ticketPrice: 5, totalTickets: 10,
      drawDate: new Date(), status: 'live', type: 'paquete', drawProtocol: 'verifiable_v1',
      prizes: [
        { title: 'TV', drawMode: 'al_agua', winningAttempt: 2 },
        { title: 'Celular', drawMode: 'direct', winningAttempt: 1 },
      ],
    });
    const raffleId = String(raffle._id);
    for (let n = 1; n <= 4; n++) await tickets.create({ raffleId, ticketNumber: n, code: `PKT-${n}` });
    const numbers = [1, 2, 3, 4];
    const prizes = [
      { title: 'TV', drawMode: 'al_agua', winningAttempt: 2 },
      { title: 'Celular', drawMode: 'direct', winningAttempt: 1 },
    ];
    const beaconChain = 'test-chain';
    const beaconRound = 42;
    const signature = 'test-signature';
    const commitment = drawCommitment({ raffleId, tickets: numbers, prizes, beaconChain, beaconRound });
    const sequence = drawSequence(numbers, commitment, signature);
    await draws.create({ raffleId, tickets: numbers, prizes, commitment, beaconChain, beaconRound,
      beaconSignature: signature, sequence, cursor: 0 });

    await expect(service.drawNext(raffleId, 1)).rejects.toThrow('Corresponde sortear el premio 1');
    expect((await draws.findOne({ raffleId })).cursor).toBe(0);
    const first = await service.drawNext(raffleId, 0);
    const second = await service.drawNext(raffleId, 0);
    const third = await service.drawNext(raffleId, 1);
    expect([first.result, second.result, third.result]).toEqual(['al_agua', 'winner', 'winner']);
    expect([first.ticketNumber, second.ticketNumber, third.ticketNumber]).toEqual(sequence.slice(0, 3));
    expect((await draws.findOne({ raffleId })).cursor).toBe(3);
    expect((await raffles.findById(raffleId)).prizes.map((p: any) => p.winner?.ticketNumber)).toEqual(sequence.slice(1, 3));
    await expect(service.drawNext(raffleId, 1)).rejects.toThrow('Todos los premios');
  }, 60_000);

  it('no publica un acta si faltan boletos para todas las tiradas', async () => {
    const raffle = await raffles.create({
      title: 'Paquete corto', ticketPrefix: 'CORT', ticketPrice: 5, totalTickets: 10,
      drawDate: new Date(), status: 'live', type: 'paquete', drawProtocol: 'verifiable_v1',
      prizes: [{ title: 'TV', drawMode: 'al_agua', winningAttempt: 3 }],
    });
    await tickets.create({ raffleId: raffle._id, ticketNumber: 1 });
    await tickets.create({ raffleId: raffle._id, ticketNumber: 2 });
    await expect(service.prepare(String(raffle._id))).rejects.toThrow('No hay suficientes boletos');
    expect(await draws.countDocuments({ raffleId: raffle._id })).toBe(0);
  });
});
