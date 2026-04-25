const { v4: uuidv4 } = require("uuid");

const rooms = {};
const MAX_PLAYERS = 4;

/* ---------------- CREATE ROOM ---------------- */

function createRoom(hostId, playerName, sessionId) {

  const roomId = uuidv4().slice(0, 6).toUpperCase();

  const player = {
    id: hostId,
    name: playerName,
    score: 0,
    roundScore: 0,
    mic: true,
    ready: false,
    isHost: true,
    sessionId
  };

  rooms[roomId] = {
    roomId,
    players: [player],
    state: "WAITING",
    gameState: "playing",
    currentRound: 0,
    totalRounds: 5,
    roundHistory: [],

    game: {
      mantriId: null,
      chorId: null
    }
  };

  return rooms[roomId];
}


/* ---------------- JOIN ROOM ---------------- */

function joinRoom(roomId, socketId, playerName, sessionId) {

  const room = rooms[roomId];
  if (!room) return null;

  if (room.players.length >= MAX_PLAYERS) return null;

  const existingPlayer = room.players.find(player => player.sessionId === sessionId);
  if (existingPlayer) {
    existingPlayer.id = socketId;
    existingPlayer.name = playerName;
    return room;
  }

  const player = {
    id: socketId,
    name: playerName,
    score: 0,
    roundScore: 0,
    mic: true,
    ready: false,
    isHost: false,
    sessionId
  };

  room.players.push(player);

  return room;
}


/* ---------------- GET ROOM ---------------- */

function getRoom(roomId) {
  return rooms[roomId];
}


/* ---------------- UPDATE ROOM ---------------- */

function updateRoom(roomId, updatedRoom) {
  rooms[roomId] = updatedRoom;
}


/* ---------------- REATTACH PLAYER ---------------- */

function syncPlayerSession({ roomId, previousSocketId, socketId, playerName, sessionId }) {

  const room = rooms[roomId];
  if (!room) return null;

  let player = null;

  if (sessionId) {
    player = room.players.find(p => p.sessionId === sessionId);
  }

  if (!player && previousSocketId) {
    player = room.players.find(p => p.id === previousSocketId);
  }

  if (!player && playerName) {
    player = room.players.find(p => p.name === playerName);
  }

  if (!player) return null;

  player.id = socketId;
  player.sessionId = sessionId || player.sessionId;

  if (playerName && !player.name) {
    player.name = playerName;
  }

  return room;
}


/* ---------------- TOGGLE READY ---------------- */

function toggleReady(socketId, roomId) {

  const room = rooms[roomId];
  if (!room) return;

  const player = room.players.find(p => p.id === socketId);
  if (!player) return;

  player.ready = !player.ready;
}


/* ---------------- TOGGLE MIC ---------------- */

function toggleMic(socketId, roomId) {

  const room = rooms[roomId];
  if (!room) return;

  const player = room.players.find(p => p.id === socketId);
  if (!player) return;

  player.mic = !player.mic;
}


/* ---------------- REMOVE PLAYER ---------------- */

function removePlayer(socketId) {

  for (const roomId in rooms) {

    const room = rooms[roomId];

    const index = room.players.findIndex(p => p.id === socketId);

    if (index !== -1) {

      const wasHost = room.players[index].isHost;

      room.players.splice(index, 1);

      if (room.players.length === 0) {
        delete rooms[roomId];
        return null;
      }

      if (wasHost) {
        room.players[0].isHost = true;
      }

      return roomId;
    }
  }

  return null;
}


module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  updateRoom,
  syncPlayerSession,
  toggleReady,
  toggleMic,
  removePlayer
};
