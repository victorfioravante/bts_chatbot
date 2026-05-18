import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api/v1/sse": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: false,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["cache-control"] = "no-cache";
            proxyRes.headers["x-accel-buffering"] = "no";
          });
        },
      },
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
