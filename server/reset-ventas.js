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

    // 1. Limpiar TODAS las colecciones del sistema dinámicamente, EXCEPTO la lista blanca
    const collectionsToKeep = [
      'users',             // Cuentas de usuario
      'payment_methods',   // Métodos de pago (Yape, Plin, etc.)
      'settings',          // Configuraciones del sistema (términos, logos, etc.)
      'store_items'        // Catálogo de la tienda (para no tener que volver a crear los premios)
    ];

    console.log('🗑️  Borrando TODAS las colecciones del sistema excepto usuarios y configuraciones...');
    
    // Obtener todas las colecciones de la BD
    const allCollections = await db.listCollections().toArray();

    for (const coll of allCollections) {
      const collectionName = coll.name;
      // Si la colección NO está en la lista de las que hay que guardar, se vacía.
      if (!collectionsToKeep.includes(collectionName) && !collectionName.startsWith('system.')) {
        try {
          await db.collection(collectionName).deleteMany({});
          console.log(`  - Colección ${collectionName} vaciada.`);
        } catch (err) {
          console.log(`  - Colección ${collectionName} no se pudo vaciar.`);
        }
      } else {
        console.log(`  🛡️  Colección ${collectionName} preservada.`);
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
