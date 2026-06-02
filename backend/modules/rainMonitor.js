const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const eventBus = require("../eventBus");

const DATA_FILE = path.join(__dirname, "../../data/rainHistory.json");

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

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (Array.isArray(raw)) {
      rainHistory.push(...raw.slice(-MAX_RAIN_HISTORY));
      lastRain = rainHistory[rainHistory.length - 1] || null;
      const todayTs = Math.floor(todayStart() / 1000);
      totalRainsToday = rainHistory.filter((e) => (e.timestamp || 0) >= todayTs).length;
      logger.info(`[RainMonitor] Histórico carregado: ${rainHistory.length} eventos (${totalRainsToday} hoje)`);
    }
  } catch {
    // arquivo ausente ou inválido — começa vazio
  }
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(rainHistory, null, 2));
  } catch (err) {
    logger.warn(`[RainMonitor] Erro ao salvar histórico: ${err.message}`);
  }
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
    `[RAIN] ${event.type} | ${event.currency} ${event.amount} | canal: ${event.channel || "system"} | de: ${event.initiator || event.username}`
  );

  save();
  eventBus.emit("rain", event);
}

// Known currencies on Bitsler
const CURRENCIES = ["btc", "eth", "ltc", "doge", "usdt", "bnb", "trx", "xrp", "bch", "sol", "matic", "ada", "dot", "shib", "avax", "link"];

// Patterns for system channel text-based rain announcements:
// "Chat Rain has rained 0.00001 BTC on 5 users in [en]"
// "[username] has rained 0.00001 BTC to 10 users"
// "Drizzle: 0.00001 BTC distributed to 5 users in [br]"
// "Rain of 0.00001 BTC by [username] to 5 users"
// "🌧 [username] started a rain of 0.00001 BTC for 5 users"
const TEXT_RAIN_PATTERNS = [
  // "X has rained 0.0001 BTC on/to N users [in channel]"
  /^(?<user>.+?)\s+has\s+rained?\s+(?<amount>[\d.]+)\s+(?<currency>[a-zA-Z]+)\s+(?:on|to)\s+(?<count>\d+)\s+users?/i,
  // "Rain of 0.0001 BTC by X to N users"
  /rain\s+of\s+(?<amount>[\d.]+)\s+(?<currency>[a-zA-Z]+)\s+by\s+(?<user>.+?)\s+(?:to|for)\s+(?<count>\d+)\s+users?/i,
  // "Drizzle: 0.0001 BTC distributed to N users"
  /drizzle[:\s]+(?<amount>[\d.]+)\s+(?<currency>[a-zA-Z]+)\s+distributed\s+to\s+(?<count>\d+)\s+users?/i,
  // "🌧 X started a rain of 0.0001 BTC for N users"
  /(?<user>.+?)\s+started\s+a\s+rain\s+of\s+(?<amount>[\d.]+)\s+(?<currency>[a-zA-Z]+)\s+for\s+(?<count>\d+)\s+users?/i,
  // Generic: "rain ... 0.0001 BTC" — extract what we can
  /rain[^.]*?(?<amount>[\d.]+)\s+(?<currency>[a-zA-Z]+)/i,
];

// Extract channel from "[en]", "(br)", etc.
function extractChannel(text) {
  const m = text.match(/[\[(]([a-z]{2})[\])]/i);
  return m ? m[1].toLowerCase() : null;
}

function parseTextRain(text, sourceChannel, username) {
  const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  for (const pattern of TEXT_RAIN_PATTERNS) {
    const m = clean.match(pattern);
    if (!m) continue;

    const g = m.groups || {};
    const currency = (g.currency || "").toLowerCase();

    // Only accept known currencies to avoid false positives
    if (currency && !CURRENCIES.includes(currency)) continue;

    const parsedUser = (g.user || username || "Chat Rain").trim();
    const parsedInitiator = !["Chat Rain", "Drizzle Bot", "Drizzle"].includes(parsedUser) ? parsedUser : null;
    return {
      type: "system-rain",
      username: parsedUser,
      initiator: parsedInitiator,
      currency: currency || "btc",
      amount: parseFloat(g.amount || 0),
      recipients: parseInt(g.count || 0, 10) || undefined,
      channel: extractChannel(clean) || sourceChannel || "system",
      comment: clean,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  return null;
}

function extractInitiator(text) {
  if (!text) return null;
  const clean = text.replace(/<[^>]+>/g, " ").trim();
  let m = clean.match(/^(\w+)\s+has\s+rained?/i);
  if (m) return m[1];
  m = clean.match(/rain\s+of\s+[\d.]+\s+\w+\s+by\s+(\w+)/i);
  if (m) return m[1];
  m = clean.match(/^(\w+)\s+started\s+a\s+rain/i);
  if (m) return m[1];
  return null;
}

function buildRainEvent(data) {
  // Explicit rain type event (msg:rain — Chat Rain enviado por humano)
  if (data.type === "rain") {
    const comment = data.comment || data.message || "";
    // data.from é o campo oficial do Bitsler com o iniciador humano
    const rawInitiator = data.from || extractInitiator(comment) || data.initiatedBy || null;
    const initiator = rawInitiator && !["Chat Rain", "Drizzle Bot", "Drizzle"].includes(rawInitiator)
      ? rawInitiator
      : null;
    return {
      type: "rain",
      username: data.username || "Chat Rain",
      initiator,
      currency: (data.currency || "btc").toLowerCase(),
      amount: data.amount || 0,
      recipients: Array.isArray(data.users) ? data.users.length : undefined,
      channel: data.channel || "system",
      comment,
      level: data.level,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      raw: data,
    };
  }

  // Drizzle bot announcement (structured)
  if (["Chat Rain", "Drizzle Bot", "Drizzle"].includes(data.username)) {
    // If there's a text message, try to parse it for more detail
    const text = data.comment || data.message || "";
    const parsed = text ? parseTextRain(text, data.channel, data.username) : null;
    return parsed || {
      type: "drizzle",
      username: data.username,
      currency: data.currency || "btc",
      amount: data.amount || 0,
      channel: data.channel || "system",
      comment: text,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      raw: data,
    };
  }

  // System channel text message — try to parse rain from the text
  if (data.channel === "system") {
    const text = data.message || data.comment || "";
    const lower = text.toLowerCase();
    if (!lower.includes("rain") && !lower.includes("drizzle")) return null;

    const parsed = parseTextRain(text, "system", data.username);
    if (parsed) return { ...parsed, raw: data };

    // Fallback: mention-only (no amount parsed) — still record it
    return {
      type: "system-rain",
      username: data.username || "system",
      currency: "unknown",
      amount: 0,
      channel: "system",
      comment: text,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      raw: data,
    };
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

// Carrega histórico persistido ao iniciar
load();

module.exports = { handle, getHistory, getStats };
