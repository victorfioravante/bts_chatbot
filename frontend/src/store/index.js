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

  setConnected: (v) => set({ connected: v }),
  setUser: (u) => set({ user: u }),
  setChannels: (c) => set({ channels: c }),
  setUptime: (u) => set({ uptime: u }),
  setSseConnected: (v) => set({ sseConnected: v }),

  addMessage: (msg) =>
    set((s) => {
      const msgs = [msg, ...s.messages].slice(0, 500);
      return { messages: msgs };
    }),

  prependHistory: (history) =>
    set((s) => {
      // history chega em ordem cronológica; coloca no final (mais antigos embaixo)
      const merged = [...s.messages, ...history]
        .filter((m, i, arr) => arr.findIndex((x) => x._receivedAt === m._receivedAt && x.username === m.username) === i)
        .slice(0, 500);
      return { messages: merged };
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
