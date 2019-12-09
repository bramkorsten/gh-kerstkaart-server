const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI ? `${process.env.MONGODB_URI}&authSource=admin` : null;

module.exports = async (name) => new Promise((resolve, reject) => {
  try {
    const url = process.env.MONGODB_URL || MONGODB_URI || `mongodb://localhost:27017/${name}`;

    const database = mongoose.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const db = mongoose.connection;

    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', function() {
      console.log('MONGOOSE CONNECTION SUCCESSFUL');
      return resolve(database);
    });
  } catch (e) {
    return reject(e);
  }
});
