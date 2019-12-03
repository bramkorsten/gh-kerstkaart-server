// TODO: Optimize database writes by only calling write() once
const validChoices = ["rock", "paper", "scissors", 1, 2, 3];

function isValidUser(token) {
  const user = db
    .get("clients")
    .find({ uToken: token })
    .value();
  if (!user) {
    return false;
  }
  return user;
}

function isValidChoice(choice) {
  return validChoices.includes(choice);
}

function sendInvalidUser(ws) {
  const response = {
    type: "error",
    data: "uID is invalid"
  };
  ws.send(JSON.stringify(response));
  return false;
}

function sendUserNotInMatch(ws) {
  const response = {
    type: "error",
    data: "User is not in a match"
  };
  ws.send(JSON.stringify(response));
  return false;
}

function sendInvalidChoice(ws) {
  const response = {
    type: "error",
    data: "Invalid Choice"
  };
  ws.send(JSON.stringify(response));
  return false;
}

function getMatch(matchId) {
  const match = db
    .get("matches")
    .find({ matchId: matchId })
    .value();
  if (!match) {
    return false;
  }
  return match;
}

function removeMatch(matchId) {
  db.get("matches")
    .remove({ matchId: matchId })
    .write();
}

function setMatchWon(matchId, winner) {
  const match = db
    .get("matches")
    .find({ matchId: matchId })
    .assign({ matchWonBy: winner })
    .write();
  return match;
}

function increaseStreakForPlayer(user) {
  const newScore = user.highscore.currentStreak + 1;
  if (user.highscore.bestStreak == user.highscore.currentStreak) {
    db.get("clients")
      .find({ uToken: user.uToken })
      .get("highscore")
      .assign({
        currentStreak: newScore,
        bestStreak: newScore
      })
      .write();
  } else {
    db.get("clients")
      .find({ uToken: user.uToken })
      .get("highscore")
      .assign({
        currentStreak: newScore
      })
      .write();
  }
}

function resetStreakForPlayer(user) {
  const dbUser = db
    .get("clients")
    .find({ uToken: user.uToken })
    .get("highscore")
    .assign({
      currentStreak: 0
    })
    .write();
}

function getFirstEmptyMatch() {
  const match = db
    .get("matches")
    .find({ matchFull: false })
    .value();
  if (!match) {
    return false;
  }
  return match;
}

function generateMatchId() {
  var newMatchId = Math.random()
    .toString(36)
    .substr(2, 9);
  // TODO: Might be over complicated / slow?
  while (getMatch(newMatchId)) {
    newMatchId = Math.random()
      .toString(36)
      .substr(2, 9);
  }
  return newMatchId;
}

function createMatch(user) {
  const newMatchId = generateMatchId();
  console.log("Creating match with id: " + newMatchId);
  const match = {
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
  };
  db.get("matches")
    .push(match)
    .write();
  setUserMatch(user, match.matchId);
  return match;
}

function getUserMatch(user) {
  const dbUser = db
    .get("clients")
    .find({ uToken: user.uToken })
    .value();
  if (dbUser.currentMatch) {
    return dbUser.currentMatch;
  }
  return false;
}

function setUserMatch(user, matchId) {
  db.get("clients")
    .find({ uToken: user.uToken })
    .assign({ currentMatch: matchId })
    .write();
}

