/**
 * Crea (o promueve) el primer Super Admin de Misio.
 * Uso:  node scripts/create-admin.js <dni> <password> [nombre] [celular]
 * Ej:   node scripts/create-admin.js 12345678 miClaveSegura "Brandon Admin" 987654321
 *
 * Si el DNI ya existe, solo lo promueve a admin (y actualiza la clave).
 */
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const [dni, password, name = 'Super Admin', phone = '999999999'] = process.argv.slice(2);

if (!dni || !password) {
  console.error('Uso: node scripts/create-admin.js <dni> <password> [nombre] [celular]');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI ?? 'mongodb://localhost:27017/misio');
  const users = mongoose.connection.collection('users');
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await users.findOneAndUpdate(
    { dni },
    {
      $set: { role: 'admin', passwordHash },
      $setOnInsert: { name, phone, walletBalance: 0, createdAt: new Date() },
    },
    { upsert: true, returnDocument: 'after' },
  );

  console.log(`✓ Admin listo: ${result.name ?? name} (DNI ${dni})`);
  await mongoose.disconnect();
})();
