require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config");
const logger = require("./modules/logger");
const socketClient = require("./socket/client");
const events = require("./socket/events");
const autoMessage = require("./modules/autoMessage");
const rainIntelligence = require("./modules/rainIntelligence");
const betTracker = require("./modules/betTracker");
const routes = require("./api/routes");

const app = express();
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3001;

app.use(cors());
app.use(express.json());

// Proteção por senha (quando DASHBOARD_PASSWORD está definida)
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;
if (DASHBOARD_PASSWORD) {
  app.use((req, res, next) => {
    // Permite acesso ao endpoint de auth
    if (req.path === "/api/v1/auth") return next();
    // Verifica token no header ou query
    const token = req.headers["x-dashboard-token"] || req.query.token;
    if (token === DASHBOARD_PASSWORD) return next();
    // Se for rota de API, rejeita com 401
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    // Para o frontend SPA, deixa passar (o React trata o login)
    next();
  });

  // Endpoint de autenticação do painel
  app.post("/api/v1/auth", (req, res) => {
    const { password } = req.body || {};
    if (password === DASHBOARD_PASSWORD) {
      res.json({ ok: true, token: DASHBOARD_PASSWORD });
    } else {
      res.status(401).json({ ok: false, error: "Senha incorreta" });
    }
  });
}

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
  if (DASHBOARD_PASSWORD) logger.info("Painel protegido por senha ativado.");
  config.load();

  // Connect socket and register event handlers
  socketClient.connect();

  // Re-register handlers on every new connection
  const eventBus = require("./eventBus");
  eventBus.on("status", (status) => {
    if (status.connected) {
      const s = socketClient.getSocket();
      if (s) events.register(s);
    }
  });

  // Start auto-message engine
  autoMessage.startAll();

  // Rain Intelligence + Bet Tracker
  rainIntelligence.init();
  betTracker.init();
});
