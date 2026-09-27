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
npm run check
```

`npm run check` is the CI-style quality gate and runs lint, TypeScript validation,
and the production build in sequence.

## Reset local MVP data

Open browser developer tools and remove the `orbit-local-mvp-v1` and `orbit-theme` local-storage entries for the site, then refresh.

## Environment

Copy `.env.example` to `.env.local` when local environment values are needed. Never commit `.env.local` or provider secrets.

For a deployed build, configure `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in the hosting provider before running the build.
`NEXT_PUBLIC_*` values are embedded into browser code at build time; changing them
after deployment requires a new build. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only
and unset until a trusted server-side integration needs it.
