const https  = require("https");
const logger  = require("./logger");
const eventBus = require("../eventBus");

// Moedas gratuitas/da casa na Bitsler (não têm valor real)
const HOUSE_COINS = new Set(["bitsler", "fun", "bsl", "free", "bonus"]);

const BET_REGEX = /#(\d{7,})/g;

function fetchBetDetails(betId) {
  return new Promise((resolve) => {
    const url = `https://www.bitsler.com/api/bets/${betId}`;
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        timeout: 8000,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            const body = JSON.parse(raw);
            const d = body?.data ?? body ?? {};
            resolve({
              currency:    (d.currency || d.coin || "").toLowerCase(),
              amount:      parseFloat(d.amount || d.win || 0),
              isHouseCoin: HOUSE_COINS.has((d.currency || d.coin || "").toLowerCase()),
            });
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function onMessage(msg) {
  const text = msg.message || msg.comment || "";
  if (!text.includes("#")) return;

  BET_REGEX.lastIndex = 0;
  let m;
  while ((m = BET_REGEX.exec(text)) !== null) {
    const betId   = m[1];
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
        isHouseCoin: details.isHouseCoin,
      });
      logger.debug(`[BetTracker] ${username} apostou #${betId} ${details.currency} ${details.amount} (${details.isHouseCoin ? "casa" : "real"})`);
    });
  }
}

function init() {
  eventBus.on("message", onMessage);
  logger.info("[BetTracker] Módulo iniciado.");
}

module.exports = { init };
