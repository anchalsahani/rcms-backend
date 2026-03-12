const roomManager = require("./roomManager");

const voiceRooms = {};

module.exports = function handleSocket(io, socket) {

  console.log("Socket connected:", socket.id);

  /* ---------------- CREATE ROOM ---------------- */

  socket.on("create_room", ({ playerName }) => {

    const room = roomManager.createRoom(socket.id, playerName);

    socket.join(room.roomId);

    io.to(room.roomId).emit("room_update", room);
    io.to(room.roomId).emit("room_players", room);

  });




  /* ---------------- JOIN ROOM ---------------- */

  socket.on("join_room", ({ roomId, playerName }) => {

    const room = roomManager.joinRoom(roomId, socket.id, playerName);

    if (!room) {
      socket.emit("error_message", "Room not found");
      return;
    }

    socket.join(roomId);

    io.to(roomId).emit("room_update", room);
    io.to(roomId).emit("room_players", room);

  });




  /* ---------------- GET PLAYERS ---------------- */

  socket.on("get_room_players", ({ roomId }) => {

    const room = roomManager.getRoom(roomId);

    if (room) {
      socket.emit("room_players", room);
    }

  });




  /* ---------------- READY SYSTEM ---------------- */

  socket.on("player_ready", ({ roomId }) => {

    roomManager.toggleReady(socket.id, roomId);

    const room = roomManager.getRoom(roomId);

    if (room) {
      io.to(roomId).emit("room_players", room);
    }

  });




  /* ---------------- MIC TOGGLE ---------------- */

  socket.on("toggle_mic", ({ roomId }) => {

    roomManager.toggleMic(socket.id, roomId);

    const room = roomManager.getRoom(roomId);

    if (room) {
      io.to(roomId).emit("room_players", room);
    }

  });




  /* ---------------- LEAVE ROOM ---------------- */

  socket.on("leave_room", ({ roomId }) => {

    const room = roomManager.removePlayer(socket.id, roomId);

    socket.leave(roomId);

    if (room) {

      io.to(roomId).emit("player_left", socket.id);
      io.to(roomId).emit("room_players", room);

    }

    /* remove from voice */

    if (voiceRooms[roomId]) {

      voiceRooms[roomId] = voiceRooms[roomId].filter(
        id => id !== socket.id
      );

      socket.to(roomId).emit("voice_user_left", socket.id);
    }

  });




  /* ---------------- VOICE JOIN ---------------- */

  socket.on("voice_join", ({ roomId }) => {

    if (!voiceRooms[roomId]) {
      voiceRooms[roomId] = [];
    }

    if (!voiceRooms[roomId].includes(socket.id)) {
      voiceRooms[roomId].push(socket.id);
    }

    const otherUsers = voiceRooms[roomId].filter(
      id => id !== socket.id
    );

    socket.emit("voice_users", otherUsers);

    socket.to(roomId).emit("voice_user_joined", socket.id);

  });




  /* ---------------- WEBRTC OFFER ---------------- */

  socket.on("voice_offer", ({ target, offer }) => {

    io.to(target).emit("voice_offer", {
      from: socket.id,
      offer
    });

  });




  /* ---------------- WEBRTC ANSWER ---------------- */

  socket.on("voice_answer", ({ target, answer }) => {

    io.to(target).emit("voice_answer", {
      from: socket.id,
      answer
    });

  });




  /* ---------------- ICE CANDIDATE ---------------- */

  socket.on("voice_ice_candidate", ({ target, candidate }) => {

    io.to(target).emit("voice_ice_candidate", {
      from: socket.id,
      candidate
    });

  });




  /* ---------------- SPEAKING DETECTION ---------------- */

  socket.on("speaking", ({ roomId, speaking }) => {

    if (!roomId) return;

    socket.to(roomId).emit("player_speaking", {
      id: socket.id,
      speaking
    });

  });




  /* ---------------- DISCONNECT ---------------- */

  socket.on("disconnect", () => {

    console.log("Socket disconnected:", socket.id);

    /* remove from voice rooms */

    for (const roomId in voiceRooms) {

      voiceRooms[roomId] = voiceRooms[roomId].filter(
        id => id !== socket.id
      );

      socket.to(roomId).emit("voice_user_left", socket.id);

    }

    const roomId = roomManager.removePlayer(socket.id);

    if (roomId) {

      const room = roomManager.getRoom(roomId);

      if (room) {

        io.to(roomId).emit("player_left", socket.id);
        io.to(roomId).emit("room_players", room);

      }

    }

  });

};