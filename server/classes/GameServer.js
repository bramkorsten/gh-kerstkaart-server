const WebSocket = require("ws");

const Client = require('../data/models/Client');
const Match = require('../data/models/Match');

const { encrypt, noop } = require('../helpers/cryptors');

const gameFunctions = require("../helpers/gameFunctions");

const port = process.env.PORT || 3000;


module.exports = class GameServer {
  constructor(db) {
    this.version = "1.2.0";
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

  sendUpdateToMatch = async (matchId, match = false, sendChoices = false) => {
    this.getPlayersInMatch(matchId, false, async (players) => {
      var match = await Match.findOne({ matchId: matchId });
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
  };

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
  getPlayersInMatch = async (matchId, returnObject = false, callback) => {
    try {
      const match = await Match.findOne({matchId: matchId}).catch((err) => {console.log("Error while getting match:", err)});

      if (!match || !match.currentGame) {
        console.log("removePlayerFromActiveMatch: Match has no currentGame.");
        callback(true);
        return true;
      }
  
      var players = [];
  
      if (returnObject) {
        for (var player of match.currentGame.players) {
          players.push(player.player);
        }
      } else {
        for (var player of match.currentGame.players) {
          players.push(player.uToken);
        }
      }
      if (typeof callback === 'function') return callback(players);
      return true;
    } catch (error) {
      console.log("getPlayersInMatch: Something went wrong:", error); 
    }    
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
    try {
      var user = await Client.findOne({ uToken: token }).catch((err) => {console.log("Error while getting client:", err)});
      
      if (!user.currentMatch) {
        console.log("removeCurrentMatchFromPlayer: User has no currentMatch");
        if (typeof callback === 'function') callback(true);
        return true;
      }

      if (increaseGamesPlayed) {
        user.gamesPlayed++;
      }

      user.currentMatch = "";
      await user.save();
      if (typeof callback === 'function') callback(true);
      return true;

    } catch (error) {
      console.log("removeCurrentMatchFromPlayer: Something went wrong:", error); 
    }
  }

  removePlayerFromActiveMatch = async (token, callback = false) => {
    // TODO: If player is in a current match, update the queue and let the opponent win!
    try {
      var user = await Client.findOne({uToken: token}).catch((err) => {console.log("Error while getting client:", err)});
          
      if (!user.currentMatch) {
        if (typeof callback === 'function') callback(true);
        return true;
      }

      var match = await Match.findOne({matchId: user.currentMatch}).catch((err) => {console.log("Error while getting match:", err)});

      if (!match || !match.currentGame) {
        console.log("removePlayerFromActiveMatch: Match has no currentGame.");
        if (typeof callback === 'function') callback(true);
        return true;
      }

      var currentGame = match.currentGame.players;
      var newGame = [];

      for (var player of currentGame) {
        if (player.uToken != token) {
          newGame.push(player);
        }
      }

      match.currentGame.players = newGame;

      await match.save();
      if (typeof callback === 'function') callback(true);
    }
    catch (error) {
      console.log("removePlayerFromActiveMatch: Something went wrong:", error); 
    }
  }
}
