import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, RefreshCw, Plug, PlugZap, Copy, ExternalLink, CheckCircle, XCircle, Clock } from "lucide-react";

const API = "/api/v1";

const CONSOLE_CMD = `copy(window.__vue_store__?.state?.chat?.user?.socketToken)`;

const SOURCE_LABELS = {
  ui:    { label: "Token da UI (ativo)",    color: "text-green-400",  icon: "✓" },
  env:   { label: "Token do .env (ativo)",  color: "text-blue-400",   icon: "⚙" },
  login: { label: "Login automático",       color: "text-blue-400",   icon: "⚙" },
  none:  { label: "Sem token ativo",        color: "text-red-400",    icon: "✗" },
};

function formatAge(seconds) {
  if (seconds === null) return "";
  if (seconds < 60) return `${seconds}s atrás`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m atrás`;
  return `${Math.floor(seconds / 3600)}h atrás`;
}

export default function Settings() {
  const qc = useQueryClient();
  const { data: cfg, isLoading, refetch } = useQuery({
    queryKey: ["config"],
    queryFn: () => fetch(`${API}/config`).then((r) => r.json()),
  });

  const { data: authStatus, refetch: refetchAuth } = useQuery({
    queryKey: ["authStatus"],
    queryFn: () => fetch(`${API}/auth/status`).then((r) => r.json()),
    refetchInterval: 10000,
  });

  const [token, setToken] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [cmdCopied, setCmdCopied] = useState(false);
  const [applyFeedback, setApplyFeedback] = useState(null);
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

  const applyToken = async () => {
    if (!token.trim()) return;
    setApplyFeedback({ loading: true, text: "Aplicando..." });
    try {
      const res = await fetch(`${API}/socket-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          fingerprint: fingerprint.trim() || undefined,
          autoConnect: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setApplyFeedback({ ok: true, text: "✓ Token aplicado — conectando..." });
        setToken("");
        setTimeout(() => {
          setApplyFeedback(null);
          refetchAuth();
          qc.invalidateQueries(["status"]);
        }, 3000);
      } else {
        setApplyFeedback({ ok: false, text: `✗ ${data.error || "Erro"}` });
        setTimeout(() => setApplyFeedback(null), 4000);
      }
    } catch {
      setApplyFeedback({ ok: false, text: "✗ Falha na requisição" });
      setTimeout(() => setApplyFeedback(null), 4000);
    }
  };

  const copyCmd = () => {
    navigator.clipboard.writeText(CONSOLE_CMD).then(() => {
      setCmdCopied(true);
      setTimeout(() => setCmdCopied(false), 2500);
    });
  };

  const connect = (endpoint) =>
    fetch(`${API}/${endpoint}`, { method: "POST" });

  const src = authStatus ? SOURCE_LABELS[authStatus.source] || SOURCE_LABELS.none : null;

  if (isLoading) return <div className="p-6 text-gray-400">Carregando...</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Configurações</h1>

      {/* Auth */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-300">Autenticação</h2>
          {src && (
            <span className={`text-xs font-medium ${src.color} flex items-center gap-1`}>
              {src.icon} {src.label}
              {authStatus?.tokenAge ? <span className="text-gray-500 ml-1">({formatAge(authStatus.tokenAge)})</span> : null}
            </span>
          )}
        </div>

        {/* Token input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Socket Token</label>
            <button
              onClick={() => setShowGuide((v) => !v)}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              {showGuide ? "▲ Esconder guia" : "▼ Como pegar o token"}
            </button>
          </div>

          {showGuide && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-3">
              <p className="text-xs text-gray-300 font-medium">Passo a passo:</p>
              <ol className="text-xs text-gray-400 space-y-1.5 list-decimal list-inside">
                <li>Abra o Bitsler e faça login normalmente</li>
                <li>Pressione <kbd className="bg-gray-700 px-1 rounded text-gray-200">F12</kbd> para abrir o DevTools</li>
                <li>Clique na aba <span className="text-gray-200">Console</span></li>
                <li>Cole e execute o comando abaixo — o token vai para a área de transferência</li>
                <li>Volte aqui e cole no campo de token</li>
              </ol>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-950 text-green-400 text-xs px-3 py-2 rounded font-mono break-all">
                  {CONSOLE_CMD}
                </code>
                <button
                  onClick={copyCmd}
                  className={`shrink-0 flex items-center gap-1 px-3 py-2 rounded text-xs font-medium border transition-colors ${
                    cmdCopied
                      ? "bg-green-900/40 border-green-700 text-green-400"
                      : "bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <Copy className="w-3 h-3" />
                  {cmdCopied ? "Copiado!" : "Copiar"}
                </button>
              </div>
              <a
                href="https://www.bitsler.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="w-3 h-3" /> Abrir Bitsler em nova aba
              </a>
            </div>
          )}

          <input
            type="password"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600"
            placeholder="Cole o socketToken aqui..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyToken()}
          />
        </div>

        {/* Fingerprint */}
        <div>
          <label className="text-xs text-gray-400">
            Fingerprint <span className="text-gray-600">(opcional)</span>
          </label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 mt-1 focus:outline-none focus:border-blue-600"
            placeholder="Deixe vazio para usar o padrão"
            value={fingerprint}
            onChange={(e) => setFingerprint(e.target.value)}
          />
        </div>

        {/* Apply button */}
        <div className="flex items-center gap-3">
          <button
            onClick={applyToken}
            disabled={!token.trim() || applyFeedback?.loading}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plug className="w-4 h-4" />
            Aplicar e Conectar
          </button>
          {applyFeedback && (
            <span className={`text-sm font-medium ${applyFeedback.ok ? "text-green-400" : applyFeedback.loading ? "text-gray-400" : "text-red-400"}`}>
              {applyFeedback.text}
            </span>
          )}
        </div>
      </section>

      {/* Connection */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-300">Conexão manual</h2>
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
