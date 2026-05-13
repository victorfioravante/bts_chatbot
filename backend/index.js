require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config");
const logger = require("./modules/logger");
const socketClient = require("./socket/client");
const events = require("./socket/events");
const autoMessage = require("./modules/autoMessage");
const routes = require("./api/routes");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve frontend build
const frontendDist = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendDist));

// API routes
app.use("/api/v1", routes);

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"), (err) => {
    if (err) res.status(200).json({ status: "Bitsler Bot running" });
  });
});

app.listen(PORT, () => {
  logger.info(`Backend rodando na porta ${PORT}`);
  config.load();

  // Connect socket and register event handlers
  const socket = socketClient;
  socketClient.connect();

  // Register event handlers after connect
  const { getSocket } = socketClient;
  const sio = getSocket();
  if (sio) events.register(sio);

  // Watch for new socket connections to re-register handlers
  const eventBus = require("./eventBus");
  eventBus.on("status", (status) => {
    if (status.connected) {
      const s = socketClient.getSocket();
      if (s) events.register(s);
    }
  });

  // Start auto-message engine
  autoMessage.startAll();
});
