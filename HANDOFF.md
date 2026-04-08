# Session Handoff

> Updated 2026-04-07 after session 3 (full UI/UX overhaul, responsive design, design system).
> Read this first in the next session.

## Current State

Markbase has been through a complete UI/UX overhaul. The app is responsive across mobile/tablet/desktop, has a manual theme toggle, command palette (Cmd+K), keyboard shortcuts, soft-delete comments with undo, loading skeletons, error boundaries, and a consolidated single-toolbar header. Nielsen heuristic score improved from 20/40 to ~29/40. CRA MCP server configured in `.mcp.json`. Design context persisted in `.impeccable.md`.

## What Was Done This Session

**Foundation (12 new files):**
- `src/lib/format.ts` — shared formatting utilities (consolidated 4 duplicate timeAgo implementations)
- `src/hooks/use-media-query.ts` — SSR-safe responsive hooks via useSyncExternalStore
- `src/components/theme-provider.tsx` — light/dark/system theme with localStorage
- `src/components/theme-toggle.tsx` — sun/monitor/moon cycle button with tooltip
- `src/components/bottom-sheet.tsx` — mobile bottom sheet with drag-to-dismiss gestures
- `src/components/confirm-dialog.tsx` — responsive confirm (bottom sheet mobile, modal desktop)
- `src/components/toast.tsx` — toast notification system with undo action support
- `src/app/not-found.tsx`, `error.tsx`, `[...path]/error.tsx` — custom error pages
- `src/app/dashboard/loading.tsx`, `[...path]/loading.tsx` — loading skeletons

**Responsive Redesign (every page):**
- Dashboard: repo search with instant filter, responsive grid, condensed mobile cards, renamed "Sync" to "Add"
- Repo viewer: sidebar toggle in header (left side, panel icon), bottom sheet on mobile, file search in sidebar
- Comment rail: bottom sheet on mobile, delete confirmations, hover-reveal actions, 30s polling
- Share dialog: bottom sheet on mobile, toast feedback, 44px touch targets
- History panel: vertical stacking on mobile
- Shared viewer: full mobile support added (was completely missing)

**Design System:**
- Class-based dark mode (`@variant dark` + `.dark` class) replacing media query approach
- FOUC prevention via `next/script` `beforeInteractive`
- Design tokens: `--surface`, `--border`, `--text-primary/secondary/muted`
- Fixed font bug (body was overriding Geist Sans with Arial)
- Removed rainbow HR gradient (now blue-only)
- Touch target utility for coarse pointers

**Road to 40 (second round):**
- Command palette (Cmd+K) with file search, recent files, navigation actions
- Keyboard shortcuts: /, ?, J/K, Cmd+Enter, Escape
- `src/components/keyboard-shortcuts.tsx` — "?" shortcut reference sheet
- `src/components/tooltip.tsx` — hover/long-press tooltips on all icon buttons
- `src/components/file-tree.tsx` — shared base extracted from sidebar + shared-sidebar
- Soft delete: `deleted_at` column on comments, `softDeleteComment`, `restoreComment`, undo toast
- Comment draft auto-save in sessionStorage
- Optimistic comment insertion
- Auto-retry with exponential backoff for transient failures
- Dashboard empty state, comment rail onboarding hint, share dialog read-only hint
- Repo card stats progressive disclosure (hover-reveal on desktop)
- Landing page: feature accent rhythm, mockup cursor blink animation

**Header Consolidation:**
- Eliminated the breadcrumb bar (was a second toolbar below the header)
- File path + metadata now inline text in the content area
- Removed SharesDropdown from header (accessible via /shares page)
- Removed branch badge from header
- Dashboard link became a home icon with tooltip
- Sidebar toggle moved to LEFT side of header with panel icon

**Bug Fixes:**
- Sidebar stays open on desktop when navigating between files (closeSidebar only fires on mobile)
- Panel state persists via sessionStorage + useSyncExternalStore (no hydration mismatch)
- Empty img src no longer causes page re-download
- Hydration errors fixed (replaced raw `<script>` with next/script, useSyncExternalStore for browser reads)

## Key Decisions

- **useSyncExternalStore for browser state** — React 19's `react-hooks/set-state-in-effect` lint rule forbids setState in useEffect. All sessionStorage/localStorage/matchMedia reads use useSyncExternalStore + StorageEvent dispatch pattern.
- **"Add" not "Sync"** — renamed because syncing implies two-way; the action just pins a repo for quick access.
- **Soft delete over client-side delay** — user chose server-side soft delete (deleted_at column) over client-side 5-second delay. More robust, enables future purge job.
- **30s polling not SSE** — simpler than server-sent events, no backend changes needed, adequate for the use case.
- **Header consolidation** — user looked at the screenshot and said "it looks like we tacked on features." Merged three chrome layers into one toolbar.
- **Sidebar toggle on LEFT** — user feedback: "I shouldn't have to drag my mouse across the entire screen."

## What Failed

- **Raw `<script>` in layout.tsx** — Next.js 16 doesn't allow `<script>` tags in server components. Error: "Scripts inside React components are never executed when rendering on the client." Fixed with `next/script` `strategy="beforeInteractive"`.
- **sessionStorage in useState initializer** — Caused hydration mismatch (server renders default, client renders stored value). Fixed with useSyncExternalStore pattern.
- **Sidebar closing on desktop file navigation** — `onNavigate` callback called `closeSidebar` unconditionally. Had to add `window.innerWidth < 1024` check.
- **Empty img src warning** — Markdown with image tags missing src passed `""` to `<img>`. Fixed with early `return null`.

## Deferred / Backlog

- **Real-time comments via SSE/WebSocket** — polling at 30s is adequate for now, true real-time deferred
- **Notifications** — notify doc owner of new comments
- **Duplicate share detection** — can create multiple identical shares without warning
- **Search in content** — full-text search across markdown content (Cmd+K only searches filenames)
- **MCP token refresh** — JWTs expire after 8h
- **Auth code replay prevention** — stateless codes can be reused within 10min TTL
- **Purge job for soft-deleted comments** — `purgeDeletedComments()` function exists but no cron trigger
- **In-app feature tour** — first-time onboarding is empty state hints only, no guided walkthrough

## Traps for Next Session

1. **Run `/api/init-db`** after any DB schema changes — both local and production
2. **React 19 lint rule** — never use `setState` in `useEffect` body. Use `useSyncExternalStore` for external state reads. This rule is strict and will fail CI.
3. **Sidebar closeSidebar** — must check `window.innerWidth < 1024`. Only close overlay on mobile/tablet, never on desktop.
4. **Panel state via StorageEvent dispatch** — writing to sessionStorage doesn't trigger useSyncExternalStore automatically. Must `window.dispatchEvent(new StorageEvent("storage", { key }))` after writes.
5. **next/script not raw script** — use `<Script strategy="beforeInteractive">` for head scripts in Next.js 16 layouts.
6. **comment-rail.tsx is ~900 lines** — the largest file. Consider extraction if adding more features.
7. **Two sidebar implementations** — `sidebar.tsx` and `shared-sidebar.tsx` now share `FileTree` but still have parallel Provider/Toggle/rendering logic. Could be unified further.
8. **Prisma Accelerate flakiness** — occasional transient "Failed to connect" errors. Auto-retry with backoff mitigates but doesn't eliminate.
9. **CRA MCP** configured in `.mcp.json` — restart Claude Code to pick up new MCP server.

## Git State

- Branch: `main`
- Latest commit: `3b0a811` — fix: don't render img element when src is empty
- All changes committed and pushed to wiseyoda/markbase
- No uncommitted changes
