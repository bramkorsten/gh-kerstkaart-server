const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const clientSchema = new Schema({
  uToken:  String,
  name: String,
  gamesPlayed: Number,
  highscore: {
    currentStreak: Number,
    bestStreak: Number,
  },
});

module.exports = mongoose.model('Client', clientSchema)
