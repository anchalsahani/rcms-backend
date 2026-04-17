const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const handleSocket = require("./socketHandler");

const app = express();
app.use(cors());

const server = http.createServer(app);

function isAllowedOrigin(origin) {
  if (!origin) return true;

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname;

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      /^192\.168\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed: ${origin}`));
    },
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
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
