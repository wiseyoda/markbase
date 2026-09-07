# Markbase
Vercel-hosted web app: sign in with GitHub, browse markdown files across repos with rendering,
share via links or with specific users, collaborate with inline comments. Production:
https://markbase.io. Repo: wiseyoda/markbase. Status: active.

Read first: `HANDOFF.md` (live state) -> `docs/` (project structure, testing, full traps list).
Never infer status from this file.

## Commands
```bash
pnpm dev              # start dev server (localhost:3000)
pnpm build            # production build (always run this, not just tsc — see Traps)
pnpm lint             # ESLint
npx tsc --noEmit      # type check
pnpm env:check        # validate local config without printing secrets
pnpm db:migrate       # apply the current idempotent schema
pnpm db:status        # read-only schema readiness check
pnpm test:unit        # unit + integration tests (Vitest, coverage enforced)
pnpm test:e2e         # E2E tests (Playwright, requires build + Docker)
```
After DB schema changes: `pnpm db:migrate` then `pnpm db:status`. Migrations are never exposed
through an HTTP route.

## Layout
- `src/app/` — routes: dashboard, `repos/[owner]/[repo]` viewer, `s/[id]` public share viewer,
  `shares/`, `api/mcp` MCP server, `api/github/webhook`
- `src/components/` — shared UI (file tree, command palette, bottom sheet, toasts, theme)
- `src/lib/` — GitHub API/cache, DB, comments, shares, markdown, crypto, MCP internals
- Full annotated tree: `docs/project-structure.md`
- Design context (brand personality, color rules, references): `.impeccable.md`
- Tech stack: Next.js 16, Auth.js v5 beta, Tailwind v4 (class-based dark mode), postgres.js,
  react-markdown, rehype-raw, rehype-sanitize, Vercel AI SDK
- Env var contract: `.env.example` — `PRISMA_DATABASE_URL` preferred over `POSTGRES_URL`;
  `AUTH_BYPASS=true` + `GITHUB_PAT` for local dev without OAuth (visit `/?preview` for the landing
  page); `SHARE_ENCRYPTION_KEY` must be 64-char hex

## Rules
- Testing setup, fixtures, patterns: `docs/testing.md`. Coverage thresholds are authoritative in
  `vitest.config.mts` — don't duplicate numeric claims elsewhere
- One accent family: blue `#86D5F4`; green for inline code only. Raw hex is too washed out on
  white — use `text-sky-500 dark:text-[#86D5F4]` for readable accent text
- Class-based dark mode via `.dark` on `<html>` + `@variant dark` in CSS; theme in localStorage
  `markbase-theme` (light/dark/system), FOUC prevention via `next/script`
- Touch targets: 44px minimum on coarse pointers
- CI (GitHub Actions): pinned Node/pnpm, environment contract, strict typecheck/lint, unit tests;
  browser E2E/build parity is a queued hardening gate
- Versioning: date-based `YYYY.MMDD` in `VERSION` file. Branch protection: force-push and deletion
  blocked on `main`

## MCP Server
Remote HTTP MCP server at `/api/mcp`, GitHub OAuth, stateless (Vercel-compatible). Tools:
`list_files_with_comments`, `get_comments`, `add_comment`, `reply_to_comment`, `resolve_comment`,
`bulk_resolve_comments`, `reply_and_resolve`, `unresolve_comment`, `delete_comment`.
Add to Claude Code: `claude mcp add --transport http markbase https://markbase.io/api/mcp`

## Traps
- Always run `pnpm build`, not just `tsc` — Turbopack catches client/server boundary violations
  TypeScript misses
- `[...path]` params need `decodeURIComponent` — Next.js 16 does not auto-decode catch-all segments
- `LANGUAGE_COLORS` must stay in `language-colors.ts` — moving it into `dashboard.ts` breaks the
  client/server import chain
- DB pool max is 1 on Vercel (Prisma Accelerate connection limit) — don't increase without
  understanding why
- Rapid Vercel deploys may not all auto-promote — check the deployments page and promote manually
  if needed
- GitHub webhook requires `GITHUB_WEBHOOK_SECRET`; without it the endpoint returns 503
- This is Next.js 16, not the Next.js most training data describes — APIs, conventions, and file
  structure may differ. Read the relevant guide in `node_modules/next/dist/docs/` before writing
  framework code, and heed deprecation notices.
- Full list (28 items — DB, auth, comments, GitHub URL/path encoding, etc.): `docs/TRAPS.md`

## Cross-CLI
`.mcp.json` wires the `cra` (code-review-agent) MCP server here; AGENTS.md is canonical across CLIs.
