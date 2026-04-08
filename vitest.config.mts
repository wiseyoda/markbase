import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

const testConfig = {
  environment: "jsdom",
  setupFiles: ["./tests/setup/vitest.setup.ts"],
  include: ["tests/**/*.test.{ts,tsx}"],
  globals: true,
  maxWorkers: 1,
  minWorkers: 1,
  css: true,
  coverage: {
    provider: "v8",
    reporter: ["text", "html"],
    all: true,
    include: [
      "src/auth.ts",
      "src/proxy.ts",
      "src/lib/**/*.{ts,tsx}",
      "src/app/**/route.ts",
      "src/app/repos/[owner]/[repo]/share-actions.ts",
      "src/app/repos/[owner]/[repo]/[...path]/comment-actions.ts",
      "src/app/repos/[owner]/[repo]/[...path]/history-actions.ts",
    ],
    exclude: [
      "src/**/*.d.ts",
      "src/lib/mcp/types.ts",
      "src/app/api/test/reset/route.ts",
    ],
    thresholds: {
      lines: 99,
      functions: 99,
      branches: 93,
      statements: 98,
    },
  },
};

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  // Next's TS worker doesn't include every accepted Vitest coverage field.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  test: testConfig as any,
});
