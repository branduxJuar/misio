const mongoose = require('mongoose');
const { Schema } = mongoose;
const fs = require('fs');
const path = require('path');

mongoose.connect('mongodb://127.0.0.1:27017/misio_db').then(async () => {
  const userModel = mongoose.model('User', new Schema({}, { strict: false }));
  const auctionModel = mongoose.model('Auction', new Schema({}, { strict: false }));

  const admin = await userModel.findOne({ role: 'admin' });
  const logData = {
    admin: {
      _id: admin._id,
      walletBalance: admin.walletBalance,
      walletHeld: admin.walletHeld,
    },
    auctions: await auctionModel.find({ status: 'FINISHED' }).sort({ createdAt: -1 }).limit(3)
  };
  
  const p = 'C:\\Users\\xudra\\.gemini\\antigravity-ide\\brain\\9546fd86-ce3b-4963-b856-ada2b4628a27\\scratch\\db_log.json';
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(logData, null, 2));

  process.exit(0);
});
