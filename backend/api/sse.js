const eventBus = require("../eventBus");
const socketClient = require("../socket/client");

// Active SSE clients
const clients = new Set();

function sseMiddleware(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  clients.add(send);

  // Envia estado atual imediatamente para o novo cliente
  send("status", { connected: socketClient.isConnected(), uptime: socketClient.getUptime() });

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(send);
  });
}

function broadcast(event, data) {
  for (const send of clients) {
    try {
      send(event, data);
    } catch {
      clients.delete(send);
    }
  }
}

// Wire up global events to SSE
eventBus.on("status", (d) => broadcast("status", d));
eventBus.on("rain", (d) => broadcast("rain", d));
eventBus.on("tip", (d) => broadcast("tip", d));
eventBus.on("message", (d) => broadcast("message", d));
eventBus.on("autoMessageSent", (d) => broadcast("autoMessageSent", d));
eventBus.on("user", (d) => broadcast("user", d));
eventBus.on("channels", (d) => broadcast("channels", d));
eventBus.on("pendingMessage", (d) => broadcast("pendingMessage", d));
eventBus.on("triviaEvent", (d) => broadcast("triviaEvent", d));
eventBus.on("triviaWordAdded", (d) => broadcast("triviaWordAdded", d));
eventBus.on("triviaThemeChanged", (d) => broadcast("triviaThemeChanged", d));

module.exports = { sseMiddleware, broadcast };
