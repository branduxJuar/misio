const mongoose = require('mongoose');

// Este script corrige cualquier saldo que se haya quedado atrapado en "Retenido"
// sumándolo de vuelta al "Saldo Disponible" (walletBalance) y dejando el retenido en 0.

mongoose.connect('mongodb://127.0.0.1:27017/misio_db')
  .then(async () => {
    console.log('Conectado a la base de datos...');
    
    const db = mongoose.connection.db;
    
    // Buscar usuarios que tengan dinero retenido
    const users = await db.collection('users').find({ walletHeld: { $gt: 0 } }).toArray();
    
    if (users.length === 0) {
      console.log('✅ No hay ningún usuario con dinero retenido. Todo está en orden.');
    } else {
      console.log(`⚠️ Se encontraron ${users.length} usuarios con saldo retenido.`);
      
      // Actualizar usando un pipeline de agregación para sumar matemáticamente
      const result = await db.collection('users').updateMany(
        { walletHeld: { $gt: 0 } },
        [{ 
          $set: { 
            walletBalance: { $add: ["$walletBalance", "$walletHeld"] },
            walletHeld: 0 
          } 
        }]
      );
      
      console.log(`✅ ¡Éxito! Se devolvió el saldo retenido a ${result.modifiedCount} usuarios.`);
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error al conectar o actualizar:', err);
    process.exit(1);
  });
