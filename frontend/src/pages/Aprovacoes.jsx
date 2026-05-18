import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Trash2, Send, Clock, ShieldCheck, ShieldOff } from "lucide-react";
import { useStore } from "../store";

const API = "/api/v1";

const CHANNEL_COLORS = {
  en: "bg-blue-900 text-blue-200 border-blue-700",
  br: "bg-green-900 text-green-200 border-green-700",
  fr: "bg-purple-900 text-purple-200 border-purple-700",
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s atrás`;
  return `${Math.floor(s / 60)}m atrás`;
}

function timeLeft(expiresAt) {
  const s = Math.floor((expiresAt - Date.now()) / 1000);
  if (s <= 0) return "expirado";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function Aprovacoes() {
  const qc = useQueryClient();
  const { pendingMessages } = useStore();

  const [manualChannel, setManualChannel] = useState("en");
  const [manualMessage, setManualMessage] = useState("");
  const [sendFeedback, setSendFeedback] = useState(null);

  const { data: cfg } = useQuery({
    queryKey: ["config"],
    queryFn: () => fetch(`${API}/config`).then((r) => r.json()),
    refetchInterval: 5000,
  });

  const approvalMode = cfg?.autoMessage?.approvalMode ?? false;

  const toggleApproval = useMutation({
    mutationFn: () =>
      fetch(`${API}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoMessage: { approvalMode: !approvalMode } }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries(["config"]),
  });

  const approve = useMutation({
    mutationFn: (id) => fetch(`${API}/pending/${id}/approve`, { method: "POST" }).then((r) => r.json()),
  });

  const reject = useMutation({
    mutationFn: (id) => fetch(`${API}/pending/${id}/reject`, { method: "POST" }).then((r) => r.json()),
  });

  const clearAll = useMutation({
    mutationFn: () => fetch(`${API}/pending`, { method: "DELETE" }).then((r) => r.json()),
  });

  const manualSend = () => {
    if (!manualMessage.trim() || manualMessage.trim().length < 10) {
      setSendFeedback({ ok: false, msg: "Mensagem deve ter pelo menos 10 caracteres." });
      return;
    }
    fetch(`${API}/say`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: manualChannel, message: manualMessage.trim() }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setSendFeedback({ ok: true, msg: `Enviado para [${manualChannel}]` });
          setManualMessage("");
        } else {
          setSendFeedback({ ok: false, msg: "Falha ao enviar — socket desconectado?" });
        }
        setTimeout(() => setSendFeedback(null), 3000);
      });
  };

  const pending = pendingMessages;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Central de Controle</h1>
        <span className="text-xs text-gray-500">Modo teste — você aprova antes de enviar</span>
      </div>

      {/* Approval mode toggle */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${approvalMode ? "bg-amber-950 border-amber-700" : "bg-gray-900 border-gray-800"}`}>
        <div className="flex items-center gap-3">
          {approvalMode ? (
            <ShieldCheck className="w-5 h-5 text-amber-400" />
          ) : (
            <ShieldOff className="w-5 h-5 text-gray-500" />
          )}
          <div>
            <p className="text-sm font-semibold text-white">
              Modo Aprovação {approvalMode ? "ATIVO" : "inativo"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {approvalMode
                ? "Mensagens automáticas ficam retidas aqui até você aprovar."
                : "Mensagens automáticas são enviadas diretamente ao chat."}
            </p>
          </div>
        </div>
        <button
          onClick={() => toggleApproval.mutate()}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${approvalMode ? "bg-amber-500" : "bg-gray-700"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${approvalMode ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      {/* Manual send */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-400" />
          Envio Manual
        </h2>
        <div className="flex gap-2">
          <select
            value={manualChannel}
            onChange={(e) => setManualChannel(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white shrink-0"
          >
            {["en", "br", "fr", "in", "id", "ph", "ru", "es", "pk", "rs"].map((ch) => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </select>
          <input
            type="text"
            value={manualMessage}
            onChange={(e) => setManualMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && manualSend()}
            placeholder="Digite a mensagem (mín. 10 chars)..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
          />
          <button
            onClick={manualSend}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            Enviar
          </button>
        </div>
        {manualMessage.length > 0 && (
          <p className="text-xs text-gray-500">{manualMessage.length} caracteres</p>
        )}
        {sendFeedback && (
          <p className={`text-xs font-medium ${sendFeedback.ok ? "text-green-400" : "text-red-400"}`}>
            {sendFeedback.msg}
          </p>
        )}
      </div>

      {/* Pending queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Fila de Aprovação
            {pending.length > 0 && (
              <span className="bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
          </h2>
          {pending.length > 0 && (
            <button
              onClick={() => clearAll.mutate()}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950 px-2 py-1 rounded"
            >
              <Trash2 className="w-3 h-3" />
              Limpar tudo
            </button>
          )}
        </div>

        {!approvalMode && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-gray-500 text-center">
            Ative o Modo Aprovação para que as mensagens automáticas apareçam aqui antes de serem enviadas.
          </div>
        )}

        {approvalMode && pending.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-sm text-gray-500 text-center">
            Nenhuma mensagem aguardando. As próximas mensagens automáticas aparecerão aqui.
          </div>
        )}

        <div className="space-y-2">
          {pending.map((item) => (
            <div
              key={item.id}
              className="bg-gray-900 border border-amber-900 rounded-xl p-4 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${CHANNEL_COLORS[item.channel] || "bg-gray-800 text-gray-300 border-gray-700"}`}>
                    {item.channel}
                  </span>
                  <span className="text-xs text-gray-500">perfil: {item.profile}</span>
                  <span className="text-xs text-gray-600 ml-auto">
                    {timeAgo(item.createdAt)} · expira em {timeLeft(item.expiresAt)}
                  </span>
                </div>
                <p className="text-sm text-white break-all">{item.message}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => approve.mutate(item.id)}
                  title="Aprovar e enviar"
                  className="p-2 rounded-lg text-green-400 hover:bg-green-950 hover:text-green-300 transition-colors"
                >
                  <CheckCircle className="w-5 h-5" />
                </button>
                <button
                  onClick={() => reject.mutate(item.id)}
                  title="Rejeitar"
                  className="p-2 rounded-lg text-red-400 hover:bg-red-950 hover:text-red-300 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
