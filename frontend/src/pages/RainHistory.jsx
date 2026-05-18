import { useQuery } from "@tanstack/react-query";
import { CloudRain } from "lucide-react";

function formatTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts > 1e10 ? ts : ts * 1000);
  return d.toLocaleString("pt-BR");
}

export default function RainHistory() {
  const { data: rains = [], isLoading } = useQuery({
    queryKey: ["rainHistory"],
    queryFn: () => fetch("/api/v1/rain/history?limit=100").then((r) => r.json()),
    refetchInterval: 15000,
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-white">Histórico de Rain</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="p-4 text-gray-500">Carregando...</p>
        ) : rains.length === 0 ? (
          <p className="p-4 text-gray-500">Nenhum rain detectado ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Valor</th>
                <th className="px-4 py-2 text-left">Canal</th>
                <th className="px-4 py-2 text-left">Remetente</th>
                <th className="px-4 py-2 text-left">Usuários</th>
                <th className="px-4 py-2 text-left">Data/Hora</th>
              </tr>
            </thead>
            <tbody>
              {[...rains].reverse().map((r, i) => (
                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800" title={r.comment || ""}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <CloudRain className="w-4 h-4 text-blue-400" />
                      <span className="text-blue-300 capitalize">{r.type === "system-rain" ? "system" : r.type}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-white font-semibold">
                    {r.amount > 0 ? `${r.currency?.toUpperCase()} ${r.amount}` : <span className="text-gray-500 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-300">{r.channel}</td>
                  <td className="px-4 py-2 text-purple-300">{r.username}</td>
                  <td className="px-4 py-2 text-gray-400">{r.recipients ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-400">{formatTs(r.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
