/**
 * @Date:   2019-10-24T14:26:59+02:00
 * @Email:  code@bramkorsten.nl
 * @Project: Kerstkaart (server)
 * @Filename: index.js
 * @Last modified time: 2019-11-27T16:08:32+01:00
 * @Copyright: Copyright 2019 - Bram Korsten
 */
const config = require("./_config.json");
// const encryptor = require("simple-encryptor")(config.secret);
const crypto = require("crypto");
const WebSocket = require("ws");
const database = require("./classes/database.js");
db = database.getDatabase();
connections = [];

class GameServer {
  constructor() {
    // Setup the local databse connection and websocket server
    this.db = db;
    this.wss = new WebSocket.Server({ port: 8080 });

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

    db.get("matches")
      .find({ matchId: user.currentMatch })
      .get("queue")
      .remove({ uToken: token })
      .write();

    db.get("clients")
      .find({ uToken: token })
      .unset("currentMatch")
      .write();
    return true;
  }
}

gameServer = new GameServer();

function noop() {}

function encrypt(string) {
  const encryptor = crypto.createCipher("aes-128-cbc", config.secret);
  var hashed = encryptor.update(string, "utf8", "hex");
  hashed += encryptor.final("hex");
  return hashed;
}

function decrypt(hash) {
  const decryptor = crypto.createDecipher("aes-128-cbc", config.secret);
  var string = decryptor.update(hash, "hex", "utf8");
  string += decryptor.final("utf8");
  return string;
}
