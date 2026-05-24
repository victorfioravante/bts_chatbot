export function StatCard({ title, value, sub, icon: Icon, color = "blue" }) {
  const colors = {
    blue:   "border-info/30   bg-info/5",
    green:  "border-success/30 bg-success/5",
    yellow: "border-warning/30 bg-warning/5",
    red:    "border-destructive/30 bg-destructive/5",
    purple: "border-purple-500/30 bg-purple-500/5",
  };
  const iconColors = {
    blue:   "text-info",
    green:  "text-success",
    yellow: "text-warning",
    red:    "text-destructive",
    purple: "text-purple-400",
  };

  return (
    <div className={`rounded-xl border p-5 ${colors[color] || colors.blue}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          {title}
        </span>
        {Icon && <Icon className={`w-4 h-4 ${iconColors[color] || iconColors.blue}`} />}
      </div>
      <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}
