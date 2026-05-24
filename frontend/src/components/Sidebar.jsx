import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, MessageSquare, Zap, CloudRain,
  Settings, Activity, ShieldCheck, Gamepad2, TrendingUp,
} from "lucide-react";
import { useStore } from "../store";

export function Sidebar() {
  const { connected, sseConnected, pendingMessages, triviaActive, rainIntel } = useStore();
  const pendingCount = pendingMessages.length;
  const rainScore = rainIntel?.score ?? 5;

  const links = [
    { to: "/",           icon: LayoutDashboard, label: "Dashboard" },
    { to: "/monitor",    icon: MessageSquare,   label: "Monitor" },
    { to: "/auto",       icon: Zap,             label: "Auto-Msgs" },
    { to: "/aprovacoes", icon: ShieldCheck,     label: "Controle",       badge: pendingCount },
    { to: "/trivia",     icon: Gamepad2,        label: "Trivia",         pulse: triviaActive },
    { to: "/rain-intel", icon: TrendingUp,      label: "Inteligência",   pulse: rainScore > 50 },
    { to: "/rain",       icon: CloudRain,       label: "Histórico Rain" },
    { to: "/settings",   icon: Settings,        label: "Configurações" },
  ];

  return (
    <aside className="w-60 shrink-0 bg-card/40 backdrop-blur-xl border-r border-border flex flex-col">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 ring-1 ring-primary/30">
            <CloudRain className="w-4 h-4 text-primary" />
          </span>
          <span className="font-bold text-foreground tracking-tight">Bitsler Bot</span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? "bg-success shadow-[0_0_6px_#27db9a]" : "bg-destructive"
            }`}
          />
          <span className="text-xs text-muted-foreground">
            {connected ? "Conectado" : "Desconectado"}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {links.map(({ to, icon: Icon, label, badge, pulse }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-[0_4px_20px_-8px_rgba(255,149,0,0.5)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-amber-950 leading-5">
                {badge}
              </span>
            )}
            {pulse && (
              <span className="w-2 h-2 rounded-full bg-warning pulse-amber" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="w-3 h-3" />
          SSE {sseConnected ? "ativo" : "inativo"}
        </div>
      </div>
    </aside>
  );
}
