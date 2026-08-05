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

const THEMES = ["crypto_terms", "top100_coins", "bitsler_terms", "casino_terms", "br_words"];

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
    clean[t] = [...new Set(data[t].map((w) => w.toLowerCase()))].sort((a, b) => a.localeCompare(b));
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
  const trimmed = word.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return null;
  if (!THEMES.includes(theme)) theme = "crypto_terms";

  const data = loadData();

  if (data[theme].includes(trimmed)) return null;

  data[theme].push(trimmed);
  saveData(data);
  logger.info(`[Trivia] Nova palavra adicionada: "${trimmed}" (tema: ${theme})`);
  eventBus.emit("triviaWordAdded", { word: trimmed, theme });
  return { word: trimmed, theme };
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

// Extrai sequência de 3+ tokens single-char/underscore separados por espaço dentro de qualquer texto
const HINT_EXTRACT_RE = /\b([A-Za-z_](?:\s+[A-Za-z_]){2,})\b/;
const GAME_OVER_RE    = /game\s*over/i;
// Captura answer mesmo com markdown bold/italic: **GAME OVER** *answer:* Token
const ANSWER_RE       = /answer[*:\s]+([a-zA-Z]+)/i;

// Mapeamento: palavra-chave no anúncio do Vvolfy → tema interno
// Ordem importa — mais específico primeiro
const THEME_KEYWORD_MAP = [
  { re: /bitsler/i,                     theme: "bitsler_terms"  },
  { re: /casino|gambling|slot/i,        theme: "casino_terms"   },
  { re: /coin|coins|cryptocurrency|altcoin/i, theme: "top100_coins" },
  { re: /blockchain|crypto|defi|nft/i,  theme: "crypto_terms"   },
];

// Detecta tema a partir do texto do anúncio de início do trivia
// Ex: "Guess the Bitsler term!" → "bitsler_terms"
const TRIVIA_START_RE = /guess\s+the\s+(\w[\w\s]{0,30}?)(?:\s*word|\s*term|\s*coin|\s*name|\s*crypto|\s*!|\s*$)/i;

function detectThemeFromText(text) {
  for (const { re, theme } of THEME_KEYWORD_MAP) {
    if (re.test(text)) return theme;
  }
  return null;
}

function extractHint(text) {
  const m = text.match(HINT_EXTRACT_RE);
  return m ? m[1].trim() : null;
}

// Canal BR usa sempre o tema br_words, independente do activeTheme global
function resolveTheme(channel) {
  return channel === "br" ? "br_words" : activeTheme;
}

// ���── Aprendizado passivo (sempre ativo, independente de triviaEnabled) ────────
// Detecta: início do jogo (auto-theme), GAME OVER (salva palavra nova)
function analyzePassive(msg) {
  const text = (msg.message || msg.comment || "").trim();
  if (!text) return;

  const isBR = msg.channel === "br";

  // GAME OVER → salva a palavra em qualquer canal (incluindo BR)
  if (GAME_OVER_RE.test(text)) {
    const answerMatch = text.match(ANSWER_RE);
    if (answerMatch) {
      const answer = answerMatch[1];
      const theme  = resolveTheme(msg.channel);
      const result = addWord(answer, theme);
      const event  = {
        type:      "gameOver",
        answer,
        theme,
        added:     !!result,
        channel:   msg.channel,
        timestamp: Date.now(),
      };
      logger.info(
        `[Trivia] Jogo encerrado. Resposta: "${answer}" tema: ${theme} ` +
        (result ? `(ADICIONADA ao banco)` : `(já existia)`)
      );
      eventBus.emit("triviaEvent", event);
      activeGame = null;
    }
    return;
  }

  if (isBR) return; // Detecção de tema automático só para canal EN

  // Detecção de início + identificação automática do tema
  const startMatch = text.match(TRIVIA_START_RE);
  if (startMatch) {
    const announced = startMatch[0]; // trecho completo do anúncio
    const detected  = detectThemeFromText(announced) || detectThemeFromText(text);
    if (detected && detected !== activeTheme) {
      const prev = activeTheme;
      activeTheme = detected;
      logger.info(`[Trivia] Tema detectado automaticamente: "${detected}" (era: "${prev}") — anúncio: "${text.slice(0,80)}"`);
      eventBus.emit("triviaEvent", {
        type:      "themeDetected",
        theme:     detected,
        prevTheme: prev,
        channel:   msg.channel,
        raw:       text.slice(0, 120),
        timestamp: Date.now(),
      });
    }
    if (!activeGame) {
      activeGame = { hint: null, suggestions: [], channel: msg.channel, startedAt: Date.now() };
    }
    logger.info(`[Trivia] Jogo detectado no canal ${msg.channel} (tema: ${activeTheme})`);
    return;
  }

}

