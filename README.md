<div align="center">
  <img src="public/markbase-logo.png" width="80" height="80" alt="markbase logo" />
  <h1>markbase</h1>
  <p><strong>Browse, share, and discuss markdown files from GitHub.</strong></p>
  <p>Beautiful rendering. Expiring share links. Inline comments anchored to text.</p>

  <a href="https://markbase.io">Website</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#mcp-server">MCP Server</a>

  <br />
  <br />

  <a href="https://github.com/wiseyoda/markbase/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/wiseyoda/markbase/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/wiseyoda/markbase/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <a href="https://markbase.io"><img alt="Deploy" src="https://img.shields.io/badge/deployed%20on-Vercel-black.svg" /></a>
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

Sign in at **[markbase.io](https://markbase.io)** with your GitHub account. The current OAuth scope is broad; Markbase only reads repository contents and never commits changes. See [Security and data use](https://markbase.io/security).

### Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Fill in one documented auth mode plus database and encryption values

# 3. Verify config and prepare the database
pnpm env:check
pnpm db:migrate
pnpm db:status

# 4. Start dev server
pnpm dev
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
claude mcp add --transport http markbase https://markbase.io/api/mcp
```

**Tools:** `get_comments`, `add_comment`, `reply_to_comment`, `resolve_comment`, `bulk_resolve_comments`, `reply_and_resolve`, `unresolve_comment`, `delete_comment`, `list_files_with_comments`

### Headless / device login

On a machine without a browser (a server, a container, an agent host), use the
RFC 8628 device authorization grant instead of the loopback redirect flow.
Clients that read `device_authorization_endpoint` from
`/.well-known/oauth-authorization-server` pick it up automatically; Hermes:

```bash
hermes mcp login markbase --flow device
```

The curl equivalent:

```bash
# 1. Request a device code and a short user code
curl -s -X POST https://markbase.io/api/mcp/device
#   -> { "device_code": "...", "user_code": "BCDF-GHJK",
#        "verification_uri": "https://markbase.io/mcp/device", "expires_in": 900, "interval": 5 }

# 2. Open verification_uri in any browser, enter the user code, approve with GitHub

# 3. Poll the token endpoint (every `interval` seconds) until it returns tokens
curl -s -X POST https://markbase.io/api/mcp/token \
  -d grant_type=urn:ietf:params:oauth:grant-type:device_code \
  -d device_code=...
#   -> { "error": "authorization_pending" } while waiting, then
#   -> { "access_token": "...", "refresh_token": "...", "token_type": "Bearer", ... }
```

## Testing

```bash
pnpm test:unit        # Vitest unit + integration suite with coverage thresholds
pnpm test:e2e         # Playwright — requires Docker + build
```

## License

MIT
