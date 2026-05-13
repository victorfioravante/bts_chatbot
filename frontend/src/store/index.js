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

  setConnected: (v) => set({ connected: v }),
  setUser: (u) => set({ user: u }),
  setChannels: (c) => set({ channels: c }),
  setUptime: (u) => set({ uptime: u }),
  setSseConnected: (v) => set({ sseConnected: v }),

  addMessage: (msg) =>
    set((s) => {
      const msgs = [msg, ...s.messages].slice(0, 200);
      return { messages: msgs };
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
}));
