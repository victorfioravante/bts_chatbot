import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Play, Pause, Send, ChevronDown, ChevronUp } from "lucide-react";

const API = "/api/v1";

function ProfileCard({ profile, onToggle, onDelete, onTest, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState({ ...profile });

  const save = () => onUpdate(profile.id, editing);

  return (
    <div className={`bg-gray-900 border rounded-xl overflow-hidden ${profile.ativo ? "border-blue-700" : "border-gray-800"}`}>
      <div className="flex items-center gap-3 p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${profile.ativo ? "bg-green-400" : "bg-gray-600"}`} />
            <span className="font-semibold text-white">{profile.nome}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Canais: {profile.canais.join(", ")} | Intervalo: {profile.intervaloMin}–{profile.intervaloMax}s | {profile.mensagens?.length || 0} msgs
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onTest(profile.id)}
            title="Testar"
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
          >
            <Send className="w-4 h-4" />
          </button>
          <button
            onClick={() => onToggle(profile.id)}
            className={`p-1.5 rounded ${profile.ativo ? "text-green-400 hover:bg-green-900" : "text-gray-400 hover:bg-gray-700"}`}
          >
            {profile.ativo ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onDelete(profile.id)}
            className="p-1.5 text-red-400 hover:bg-red-900 rounded"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-800 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">Nome</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white mt-1"
                value={editing.nome}
                onChange={(e) => setEditing((p) => ({ ...p, nome: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Canais (vírgula)</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white mt-1"
                value={editing.canais.join(", ")}
                onChange={(e) =>
                  setEditing((p) => ({ ...p, canais: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))
                }
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Intervalo Mín (s)</label>
              <input
                type="number"
                min="60"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white mt-1"
                value={editing.intervaloMin}
                onChange={(e) => setEditing((p) => ({ ...p, intervaloMin: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Intervalo Máx (s)</label>
              <input
                type="number"
                min="60"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white mt-1"
                value={editing.intervaloMax}
                onChange={(e) => setEditing((p) => ({ ...p, intervaloMax: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Início</label>
              <input
                type="time"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white mt-1"
                value={editing.horarioInicio}
                onChange={(e) => setEditing((p) => ({ ...p, horarioInicio: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Fim</label>
              <input
                type="time"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white mt-1"
                value={editing.horarioFim}
                onChange={(e) => setEditing((p) => ({ ...p, horarioFim: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">
              Mensagens (uma por linha, mín. 10 chars)
            </label>
            <textarea
              rows={6}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white mt-1 font-mono"
              value={editing.mensagens.join("\n")}
              onChange={(e) =>
                setEditing((p) => ({
                  ...p,
                  mensagens: e.target.value.split("\n").filter((l) => l.trim().length >= 10),
                }))
              }
            />
            <p className="text-xs text-gray-500 mt-1">
              {editing.mensagens.length} mensagens válidas (≥10 chars, sem bet tags, sem comandos)
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={editing.pausarDuranteRain}
              onChange={(e) => setEditing((p) => ({ ...p, pausarDuranteRain: e.target.checked }))}
            />
            Pausar durante Rain
          </label>

          <button
            onClick={save}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Salvar
          </button>
        </div>
      )}
    </div>
  );
}

export default function AutoMsg() {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => fetch(`${API}/profiles`).then((r) => r.json()),
    refetchInterval: 5000,
  });

  const toggle = useMutation({
    mutationFn: (id) => fetch(`${API}/profiles/${id}/toggle`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries(["profiles"]),
  });

  const remove = useMutation({
    mutationFn: (id) => fetch(`${API}/profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(["profiles"]),
  });

  const test = useMutation({
    mutationFn: (id) => fetch(`${API}/profiles/${id}/test`, { method: "POST" }),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) =>
      fetch(`${API}/profiles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries(["profiles"]),
  });

  const create = useMutation({
    mutationFn: () =>
      fetch(`${API}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: "Novo Perfil",
          canais: ["en"],
          mensagens: ["Good luck everyone hope you win today"],
          intervaloMin: 480,
          intervaloMax: 520,
          ativo: false,
        }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries(["profiles"]),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Auto-Mensagens</h1>
        <button
          onClick={() => create.mutate()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Novo Perfil
        </button>
      </div>

      <div className="bg-blue-950 border border-blue-800 rounded-xl p-3 text-sm text-blue-200">
        <strong>Estratégia Rain:</strong> Intervalo padrão de 480–520s (~8 min) garante sempre
        uma mensagem dentro da janela de 10 min do Chat Rain. Mensagens ≥10 chars, sem bet tags.
      </div>

      {profiles.length === 0 ? (
        <p className="text-gray-500">Nenhum perfil criado. Clique em "Novo Perfil" para começar.</p>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              onToggle={(id) => toggle.mutate(id)}
              onDelete={(id) => remove.mutate(id)}
              onTest={(id) => test.mutate(id)}
              onUpdate={(id, data) => update.mutate({ id, data })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
