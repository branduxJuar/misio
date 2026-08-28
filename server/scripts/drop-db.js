const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/misio';

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  
  console.log(`\n🧹 Conectado a ${MONGO_URI}\n`);
  
  console.log('Borrando la base de datos completa...');
  await db.dropDatabase();
  
  console.log('✅ Base de datos ELIMINADA POR COMPLETO (0 usuarios, 0 admins, 0 sorteos).');
  await client.close();
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
