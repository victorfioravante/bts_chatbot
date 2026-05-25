/**
 * Trivia Detector
 *
 * Monitors chat for Bitsler's "Guess the Crypto word" game.
 * - Detects the hint pattern (e.g. "A _ _ _") and suggests matching words
 * - Detects "GAME OVER / answer: X" and auto-adds the word to the active theme
 * - Supports multiple themes: crypto_terms, top100_coins, bitsler_terms, casino_terms
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const eventBus = require("../eventBus");
const logger = require("./logger");

const WORDS_PATH = path.join(__dirname, "../../data/triviaWords.json");

const THEMES = ["crypto_terms", "top100_coins", "bitsler_terms", "casino_terms"];

// ─── Word list ───────────────────────────────────────────────────────────────

function loadData() {
  try {
    const raw = JSON.parse(fs.readFileSync(WORDS_PATH, "utf-8"));
    // Ensure all theme keys exist
    const data = {};
    for (const t of THEMES) data[t] = raw[t] || [];
    return data;
  } catch {
    const data = {};
    for (const t of THEMES) data[t] = [];
    return data;
  }
}

function saveData(data) {
  const clean = {};
  for (const t of THEMES) {
    clean[t] = [...new Set(data[t])].sort((a, b) => a.localeCompare(b));
  }
  fs.writeFileSync(WORDS_PATH, JSON.stringify(clean, null, 2));
  return clean;
}

function loadWords(theme) {
  const data = loadData();
  if (theme && THEMES.includes(theme)) return data[theme];
  // Return flat list of all themes (for matching when theme unknown)
  return [...new Set(Object.values(data).flat())];
}

function addWord(word, theme = "crypto_terms") {
  const trimmed = word.trim();
  if (!trimmed || trimmed.length < 2) return null;
  if (!THEMES.includes(theme)) theme = "crypto_terms";

  const data = loadData();
  const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

  if (data[theme].some((w) => w.toLowerCase() === normalized.toLowerCase())) return null;

  data[theme].push(normalized);
  saveData(data);
  logger.info(`[Trivia] Nova palavra adicionada: "${normalized}" (tema: ${theme})`);
  eventBus.emit("triviaWordAdded", { word: normalized, theme });
  return { word: normalized, theme };
}

function removeWord(word, theme) {
  const data = loadData();
  let removed = false;
  const targets = theme && THEMES.includes(theme) ? [theme] : THEMES;
  for (const t of targets) {
    const before = data[t].length;
    data[t] = data[t].filter((w) => w.toLowerCase() !== word.toLowerCase());
    if (data[t].length < before) removed = true;
  }
  if (removed) saveData(data);
  return removed;
}

// ─── Pattern matching ────────────────────────────────────────────────────────

function parseHint(text) {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length < 2) return null;

  const known = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "_") continue;
    if (/^[a-zA-Z]$/.test(t)) {
      known.push({ index: i, char: t.toLowerCase() });
    } else {
      return null;
    }
  }

  if (known.length === 0) return null;
  return { length: tokens.length, known };
}

function matchWords(hint, theme) {
  if (!hint) return [];
  const words = loadWords(theme || null);
  return words.filter((w) => {
    if (w.length !== hint.length) return false;
    return hint.known.every(({ index, char }) => w[index]?.toLowerCase() === char);
  });
}

// ─── Trivia enable/disable state ────────────────────────────────────────────

let triviaEnabled = false;

function enableTrivia() { triviaEnabled = true; logger.info("[Trivia] Ativado"); }
function disableTrivia() { triviaEnabled = false; logger.info("[Trivia] Desativado"); }
function isTriviaEnabled() { return triviaEnabled; }

// ─── Active game state ───────────────────────────────────────────────────────

let activeGame = null;
let activeTheme = "crypto_terms"; // changes day-to-day via UI

function getActiveGame() {
  return activeGame ? { ...activeGame, theme: activeTheme } : null;
}

function setTheme(theme) {
  if (!THEMES.includes(theme)) return false;
  activeTheme = theme;
  logger.info(`[Trivia] Tema definido: ${theme}`);
  eventBus.emit("triviaThemeChanged", { theme });
  return true;
}

function getTheme() {
  return activeTheme;
}

// ─── Message analysis ────────────────────────────────────────────────────────

const TRIVIA_START_RE = /guess\s+the\s+(crypto|coin|bitsler|casino)/i;
// Extrai sequência de 3+ tokens single-char/underscore separados por espaço dentro de qualquer texto
const HINT_EXTRACT_RE = /\b([A-Za-z_](?:\s+[A-Za-z_]){2,})\b/;
const GAME_OVER_RE = /game\s*over/i;
// Captura answer mesmo com markdown bold/italic: **GAME OVER** *answer:* Token
const ANSWER_RE = /answer[*:\s]+([a-zA-Z]+)/i;

function extractHint(text) {
  const m = text.match(HINT_EXTRACT_RE);
  return m ? m[1].trim() : null;
}

function analyze(msg) {
  if (!triviaEnabled) return;
  const text = (msg.message || msg.comment || "").trim();
  if (!text) return;

  if (GAME_OVER_RE.test(text)) {
    const answerMatch = text.match(ANSWER_RE);
    if (answerMatch) {
      const answer = answerMatch[1];
      const result = addWord(answer, activeTheme);
      const event = {
        type: "gameOver",
        answer,
        theme: activeTheme,
        added: !!result,
        channel: msg.channel,
        timestamp: Date.now(),
      };
      logger.info(`[Trivia] Jogo encerrado. Resposta: "${answer}" tema: ${activeTheme} ${result ? "(adicionada)" : "(já existia)"}`);
      eventBus.emit("triviaEvent", event);
      activeGame = null;
    }
    return;
  }

  const hintRaw = extractHint(text);
  if (hintRaw) {
    const hint = parseHint(hintRaw);
    if (hint) {
      const channel = msg.channel || activeGame?.channel;
      if (!activeGame) activeGame = { hint: null, suggestions: [], channel, startedAt: Date.now() };
      const suggestions = matchWords(hint, activeTheme);
      activeGame = { ...activeGame, hint, hintRaw, suggestions, channel };
      logger.info(`[Trivia] Dica: "${hintRaw}" tema: ${activeTheme} → ${suggestions.length} sugestão(ões): ${suggestions.slice(0, 5).join(", ")}`);
      eventBus.emit("triviaEvent", {
        type: "hint",
        hintRaw,
        hint,
        suggestions,
        theme: activeTheme,
        channel,
        timestamp: Date.now(),
      });
      return;
    }
  }

  if (TRIVIA_START_RE.test(text)) {
    logger.info(`[Trivia] Jogo detectado no canal ${msg.channel}`);
    if (!activeGame) activeGame = { hint: null, suggestions: [], channel: msg.channel, startedAt: Date.now() };
  }
}

// ─── CoinMarketCap Top 100 fetch ─────────────────────────────────────────────

function fetchTop100Coins() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.coinmarketcap.com",
      path: "/data-api/v3/cryptocurrency/listing?start=1&limit=100&sortBy=market_cap&sortType=desc&convert=USD&cryptoType=all&tagType=all&audited=false&aux=name",
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const coins = (json?.data?.cryptoCurrencyList || [])
            .map((c) => c.name)
            .filter(Boolean);
          if (coins.length === 0) return reject(new Error("No coins returned"));
          const current = loadData();
          current.top100_coins = [...new Set(coins)].sort((a, b) => a.localeCompare(b));
          saveData(current);
          logger.info(`[Trivia] Top 100 atualizado: ${coins.length} moedas`);
          resolve(coins);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

module.exports = {
  analyze, addWord, removeWord, loadWords, loadData, saveData,
  parseHint, matchWords, getActiveGame, setTheme, getTheme,
  enableTrivia, disableTrivia, isTriviaEnabled,
  fetchTop100Coins,
  THEMES,
};
