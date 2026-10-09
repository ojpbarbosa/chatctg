import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/web/src/**/*.test.tsx"],
    environment: "node",
    testTimeout: 10_000,
  },
});
