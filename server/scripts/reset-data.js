/**
 * 🧹 RESET DE DATA — deja la base limpia para arrancar de cero.
 *
 * USO (desde la carpeta server/):
 *   node scripts/reset-data.js               → borra TODO + admin nuevo
 *   node scripts/reset-data.js --keep-users  → conserva usuarios
 *
 * Con MONGO_URI personalizado:
 *   set MONGO_URI=mongodb://localhost:27017/misio && node scripts/reset-data.js
 *
 * El admin creado:  DNI: 00000000   Contraseña: Admin2026
 * (te pedirá cambiarla al entrar)
 */
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/misio';
const KEEP_USERS = process.argv.includes('--keep-users');

const OPERATIONAL = [
  'raffles', 'tickets', 'transactions', 'logisticserps',
  'auctions', 'bingogames', 'bingocards', 'paymentmethods',
  'complaints', 'notifications', 'audit_logs', 'storeitems',
];

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  console.log(`\n🧹 Conectado a ${MONGO_URI}\n`);

  const existing = (await db.listCollections().toArray()).map((c) => c.name);
  for (const name of OPERATIONAL) {
    if (existing.includes(name)) {
      const { deletedCount } = await db.collection(name).deleteMany({});
      console.log(`  ✓ ${name}: ${deletedCount} documentos borrados`);
    }
  }

  if (KEEP_USERS) {
    const res = await db.collection('users').updateMany({}, {
      $set: { walletBalance: 0, walletCanje: 0, walletHeld: 0 },
    });
    console.log(`  ✓ users: ${res.modifiedCount} billeteras reseteadas a 0 (cuentas conservadas)`);
  } else {
    const { deletedCount } = await db.collection('users').deleteMany({});
    console.log(`  ✓ users: ${deletedCount} borrados`);

    const passwordHash = await bcrypt.hash('Admin2026', 10);
    await db.collection('users').insertOne({
      name: 'Administrador',
      dni: '00000000',
      phone: '999999999',
      email: '',
      passwordHash,
      role: 'admin',
      walletBalance: 0,
      walletCanje: 0,
      walletHeld: 0,
      permissions: ['dashboard', 'sorteos', 'pagos', 'usuarios', 'tienda', 'erp', 'reclamos', 'subastas', 'contabilidad', 'contenido'],
      mustChangePassword: true,
      totpEnabled: false,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('\n  👤 Admin creado:');
    console.log('     DNI:         00000000');
    console.log('     Contraseña:  Admin2026  (te pedirá cambiarla al entrar)');

    // Usuario de PRUEBA con saldo: para probar compras directas sin
    // pasar por el flujo de Yape pendiente (que requiere confirmación).
    const testerHash = await bcrypt.hash('Test2026', 10);
    await db.collection('users').insertOne({
      name: 'Usuario Prueba',
      dni: '11111111',
      phone: '988888888',
      email: '',
      passwordHash: testerHash,
      role: 'user',
      walletBalance: 500,
      walletCanje: 0,
      walletHeld: 0,
      mustChangePassword: false,
      totpEnabled: false,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('\n  🧪 Usuario de prueba (CON SALDO para probar compras):');
    console.log('     DNI:         11111111');
    console.log('     Contraseña:  Test2026');
    console.log('     Saldo:       S/ 500  (compra boletos al instante, sin Yape)');
  }

  console.log('\n✅ Reset completo. La base está lista para arrancar.\n');
  await client.close();
}

main().catch((err) => {
  console.error('❌ Error en el reset:', err.message);
  process.exit(1);
});
