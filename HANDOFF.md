# Session Handoff

> Updated 2026-04-07 after session 2 (MCP server, bug fixes, perf tuning).
> Read this first in the next session.

## Current State

Markbase is deployed at https://markbase-github.vercel.app with full commenting, sharing, history, and an MCP server for Claude Code integration. 9 MCP tools are live. Multiple UX and performance fixes shipped this session. The app is in active use — Patrick and Bill are commenting on AI marketing strategy docs.

## What Was Done This Session

**MCP Server (11 new files):**
- Remote HTTP MCP server at `/api/mcp` — JSON-RPC 2.0 over Streamable HTTP
- OAuth 2.1 + PKCE with GitHub as identity provider (fully stateless on Vercel)
- JWT access tokens via `jose` (HS256, 8hr expiry, GitHub token encrypted inside)
- `.well-known` discovery endpoints (RFC 9728 + RFC 8414)
- Dynamic client registration, PKCE verification, encrypted auth codes
- 9 tools: `list_files_with_comments`, `get_comments`, `add_comment`, `reply_to_comment`, `resolve_comment`, `bulk_resolve_comments`, `reply_and_resolve`, `unresolve_comment`, `delete_comment`
- New DB functions: `getCommentById`, `getCommentsByPrefix` (cursor pagination), `resolveComments` (batch)

**Bug Fixes:**
- Comment highlighting "N on changed text" — `selection.toString()` adds `\n`/`\t` between blocks that tree walker omits. Added fallback that strips these characters.
- Shared page history blank — server actions used viewer's session token instead of share's encrypted token. Now passes `shareId` to server actions which look up the share's token securely.
- Diff text invisible in light mode — text colors were dark-mode-only (green-300, red-300). Added `dark:` variants with proper light-mode colors.
- Comment cards misaligned — positions were relative to `<article>` not the scroll container. Now calculates article's offset within scroll container.
- Comment cards overlapping — hardcoded 120px height assumption. Replaced with `useLayoutEffect` that measures actual card heights and pushes overlapping cards down.

**Performance:**
- Connection pool `max: 20` (was default ~10)
- Partial composite index `idx_comments_file_key_open` on `(file_key, created_at DESC) WHERE resolved_at IS NULL AND parent_id IS NULL`
- `bulk_resolve_comments` uses single `UPDATE ... WHERE id = ANY()` instead of N sequential queries
- Skip client-side comment re-fetch when `initialComments` already provided server-side

**Features:**
- `list_files_with_comments` MCP tool now returns `last_activity` timestamp per file
- Relative last-modified time in breadcrumb bar ("updated 2h ago") via 1-commit GitHub API call
- `bulk_resolve_comments` and `reply_and_resolve` convenience MCP tools

## Key Decisions

- **Manual JSON-RPC dispatch** over `@modelcontextprotocol/sdk` transport — avoids Express/Web API incompatibility and Vercel session-persistence issues. Simple and reliable.
- **Stateless OAuth** — auth codes are AES-256-GCM encrypted payloads containing all state (GitHub token, PKCE challenge, redirect_uri). No DB storage needed for OAuth flow.
- **JWT signing key** derived from existing `SHARE_ENCRYPTION_KEY` — no new env vars.
- **ShareId not accessToken** for shared page history — passing raw GitHub token to client component would expose it in page HTML. Instead pass shareId and let server action look up the token securely.
- **GitHub OAuth callback URL changed to domain root** — was `/api/auth/callback/github` (only supported Auth.js). Changed to `https://markbase-github.vercel.app` so both Auth.js and MCP callback paths work as subdirectories.

## What Failed

- **First MCP auth attempt** — GitHub rejected the redirect_uri because the OAuth App's callback URL was too specific (`/api/auth/callback/github`). Fixed by broadening to domain root.
- Nothing else failed. All code compiled, linted, and deployed cleanly.

## Deferred / Backlog

- **Real-time comments** — still requires page refresh. Needs WebSocket/SSE/polling.
- **Notifications** — notify doc owner of new comments.
- **Layout `countOpenComments` caching** — runs on every page navigation. Should cache or memoize.
- **Search** — full-text search across synced repo markdown.
- **Share scope upgrade** — in-place upgrade from file → folder → repo share.
- **MCP token refresh** — JWTs expire after 8h, user must re-authenticate.
- **Auth code replay prevention** — stateless codes can be reused within 10min TTL.

## Traps for Next Session

1. **Always run `/api/init-db` after DB schema changes** — both locally and production.
2. **GitHub OAuth callback URL is now domain root** — if someone changes it back to `/api/auth/callback/github`, the MCP auth flow will break.
3. **Auth bypass doesn't work with MCP** — MCP requires real GitHub OAuth tokens. Local dev bypass only works for web app auth.
4. **Prisma Accelerate flakiness** — occasional transient "Failed to connect to upstream database" errors.
5. **Comment highlighting cross-block fix** — the fallback strips `\n`/`\t` which could theoretically cause false matches on very short quotes. The offset hint mitigates this.
6. **`deleteShareAction` compares display name not login** — may not be reliable for owner checks.
7. **Comment card height measurement** — `useLayoutEffect` measures after render to prevent overlap. If cards have lazy-loaded content (images), heights could change after measurement.

## Next Steps

1. Test shared page history with Bill's account — verify he can see commit history on shared docs
2. Verify comment positioning looks correct across various page lengths and comment densities
3. Consider caching `countOpenComments` at the layout level (currently re-queries every page nav)
4. Work through remaining open comments on `knowledge/plan/strategic-plan.md` (10+ unresolved from Patrick)

## Git State

- Branch: `main`
- Latest commit: `61b1392` — fix: comment cards stack gracefully without overlapping
- All changes committed and pushed to `wiseyoda/markbase`
- No uncommitted changes (except this HANDOFF.md + CLAUDE.md update)
