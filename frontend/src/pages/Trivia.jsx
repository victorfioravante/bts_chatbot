import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Gamepad2 } from "lucide-react";

const API = "/api/v1";

const THEME_LABELS = {
  crypto_terms: "Termos Crypto",
  top100_coins: "Top 100 Moedas",
  bitsler_terms: "Termos Bitsler",
  casino_terms: "Termos Casino",
};

// ─── Theme selector ──────────────────────────────────────────────────────────

function ThemeSelector() {
  const qc = useQueryClient();

  const { data: themesData } = useQuery({
    queryKey: ["triviaThemes"],
    queryFn: () => fetch(`${API}/trivia/themes`).then((r) => r.json()),
    refetchInterval: 10000,
  });

  const setTheme = useMutation({
    mutationFn: (theme) =>
      fetch(`${API}/trivia/theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries(["triviaThemes"]),
  });

  const active = themesData?.active || "crypto_terms";
  const themes = themesData?.themes || Object.keys(THEME_LABELS);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-white">Tema do Dia</h2>
      <p className="text-xs text-gray-500">Define qual banco de palavras é usado nas sugestões e onde respostas novas são salvas automaticamente.</p>
      <div className="grid grid-cols-2 gap-2">
        {themes.map((t) => (
          <button
            key={t}
            onClick={() => setTheme.mutate(t)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left ${
              active === t
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {active === t && <span className="mr-1.5">✓</span>}
            {THEME_LABELS[t] || t}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Word list manager ───────────────────────────────────────────────────────

function WordList() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("crypto_terms");
  const [newWord, setNewWord] = useState("");
  const [filter, setFilter] = useState("");
  const [feedback, setFeedback] = useState(null);

  const { data: allWords = {} } = useQuery({
    queryKey: ["triviaWords"],
    queryFn: () => fetch(`${API}/trivia/words`).then((r) => r.json()),
    refetchInterval: 15000,
  });

  const words = allWords[activeTab] || [];

  const addMutation = useMutation({
    mutationFn: (word) =>
      fetch(`${API}/trivia/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, theme: activeTab }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) {
        setFeedback({ ok: false, msg: data.error });
      } else {
        setFeedback({ ok: true, msg: `"${data.word}" adicionada!` });
        setNewWord("");
      }
      qc.invalidateQueries(["triviaWords"]);
      setTimeout(() => setFeedback(null), 3000);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (word) =>
      fetch(`${API}/trivia/words/${encodeURIComponent(word)}?theme=${activeTab}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(["triviaWords"]),
  });

  const filtered = filter
    ? words.filter((w) => w.toLowerCase().includes(filter.toLowerCase()))
    : words;

  const grouped = filtered.reduce((acc, w) => {
    const key = w[0].toUpperCase();
    if (!acc[key]) acc[key] = [];
    acc[key].push(w);
    return acc;
  }, {});

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
      <h2 className="text-sm font-semibold text-white">Banco de Palavras</h2>

      {/* Theme tabs */}
      <div className="flex gap-1 flex-wrap">
        {Object.entries(THEME_LABELS).map(([k, v]) => (
          <button
            key={k}
            onClick={() => { setActiveTab(k); setFilter(""); }}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeTab === k ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {v}
            <span className="ml-1 text-gray-500">{allWords[k]?.length || 0}</span>
          </button>
        ))}
      </div>

      {/* Add word */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && newWord.trim() && addMutation.mutate(newWord.trim())}
          placeholder={`Nova palavra em "${THEME_LABELS[activeTab]}"...`}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
        />
        <button
          onClick={() => newWord.trim() && addMutation.mutate(newWord.trim())}
          className="bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
      {feedback && (
        <p className={`text-xs font-medium ${feedback.ok ? "text-green-400" : "text-red-400"}`}>{feedback.msg}</p>
      )}

      {/* Filter */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar..."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
      />

      {/* Grouped list */}
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {Object.keys(grouped).length === 0 && (
          <p className="text-xs text-gray-600">Nenhuma palavra neste tema.</p>
        )}
        {Object.keys(grouped).sort().map((letter) => (
          <div key={letter}>
            <p className="text-xs font-bold text-gray-600 mb-1.5">— {letter} —</p>
            <div className="flex flex-wrap gap-1.5">
              {grouped[letter].map((w) => (
                <span
                  key={w}
                  className="group flex items-center gap-1 bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono px-2 py-1 rounded"
                >
                  {w}
                  <button
                    onClick={() => removeMutation.mutate(w)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Trivia() {
  const qc = useQueryClient();

  useEffect(() => {
    const handler = () => qc.invalidateQueries(["triviaWords"]);
    window.addEventListener("triviaWordAdded", handler);
    return () => window.removeEventListener("triviaWordAdded", handler);
  }, [qc]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-amber-400" />
          Trivia — Banco de Palavras
        </h1>
        <span className="text-xs text-gray-500">Detecção automática · auto-adiciona respostas · gerencie no Monitor</span>
      </div>

      <ThemeSelector />
      <WordList />
    </div>
  );
}
