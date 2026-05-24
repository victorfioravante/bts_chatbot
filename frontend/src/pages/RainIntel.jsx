import { useEffect, useState, useCallback } from "react";
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from "recharts";
import { TrendingUp, UserPlus, Trash2, Zap } from "lucide-react";
import { useStore } from "../store";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

function scoreLabel(score) {
  if (score >= 75) return "Alto ⚡";
  if (score >= 50) return "Elevado";
  if (score >= 25) return "Moderado";
  return "Baixo";
}

function scoreColor(score) {
  if (score >= 75) return "#ef4444";
  if (score >= 50) return "#f97316";
  if (score >= 25) return "#eab308";
  return "#22c55e";
}

function GaugeChart({ score }) {
  const color = scoreColor(score);
  const data = [{ value: score, fill: color }];

  return (
    <div className="relative flex flex-col items-center">
      <ResponsiveContainer width={220} height={160}>
        <RadialBarChart
          cx="50%"
          cy="85%"
          innerRadius="60%"
          outerRadius="100%"
          startAngle={180}
          endAngle={0}
          data={data}
        >
          <RadialBar background={{ fill: "#1f2937" }} dataKey="value" cornerRadius={6} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute bottom-2 flex flex-col items-center">
        <span className="text-4xl font-bold" style={{ color }}>{score}</span>
        <span className="text-sm text-muted-foreground mt-0.5">{scoreLabel(score)}</span>
      </div>
    </div>
  );
}

