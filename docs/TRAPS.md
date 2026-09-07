# Traps and constraints

Moved out of `AGENTS.md` on 2026-09-07 (consolidation pass, was "Key Constraints", 28 items —
over the 10-item inline cap). The 6 highest-impact traps stay inline in `AGENTS.md` § Traps; this
is the full list.

- DB uses Prisma Accelerate URLs (`db.prisma.io`), not direct Neon
- Comments have a `deleted_at` column for soft delete — `softDeleteComment` + `restoreComment`
- Migrations are idempotent — run via `/api/init-db`
- GitHub OAuth App callback URL is domain root
- Auth bypass (`AUTH_BYPASS=true` + `GITHUB_PAT`) for local dev — doesn't work with MCP
- React 19 lint: use `useSyncExternalStore` for browser API reads, not `useState` + `useEffect`
- Sidebar `closeSidebar` must check `window.innerWidth < 1024` — only close on mobile/tablet
- `next.config.ts` allows `avatars.githubusercontent.com` for `next/image`
- `file_key` format is `owner/repo/branch/path` — when building URLs for `/repos/owner/repo/path`,
  skip index 2 (branch)
- Comment positions use `getBoundingClientRect()` not `offsetParent` — scroll container has no CSS
  position
- Share `created_at` is a `Date` object from postgres.js, not a string — use `new Date(v).getTime()`
  for comparisons
- `initialComments` prop synced via render-time state derivation (not `useEffect` — React 19 lint)
- File paths with spaces: encode with `encodeURI()` for GitHub API/redirects, decode `[...path]`
  params with `decodeURIComponent`
- `LANGUAGE_COLORS` lives in `language-colors.ts` (client-safe) — do NOT import from
  `dashboard.ts` in client components
- `github-cache.ts` imports `next/cache` (server-only) — never import transitively from client
  components
- Dashboard SSR does NOT call `getRepos()` — repos load on-demand via `/api/repos` client fetch
- DB `withDbRetry()` wraps server actions for automatic retry on `CONNECT_TIMEOUT`
- MCP OAuth `redirect_uri` restricted to localhost/127.0.0.1 only
- `ignoreDbError` only swallows known idempotent Postgres error codes (42701, 42710, etc.)
- Comment actions (unresolve, restore) require the user to be author or repo owner
- `TreeNode`/`buildTree` live in `src/lib/tree.ts` — don't import from route files
- Production: https://markbase.io (old `markbase-github.vercel.app` 308-redirects)
- Versioning: date-based `YYYY.MMDD` in `VERSION` file. Tags: `v2026.0408`
- CI: GitHub Actions — pinned Node/pnpm, environment contract, strict typecheck/lint, and unit
  tests. Browser E2E/build parity is a queued hardening gate.
- Branch protection: force-push and deletion blocked on `main`
- Always run `pnpm build`, not just `tsc` — Turbopack catches client/server boundary violations
  TypeScript misses
- `[...path]` params need `decodeURIComponent` — Next.js 16 does not auto-decode catch-all segments
- `LANGUAGE_COLORS` must stay in `language-colors.ts` — moving it back into `dashboard.ts` breaks
  the client/server import chain
- Rapid Vercel deploys may not all auto-promote — check the deployments page and promote manually
  if needed
- DB pool max is 1 on Vercel (Prisma Accelerate connection limit) — don't increase without
  understanding why
- GitHub webhook requires `GITHUB_WEBHOOK_SECRET` — currently optional; the endpoint returns 503
  if it's not configured
