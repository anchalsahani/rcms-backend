const { v4: uuidv4 } = require("uuid");

const rooms = {};
const MAX_PLAYERS = 4;


/* ---------------- CREATE ROOM ---------------- */

function createRoom(hostId, playerName) {

  const roomId = uuidv4().slice(0, 6).toUpperCase();

  const player = {
    id: hostId,
    name: playerName,
    score: 0,
    mic: true,
    ready: false,
    avatar: "/avatars/default.png",
    isHost: true
  };

  rooms[roomId] = {
    roomId,
    players: [player]
  };

  return rooms[roomId];
}


/* ---------------- JOIN ROOM ---------------- */

function joinRoom(roomId, socketId, playerName) {

  const room = rooms[roomId];

  if (!room) return null;

  /* prevent duplicate joins */

  const existing = room.players.find(p => p.id === socketId);
  if (existing) return room;

  /* prevent overflow */

  if (room.players.length >= MAX_PLAYERS) {
    return null;
  }

  const player = {
    id: socketId,
    name: playerName,
    score: 0,
    mic: true,
    ready: false,
    avatar: "/avatars/default.png",
    isHost: false
  };

  room.players.push(player);

  return room;
}


/* ---------------- GET ROOM ---------------- */

function getRoom(roomId) {
  return rooms[roomId];
}


/* ---------------- GET PLAYER ---------------- */

function getPlayer(roomId, socketId) {

  const room = rooms[roomId];
  if (!room) return null;

  return room.players.find(p => p.id === socketId);

}


/* ---------------- GET ROOM BY SOCKET ---------------- */

function getRoomBySocket(socketId){

  for(const roomId in rooms){

    const room = rooms[roomId];

    const exists = room.players.find(p => p.id === socketId);

    if(exists) return roomId;

  }

  return null;

}


/* ---------------- GET ALL ROOMS ---------------- */

function getAllRooms() {
  return rooms;
}


/* ---------------- TOGGLE MIC ---------------- */

function toggleMic(id, roomId){

  const player = getPlayer(roomId, id);
  if (!player) return;

  player.mic = !player.mic;

}


/* ---------------- UPDATE AVATAR ---------------- */

function updateAvatar(id, roomId, avatar){

  const player = getPlayer(roomId, id);
  if (!player) return;

  player.avatar = avatar;

}


/* ---------------- TOGGLE READY ---------------- */

function toggleReady(id, roomId){

  const player = getPlayer(roomId, id);
  if (!player) return;

  player.ready = !player.ready;

}


/* ---------------- REMOVE PLAYER ---------------- */

function removePlayer(socketId){

  for(const roomId in rooms){

    const room = rooms[roomId];

    const index = room.players.findIndex(p => p.id === socketId);

    if(index !== -1){

      const wasHost = room.players[index].isHost;

      room.players.splice(index,1);

      /* delete empty room */

      if(room.players.length === 0){
        delete rooms[roomId];
        return null;
      }

      /* reassign host */

      if(wasHost){
        room.players[0].isHost = true;
      }

      return roomId;

    }

  }

  return null;
}


/* ---------------- EXPORT ---------------- */

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  getPlayer,
  getRoomBySocket,
  getAllRooms,
  toggleMic,
  updateAvatar,
  toggleReady,
  removePlayer
};