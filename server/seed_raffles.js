const { MongoClient } = require('mongodb');

// URL de conexión (ajusta si es necesario según tu .env)
const uri = 'mongodb://localhost:27017/misio';

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomRaffle(index) {
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + getRandomInt(7, 60)); // Sorteos entre 7 y 60 días en el futuro

  const prefixes = ["AUTO", "MOTO", "TECH", "CASH", "GMR", "TV", "VIAJE", "CASA"];
  const imagePool = [
    "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=400&q=80",
    "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&q=80",
    "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=400&q=80",
    "https://images.unsplash.com/photo-1542362567-b07e54358753?w=400&q=80",
    "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400&q=80",
    "https://images.unsplash.com/photo-1550537687-c9a0c970ed01?w=400&q=80",
    "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=400&q=80"
  ];
  const items = ["Audi R8", "iPhone 15 Pro", "PlayStation 5", "MacBook M3", "Nintendo Switch", "Moto Ninja", "S/ 10,000 Cash", "Viaje a Cancún"];

  const prefix = prefixes[getRandomInt(0, prefixes.length - 1)];
  const item = items[getRandomInt(0, items.length - 1)];
  const totalTickets = getRandomInt(100, 5000);
  const soldCount = getRandomInt(0, Math.floor(totalTickets * 0.9)); // Hasta 90% vendidos

  return {
    title: `${item} - Edición Especial #${index}`,
    description: `Participa por un increíble ${item}. Si no ganas, recuerda que una parte de tu inversión regresa a ti como saldo de canje. ¡Juega a lo seguro!`,
    ticketPrefix: prefix,
    images: [],
    ticketPrice: getRandomInt(2, 50),
    totalTickets: totalTickets,
    soldCount: soldCount,
    drawMode: Math.random() > 0.5 ? "al_agua" : "direct",
    winningAttempt: getRandomInt(1, 4),
    maxTicketsPerUser: getRandomInt(5, 20),
    drawDate: nextMonth,
    notifyDayBefore: true,
    dayBeforeNotified: false,
    postponements: [],
    streamUrl: "",
    status: "active",
    refundsProcessed: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

async function run() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Conectado a MongoDB');
    
    const db = client.db();
    const rafflesCol = db.collection('raffles');

    const seedRaffles = [];
    for(let i = 1; i <= 100; i++) {
      seedRaffles.push(generateRandomRaffle(i));
    }

    const result = await rafflesCol.insertMany(seedRaffles);
    console.log(`✅ ${result.insertedCount} sorteos generados aleatoriamente con éxito!`);

  } catch (error) {
    console.error('❌ Error al ejecutar el script:', error);
  } finally {
    await client.close();
  }
}

run();
