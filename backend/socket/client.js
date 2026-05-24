const { io } = require("socket.io-client");
const https = require("https");
const logger = require("../modules/logger");
const config = require("../config");
const eventBus = require("../eventBus");
const auth = require("../auth");

// ws.bitsler.com/chat usa msgpack (mensagens binárias confirmadas via DevTools)
function buildParser() {
  const mode = process.env.PARSER_MODE || "msgpack";
  if (mode === "none") {
    logger.info("[WS] Parser: JSON padrão");
    return undefined;
  }
  try {
    const p = require("socket.io-msgpack-parser");
    logger.info("[WS] Parser: socket.io-msgpack-parser");
    return p;
  } catch {
    logger.warn("[WS] socket.io-msgpack-parser não instalado, usando JSON");
    return undefined;
  }
}

// Faz um GET raw ao endpoint de polling para ver a resposta do servidor
function probePollingEndpoint(socketToken, fingerprint) {
  return new Promise((resolve) => {
    const path = `/chat/?EIO=4&transport=polling&t=${Date.now()}`;
    const hostname = process.env.WS_HOST || "ws.bitsler.com";
    const req = https.request(
      {
        hostname,
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
  // Namespace configurável — padrão vazio (root), tente /chat se root falhar
  const wsHost = process.env.WS_HOST || "ws.bitsler.com";
  const namespace = process.env.WS_NAMESPACE || "";
  const serverUrl = `https://${wsHost}${namespace}`;
  logger.info(`[WS] Conectando: ${serverUrl} path=/chat`);

  const parser = buildParser();
  logger.info(`[WS] Headers: authorization=${socketToken.slice(0, 12)}… | fp=${fingerprint}`);

  // Configuração mínima que funcionava (commit 09dec9d, 18/Mai):
  // authorization (minúsculo) com token real + fp no header. SEM Cookie/Origin/Referer.
  // SEM auth no CONNECT packet — Bitsler valida só pelos headers HTTP.
  socket = io(serverUrl, {
    path: "/chat",
    autoConnect: false,
    ...(parser ? { parser } : {}),
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
    // Servidor retornou lista de canais no evento "channels" — usamos alias
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
    const detail = err.data ? ` | data: ${JSON.stringify(err.data)}` : "";
    logger.error(`Erro de conexao: ${err.message}${detail}`);
    eventBus.emit("status", { connected: false, error: err.message });

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

  // Loga todos os eventos recebidos (exceto msg/ping que são de alto volume)
  socket.onAny((event, ...args) => {
    if (!["msg", "ping"].includes(event)) {
      logger.info(`[WS-event] ${event} ${JSON.stringify(args).slice(0, 300)}`);
    }
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
  // Bitsler espera channelName (não channel) no evento say
  let payload = data;
  if (event === "say" && data.channel !== undefined) {
    const { channel, message, ...rest } = data;
    payload = { ...rest, channelName: channel, message };
  }
  logger.info(`[WS-emit] ${event} ${JSON.stringify(payload)}`);
  socket.emit(event, payload);
  return true;
}

module.exports = { connect, disconnect, emit, getSocket, isConnected, getUptime };
