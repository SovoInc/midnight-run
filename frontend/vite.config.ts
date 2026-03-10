import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/g/midnight-run/" : "/",
  build: {
    outDir: "../server/static",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/metrics": "http://localhost:3001",
      "/achievements": "http://localhost:3001",
    },
  },
}));
