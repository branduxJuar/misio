const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017/misio';

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    
    // Poner todas las ventas en 0
    const result = await db.collection('raffles').updateMany({}, { $set: { soldCount: 0 } });
    console.log(`✅ ${result.modifiedCount} sorteos actualizados a 0 ventas.`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

run();
