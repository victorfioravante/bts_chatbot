const { io } = require("socket.io-client");
const { MsgpackEncoder, MsgpackDecoder } = require("./parser");
const logger = require("../modules/logger");
const config = require("../config");
const eventBus = require("../eventBus");

const MsgpackParser = { Encoder: MsgpackEncoder, Decoder: MsgpackDecoder };

let socket = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let connected = false;
let connectionStart = null;

function getSocket() {
  return socket;
}

function isConnected() {
  return connected;
}

function getUptime() {
  if (!connectionStart) return 0;
  return Math.floor((Date.now() - connectionStart) / 1000);
}

function connect() {
  const cfg = config.get();
  const socketToken = process.env.SOCKET_TOKEN;
  const fingerprint = process.env.FINGERPRINT || "00000000000000000000";

  if (!socketToken) {
    logger.warn("SOCKET_TOKEN nao definido. Configure no .env ou via painel.");
    eventBus.emit("status", { connected: false, error: "Token nao configurado" });
    return;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  logger.info("Conectando ao WebSocket do Bitsler...");

  socket = io("wss://ws.bitsler.com", {
    path: "/chat",
    autoConnect: false,
    parser: MsgpackParser,
    reconnection: false,
    transports: ["websocket", "polling"],
    transportOptions: {
      polling: {
        extraHeaders: {
          authorization: socketToken,
          fp: fingerprint,
        },
      },
      websocket: {
        extraHeaders: {
          authorization: socketToken,
          fp: fingerprint,
        },
      },
    },
  });

  socket.on("connect", () => {
    connected = true;
    connectionStart = Date.now();
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    logger.info("Conectado ao WebSocket do Bitsler");
    eventBus.emit("status", { connected: true });

    // Enviar fingerprint apos conexao
    socket.emit("fp", fingerprint);

    // Entrar nos canais configurados
    const channels = cfg.channels.autoJoin || ["en", "br", "system"];
    channels.forEach((ch) => {
      socket.emit("join", { channel: ch });
      logger.info(`Joined canal: ${ch}`);
    });
  });

  socket.on("disconnect", (reason) => {
    connected = false;
    connectionStart = null;
    logger.warn(`Desconectado: ${reason}`);
    eventBus.emit("status", { connected: false, reason });
    scheduleReconnect();
  });

  socket.on("connect_error", (err) => {
    connected = false;
    logger.error(`Erro de conexao: ${err.message}`);
    eventBus.emit("status", { connected: false, error: err.message });
    scheduleReconnect();
  });

  socket.on("reload", () => {
    logger.info("Servidor solicitou recarga. Reconectando...");
    socket.disconnect();
  });

  socket.connect();
}

function scheduleReconnect() {
  const cfg = config.get();
  const max = cfg.connection.maxReconnectAttempts || 10;

  if (reconnectAttempts >= max) {
    logger.error("Maximo de tentativas de reconexao atingido.");
    return;
  }

  const delay = Math.min(
    cfg.connection.reconnectDelay * Math.pow(1.5, reconnectAttempts),
    60000
  );
  reconnectAttempts++;
  logger.info(`Reconectando em ${Math.round(delay / 1000)}s (tentativa ${reconnectAttempts}/${max})`);

  reconnectTimer = setTimeout(() => {
    connect();
  }, delay);
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    reconnectAttempts = 999; // Impede reconexao automatica
    socket.disconnect();
    socket = null;
  }
  connected = false;
  connectionStart = null;
  logger.info("Desconectado manualmente.");
}

function emit(event, data) {
  if (!socket || !connected) {
    logger.warn(`Tentativa de emitir '${event}' sem conexao ativa`);
    return false;
  }
  socket.emit(event, data);
  return true;
}

module.exports = { connect, disconnect, emit, getSocket, isConnected, getUptime };
