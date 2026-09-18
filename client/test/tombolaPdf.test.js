import assert from 'node:assert/strict';
import test from 'node:test';
import { createTombolaPdf, getPrintableTombolaTickets } from '../src/utils/tombolaPdf.js';

const stamp = { accountId: '507f1f77bcf86cd799439011', downloadedAt: '2026-09-17T13:35:00.000Z' };

test('imprime números y una marca mínima de descarga en 40 recortes por página', async () => {
  const tickets = Array.from({ length: 43 }, (_, index) => {
    const ticketNumber = 43 - index;
    return { ticketNumber, code: `PS-${String(ticketNumber).padStart(3, '0')}` };
  });
  const pdf = await createTombolaPdf(tickets, stamp);
  assert.equal(pdf.getNumberOfPages(), 2);
  const first = pdf.internal.pages[1].join('\n');
  const second = pdf.internal.pages[2].join('\n');
  assert.equal((first.match(/\(PS-\d{3}\) Tj/g) ?? []).length, 40);
  assert.equal((second.match(/\(PS-\d{3}\) Tj/g) ?? []).length, 3);
  assert.match(first, /\(PS-001\) Tj/);
  assert.match(second, /\(PS-043\) Tj/);
  assert.equal((first.match(/\(misio\.pe  17\/09\/2026 08:35\) Tj/g) ?? []).length, 40);
  assert.equal((second.match(/\(CUENTA 6CD799439011\) Tj/g) ?? []).length, 3);
  assert.doesNotMatch(first + second, /Cliente|Teléfono|DNI|Correo|Código/);
});

test('rechaza listas vacías, repetidas o con números inválidos', async () => {
  for (const tickets of [[], [{ ticketNumber: 1, code: 'PS-001' }, { ticketNumber: 1, code: 'PS-001' }],
    [{ ticketNumber: 0, code: 'PS-000' }], [{ ticketNumber: 1.5, code: 'PS-001' }],
    [{ ticketNumber: 1, code: 'PS-002' }], [{ ticketNumber: 1, code: 'Nombre privado' }]]) {
    await assert.rejects(createTombolaPdf(tickets, stamp));
  }
});

test('no genera un PDF sin cuenta y fecha verificables', async () => {
  const tickets = [{ ticketNumber: 1, code: 'PS-001' }];
  await assert.rejects(createTombolaPdf(tickets));
  await assert.rejects(createTombolaPdf(tickets, { accountId: stamp.accountId, downloadedAt: 'invalida' }));
});

test('en curso solo imprime activos; al finalizar incluye todos los emitidos', () => {
  const tickets = [
    { ticketNumber: 1, status: 'active' },
    { ticketNumber: 2, status: 'burned_al_agua' },
    { ticketNumber: 3, status: 'winner' },
  ];
  assert.deepEqual(getPrintableTombolaTickets(tickets, 'live'), [tickets[0]]);
  assert.deepEqual(getPrintableTombolaTickets(tickets, 'completed'), tickets);
});
