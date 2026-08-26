const mongoose = require('mongoose');
const { Schema } = mongoose;

mongoose.connect('mongodb://127.0.0.1:27017/misio_db').then(async () => {
  const userModel = mongoose.model('User', new Schema({}, { strict: false }));
  const auctionModel = mongoose.model('Auction', new Schema({}, { strict: false }));

  const admin = await userModel.findOne({ role: 'admin' });
  console.log('Admin:', admin._id, 'walletBalance:', admin.walletBalance, 'walletHeld:', admin.walletHeld);

  const auctions = await auctionModel.find({ status: 'FINISHED' }).sort({ createdAt: -1 }).limit(1);
  console.log('Last finished auction:', auctions[0]._id, 'winner:', auctions[0].winner, 'currentBid:', auctions[0].currentBid);

  process.exit(0);
});
