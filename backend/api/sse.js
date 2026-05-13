const eventBus = require("../eventBus");

// Active SSE clients
const clients = new Set();

function sseMiddleware(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  clients.add(send);

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

module.exports = { sseMiddleware, broadcast };
