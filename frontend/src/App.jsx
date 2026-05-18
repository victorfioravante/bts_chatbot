import { Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { RainAlert } from "./components/RainAlert";
import { useSSE } from "./hooks/useSSE";
import Dashboard from "./pages/Dashboard";
import Monitor from "./pages/Monitor";
import AutoMsg from "./pages/AutoMsg";
import RainHistory from "./pages/RainHistory";
import Settings from "./pages/Settings";
import Aprovacoes from "./pages/Aprovacoes";
import Trivia from "./pages/Trivia";

export default function App() {
  useSSE();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <RainAlert />
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/auto" element={<AutoMsg />} />
          <Route path="/aprovacoes" element={<Aprovacoes />} />
          <Route path="/trivia" element={<Trivia />} />
          <Route path="/rain" element={<RainHistory />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
