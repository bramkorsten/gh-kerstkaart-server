module.exports = class Database {
  constructor() {
    const MongoClient = require("mongodb").MongoClient;
    this.url = "mongodb://localhost:27017";
    this.dbName = "kerstkaart2019";
    this.client = new MongoClient(this.url, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    this.db;
  }

  async init() {
    var context = this;
    return new Promise(function(resolve, reject) {
      context.client.connect(function(err) {
        console.log("Connected successfully to server");

        context.db = context.client.db(context.dbName);
        resolve(context.db);
      });
    });
  }

  getDatabase() {
    return this.db;
  }

  createNewDatabase() {
    console.log("Function was never implemented :)");
  }

  closeConnection() {
    this.client.close();
  }
};
