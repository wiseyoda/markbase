# Testing

Moved out of `AGENTS.md` on 2026-09-07 (consolidation pass) — linked from `AGENTS.md` § Rules.

## Unit + Integration (Vitest)

`pnpm test:unit` — coverage-enforced source, route, and action tests.

- Config: `vitest.config.mts`, setup in `tests/setup/`
- Unit tests: `tests/unit/` — pure logic, mocked dependencies
- Integration tests: `tests/integration/` — hit real Postgres via testcontainers
- Integration helper: `tests/helpers/postgres.ts` — `useTestDatabase()` hook spins up a container
- Coverage thresholds are authoritative in `vitest.config.mts`; do not duplicate numeric claims here

## E2E (Playwright)

`pnpm test:e2e` — requires `pnpm build` first + Docker for Postgres.

- Config: `playwright.config.ts`, tests in `tests/e2e/`
- `scripts/test-app-server.mjs` starts: mock GitHub server (port 4100), testcontainers Postgres,
  Next.js production server (port 3101)
- GitHub API is fully mocked via env vars (`GITHUB_API_BASE_URL`, `GITHUB_WEB_BASE_URL`,
  `GITHUB_RAW_BASE_URL`)
- Test auth: cookie-based (`markbase-test-session`) — no real OAuth needed
- Test fixtures: `tests/fixtures/mock-github.json`
- `MARKBASE_TEST_MODE=true` enables test auth and the `/api/test/reset` endpoint

## Key patterns

- GitHub URLs use `github-config.ts` helpers (not hardcoded), enabling test mock servers
- `process.env.NODE_ENV` is read-only in TS strict mode — cast via
  `(process.env as Record<string, string | undefined>)` in tests
- Auth supports three modes: NextAuth (production), bypass (local dev), test cookie (tests)
