/**
 * AutoMessage — estratégia para maximizar elegibilidade de Chat Rain
 *
 * Regras da chuva que este módulo respeita:
 *  - Mensagem >= 10 caracteres
 *  - Enviada nos últimos 10 min (Rain) / 60 min (Drizzle)
 *  - Canal público (não game room, não mod room)
 *  - Sem bet tags
 *  - Não é comando de bot (!cv, etc.)
 *
 * Estratégia: enviar a cada 480–520 s (~8 min) para sempre
 * estar dentro da janela de 10 min de elegibilidade.
 */

const logger = require("./logger");
const eventBus = require("../eventBus");
const config = require("../config");
const socketClient = require("../socket/client");

// Canais válidos para envio (excluem game room e mod room)
const ALLOWED_CHANNELS = new Set(["en", "br", "fr", "in", "id", "ph", "ru", "es", "pk", "rs"]);

// Mínimo absoluto entre mensagens por canal (60 s — regra de segurança anti-ban)
const MIN_INTERVAL_MS = 60_000;

// Janela de elegibilidade Rain: 10 min. Enviamos com margem de 2 min.
const RAIN_WINDOW_MS = 10 * 60 * 1000;
const SEND_INTERVAL_DEFAULT_MIN = 480; // 8 min
const SEND_INTERVAL_DEFAULT_MAX = 520; // ~8 min 40 s

// Rastreia últimas mensagens enviadas por canal (para anti-repetição)
const lastSentByChannel = {};
// Rastreia a hora do último envio por canal
const lastSentTimeByChannel = {};
// Timers ativos por perfil
const timers = {};

let stats = { totalSent: 0, totalErrors: 0 };

// ─── Helpers ────────────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickMessage(profile) {
  const pool = profile.mensagens || [];
  if (!pool.length) return null;

  const lastN = (lastSentByChannel[profile.id] || []).slice(-3);

  // Tenta até 5 vezes pegar uma mensagem que não seja repetida
  for (let i = 0; i < 5; i++) {
    const msg = pool[Math.floor(Math.random() * pool.length)];
    if (!lastN.includes(msg)) return msg;
  }
  // Fallback: qualquer mensagem
  return pool[Math.floor(Math.random() * pool.length)];
}

function recordSent(profileId, message) {
  if (!lastSentByChannel[profileId]) lastSentByChannel[profileId] = [];
  lastSentByChannel[profileId].push(message);
  if (lastSentByChannel[profileId].length > 5) lastSentByChannel[profileId].shift();
}

function isWithinSchedule(profile) {
  const now = new Date();
  const [startH, startM] = (profile.horarioInicio || "00:00").split(":").map(Number);
  const [endH, endM] = (profile.horarioFim || "23:59").split(":").map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  if (startMin <= endMin) return nowMin >= startMin && nowMin <= endMin;
  // Atravessa meia-noite
  return nowMin >= startMin || nowMin <= endMin;
}

