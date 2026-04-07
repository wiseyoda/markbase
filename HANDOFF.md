# Session Handoff

> Updated 2026-04-07 after initial build session (session 1).
> Read this first in the next session.

## Current State

Markbase is a functional POC deployed to production at https://markbase-github.vercel.app. Core features work: GitHub auth, repo browsing, markdown rendering, file/folder/repo sharing (link + user-targeted), inline commenting with threading, and file history with diff view. The app is in active use — real users are commenting on shared documents.

## What Was Done This Session

**Infrastructure:**
- Scaffolded Next.js 16 + TypeScript + Tailwind v4 + pnpm
- Auth.js v5 (beta) with GitHub OAuth provider (`repo` scope for private repos)
- Postgres via postgres.js through Prisma Accelerate (`db.prisma.io`)
- AES-256-GCM encryption for storing GitHub tokens in share records
- Auth bypass mode for local development (GITHUB_PAT)
- Deployed to Vercel at markbase-github.vercel.app

**Core Features:**
- Dashboard with synced repos grid, "shared with me" section, all repos grouped by owner
- Repo file viewer with persistent sidebar, collapsible folder tree
- Markdown rendering: GFM, syntax highlighting, frontmatter, TOC, reading time, copy button
- Brand-aware styling from Level Agency guidelines (blue heading hierarchy, green code)

**Sharing System:**
- Three share types: file, folder, repo
- Two share modes: "Anyone with link" (with expiry) or "Specific user" (GitHub user search)
- User search prefers markbase-authenticated users, falls back to GitHub API
- Shared pages have sidebar for repo/folder shares
- "Shares" dropdown in repo header shows active shares
- `/shares` management page grouped by repo

**Commenting:**
- Inline text selection → comment (like Google Docs)
- Threaded replies, resolve/unresolve, delete
- Quote-based text anchoring with character offset for disambiguation
- Comment count badges on sidebar files
- Right rail with positioned comments (scroll-synced)
- Server-side initial comment loading (no flash)
- Shared page viewers can sign in via GitHub to comment

**History:**
- File history panel (full-screen modal)
- Commit list from GitHub Commits API
- Line-by-line diff with additions/removals colored
- Toggle between diff view and full file view

**Database Tables:**
- `shares` — id, type, owner_id, repo, branch, file_path, access_token (encrypted), expires_at, shared_with, shared_with_name
- `comments` — id, file_key, author_id/name/avatar, quote, quote_context (char offset), body, parent_id (FK CASCADE), resolved_at
- `synced_repos` — user_id, repo (composite PK)
- `users` — id, login, name, avatar_url, last_login

## Key Decisions

- **postgres.js over @neondatabase/serverless**: Vercel Postgres URLs point to `db.prisma.io` (Prisma Accelerate proxy), not direct Neon. Neon driver couldn't connect. postgres.js works with any Postgres-compatible URL.
- **Cookie → Postgres for synced repos**: Started with cookies for simplicity, migrated to DB for cross-device persistence.
- **Auth bypass over second OAuth app**: GitHub OAuth Apps only allow one callback URL. Rather than managing two apps, added `AUTH_BYPASS=true` with a PAT for local dev.
- **Character offset for comment anchoring**: Storing just the quote text caused wrong-match bugs (e.g., "Board" highlighting first occurrence). Now stores the character offset in `quote_context` and searches near it.
- **Proxy file convention**: Next.js 16 deprecated `middleware.ts` in favor of `proxy.ts`. Build warns but works.
- **Unified dashboard**: Merged separate `/repos` page into `/dashboard` — repos page was redundant.

## What Failed

- **@vercel/postgres**: Deprecated, wouldn't connect. Switched to @neondatabase/serverless.
- **@neondatabase/serverless**: HTTP 404 because URLs are Prisma Accelerate, not Neon. Switched to postgres.js.
- **@tailwindcss/typography v0.5.x**: Wrong version for Tailwind v4. Needed `@next` tag for alpha. Then needed `@plugin` directive instead of `@import`.
- **highlight.js CSS import in globals.css**: Turbopack couldn't resolve it via PostCSS. Moved to JS-level import in the page component.
- **Middleware → Proxy rename**: Simple rename broke because Next.js 16 expects `proxy` export, not `middleware`. The auth wrapper function also needed updating.
- **CommentRail setState during render**: Multiple attempts — useCallback ref pattern, null check pattern — all failed React hooks lint. Settled on useEffect with cancelled flag.
- **Single scroll container for comments**: Tried putting content and comments in one scrollable div so they scroll together. Comments disappeared (no height context). Reverted to two-panel with scrollTop sync.
- **Recursive CTE for comment delete**: `WITH RECURSIVE ... DELETE` didn't work through Prisma Accelerate. Solved by adding `ON DELETE CASCADE` to the FK constraint.

## Deferred / Backlog

See `BACKLOG.md` for full list:
- **Real-time comments** — currently requires page refresh. Needs WebSocket/SSE/polling.
- **Notifications** — notify doc owner of new comments
- **GitHub webhooks** — cache invalidation on push (currently 60s revalidate)
- **Search** — full-text search across synced repo markdown
- **Share scope upgrade** — in-place upgrade from file → folder → repo share (currently delete + re-create)

## Traps for Next Session

1. **Always run `/api/init-db` after DB schema changes** — both locally and on production. Migrations are idempotent.
2. **Auth bypass doesn't set `session.user.id`** — it uses `GITHUB_BYPASS_USER_ID` env var. If missing, defaults to "0" which will mismatch for user-targeted shares.
3. **Prisma Accelerate is flaky** — occasional "Failed to connect to upstream database" errors on production. Transient, retries fix it. Connection timeouts configured but may need tuning.
4. **`deleteShareAction` has an `isOwner` parameter** that's currently unused (prefixed with `_`). The intent is that repo owners can delete any share, but the matching logic compares `session.user.name` (display name) not `login` — may not be reliable.
5. **Comment highlighting breaks on re-render** — highlights are DOM mutations that get wiped when React re-renders the article. The useEffect re-applies them, but there can be a flash.
6. **The `countOpenComments` function uses SQL `LIKE`** with a prefix — works but not indexed optimally for large datasets.

## Next Steps

1. Test the full flow on production after deploy — especially the new History feature and user sharing
2. Address user-reported issue: investigate if there's a real limit on comments per file (user reported max 5)
3. Polish the share management UX — ability to edit/upgrade shares inline
4. Consider adding a CHANGELOG.md to track releases

## Git State

- Branch: `main`
- Latest commit: `cc25a22` — feat: history and comment counts on shared pages
- All changes committed and pushed to `wiseyoda/markbase`
- No uncommitted changes
