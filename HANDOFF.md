# Session Handoff

> Updated 2026-09-14 after moving active development from `mbp-work` to Patrick's current Mac.
> Repository docs and Git remain authoritative; this file records the latest verified operating state.

## Current State

- Production: https://markbase.io
- Repository: `wiseyoda/markbase`
- Baseline: `main` at `051cf72` (`chore(docs): consolidate agent instructions into AGENTS.md`)
- Versioning: date-based `YYYY.MMDD` in `VERSION`
- Stack: Next.js 16, React 19, Auth.js v5 beta, Tailwind v4, Postgres, Vercel AI SDK
- Current machine runtime: Node `24.13.0` from `.node-version`, pnpm `10.27.0`
- Local configuration and database schema checks pass without exposing credentials
- Verification on 2026-09-14: typecheck, lint, production build, and all 323 unit/integration tests passed; coverage thresholds were met

The app supports GitHub sign-in, authenticated repository browsing, rendered markdown, file/folder/repository shares, inline threaded comments, file history, AI summaries/change digests, and a remote OAuth-protected MCP server.

## Recent Material Changes

PRs #7-#10 landed after the previous handoff:

- **Production trust boundaries (#7):** removed the public migration route, added CLI-only migration/readiness commands, hardened test auth/reset, pinned Node/pnpm, and added the public security page.
- **Postgres test readiness (#8):** waits for the final Postgres server during cold testcontainer startup.
- **Resource authorization (#9):** added deny-by-default repository/branch/path capabilities across comments, shares, history, and MCP; hardened optimistic UI failure recovery.
- **Credential blast-radius reduction (#10):** added immutable tokenless file-share snapshots, private-repository AI controls, and server-side revocable MCP grants with refresh rotation.

The production Batch C schema migration was applied and read back successfully before PR #10 merged.

## Operational Contract

- Read `AGENTS.md`, then the relevant files in `docs/`, before framework or infrastructure work.
- Use `pnpm db:migrate` and `pnpm db:status`; migrations are never exposed through an HTTP route.
- Always run `pnpm build` in addition to typecheck. Next.js/Turbopack catches client/server boundary failures TypeScript misses.
- Keep the Vercel database pool maximum at 1 unless the Prisma Accelerate connection limit is deliberately changed.
- `[...path]` parameters require explicit `decodeURIComponent` under Next.js 16.
- Keep `LANGUAGE_COLORS` in `src/lib/language-colors.ts` so server-only cache imports cannot enter client bundles.
- GitHub push invalidation requires `GITHUB_WEBHOOK_SECRET`; the endpoint returns 503 when it is absent.
- Local auth bypass is `AUTH_BYPASS=true` plus `GITHUB_PAT`; use `/?preview` to inspect the landing page.
- `.mcp.json` wires the local `cra` review MCP server from `~/dev/code-review-agent`.

## Remaining Product Work

- GitHub App installation access with selected repositories and short-lived credentials.
- Immutable repo/folder shares, or GitHub App-backed live shares.
- Per-repository private-AI consent and deletion controls.
- User-facing MCP grant inventory and revocation UI.
- Real-time comment updates and notifications.
- Full-text/semantic documentation search and analytics.
- CI browser E2E/build parity hardening.

## Machine Move

Development now runs from `/Users/patrickpatterson/dev/markbase` on Patrick's current Mac. The old `laptop` Git remote was removed. Local-only artifacts from `mbp-work` were preserved in `/Users/patrickpatterson/dev/markbase-mbp-work-local-artifacts-2026-09-14`, while active local environment and Vercel linkage files were verified byte-for-byte on the current machine.
