/**
 * Pending Queue — segura mensagens aguardando aprovação manual.
 * Ativado quando config.autoMessage.approvalMode === true.
 */

const eventBus = require("../eventBus");
const logger = require("./logger");
const socketClient = require("../socket/client");

const queue = new Map(); // id → item
const EXPIRY_MS = 15 * 60 * 1000; // 15 min sem aprovação → descarta

let stats = { approved: 0, rejected: 0, expired: 0 };

function add({ channel, message, profile }) {
  const id = `pq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item = {
    id,
    channel,
    message,
    profile,
    createdAt: Date.now(),
    expiresAt: Date.now() + EXPIRY_MS,
  };

  queue.set(id, item);
  logger.info(`[Queue] Pendente: [${channel}] "${message}" (perfil: ${profile})`);
  eventBus.emit("pendingMessage", { type: "added", item });

  // Auto-expirar
  setTimeout(() => {
    if (queue.has(id)) {
      queue.delete(id);
      stats.expired++;
      logger.warn(`[Queue] Expirou: ${id}`);
      eventBus.emit("pendingMessage", { type: "expired", id });
    }
  }, EXPIRY_MS);

  return item;
}

function approve(id) {
  const item = queue.get(id);
  if (!item) return null;

  const sent = socketClient.emit("say", { channel: item.channel, message: item.message });
  queue.delete(id);
  stats.approved++;

  if (sent) {
    logger.info(`[Queue] Aprovado e enviado: [${item.channel}] "${item.message}"`);
    eventBus.emit("autoMessageSent", {
      channel: item.channel,
      message: item.message,
      profile: item.profile,
      timestamp: Date.now(),
    });
  } else {
    logger.warn(`[Queue] Aprovado mas socket desconectado: ${id}`);
  }

  eventBus.emit("pendingMessage", { type: "approved", id, sent });
  return { item, sent };
}

function reject(id) {
  const item = queue.get(id);
  if (!item) return null;
  queue.delete(id);
  stats.rejected++;
  logger.info(`[Queue] Rejeitado: ${id}`);
  eventBus.emit("pendingMessage", { type: "rejected", id });
  return item;
}

function list() {
  return Array.from(queue.values()).sort((a, b) => a.createdAt - b.createdAt);
}

function clear() {
  const count = queue.size;
  queue.clear();
  eventBus.emit("pendingMessage", { type: "cleared" });
  return count;
}

function getStats() {
  return { ...stats, pending: queue.size };
}

module.exports = { add, approve, reject, list, clear, getStats };
