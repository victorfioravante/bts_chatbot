require("dotenv").config();
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "../data/config.json");

let _config = null;

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    _config = JSON.parse(raw);
  } catch {
    _config = getDefaults();
    save();
  }
  return _config;
}

function get() {
  if (!_config) load();
  return _config;
}

function update(partial) {
  if (!_config) load();
  _config = deepMerge(_config, partial);
  save();
  return _config;
}

function save() {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(_config, null, 2));
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function getDefaults() {
  return {
    connection: {
      autoConnect: true,
      reconnectDelay: Number(process.env.RECONNECT_DELAY_MS) || 5000,
      maxReconnectAttempts: Number(process.env.MAX_RECONNECT_ATTEMPTS) || 10,
    },
    channels: { autoJoin: ["en", "br", "system"], monitor: ["system", "en", "br"] },
    rainMonitor: { enabled: true, sound: true, nativeNotification: true, webhookUrl: "" },
    autoMessage: { enabled: true, profiles: [] },
    ui: { theme: "dark", language: "pt-BR", historyLimit: 200 },
  };
}

module.exports = { load, get, update, save };
