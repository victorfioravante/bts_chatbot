const { EventEmitter } = require("events");

// Singleton event bus for intra-process communication
const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

module.exports = eventBus;
