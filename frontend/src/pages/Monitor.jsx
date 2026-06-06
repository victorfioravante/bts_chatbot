import { useRef, useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "../store";
import { Settings2, Send, Gamepad2, Trophy, RefreshCw, ExternalLink } from "lucide-react";
import { ch } from "../lib/channelStyles";

const API = "/api/v1";

// ─── Bet badge ───────────────────────────────────────────────────────────────

const BET_RE = /#(\d{7,})(?:_(W|L|w|l))?/g;

// Bitsler deep-link: abre a página do jogo com o ID da bet
function betUrl(id) {
  return `https://www.bitsler.com/en/casino/games/dice?bet=${id}`;
}

function BetBadge({ betId, result, msgUsername, msgTimestamp }) {
  const [hovered, setHovered] = useState(false);
  const [details, setDetails] = useState(null);
  const [fetched, setFetched] = useState(false);

  const win  = result?.toUpperCase() === "W";
  const loss = result?.toUpperCase() === "L";

  // Busca detalhes do cache do backend ao hover (uma vez por badge)
  const onHover = useCallback(() => {
    setHovered(true);
    if (fetched) return;
    setFetched(true);
    fetch(`${API}/bets/${betId}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok && d.data) setDetails(d.data); })
      .catch(() => {});
  }, [betId, fetched]);

  const label = result ? `#${betId}_${result.toUpperCase()}` : `#${betId}`;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={onHover}
      onMouseLeave={() => setHovered(false)}
    >
      <a
        href={betUrl(betId)}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-mono font-bold border transition-colors cursor-pointer no-underline ${
          win
            ? "bg-green-900/40 border-green-700/60 text-green-300 hover:bg-green-800/50"
            : loss
            ? "bg-red-900/40 border-red-700/60 text-red-300 hover:bg-red-800/50"
            : "bg-muted border-border text-muted-foreground hover:bg-accent"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {win && <span className="text-green-400">✓</span>}
        {loss && <span className="text-red-400">✗</span>}
        {label}
        <ExternalLink className="w-2.5 h-2.5 opacity-50" />
      </a>

      {hovered && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-3 text-xs space-y-1.5 pointer-events-none" style={{background:"#111827"}}>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Aposta #{betId}</span>
            {result && (
              <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${win ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"}`}>
                {win ? "✓ GANHOU" : "✗ PERDEU"}
              </span>
            )}
          </div>
          {/* Usuário — prefere o da API (dono real da bet), fallback para quem postou */}
          <div className="flex justify-between text-muted-foreground">
            <span>Usuário</span>
            <span className="text-foreground font-medium">{details?.username || msgUsername || "—"}</span>
          </div>
          {details ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Jogo</span>
                <span className="text-foreground capitalize font-medium">{details.game || "—"}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Bet</span>
                <span className="text-foreground font-mono">{details.currency?.toUpperCase()} {details.amount}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Payout</span>
                <span className="text-foreground font-mono font-semibold">{details.payout}x</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Ganho</span>
                <span className={`font-mono font-bold ${details.profit > 0 ? "text-green-400" : "text-red-400"}`}>
                  {details.profit > 0 ? "+" : ""}{details.currency?.toUpperCase()} {Math.abs(details.profit).toFixed(8)}
                </span>
              </div>
              {details.rps != null && (
                <div className="flex justify-between text-muted-foreground border-t border-gray-700 pt-1.5">
                  <span>Velocidade</span>
                  <span className="font-mono font-semibold text-yellow-400">
                    {details.rps} rolls/s
                    <span className="text-gray-500 font-normal ml-1">
                      (~{Math.round(details.rps * 60)}/min)
                    </span>
                  </span>
                </div>
              )}
              {details.nonce != null && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Nonce</span>
                  <span className="font-mono text-gray-400">#{details.nonce.toLocaleString()}</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 italic text-[10px]">Buscando detalhes...</p>
          )}
          {msgTimestamp && (
            <div className="flex justify-between text-muted-foreground border-t border-gray-700 pt-1.5 mt-1">
              <span>Quando</span>
              <span>{new Date((msgTimestamp > 1e10 ? msgTimestamp : msgTimestamp * 1000)).toLocaleString("pt-BR")}</span>
            </div>
          )}
          <div className="border-t border-gray-700 pt-1.5">
            <span className="text-blue-400 flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Clique para abrir no Bitsler
            </span>
          </div>
        </div>
      )}
    </span>
  );
}

// ─── URL / GIF detection ─────────────────────────────────────────────────────

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;
// Sempre usar uma nova instância do regex para evitar lastIndex persistente
function matchUrls(text) { return text.match(/https?:\/\/[^\s<>"]+/g) || []; }

function extractGifSrc(url) {
  try {
    const u = new URL(url);
    if (u.pathname.toLowerCase().endsWith(".gif")) return url;
    if (u.hostname === "giphy.com" || u.hostname === "www.giphy.com") {
      const m = u.pathname.match(/\/gifs\/([^/?#]+)/);
      if (m) {
        const slug = m[1];
        const id = slug.includes("-") ? slug.split("-").pop() : slug;
        return `https://media.giphy.com/media/${id}/giphy.gif`;
      }
    }
    if (/^media\d*\.giphy\.com$/.test(u.hostname)) return url;
    return null;
  } catch {
    return null;
  }
}

// ─── Markdown + @mention renderer ───────────────────────────────────────────
// Transforma text → array de ReactNode com bold, italic, strikethrough, @mention e \n

function applyMarkdown(text, myUsername, keyBase) {
  let segments = [{ type: "text", content: text }];

  // split com grupo capturante: índices pares = texto, ímpares = conteúdo capturado
  function splitSegments(segs, re, wrapper) {
    return segs.flatMap((seg) => {
      if (seg.type !== "text") return [seg];
      const parts = seg.content.split(re);
      return parts.map((p, i) =>
        i % 2 === 1
          ? { type: "mark", wrapper, content: p }
          : { type: "text", content: p }
      );
    });
  }

  // **bold**
  segments = splitSegments(segments, /\*\*(.+?)\*\*/gs, "bold");
  // *italic* (não double-star)
  segments = splitSegments(segments, /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/gs, "italic");
  // ~~strike~~
  segments = splitSegments(segments, /~~(.+?)~~/gs, "strike");

  return segments.flatMap((seg, si) => {
    const key = `${keyBase}-${si}`;
    if (seg.type === "mark") {
      const inner = applyMentionAndNewline(seg.content, myUsername, key);
      if (seg.wrapper === "bold")   return [<strong key={key}>{inner}</strong>];
      if (seg.wrapper === "italic") return [<em key={key}>{inner}</em>];
      if (seg.wrapper === "strike") return [<del key={key}>{inner}</del>];
    }
    return applyMentionAndNewline(seg.content, myUsername, key);
  });
}

function applyMentionAndNewline(text, myUsername, keyBase) {
  // Quebra em linhas primeiro
  return text.split("\n").flatMap((line, li, arr) => {
    const nodes = myUsername
      ? line.split(new RegExp(`(@${myUsername})`, "gi")).map((part, pi) =>
          new RegExp(`^@${myUsername}$`, "i").test(part)
            ? <span key={`${keyBase}-m-${li}-${pi}`} className="rounded bg-indigo-500/25 px-1 text-indigo-200 font-semibold">{part}</span>
            : part
        )
      : [line];
    if (li < arr.length - 1) nodes.push(<br key={`${keyBase}-br-${li}`} />);
    return nodes;
  });
}

// Renderiza uma mensagem completa: URLs → GIFs; bets → badges; texto → markdown + mentions
function renderMessage(raw, myUsername, msgIdx, msgUsername, msgTimestamp) {
  const parts = [];
  let lastIdx = 0;
  let match;
  const re = /https?:\/\/[^\s<>"]+/g;

  while ((match = re.exec(raw)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ kind: "text", content: raw.slice(lastIdx, match.index) });
    }
    parts.push({ kind: "url", content: match[0] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < raw.length) parts.push({ kind: "text", content: raw.slice(lastIdx) });

  return parts.flatMap((part, pi) => {
    const key = `msg-${msgIdx}-p${pi}`;
    if (part.kind === "url") {
      const gif = extractGifSrc(part.content);
      if (gif) {
        return [
          <img
            key={key}
            src={gif}
            alt="gif"
            loading="lazy"
            className="block max-h-40 rounded-md mt-1 cursor-pointer"
            onClick={() => window.open(part.content, "_blank")}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />,
        ];
      }
      return []; // URLs não-GIF: omitir
    }

    // Detectar referências de bet (#DIGITS_W / #DIGITS_L) no texto
    const betParts = [];
    let lastBetIdx = 0;
    const betRe = new RegExp(BET_RE.source, "g");
    let bm;
    while ((bm = betRe.exec(part.content)) !== null) {
      if (bm.index > lastBetIdx) {
        betParts.push(...applyMarkdown(part.content.slice(lastBetIdx, bm.index), myUsername, `${key}-bt${lastBetIdx}`));
      }
      betParts.push(
        <BetBadge
          key={`${key}-bet-${bm[1]}`}
          betId={bm[1]}
          result={bm[2] || null}
          msgUsername={msgUsername}
          msgTimestamp={msgTimestamp}
        />
      );
      lastBetIdx = bm.index + bm[0].length;
    }
    if (lastBetIdx < part.content.length) {
      betParts.push(...applyMarkdown(part.content.slice(lastBetIdx), myUsername, `${key}-bta`));
    }
    return betParts.length > 0 ? betParts : applyMarkdown(part.content, myUsername, key);
  });
}

const THEME_LABELS = {
  crypto_terms: "Termos Crypto",
  top100_coins: "Top 100 Moedas",
  bitsler_terms: "Termos Bitsler",
  casino_terms: "Termos Casino",
};

function TriviaThemeSelect({ triviaEvents }) {
  const qc = useQueryClient();
  const { data: themesData } = useQuery({
    queryKey: ["triviaThemes"],
    queryFn: () => fetch(`${API}/trivia/themes`).then((r) => r.json()),
    refetchInterval: 30000,
  });
  const setTheme = useMutation({
    mutationFn: (theme) =>
      fetch(`${API}/trivia/theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries(["triviaThemes"]),
  });

  // Quando chegar evento themeDetected, invalida a query para mostrar o novo tema
  const lastDetect = triviaEvents?.find((e) => e.type === "themeDetected");
  useEffect(() => {
    if (lastDetect) qc.invalidateQueries(["triviaThemes"]);
  }, [lastDetect?.theme]);

  const active = themesData?.active || "crypto_terms";
  const autoDetected = lastDetect && lastDetect.theme === active;

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={active}
        onChange={(e) => setTheme.mutate(e.target.value)}
        className="h-9 bg-input border border-border rounded-lg px-2 text-sm text-foreground font-mono shrink-0 focus:outline-none focus:border-primary"
        title="Lista de palavras usada na Trivia"
      >
        {Object.entries(THEME_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      {autoDetected && (
        <span
          className="text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 font-mono whitespace-nowrap"
          title={`Detectado automaticamente do chat: "${lastDetect.raw?.slice(0, 60)}"`}
        >
          🎯 auto
        </span>
      )}
    </div>
  );
}

function TriviaBanner({ triviaEvents }) {
  const [customAnswer, setCustomAnswer] = useState("");
  const [sent, setSent] = useState(null);

  const last = triviaEvents[0];

  // Notificação de tema detectado automaticamente
  if (last?.type === "themeDetected") {
    return (
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm">
        <span className="text-blue-400">🎯</span>
        <span className="text-muted-foreground">Tema detectado automaticamente:</span>
        <span className="font-mono font-bold text-blue-400">{THEME_LABELS[last.theme] || last.theme}</span>
        {last.prevTheme && last.prevTheme !== last.theme && (
          <span className="text-xs text-muted-foreground/60 font-mono">(era: {THEME_LABELS[last.prevTheme] || last.prevTheme})</span>
        )}
      </div>
    );
  }

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
      <div className="bg-card border border-border rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm">
        <Trophy className="w-4 h-4 text-warning shrink-0" />
        <span className="text-muted-foreground">Jogo encerrado —</span>
        <span className="font-mono font-bold text-warning">{last.answer}</span>
        {last.added && <span className="text-success text-xs ml-1">✓ salva</span>}
      </div>
    );
  }

  return (
    <div className="bg-warning/5 border border-warning/30 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Gamepad2 className="w-4 h-4 text-warning shrink-0" />
        <span className="font-mono text-lg text-foreground tracking-widest">{last.hintRaw}</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">canal: {last.channel}</span>
      </div>

      {last.suggestions?.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {last.suggestions.map((w) => (
            <button
              key={w}
              onClick={() => sendAnswer(w, last.channel)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono font-bold border transition-colors ${
                sent?.word === w
                  ? sent.ok
                    ? "bg-success/10 border-success/40 text-success"
                    : "bg-destructive/10 border-destructive/40 text-destructive"
                  : "bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
              }`}
            >
              {sent?.word === w ? (sent.ok ? "✓ Enviado" : "✗ Falhou") : (
                <><Send className="w-3 h-3" /> {w}</>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sem sugestões no banco para esse padrão.</p>
      )}

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
          className="flex-1 h-9 bg-muted border border-warning/30 rounded-lg px-3 text-sm text-foreground placeholder-muted-foreground font-mono focus:outline-none focus:border-warning/60"
        />
        <button
          onClick={() => { if (customAnswer.trim()) { sendAnswer(customAnswer.trim(), last.channel); setCustomAnswer(""); } }}
          className="h-9 px-3 bg-warning/10 hover:bg-warning/20 border border-warning/30 text-warning rounded-lg text-sm flex items-center gap-1.5 transition-colors"
        >
          <Send className="w-3 h-3" /> Enviar
        </button>
      </div>
    </div>
  );
}

const ALL_CHANNELS = ["en", "br", "fr", "in", "id", "ph", "ru", "es", "pk", "rs", "system"];

export default function Monitor() {
  const { messages, triviaEvents, user } = useStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("todos");
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);
  const chatInputRef = useRef(null);

  const [chatMsg, setChatMsg] = useState("");
  const [chatChannel, setChatChannel] = useState(null);
  const [chatFeedback, setChatFeedback] = useState(null);
  const [triviaAutofill, setTriviaAutofill] = useState(false);
  const [top100Feedback, setTop100Feedback] = useState(null);

  const { data: cfg } = useQuery({
    queryKey: ["config"],
    queryFn: () => fetch("/api/v1/config").then((r) => r.json()),
  });

  const activeChannels = new Set(cfg?.channels?.autoJoin || ["en", "br", "system"]);
  const activeChannelList = [...activeChannels].filter((c) => c !== "system").sort();

  useEffect(() => {
    if (!chatChannel && activeChannelList.length > 0) {
      setChatChannel(activeChannelList[0]);
    }
  }, [activeChannelList.join(",")]); // eslint-disable-line

  // Quando uma sala específica está selecionada, força o envio para ela
  useEffect(() => {
    if (selectedChannel !== "todos") {
      setChatChannel(selectedChannel);
    }
  }, [selectedChannel]);

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
    const channel = chatChannel || activeChannelList[0] || "en";
    if (!msg || !channel) return;
    fetch("/api/v1/say", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, message: msg }),
    })
      .then((r) => r.json())
      .then((d) => {
        setChatMsg("");
        setTriviaAutofill(false);
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
        setTop100Feedback(d.ok ? { ok: true, text: `✓ ${d.count} moedas` } : { ok: false, text: d.error || "Erro" });
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

  const joinChannel = (channel) => {
    fetch("/api/v1/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    });
  };

  const toggleChannel = (channel) => {
    const updated = activeChannels.has(channel)
      ? [...activeChannels].filter((c) => c !== channel)
      : [...activeChannels, channel];
    saveChannels.mutate(updated);
    if (!activeChannels.has(channel)) joinChannel(channel);
  };

  // Auto-preenche o input com a primeira sugestão quando uma dica de trivia chega
  // Só auto-preenche se o evento for do canal visível (ou se estiver em "todos")
  const relevantTriviaEvents =
    selectedChannel === "todos"
      ? triviaEvents
      : triviaEvents.filter((e) => !e.channel || e.channel === selectedChannel);
  const lastTriviaTs = relevantTriviaEvents[0]?.timestamp;
  useEffect(() => {
    const ev = relevantTriviaEvents[0];
    if (!ev || ev.type !== "hint" || !ev.suggestions?.length) return;
    setChatMsg(ev.suggestions[0]);
    if (ev.channel) setChatChannel(ev.channel);
    setTriviaAutofill(true);
    chatInputRef.current?.focus();
  }, [lastTriviaTs]); // eslint-disable-line

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
    <div className="flex flex-col h-full px-6 py-5 gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Monitor de Chat</h1>
        <div className="flex gap-2 ml-auto items-center flex-wrap">
          <input
            className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground placeholder-muted-foreground w-44 focus:outline-none focus:border-primary"
            placeholder="Filtrar mensagem..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-primary"
            />
            Auto-scroll
          </label>

          {/* Trivia toggle + tema */}
          <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden bg-input">
            <button
              onClick={() => triviaToggle.mutate(!triviaStatus?.enabled)}
              className={`h-9 flex items-center gap-1.5 px-3 text-sm font-medium transition-colors ${
                triviaStatus?.enabled
                  ? "bg-success/10 text-success hover:bg-success/20"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              title={triviaStatus?.enabled ? "Trivia ativo — clique para desativar" : "Trivia inativo — clique para ativar"}
            >
              🎮 {triviaStatus?.enabled ? "ON" : "OFF"}
            </button>
            <div className="w-px h-5 bg-border" />
            {selectedChannel === "br" ? (
              <span className="h-9 flex items-center px-3 text-sm font-medium text-green-400 font-mono">
                🇧🇷 PT-BR
              </span>
            ) : (
              <TriviaThemeSelect triviaEvents={triviaEvents} />
            )}
          </div>

          {/* Top 100 refresh — só relevante para temas crypto */}
          {selectedChannel !== "br" && (
            <button
              onClick={refreshTop100}
              disabled={top100Feedback?.loading}
              className={`h-9 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium border transition-colors ${
                top100Feedback?.ok === true
                  ? "border-success/50 bg-success/10 text-success"
                  : top100Feedback?.ok === false
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-border bg-input text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              title="Atualizar Top 100 moedas do CoinMarketCap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${top100Feedback?.loading ? "animate-spin" : ""}`} />
              {top100Feedback ? top100Feedback.text : "Top 100"}
            </button>
          )}

          <button
            onClick={() => setShowRoomPicker((v) => !v)}
            className={`h-9 flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium border transition-colors ${
              showRoomPicker
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-input text-muted-foreground hover:bg-accent hover:text-foreground"
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
              ? "bg-accent border-border text-foreground"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Todos
        </button>
        {[...activeChannels].sort().map((canal) => (
          <button
            key={canal}
            onClick={() => setSelectedChannel(canal)}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border border-transparent transition-colors ${
              selectedChannel === canal
                ? ch(canal).tab
                : `bg-card text-muted-foreground hover:text-foreground hover:bg-accent`
            }`}
          >
            {canal}
          </button>
        ))}
      </div>

      {/* Room picker */}
      {showRoomPicker && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2 animate-fade-in-up">
          <p className="text-xs font-semibold text-muted-foreground">Salas monitoradas (auto-join na conexão)</p>
          <div className="flex flex-wrap gap-2">
            {ALL_CHANNELS.map((canal) => {
              const on = activeChannels.has(canal);
              return (
                <button
                  key={canal}
                  onClick={() => toggleChannel(canal)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-mono font-medium border transition-colors ${
                    on
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-input border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {on ? "✓ " : ""}{canal}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground/50">
            Alterações aplicadas imediatamente — o bot entra na sala na próxima reconexão se ainda não estiver.
          </p>
        </div>
      )}

      {/* Trivia banner — filtra pelo canal ativo */}
      <TriviaBanner
        triviaEvents={
          selectedChannel === "todos"
            ? triviaEvents
            : triviaEvents.filter((e) =>
                e.type === "themeDetected" ||
                !e.channel ||
                e.channel === selectedChannel
              )
        }
      />

      {/* Chat feed */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-y-auto p-2 space-y-0.5 font-chat text-sm">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">Aguardando mensagens...</p>
        ) : (
          filtered.map((msg, i) => {
            const text = msg.message || msg.comment || "";
            const isRain = msg.type === "rain" || ["Chat Rain", "Drizzle Bot", "Drizzle"].includes(msg.username);
            const isTrivia = /guess the crypto/i.test(text) || /game\s*over/i.test(text);
            const myUsername = user?.username || "";
            const mentionRe = myUsername ? new RegExp(`@${myUsername}`, "i") : null;
            const isMention = mentionRe ? mentionRe.test(text) : false;
            const hasGif = matchUrls(text).some((u) => !!extractGifSrc(u));

            const chStyle = ch(msg.channel);

            return (
              <div
                key={i}
                className={`flex gap-3 px-2 py-1 rounded-md transition-colors ${
                  isMention
                    ? "border-l-2 border-indigo-400 bg-indigo-500/10 pl-1.5"
                    : isRain
                    ? "bg-info/5 border border-info/20"
                    : isTrivia
                    ? "bg-warning/5 border border-warning/20"
                    : "hover:bg-accent/40"
                }`}
              >
                {/* Channel tag */}
                <span className={`shrink-0 inline-flex items-center h-5 self-center px-1.5 rounded text-[10px] font-bold uppercase font-mono ${chStyle.tag}`}>
                  {msg.channel || "?"}
                </span>
                {/* Username */}
                <span
                  className={`shrink-0 font-semibold cursor-pointer hover:opacity-70 transition-opacity ${chStyle.text}`}
                  onClick={() => {
                    const mention = `@${msg.username} `;
                    setChatMsg((prev) => {
                      // Evita duplicar o mesmo @user se já estiver no input
                      if (prev.includes(mention.trim())) return prev;
                      return prev ? `${prev.trimEnd()} ${mention}` : mention;
                    });
                    chatInputRef.current?.focus();
                  }}
                >
                  {msg.username || "system"}:
                </span>
                {/* Message — markdown, GIFs, @mentions */}
                <span className={`break-all leading-5 ${
                  isRain ? "text-info font-medium" : isTrivia ? "text-warning" : "text-foreground"
                } ${hasGif ? "flex flex-col gap-1" : ""}`}>
                  {renderMessage(text, myUsername, i, msg.username, msg.timestamp)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Chat input bar */}
      <div className="bg-card border border-border rounded-xl p-2.5 flex items-center gap-2">
        {selectedChannel !== "todos" ? (
          <span
            className={`h-9 inline-flex items-center px-3 rounded-lg text-sm font-mono font-bold border shrink-0 ${ch(selectedChannel).tab}`}
            title="Sala forçada pelo filtro ativo"
          >
            {selectedChannel}
          </span>
        ) : (
          <select
            value={chatChannel || ""}
            onChange={(e) => setChatChannel(e.target.value)}
            className="h-9 bg-input border border-border rounded-lg px-2 text-sm text-foreground font-mono shrink-0 focus:outline-none focus:border-primary"
          >
            {activeChannelList.length === 0 ? (
              <option value="en">en</option>
            ) : (
              activeChannelList.map((canal) => (
                <option key={canal} value={canal}>{canal}</option>
              ))
            )}
          </select>
        )}

        <input
          ref={chatInputRef}
          type="text"
          value={chatMsg}
          onChange={(e) => { setChatMsg(e.target.value); setTriviaAutofill(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") sendChatMsg(); }}
          placeholder="Digite uma mensagem para enviar ao chat..."
          className={`flex-1 h-9 bg-input border rounded-lg px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none transition-colors ${
            triviaAutofill
              ? "border-warning/60 focus:border-warning text-warning font-mono font-semibold"
              : "border-border focus:border-primary"
          }`}
        />

        {chatFeedback && (
          <span className={`text-xs shrink-0 font-medium ${chatFeedback.ok ? "text-success" : "text-destructive"}`}>
            {chatFeedback.text}
          </span>
        )}

        <button
          onClick={sendChatMsg}
          disabled={!chatMsg.trim()}
          className="h-9 flex items-center gap-1.5 px-4 bg-primary hover:brightness-110 disabled:opacity-30 text-primary-foreground rounded-lg text-sm font-semibold transition-all shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          Enviar
        </button>
      </div>
    </div>
  );
}
