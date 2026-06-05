import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wifi, WifiOff, CloudRain, Zap, Clock, MessageCircle, Copy, ExternalLink, KeyRound, RefreshCw } from "lucide-react";
import { StatCard } from "../components/StatCard";
import { useStore } from "../store";

const CONSOLE_CMD = `copy(window.__vue_store__?.state?.chat?.user?.socketToken)`;

function formatUptime(s) {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function timeAgo(ts) {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - (ts > 1e10 ? ts : ts * 1000)) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  return `${Math.floor(diff / 3600)}h atrás`;
}

// ─── Card de renovação de token ──────────────────────────────────────────────

function TokenRenewalCard({ error }) {
  const qc = useQueryClient();
  const [token, setToken]           = useState("");
  const [showGuide, setShowGuide]   = useState(false);
  const [cmdCopied, setCmdCopied]   = useState(false);
  const [feedback, setFeedback]     = useState(null);

  const isAuthError = !error || /token|auth|sem token|401|403|expired|invalid/i.test(error);

  const applyToken = async () => {
    if (!token.trim()) return;
    setFeedback({ loading: true, text: "Aplicando token..." });
    try {
      const res = await fetch("/api/v1/socket-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), autoConnect: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback({ ok: true, text: "✓ Token aplicado — conectando..." });
        setToken("");
        setTimeout(() => {
          setFeedback(null);
          qc.invalidateQueries(["status"]);
          qc.invalidateQueries(["authStatus"]);
        }, 2500);
      } else {
        setFeedback({ ok: false, text: `✗ ${data.error || "Token rejeitado"}` });
        setTimeout(() => setFeedback(null), 4000);
      }
    } catch {
      setFeedback({ ok: false, text: "✗ Falha na requisição" });
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const copyCmd = () => {
    navigator.clipboard.writeText(CONSOLE_CMD).then(() => {
      setCmdCopied(true);
      setTimeout(() => setCmdCopied(false), 2500);
    });
  };

  return (
    <div className="bg-card border border-destructive/40 rounded-2xl p-6 space-y-5 shadow-lg">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0 mt-0.5">
          <KeyRound className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Token expirado — reconexão necessária</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {error
              ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{error}</span>
              : "O bot está desconectado. Insira um novo token para retomar."}
          </p>
        </div>
      </div>

      {/* Guia expansível */}
      <div className="space-y-3">
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-colors"
        >
          {showGuide ? "▲ Esconder instruções" : "▼ Como obter o token (DevTools)"}
        </button>

        {showGuide && (
          <div className="bg-muted rounded-xl p-4 space-y-3 border border-border">
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Abra o Bitsler e faça login no browser</li>
              <li>Pressione <kbd className="bg-background border border-border px-1 rounded text-foreground">F12</kbd> → aba <span className="text-foreground font-medium">Console</span></li>
              <li>Cole e execute o comando abaixo — o token vai para a área de transferência</li>
              <li>Volte aqui e cole no campo abaixo</li>
            </ol>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-950 text-green-400 text-xs px-3 py-2 rounded-lg font-mono break-all border border-gray-800">
                {CONSOLE_CMD}
              </code>
              <button
                onClick={copyCmd}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  cmdCopied
                    ? "bg-green-900/40 border-green-700 text-green-400"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Copy className="w-3 h-3" />
                {cmdCopied ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <a
              href="https://www.bitsler.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Abrir Bitsler em nova aba
            </a>
          </div>
        )}
      </div>

      {/* Input + botão */}
      <div className="space-y-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyToken()}
          placeholder="Cole o socketToken aqui e pressione Enter..."
          autoFocus
          className="w-full bg-input border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={applyToken}
            disabled={!token.trim() || feedback?.loading}
            className="flex items-center gap-2 bg-primary hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${feedback?.loading ? "animate-spin" : ""}`} />
            Aplicar e Reconectar
          </button>
          {feedback && !feedback.loading && (
            <span className={`text-sm font-medium ${feedback.ok ? "text-green-400" : "text-destructive"}`}>
              {feedback.text}
            </span>
          )}
          {feedback?.loading && (
            <span className="text-sm text-muted-foreground">{feedback.text}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { connected: sseConnected, rainsToday, lastRain, autoMsgStats, connectionError, setUptime, setConnected } = useStore();

  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: () => fetch("/api/v1/status").then((r) => r.json()),
    refetchInterval: 5000,
  });

  const { data: rainStats } = useQuery({
    queryKey: ["rainStats"],
    queryFn: () => fetch("/api/v1/rain/stats").then((r) => r.json()),
    refetchInterval: 10000,
  });

  const { data: msgStats } = useQuery({
    queryKey: ["autoMsgStats"],
    queryFn: () => fetch("/api/v1/automsg/stats").then((r) => r.json()),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (status?.uptime !== undefined) setUptime(status.uptime);
    if (status?.connected !== undefined) setConnected(status.connected);
  }, [status]);

  const connected = status?.connected ?? sseConnected;
  const uptime = status?.uptime || 0;
  const stats = rainStats || {};
  const last = stats.lastRain || lastRain;

  return (
    <div className="px-8 py-6 space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Status em tempo real do bot</p>
      </div>

      {/* Card de renovação de token — aparece quando desconectado */}
      {!connected && (
        <TokenRenewalCard error={connectionError} />
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          title="Conexão"
          value={connected ? "Conectado" : "Desconectado"}
          icon={connected ? Wifi : WifiOff}
          color={connected ? "green" : "red"}
        />
        <StatCard
          title="Uptime"
          value={formatUptime(uptime)}
          icon={Clock}
          color="blue"
        />
        <StatCard
          title="Rains Hoje"
          value={stats.totalToday ?? rainsToday}
          icon={CloudRain}
          color="blue"
        />
        <StatCard
          title="Mensagens Enviadas"
          value={msgStats?.totalSent ?? autoMsgStats?.totalSent ?? 0}
          icon={MessageCircle}
          color="purple"
        />
        <StatCard
          title="Perfis Ativos"
          value={msgStats?.activeProfiles ?? 0}
          icon={Zap}
          color="yellow"
        />
        <StatCard
          title="Último Rain"
          value={last ? `${last.currency?.toUpperCase()} ${last.amount}` : "—"}
          sub={last ? `${last.initiator || last.username} · ${timeAgo(last.timestamp)}` : undefined}
          icon={CloudRain}
          color="blue"
        />
      </div>

      {/* Recent rains */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-3">
          Últimos Rains
        </h2>
        {(stats.history || []).length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum rain detectado ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {(stats.history || []).slice().reverse().map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm bg-muted rounded-lg px-3 py-2 hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CloudRain className="w-4 h-4 text-info" />
                  <span className="text-foreground font-medium">
                    {r.currency?.toUpperCase()} {r.amount}
                  </span>
                  {r.initiator && (
                    <span className="text-amber-400 text-xs font-medium">de {r.initiator}</span>
                  )}
                  <span className="text-muted-foreground">— {r.channel}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{timeAgo(r.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
