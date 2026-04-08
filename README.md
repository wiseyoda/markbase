# markbase

Browse, share, and collaborate on markdown files across your GitHub repos.

Markbase connects to your GitHub account, scans your repositories for markdown files, and renders them in a beautiful, readable interface. Share individual files, folders, or entire repos with anyone — via link or directly with specific GitHub users. Collaborators can leave inline comments anchored to specific text, just like Google Docs.

## Features

- **GitHub SSO** — Sign in with GitHub, access public and private repos
- **Markdown viewer** — GFM, syntax highlighting, frontmatter, table of contents
- **File tree sidebar** — Collapsible folders, active file highlight, comment count badges
- **Sharing** — File, folder, or repo scope. Link-based or user-targeted with expiry
- **Inline commenting** — Select text, add comments. Threaded replies, resolve/reopen
- **File history** — Git commit log with line-by-line diff viewer
- **Brand styling** — Level Agency brand colors and typography

## Setup

### Production

Deployed at [markbase-github.vercel.app](https://markbase-github.vercel.app).

### Local Development

1. Copy `.env.example` to `.env.local` and fill in the values
2. For local dev without OAuth, set:
   ```
   AUTH_BYPASS=true
   GITHUB_PAT=ghp_your_fine_grained_token
   GITHUB_BYPASS_USER_ID=your_numeric_github_id
   ```
3. Run:
   ```bash
   pnpm install
   pnpm dev
   ```
4. Hit `http://localhost:3000/api/init-db` to run database migrations (run this after any schema changes)

### Environment Variables

See `.env.example` for the full list. Required:
- `GITHUB_ID` + `GITHUB_SECRET` — GitHub OAuth App (production only)
- `AUTH_SECRET` — NextAuth encryption key
- `PRISMA_DATABASE_URL` — Postgres connection string (from Vercel)
- `SHARE_ENCRYPTION_KEY` — 64-char hex key for encrypting stored tokens

Optional:
- `NEXTAUTH_URL` — Base URL for OAuth flows (defaults to `https://markbase-github.vercel.app`; set for custom domains)

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [Auth.js v5](https://authjs.dev) (GitHub OAuth)
- [Tailwind CSS v4](https://tailwindcss.com) + Typography plugin
- [postgres.js](https://github.com/porsager/postgres) via Prisma Accelerate
- [react-markdown](https://github.com/remarkjs/react-markdown) + remark-gfm + rehype-highlight
