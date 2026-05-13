const logger = require("../modules/logger");
const rainMonitor = require("../modules/rainMonitor");
const eventBus = require("../eventBus");

// In-memory chat history per channel
const chatHistory = {};
const MAX_HISTORY = 200;

function pushMessage(msg) {
  const ch = msg.channel || "unknown";
  if (!chatHistory[ch]) chatHistory[ch] = [];
  chatHistory[ch].push(msg);
  if (chatHistory[ch].length > MAX_HISTORY) chatHistory[ch].shift();
  eventBus.emit("message", msg);
}

function getHistory(channel, limit = 100) {
  if (channel) return (chatHistory[channel] || []).slice(-limit);
  // Merge all channels sorted by timestamp
  const all = Object.values(chatHistory).flat();
  all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return all.slice(-limit);
}

function register(socket) {
  socket.on("user", (data) => {
    logger.info(`Usuario autenticado: ${data?.username} (rank: ${data?.rank})`);
    eventBus.emit("user", data);
  });

  socket.on("channels", (data) => {
    const channels = Array.isArray(data) ? data : [];
    logger.info(`Canais disponiveis: ${channels.map((c) => c.alias).join(", ")}`);
    eventBus.emit("channels", channels);
  });

  socket.on("joined:silent", (data) => {
    logger.debug(`Joined silently: ${data?.channel}`);
  });

  // Main message event — Bitsler sends chat messages via this event name
  socket.onAny((event, ...args) => {
    const data = args[0];
    if (!data || typeof data !== "object") return;

    // Detect rain events in system channel
    if (data.type === "rain" || (data.system === true && data.type === "say")) {
      rainMonitor.handle(data);
    }

    // Detect Chat Rain / Drizzle bot messages in system channel
    const rainBots = ["Chat Rain", "Drizzle Bot", "Drizzle"];
    const tipBots = ["Tip Bot", "Tip"];
    if (rainBots.includes(data.username)) {
      rainMonitor.handle({ ...data, _event: event });
    }

    // Store messages from public channels
    const publicChannels = ["en", "br", "fr", "in", "id", "ph", "ru", "es", "pk", "rs", "system"];
    if (data.channel && publicChannels.includes(data.channel)) {
      pushMessage({ ...data, _event: event, _receivedAt: Date.now() });
    }

    // Log tip bot activity
    if (tipBots.includes(data.username)) {
      logger.info(`[TIP] ${JSON.stringify(data)}`);
      eventBus.emit("tip", data);
    }
  });
}

module.exports = { register, getHistory, pushMessage };
