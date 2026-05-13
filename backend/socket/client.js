const { io } = require("socket.io-client");
const https = require("https");
const { MsgpackEncoder, MsgpackDecoder } = require("./parser");
const logger = require("../modules/logger");
const config = require("../config");
const eventBus = require("../eventBus");
const auth = require("../auth");

// Faz um GET raw ao endpoint de polling para ver a resposta do servidor
function probePollingEndpoint(socketToken, fingerprint) {
  return new Promise((resolve) => {
    const path = `/chat/?EIO=4&transport=polling&t=${Date.now()}`;
    const req = https.request(
      {
        hostname: "ws.bitsler.com",
        path,
        method: "GET",
        headers: {
          authorization: socketToken,
          fp: fingerprint,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "*/*",
          Origin: "https://www.bitsler.com",
          Referer: "https://www.bitsler.com/",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          logger.info(`[WS-probe] HTTP ${res.statusCode} → ${data.slice(0, 300)}`);
          resolve();
        });
      }
    );
    req.on("error", (e) => { logger.warn(`[WS-probe] erro: ${e.message}`); resolve(); });
    req.end();
  });
}

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

async function connect() {
  const cfg = config.get();
  const fingerprint =
    process.env.BITSLER_FINGERPRINT || process.env.FINGERPRINT || "00000000000000000000";

  let socketToken;
  try {
    socketToken = await auth.getSocketToken();
  } catch (err) {
    logger.error(`[Auth] ${err.message}`);
    eventBus.emit("status", { connected: false, error: err.message });
    scheduleReconnect();
    return;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  // Diagnóstico: testa o endpoint de polling manualmente antes de conectar
  await probePollingEndpoint(socketToken, fingerprint);

  logger.info("Conectando ao WebSocket do Bitsler...");

  // Polling primeiro (HTTP) para enviar auth headers — depois upgrade para WS.
  // extraHeaders no nível raiz garante envio em ambos os transports no Node.js.
  socket = io("https://ws.bitsler.com", {
    path: "/chat",
    autoConnect: false,
    parser: MsgpackParser,
    reconnection: false,
    transports: ["polling", "websocket"],
    extraHeaders: {
      authorization: socketToken,
      fp: fingerprint,
    },
    transportOptions: {
      polling: {
        extraHeaders: {
          authorization: socketToken,
          fp: fingerprint,
        },
      },
    },
  });

  // Log de baixo nível para diagnóstico de transport close
  socket.io.on("open", () => logger.debug("[WS] engine abriu"));
  socket.io.on("error", (err) => logger.error(`[WS] engine error: ${JSON.stringify(err)}`));
  socket.io.on("close", (reason, desc) =>
    logger.warn(`[WS] engine fechou: ${reason} ${desc ? JSON.stringify(desc) : ""}`)
  );

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

    // Token inválido/expirado — força renovação no próximo connect
    if (/auth|token|401|403/i.test(err.message)) {
      logger.warn("[Auth] Token inválido detectado, forçando renovação...");
      auth.clearCache();
    }

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
