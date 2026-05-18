import { useRef, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "../store";
import { Settings2 } from "lucide-react";

const ALL_CHANNELS = ["en", "br", "fr", "in", "id", "ph", "ru", "es", "pk", "rs", "system"];

const CHANNEL_COLORS = {
  en: "text-blue-400",
  br: "text-green-400",
  system: "text-yellow-400",
  fr: "text-purple-400",
  in: "text-orange-400",
  id: "text-pink-400",
  ph: "text-cyan-400",
  ru: "text-red-400",
  es: "text-lime-400",
  pk: "text-teal-400",
  rs: "text-violet-400",
};

const CHANNEL_BADGE = {
  en: "bg-blue-900 text-blue-200 border-blue-700",
  br: "bg-green-900 text-green-200 border-green-700",
  fr: "bg-purple-900 text-purple-200 border-purple-700",
  system: "bg-yellow-900 text-yellow-200 border-yellow-700",
};

export default function Monitor() {
  const { messages } = useStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);

  const { data: cfg } = useQuery({
    queryKey: ["config"],
    queryFn: () => fetch("http://localhost:3001/api/v1/config").then((r) => r.json()),
  });

  const activeChannels = new Set(cfg?.channels?.autoJoin || ["en", "br", "system"]);

  const saveChannels = useMutation({
    mutationFn: (channels) =>
      fetch("http://localhost:3001/api/v1/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: { autoJoin: channels } }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries(["config"]),
  });

  const joinChannel = (ch) => {
    fetch("http://localhost:3001/api/v1/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: ch }),
    });
  };

  const toggleChannel = (ch) => {
    const updated = activeChannels.has(ch)
      ? [...activeChannels].filter((c) => c !== ch)
      : [...activeChannels, ch];
    saveChannels.mutate(updated);
    if (!activeChannels.has(ch)) joinChannel(ch);
  };

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  const filtered = messages.filter((m) => {
    if (!filter) return true;
    return (
      (m.message || m.comment || "").toLowerCase().includes(filter.toLowerCase()) ||
      (m.username || "").toLowerCase().includes(filter.toLowerCase())
    );
  });

  return (
    <div className="flex flex-col h-full p-6 gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Monitor de Chat</h1>
        <div className="flex gap-2 ml-auto items-center flex-wrap">
          <input
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 w-44"
            placeholder="Filtrar..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
          <button
            onClick={() => setShowRoomPicker((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              showRoomPicker
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Salas
          </button>
        </div>
      </div>

      {/* Room picker */}
      {showRoomPicker && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 mb-2">Selecione as salas monitoradas (auto-join)</p>
          <div className="flex flex-wrap gap-2">
            {ALL_CHANNELS.map((ch) => {
              const on = activeChannels.has(ch);
              return (
                <button
                  key={ch}
                  onClick={() => toggleChannel(ch)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-mono font-medium border transition-colors ${
                    on
                      ? "bg-blue-700 border-blue-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {on ? "✓ " : ""}{ch}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-600">Alterações aplicadas imediatamente — o bot entra na sala na próxima reconexão se ainda não estiver.</p>
        </div>
      )}

      {/* Active channel badges */}
      <div className="flex gap-1.5 flex-wrap">
        {[...activeChannels].sort().map((ch) => (
          <span
            key={ch}
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${CHANNEL_BADGE[ch] || "bg-gray-800 text-gray-300 border-gray-700"}`}
          >
            {ch}
          </span>
        ))}
      </div>

      {/* Chat feed */}
      <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl overflow-y-auto p-3 space-y-0.5 font-mono text-sm">
        {filtered.length === 0 ? (
          <p className="text-gray-600 p-2">Aguardando mensagens...</p>
        ) : (
          filtered.map((msg, i) => {
            const text = msg.message || msg.comment || "";
            const isRain = msg.type === "rain" || ["Chat Rain", "Drizzle Bot", "Drizzle"].includes(msg.username);
            const isTrivia = /guess the crypto/i.test(text) || /game over/i.test(text);
            return (
              <div
                key={i}
                className={`flex gap-2 px-2 py-0.5 rounded ${
                  isRain
                    ? "bg-blue-950 border border-blue-800"
                    : isTrivia
                    ? "bg-amber-950 border border-amber-800"
                    : "hover:bg-gray-800"
                }`}
              >
                <span className={`shrink-0 font-semibold ${CHANNEL_COLORS[msg.channel] || "text-gray-400"}`}>
                  [{msg.channel || "?"}]
                </span>
                <span className="text-purple-300 shrink-0">{msg.username || "system"}:</span>
                <span className={`break-all ${isRain ? "text-blue-200 font-semibold" : isTrivia ? "text-amber-200" : "text-gray-200"}`}>
                  {text}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