function validateMessage(msg) {
  if (!msg || typeof msg !== "string") return false;
  if (msg.trim().length < 10) return false;
  if (msg.startsWith("!")) return false; // comando de bot
  // Bet tags comuns — rejeita mensagens que contenham
  const betTags = [/#bet/i, /\[bet\]/i, /bet:/i];
  if (betTags.some((re) => re.test(msg))) return false;
  return true;
}

// ─── Core send logic ────────────────────────────────────────────────────────

function sendForProfile(profile) {
  const cfg = config.get();
  if (!cfg.autoMessage.enabled) return;
  if (!profile.ativo) return;
  if (!isWithinSchedule(profile)) return;

  const channels = (profile.canais || []).filter((ch) => ALLOWED_CHANNELS.has(ch));
  if (!channels.length) return;

  const message = pickMessage(profile);
  if (!validateMessage(message)) {
    logger.warn(`[AutoMsg] Mensagem invalida no perfil '${profile.nome}': "${message}"`);
    return;
  }

  for (const channel of channels) {
    const lastTime = lastSentTimeByChannel[channel] || 0;
    const elapsed = Date.now() - lastTime;

    if (elapsed < MIN_INTERVAL_MS) {
      logger.debug(`[AutoMsg] Cooldown ativo para canal '${channel}' (${Math.round(elapsed / 1000)}s)`);
      continue;
    }

    const sent = socketClient.emit("say", { channel, message });
    if (sent) {
      lastSentTimeByChannel[channel] = Date.now();
      recordSent(profile.id, message);
      stats.totalSent++;
      logger.info(`[AutoMsg] [${channel}] "${message}"`);
      eventBus.emit("autoMessageSent", {
        channel,
        message,
        profile: profile.nome,
        timestamp: Date.now(),
      });
    } else {
      stats.totalErrors++;
      logger.warn(`[AutoMsg] Falha ao enviar para '${channel}' — socket desconectado`);
    }
  }
}

// ─── Timer management ───────────────────────────────────────────────────────

function scheduleNext(profile) {
  if (timers[profile.id]) {
    clearTimeout(timers[profile.id]);
  }

  const minMs = (profile.intervaloMin ?? SEND_INTERVAL_DEFAULT_MIN) * 1000;
  const maxMs = (profile.intervaloMax ?? SEND_INTERVAL_DEFAULT_MAX) * 1000;
  const delay = randInt(minMs, maxMs);

  timers[profile.id] = setTimeout(() => {
    sendForProfile(profile);
    scheduleNext(profile);
  }, delay);

  logger.debug(`[AutoMsg] Perfil '${profile.nome}' — próximo envio em ${Math.round(delay / 1000)}s`);
}

function startProfile(profile) {
  if (!profile.ativo) return;
  logger.info(`[AutoMsg] Iniciando perfil '${profile.nome}' (canais: ${profile.canais.join(", ")})`);

  // Primeiro envio com delay curto (30–90 s) para garantir atividade imediata
  const initialDelay = randInt(30_000, 90_000);
  timers[profile.id] = setTimeout(() => {
    sendForProfile(profile);
    scheduleNext(profile);
  }, initialDelay);
}

function stopProfile(profileId) {
  if (timers[profileId]) {
    clearTimeout(timers[profileId]);
    delete timers[profileId];
  }
}

function startAll() {
  const cfg = config.get();
  if (!cfg.autoMessage.enabled) {
    logger.info("[AutoMsg] Modulo desativado nas configuracoes.");
    return;
  }

  stopAll();
  const profiles = cfg.autoMessage.profiles || [];
  profiles.forEach((p) => startProfile(p));
  logger.info(`[AutoMsg] ${profiles.filter((p) => p.ativo).length} perfis ativos.`);
}

function stopAll() {
  Object.keys(timers).forEach(stopProfile);
}

function reload() {
  startAll();
}

function getStats() {
  return {
    ...stats,
    activeProfiles: Object.keys(timers).length,
    lastSentByChannel: Object.fromEntries(
      Object.entries(lastSentTimeByChannel).map(([ch, ts]) => [ch, ts])
    ),
  };
}

// ─── Pausa durante Rain (opcional por perfil) ────────────────────────────────

eventBus.on("rain", (event) => {
  const cfg = config.get();
  const profiles = cfg.autoMessage.profiles || [];
  profiles.forEach((p) => {
    if (p.pausarDuranteRain && timers[p.id]) {
      // Aguarda 2 minutos após a chuva para retomar (não interfere na elegibilidade)
      stopProfile(p.id);
      logger.info(`[AutoMsg] Perfil '${p.nome}' pausado por 2 min apos Rain`);
      setTimeout(() => startProfile(p), 120_000);
    }
  });
});

module.exports = { startAll, stopAll, reload, startProfile, stopProfile, sendForProfile, getStats };
