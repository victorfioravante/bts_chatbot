import { useEffect, useRef } from "react";
import { CloudRain, X } from "lucide-react";
import { useStore } from "../store";

const DURATION = 8000;

export function RainAlert() {
  const { rainAlert, clearRainAlert } = useStore();
  const barRef = useRef(null);

  useEffect(() => {
    if (!rainAlert) return;
    const t = setTimeout(clearRainAlert, DURATION);
    // restart progress bar animation
    if (barRef.current) {
      barRef.current.style.animation = "none";
      void barRef.current.offsetWidth; // reflow
      barRef.current.style.animation = `progress-shrink ${DURATION}ms linear forwards`;
    }
    return () => clearTimeout(t);
  }, [rainAlert]);

  if (!rainAlert) return null;

  return (
    <div className="animate-slide-down fixed top-4 left-1/2 z-50 min-w-72 overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-br from-primary/20 to-primary/5 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center gap-3 px-5 py-4">
        <CloudRain className="w-6 h-6 text-primary shrink-0" />
        <div className="flex-1">
          <p className="font-bold text-foreground">Rain Detectado!</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="text-foreground font-semibold">
              {rainAlert.currency?.toUpperCase()} {rainAlert.amount}
            </span>
            {" — "}{rainAlert.channel || "system"}
            {rainAlert.username && ` — por ${rainAlert.username}`}
          </p>
        </div>
        <button
          onClick={clearRainAlert}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 bg-border">
        <div
          ref={barRef}
          className="h-full bg-primary origin-left"
          style={{ animation: `progress-shrink ${DURATION}ms linear forwards` }}
        />
      </div>
    </div>
  );
}
