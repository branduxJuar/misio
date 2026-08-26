/**
 * 🔎 DIAGNÓSTICO COMPLETO — responde "¿por qué la tómbola está en 0?"
 * con los datos REALES de tu base.
 *
 * USO (desde la carpeta server/):
 *   node scripts/diagnose.js
 *
 * Pega la salida completa en el chat para diagnóstico exacto.
 */
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/misio';

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  console.log(`\n🔎 DIAGNÓSTICO MISIO — ${MONGO_URI}\n${'═'.repeat(60)}`);

  // ── ¿Transacciones soportadas? ──
  try {
    const hello = await db.admin().command({ hello: 1 });
    console.log(`\n▸ MongoDB: ${hello.setName ? `replica set "${hello.setName}" (transacciones OK)` : 'STANDALONE (compras corren sin transacción)'}`);
  } catch { console.log('\n▸ MongoDB: no se pudo determinar la topología'); }

  // ── Usuarios ──
  const users = await db.collection('users').find({}).project({ name: 1, dni: 1, role: 1, walletBalance: 1, walletCanje: 1 }).toArray();
  console.log(`\n▸ USUARIOS (${users.length}):`);
  users.forEach((u) => console.log(`   ${u.dni} · ${u.name} · ${u.role} · saldo S/${u.walletBalance ?? 0} · canje S/${u.walletCanje ?? 0}`));

  // ── Rifas ──
  const raffles = await db.collection('raffles').find({}).project({ title: 1, status: 1, soldCount: 1, totalTickets: 1, winner: 1 }).toArray();
  console.log(`\n▸ RIFAS (${raffles.length}):`);
  for (const r of raffles) {
    console.log(`   "${r.title}" · estado=${r.status} · soldCount=${r.soldCount ?? 0}/${r.totalTickets} · ganador=${r.winner ? 'SÍ' : 'no'}`);
    console.log(`     _id: ${r._id}`);

    // Tickets de esta rifa, por estado Y por tipo de raffleId
    const tickets = await db.collection('tickets').find({
      $or: [{ raffleId: r._id }, { raffleId: r._id.toString() }],
    }).project({ ticketNumber: 1, status: 1, raffleId: 1, userId: 1 }).toArray();

    const byStatus = {};
    let typeObjectId = 0; let typeString = 0;
    tickets.forEach((t) => {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      if (typeof t.raffleId === 'string') typeString++;
      else typeObjectId++;
    });
    console.log(`     boletos en BD: ${tickets.length} → ${JSON.stringify(byStatus)}`);
    console.log(`     tipo de raffleId en boletos: ObjectId=${typeObjectId} · string=${typeString}`);
    if (tickets.length > 0) {
      console.log(`     números: ${tickets.map((t) => `#${t.ticketNumber}(${t.status[0]})`).slice(0, 20).join(' ')}`);
    }
  }

  // ── Transacciones pendientes (compras Yape sin confirmar) ──
  const pending = await db.collection('transactions').find({ status: 'pending' })
    .project({ type: 1, amount: 1, meta: 1, createdAt: 1, userId: 1 }).toArray();
  console.log(`\n▸ TRANSACCIONES PENDIENTES (${pending.length}):`);
  pending.forEach((t) => {
    const nums = t.meta?.ticketNumbers ? ` boletos:${t.meta.ticketNumbers.join(',')}` : '';
    console.log(`   ${t.type} · S/${Math.abs(t.amount)} · rifa:${t.meta?.raffleId ?? '—'}${nums} · ${new Date(t.createdAt).toLocaleString()}`);
  });
  if (pending.length > 0) {
    console.log('   ⚠️  Estas compras NO generan boletos hasta que el admin las CONFIRME en Admin → Pagos');
  }

  // ── Últimas transacciones (para ver si las compras se ejecutan) ──
  const lastTx = await db.collection('transactions').find({}).sort({ createdAt: -1 }).limit(8)
    .project({ type: 1, status: 1, amount: 1, createdAt: 1 }).toArray();
  console.log(`\n▸ ÚLTIMAS TRANSACCIONES:`);
  lastTx.forEach((t) => console.log(`   ${new Date(t.createdAt).toLocaleString()} · ${t.type} · ${t.status} · S/${Math.abs(t.amount)}`));

  console.log(`\n${'═'.repeat(60)}\n✅ Fin del diagnóstico — pega TODO este texto en el chat.\n`);
  await client.close();
}

main().catch((err) => { console.error('❌', err.message); process.exit(1); });
