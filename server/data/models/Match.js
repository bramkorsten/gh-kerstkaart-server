const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const matchSchema = new Schema({
  matchId:  String,
  matchFull: Boolean,
  matchWonBy: String,
  matchStartTime: Date,
  matchEndTime: Date,
  initializer: {},
  currentGame: {
    players: []
  }
});

module.exports = mongoose.model('Match', matchSchema)
