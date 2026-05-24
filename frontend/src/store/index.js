import { create } from "zustand";

export const useStore = create((set, get) => ({
  connected: false,
  uptime: 0,
  user: null,
  channels: [],
  messages: [],
  rainEvents: [],
  lastRain: null,
  rainsToday: 0,
  autoMsgStats: {},
  sseConnected: false,
  rainAlert: null,
  pendingMessages: [],
  triviaEvents: [],
  triviaActive: false,
  rainActivity: [],
  rainIntel: { score: 5, senders: [], hourPattern: new Array(24).fill(0) },

  setConnected: (v) => set({ connected: v }),
  setUser: (u) => set({ user: u }),
  setChannels: (c) => set({ channels: c }),
  setUptime: (u) => set({ uptime: u }),
  setSseConnected: (v) => set({ sseConnected: v }),

  addMessage: (msg) =>
    set((s) => {
      const msgs = [...s.messages, msg].slice(-500);
      return { messages: msgs };
    }),

  prependHistory: (history) =>
    set((s) => {
      // history já vem em ordem cronológica — vai antes das mensagens live
      const existing = new Set(s.messages.map((m) => m.mid || m._receivedAt));
      const fresh = history.filter((m) => !existing.has(m.mid || m._receivedAt));
      return { messages: [...fresh, ...s.messages].slice(-500) };
    }),

  addRainEvent: (event) =>
    set((s) => {
      const events = [event, ...s.rainEvents].slice(0, 100);
      return {
        rainEvents: events,
        lastRain: event,
        rainsToday: s.rainsToday + 1,
        rainAlert: event,
      };
    }),

  clearRainAlert: () => set({ rainAlert: null }),
  setAutoMsgStats: (stats) => set({ autoMsgStats: stats }),
  setPendingMessages: (msgs) => set({ pendingMessages: msgs }),

  addTriviaEvent: (event) =>
    set((s) => ({
      triviaEvents: [event, ...s.triviaEvents].slice(0, 50),
      triviaActive: event.type === "hint",
    })),

  addRainActivity: (evt) =>
    set((s) => ({
      rainActivity: [{ ...evt, ts: Date.now() }, ...s.rainActivity].slice(0, 30),
    })),

  setRainIntel: (data) => set({ rainIntel: data }),

  handlePendingEvent: (event) =>
    set((s) => {
      if (event.type === "added") {
        return { pendingMessages: [...s.pendingMessages, event.item] };
      }
      if (event.type === "approved" || event.type === "rejected" || event.type === "expired") {
        return { pendingMessages: s.pendingMessages.filter((m) => m.id !== event.id) };
      }
      if (event.type === "cleared") {
        return { pendingMessages: [] };
      }
      return {};
    }),
}));
