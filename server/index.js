/**
 * @Date:   2019-10-24T14:26:59+02:00
 * @Email:  code@bramkorsten.nl
 * @Project: Kerstkaart (server)
 * @Filename: index.js
 * @Last modified time: 2019-12-05T10:54:36+01:00
 * @Copyright: Copyright 2019 - Bram Korsten
 */

const Database = require("./classes/Database");
const GameServer = require('./classes/GameServer');

const Test = require('./data/models/Test');

connections = [];

(async() => {
    const database = await Database('kerstkaart2019');

    const testje = new Test({title: 'A'})
    await testje.save((err, instance) => {
        if (err) console.log(err);
    })

    const results = await Test.find();
    console.log(results)

    // new GameServer(database);
})();

