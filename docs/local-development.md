# Local development

## Requirements

- Node.js 20.9 or newer
- pnpm 12.8.1 or newer
- WSL 2/Linux is recommended for development

## Start the app

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

When Supabase is not configured, Orbit uses the local MVP and stores board state in browser `localStorage`. When Supabase is configured, the root route requires sign-in and authenticated users use the persisted workspace adapter. See [`supabase-local.md`](supabase-local.md) to start the local services.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm check
```

`pnpm check` is the CI-style quality gate and runs lint, TypeScript validation,
and the production build in sequence.

## WSL setup

Use the Linux toolchain from a WSL terminal. A Linux filesystem path such as
`~/projects/orbit` is preferred over `/mnt/d/...` because filesystem access and
native dependency performance are better there.

If the project is under `/mnt/d`, remove dependencies installed by Windows
before installing them in WSL:

```bash
rm -rf node_modules .next
pnpm install
pnpm check
```

Do not mix npm, pnpm, or Windows-installed dependencies in the same working
copy. The repository uses `pnpm-lock.yaml` as its dependency lockfile.

## Reset local MVP data

Open browser developer tools and remove the `orbit-local-mvp-v1` and `orbit-theme` local-storage entries for the site, then refresh.

## Environment

Copy `.env.example` to `.env.local` when local environment values are needed. Never commit `.env.local` or provider secrets.

For a deployed build, configure `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in the hosting provider before running the build.
`NEXT_PUBLIC_*` values are embedded into browser code at build time; changing them
after deployment requires a new build. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only
and unset until a trusted server-side integration needs it.

## Free local AI

Milestone 6 uses a server-side task suggestion route. It defaults to
`AI_PROVIDER=mock`, which needs no API key and is suitable for development and
automated checks. To use real local model output without a paid provider, install
Ollama separately, run a model, and set:

```bash
export AI_PROVIDER="ollama"
export OLLAMA_BASE_URL="http://127.0.0.1:11434"
export OLLAMA_MODEL="llama3.2"
```

Transactional email remains deferred until after Milestone 6 and is not part of
the current local testing scope.
