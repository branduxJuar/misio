require('dotenv').config();
const mongoose = require('mongoose');

async function resetVentas() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ No se encontró MONGO_URI en el archivo .env');
    process.exit(1);
  }

  console.log('🔌 Conectando a MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Conectado a la base de datos.');

  try {
    const db = mongoose.connection.db;

    // 1. Limpiar colecciones transaccionales y de caja
    const collectionsToClear = [
      'tickets', 
      'transactions', 
      'cashshifts', 
      'cashregisters', 
      'cashmovements',
      'logisticserps', // Compras de premios (si deseas mantenerlos, comenta esta línea)
      'complaints',
      'inboxmessages'
    ];

    console.log('🗑️  Borrando colecciones de ventas, contabilidad y cajas...');
    for (const collectionName of collectionsToClear) {
      try {
        await db.collection(collectionName).deleteMany({});
        console.log(`  - Colección ${collectionName} vaciada.`);
      } catch (err) {
        console.log(`  - Colección ${collectionName} no existe o no se pudo vaciar.`);
      }
    }

    // 2. Resetear saldos de usuarios
    console.log('🔄 Reseteando saldos de usuarios a 0...');
    const resultUsers = await db.collection('users').updateMany(
      {},
      {
        $set: {
          walletBalance: 0,
          walletCanje: 0,
          walletHeld: 0,
          canjeTranches: []
        }
      }
    );
    console.log(`  - ${resultUsers.modifiedCount} usuarios actualizados con saldo 0.`);

    // 3. Resetear contadores de rifas
    console.log('🔄 Reseteando contador de boletos vendidos en las rifas...');
    const resultRaffles = await db.collection('raffles').updateMany(
      {},
      {
        $set: {
          soldCount: 0
        }
      }
    );
    console.log(`  - ${resultRaffles.modifiedCount} rifas actualizadas con soldCount = 0.`);

    console.log('🎉 ¡Limpieza de sistema completada exitosamente!');
  } catch (error) {
    console.error('❌ Ocurrió un error al limpiar la base de datos:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado.');
    process.exit(0);
  }
}

resetVentas();
