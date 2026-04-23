import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Overpass has no browser CORS; proxy keeps requests same-origin in dev.
      "/api/overpass": {
        target: "https://overpass-api.de",
        changeOrigin: true,
        rewrite: () => "/api/interpreter",
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader(
              "User-Agent",
              "YourTourGuide/2 (+https://github.com/duliptharaka/Tourism_Map_Info_Search; vite-dev-proxy)"
            );
            proxyReq.setHeader("Accept", "application/json");
          });
        },
      },
      "/api/photon": {
        target: "https://photon.komoot.io",
        changeOrigin: true,
        rewrite: (path) => {
          const q = path.includes("?") ? path.slice(path.indexOf("?")) : "";
          return `/api/${q}`;
        },
      },
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
