import { useEffect, useRef } from "react";
import { useStore } from "../store";

export function useSSE() {
  const {
    setConnected,
    setSseConnected,
    addMessage,
    addRainEvent,
    setUser,
    setChannels,
    setAutoMsgStats,
  } = useStore();

  const esRef = useRef(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource("/api/v1/sse");
      esRef.current = es;

      es.addEventListener("open", () => setSseConnected(true));

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
        // Trigger stats refresh
        fetch("/api/v1/automsg/stats")
          .then((r) => r.json())
          .then(setAutoMsgStats)
          .catch(() => {});
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
