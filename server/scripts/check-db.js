const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('misio');
  
  const erpRows = await db.collection('logistics_erp').find().toArray();
  console.log('ERP Rows count:', erpRows.length);
  for (let row of erpRows) {
    console.log(`- ID: ${row._id}, productName: ${row.productName}, winnerId: ${row.winnerId}, raffleId: ${row.raffleId}`);
  }

  const raffles = await db.collection('raffles').find({ status: 'completed' }).toArray();
  console.log('Completed raffles count:', raffles.length);
  for (let r of raffles) {
    console.log(`- ID: ${r._id}, title: ${r.title}, winner: ${JSON.stringify(r.winner)}`);
  }

  await client.close();
}

run().catch(console.error);
