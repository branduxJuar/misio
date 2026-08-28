const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/misio';

// Capturar argumentos de la terminal
const dni = process.argv[2];
const password = process.argv[3];

if (!dni || !password) {
  console.error('\n❌ Uso incorrecto. Debes proporcionar DNI y Contraseña.');
  console.log('💡 Ejemplo: node scripts/create-admin.js 12345678 MiClaveSecreta123\n');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  
  console.log(`\n🧹 Conectado a la base de datos...`);
  
  const existingAdmin = await db.collection('users').findOne({ dni: dni });
  if (existingAdmin) {
    console.log(`⚠️ Ya existe un usuario con el DNI ${dni}.`);
    await client.close();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  
  await db.collection('users').insertOne({
    name: 'Administrador',
    dni: dni,
    phone: '999999999',
    email: '',
    passwordHash,
    role: 'admin',
    walletBalance: 0,
    walletCanje: 0,
    walletHeld: 0,
    permissions: ['dashboard', 'sorteos', 'pagos', 'usuarios', 'tienda', 'erp', 'reclamos', 'subastas', 'contabilidad', 'contenido'],
    mustChangePassword: true, // Pedirá cambio por seguridad la primera vez que entre
    totpEnabled: false,
    failedLogins: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log('✅ Usuario Administrador creado exitosamente con tus credenciales.');
  
  await client.close();
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
