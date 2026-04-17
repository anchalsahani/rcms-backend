const ROLES = ["raja", "mantri", "chor", "sipahi"];

const ROUND_POINTS = {
  raja: 1000,
  mantriCorrect: 800,
  chorEscaped: 800,
  sipahiSupport: 500
};

/* ---------------- ASSIGN ROLES ---------------- */

function shuffle(array) {

  const clone = [...array];

  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }

  return clone;
}

function assignRoles(players) {

  if (players.length !== ROLES.length) {
    throw new Error(`Expected ${ROLES.length} players, received ${players.length}`);
  }

  const shuffled = shuffle(ROLES);

  return players.map((p, i) => ({
    ...p,
    role: shuffled[i]
  }));
}


/* ---------------- START GAME ---------------- */

function startGame(room) {

  const updatedPlayers = assignRoles(room.players).map(p => ({
    ...p,
    roundScore: 0
  }));

  const mantri = updatedPlayers.find(p => p.role === "mantri");
  const chor = updatedPlayers.find(p => p.role === "chor");

  if (!mantri || !chor) {
    throw new Error("Failed to assign mandatory roles");
  }

  return {
    ...room,
    players: updatedPlayers,
    state: "REVEAL",
    gameState: "playing",
    result: undefined,
    game: {
      mantriId: mantri.id,
      chorId: chor.id
    }
  };
}


/* ---------------- HANDLE GUESS ---------------- */

function handleGuess(room, guessedId) {

  if (room.result?.roundNumber === room.currentRound) {
    return room;
  }

  const { chorId } = room.game;

  const correct = guessedId === chorId;

  const roundScores = {};

  const updatedPlayers = room.players.map(p => {
    let roundScore = 0;

    if (p.role === "raja") {
      roundScore = ROUND_POINTS.raja;
    }

    if (p.role === "mantri" && correct) {
      roundScore = ROUND_POINTS.mantriCorrect;
    }

    if (p.role === "chor" && !correct) {
      roundScore = ROUND_POINTS.chorEscaped;
    }

    if (p.role === "sipahi") {
      roundScore = ROUND_POINTS.sipahiSupport;
    }

    roundScores[p.id] = roundScore;

    return {
      ...p,
      roundScore,
      score: p.score + roundScore
    };
  });

  const finalRound = room.currentRound >= room.totalRounds;

  return {
    ...room,
    players: updatedPlayers,
    state: finalRound ? "FINISHED" : "RESULT",
    gameState: finalRound ? "finalResult" : "roundResult",
    result: {
      correct,
      chorId,
      guessedId,
      roundNumber: room.currentRound,
      roundScores
    }
  };
}


/* ---------------- RESET ROUND ---------------- */

function resetRound(room) {

  const resetPlayers = room.players.map(p => ({
    ...p,
    role: undefined,
    ready: false,
    roundScore: 0
  }));

  return {
    ...room,
    players: resetPlayers,
    state: "WAITING",
    gameState: "playing",
    result: undefined,
    game: {
      mantriId: null,
      chorId: null
    }
  };
}


module.exports = {
  assignRoles,
  startGame,
  handleGuess,
  resetRound
};
