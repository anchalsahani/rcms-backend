const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const handleSocket = require("./socketHandler");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

/* ---------------- SOCKET CONNECTION ---------------- */

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // attach all game + voice handlers
  handleSocket(io, socket);

  /* -------- WebRTC signaling events -------- */

  socket.on("voice_offer", ({ target, offer }) => {
    io.to(target).emit("voice_offer", {
      from: socket.id,
      offer
    });
  });

  socket.on("voice_answer", ({ target, answer }) => {
    io.to(target).emit("voice_answer", {
      from: socket.id,
      answer
    });
  });

  socket.on("voice_ice_candidate", ({ target, candidate }) => {
    io.to(target).emit("voice_ice_candidate", {
      from: socket.id,
      candidate
    });
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);

    io.emit("player_disconnected", socket.id);
  });
});

/* ---------------- START SERVER ---------------- */

server.listen(5000, () => {
  console.log("Server running on port 5000");
});