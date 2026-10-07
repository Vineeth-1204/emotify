import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    testTimeout: 15000,
    setupFiles: ["./vitest.setup.ts"],
    server: {
      deps: {
        inline: ["convex-test"]
      }
    }
  },
});
