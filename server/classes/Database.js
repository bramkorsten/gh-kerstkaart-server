const MONGODB_URI = process.env.MONGODB_URI ? `${process.env.MONGODB_URI}&authSource=admin` : null;

module.exports = class Database {
  constructor() {
    const MongoClient = require("mongodb").MongoClient;
    this.dbName = "kerstkaart2019";
    this.url = process.env.MONGODB_URL || MONGODB_URI || `mongodb://localhost:27017/${this.dbName}`;
    this.client = new MongoClient(this.url, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    this.db;
  }

  init = async () => {
    return new Promise((resolve, reject) => {
      this.client.connect((err) => {
        console.log("Connected successfully to server");
        this.db = this.client.db(this.dbName);
        resolve(this.db);
      });
    });
  }

  getDatabase = () => {
    return this.db;
  }

  createNewDatabase = () => {
    console.log("Function was never implemented :)");
  }

  closeConnection = () => {
    this.client.close();
  }
};
