const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const adapter = new FileSync("databases/db.json");
const db = low(adapter);

module.exports = {
  getDatabase: function() {
    return db;
  },

  setDefaults: function() {
    db.defaults({ matches: [], clients: [] }).write();
  }
};
