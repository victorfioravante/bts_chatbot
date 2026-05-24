import { useRef, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "../store";
import { Settings2, Send, Gamepad2, Trophy, RefreshCw } from "lucide-react";

const API = "/api/v1";

function TriviaBanner({ triviaEvents }) {
  const [customAnswer, setCustomAnswer] = useState("");
  const [sent, setSent] = useState(null);

  const last = triviaEvents[0];
  if (!last || (last.type !== "hint" && last.type !== "gameOver")) return null;

  const sendAnswer = (word, channel) => {
    fetch(`${API}/say`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: channel || "en", message: word }),
    })
      .then((r) => r.json())
      .then((d) => {
        setSent({ word, ok: d.ok });
        setTimeout(() => setSent(null), 4000);
      });
  };

  if (last.type === "gameOver") {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 flex items-center gap-3 text-sm">
        <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
        <span className="text-gray-400">Jogo encerrado —</span>
        <span className="text-yellow-300 font-mono font-bold">{last.answer}</span>
        {last.added && <span className="text-green-400 text-xs">✓ salva</span>}
      </div>
    );
  }

  return (
    <div className="bg-amber-950 border border-amber-700 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Gamepad2 className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="font-mono text-lg text-white tracking-widest">{last.hintRaw}</span>
        <span className="ml-auto text-xs text-amber-600">canal: {last.channel}</span>
      </div>

      {/* Sugestões com botão de envio */}
      {last.suggestions?.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {last.suggestions.map((w) => (
            <button
              key={w}
              onClick={() => sendAnswer(w, last.channel)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono font-bold border transition-colors ${
                sent?.word === w
                  ? sent.ok ? "bg-green-800 border-green-600 text-green-200" : "bg-red-900 border-red-700 text-red-200"
                  : "bg-amber-900 border-amber-700 text-amber-100 hover:bg-amber-800"
              }`}
            >
              {sent?.word === w ? (sent.ok ? "✓ Enviado" : "✗ Falhou") : (
                <><Send className="w-3 h-3" /> {w}</>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-600">Sem sugestões no banco para esse padrão.</p>
      )}

      {/* Resposta manual */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customAnswer}
          onChange={(e) => setCustomAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customAnswer.trim()) {
              sendAnswer(customAnswer.trim(), last.channel);
              setCustomAnswer("");
            }
          }}
          placeholder="Resposta manual (Enter para enviar)..."
          className="flex-1 bg-gray-900 border border-amber-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder-amber-900 font-mono"
        />
        <button
          onClick={() => { if (customAnswer.trim()) { sendAnswer(customAnswer.trim(), last.channel); setCustomAnswer(""); }}}
          className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-sm flex items-center gap-1"
        >
          <Send className="w-3 h-3" /> Enviar
        </button>
      </div>
    </div>
  );
}

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
  const { messages, triviaEvents } = useStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("todos");
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);

  // Chat input state
  const [chatMsg, setChatMsg] = useState("");
  const [chatChannel, setChatChannel] = useState(null);
  const [chatFeedback, setChatFeedback] = useState(null); // { ok, text }
  const [top100Feedback, setTop100Feedback] = useState(null);

  const { data: cfg } = useQuery({
    queryKey: ["config"],
    queryFn: () => fetch("/api/v1/config").then((r) => r.json()),
  });

  const activeChannels = new Set(cfg?.channels?.autoJoin || ["en", "br", "system"]);
  const activeChannelList = [...activeChannels].filter((c) => c !== "system").sort();

  // Default chatChannel to first active (non-system) channel when config loads
  useEffect(() => {
    if (!chatChannel && activeChannelList.length > 0) {
      setChatChannel(activeChannelList[0]);
    }
  }, [activeChannelList.join(",")]); // eslint-disable-line

  // Trivia toggle query
  const { data: triviaStatus } = useQuery({
    queryKey: ["trivia-status"],
    queryFn: () => fetch("/api/v1/trivia/status").then((r) => r.json()),
    refetchInterval: 10000,
  });

  const triviaToggle = useMutation({
    mutationFn: (enable) =>
      fetch(`/api/v1/trivia/${enable ? "enable" : "disable"}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries(["trivia-status"]),
  });

  const sendChatMsg = () => {
    const msg = chatMsg.trim();
    const ch = chatChannel || activeChannelList[0] || "en";
    if (!msg || !ch) return;
    fetch("/api/v1/say", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: ch, message: msg }),
    })
      .then((r) => r.json())
      .then((d) => {
        setChatMsg("");
        setChatFeedback({ ok: d.ok, text: d.ok ? "Enviado!" : "Falhou" });
        setTimeout(() => setChatFeedback(null), 3000);
      })
      .catch(() => {
        setChatFeedback({ ok: false, text: "Erro ao enviar" });
        setTimeout(() => setChatFeedback(null), 3000);
      });
  };

  const refreshTop100 = () => {
    setTop100Feedback({ loading: true, text: "Atualizando..." });
    fetch("/api/v1/trivia/top100/refresh", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setTop100Feedback({ ok: true, text: `✓ ${d.count} moedas` });
        } else {
          setTop100Feedback({ ok: false, text: d.error || "Erro" });
        }
        setTimeout(() => setTop100Feedback(null), 4000);
      })
      .catch(() => {
        setTop100Feedback({ ok: false, text: "Erro" });
        setTimeout(() => setTop100Feedback(null), 4000);
      });
  };

  const saveChannels = useMutation({
    mutationFn: (channels) =>
      fetch("/api/v1/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: { autoJoin: channels } }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries(["config"]),
  });

  const joinChannel = (ch) => {
    fetch("/api/v1/join", {
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
    if (selectedChannel !== "todos" && m.channel !== selectedChannel) return false;
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
            placeholder="Filtrar mensagem..."
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
          {/* Trivia toggle */}
          <button
            onClick={() => triviaToggle.mutate(!triviaStatus?.enabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              triviaStatus?.enabled
                ? "bg-green-800 border-green-600 text-green-200 hover:bg-green-700"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
            }`}
            title={triviaStatus?.enabled ? "Trivia ativo — clique para desativar" : "Trivia inativo — clique para ativar"}
          >
            🎮 Trivia {triviaStatus?.enabled ? "ON" : "OFF"}
          </button>

          {/* Top 100 refresh */}
          <button
            onClick={refreshTop100}
            disabled={top100Feedback?.loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              top100Feedback?.ok === true
                ? "bg-green-800 border-green-600 text-green-200"
                : top100Feedback?.ok === false
                ? "bg-red-900 border-red-700 text-red-200"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
            }`}
            title="Atualizar Top 100 moedas do CoinMarketCap"
          >
            <RefreshCw className={`w-3 h-3 ${top100Feedback?.loading ? "animate-spin" : ""}`} />
            {top100Feedback ? top100Feedback.text : "Top 100"}
          </button>

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

      {/* Channel tabs */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setSelectedChannel("todos")}
          className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border transition-colors ${
            selectedChannel === "todos"
              ? "bg-gray-600 border-gray-400 text-white"
              : "bg-gray-900 border-gray-700 text-gray-400 hover:text-white"
          }`}
        >
          Todos
        </button>
        {[...activeChannels].sort().map((ch) => (
          <button
            key={ch}
            onClick={() => setSelectedChannel(ch)}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border transition-colors ${
              selectedChannel === ch
                ? `${CHANNEL_BADGE[ch] || "bg-gray-600 border-gray-400 text-white"}`
                : "bg-gray-900 border-gray-700 text-gray-400 hover:text-white"
            }`}
          >
            {ch}
          </button>
        ))}
      </div>

      {/* Room picker */}
      {showRoomPicker && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 mb-2">Salas monitoradas (auto-join na conexão)</p>
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

      {/* Trivia banner */}
      <TriviaBanner triviaEvents={triviaEvents} />

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

      {/* Chat input bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-2">
        {/* Channel selector */}
        <select
          value={chatChannel || ""}
          onChange={(e) => setChatChannel(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white font-mono shrink-0 focus:outline-none focus:border-blue-500"
        >
          {activeChannelList.length === 0 ? (
            <option value="en">en</option>
          ) : (
            activeChannelList.map((ch) => (
              <option key={ch} value={ch}>{ch}</option>
            ))
          )}
        </select>

        {/* Message input */}
        <input
          type="text"
          value={chatMsg}
          onChange={(e) => setChatMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendChatMsg(); }}
          placeholder="Digite uma mensagem para enviar ao chat..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />

        {/* Feedback */}
        {chatFeedback && (
          <span className={`text-xs shrink-0 ${chatFeedback.ok ? "text-green-400" : "text-red-400"}`}>
            {chatFeedback.text}
          </span>
        )}

        {/* Send button */}
        <button
          onClick={sendChatMsg}
          disabled={!chatMsg.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm transition-colors shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          Enviar
        </button>
      </div>
    </div>
  );
}
