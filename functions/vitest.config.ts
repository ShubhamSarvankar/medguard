import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/*.integration.test.ts",
    ],
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/pipeline/**",
        "src/share/**",
        "src/ai/**",
        "src/audit/**",
        "src/user/**",
        "src/records/**",
      ],
      exclude: [
        "src/pipeline/onRecordWrite.ts",
        "src/pipeline/phiExtractClient.ts",
        "src/records/createRecord.ts",
        "src/records/getRecordKey.ts",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@medguard/types": resolve(__dirname, "../types/src/index.ts"),
    },
  },
});