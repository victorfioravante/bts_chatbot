import { useEffect, useRef } from "react";
import { useStore } from "../store";

export function useSSE() {
  const {
    setConnected,
    setSseConnected,
    addMessage,
    prependHistory,
    addRainEvent,
    setUser,
    setChannels,
    setAutoMsgStats,
    handlePendingEvent,
    setPendingMessages,
    addTriviaEvent,
    addRainActivity,
    setRainIntel,
  } = useStore();

  const esRef = useRef(null);

  useEffect(() => {
    function connect() {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const es = new EventSource(`${backendUrl}/api/v1/sse`);
      esRef.current = es;

      es.addEventListener("open", () => {
        setSseConnected(true);
        fetch(`${backendUrl}/api/v1/history?limit=150`)
          .then((r) => r.json())
          .then(prependHistory)
          .catch(() => {});
        fetch(`${backendUrl}/api/v1/pending`)
          .then((r) => r.json())
          .then(setPendingMessages)
          .catch(() => {});
        fetch(`${backendUrl}/api/v1/rain/intel`)
          .then((r) => r.json())
          .then(setRainIntel)
          .catch(() => {});
      });

      es.addEventListener("status", (e) => {
        const data = JSON.parse(e.data);
        setConnected(data.connected);
      });

      es.addEventListener("message", (e) => {
        addMessage(JSON.parse(e.data));
      });

      es.addEventListener("rain", (e) => {
        addRainEvent(JSON.parse(e.data));
        if ("Notification" in window && Notification.permission === "granted") {
          const d = JSON.parse(e.data);
          new Notification("Rain detectado!", {
            body: `${d.currency?.toUpperCase()} ${d.amount} — canal: ${d.channel}`,
            icon: "/rain.svg",
          });
        }
      });

      es.addEventListener("user", (e) => setUser(JSON.parse(e.data)));
      es.addEventListener("channels", (e) => setChannels(JSON.parse(e.data)));
      es.addEventListener("autoMessageSent", (e) => {
        fetch("/api/v1/automsg/stats")
          .then((r) => r.json())
          .then(setAutoMsgStats)
          .catch(() => {});
      });

      es.addEventListener("triviaEvent", (e) => {
        const data = JSON.parse(e.data);
        addTriviaEvent(data);
        if (data.type === "hint" && "Notification" in window && Notification.permission === "granted") {
          const sugs = data.suggestions?.slice(0, 3).join(", ") || "sem sugestões";
          new Notification("Trivia detectado!", { body: `${data.hintRaw} → ${sugs}` });
        }
        if (data.type === "triviaWordAdded") {
          window.dispatchEvent(new Event("triviaWordAdded"));
        }
      });

      es.addEventListener("pendingMessage", (e) => {
        const data = JSON.parse(e.data);
        handlePendingEvent(data);
        if (data.type === "added" && "Notification" in window && Notification.permission === "granted") {
          new Notification("Mensagem aguardando aprovação", {
            body: `[${data.item.channel}] ${data.item.message}`,
          });
        }
      });

      es.addEventListener("rainActivity", (e) => {
        addRainActivity(JSON.parse(e.data));
        // Atualiza score via polling leve
        fetch(`${backendUrl}/api/v1/rain/intel`)
          .then((r) => r.json())
          .then(setRainIntel)
          .catch(() => {});
      });

      es.addEventListener("betResolved", (e) => {
        addRainActivity({ ...JSON.parse(e.data), isBet: true });
      });

      es.onerror = () => {
        setSseConnected(false);
        es.close();
        setTimeout(connect, 3000);
      };
    }

    connect();
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => esRef.current?.close();
  }, []);
}
