import { useRef, useEffect, useState } from "react";
import { useStore } from "../store";

const CHANNEL_COLORS = {
  en: "text-blue-400",
  br: "text-green-400",
  system: "text-yellow-400",
  fr: "text-purple-400",
};

export default function Monitor() {
  const { messages } = useStore();
  const [filter, setFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  const channels = ["all", ...new Set(messages.map((m) => m.channel).filter(Boolean))];

  const filtered = messages.filter((m) => {
    const matchChannel = channelFilter === "all" || m.channel === channelFilter;
    const matchText =
      !filter ||
      (m.message || m.comment || "").toLowerCase().includes(filter.toLowerCase()) ||
      (m.username || "").toLowerCase().includes(filter.toLowerCase());
    return matchChannel && matchText;
  });

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Monitor de Chat</h1>
        <div className="flex gap-2 ml-auto">
          <input
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 w-48"
            placeholder="Filtrar mensagem..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
          >
            {channels.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "Todos" : c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
        </div>
      </div>

      <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl overflow-y-auto p-3 space-y-1 font-mono text-sm">
        {filtered.length === 0 ? (
          <p className="text-gray-600 p-2">Aguardando mensagens...</p>
        ) : (
          filtered.map((msg, i) => {
            const text = msg.message || msg.comment || "";
            const isRain = msg.type === "rain" || ["Chat Rain", "Drizzle Bot", "Drizzle"].includes(msg.username);
            return (
              <div
                key={i}
                className={`flex gap-2 px-2 py-0.5 rounded ${isRain ? "bg-blue-950 border border-blue-800" : "hover:bg-gray-800"}`}
              >
                <span className={`shrink-0 font-semibold ${CHANNEL_COLORS[msg.channel] || "text-gray-400"}`}>
                  [{msg.channel || "?"}]
                </span>
                <span className="text-purple-300 shrink-0">{msg.username || "system"}:</span>
                <span className={`break-all ${isRain ? "text-blue-200 font-semibold" : "text-gray-200"}`}>
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
