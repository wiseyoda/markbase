# Project structure

Moved out of `AGENTS.md` on 2026-09-07 (consolidation pass) — full annotated tree, linked from
`AGENTS.md` § Layout.

```
src/
├── app/
│   ├── page.tsx                    # Landing page (hero, animated demo, feature sections)
│   ├── product-demo.tsx            # Animated three-pane product walkthrough (client)
│   ├── scroll-reveal.tsx           # IntersectionObserver scroll reveal (client)
│   ├── dashboard/                  # Your repos, activity, stats (pinned repos only)
│   │   ├── page.tsx                # Server component — DB + pinned repo metadata only
│   │   ├── repo-list.tsx           # Client component — on-demand GitHub repo browser
│   │   └── loading.tsx             # Skeleton loader
│   ├── repos/[owner]/[repo]/       # Authenticated repo viewer
│   │   ├── layout.tsx              # Header + sidebar + command palette providers
│   │   ├── [...path]/page.tsx      # Markdown viewer + comments + history
│   │   ├── [...path]/comment-rail.tsx  # Comment rail orchestrator (imports context/thread/form)
│   │   ├── [...path]/comment-context.tsx  # CommentProvider + CommentToggle
│   │   ├── [...path]/comment-thread.tsx   # CommentThread component
│   │   ├── [...path]/comment-form.tsx     # NewCommentForm component
│   │   ├── sidebar.tsx             # File tree (uses shared FileTree component)
│   │   ├── share-dialog.tsx        # Share modal / bottom sheet
│   │   └── command-palette-wrapper.tsx  # Cmd+K palette with file search
│   ├── s/[id]/                     # Public share viewer
│   ├── shares/                     # Share management
│   ├── not-found.tsx               # Custom 404
│   ├── error.tsx                   # Error boundary
│   └── api/
│       ├── repos/                  # On-demand GitHub repo list (client-fetched)
│       ├── github/webhook/         # GitHub push webhook → cache invalidation
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
│   ├── tooltip.tsx                 # Hover/long-press tooltips
│   └── github-refresh-button.tsx   # Manual cache refresh button (client)
├── hooks/
│   └── use-media-query.ts          # useIsMobile, useIsDesktop (useSyncExternalStore)
├── lib/
│   ├── comment-dom.ts  # Comment highlight/selection DOM helpers (extracted from comment-rail)
│   ├── comments.ts     # Threaded comments (soft delete + restore)
│   ├── crypto.ts       # AES-256-GCM
│   ├── dashboard.ts    # GitHub repo fetching + grouping (server-only, imports github-cache)
│   ├── db.ts           # Postgres + migrations + withDbRetry for serverless
│   ├── github-cache.ts # Next.js tag-based cache for GitHub API (repo/branch/file/history)
│   ├── language-colors.ts # LANGUAGE_COLORS constant (client-safe, extracted from dashboard)
│   ├── format.ts       # Shared formatting (timeAgo, formatBytes, readingTime, etc.)
│   ├── github-config.ts # GitHub API/Web/Raw base URL config (env-overridable for tests)
│   ├── github.ts       # GitHub API (tree, content, commits)
│   ├── history.ts      # Diff line computation (extracted from history-panel)
│   ├── markdown.ts     # TOC extraction, heading slugs, link resolution
│   ├── shares.ts       # Share CRUD + encrypted tokens
│   ├── synced-repos.ts
│   ├── tree.ts         # TreeNode type + buildTree (shared by repo + share routes)
│   ├── test-auth.ts    # Test-mode auth cookie encode/decode
│   ├── users.ts
│   └── mcp/            # MCP server internals
├── auth.ts             # Auth config + bypass + test mode
└── proxy.ts            # Route protection
```
