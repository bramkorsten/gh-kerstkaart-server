/**
 * @Date:   2019-10-24T14:26:59+02:00
 * @Email:  code@bramkorsten.nl
 * @Project: Kerstkaart (server)
 * @Filename: index.js
 * @Last modified time: 2019-12-05T10:54:36+01:00
 * @Copyright: Copyright 2019 - Bram Korsten
 */

const DB = require("./classes/Database");
const GameServer = require('./classes/GameServer');

connections = [];

const database = new DB();

database.init().then((database) => {
  new GameServer(database);
});
