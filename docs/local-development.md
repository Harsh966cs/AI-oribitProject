# Local development

## Requirements

- Node.js compatible with the installed Next.js version
- npm, pnpm, yarn, or bun

## Start the app

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Signed-out users store board state in browser `localStorage`. With local Supabase configured, authenticated users use the persisted workspace adapter. See [`supabase-local.md`](supabase-local.md) to start the local services.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Reset local MVP data

Open browser developer tools and remove the `orbit-local-mvp-v1` and `orbit-theme` local-storage entries for the site, then refresh.

## Environment

Copy `.env.example` to `.env.local` when local environment values are needed. Never commit `.env.local` or provider secrets.
