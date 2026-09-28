import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Порт ядра: CORE_PORT=8100 npm run dev (когда 8000 занят другим API).
const corePort = Number(process.env.CORE_PORT ?? 8000);
const coreTarget = `http://localhost:${corePort}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(dirname, "src") } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: coreTarget, changeOrigin: true },
      "/ws": { target: coreTarget.replace("http", "ws"), ws: true },
    },
  },
});
