const logger = require("../modules/logger");
const rainMonitor = require("../modules/rainMonitor");
const triviaDetector = require("../modules/triviaDetector");
const eventBus = require("../eventBus");

// In-memory chat history per channel
const chatHistory = {};

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")   // remove tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
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
  const all = Object.values(chatHistory).flat();
  all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return all.slice(-limit);
}

function deleteMessage(mid) {
  for (const ch of Object.keys(chatHistory)) {
    chatHistory[ch] = chatHistory[ch].filter((m) => m.mid !== mid);
  }
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

  socket.on("chat:error", (data) => {
    logger.error(`[CHAT-ERROR] ${JSON.stringify(data)}`);
  });

  // Mensagens em tempo real chegam no evento "msg"
  const publicChannels = ["en", "br", "fr", "in", "id", "ph", "ru", "es", "pk", "rs", "system"];
  socket.on("msg", (data) => {
    if (!data || typeof data !== "object") return;
    const channel = data.channelName || data.channel;
    if (!channel || !publicChannels.includes(channel)) return;

    logger.info(`[MSG] [${channel}] ${data.username}: ${(data.message || "").slice(0, 100)}`);

    const stored = {
      username: data.username,
      channel,
      message: data.message || "",
      mid: data.mid,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      type: data.type,
      bot: data.bot,
      _event: "msg",
      _receivedAt: Date.now(),
    };

    // Detecta rain: bots conhecidos OU qualquer msg do canal system mencionando rain
    const rainBots = ["Chat Rain", "Drizzle Bot", "Drizzle"];
    if (rainBots.includes(data.username) || channel === "system") {
      rainMonitor.handle({ ...stored, comment: data.message });
    }

    pushMessage(stored);
    triviaDetector.analyze(stored);

    if (["Tip Bot", "Tip"].includes(data.username)) {
      logger.info(`[TIP] ${JSON.stringify(data)}`);
      eventBus.emit("tip", data);
    }
  });

  // msg:rain — evento dedicado (mais confiável que checar data.type no onAny)
  socket.on("msg:rain", (data) => {
    if (!data || typeof data !== "object") return;
    rainMonitor.handle(data);
    const rainText = data.message || (data.from ? `Chat Rain from ${data.from}` : "Chat Rain");
    pushMessage({
      username: data.username || "Chat Rain",
      channel: "system",
      message: rainText,
      mid: data.mid,
      type: "rain",
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      _event: "msg:rain",
      _receivedAt: Date.now(),
      initiator: data.from || null,
      currency: data.currency,
      amount: data.amount,
      recipients: Array.isArray(data.users) ? data.users.length : undefined,
    });
  });

  // rained:receiver — conta do bot recebeu chuva de outro usuário
  socket.on("rained:receiver", (data) => {
    if (!data) return;
    logger.info(`[Rain] Bot recebeu chuva de ${data.sender}: ${data.currency} ${data.amount}`);
    eventBus.emit("rainActivity", {
      type: "received",
      sender: data.sender,
      currency: data.currency,
      amount: parseFloat(data.amount) || 0,
      timestamp: Date.now(),
    });
  });

  // rained:sender — confirmação de que o bot enviou chuva com sucesso
  socket.on("rained:sender", (data) => {
    if (!data) return;
    logger.info(`[Rain] Bot enviou chuva: ${data.currency} ${data.amount}`);
    eventBus.emit("rainActivity", {
      type: "sent",
      currency: data.currency,
      amount: parseFloat(data.amount) || 0,
      timestamp: Date.now(),
    });
  });

  // delete — mensagem removida por moderador: limpa histórico e avisa frontend
  socket.on("delete", (mid) => {
    if (!mid) return;
    logger.info(`[Chat] Mensagem deletada: mid=${mid}`);
    deleteMessage(mid);
    eventBus.emit("messageDeleted", { mid });
  });

  // Eventos de sistema via onAny (apenas history no join e logs)
  socket.onAny((event, ...args) => {
    if (["msg", "msg:rain", "rained:receiver", "rained:sender", "delete"].includes(event)) return;
    const data = args[0];
    if (!data || typeof data !== "object") return;

    // History no join: array de msgs antigas
    const ch = data.channel || data.channelName;
    if (ch && publicChannels.includes(ch) && Array.isArray(data.history)) {
      for (const item of data.history) {
        const text = stripHtml(item.message || "");
        if (!text) continue;
        const stored = {
          username: item.username || data.username,
          channel: ch,
          message: text,
          mid: item.mid,
          timestamp: item.timestamp || Math.floor(Date.now() / 1000),
          _event: event,
          _receivedAt: Date.now(),
        };
        pushMessage(stored);
      }
    }
  });
}

module.exports = { register, getHistory, pushMessage };
