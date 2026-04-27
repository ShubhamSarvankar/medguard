import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    reporters: ["verbose"],
    testTimeout: 15000,
    env: {
      // Suppress @testing-library DOM snapshots in error output.
      // Use screen.debug() explicitly when you need the full tree.
      DEBUG_PRINT_LIMIT: "0",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/features/**", "src/components/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@medguard/types": resolve(__dirname, "../types/src/index.ts"),
    },
  },
});