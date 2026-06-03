const https   = require("https");
const logger   = require("./logger");
const eventBus = require("../eventBus");

// Moedas gratuitas/da casa na Bitsler (não têm valor real)
const HOUSE_COINS = new Set(["bitsler", "fun", "bsl", "free", "bonus"]);

const BET_REGEX = /#(\d{7,})/g;

// Cache em memória: betId → dados completos
// Compartilhado com routes.js via getBetCache() — evita busca dupla
const betCache = new Map();

/**
 * POST https://www.bitsler.com/api/bet
 * body: multipart/form-data  id=BETID  notoken=true
 *
 * Endpoint público (notoken=true bypassa autenticação).
 * Retorna: username, game, amount, currency, payout, profit, result, timestamp
 */
function fetchBetDetails(betId) {
  return new Promise((resolve) => {
    // Já em cache — não busca de novo
    if (betCache.has(betId)) {
      resolve(betCache.get(betId));
      return;
    }

    const boundary = "----BotFormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="id"`,
      ``,
      betId,
      `--${boundary}`,
      `Content-Disposition: form-data; name="notoken"`,
      ``,
      `true`,
      `--${boundary}--`,
    ].join("\r\n");

    const req = https.request(
      {
        hostname: "www.bitsler.com",
        path: "/api/bet",
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": Buffer.byteLength(body),
          Origin: "https://www.bitsler.com",
          Referer: `https://www.bitsler.com/bet/${betId}`,
        },
        timeout: 8000,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            const d = JSON.parse(raw);
            if (!d?.success) { resolve(null); return; }

            const currency    = (d.currency || "").toLowerCase();
            const amount      = parseFloat(d.amount || 0);
            const payout      = parseFloat(d.payout || 0);
            const profit      = parseFloat(d.profit || 0);
            const isHouseCoin = HOUSE_COINS.has(currency);
            const result      = profit > 0 ? "win" : "loss";

            const details = {
              betId,
              username:    d.username    || "",
              game:        d.game        || "",
              currency,
              amount,
              payout,
              profit,
              profit_usd:  parseFloat(d.profit_usd || 0),
              result,
              isHouseCoin,
              chance:      parseFloat(d.chance || 0),
              timestamp:   d.timestamp || Math.floor(Date.now() / 1000),
              auto:        !!d.auto,
            };

            betCache.set(betId, details);
            resolve(details);
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on("error",   () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

function getBetCache() {
  return betCache;
}

function onMessage(msg) {
  const text = msg.message || msg.comment || "";
  if (!text.includes("#")) return;

  BET_REGEX.lastIndex = 0;
  let m;
  while ((m = BET_REGEX.exec(text)) !== null) {
    const betId    = m[1];
    const username = msg.username;
    const channel  = msg.channel;

    eventBus.emit("bet", { username, betId, channel, ts: Date.now() });

    fetchBetDetails(betId).then((details) => {
      if (!details) return;
      eventBus.emit("betResolved", {
        username,
        betId,
        channel,
        ts: Date.now(),
        currency:    details.currency,
        amount:      details.amount,
        payout:      details.payout,
        profit:      details.profit,
        game:        details.game,
        isHouseCoin: details.isHouseCoin,
      });
      logger.info(
        `[BetTracker] #${betId} (${details.game}) ${details.currency} ${details.amount} → payout ${details.payout}x | ${details.result === "win" ? "✓" : "✗"} ${username}`
      );
    });
  }
}

function init() {
  eventBus.on("message", onMessage);
  logger.info("[BetTracker] Módulo iniciado.");
}

module.exports = { init, fetchBetDetails, getBetCache };
