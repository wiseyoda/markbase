# Markbase

Vercel-hosted web app that lets users sign in with GitHub, browse markdown files across their repos with beautiful rendering, share them via links or with specific users, and collaborate with inline comments.

## Quick Reference

```bash
pnpm dev              # Start dev server (localhost:3000)
pnpm build            # Production build
pnpm lint             # ESLint
npx tsc --noEmit      # Type check
pnpm test:unit        # Unit + integration tests (Vitest, coverage enforced)
pnpm test:unit:watch  # Watch mode
pnpm test:e2e         # E2E tests (Playwright, requires build + Docker)
```

**After DB schema changes:** Hit `/api/init-db` (local or production) to run migrations.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing (sign in + product preview)
│   ├── dashboard/                  # Your repos, shared with me, all repos (with search)
│   │   ├── page.tsx                # Server component — data fetching
│   │   ├── repo-list.tsx           # Client component — search/filter
│   │   └── loading.tsx             # Skeleton loader
│   ├── repos/[owner]/[repo]/       # Authenticated repo viewer
│   │   ├── layout.tsx              # Header + sidebar + command palette providers
│   │   ├── [...path]/page.tsx      # Markdown viewer + comments + history
│   │   ├── [...path]/comment-rail.tsx  # Comment system (desktop rail + mobile sheet)
│   │   ├── sidebar.tsx             # File tree (uses shared FileTree component)
│   │   ├── share-dialog.tsx        # Share modal / bottom sheet
│   │   └── command-palette-wrapper.tsx  # Cmd+K palette with file search
│   ├── s/[id]/                     # Public share viewer
│   ├── shares/                     # Share management
│   ├── not-found.tsx               # Custom 404
│   ├── error.tsx                   # Error boundary
│   └── api/
│       ├── init-db/                # DB migrations
│       └── mcp/                    # MCP server (JSON-RPC + OAuth)
├── components/
│   ├── bottom-sheet.tsx            # Mobile bottom sheet with gestures
│   ├── command-palette.tsx         # Cmd+K palette (files, actions, recents)
│   ├── confirm-dialog.tsx          # Confirmation dialog
│   ├── file-tree.tsx               # Shared file tree (used by sidebar + shared-sidebar)
│   ├── keyboard-shortcuts.tsx      # "?" shortcut reference sheet
│   ├── logo.tsx                    # Shared brand logo (next/image, configurable size)
│   ├── theme-provider.tsx          # Light/dark/system with localStorage
│   ├── theme-toggle.tsx            # Sun/monitor/moon cycle button
│   ├── toast.tsx                   # Toast notifications with undo actions
│   └── tooltip.tsx                 # Hover/long-press tooltips
├── hooks/
│   └── use-media-query.ts          # useIsMobile, useIsDesktop (useSyncExternalStore)
├── lib/
│   ├── comment-dom.ts  # Comment highlight/selection DOM helpers (extracted from comment-rail)
│   ├── comments.ts     # Threaded comments (soft delete + restore)
│   ├── crypto.ts       # AES-256-GCM
│   ├── dashboard.ts    # GitHub repo fetching + grouping + LANGUAGE_COLORS
│   ├── db.ts           # Postgres + migrations (comments have deleted_at for soft delete)
│   ├── format.ts       # Shared formatting (timeAgo, formatBytes, readingTime, etc.)
│   ├── github-config.ts # GitHub API/Web/Raw base URL config (env-overridable for tests)
│   ├── github.ts       # GitHub API (tree, content, commits)
│   ├── history.ts      # Diff line computation (extracted from history-panel)
│   ├── markdown.ts     # TOC extraction, heading slugs, link resolution
│   ├── shares.ts       # Share CRUD + encrypted tokens
│   ├── synced-repos.ts
│   ├── test-auth.ts    # Test-mode auth cookie encode/decode
│   ├── users.ts
│   └── mcp/            # MCP server internals
├── auth.ts             # Auth config + bypass + test mode
└── proxy.ts            # Route protection
```

## Environment Variables

See `.env.example` for all required variables. Key notes:
- `PRISMA_DATABASE_URL` is preferred over `POSTGRES_URL` (Prisma Accelerate proxy)
- `AUTH_BYPASS=true` + `GITHUB_PAT` for local dev without OAuth
- `SHARE_ENCRYPTION_KEY` must be 64-char hex (openssl rand -hex 32)

## Tech Stack

Next.js 16, Auth.js v5 beta, Tailwind v4 (class-based dark mode), postgres.js, react-markdown, diff

## Design System

- Design context in `.impeccable.md` — brand personality, color rules, references
- Class-based dark mode via `.dark` class on `<html>` + `@variant dark` in CSS
- Theme: localStorage `markbase-theme` (light/dark/system), FOUC prevention via next/script
- Panel state: sessionStorage `markbase-sidebar` and `markbase-comments` via useSyncExternalStore
- Touch targets: 44px minimum on coarse pointers
- One accent family: blue #86D5F4. Green for inline code only.

## MCP Server

Remote HTTP MCP server at `/api/mcp` with GitHub OAuth (stateless, Vercel-compatible).

**Tools:** `list_files_with_comments`, `get_comments`, `add_comment`, `reply_to_comment`, `resolve_comment`, `bulk_resolve_comments`, `reply_and_resolve`, `unresolve_comment`, `delete_comment`

**Add to Claude Code:** `claude mcp add --transport http markbase https://markbase-github.vercel.app/api/mcp`

