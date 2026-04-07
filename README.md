# markbase

Browse and share your markdown files across GitHub repos.

## Setup

1. Create a GitHub OAuth App at [github.com/settings/developers](https://github.com/settings/developers)
   - Homepage URL: `http://localhost:3000`
   - Callback URL: `http://localhost:3000/api/auth/callback/github`
2. Copy `.env.example` to `.env.local` and fill in the values
3. `pnpm install && pnpm dev`
