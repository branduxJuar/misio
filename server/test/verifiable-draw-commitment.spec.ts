import { VerifiableDrawService } from '../src/live/verifiable-draw.service';
import { drawCommitment } from '../src/live/verifiable-draw.util';

const raffleId = '507f1f77bcf86cd799439011';
const prizes = [{ title: 'Premio', drawMode: 'al_agua', winningAttempt: 3 }];
const beaconChain = 'quicknet-test-chain';
const beaconRound = 12345;

describe('cotejo independiente de la huella del acta', () => {
  let storedProof: any;
  const draws = { findOne: jest.fn(() => ({ lean: async () => storedProof })) };
  const service = new VerifiableDrawService(null as any, null as any, null as any, draws as any, null as any, null as any);

  beforeEach(() => {
    const tickets = [1, 2, 3, 4];
    storedProof = {
      tickets, prizes, beaconChain, beaconRound, cursor: 0,
      commitment: drawCommitment({ raffleId, tickets, prizes, beaconChain, beaconRound }),
    };
  });

  it('confirma la huella sin esperar la ronda de drand', async () => {
    await expect(service.verifyCommitment(raffleId)).resolves.toMatchObject({
      status: 'valid', ticketCount: 4, commitment: storedProof.commitment, reasons: [],
    });
  });

  it('detecta cambios en el padron y boletos duplicados', async () => {
    storedProof.tickets = [1, 2, 2, 4];
    const result = await service.verifyCommitment(raffleId);
    expect(result.status).toBe('invalid');
    expect(result.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('huella'), expect.stringContaining('duplicados'),
    ]));
  });

  it('no confirma un acta inexistente', async () => {
    storedProof = null;
    await expect(service.verifyCommitment(raffleId)).rejects.toThrow('acta verificable');
  });
});