function analyze(msg) {
  // Aprendizado passivo SEMPRE (tema + palavras novas)
  analyzePassive(msg);

  // Sugestões ativas só quando habilitado
  if (!triviaEnabled) return;

  const text = (msg.message || msg.comment || "").trim();
  if (!text) return;

  // GAME OVER já tratado no passivo — evita duplo processamento
  if (GAME_OVER_RE.test(text)) return;

  const theme  = resolveTheme(msg.channel);
  const hintRaw = extractHint(text);
  if (hintRaw) {
    const hint = parseHint(hintRaw);
    if (hint) {
      const channel = msg.channel || activeGame?.channel;
      if (!activeGame) activeGame = { hint: null, suggestions: [], channel, startedAt: Date.now() };
      const suggestions = matchWords(hint, theme);
      activeGame = { ...activeGame, hint, hintRaw, suggestions, channel };
      logger.info(`[Trivia] Dica: "${hintRaw}" tema: ${theme} → ${suggestions.length} sugestão(ões): ${suggestions.slice(0, 5).join(", ")}`);
      eventBus.emit("triviaEvent", {
        type: "hint",
        hintRaw,
        hint,
        suggestions,
        theme,
        channel,
        timestamp: Date.now(),
      });
    }
  }
}

// ─── Palavras PT-BR (FrequencyWords) ─────────────────────────────────────────

/**
 * Busca as palavras mais frequentes do português brasileiro.
 * Fonte: hermitdave/FrequencyWords (top 50k pt_BR, formato "palavra count")
 * Filtra: 4-8 letras, somente a-z após remover acentos, sem hífens/números.
 */
function fetchBRWords(limit = 5000) {
  return new Promise((resolve, reject) => {
    https.get(
      "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt_br/pt_br_50k.txt",
      { headers: { "User-Agent": "Mozilla/5.0" } },
      (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            // Mantém ç; remove demais diacríticos (á→a, ã→a, ô→o, etc.)
            const normalize = (s) =>
              s.normalize("NFD")
               .replace(/[̀-̨̦-ͯ]/g, "") // strip tudo exceto U+0327 (cedilha)
               .normalize("NFC")   // recompõe c + cedilha → ç
               .toLowerCase();

            const words = raw
              .split("\n")
              .map((line) => {
                const [word] = line.trim().split(" ");
                return word ? normalize(word) : null;
              })
              .filter((w) => w && /^[a-zç]{4,8}$/.test(w))
              .slice(0, limit);

            if (words.length === 0) return reject(new Error("Nenhuma palavra retornada"));

            const data = loadData();
            const existing = new Set(data.br_words);
            const newWords = words.filter((w) => !existing.has(w));
            data.br_words = [...existing, ...newWords];
            const saved = saveData(data);
            const total = saved.br_words.length;

            logger.info(`[Trivia] BR words: ${newWords.length} novas (total: ${total})`);
            resolve({ added: newWords.length, total });
          } catch (e) {
            reject(e);
          }
        });
      }
    ).on("error", reject);
  });
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
  fetchTop100Coins, fetchBRWords,
  THEMES,
};
