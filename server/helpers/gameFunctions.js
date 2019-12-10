const Client = require('../data/models/Client');
const Match = require('../data/models/Match');

// TODO: Optimize database writes by only calling write() once
let db;

const validChoices = ["rock", "paper", "scissors", 1, 2, 3];

const isValidUser = (token) => Client.findOne({ uToken: token });

const isValidChoice = (choice) => validChoices.includes(choice);

const generateMatchId = () => Math.random().toString(36).substr(2, 9);

const createNewUser = (user, token) => {
  console.log("Creating new user: " + user.name);

  const client = new Client({
    uToken: token,
    name: user.name,
    gamesPlayed: 0,
    highscore: {
      currentStreak: 0,
      bestStreak: 0
    }
  })

  return client.save();
}

const sendInvalidUser = (ws) => {
  const response = {
    type: "error",
    data: "uID is invalid"
  };

  ws.send(JSON.stringify(response));
  return false;
}

const sendUserNotInMatch = (ws) => {
  const response = {
    type: "error",
    data: "User is not in a match"
  };
  ws.send(JSON.stringify(response));
  return false;
}

const sendInvalidChoice = (ws) => {
  const response = {
    type: "error",
    data: "Invalid Choice"
  };
  ws.send(JSON.stringify(response));
  return false;
}

const getMatch = (matchId) => Match.findOne({ matchId: matchId });

const removeMatch = (matchId) => Match.deleteOne({ matchId: matchId });

const setMatchWon = (matchId, winner) => Match.updateOne({ matchId: matchId },
  { $set: { matchWonBy: winner } }
);

const increaseStreakForPlayer = (user) => {
  const newScore = user.highscore.currentStreak + 1;

  if (user.highscore.bestStreak === user.highscore.currentStreak) {
    return Client.updateOne(
      { uToken: user.uToken },
      {
        $set: {
          "highscore.currentStreak": newScore,
          "highscore.bestStreak": newScore
        }
      }
    );
  }

  return Client.updateOne(
    { uToken: user.uToken },
    { $set: { "highscore.currentStreak": newScore } }
  );
}

const resetStreakForPlayer = (user) =>
  Client.updateOne(
    { uToken: user.uToken },
    { $set: { "highscore.currentStreak": 0 } }
  );

const getFirstEmptyMatch = () => Match.findOne({ matchFull: false });

const createMatch = (user) => new Promise((resolve, reject) => {
    const newMatchId = generateMatchId();
    console.log("Creating match with id: " + newMatchId);

    const match = new Match({
      matchId: newMatchId,
      matchFull: false,
      matchWonBy: undefined,
      matchStartTime: undefined,
      matchEndTime: undefined,
      initializer: user,
      currentGame: {
        players: [
          {
            uToken: user.uToken,
            player: user,
            choice: undefined,
            streak: 0
          }
        ]
      }
    });

    Promise.all([match.save(), setUserMatch(user, match.matchId)])
      .then((results) => {
        resolve(match);
      }).catch((error) => {
        reject(error);
      });
    }
  );

function getUserMatch(user) {
  return Client.findOne({ uToken: user.uToken });
}

function setUserMatch(user, matchId) {
  return new Promise((resolve, reject) => {
    try {
      Client.updateOne({ uToken: user.uToken }, { $set: { currentMatch: matchId } });
      return resolve(true);
    } catch (e) {
      return reject(e);
    }
  });
}

function setUserChoice(token, matchId, choice) {
  return new Promise(function(resolve, reject) {
    const matchCollection = Match;
    matchCollection.findOne({ matchId: matchId }, function(err, match) {
      if (err) {
        reject(err);
      }
      const currentPlayers = match.currentGame.players;
      var newList = [];
      for (var player of currentPlayers) {
        if (player.uToken == token) {
          player.choice = choice;
        }
        newList.push(player);
      }
      matchCollection.updateOne(
        { matchId: matchId },
        { $set: { "currentGame.players": newList } },
        function(err, r) {
          if (err) {
            reject(err);
          }
          resolve(match);
        }
      );
    });
  });
}

