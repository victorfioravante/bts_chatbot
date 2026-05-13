import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Save, RefreshCw, Plug, PlugZap } from "lucide-react";

const API = "/api/v1";

export default function Settings() {
  const { data: cfg, isLoading, refetch } = useQuery({
    queryKey: ["config"],
    queryFn: () => fetch(`${API}/config`).then((r) => r.json()),
  });

  const [token, setToken] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (body) =>
      fetch(`${API}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      refetch();
    },
  });

  const connect = (endpoint) =>
    fetch(`${API}/${endpoint}`, { method: "POST" });

  if (isLoading) return <div className="p-6 text-gray-400">Carregando...</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Configurações</h1>

      {/* Auth */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-300">Autenticação</h2>
        <div>
          <label className="text-xs text-gray-400">
            Socket Token (JWT — não versionar)
          </label>
          <input
            type="password"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mt-1"
            placeholder="Cole seu socketToken aqui"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            Obtenha via: DevTools → Console →{" "}
            <code className="bg-gray-800 px-1 rounded">
              copy(window.__vue_store__?.state?.chat?.user?.socketToken)
            </code>
          </p>
        </div>
        <div>
          <label className="text-xs text-gray-400">Fingerprint (20 chars)</label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mt-1"
            placeholder="window.tracer.getFp()"
            value={fingerprint}
            onChange={(e) => setFingerprint(e.target.value)}
          />
        </div>
        <p className="text-xs text-yellow-400">
          O token e o fingerprint são salvos apenas como variáveis de ambiente (.env) — nunca em arquivos versionados.
        </p>
      </section>

      {/* Connection */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-300">Conexão</h2>
        <div className="flex gap-3">
          <button
            onClick={() => connect("connect")}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            <Plug className="w-4 h-4" /> Conectar
          </button>
          <button
            onClick={() => connect("disconnect")}
            className="flex items-center gap-2 bg-red-800 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            <PlugZap className="w-4 h-4" /> Desconectar
          </button>
        </div>
      </section>

      {/* Channels */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-300">Canais (Auto-Join)</h2>
        <input
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
          defaultValue={(cfg?.channels?.autoJoin || []).join(", ")}
          onBlur={(e) =>
            save.mutate({
              channels: {
                autoJoin: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              },
            })
          }
        />
        <p className="text-xs text-gray-500">
          Canais válidos para Rain: en, br, fr, in, id, ph, ru, es, pk, rs
        </p>
      </section>

      {/* Rain Monitor */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-300">Monitor de Rain</h2>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            defaultChecked={cfg?.rainMonitor?.enabled}
            onChange={(e) => save.mutate({ rainMonitor: { enabled: e.target.checked } })}
          />
          Ativar detecção de Rain
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            defaultChecked={cfg?.rainMonitor?.sound}
            onChange={(e) => save.mutate({ rainMonitor: { sound: e.target.checked } })}
          />
          Som de alerta
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            defaultChecked={cfg?.rainMonitor?.nativeNotification}
            onChange={(e) => save.mutate({ rainMonitor: { nativeNotification: e.target.checked } })}
          />
          Notificação nativa do sistema
        </label>
        <div>
          <label className="text-xs text-gray-400">Webhook URL (opcional)</label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mt-1"
            defaultValue={cfg?.rainMonitor?.webhookUrl || ""}
            placeholder="https://..."
            onBlur={(e) => save.mutate({ rainMonitor: { webhookUrl: e.target.value } })}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm px-3 py-2 rounded border border-gray-700"
        >
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
        {saved && <span className="text-green-400 text-sm">Salvo!</span>}
      </div>
    </div>
  );
}
