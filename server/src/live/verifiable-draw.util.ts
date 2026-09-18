import { createHash, createHmac } from 'crypto';

export const DRAW_VERSION = 'verifiable_v1';

export function locateDraw(prizes: { winningAttempt: number }[], cursor: number) {
  let offset = 0;
  for (let prizeIndex = 0; prizeIndex < prizes.length; prizeIndex++) {
    const attempt = cursor - offset + 1;
    if (attempt <= prizes[prizeIndex].winningAttempt) {
      return { prizeIndex, attempt, isWinner: attempt === prizes[prizeIndex].winningAttempt };
    }
    offset += prizes[prizeIndex].winningAttempt;
  }
  return null;
}

export function drawCommitment(input: {
  raffleId: string;
  tickets: number[];
  prizes: { title: string; drawMode: string; winningAttempt: number }[];
  beaconChain: string;
  beaconRound: number;
}): string {
  return createHash('sha256').update(JSON.stringify({ version: DRAW_VERSION, ...input })).digest('hex');
}

/** Fisher-Yates with rejection sampling; no modulo bias or Math.random. */
export function drawSequence(tickets: number[], commitment: string, signature: string): number[] {
  const sequence = [...tickets];
  const key = createHash('sha256').update(`${DRAW_VERSION}:${commitment}:${signature}`).digest();
  let counter = 0;
  for (let i = sequence.length - 1; i > 0; i--) {
    const range = i + 1;
    const limit = Math.floor(0x1_0000_0000 / range) * range;
    let value: number;
    do {
      value = createHmac('sha256', key).update(String(counter++)).digest().readUInt32BE(0);
    } while (value >= limit);
    const j = value % range;
    [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
  }
  return sequence;
}