## Testing

**Unit + Integration** (Vitest): `pnpm test:unit` — 30 test files, 111 tests, 99%+ coverage.
- Config: `vitest.config.mts`, setup in `tests/setup/`
- Unit tests: `tests/unit/` — pure logic, mocked dependencies
- Integration tests: `tests/integration/` — hit real Postgres via testcontainers
- Integration helper: `tests/helpers/postgres.ts` — `useTestDatabase()` hook spins up a container
- Coverage thresholds enforced: 99% lines/functions, 93% branches, 98% statements

**E2E** (Playwright): `pnpm test:e2e` — requires `pnpm build` first + Docker for Postgres.
- Config: `playwright.config.ts`, tests in `tests/e2e/`
- `scripts/test-app-server.mjs` starts: mock GitHub server (port 4100), testcontainers Postgres, Next.js production server (port 3101)
- GitHub API is fully mocked via env vars (`GITHUB_API_BASE_URL`, `GITHUB_WEB_BASE_URL`, `GITHUB_RAW_BASE_URL`)
- Test auth: cookie-based (`markbase-test-session`) — no real OAuth needed
- Test fixtures: `tests/fixtures/mock-github.json`
- `MARKBASE_TEST_MODE=true` enables test auth and `/api/test/reset` endpoint

**Key patterns:**
- GitHub URLs use `github-config.ts` helpers (not hardcoded), enabling test mock servers
- `process.env.NODE_ENV` is read-only in TS strict mode — cast via `(process.env as Record<string, string | undefined>)` in tests
- Auth supports three modes: NextAuth (production), bypass (local dev), test cookie (tests)

## Key Constraints

- DB uses Prisma Accelerate URLs (`db.prisma.io`), not direct Neon
- Comments have `deleted_at` column for soft delete — `softDeleteComment` + `restoreComment`
- Migrations are idempotent — run via `/api/init-db`
- GitHub OAuth App callback URL is domain root
- Auth bypass (AUTH_BYPASS=true + GITHUB_PAT) for local dev — doesn't work with MCP
- React 19 lint: use `useSyncExternalStore` for browser API reads, not `useState` + `useEffect`
- Sidebar `closeSidebar` must check `window.innerWidth < 1024` — only close on mobile/tablet
- `next.config.ts` allows `avatars.githubusercontent.com` for `next/image`
- `file_key` format is `owner/repo/branch/path` — when building URLs for `/repos/owner/repo/path`, skip index 2 (branch)
- Comment positions use `getBoundingClientRect()` not `offsetParent` — scroll container has no CSS position
- Share `created_at` is a `Date` object from postgres.js, not a string — use `new Date(v).getTime()` for comparisons
- `initialComments` prop must be synced into state via `useEffect` (streaming can deliver component before data)
- Production: https://markbase-github.vercel.app
- Repo: wiseyoda/markbase