function allChoicesMade(match) {
  var choices = {
    player1: {
      uToken: 0,
      choice: 0
    },
    player2: {
      uToken: 0,
      choice: 0
    }
  };

  var player1MadeChoice = false;
  var player2MadeChoice = false;

  if (
    match.currentGame.players[0] &&
    match.currentGame.players[0].choice != undefined
  ) {
    player1MadeChoice = true;
    choices.player1.choice = match.currentGame.players[0].choice;
    choices.player1.uToken = match.currentGame.players[0].uToken;
    choices.player1.name = match.currentGame.players[0].player.name;
  }

  if (
    match.currentGame.players[1] &&
    match.currentGame.players[1].choice != undefined
  ) {
    player2MadeChoice = true;
    choices.player2.choice = match.currentGame.players[1].choice;
    choices.player2.uToken = match.currentGame.players[1].uToken;
    choices.player2.name = match.currentGame.players[1].player.name;
  }

  if (player1MadeChoice && player2MadeChoice) {
    return choices;
  }
  return false;
}

function calculateWinner(matchId, choices) {
  const choice1 = choices.player1.choice;
  const choice2 = choices.player2.choice;

  if (choice1 == choice2) {
    choices.result = "tie";
    setMatchWon(matchId, choices.result);
    return choices;
  }

  switch (choice1) {
    case "rock":
      if (choice2 == "paper") {
        choices.result = "2";
      } else {
        choices.result = "1";
      }
      break;
    case "paper":
      if (choice2 == "scissors") {
        choices.result = "2";
      } else {
        choices.result = "1";
      }
      break;
    case "scissors":
      if (choice2 == "rock") {
        choices.result = "2";
      } else {
        choices.result = "1";
      }
      break;
    default:
      console.log("Something went terribly wrong here...");
      console.log(choices);
      return false;
  }
  setMatchWon(matchId, choices.result);
  return choices;
}

async function placeUserInMatch(user, match) {

  await setUserMatch(user, match.matchId);

  return new Promise(function(resolve, reject) {
    getMatch(match.matchId)
      .then(function(match) {
        for (var player of match.currentGame.players) {
          if (player.uToken == user.uToken) {
            console.log("Player already in match");
            resolve(match);
          }
        }
        if (match.currentGame.players.length != 2) {
          const player = {
            uToken: user.uToken,
            player: user,
            choice: undefined,
            streak: 0
          };

          match.currentGame.players.push(player);
          match.matchFull = true;

          Match.replaceOne(
            { matchId: match.matchId },
            match,
            function(err, r) {
              if (err) {
                reject(err);
              }
              resolve(match);
            }
          );
        } else {
          console.log("Game is full");
          resolve(false);
        }
      }
    );
  });
}

function getHighscoresFromDatabase() {
  return Client.find().toArray();
}

function sendResponseToRequest(message, ws) {
  ws.send(JSON.stringify(message));
}

// Sandboxed functions to keep users from running game logic directly

