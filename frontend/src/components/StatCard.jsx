export function StatCard({ title, value, sub, icon: Icon, color = "blue" }) {
  const colors = {
    blue: "border-blue-700 bg-blue-950/40",
    green: "border-green-700 bg-green-950/40",
    yellow: "border-yellow-700 bg-yellow-950/40",
    red: "border-red-700 bg-red-950/40",
    purple: "border-purple-700 bg-purple-950/40",
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.blue}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{title}</span>
        {Icon && <Icon className="w-5 h-5 text-gray-500" />}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}
