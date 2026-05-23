const express = require("express");
const router = express.Router();
const socketClient = require("../socket/client");
const events = require("../socket/events");
const rainMonitor = require("../modules/rainMonitor");
const autoMessage = require("../modules/autoMessage");
const pendingQueue = require("../modules/pendingQueue");
const triviaDetector = require("../modules/triviaDetector");
const config = require("../config");
const { sseMiddleware } = require("./sse");
const auth = require("../auth");

// ─── Browser token bridge (Tampermonkey → backend) ──────────────────────────
// Recebe o socketToken extraído do window.__vue_store__ pelo script Tampermonkey.
// Não exige autenticação — só aceita de localhost (sem CORS para origens externas).
router.post("/socket-token", (req, res) => {
  const { token } = req.body || {};
  if (!token || typeof token !== "string" || token.length < 20) {
    return res.status(400).json({ error: "token inválido" });
  }
  const isNew = auth.setBrowserToken(token);
  if (isNew && !socketClient.isConnected()) {
    // Token novo e bot desconectado: tenta reconectar imediatamente
    setTimeout(() => socketClient.connect(), 500);
  }
  res.json({ ok: true, isNew });
});

// ─── Status ─────────────────────────────────────────────────────────────────

router.get("/status", (req, res) => {
  res.json({
    connected: socketClient.isConnected(),
    uptime: socketClient.getUptime(),
    version: "1.0.0",
  });
});

router.get("/channels", (req, res) => {
  const cfg = config.get();
  res.json(cfg.channels);
});

router.get("/history", (req, res) => {
  const { channel, limit = 100 } = req.query;
  res.json(events.getHistory(channel, Number(limit)));
});

router.get("/rain/history", (req, res) => {
  const { limit = 50 } = req.query;
  res.json(rainMonitor.getHistory(Number(limit)));
});

router.get("/rain/stats", (req, res) => {
  res.json(rainMonitor.getStats());
});

router.get("/automsg/stats", (req, res) => {
  res.json(autoMessage.getStats());
});

// ─── SSE ────────────────────────────────────────────────────────────────────

router.get("/sse", sseMiddleware);

// ─── Config ─────────────────────────────────────────────────────────────────

router.get("/config", (req, res) => {
  const cfg = { ...config.get() };
  res.json(cfg);
});

