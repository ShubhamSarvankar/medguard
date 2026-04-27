import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@medguard/types": resolve(__dirname, "../types/src/index.ts"),
    },
  },
  build: {
    target: "es2020",
    sourcemap: true,
  },
});