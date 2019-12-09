const WebSocket = require("ws");

const Client = require('../data/models/Client');
const Match = require('../data/models/Match');

const { encrypt, noop } = require('../helpers/cryptors');

const gameFunctions = require("../helpers/gameFunctions");

const port = process.env.PORT || 3000;


module.exports = class GameServer {
  constructor(db) {
    // Setup the local database connection and websocket server
    this.db = db;
    this.wss = new WebSocket.Server({ port: port });
    this.functions = gameFunctions(this, db);

    console.log("Websocket listening on port: " + port);

    // database.setDefaults();
    this.setConnection();
    this.checkConnections();
  }

  setConnection = () => {
    this.wss.on("connection", (ws) => {
      ws.isAlive = true;
      ws.on("pong", function() {
        this.isAlive = true;
      });
      ws.on("message", (message) => {
        const parsedMessage = JSON.parse(message);
        parsedMessage.userToken = encrypt(parsedMessage.uid);
        connections[parsedMessage.userToken] = ws;

        if (this.functions[parsedMessage.type] instanceof Function) {
          this.functions[parsedMessage.type](parsedMessage, ws);
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

  checkConnections = () => {
    const interval = setInterval(() => {
      for (var connection in connections) {
        if (connections[connection].isAlive === false) {
          console.log(
            "Client " + connection + " disconnected: No response on second ping"
          );
          // TODO: Remove Client from active games
          this.removePlayerFromActiveMatch(connection);
          connections[connection].terminate();
          delete connections[connection];
          return true;
        }

        connections[connection].isAlive = false;
        connections[connection].ping(noop);
      }
    }, 10000);
  }

  sendUpdateToMatch = (matchId, match = false, sendChoices = false) => {
    this.getPlayersInMatch(matchId, false, (players) => {
      this.db.findOne({ matchId: matchId }, (err, match) => {
        if (!sendChoices) {
          match.currentGame.players.forEach((player, i) => {
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

  sendMessageToMatch = (matchId, messageType, message, callback) => {
    this.getPlayersInMatch(matchId, false, (players) => {
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

      if (typeof callback === 'function') return callback(true);
    });
  }

  /**
   * Get all players in a match
   * @param  {String} matchId The ID of the match to find players for
   * @param  {Boolean} returnObject Should the full played be returned?
   * @return {Array}          An array of user tokens
   */
  getPlayersInMatch = (matchId, returnObject = false, callback) => {
    Match.findOne({ matchId: matchId }, (err, r) => {
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
      if (typeof callback === 'function') return callback(players);
    });
  }

  /**
   * Remove the current match from the player
   * @param  {String}  token                       The user's token
   * @param  {Boolean} increaseGamesPlayed         Whether to increase the number of games played
   * @return {Boolean}
   */
  removeCurrentMatchFromPlayer = async (
    token,
    increaseGamesPlayed = false,
    callback = false
  ) => {
    await new Promise((resolve, reject) => Client.findOne({ uToken: token },
      (err, user) => {
        if (err) return reject(err);
        if (!user || !user.currentMatch) return resolve();
        return reject();
      })
    );

    if (increaseGamesPlayed) {
      await new Promise((resolve, reject) => Client.updateOne(
        { uToken: token },
        { $inc: { gamesPlayed: 1 } }, (err) => {
        if (err) return reject(err);
        return resolve();
      }));
    }

    await new Proise((resolve, reject) => Client
      .updateOne({ uToken: token }, { $unset: { currentMatch: "" } }, (err) => {
        if (err) return reject(err);
        if (typeof callback === 'function') callback(true);
        return resolve(true);
      }));
  }

  removePlayerFromActiveMatch = async (token, callback = false) => {
    // TODO: If player is in a current match, update the queue and let the opponent win!
    const user = await new Promise((resolve, reject) => Client.findOne(
      { uToken: token },
      (err, user) => {
        if (err) return reject(err);
        if (!user || !user.currentMatch) {
          return resolve(user);
        }
        return reject(err);
      }));

    const result = await new Promise((resolve, reject) => Match.findOne(
      { matchId: user.currentMatch },
      (err, r) => {
        if (err) return reject(err);
        return resolve(r);
      }));

    var currentGame = result.currentGame.players;
    var newGame = [];

    for (var player of currentGame) {
      if (player.uToken != token) {
        newGame.push(player);
      }
    }

    await new Promise((resolve, reject) => Match
      .updateOne(
        { matchId: user.currentMatch },
        { $set: { "currentGame.players": newGame, matchFull: false } },
        (err) => {
          if (err) return reject(err);
          if (typeof callback === 'function') callback(true);
          return resolve(true)
        }
      )
    )
  }
}
