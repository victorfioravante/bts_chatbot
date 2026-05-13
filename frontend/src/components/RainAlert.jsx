import { useEffect } from "react";
import { CloudRain, X } from "lucide-react";
import { useStore } from "../store";

export function RainAlert() {
  const { rainAlert, clearRainAlert } = useStore();

  useEffect(() => {
    if (!rainAlert) return;
    const t = setTimeout(clearRainAlert, 8000);
    return () => clearTimeout(t);
  }, [rainAlert]);

  if (!rainAlert) return null;

  return (
    <div className="rain-alert fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 border border-blue-400 rounded-xl px-6 py-4 shadow-2xl flex items-center gap-3 min-w-72">
      <CloudRain className="text-white w-7 h-7 shrink-0" />
      <div className="flex-1">
        <p className="font-bold text-white text-lg">Rain Detectado!</p>
        <p className="text-blue-100 text-sm">
          {rainAlert.currency?.toUpperCase()} {rainAlert.amount} — {rainAlert.channel || "system"}
          {rainAlert.username && ` — por ${rainAlert.username}`}
        </p>
      </div>
      <button onClick={clearRainAlert} className="text-blue-200 hover:text-white">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
