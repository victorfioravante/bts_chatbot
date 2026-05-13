const logger = require("./logger");
const eventBus = require("../eventBus");

// In-memory rain history (last 100 events)
const rainHistory = [];
const MAX_RAIN_HISTORY = 100;

let lastRain = null;
let totalRainsToday = 0;
let dayStart = todayStart();

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function resetDailyIfNeeded() {
  if (Date.now() - dayStart > 86400000) {
    totalRainsToday = 0;
    dayStart = todayStart();
  }
}

function handle(data) {
  resetDailyIfNeeded();

  const event = buildRainEvent(data);
  if (!event) return;

  rainHistory.push(event);
  if (rainHistory.length > MAX_RAIN_HISTORY) rainHistory.shift();

  lastRain = event;
  totalRainsToday++;

  logger.info(
    `[RAIN] ${event.type} | ${event.currency} ${event.amount} | canal: ${event.channel || "system"} | de: ${event.username}`
  );

  eventBus.emit("rain", event);
}

function buildRainEvent(data) {
  // Explicit rain type event
  if (data.type === "rain") {
    return {
      type: "rain",
      username: data.username || "Chat Rain",
      currency: data.currency || "btc",
      amount: data.amount || 0,
      channel: data.channel || "system",
      comment: data.comment || "",
      level: data.level,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      raw: data,
    };
  }

  // Drizzle bot announcement
  if (["Chat Rain", "Drizzle Bot", "Drizzle"].includes(data.username)) {
    return {
      type: "drizzle",
      username: data.username,
      currency: data.currency || "btc",
      amount: data.amount || 0,
      channel: data.channel || "system",
      comment: data.comment || data.message || "",
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      raw: data,
    };
  }

  // System message that mentions rain
  if (data.system === true && data.type === "say") {
    const msg = (data.message || data.comment || "").toLowerCase();
    if (msg.includes("rain") || msg.includes("drizzle")) {
      return {
        type: "system-rain",
        username: data.username || "system",
        currency: data.currency || "unknown",
        amount: data.amount || 0,
        channel: data.channel || "system",
        comment: data.message || data.comment || "",
        timestamp: data.timestamp || Math.floor(Date.now() / 1000),
        raw: data,
      };
    }
  }

  return null;
}

function getHistory(limit = 50) {
  return rainHistory.slice(-limit);
}

function getStats() {
  resetDailyIfNeeded();
  return {
    lastRain,
    totalToday: totalRainsToday,
    history: rainHistory.slice(-10),
  };
}

module.exports = { handle, getHistory, getStats };
