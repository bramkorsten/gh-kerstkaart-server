/**
 * @Date:   2019-10-24T14:26:59+02:00
 * @Email:  code@bramkorsten.nl
 * @Project: Kerstkaart (server)
 * @Filename: index.js
 * @Last modified time: 2019-12-03T10:09:08+01:00
 * @Copyright: Copyright 2019 - Bram Korsten
 */
const config = require("./_config.json");
// const encryptor = require("simple-encryptor")(config.secret);
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
const WebSocket = require("ws");
const database = require("./classes/database.js");
db = database.getDatabase();
connections = [];

var port = process.env.PORT || 5000;

class GameServer {
  constructor() {
    // Setup the local databse connection and websocket server
    this.db = db;
    this.wss = new WebSocket.Server({ port: port });

    console.log("Websocket listening on port: " + port);

    database.setDefaults();
    this.functions = require("./classes/functions.js");
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
    var players = this.getPlayersInMatch(matchId);
    if (!match) {
      match = db
        .get("matches")
        .find({ matchId: matchId })
        .cloneDeep()
        .value();
    }

    var matchVal = match;

    if (!sendChoices) {
      matchVal.currentGame.players.forEach(function(player, i) {
        matchVal.currentGame.players[i].choice = "Wouldn't you like to know";
      });
    }

    const response = {
      type: "matchUpdate",
      data: matchVal
    };
    for (var player of players) {
      console.log("sending update to: " + player);
      if (connections.hasOwnProperty(player)) {
        connections[player].send(JSON.stringify(response));
      } else {
        console.log("player in match not connected");
      }
    }
  }

  sendMessageToMatch(matchId, messageType, message) {
    const players = this.getPlayersInMatch(matchId);
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
  }

  getPlayersInMatch(matchId) {
    const players = db
      .get("matches")
      .find({ matchId: matchId })
      .get("currentGame.players")
      .map("uToken")
      .value();
    return players;
  }

  removeCurrentMatchFromPlayer(token, increaseGamesPlayed = false) {
    const user = db
      .get("clients")
      .find({ uToken: token })
      .value();

    if (!user || !user.currentMatch) {
      return true;
    }
    if (increaseGamesPlayed) {
      db.get("clients")
        .find({ uToken: token })
        .update("gamesPlayed", n => n + 1)
        .write();
    }
    db.get("clients")
      .find({ uToken: token })
      .unset("currentMatch")
      .write();

    return true;
  }

  removePlayerFromActiveMatch(token) {
    // TODO: If player is in a current match, update the queue and let the opponent win!

    const user = db
      .get("clients")
      .find({ uToken: token })
      .value();

    if (!user || !user.currentMatch) {
      return true;
    }

    db.get("matches")
      .find({ matchId: user.currentMatch })
      .assign({ matchFull: false })
      .get("currentGame.players")
      .remove({ uToken: token })
      .write();

    return true;
  }
}

gameServer = new GameServer();

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
