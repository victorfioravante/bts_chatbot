import { NavLink } from "react-router-dom";
import { LayoutDashboard, MessageSquare, Zap, CloudRain, Settings, Activity } from "lucide-react";
import { useStore } from "../store";

const links = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/monitor", icon: MessageSquare, label: "Monitor" },
  { to: "/auto", icon: Zap, label: "Auto-Msgs" },
  { to: "/rain", icon: CloudRain, label: "Histórico Rain" },
  { to: "/settings", icon: Settings, label: "Configurações" },
];

export function Sidebar() {
  const { connected, sseConnected } = useStore();

  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <CloudRain className="w-6 h-6 text-blue-400" />
          <span className="font-bold text-white">Bitsler Bot</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
          <span className="text-xs text-gray-400">{connected ? "Conectado" : "Desconectado"}</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Activity className="w-3 h-3" />
          SSE {sseConnected ? "ativo" : "inativo"}
        </div>
      </div>
    </aside>
  );
}