router.put("/config", (req, res) => {
  try {
    const updated = config.update(req.body);
    autoMessage.reload();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Connection ──────────────────────────────────────────────────────────────

router.post("/connect", (req, res) => {
  socketClient.connect();
  res.json({ ok: true });
});

router.post("/disconnect", (req, res) => {
  socketClient.disconnect();
  res.json({ ok: true });
});

router.post("/join", (req, res) => {
  const { channel } = req.body;
  if (!channel) return res.status(400).json({ error: "channel required" });
  const ok = socketClient.emit("join", { channel });
  res.json({ ok });
});

router.post("/say", (req, res) => {
  const { channel, message } = req.body;
  if (!channel || !message) return res.status(400).json({ error: "channel and message required" });
  const ok = socketClient.emit("say", { channel, message });
  res.json({ ok });
});

// ─── Auto-Message Profiles ───────────────────────────────────────────────────

router.get("/profiles", (req, res) => {
  const cfg = config.get();
  res.json(cfg.autoMessage.profiles || []);
});

router.post("/profiles", (req, res) => {
  const cfg = config.get();
  const profiles = cfg.autoMessage.profiles || [];
  const profile = {
    id: `profile-${Date.now()}`,
    nome: "Novo Perfil",
    canais: ["en"],
    mensagens: [],
    intervaloMin: 480,
    intervaloMax: 520,
    ativo: false,
    horarioInicio: "00:00",
    horarioFim: "23:59",
    pausarDuranteRain: false,
    ...req.body,
  };
  profiles.push(profile);
  config.update({ autoMessage: { profiles } });
  res.status(201).json(profile);
});

router.put("/profiles/:id", (req, res) => {
  const cfg = config.get();
  const profiles = cfg.autoMessage.profiles || [];
  const idx = profiles.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Perfil nao encontrado" });
  profiles[idx] = { ...profiles[idx], ...req.body, id: req.params.id };
  config.update({ autoMessage: { profiles } });
  autoMessage.reload();
  res.json(profiles[idx]);
});

router.delete("/profiles/:id", (req, res) => {
  const cfg = config.get();
  const profiles = (cfg.autoMessage.profiles || []).filter((p) => p.id !== req.params.id);
  config.update({ autoMessage: { profiles } });
  autoMessage.stopProfile(req.params.id);
  res.json({ ok: true });
});

router.post("/profiles/:id/toggle", (req, res) => {
  const cfg = config.get();
  const profiles = cfg.autoMessage.profiles || [];
  const idx = profiles.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Perfil nao encontrado" });
  profiles[idx].ativo = !profiles[idx].ativo;
  config.update({ autoMessage: { profiles } });
  if (profiles[idx].ativo) {
    autoMessage.startProfile(profiles[idx]);
  } else {
    autoMessage.stopProfile(profiles[idx].id);
  }
  res.json(profiles[idx]);
});

router.post("/profiles/:id/test", (req, res) => {
  const cfg = config.get();
  const profile = (cfg.autoMessage.profiles || []).find((p) => p.id === req.params.id);
  if (!profile) return res.status(404).json({ error: "Perfil nao encontrado" });
  autoMessage.sendForProfile(profile);
  res.json({ ok: true });
});

// ─── Pending Queue ────────────────────────────────────────────────────────────

router.get("/pending", (req, res) => {
  res.json(pendingQueue.list());
});

router.get("/pending/stats", (req, res) => {
  res.json(pendingQueue.getStats());
});

router.post("/pending/:id/approve", (req, res) => {
  const result = pendingQueue.approve(req.params.id);
  if (!result) return res.status(404).json({ error: "Item nao encontrado" });
  res.json({ ok: true, sent: result.sent });
});

router.post("/pending/:id/reject", (req, res) => {
  const item = pendingQueue.reject(req.params.id);
  if (!item) return res.status(404).json({ error: "Item nao encontrado" });
  res.json({ ok: true });
});

router.delete("/pending", (req, res) => {
  const count = pendingQueue.clear();
  res.json({ ok: true, cleared: count });
});

// ─── Trivia ───────────────────────────────────────────────────────────────────

router.get("/trivia/themes", (req, res) => {
  res.json({ themes: triviaDetector.THEMES, active: triviaDetector.getTheme() });
});

router.put("/trivia/theme", (req, res) => {
  const { theme } = req.body;
  if (!theme) return res.status(400).json({ error: "theme required" });
  const ok = triviaDetector.setTheme(theme);
  if (!ok) return res.status(400).json({ error: "Tema inválido" });
  res.json({ theme });
});

router.get("/trivia/words", (req, res) => {
  const { theme } = req.query;
  if (theme) {
    res.json(triviaDetector.loadWords(theme));
  } else {
    res.json(triviaDetector.loadData());
  }
});

router.post("/trivia/words", (req, res) => {
  const { word, theme } = req.body;
  if (!word) return res.status(400).json({ error: "word required" });
  const result = triviaDetector.addWord(word, theme);
  if (!result) return res.status(409).json({ error: "Palavra já existe neste tema" });
  res.status(201).json(result);
});

router.delete("/trivia/words/:word", (req, res) => {
  const { theme } = req.query;
  const removed = triviaDetector.removeWord(req.params.word, theme);
  if (!removed) return res.status(404).json({ error: "Palavra não encontrada" });
  res.json({ ok: true });
});

router.get("/trivia/game", (req, res) => {
  res.json(triviaDetector.getActiveGame() || { active: false });
});

router.post("/trivia/match", (req, res) => {
  const { hint, theme } = req.body;
  if (!hint) return res.status(400).json({ error: "hint required" });
  const parsed = triviaDetector.parseHint(hint);
  if (!parsed) return res.status(400).json({ error: "Padrão de dica inválido" });
  const matches = triviaDetector.matchWords(parsed, theme);
  res.json({ hint: parsed, matches });
});

module.exports = router;
