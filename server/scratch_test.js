const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/misio');
  const Raffle = mongoose.model('Raffle', new mongoose.Schema({}, { strict: false }));
  
  const raffles = await Raffle.find({ status: 'completed' });
  for (const r of raffles) {
    console.log(`Raffle: ${r.title} | winner:`, JSON.stringify(r.winner), '| prizes:', JSON.stringify(r.prizes?.map(p => p.winner)));
  }
  process.exit();
}
test();