function setUserChoice(token, matchId, choice) {
  db.get("matches")
    .find({ matchId: matchId })
    .get("currentGame.players")
    .find({ uToken: token })
    .assign({ choice: choice })
    .write();
  return getMatch(matchId);
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

function placeUserInMatch(user, match) {
  setUserMatch(user, match.matchId);
  match = getMatch(match.matchId);
  // TODO: Check for already in match / change matches
  for (var player of match.currentGame.players) {
    if (player.uToken == user.uToken) {
      console.log("Player already in match");
      return match;
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
    db.get("matches")
      .find({ matchId: match.matchId })
      .assign(match)
      .write();
    return match;
  } else {
    console.log("Game is full");
    return false;
  }
}

// OPTIMIZE: Can this be done more efficiently?
function getHighscoresFromDatabase() {
  return db.get("clients").value();
}

function sendResponseToRequest(message, ws) {
  ws.send(JSON.stringify(message));
}

// Sandboxed functions to keep users from running game logic directly

module.exports = {
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
    const databaseUser = isValidUser(token);
    if (!databaseUser) {
      console.log("Creating new user: " + user.name);
      const newUser = {
        uToken: token,
        name: user.name,
        gamesPlayed: 0,
        highscore: {
          currentStreak: 0,
          bestStreak: 0
        }
      };
      db.get("clients")
        .push(newUser)
        .write();
      const response = {
        type: "userUpdate",
        data: newUser
      };
      sendResponseToRequest(response, ws);
    } else {
      const response = {
        type: "userUpdate",
        data: databaseUser
      };
      sendResponseToRequest(response, ws);
    }
  },

  getUserInformation: function(message, ws) {
    const token = message.userToken;
    const databaseUser = isValidUser(token);
    if (!databaseUser) {
      return sendInvalidUser(ws);
    }
    const response = {
      type: "userUpdate",
      data: databaseUser
    };
    sendResponseToRequest(response, ws);
  },

  requestMatch: function(message, ws) {
    const token = message.userToken;
    const user = isValidUser(token);
    if (!user) {
      return sendInvalidUser(ws);
    }
    if (!user.currentMatch) {
      match = getFirstEmptyMatch();
    } else {
      match = getMatch(user.currentMatch);
    }
    if (match) {
      placeUserInMatch(user, match);
    } else {
      match = createMatch(user);
    }
    gameServer.sendUpdateToMatch(match.matchId);
    return true;
  },

  forfeitMatch: function(message, ws) {
    const token = message.userToken;
    const user = isValidUser(token);
    if (!user) {
      return sendInvalidUser(ws);
    }
    if (!user.currentMatch) {
      sendUserNotInMatch(ws);
    }

    const matchId = user.currentMatch;

    const players = gameServer.getPlayersInMatch(matchId);
    for (var i in players) {
      if (user.uToken === players[i]) {
        resetStreakForPlayer(isValidUser(players[i]));
      } else {
        increaseStreakForPlayer(isValidUser(players[i]));
      }
    }

    const results = {
      result: "forfeit",
      data: "Player with uID " + user.uToken + " forfeited the match"
    };
    gameServer.sendMessageToMatch(matchId, "matchResults", results);
    for (var i in players) {
      gameServer.removePlayerFromActiveMatch(players[i]);
      gameServer.removeCurrentMatchFromPlayer(players[i], false);
    }
    removeMatch(matchId);
  },

  setChoice: function(message, ws) {
    const token = message.userToken;
    const dbUser = isValidUser(token);
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

    const match = setUserChoice(dbUser.uToken, dbUser.currentMatch, choice);
    var choices;
    if ((choices = allChoicesMade(match))) {
      results = calculateWinner(match.matchId, choices);
      // TODO: Set Highscores and remove players from match
      gameServer.sendMessageToMatch(match.matchId, "matchResults", results);
      const player1 = isValidUser(results.player1.uToken);
      const player2 = isValidUser(results.player2.uToken);
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
      const players = gameServer.getPlayersInMatch(match.matchId);
      for (var i in players) {
        if (results.result == i + 1) {
        }
        gameServer.removeCurrentMatchFromPlayer(players[i], true);
      }
      removeMatch(match.matchId);
      return true;
    }

    gameServer.sendUpdateToMatch(match.matchId);
    return true;
  },
  getHighscores: function(message, ws) {
    const token = message.userToken;
    const dbUser = isValidUser(token);
    if (!dbUser) {
      return sendInvalidUser(ws);
    }

    const highscores = getHighscoresFromDatabase();

    const response = {
      type: "highscores",
      data: {
        highscores: highscores
      }
    };

    sendResponseToRequest(response, ws);
  }
};
