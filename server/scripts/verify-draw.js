const { quicknetClient, fetchBeacon } = require('drand-client');
const { drawCommitment, drawSequence, locateDraw } = require('../dist/src/live/verifiable-draw.util');

async function main() {
  const url = process.argv[2];
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error('Uso: node scripts/verify-draw.js https://api.misio.pe/api/v1/live/ID/proof');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo leer el acta: HTTP ${response.status}`);
  const proof = await response.json();
  if (proof?.version !== 'verifiable_v1') throw new Error('Acta o version no compatible');
  const commitment = drawCommitment({ raffleId: proof.raffleId, tickets: proof.tickets, prizes: proof.prizes,
    beaconChain: proof.beaconChain, beaconRound: proof.beaconRound });
  if (commitment !== proof.commitment) throw new Error('La huella no coincide con la lista y reglas');
  if (!proof.beaconSignature) throw new Error('La ronda publica aun no se ha usado');
  const client = quicknetClient();
  const chain = await client.chain().info();
  if (chain.hash !== proof.beaconChain) throw new Error('Cadena publica incorrecta');
  const beacon = await fetchBeacon(client, proof.beaconRound);
  if (beacon.signature !== proof.beaconSignature) throw new Error('Firma de ronda distinta a la registrada');
  const sequence = drawSequence(proof.tickets, proof.commitment, beacon.signature);
  if (new Set(sequence).size !== sequence.length) throw new Error('Secuencia con boletos repetidos');
  if (proof.cursor !== proof.events.length) throw new Error('Numero de tiradas inconsistente');
  proof.events.forEach((event, cursor) => {
    const expected = locateDraw(proof.prizes, cursor);
    if (!expected || event.ticketNumber !== sequence[cursor] ||
        event.prizeIndex !== expected.prizeIndex || event.attempt !== expected.attempt ||
        event.result !== (expected.isWinner ? 'winner' : 'al_agua')) {
      throw new Error(`Tirada ${cursor + 1} no coincide`);
    }
  });
  console.log(`Verificado: ${proof.events.length} tiradas coinciden. Huella: ${commitment}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
