const formatDate = (value) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'No registrada';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', timeZone: 'America/Lima', timeZoneName: 'shortOffset',
  }).formatToParts(new Date(value)).filter(({ type }) => type !== 'literal').map(({ type, value: part }) => [type, part]));
  const month = parts.month[0].toUpperCase() + parts.month.slice(1);
  return `${parts.day} de ${month} de ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} (${parts.timeZoneName} · Hora de Lima, Perú)`;
};

export function drawActFacts(proof, lastDraw, raffle) {
  const numbers = [...proof.tickets].sort((a, b) => a - b);
  const first = numbers[0];
  const last = numbers.at(-1);
  const contiguous = numbers.length > 0 && new Set(numbers).size === numbers.length && last - first + 1 === numbers.length;
  const digits = Math.max(3, String(last ?? 0).length);
  const ticketCount = contiguous
    ? `${numbers.length} boletos (del ${String(first).padStart(digits, '0')} al ${String(last).padStart(digits, '0')})`
    : `${numbers.length} boletos en el padrón`;
  const rule = proof.prizes.length === 1
    ? proof.prizes[0].winningAttempt === 1
      ? 'Regla de la 1.ª tirada (ganadora)'
      : `Regla de la ${proof.prizes[0].winningAttempt}.ª tirada (${proof.prizes[0].winningAttempt - 1} al agua + ${proof.prizes[0].winningAttempt}.ª ganadora)`
    : `Mecánica registrada para ${proof.prizes.length} premios`;
  const prizeRules = proof.prizes.length > 1 ? proof.prizes.map((prize, index) => ({
    label: `Regla del premio ${index + 1}:`,
    value: `${prize.title} · ${prize.winningAttempt === 1 ? '1.ª tirada ganadora' : `${prize.winningAttempt - 1} al agua + ${prize.winningAttempt}.ª tirada ganadora`}`,
  })) : [];

  const facts = [
    { label: lastDraw ? 'Fecha y hora oficial:' : 'Acta preparada:', value: formatDate(lastDraw || proof.preparedAt) },
    { label: 'Total de boletos en padrón:', value: ticketCount },
    { label: 'Mecánica de sorteo aplicada:', value: rule },
    ...prizeRules,
  ];

  if (raffle?.drawProtocol !== 'legacy') {
    facts.push({ label: 'Faro de aleatoriedad externa:', value: `Drand League of Entropy (Turno #${proof.beaconRound})` });
  }

  return facts;
}
