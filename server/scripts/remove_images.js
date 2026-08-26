const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017/misio';

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    
    // Quitar todas las imágenes de los sorteos para que muestre el ícono por defecto
    const result = await db.collection('raffles').updateMany({}, { $set: { images: [] } });
    console.log(`✅ ${result.modifiedCount} sorteos actualizados para no tener imágenes.`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

run();
