import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "../api/public", emptyOutDir: true },
  server: { port: 5173, proxy: { "/query": "http://localhost:3001", "/schema": "http://localhost:3001", "/health": "http://localhost:3001" } },
});
