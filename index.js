/**
 * @Date:   2019-10-24T14:26:59+02:00
 * @Email:  code@bramkorsten.nl
 * @Project: Kerstkaart (server)
 * @Filename: index.js
 * @Last modified time: 2019-12-05T10:54:36+01:00
 * @Copyright: Copyright 2019 - Bram Korsten
 */
let gameserver = null;
let db = null;

const config = require("./_config.json");
const crypto = require("crypto");
const key = crypto
  .createHash("sha256")
  .update(String(config.secret))
  .digest("hex")
  .slice(0, 16);

const crypt_iv = Buffer.from([
  0xd8,
  0xb1,
  0xd1,
  0xbc,
  0xdd,
  0x58,
  0x3b,
  0xdd,
  0x89,
  0x4f,
  0x33,
  0x6a,
  0x7b,
  0x4b,
  0x9e,
  0x1b
]);

connections = [];
var port = process.env.PORT || 5000;

const WebSocket = require("ws");
const DB = require("./classes/database");
const database = new DB();

database.init().then(function(database) {
  db = database;
  gameServer = new GameServer();
});

class GameServer {
  constructor() {
    // Setup the local database connection and websocket server
    this.db = db;
    this.wss = new WebSocket.Server({ port: port });

    console.log("Websocket listening on port: " + port);

    // database.setDefaults();
    this.functions = require("./classes/functions");
    this.setConnection();
    this.checkConnections();
  }

  setConnection() {
    this.wss.on("connection", function connection(ws) {
      ws.isAlive = true;
      ws.on("pong", function() {
        this.isAlive = true;
      });
      ws.on("message", function incoming(message) {
        const parsedMessage = JSON.parse(message);
        parsedMessage.userToken = encrypt(parsedMessage.uid);
        connections[parsedMessage.userToken] = ws;

        if (gameServer.functions[parsedMessage.type] instanceof Function) {
          gameServer.functions[parsedMessage.type](parsedMessage, ws);
        } else {
          const response = {
            type: "error",
            data: parsedMessage.type + " is not a valid function"
          };
          ws.send(JSON.stringify(response));
        }
      });
    });
  }

  checkConnections() {
    const interval = setInterval(function ping() {
      for (var connection in connections) {
        if (connections[connection].isAlive === false) {
          console.log(
            "Client " + connection + " disconnected: No response on second ping"
          );
          // TODO: Remove Client from active games
          gameServer.removePlayerFromActiveMatch(connection);
          connections[connection].terminate();
          delete connections[connection];
          return true;
        }

        connections[connection].isAlive = false;
        connections[connection].ping(noop);
      }
    }, 10000);
  }

  sendUpdateToMatch(matchId, match = false, sendChoices = false) {
    this.getPlayersInMatch(matchId, false, function(players) {
      const matchesCollection = db.collection("matches");
      matchesCollection.findOne({ matchId: matchId }, function(err, match) {
        if (!sendChoices) {
          match.currentGame.players.forEach(function(player, i) {
            match.currentGame.players[i].choice = "Wouldn't you like to know";
          });
        }
        const response = {
          type: "matchUpdate",
          data: match
        };
        for (var player of players) {
          console.log("sending update to: " + player);
          if (connections.hasOwnProperty(player)) {
            connections[player].send(JSON.stringify(response));
          } else {
            console.log("player in match not connected");
          }
        }
      });
    });
  }

  sendMessageToMatch(matchId, messageType, message) {
    this.getPlayersInMatch(matchId, false, function(players) {
      const response = {
        type: messageType,
        data: message
      };
      for (var player of players) {
        console.log("sending message to: " + player);
        if (connections.hasOwnProperty(player)) {
          connections[player].send(JSON.stringify(response));
        } else {
          console.log("player in match not connected");
        }
      }
    });
  }

  /**
   * Get all players in a match
   * @param  {String} matchId The ID of the match to find players for
   * @param  {Boolean} returnObject Should the full played be returned?
   * @return {Array}          An array of user tokens
   */
  getPlayersInMatch(matchId, returnObject = false, callback) {
    db.collection("matches").findOne({ matchId: matchId }, function(err, r) {
      var players = [];
      if (returnObject) {
        for (var player of r.currentGame.players) {
          players.push(player.player);
        }
      } else {
        for (var player of r.currentGame.players) {
          players.push(player.uToken);
        }
      }
      callback(players);
    });
  }

  /**
   * Remove the current match from the player
   * @param  {String}  token                       The user's token
   * @param  {Boolean} increaseGamesPlayed         Whether to increase the number of games played
   * @return {Boolean}
   */
  removeCurrentMatchFromPlayer(
    token,
    increaseGamesPlayed = false,
    callback = false
  ) {
    const clientCollection = db.collection("clients");
    clientCollection.findOne({ uToken: token }, function(err, user) {
      if (!user || !user.currentMatch) {
        return true;
      }
      if (increaseGamesPlayed) {
        clientCollection.updateOne(
          { uToken: token },
          { $inc: { gamesPlayed: 1 } }
        );
      }

      clientCollection
        .updateOne({ uToken: token }, { $unset: { currentMatch: "" } })
        .then(function() {
          callback(true);
        });
      return true;
    });
  }

  removePlayerFromActiveMatch(token, callback = false) {
    // TODO: If player is in a current match, update the queue and let the opponent win!

    const clientCollection = db.collection("clients");
    clientCollection.findOne({ uToken: token }, function(err, user) {
      if (!user || !user.currentMatch) {
        return true;
      }
      db.collection("matches").findOne({ matchId: user.currentMatch }, function(
        err,
        r
      ) {
        var currentGame = r.currentGame.players;
        var newGame = [];
        for (var player of currentGame) {
          if (player.uToken != token) {
            newGame.push(player);
          }
        }
        db.collection("matches")
          .updateOne(
            { matchId: user.currentMatch },
            { $set: { "currentGame.players": newGame, matchFull: false } }
          )
          .then(function() {
            callback(true);
          });
      });
    });
  }
}

function noop() {}

function encrypt(string) {
  const encryptor = crypto.createCipheriv("aes-128-cbc", key, crypt_iv);
  var hashed = encryptor.update(string, "utf8", "hex");
  hashed += encryptor.final("hex");
  return hashed;
}

function decrypt(hash) {
  const decryptor = crypto.createDecipheriv("aes-128-cbc", key, crypt_iv);
  var string = decryptor.update(hash, "hex", "utf8");
  string += decryptor.final("utf8");
  return string;
}