function HourChart({ pattern }) {
  const now = new Date().getHours();
  const data = pattern.map((v, h) => ({ hour: h, rains: v, current: h === now }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#6b7280" }} interval={2} />
        <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 12 }}
          formatter={(v) => [v, "rains"]}
          labelFormatter={(h) => `${h}h`}
        />
        <Bar dataKey="rains" radius={[2, 2, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.hour}
              fill={entry.current ? "#f97316" : "#3b82f6"}
              fillOpacity={entry.current ? 1 : 0.6}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function RainIntel() {
  const { rainIntel, setRainIntel, rainActivity } = useStore();
  const [newSender, setNewSender] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    fetch(`${backendUrl}/api/v1/rain/intel`)
      .then((r) => r.json())
      .then(setRainIntel)
      .catch(() => {});
  }, [setRainIntel]);

  // Poll a cada 30s
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  function handleAddSender(e) {
    e.preventDefault();
    const username = newSender.trim();
    if (!username) return;
    setLoading(true);
    fetch(`${backendUrl}/api/v1/rain/senders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    })
      .then(() => { setNewSender(""); refresh(); })
      .finally(() => setLoading(false));
  }

  function handleRemoveSender(username) {
    fetch(`${backendUrl}/api/v1/rain/senders/${encodeURIComponent(username)}`, { method: "DELETE" })
      .then(refresh);
  }

  const { score, senders, hourPattern } = rainIntel;
  const activeSenders = (senders || []).filter((s) => s.activeNow);

  // Últimas apostas de rainers para o feed de atividade
  const betActivity = rainActivity.filter((a) => a.isBet);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Inteligência de Rain</h1>
          <p className="text-sm text-muted-foreground">Probabilidade de rain com base em atividade dos rainers</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda: gauge + hora */}
        <div className="space-y-4">
          {/* Termômetro */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Probabilidade agora
            </p>
            <GaugeChart score={score} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Baixo 0–24
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-400" /> Moderado 25–49
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-500" /> Elevado 50–74
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Alto 75+
              </div>
            </div>
          </div>

          {/* Distribuição horária */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Quando as chuvas acontecem
            </p>
            <HourChart pattern={hourPattern || new Array(24).fill(0)} />
            <p className="text-[10px] text-muted-foreground mt-1 text-center">
              Barra laranja = hora atual
            </p>
          </div>
        </div>

        {/* Coluna direita: ativos + tabela */}
        <div className="lg:col-span-2 space-y-4">
          {/* Rainers ativos agora */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Rainers ativos agora
            </p>
            {activeSenders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum rainer conhecido ativo no momento.</p>
            ) : (
              <ul className="space-y-2">
                {activeSenders.map((s) => {
                  const bet = betActivity.find((b) => b.username === s.username);
                  return (
                    <li key={s.username} className="flex items-center gap-3 bg-accent/30 rounded-lg px-3 py-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80] animate-pulse shrink-0" />
                      <span className="font-medium text-sm text-foreground">{s.username}</span>
                      <span className="text-xs text-muted-foreground">
                        {Object.keys(s.channels || {})[0] && `canal ${Object.keys(s.channels)[0]}`}
                      </span>
                      {bet && (
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${bet.isHouseCoin ? "bg-zinc-700 text-zinc-300" : "bg-orange-900/60 text-orange-300"}`}>
                          {bet.isHouseCoin ? "🎰 moeda casa" : `💰 ${(bet.currency || "").toUpperCase()} ${bet.amount || ""}`}
                        </span>
                      )}
                      {s.lastBetReal && !bet && (
                        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-orange-900/40 text-orange-400">
                          💰 {(s.lastBetCurrency || "").toUpperCase()}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Tabela de rainers conhecidos */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Rainers conhecidos
              </p>
              <form onSubmit={handleAddSender} className="flex gap-2">
                <input
                  className="bg-background border border-border rounded-md px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Adicionar usuário..."
                  value={newSender}
                  onChange={(e) => setNewSender(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !newSender.trim()}
                  className="flex items-center gap-1 bg-primary text-primary-foreground rounded-md px-3 py-1 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Adicionar
                </button>
              </form>
            </div>

            {(!senders || senders.length === 0) ? (
              <p className="text-sm text-muted-foreground">
                Nenhum rainer registrado. Rainers são detectados automaticamente ou podem ser adicionados manualmente.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left py-2 pr-3 font-medium">Usuário</th>
                      <th className="text-right py-2 px-3 font-medium">Rains</th>
                      <th className="text-left py-2 px-3 font-medium">Último rain</th>
                      <th className="text-left py-2 px-3 font-medium">Status</th>
                      <th className="text-left py-2 px-3 font-medium">Canal</th>
                      <th className="py-2 pl-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(senders || []).map((s) => {
                      const topChannel = Object.entries(s.channels || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
                      const lastRainAgo = s.lastRain
                        ? formatAgo(Date.now() / 1000 - s.lastRain)
                        : "—";
                      return (
                        <tr key={s.username} className="hover:bg-accent/20 transition-colors">
                          <td className="py-2 pr-3 font-medium text-foreground">
                            {s.username}
                            {s.manuallyAdded && (
                              <span className="ml-1.5 text-[10px] text-muted-foreground bg-accent px-1 rounded">manual</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">{s.rains}</td>
                          <td className="py-2 px-3 text-muted-foreground text-xs">{lastRainAgo}</td>
                          <td className="py-2 px-3">
                            {s.activeNow ? (
                              <span className="flex items-center gap-1.5 text-green-400 text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                Ativo
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">Inativo</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground text-xs uppercase">{topChannel || "—"}</td>
                          <td className="py-2 pl-3 text-right">
                            <button
                              onClick={() => handleRemoveSender(s.username)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Feed de atividade de apostas */}
          {rainActivity.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Atividade recente
              </p>
              <ul className="space-y-1.5">
                {rainActivity.slice(0, 10).map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    {a.isBet ? (
                      <Zap className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                    )}
                    <span className="text-foreground font-medium">{a.username}</span>
                    {a.isBet
                      ? <span>{a.isHouseCoin ? "apostou moeda da casa" : `apostou ${(a.currency || "").toUpperCase()} ${a.amount || ""}`}</span>
                      : <span>ativo no chat</span>}
                    {a.channel && <span className="uppercase text-xs">[{a.channel}]</span>}
                    <span className="ml-auto text-[10px]">{formatAgo((Date.now() - a.ts) / 1000)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatAgo(seconds) {
  if (seconds < 0) return "agora";
  if (seconds < 60) return `${Math.round(seconds)}s atrás`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min atrás`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h atrás`;
  return `${Math.round(seconds / 86400)}d atrás`;
}
