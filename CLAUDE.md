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
│   ├── page.tsx                    # Landing (sign in)
│   ├── dashboard/                  # Synced repos, shared with me, all repos
│   ├── repos/[owner]/[repo]/       # Authenticated repo viewer
│   │   ├── layout.tsx              # Sidebar + header
│   │   ├── [...path]/page.tsx      # Markdown viewer + comments + history
│   │   ├── sidebar.tsx             # File tree with context menu
│   │   └── share-dialog.tsx        # Share modal
│   ├── s/[id]/                     # Public share viewer
│   │   └── [...path]/page.tsx      # Shared file viewer with sidebar
│   ├── shares/                     # Share management
│   └── api/init-db/                # DB migrations
├── lib/
│   ├── github.ts    # GitHub API (tree, content, commits)
│   ├── db.ts        # Postgres + migrations
│   ├── shares.ts    # Share CRUD + encrypted tokens
│   ├── comments.ts  # Threaded comments
│   ├── crypto.ts    # AES-256-GCM
│   ├── synced-repos.ts
│   └── users.ts
├── auth.ts          # Auth config + bypass mode
└── proxy.ts         # Route protection
```

## Environment Variables

See `.env.example` for all required variables. Key notes:
- `PRISMA_DATABASE_URL` is preferred over `POSTGRES_URL` (Prisma Accelerate proxy)
- `AUTH_BYPASS=true` + `GITHUB_PAT` for local dev without OAuth
- `SHARE_ENCRYPTION_KEY` must be 64-char hex (openssl rand -hex 32)

## Tech Stack

Next.js 16, Auth.js v5 beta, Tailwind v4, postgres.js, react-markdown, diff

## Key Constraints

- DB uses Prisma Accelerate URLs (`db.prisma.io`), not direct Neon
- Migrations are idempotent — run via `/api/init-db`
- GitHub OAuth App has ONE callback URL (production) — use bypass for local
- Production: https://markbase-github.vercel.app
- Repo: wiseyoda/markbase
