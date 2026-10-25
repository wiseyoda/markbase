import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Vite 8 resolves tsconfig `paths` (the `@/*` alias) natively.
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside an RSC graph; tests import the data layer directly.
      "server-only": fileURLToPath(new URL("./tests/setup/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: true,
    // Integration files share one testcontainers Postgres instance, so test
    // files must run serially.
    maxWorkers: 1,
    // Testcontainers Postgres cold-starts can exceed the default 10s when
    // running the full integration suite — each integration file stops the
    // container in afterAll and restarts it in beforeAll.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // An explicit `include` list makes v8 report untested matching files
      // too (the old `coverage.all` option no longer exists).
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
        "src/app/api/debug/**",
      ],
      thresholds: {
        // High bar, but pragmatic: the last percent of coverage in this
        // codebase is dev-only logging (NODE_ENV === "development" console.warn
        // lines) and fire-and-forget catch handlers for cache-only
        // optimizations whose failures must never fail a request. Testing
        // those paths requires mocking PostgreSQL errors AND NODE_ENV at the
        // same time, which produces brittle tests that catch nothing useful.
        lines: 98,
        functions: 98,
        branches: 91,
        statements: 97,
      },
    },
  },
});
