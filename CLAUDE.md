# Markbase

Vercel-hosted web app that lets users sign in with GitHub, browse markdown files across their repos with beautiful rendering, share them via links or with specific users, and collaborate with inline comments.

## Quick Reference

```bash
pnpm dev          # Start dev server (localhost:3000)
pnpm build        # Production build
pnpm lint         # ESLint
npx tsc --noEmit  # Type check
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
│   ├── theme-provider.tsx          # Light/dark/system with localStorage
│   ├── theme-toggle.tsx            # Sun/monitor/moon cycle button
│   ├── toast.tsx                   # Toast notifications with undo actions
│   └── tooltip.tsx                 # Hover/long-press tooltips
├── hooks/
│   └── use-media-query.ts          # useIsMobile, useIsDesktop (useSyncExternalStore)
├── lib/
│   ├── format.ts      # Shared formatting (timeAgo, formatBytes, readingTime, etc.)
│   ├── github.ts      # GitHub API (tree, content, commits)
│   ├── db.ts          # Postgres + migrations (comments have deleted_at for soft delete)
│   ├── shares.ts      # Share CRUD + encrypted tokens
│   ├── comments.ts    # Threaded comments (soft delete + restore)
│   ├── crypto.ts      # AES-256-GCM
│   ├── synced-repos.ts
│   ├── users.ts
│   └── mcp/           # MCP server internals
├── auth.ts            # Auth config + bypass mode
└── proxy.ts           # Route protection
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

## Key Constraints

- DB uses Prisma Accelerate URLs (`db.prisma.io`), not direct Neon
- Comments have `deleted_at` column for soft delete — `softDeleteComment` + `restoreComment`
- Migrations are idempotent — run via `/api/init-db`
- GitHub OAuth App callback URL is domain root
- Auth bypass (AUTH_BYPASS=true + GITHUB_PAT) for local dev — doesn't work with MCP
- React 19 lint: use `useSyncExternalStore` for browser API reads, not `useState` + `useEffect`
- Sidebar `closeSidebar` must check `window.innerWidth < 1024` — only close on mobile/tablet
- Production: https://markbase-github.vercel.app
- Repo: wiseyoda/markbase
