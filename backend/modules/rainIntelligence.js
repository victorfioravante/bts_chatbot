const fs   = require("fs");
const path = require("path");
const logger  = require("./logger");
const eventBus = require("../eventBus");

const DATA_FILE = path.join(__dirname, "../../data/rainIntelligence.json");

const ACTIVE_THRESHOLD_MS  = 5  * 60 * 1000; // 5 min = ativo agora
const WARM_THRESHOLD_MS    = 15 * 60 * 1000; // 15 min = ativo recente
const INACTIVE_NOTIFY_MS   = 10 * 60 * 1000; // reapareceu após 10min → emite evento

let _data = { senders: {}, hourPattern: new Array(24).fill(0) };

// ─── Persistência ─────────────────────────────────────────────────────────────

function load() {
  try {
    _data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!_data.senders) _data.senders = {};
    if (!Array.isArray(_data.hourPattern) || _data.hourPattern.length !== 24)
      _data.hourPattern = new Array(24).fill(0);
  } catch {
    _data = { senders: {}, hourPattern: new Array(24).fill(0) };
  }
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(_data, null, 2));
  } catch (err) {
    logger.warn(`[RainIntel] Erro ao salvar: ${err.message}`);
  }
}

// ─── Extração de initiator de mensagens de text-rain ─────────────────────────

function extractInitiator(text) {
  if (!text) return null;
  const clean = text.replace(/<[^>]+>/g, " ").trim();

  // "Chat Rain from Romerito @"  ← formato real do bot Bitsler
  let m = clean.match(/chat\s+rain\s+from\s+(\w+)/i);
  if (m) return m[1];

  // "X has rained ..."
  m = clean.match(/^(\w+)\s+has\s+rained?/i);
  if (m) return m[1];

  // "Rain of ... by X ..."
  m = clean.match(/rain\s+of\s+[\d.]+\s+\w+\s+by\s+(\w+)/i);
  if (m) return m[1];

  // "X started a rain ..."
  m = clean.match(/^(\w+)\s+started\s+a\s+rain/i);
  if (m) return m[1];

  return null;
}

// ─── Handlers de eventos ──────────────────────────────────────────────────────

function onRainEvent(event) {
  const hour = new Date().getHours();
  _data.hourPattern[hour] = (_data.hourPattern[hour] || 0) + 1;

  // Tenta extrair o usuário humano (não o bot "Chat Rain")
  let initiator = event.initiator || extractInitiator(event.comment || "") || null;
  if (initiator && ["Chat Rain", "Drizzle Bot", "Drizzle", "system"].includes(initiator)) {
    initiator = null;
  }

  if (initiator) {
    const s = _data.senders[initiator] || { rains: 0, lastRain: null, channels: {}, lastActive: null, manuallyAdded: false };
    s.rains++;
    s.lastRain = Math.floor(Date.now() / 1000);
    s.lastActive = Date.now();
    const ch = event.channel || "system";
    s.channels[ch] = (s.channels[ch] || 0) + 1;
    _data.senders[initiator] = s;
    logger.info(`[RainIntel] Rain registrado de ${initiator} (total: ${s.rains})`);
  }

  save();
}

function onMessageEvent(msg) {
  const username = msg.username;
  if (!username || !_data.senders[username]) return;

  const sender = _data.senders[username];
  const prevActive = sender.lastActive || 0;
  const wasInactive = Date.now() - prevActive > INACTIVE_NOTIFY_MS;

  sender.lastActive = Date.now();
  const ch = msg.channel;
  if (ch) sender.channels[ch] = (sender.channels[ch] || 0) + 1;

  if (wasInactive) {
    const channel = ch || Object.keys(sender.channels)[0] || "?";
    logger.info(`[RainIntel] Rainer ativo: ${username} no canal ${channel}`);
    eventBus.emit("rainActivity", { username, channel, ts: Date.now(), source: "chat" });
  }
}

function onBetResolvedEvent(bet) {
  const username = bet.username;
  if (!username || !_data.senders[username]) return;

  const sender = _data.senders[username];
  sender.lastActive   = Date.now();
  sender.lastBetTs    = Date.now();
  sender.lastBetReal  = !bet.isHouseCoin;
  sender.lastBetCurrency = bet.currency || null;
  sender.lastBetAmount   = bet.amount || 0;

  eventBus.emit("rainActivity", {
    username,
    channel: bet.channel || null,
    ts: Date.now(),
    source: "bet",
    isHouseCoin: bet.isHouseCoin,
    currency: bet.currency,
    amount: bet.amount,
  });
}

// ─── Score ───────────────────────────────────────────────────────────────────

function getScore() {
  load(); // garante dados frescos do disco
  const now = Date.now();
  let score = 5; // base

  for (const [, s] of Object.entries(_data.senders)) {
    if (s.rains < 2 && !s.manuallyAdded) continue;

    const weight = Math.min(Math.log(s.rains + 1) * 10, 25);
    const sinceActive = now - (s.lastActive || 0);
    const sinceBet    = now - (s.lastBetTs  || 0);

    if (s.lastBetTs && s.lastBetReal && sinceBet < ACTIVE_THRESHOLD_MS) {
      score += weight * 1.5; // apostando cripto real agora
    } else if (s.lastBetTs && !s.lastBetReal && sinceBet < ACTIVE_THRESHOLD_MS) {
      score += weight * 0.6; // apostando moeda da casa agora
    } else if (s.lastBetTs && !s.lastBetReal && sinceBet < WARM_THRESHOLD_MS) {
      score += weight * 0.3;
    } else if (sinceActive < ACTIVE_THRESHOLD_MS) {
      score += weight * 0.3; // apenas no chat
    } else if (sinceActive < WARM_THRESHOLD_MS) {
      score += weight * 0.15;
    }
  }

  // Bônus pelo padrão horário
  const hour = new Date().getHours();
  const maxPattern = Math.max(..._data.hourPattern, 1);
  const hourBonus = (_data.hourPattern[hour] / maxPattern) * 20;
  score += hourBonus;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── API pública ──────────────────────────────────────────────────────────────

function getSenders() {
  const now = Date.now();
  return Object.entries(_data.senders).map(([username, s]) => ({
    username,
    rains:         s.rains || 0,
    lastRain:      s.lastRain || null,
    lastActive:    s.lastActive || null,
    activeNow:     s.lastActive && now - s.lastActive < ACTIVE_THRESHOLD_MS,
    manuallyAdded: s.manuallyAdded || false,
    channels:      s.channels || {},
    lastBetReal:   s.lastBetReal || false,
    lastBetTs:     s.lastBetTs   || null,
    lastBetCurrency: s.lastBetCurrency || null,
    lastBetAmount:   s.lastBetAmount   || 0,
  })).sort((a, b) => b.rains - a.rains);
}

function getHourPattern() {
  return _data.hourPattern;
}

function addSender(username) {
  if (!username || typeof username !== "string") return false;
  if (_data.senders[username]) {
    _data.senders[username].manuallyAdded = true;
  } else {
    _data.senders[username] = { rains: 0, lastRain: null, channels: {}, lastActive: null, manuallyAdded: true };
  }
  save();
  return true;
}

function removeSender(username) {
  if (!_data.senders[username]) return false;
  delete _data.senders[username];
  save();
  return true;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  load();
  eventBus.on("rain",        onRainEvent);
  eventBus.on("message",     onMessageEvent);
  eventBus.on("betResolved", onBetResolvedEvent);
  logger.info("[RainIntel] Módulo iniciado.");
}

module.exports = { init, getScore, getSenders, getHourPattern, addSender, removeSender };
