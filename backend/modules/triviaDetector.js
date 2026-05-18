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
// Aceita padrões como "A _ _ _" ou "B l _ _ k" com espaços entre cada caractere
const HINT_LINE_RE = /^[a-zA-Z_](\s+[a-zA-Z_]){1,}$/;
const GAME_OVER_RE = /game\s*over/i;
// Captura answer mesmo com markdown bold/italic: **GAME OVER** *answer:* Token
const ANSWER_RE = /answer[*:\s]+([a-zA-Z]+)/i;

function analyze(msg) {
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

  if (TRIVIA_START_RE.test(text)) {
    logger.info(`[Trivia] Jogo detectado no canal ${msg.channel}`);
    activeGame = { hint: null, suggestions: [], channel: msg.channel, startedAt: Date.now() };
    return;
  }

  if (activeGame && HINT_LINE_RE.test(text)) {
    const hint = parseHint(text);
    if (hint) {
      const suggestions = matchWords(hint, activeTheme);
      activeGame = { ...activeGame, hint, hintRaw: text, suggestions };
      logger.info(`[Trivia] Dica: "${text}" tema: ${activeTheme} → ${suggestions.length} sugestão(ões): ${suggestions.slice(0, 5).join(", ")}`);
      eventBus.emit("triviaEvent", {
        type: "hint",
        hintRaw: text,
        hint,
        suggestions,
        theme: activeTheme,
        channel: msg.channel,
        timestamp: Date.now(),
      });
    }
  }
}

module.exports = {
  analyze, addWord, removeWord, loadWords, loadData, saveData,
  parseHint, matchWords, getActiveGame, setTheme, getTheme,
  THEMES,
};
