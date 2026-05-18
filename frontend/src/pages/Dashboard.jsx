import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wifi, WifiOff, CloudRain, Zap, Clock, MessageCircle } from "lucide-react";
import { StatCard } from "../components/StatCard";
import { useStore } from "../store";

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

export default function Dashboard() {
  const { connected: sseConnected, rainsToday, lastRain, autoMsgStats, setUptime, setConnected } = useStore();

  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: () => fetch("http://localhost:3001/api/v1/status").then((r) => r.json()),
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
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

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
          sub={last ? timeAgo(last.timestamp) : undefined}
          icon={CloudRain}
          color="blue"
        />
      </div>

      {/* Recent rains */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">Últimos Rains</h2>
        {(stats.history || []).length === 0 ? (
          <p className="text-gray-600 text-sm">Nenhum rain detectado ainda.</p>
        ) : (
          <div className="space-y-2">
            {(stats.history || []).slice().reverse().map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <CloudRain className="w-4 h-4 text-blue-400" />
                  <span className="text-white">{r.currency?.toUpperCase()} {r.amount}</span>
                  <span className="text-gray-400">— {r.channel}</span>
                </div>
                <span className="text-gray-500 text-xs">{timeAgo(r.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
