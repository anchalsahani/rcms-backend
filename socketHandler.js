const roomManager = require("./roomManager");
const gameEngine = require("./gameEngine");

const pendingDisconnects = new Map();
const DISCONNECT_GRACE_MS = 15000;
const voiceRooms = new Map();

function emitStartedGame(io, roomId, room) {

  room.players.forEach(player => {
    io.to(player.id).emit("your_role", {
      role: player.role,
      room
    });
  });

  io.to(roomId).emit("room_players", room);
  io.to(roomId).emit("game_started", { roomId });
}

function joinVoiceRoom(roomId, socketId) {

  if (!voiceRooms.has(roomId)) {
    voiceRooms.set(roomId, new Set());
  }

  const room = voiceRooms.get(roomId);
  const existingUsers = [...room].filter(id => id !== socketId);
  room.add(socketId);

  return existingUsers;
}

function leaveVoiceRooms(io, socketId) {

  for (const [roomId, members] of voiceRooms.entries()) {
    if (!members.has(socketId)) continue;

    members.delete(socketId);
    io.to(roomId).emit("voice_user_left", socketId);
    io.to(roomId).emit("player_speaking", { id: socketId, speaking: false });

    if (members.size === 0) {
      voiceRooms.delete(roomId);
    }
  }
}

module.exports = function handleSocket(io, socket) {

  console.log("[socket] connected", socket.id);

  /* ---------------- CREATE ROOM ---------------- */

  socket.on("create_room", ({ playerName, sessionId }) => {

    const room = roomManager.createRoom(socket.id, playerName, sessionId);

    socket.join(room.roomId);

    console.log("[create_room]", { socketId: socket.id, roomId: room.roomId, playerName });

    io.to(room.roomId).emit("room_players", room);
  });


  /* ---------------- JOIN ROOM ---------------- */

  socket.on("join_room", ({ roomId, playerName, sessionId }) => {

    const room = roomManager.joinRoom(roomId, socket.id, playerName, sessionId);

    if (!room) {
      console.warn("[join_room] rejected", { socketId: socket.id, roomId, playerName });
      socket.emit("error_message", "Room full or not found");
      return;
    }

    socket.join(roomId);

    console.log("[join_room] joined", { socketId: socket.id, roomId, playerName });

    io.to(roomId).emit("room_players", room);
  });


  /* ---------------- SESSION SYNC ---------------- */

  socket.on("sync_session", ({ roomId, playerName, socketId: previousSocketId, sessionId }) => {

    if (previousSocketId && pendingDisconnects.has(previousSocketId)) {
      clearTimeout(pendingDisconnects.get(previousSocketId));
      pendingDisconnects.delete(previousSocketId);
      console.log("[sync_session] cleared pending disconnect", previousSocketId);
    }

    const room = roomManager.syncPlayerSession({
      roomId,
      previousSocketId,
      socketId: socket.id,
      playerName,
      sessionId
    });

    if (!room) {
      console.warn("[sync_session] failed", {
        socketId: socket.id,
        roomId,
        playerName,
        previousSocketId
      });
      return;
    }

    socket.join(roomId);

    console.log("[sync_session] restored", {
      roomId,
      playerName,
      previousSocketId,
      socketId: socket.id,
      state: room.state
    });

    socket.emit("room_players", room);

    const player = room.players.find(p => p.id === socket.id);
    if (player?.role) {
      socket.emit("your_role", {
        role: player.role,
        room
      });
    }

    io.to(roomId).emit("room_players", room);
  });


  /* ---------------- GET PLAYERS ---------------- */

  socket.on("get_room_players", ({ roomId }) => {

    const room = roomManager.getRoom(roomId);

    if (room) {
      console.log("[get_room_players]", { socketId: socket.id, roomId, state: room.state });
      socket.emit("room_players", room);
    }
  });


  /* ---------------- VOICE ---------------- */

  socket.on("voice_join", ({ roomId }) => {

    if (!roomId) return;

    socket.join(roomId);

    const existingUsers = joinVoiceRoom(roomId, socket.id);

    console.log("[voice_join]", { socketId: socket.id, roomId, existingUsers });

    socket.emit("voice_users", existingUsers);
    socket.to(roomId).emit("voice_user_joined", socket.id);
  });

  socket.on("voice_leave", ({ roomId }) => {

    if (!roomId) return;

    const room = voiceRooms.get(roomId);
    if (!room) return;

    room.delete(socket.id);
    socket.to(roomId).emit("voice_user_left", socket.id);
    io.to(roomId).emit("player_speaking", { id: socket.id, speaking: false });

    if (room.size === 0) {
      voiceRooms.delete(roomId);
    }
  });

  socket.on("voice_signal", ({ target, signal }) => {
    if (!target || !signal) return;

    io.to(target).emit("voice_signal", {
      from: socket.id,
      signal
    });
  });

  socket.on("speaking", ({ roomId, speaking }) => {
    if (!roomId) return;

    io.to(roomId).emit("player_speaking", {
      id: socket.id,
      speaking: Boolean(speaking)
    });
  });


  /* ---------------- READY ---------------- */

  socket.on("player_ready", ({ roomId }) => {

    roomManager.toggleReady(socket.id, roomId);

    const room = roomManager.getRoom(roomId);

    io.to(roomId).emit("room_players", room);
  });


  /* ---------------- MIC ---------------- */

  socket.on("toggle_mic", ({ roomId }) => {

    roomManager.toggleMic(socket.id, roomId);

    const room = roomManager.getRoom(roomId);

    io.to(roomId).emit("room_players", room);
  });


  /* ---------------- START GAME ---------------- */

  socket.on("start_game", ({ roomId, totalRounds }) => {

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    if (room.players.length !== 4) {
      socket.emit("error_message", "Exactly 4 players are required to start");
      return;
    }

    const host = room.players.find(player => player.isHost);
    if (!host || host.id !== socket.id) {
      socket.emit("error_message", "Only the host can start the game");
      return;
    }

    const allNonHostReady = room.players
      .filter(player => !player.isHost)
      .every(player => player.ready);

    if (!allNonHostReady) {
      socket.emit("error_message", "All non-host players must be ready");
      return;
    }

    let updatedRoom;
    const configuredRounds = totalRounds === 3 ? 3 : 5;

    try {
      updatedRoom = gameEngine.startGame({
        ...room,
        totalRounds: configuredRounds,
        currentRound: 1
      });
    } catch (error) {
      console.error("[start_game] failed", error);
      socket.emit("error_message", "Could not start the game");
      return;
    }

    roomManager.updateRoom(roomId, updatedRoom);

    console.log("[start_game] roles assigned", {
      roomId,
      players: updatedRoom.players.map(player => ({
        id: player.id,
        name: player.name,
        role: player.role
      }))
    });

    emitStartedGame(io, roomId, updatedRoom);
  });


  /* ---------------- GUESS ---------------- */

  socket.on("make_guess", ({ roomId, guessedId }) => {

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    if (room.game?.mantriId !== socket.id) {
      console.warn("[make_guess] rejected non-mantri attempt", {
        socketId: socket.id,
        roomId,
        guessedId
      });
      return;
    }

    if (room.state === "RESULT" || room.state === "FINISHED") {
      console.warn("[make_guess] ignored because room already has result", { roomId });
      return;
    }

    const updatedRoom = gameEngine.handleGuess(room, guessedId);

    roomManager.updateRoom(roomId, updatedRoom);

    io.to(roomId).emit("guess_result", {
      ...updatedRoom.result,
      room: updatedRoom
    });
    io.to(roomId).emit("room_players", updatedRoom);
  });


  /* ---------------- NEXT ROUND ---------------- */

  socket.on("next_round", ({ roomId }) => {

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const host = room.players.find(player => player.isHost);
    if (!host || host.id !== socket.id) {
      socket.emit("error_message", "Only the host can start the next round");
      return;
    }

    if (room.currentRound >= room.totalRounds) {
      const finishedRoom = {
        ...room,
        state: "FINISHED",
        gameState: "finalResult"
      };

      roomManager.updateRoom(roomId, finishedRoom);
      io.to(roomId).emit("room_players", finishedRoom);
      return;
    }

    let nextRoundRoom;

    try {
      const resetRoom = gameEngine.resetRound(room);
      nextRoundRoom = gameEngine.startGame({
        ...resetRoom,
        currentRound: room.currentRound + 1,
        totalRounds: room.totalRounds
      });
    } catch (error) {
      console.error("[next_round] failed", error);
      socket.emit("error_message", "Could not start the next round");
      return;
    }

    roomManager.updateRoom(roomId, nextRoundRoom);

    emitStartedGame(io, roomId, nextRoundRoom);
  });


  /* ---------------- RESTART GAME ---------------- */

  socket.on("restart_game", ({ roomId }) => {

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const host = room.players.find(player => player.isHost);
    if (!host || host.id !== socket.id) {
      socket.emit("error_message", "Only the host can restart the game");
      return;
    }

    let restartedRoom;

    try {
      restartedRoom = gameEngine.startGame({
        ...room,
        players: room.players.map(player => ({
          ...player,
          score: 0,
          roundScore: 0,
          ready: player.isHost
        })),
        currentRound: 1,
        totalRounds: room.totalRounds || 5,
        state: "WAITING",
        gameState: "playing",
        result: undefined
      });
    } catch (error) {
      console.error("[restart_game] failed", error);
      socket.emit("error_message", "Could not restart the game");
      return;
    }

    roomManager.updateRoom(roomId, restartedRoom);

    emitStartedGame(io, roomId, restartedRoom);
  });


  /* ---------------- LEAVE ---------------- */

  socket.on("leave_room", ({ roomId }) => {

    leaveVoiceRooms(io, socket.id);

    if (pendingDisconnects.has(socket.id)) {
      clearTimeout(pendingDisconnects.get(socket.id));
      pendingDisconnects.delete(socket.id);
    }

    const id = roomManager.removePlayer(socket.id);

    socket.leave(roomId);

    if (id) {
      const room = roomManager.getRoom(id);
      if (room) {
        io.to(id).emit("room_players", room);
      }
    }
  });


  /* ---------------- DISCONNECT ---------------- */

  socket.on("disconnect", () => {

    console.log("[socket] disconnect", socket.id);
    leaveVoiceRooms(io, socket.id);

    const timeout = setTimeout(() => {
      pendingDisconnects.delete(socket.id);

      const roomId = roomManager.removePlayer(socket.id);

      if (roomId) {
        const room = roomManager.getRoom(roomId);
        if (room) {
          console.log("[socket] disconnect finalized", { socketId: socket.id, roomId });
          io.to(roomId).emit("room_players", room);
        }
      }
    }, DISCONNECT_GRACE_MS);

    pendingDisconnects.set(socket.id, timeout);
  });
};
