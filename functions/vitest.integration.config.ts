import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    env: {
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
      FUNCTIONS_EMULATOR_HOST: "127.0.0.1:5001",
      GCLOUD_PROJECT: "medguard-dev",
      USE_EMULATORS: "true",
    },
  },
  resolve: {
    alias: {
      "@medguard/types": resolve(__dirname, "../types/src/index.ts"),
    },
  },
});