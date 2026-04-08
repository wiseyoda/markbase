<div align="center">
  <img src="public/markbase-logo.png" width="80" height="80" alt="markbase logo" />
  <h1>markbase</h1>
  <p><strong>Browse, share, and discuss markdown files from GitHub.</strong></p>
  <p>Beautiful rendering. Expiring share links. Inline comments anchored to text.</p>

  <a href="https://markbase-github.vercel.app">Website</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#mcp-server">MCP Server</a>
</div>

<br />

<!-- Add a product screenshot here: replace with an actual screenshot of the repo viewer -->
<!-- <p align="center"><img src="docs/screenshot.png" width="800" alt="markbase screenshot" /></p> -->

## Why

Your team writes docs in GitHub. But reading raw markdown on github.com is painful — no typography, no easy sharing, no way to leave comments on a paragraph.

Markbase connects to your GitHub repos and gives your markdown files a proper reading experience. Share a single file or an entire repo with expiring links. Leave inline comments that stay anchored to the text, like Google Docs.

## Features

- **Markdown viewer** — GFM, syntax highlighting, frontmatter, table of contents, task lists
- **File tree sidebar** — Collapsible folders, active file highlight, comment count badges
- **Sharing** — File, folder, or repo scope. Link-based with expiry, or share with specific GitHub users
- **Inline comments** — Select any text, add a comment. Threaded replies, resolve/reopen, soft delete with undo
- **File history** — Git commit log with inline diff viewer
- **Command palette** — `Cmd+K` to search files, navigate, and take actions
- **Dark mode** — Light, dark, and system themes with manual toggle
- **MCP server** — Remote MCP tools for managing comments from Claude Code and other AI assistants

## Quick Start

### Production

Sign in at **[markbase-github.vercel.app](https://markbase-github.vercel.app)** with your GitHub account. Read-only access — your repos stay untouched.

### Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Fill in values — see .env.example for docs

# 3. Start dev server
pnpm dev

# 4. Run database migrations
open http://localhost:3000/api/init-db
```

For local dev without OAuth, set `AUTH_BYPASS=true` and `GITHUB_PAT` in `.env.local`.

## Tech Stack

- [Next.js 16](https://nextjs.org) — App Router, React Server Components
- [Auth.js v5](https://authjs.dev) — GitHub OAuth
- [Tailwind CSS v4](https://tailwindcss.com) — class-based dark mode
- [postgres.js](https://github.com/porsager/postgres) — via Prisma Accelerate
- [react-markdown](https://github.com/remarkjs/react-markdown) — with remark-gfm + rehype-highlight

## MCP Server

Markbase exposes a remote MCP server for managing inline comments from AI tools.

```bash
claude mcp add --transport http markbase https://markbase-github.vercel.app/api/mcp
```

**Tools:** `get_comments`, `add_comment`, `reply_to_comment`, `resolve_comment`, `bulk_resolve_comments`, `reply_and_resolve`, `unresolve_comment`, `delete_comment`, `list_files_with_comments`

## Testing

```bash
pnpm test:unit        # Vitest — 132 tests, 99%+ coverage
pnpm test:e2e         # Playwright — requires Docker + build
```

## License

MIT
