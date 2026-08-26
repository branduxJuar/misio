/**
 * SEED DE DESARROLLO — Puebla la base con datos de prueba coherentes.
 * Uso:  node scripts/seed.js
 * ⚠️  BORRA las colecciones users, raffles, tickets, transactions y
 *     logistics_erp antes de insertar. Solo para entornos de desarrollo.
 *
 * Credenciales que crea:
 *   Admin:   DNI 11111111 / clave admin123
 *   Usuario: DNI 74581236 / clave demo123  (Carla, con S/ 47 de saldo)
 *   Usuario: DNI 45678912 / clave demo123  (Jorge, con S/ 10 de saldo)
 */
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGO_URI ?? 'mongodb://localhost:27017/misio');
  const db = mongoose.connection;
  console.log('Conectado. Limpiando colecciones...');

  const collections = ['users', 'raffles', 'tickets', 'transactions', 'logistics_erp'];
  for (const c of collections) await db.collection(c).deleteMany({});

  const hash = (pwd) => bcrypt.hash(pwd, 10);
  const now = new Date();

  // ── Usuarios ─────────────────────────────────────────────────────
  const users = await db.collection('users').insertMany([
    {
      name: 'Super Admin', dni: '11111111', phone: '999999999',
      role: 'admin', walletBalance: 0,
      passwordHash: await hash('admin123'), createdAt: now, updatedAt: now,
    },
    {
      name: 'Carla Mendoza', dni: '74581236', phone: '987654321',
      role: 'user', walletBalance: 20, walletCanje: 27,
      passwordHash: await hash('demo123'), createdAt: now, updatedAt: now,
    },
    {
      name: 'Jorge Ramírez', dni: '45678912', phone: '956123789',
      role: 'user', walletBalance: 10, walletCanje: 0,
      passwordHash: await hash('demo123'), createdAt: now, updatedAt: now,
    },
  ]);
  const [adminId, carlaId, jorgeId] = Object.values(users.insertedIds);

  // ── Rifas ────────────────────────────────────────────────────────
  const raffles = await db.collection('raffles').insertMany([
    {
      title: 'iPhone 16 Pro Max 256GB',
      description: 'Titanio negro, sellado, con boleta y garantía Apple Perú.',
      ticketPrefix: 'IPH16', images: [], drawMode: 'al_agua',
      ticketPrice: 10, totalTickets: 500, winningAttempt: 3,
      maxTicketsPerUser: 10, drawDate: new Date(Date.now() + 2 * 86400000),
      notifyDayBefore: true, dayBeforeNotified: false, postponements: [],
      refundsProcessed: false,
      streamUrl: '', status: 'live', createdAt: now, updatedAt: now,
    },
    {
      title: 'PlayStation 5 Slim + 2 mandos',
      description: 'Edición disco 1TB, incluye EA FC 26 físico.',
      ticketPrefix: 'PS5', images: [], drawMode: 'al_agua',
      ticketPrice: 8, totalTickets: 400, winningAttempt: 4,
      maxTicketsPerUser: 8, drawDate: new Date(Date.now() + 5 * 86400000),
      notifyDayBefore: true, dayBeforeNotified: false, postponements: [],
      refundsProcessed: false,
      streamUrl: '', status: 'active', createdAt: now, updatedAt: now,
    },
    {
      title: 'S/ 1,500 en efectivo (Yape directo)',
      description: 'Transferencia inmediata al ganador, en vivo.',
      ticketPrefix: 'CASH', images: [], drawMode: 'direct',
      ticketPrice: 5, totalTickets: 600, winningAttempt: 1,
      maxTicketsPerUser: 15, drawDate: new Date(Date.now() + 7 * 86400000),
      notifyDayBefore: true, dayBeforeNotified: false, postponements: [],
      refundsProcessed: false,
      streamUrl: '', status: 'active', createdAt: now, updatedAt: now,
    },
  ]);
  const [iphoneId, ps5Id] = Object.values(raffles.insertedIds);

  // ── Boletos ──────────────────────────────────────────────────────
  await db.collection('tickets').insertMany([
    { userId: carlaId, raffleId: iphoneId, ticketNumber: 287, code: 'IPH16-0287', status: 'active', createdAt: now, updatedAt: now },
    { userId: carlaId, raffleId: iphoneId, ticketNumber: 288, code: 'IPH16-0288', status: 'active', createdAt: now, updatedAt: now },
    { userId: jorgeId, raffleId: iphoneId, ticketNumber: 102, code: 'IPH16-0102', status: 'active', createdAt: now, updatedAt: now },
    { userId: jorgeId, raffleId: ps5Id, ticketNumber: 15, code: 'PS5-0015', status: 'active', createdAt: now, updatedAt: now },
  ]);

  // ── Transacciones (ledger coherente con los saldos de arriba) ────
  await db.collection('transactions').insertMany([
    { userId: carlaId, amount: 50, type: 'deposit_yape', status: 'completed', createdAt: now, updatedAt: now },
    { userId: carlaId, amount: -20, type: 'ticket_purchase', status: 'completed', createdAt: now, updatedAt: now },
    { userId: carlaId, amount: 17, type: 'cero_perdida_refund', status: 'completed', createdAt: now, updatedAt: now },
    { userId: jorgeId, amount: 28, type: 'deposit_yape', status: 'completed', createdAt: now, updatedAt: now },
    { userId: jorgeId, amount: -18, type: 'ticket_purchase', status: 'completed', createdAt: now, updatedAt: now },
    // Depósito PENDIENTE: aparece en el panel de confirmación del admin
    { userId: jorgeId, amount: 30, type: 'deposit_yape', status: 'pending', createdAt: now, updatedAt: now },
  ]);

  // ── ERP Logístico ────────────────────────────────────────────────
  await db.collection('logistics_erp').insertMany([
    {
      raffleId: iphoneId, productName: 'iPhone 16 Pro Max 256GB',
      purchaseCost: 5200, receiptFileUrl: '', winnerId: null,
      shippingDetails: { courier: '', trackingNumber: '', destinationCity: '' },
      deliveryStatus: 'in_stock', evidencePhotoUrl: '', createdAt: now, updatedAt: now,
    },
    {
      raffleId: ps5Id, productName: 'PlayStation 5 Slim',
      purchaseCost: 2400, receiptFileUrl: '', winnerId: null,
      shippingDetails: { courier: '', trackingNumber: '', destinationCity: '' },
      deliveryStatus: 'in_stock', evidencePhotoUrl: '', createdAt: now, updatedAt: now,
    },
  ]);

  // ── Tienda de canjes + bono de bienvenida (Sprint B) ─────────────
  await db.collection('store_items').deleteMany({});
  await db.collection('store_items').insertMany([
    { name: 'Gift card Rappi S/ 20', priceMisio: 20, emoji: '🛵', description: 'Código digital por WhatsApp.', images: [], saleType: 'canje', stock: -1, active: true, createdAt: now, updatedAt: now },
    { name: 'Recarga Claro/Movistar S/ 15', priceMisio: 15, emoji: '📶', description: 'Recarga directa a tu número.', images: [], saleType: 'canje', stock: 20, active: true, createdAt: now, updatedAt: now },
    { name: 'Gift card Steam S/ 50', priceMisio: 50, emoji: '🕹️', description: 'Código digital, entrega inmediata.', images: [], saleType: 'canje', stock: 5, active: true, createdAt: now, updatedAt: now },
    { name: 'Audífonos JBL Tune 510BT', priceMisio: 120, emoji: '🎧', description: 'Nuevos, sellados, garantía 1 año. Venta real.', images: [], saleType: 'venta', stock: 4, active: true, createdAt: now, updatedAt: now },
  ]);
  await db.collection('settings').deleteMany({});
  await db.collection('settings').insertOne({
    key: 'welcome_bonus',
    value: { enabled: true, type: 'credit', creditAmount: 5, raffleId: null },
    createdAt: now, updatedAt: now,
  });

  // ── Método de pago de ejemplo (Sprint 3) ─────────────────────────
  await db.collection('payment_methods').deleteMany({});
  await db.collection('payment_methods').insertOne({
    name: 'Yape', accountNumber: '999 999 999', holderName: 'Misio SAC',
    qrImageUrl: '', instructions: 'Yapea el monto EXACTO y guarda tu N° de operación.',
    active: true, createdAt: now, updatedAt: now,
  });

  // ── Bingo social v2: sala de ejemplo creada por Carla ────────────
  await db.collection('bingo_rooms').deleteMany({});
  await db.collection('bingo_cards').deleteMany({});
  const bingoRoom = await db.collection('bingo_rooms').insertOne({
    code: 'ZB-DEMO',
    hostId: carlaId,
    title: 'Bingo de los viernes 🎉',
    maxPlayers: 10,
    winMode: 'line',
    status: 'open',
    calledNumbers: [],
    winner: null,
    createdAt: now, updatedAt: now,
  });
  // Cartón del host (columna-major, centro libre = 0 en posición 12)
  const demoCard = [];
  for (let col = 0; col < 5; col++) {
    const min = col * 15 + 1;
    const pool = Array.from({ length: 15 }, (_, i) => min + i);
    for (let row = 0; row < 5; row++) {
      if (col === 2 && row === 2) { demoCard.push(0); continue; }
      const idx = Math.floor(Math.random() * pool.length);
      demoCard.push(pool.splice(idx, 1)[0]);
    }
  }
  await db.collection('bingo_cards').insertOne({
    roomId: bingoRoom.insertedId,
    userId: carlaId,
    numbers: demoCard,
    createdAt: now, updatedAt: now,
  });
  await db.collection('bingo_cards').createIndex({ roomId: 1, userId: 1 }, { unique: true });

  // ── Subasta de ejemplo (programada para dentro de 10 min) + flag ON ──
  await db.collection('auctions').deleteMany({});
  await db.collection('auction_bids').deleteMany({});
  await db.collection('auctions').insertOne({
    title: 'Audífonos Sony WH-1000XM5',
    description: 'Nuevos y sellados, con boleta. Cancelación de ruido líder.',
    emoji: '🎧', images: [],
    basePrice: 80, minIncrement: 5, buyNowPrice: 900,
    startAt: new Date(Date.now() + 10 * 60 * 1000),
    endAt: new Date(Date.now() + 40 * 60 * 1000),
    status: 'scheduled', enrolled: [], currentBid: null, bidsCount: 0,
    startSoonNotified: false, startNotified: false, winner: null,
    createdAt: now, updatedAt: now,
  });
  await db.collection('settings').updateOne(
    { key: 'auctions' },
    { $set: { key: 'auctions', value: { enabled: true }, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );

  // Índice único (por si el server aún no arrancó nunca)
  await db.collection('tickets').createIndex({ raffleId: 1, ticketNumber: 1 }, { unique: true });

  console.log('✓ Seed completado:');
  console.log('  Admin:   DNI 11111111 / admin123');
  console.log('  Carla:   DNI 74581236 / demo123  (saldo S/ 47)');
  console.log('  Jorge:   DNI 45678912 / demo123  (saldo S/ 10, 1 depósito pendiente)');
  console.log('  Bingo:   sala ZB-DEMO abierta (host: Carla, modo línea, máx 10)');
  console.log('  Tienda:  3 productos · Bono bienvenida: S/ 5 activo');
  await mongoose.disconnect();
})();
