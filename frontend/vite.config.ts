import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/metrics": "http://localhost:3001",
      "/achievements": "http://localhost:3001",
    },
  },
});