module.exports = (gameServer, database) => {
  db = database;

  return {
    requestConnection: function(message, ws) {
      console.log("New Connection Request");
      const response = {
        type: "handshake",
        data: {
          userToken: message.userToken
        }
      };
      ws.send(JSON.stringify(response));
    },

    setUserInformation: function(message, ws) {
      const token = message.userToken;
      const user = message.message;
      isValidUser(token).then(function(databaseUser) {
        if (!databaseUser) {
          createNewUser(user, token).then(function(newUser) {
            const response = {
              type: "userUpdate",
              data: newUser
            };
            sendResponseToRequest(response, ws);
          });
        } else {
          const response = {
            type: "userUpdate",
            data: databaseUser
          };
          sendResponseToRequest(response, ws);
        }
      });
    },

    getUserInformation: function(message, ws) {
      const token = message.userToken;
      isValidUser(token).then(function(databaseUser) {
        if (!databaseUser) {
          return sendInvalidUser(ws);
        }
        const response = {
          type: "userUpdate",
          data: databaseUser
        };
        sendResponseToRequest(response, ws);
      });
    },

    requestMatch: function(message, ws) {
      const token = message.userToken;
      isValidUser(token).then(function(user) {
        if (!user) {
          return sendInvalidUser(ws);
        }
        if (!user.currentMatch) {
          getFirstEmptyMatch().then(function(match) {
            if (match) {
              console.log("Match Found");
              placeUserInMatch(user, match)
                .then(function(match) {
                  gameServer.sendUpdateToMatch(match.matchId);
                });
            } else {
              createMatch(user).then((match) => {
                gameServer.sendUpdateToMatch(match.matchId);
              });
            }
          });
        } else {
          getMatch(user.currentMatch).then(function(match) {
            if (match) {
              placeUserInMatch(user, match).then(function(match) {
                gameServer.sendUpdateToMatch(match.matchId);
              });
            } else {
              createMatch(user).then((match) => {
                gameServer.sendUpdateToMatch(match.matchId);
              });
            }
          });
        }
        return true;
      });
    },

    forfeitMatch: function(message, ws) {
      const token = message.userToken;

      isValidUser(token).then(function(user) {
        if (!user) return sendInvalidUser(ws);
        if (!user.currentMatch) return sendUserNotInMatch(ws);

        const matchId = user.currentMatch;

        gameServer.getPlayersInMatch(matchId, true, function(players) {
          for (var player of players) {
            if (user.uToken === player.uToken) {
              resetStreakForPlayer(player);
            } else {
              increaseStreakForPlayer(player);
            }
          }
          const results = {
            result: "forfeit",
            data: "Player with uID " + user.uToken + " forfeited the match"
          };

          gameServer.sendMessageToMatch(matchId, "matchResults", results, () => {
            for (var player of players) {
              gameServer.removePlayerFromActiveMatch(player.uToken, function() {
                gameServer.removeCurrentMatchFromPlayer(
                  player.uToken,
                  false,
                  function() {
                    removeMatch(matchId);
                  }
                );
              });
            }
          });
        });
      });
    },

    setChoice: function(message, ws) {
      const token = message.userToken;
      isValidUser(token).then(function(dbUser) {
        if (!dbUser) {
          return sendInvalidUser(ws);
        }
        if (!dbUser.currentMatch) {
          return sendUserNotInMatch(ws);
        }
        var choice = message.message.choice;
        if (!choice || !isValidChoice(choice)) {
          return sendInvalidChoice(ws);
        }
        if (typeof choice == "number") {
          choice = validChoices[choice - 1];
        }

        setUserChoice(dbUser.uToken, dbUser.currentMatch, choice).then(function(
          match
        ) {
          var choices;
          if ((choices = allChoicesMade(match))) {
            results = calculateWinner(match.matchId, choices);
            // TODO: Set Highscores and remove players from match
            gameServer.sendMessageToMatch(match.matchId, "matchResults", results);

            Promise.all([
              isValidUser(results.player1.uToken),
              isValidUser(results.player2.uToken)
            ]).then(function(players) {
              const player1 = players[0];
              const player2 = players[1];

              if (results.result == 1) {
                console.log("player1Won");
                increaseStreakForPlayer(player1);
                resetStreakForPlayer(player2);
              }
              if (results.result == 2) {
                console.log("Player2Won");
                increaseStreakForPlayer(player2);
                resetStreakForPlayer(player1);
              }
              gameServer.removeCurrentMatchFromPlayer(
                player1.uToken,
                true,
                function() {
                  if (player2) {
                    gameServer.removeCurrentMatchFromPlayer(
                      player2.uToken,
                      true,
                      function() {
                        removeMatch(match.matchId);
                      }
                    );
                  } else {
                    removeMatch(match.matchId);
                  }
                }
              );

              return true;
            });
          } else {
            console.log("Not all choices made");
            gameServer.sendUpdateToMatch(match.matchId);
            return true;
          }
        });
      });
    },

    getHighscores: function(message, ws) {
    const token = message.userToken;
    isValidUser(token).then(function(user) {
      if (!user) {
        return sendInvalidUser(ws);
      }
      getHighscoresFromDatabase().then(function(highscores) {
        const response = {
          type: "highscores",
          data: {
            highscores: highscores
          }
        };
        sendResponseToRequest(response, ws);
      });
    });
    }
  }
};
